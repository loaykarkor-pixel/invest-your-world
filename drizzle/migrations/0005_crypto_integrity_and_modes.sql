-- Additive financial hardening. No keys, transfers, or production activation.
alter table public.wallet_ledger drop constraint if exists wallet_ledger_currency_check;
alter table public.wallet_ledger add constraint wallet_ledger_currency_check check (currency in ('USDT','BTC'));
alter table public.wallet_ledger add column if not exists is_test boolean not null default false;
alter table public.wallet_ledger add column if not exists tx_hash text;
alter table public.deposit_requests add column if not exists is_test boolean not null default false;
alter table public.bitcoin_deposit_requests add column if not exists is_test boolean not null default false;
alter table public.bitcoin_deposit_requests add column if not exists verified_at timestamptz;
alter table public.withdrawal_requests add column if not exists is_test boolean not null default false;
create unique index if not exists wallet_verified_tx_once on public.wallet_ledger(currency, is_test, lower(tx_hash)) where entry_type='deposit' and tx_hash is not null;
create unique index if not exists usdt_tx_case_insensitive on public.deposit_requests(lower(tx_hash)) where tx_hash is not null;
create unique index if not exists btc_tx_case_insensitive on public.bitcoin_deposit_requests(lower(tx_hash)) where tx_hash is not null;

create table if not exists public.crypto_operation_settings (
  singleton boolean primary key default true check (singleton),
  operating_mode text not null default 'unconfigured' check (operating_mode in ('unconfigured','test','production')),
  deposits_enabled boolean not null default false,
  withdrawals_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint no_unverified_production check (operating_mode <> 'production' and not deposits_enabled and not withdrawals_enabled)
);
grant select on public.crypto_operation_settings to authenticated;
grant all on public.crypto_operation_settings to service_role;
alter table public.crypto_operation_settings enable row level security;
create policy "signed in read safe crypto status" on public.crypto_operation_settings for select to authenticated using(true);
-- No client write grant or policy. No production toggle is shipped.
create or replace function public.crypto_operation_status()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('operating_mode', operating_mode, 'deposits_enabled', deposits_enabled, 'withdrawals_enabled', withdrawals_enabled) from public.crypto_operation_settings where singleton), '{"operating_mode":"unconfigured","deposits_enabled":false,"withdrawals_enabled":false}'::jsonb)
$$;
revoke all on function public.crypto_operation_status() from public;
grant execute on function public.crypto_operation_status() to authenticated;

create or replace function public.guard_crypto_request() returns trigger language plpgsql security definer set search_path='' as $$
declare mode text := public.crypto_operation_status()->>'operating_mode';
begin
 if mode <> 'test' or not new.is_test then raise exception 'Real-money operations disabled; only isolated test requests are allowed in test mode'; end if;
 if TG_TABLE_NAME <> 'withdrawal_requests' then
  if new.tx_hash is null or new.tx_hash !~ '^[0-9a-fA-F]{64}$' then raise exception 'A 64-character transaction hash is required'; end if;
  new.tx_hash := lower(new.tx_hash);
  if new.amount_claimed::text in ('NaN','Infinity','-Infinity') or new.amount_claimed <= 0 then raise exception 'Invalid deposit amount'; end if;
  if new.status <> 'pending_verification' or new.amount_confirmed is not null or new.reviewed_at is not null or new.verified_at is not null or new.reviewed_by is not null or new.admin_note is not null then raise exception 'Cannot supply verification fields'; end if;
 end if;
 return new;
end $$;
drop trigger if exists guard_crypto_insert on public.deposit_requests;
create trigger guard_crypto_insert before insert on public.deposit_requests for each row execute function public.guard_crypto_request();
drop trigger if exists guard_crypto_insert on public.bitcoin_deposit_requests;
create trigger guard_crypto_insert before insert on public.bitcoin_deposit_requests for each row execute function public.guard_crypto_request();
drop trigger if exists guard_crypto_insert on public.withdrawal_requests;
create trigger guard_crypto_insert before insert on public.withdrawal_requests for each row execute function public.guard_crypto_request();

