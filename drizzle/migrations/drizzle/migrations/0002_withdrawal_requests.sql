
-- Withdrawal requests for Al Rayyan Real Estate Investment
-- This migration records requests only; it does not transfer funds.

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  amount numeric(20, 8) not null check (amount > 0),
  currency text not null default 'USDT'
    check (currency in ('USDT')),
  network text not null default 'TRC20'
    check (network in ('TRC20')),
  destination_address text not null
    check (length(trim(destination_address)) between 20 and 128),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'paid', 'cancelled')),
  admin_note text,
  transaction_hash text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  paid_at timestamptz
);

create index if not exists withdrawal_requests_user_created_idx
  on public.withdrawal_requests (user_id, created_at desc);

create index if not exists withdrawal_requests_status_created_idx
  on public.withdrawal_requests (status, created_at desc);

alter table public.withdrawal_requests enable row level security;

grant select, insert on public.withdrawal_requests to authenticated;
grant all on public.withdrawal_requests to service_role;

drop policy if exists "users read own withdrawal requests"
  on public.withdrawal_requests;

create policy "users read own withdrawal requests"
  on public.withdrawal_requests
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_role((select auth.uid()), 'admin')
  );

drop policy if exists "users create own pending withdrawal requests"
  on public.withdrawal_requests;

create policy "users create own pending withdrawal requests"
  on public.withdrawal_requests
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and transaction_hash is null
    and reviewed_at is null
    and paid_at is null
  );
