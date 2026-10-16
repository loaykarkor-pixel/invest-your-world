-- USDT TRC20 deposit requests. Addresses must be assigned from a real wallet/provider by an administrator.
-- This migration intentionally does not generate private keys, scan the chain, or credit an account balance.
create table if not exists public.deposit_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  network text not null default 'TRC20' check (network = 'TRC20'),
  currency text not null default 'USDT' check (currency = 'USDT'),
  address text not null unique check (address ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.deposit_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  amount_claimed numeric(20,8) not null check (amount_claimed > 0),
  amount_confirmed numeric(20,8) check (amount_confirmed is null or amount_confirmed > 0),
  currency text not null default 'USDT' check (currency = 'USDT'),
  network text not null default 'TRC20' check (network = 'TRC20'),
  deposit_address text not null check (deposit_address ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'),
  tx_hash text unique check (tx_hash is null or tx_hash ~ '^[0-9a-fA-F]{64}$'),
  status text not null default 'pending_verification' check (status in ('pending_verification','confirmed','rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  verified_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

create index if not exists deposit_requests_user_created_idx on public.deposit_requests(user_id, created_at desc);
create index if not exists deposit_requests_status_created_idx on public.deposit_requests(status, created_at desc);

alter table public.deposit_addresses enable row level security;
alter table public.deposit_requests enable row level security;
revoke all on public.deposit_addresses from anon, authenticated;
revoke all on public.deposit_requests from anon, authenticated;
grant select on public.deposit_addresses to authenticated;
grant select, insert on public.deposit_requests to authenticated;
grant all on public.deposit_addresses, public.deposit_requests to service_role;

drop policy if exists "users read own active deposit address" on public.deposit_addresses;
create policy "users read own active deposit address" on public.deposit_addresses
  for select to authenticated using (user_id = (select auth.uid()) and active);

drop policy if exists "users read own deposit requests" on public.deposit_requests;
create policy "users read own deposit requests" on public.deposit_requests
  for select to authenticated using (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));

drop policy if exists "users submit own deposit requests" on public.deposit_requests;
create policy "users submit own deposit requests" on public.deposit_requests
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and status = 'pending_verification'
    and amount_confirmed is null
    and reviewed_at is null
    and verified_at is null
    and reviewed_by is null
    and exists (
      select 1 from public.deposit_addresses a
      where a.user_id = (select auth.uid())
        and a.active
        and a.address = deposit_requests.deposit_address
    )
  );

create or replace function public.review_deposit_request(
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

  update public.deposit_requests
  set status = case when _confirm then 'confirmed' else 'rejected' end,
      amount_confirmed = case when _confirm then _confirmed_amount else null end,
      admin_note = nullif(left(coalesce(_note, ''), 1000), ''),
      reviewed_at = now(),
      verified_at = case when _confirm then now() else null end,
      reviewed_by = auth.uid()
  where id = _request_id and status = 'pending_verification';

  if not found then
    raise exception 'Deposit request not found or already reviewed';
  end if;
end;
$$;

revoke all on function public.review_deposit_request(uuid, boolean, numeric, text) from public;
grant execute on function public.review_deposit_request(uuid, boolean, numeric, text) to authenticated;