create or replace function public.review_crypto_deposit_internal(_asset text, _id uuid, _confirm boolean, _amount numeric, _note text)
returns void language plpgsql security definer set search_path='' as $$
declare r record; table_name text; mode text := public.crypto_operation_status()->>'operating_mode';
begin
 if auth.uid() is null or not public.has_role(auth.uid(),'admin') then raise exception 'Not authorized'; end if;
 if _confirm is null then raise exception 'Review decision required'; end if;
 if _asset not in ('USDT','BTC') then raise exception 'Unsupported asset'; end if;
 table_name := case when _asset='BTC' then 'bitcoin_deposit_requests' else 'deposit_requests' end;
 execute format('select * from public.%I where id=$1 for update',table_name) into r using _id;
 if r.id is null then raise exception 'Deposit request not found'; end if;
 if r.status <> 'pending_verification' then raise exception 'Deposit request already reviewed'; end if;
 if _confirm then
  if mode <> 'test' or not r.is_test then raise exception 'Real-money deposit credit disabled'; end if;
  if r.tx_hash is null or r.tx_hash !~ '^[0-9a-fA-F]{64}$' then raise exception 'A valid transaction hash is required'; end if;
  if _amount is null or _amount::text in ('NaN','Infinity','-Infinity') or _amount<=0 or _amount>1000000000 or _amount<>round(_amount,case when _asset='BTC' then 8 else 6 end) then raise exception 'Invalid verified amount or precision'; end if;
  if length(trim(coalesce(_note,''))) < 10 then raise exception 'Verification evidence note required'; end if;
 end if;
 execute format('update public.%I set status=$2, amount_confirmed=$3, admin_note=$4, reviewed_at=now(), verified_at=$5, reviewed_by=$6 where id=$1',table_name)
 using _id, case when _confirm then 'confirmed' else 'rejected' end, case when _confirm then _amount else null end, nullif(left(_note,1000),''), case when _confirm then now() else null end, auth.uid();
 if _confirm then
  insert into public.wallet_ledger(user_id,entry_type,amount,currency,reference_id,note,created_by,is_test,tx_hash)
  values(r.user_id,'deposit',_amount,_asset,_id,'TEST ONLY: '||left(_note,900),auth.uid(),r.is_test,lower(r.tx_hash));
 end if;
end $$;
revoke all on function public.review_crypto_deposit_internal(text,uuid,boolean,numeric,text) from public, anon, authenticated;
create or replace function public.review_deposit_request(_request_id uuid,_confirm boolean,_confirmed_amount numeric default null,_note text default null)
returns void language sql security definer set search_path='' as $$ select public.review_crypto_deposit_internal('USDT',_request_id,_confirm,_confirmed_amount,_note) $$;
create or replace function public.review_bitcoin_deposit_request(_request_id uuid,_confirm boolean,_confirmed_amount numeric default null,_note text default null)
returns void language sql security definer set search_path='' as $$ select public.review_crypto_deposit_internal('BTC',_request_id,_confirm,_confirmed_amount,_note) $$;
revoke all on function public.review_deposit_request(uuid,boolean,numeric,text),public.review_bitcoin_deposit_request(uuid,boolean,numeric,text) from public,anon;
grant execute on function public.review_deposit_request(uuid,boolean,numeric,text),public.review_bitcoin_deposit_request(uuid,boolean,numeric,text) to authenticated;

create or replace function public.guard_wallet_ledger() returns trigger language plpgsql security definer set search_path='' as $$
declare r record; table_name text;
begin
 if TG_OP <> 'INSERT' then raise exception 'Wallet ledger is append-only'; end if;
 if new.entry_type='deposit' then
  table_name := case when new.currency='BTC' then 'bitcoin_deposit_requests' else 'deposit_requests' end;
  execute format('select * from public.%I where id=$1',table_name) into r using new.reference_id;
  if r.id is null then raise exception 'Verified deposit request required'; end if;
  if r.status <> 'confirmed' or r.verified_at is null or r.reviewed_by is null or r.user_id<>new.user_id or r.amount_confirmed<>new.amount or r.is_test<>new.is_test or new.tx_hash is null or lower(r.tx_hash)<>lower(new.tx_hash) then raise exception 'Credit must match a verified deposit receipt'; end if;
 end if;
 if not new.is_test then raise exception 'Real-money ledger changes disabled'; end if;
 return new;
