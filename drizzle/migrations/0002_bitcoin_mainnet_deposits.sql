-- Bitcoin mainnet deposit records. This migration stores only public addresses and transaction IDs.
-- It does not store private keys/xprv, derive addresses, scan the chain, or automatically credit balances.
create table if not exists public.bitcoin_deposit_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  network text not null default 'BITCOIN_MAINNET' check (network = 'BITCOIN_MAINNET'),
  currency text not null default 'BTC' check (currency = 'BTC'),
  address text not null unique check (address ~ '^(bc1[ac-hj-np-z02-9]{11,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$'),
  derivation_index bigint unique check (derivation_index is null or derivation_index >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.bitcoin_deposit_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  amount_claimed numeric(20,8) not null check (amount_claimed > 0),
  amount_confirmed numeric(20,8) check (amount_confirmed is null or amount_confirmed > 0),
  currency text not null default 'BTC' check (currency = 'BTC'),
  network text not null default 'BITCOIN_MAINNET' check (network = 'BITCOIN_MAINNET'),
  deposit_address text not null,
  tx_hash text unique check (tx_hash is null or tx_hash ~ '^[0-9a-fA-F]{64}$'),
  status text not null default 'pending_verification' check (status in ('pending_verification','confirmed','rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  constraint bitcoin_deposit_address_fk foreign key (deposit_address)
    references public.bitcoin_deposit_addresses(address) on update cascade on delete restrict
);

create index if not exists bitcoin_deposit_requests_user_created_idx
  on public.bitcoin_deposit_requests(user_id, created_at desc);
create index if not exists bitcoin_deposit_requests_status_created_idx
  on public.bitcoin_deposit_requests(status, created_at desc);

alter table public.bitcoin_deposit_addresses enable row level security;
alter table public.bitcoin_deposit_requests enable row level security;
revoke all on public.bitcoin_deposit_addresses from anon, authenticated;
revoke all on public.bitcoin_deposit_requests from anon, authenticated;
grant select on public.bitcoin_deposit_addresses to authenticated;
grant select, insert on public.bitcoin_deposit_requests to authenticated;
grant all on public.bitcoin_deposit_addresses, public.bitcoin_deposit_requests to service_role;

drop policy if exists "users read own active bitcoin address" on public.bitcoin_deposit_addresses;
create policy "users read own active bitcoin address" on public.bitcoin_deposit_addresses
  for select to authenticated using (user_id = (select auth.uid()) and active);

drop policy if exists "users read own bitcoin deposit requests" on public.bitcoin_deposit_requests;
create policy "users read own bitcoin deposit requests" on public.bitcoin_deposit_requests
  for select to authenticated using (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));

drop policy if exists "users submit own bitcoin deposit requests" on public.bitcoin_deposit_requests;
create policy "users submit own bitcoin deposit requests" on public.bitcoin_deposit_requests
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and status = 'pending_verification'
    and amount_confirmed is null
    and reviewed_at is null
    and reviewed_by is null
    and exists (
      select 1 from public.bitcoin_deposit_addresses a
      where a.user_id = (select auth.uid())
        and a.active
        and a.address = bitcoin_deposit_requests.deposit_address
    )
  );

create or replace function public.review_bitcoin_deposit_request(
  _request_id uuid,
  _confirm boolean,
  _confirmed_amount numeric default null,
  _note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Not authorized';
  end if;
  if _confirm and (_confirmed_amount is null or _confirmed_amount <= 0) then
    raise exception 'A verified positive on-chain amount is required';
  end if;

  update public.bitcoin_deposit_requests
  set status = case when _confirm then 'confirmed' else 'rejected' end,
      amount_confirmed = case when _confirm then _confirmed_amount else null end,
      admin_note = nullif(left(coalesce(_note, ''), 1000), ''),
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = _request_id and status = 'pending_verification';

  if not found then
    raise exception 'Bitcoin deposit request not found or already reviewed';
  end if;
end;
$$;

revoke all on function public.review_bitcoin_deposit_request(uuid, boolean, numeric, text) from public;
grant execute on function public.review_bitcoin_deposit_request(uuid, boolean, numeric, text) to authenticated;
