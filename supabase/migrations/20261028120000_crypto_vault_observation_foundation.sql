-- INVESTERRA: custody/chain-observation foundation only.
-- Does NOT enable production deposits/withdrawals, credit balances, or sign/send transactions.
-- Historical migrations remain unchanged. Chain watchers must call the service-only RPC after
-- independently validating network, contract/script, tx receipt, destination, amount and confirmations.

create table if not exists public.crypto_chain_observations (
  id uuid primary key default gen_random_uuid(),
  asset text not null check (asset in ('USDT','BTC')),
  network text not null check (network in ('TRON_MAINNET_TRC20','BITCOIN_MAINNET')),
  tx_hash text not null check (tx_hash ~ '^[0-9a-fA-F]{64}$'),
  event_index integer not null default 0 check (event_index >= 0),
  destination_address text not null,
  amount numeric(30,8) not null check (amount > 0 and amount::text not in ('NaN','Infinity','-Infinity')),
  confirmations integer not null default 0 check (confirmations >= 0),
  block_height bigint check (block_height is null or block_height >= 0),
  block_hash text check (block_hash is null or block_hash ~ '^[0-9a-fA-F]{64}$'),
  chain_status text not null default 'observed' check (chain_status in ('observed','confirming','confirmed','orphaned','rejected')),
  user_id uuid references auth.users(id) on delete restrict,
  matched_address_id uuid,
  credited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (network, lower(tx_hash), event_index),
  constraint observation_asset_network check (
    (asset = 'USDT' and network = 'TRON_MAINNET_TRC20') or
    (asset = 'BTC' and network = 'BITCOIN_MAINNET')
  ),
  constraint observations_never_credit_here check (credited_at is null)
);

create index if not exists crypto_chain_observations_status_idx
  on public.crypto_chain_observations(chain_status, confirmations, created_at);
create index if not exists crypto_chain_observations_user_idx
  on public.crypto_chain_observations(user_id, created_at desc);

alter table public.crypto_chain_observations enable row level security;
revoke all on public.crypto_chain_observations from public, anon, authenticated;
grant all on public.crypto_chain_observations to service_role;

-- This RPC records observations only. It cannot create ledger entries or enable production.
-- Address matching is exact and scoped to the appropriate existing per-user address table.
create or replace function public.record_crypto_chain_observation(
  _asset text,
  _network text,
  _tx_hash text,
  _event_index integer,
  _destination_address text,
  _amount numeric,
  _confirmations integer,
  _block_height bigint default null,
  _block_hash text default null,
  _chain_status text default 'observed'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_user uuid;
  matched_address uuid;
  result_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if _asset not in ('USDT','BTC') then raise exception 'Unsupported asset'; end if;
  if (_asset = 'USDT' and _network <> 'TRON_MAINNET_TRC20')
     or (_asset = 'BTC' and _network <> 'BITCOIN_MAINNET') then
    raise exception 'Asset/network mismatch';
  end if;
  if _tx_hash is null or _tx_hash !~ '^[0-9a-fA-F]{64}$' then raise exception 'Invalid transaction hash'; end if;
  if _destination_address is null or length(trim(_destination_address)) < 20 then raise exception 'Invalid destination address'; end if;
  if _amount is null or _amount::text in ('NaN','Infinity','-Infinity') or _amount <= 0 then raise exception 'Invalid amount'; end if;
  if _confirmations is null or _confirmations < 0 then raise exception 'Invalid confirmation count'; end if;
  if _event_index is null or _event_index < 0 then raise exception 'Invalid event index'; end if;
  if _chain_status not in ('observed','confirming','confirmed','orphaned','rejected') then raise exception 'Invalid chain status'; end if;

  if _asset = 'USDT' then
    select a.user_id, a.id into matched_user, matched_address
    from public.deposit_addresses a
    where a.network = 'TRC20' and a.currency = 'USDT' and a.active
      and a.address = trim(_destination_address)
    limit 1;
  else
    select a.user_id, a.id into matched_user, matched_address
    from public.bitcoin_deposit_addresses a
    where a.network = 'BITCOIN_MAINNET' and a.currency = 'BTC' and a.active
      and a.address = trim(_destination_address)
    limit 1;
  end if;

  insert into public.crypto_chain_observations(
    asset, network, tx_hash, event_index, destination_address, amount,
    confirmations, block_height, block_hash, chain_status, user_id, matched_address_id
  ) values (
    _asset, _network, lower(_tx_hash), _event_index, trim(_destination_address), _amount,
    _confirmations, _block_height, case when _block_hash ~ '^[0-9a-fA-F]{64}$' then lower(_block_hash) else null end,
    case when matched_user is null then 'rejected' else _chain_status end,
    matched_user, matched_address
  )
  on conflict (network, lower(tx_hash), event_index) do update set
    confirmations = greatest(public.crypto_chain_observations.confirmations, excluded.confirmations),
    block_height = coalesce(excluded.block_height, public.crypto_chain_observations.block_height),
    block_hash = coalesce(excluded.block_hash, public.crypto_chain_observations.block_hash),
    chain_status = case
      when public.crypto_chain_observations.chain_status in ('orphaned','rejected') then public.crypto_chain_observations.chain_status
      when excluded.chain_status = 'orphaned' then 'orphaned'
      when excluded.chain_status = 'rejected' then 'rejected'
      when excluded.confirmations >= public.crypto_chain_observations.confirmations then excluded.chain_status
      else public.crypto_chain_observations.chain_status
    end,
    updated_at = now()
  returning id into result_id;

  return result_id;
end;
$$;

revoke all on function public.record_crypto_chain_observation(text,text,text,integer,text,numeric,integer,bigint,text,text) from public, anon, authenticated;
grant execute on function public.record_crypto_chain_observation(text,text,text,integer,text,numeric,integer,bigint,text,text) to service_role;

comment on table public.crypto_chain_observations is
'Private chain-watcher observations. Never a source of spendable balance by itself; all production crediting remains disabled until separately reviewed.';