end $$;
drop trigger if exists immutable_wallet_ledger on public.wallet_ledger;
create trigger immutable_wallet_ledger before insert or update or delete on public.wallet_ledger for each row execute function public.guard_wallet_ledger();
revoke insert,update,delete on public.wallet_ledger from anon,authenticated;

create or replace function public.request_usdt_withdrawal(_amount numeric,_destination_address text)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); balance numeric; reserved numeric; result uuid;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if public.crypto_operation_status()->>'operating_mode' <> 'test' then raise exception 'Real-money withdrawals disabled'; end if;
 if _amount is null or _amount::text in ('NaN','Infinity','-Infinity') or _amount<=0 or _amount>1000000000 or _amount<>round(_amount,6) then raise exception 'Invalid amount; USDT supports 6 decimal places'; end if;
 if trim(coalesce(_destination_address,'')) !~ '^T[1-9A-HJ-NP-Za-km-z]{33}$' then raise exception 'Invalid TRC20 destination'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,0));
 select coalesce(sum(amount),0) into balance from public.wallet_ledger where user_id=uid and currency='USDT' and is_test;
 select coalesce(sum(amount),0) into reserved from public.withdrawal_requests where user_id=uid and currency='USDT' and is_test and status in ('pending','approved');
 if _amount>balance-reserved then raise exception 'Insufficient available test USDT balance'; end if;
 insert into public.withdrawal_requests(user_id,amount,destination_address,is_test) values(uid,_amount,trim(_destination_address),true) returning id into result;
 return result;
end $$;
revoke all on function public.request_usdt_withdrawal(numeric,text) from public,anon;
grant execute on function public.request_usdt_withdrawal(numeric,text) to authenticated;
revoke insert,update,delete on public.withdrawal_requests from authenticated,anon;

create or replace function public.guard_withdrawal_review() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='paid' or new.paid_at is not null or new.transaction_hash is not null then raise exception 'Payout recording disabled: approval is not payment'; end if;
 if new.user_id<>old.user_id or new.amount<>old.amount or new.is_test<>old.is_test or new.currency<>old.currency or new.network<>old.network or new.destination_address<>old.destination_address then raise exception 'Withdrawal request financial fields are immutable'; end if;
 if old.status<>'pending' or new.status not in ('approved','rejected') then raise exception 'Invalid withdrawal review transition'; end if;
 if new.status='approved' and (not new.is_test or public.crypto_operation_status()->>'operating_mode'<>'test') then raise exception 'Real-money withdrawal approval disabled'; end if;
 return new;
end $$;
drop trigger if exists guard_withdrawal_review on public.withdrawal_requests;
create trigger guard_withdrawal_review before update on public.withdrawal_requests for each row execute function public.guard_withdrawal_review();
create or replace function public.my_crypto_balances() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('usdt_real',coalesce((select sum(amount)::text from public.wallet_ledger where user_id=auth.uid() and currency='USDT' and not is_test),'0'),'btc_real',coalesce((select sum(amount)::text from public.wallet_ledger where user_id=auth.uid() and currency='BTC' and not is_test),'0'),'usdt_test',coalesce((select sum(amount)::text from public.wallet_ledger where user_id=auth.uid() and currency='USDT' and is_test),'0'),'btc_test',coalesce((select sum(amount)::text from public.wallet_ledger where user_id=auth.uid() and currency='BTC' and is_test),'0'),'usdt_test_reserved',coalesce((select sum(amount)::text from public.withdrawal_requests where user_id=auth.uid() and currency='USDT' and is_test and status in ('pending','approved')),'0'))
$$;
revoke all on function public.my_crypto_balances() from public,anon;
grant execute on function public.my_crypto_balances() to authenticated;
