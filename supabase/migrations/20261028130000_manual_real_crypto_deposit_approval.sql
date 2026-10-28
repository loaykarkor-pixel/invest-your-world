-- Manual real-deposit mode: admin verifies each on-chain receipt before crediting the internal ledger.
-- No chain monitor, private keys, automated transfer, or real withdrawal is enabled.
alter table public.crypto_operation_settings
  drop constraint if exists no_unverified_production,
  drop constraint if exists crypto_operation_settings_operating_mode_check;
alter table public.crypto_operation_settings
  add constraint crypto_operation_settings_operating_mode_check
    check (operating_mode in ('unconfigured','test','manual','production')),
  add constraint crypto_modes_keep_withdrawals_disabled
    check (operating_mode <> 'production' and not withdrawals_enabled
      and (operating_mode <> 'manual' or deposits_enabled));

-- One real on-chain transaction may only fund one internal deposit, regardless of currency.
create unique index if not exists wallet_real_deposit_tx_once
  on public.wallet_ledger(lower(tx_hash))
  where entry_type = 'deposit' and not is_test and tx_hash is not null;

create or replace function public.guard_crypto_request()
returns trigger language plpgsql security definer set search_path='' as $$
declare mode text := public.crypto_operation_status()->>'operating_mode';
begin
 if TG_TABLE_NAME = 'withdrawal_requests' then
   if mode <> 'test' or not new.is_test then
     raise exception 'Real-money withdrawals are disabled';
   end if;
 else
   if not ((mode = 'test' and new.is_test) or (mode = 'manual' and not new.is_test)) then
     raise exception 'Deposit requests are not enabled in the current operating mode';
   end if;
   if new.tx_hash is null or new.tx_hash !~ '^[0-9a-fA-F]{64}$' then raise exception 'A 64-character transaction hash is required'; end if;
   new.tx_hash := lower(new.tx_hash);
   if new.amount_claimed::text in ('NaN','Infinity','-Infinity') or new.amount_claimed <= 0 or new.amount_claimed > 1000000000 then raise exception 'Invalid deposit amount'; end if;
   if new.status <> 'pending_verification' or new.amount_confirmed is not null or new.reviewed_at is not null or new.verified_at is not null or new.reviewed_by is not null or new.admin_note is not null then raise exception 'Cannot supply verification fields'; end if;
 end if;
 return new;
end $$;

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
   if not ((mode='test' and r.is_test) or (mode='manual' and not r.is_test)) then raise exception 'Deposit approval is disabled in the current operating mode'; end if;
   if r.tx_hash is null or r.tx_hash !~ '^[0-9a-fA-F]{64}$' then raise exception 'A valid transaction hash is required'; end if;
   if _amount is null or _amount::text in ('NaN','Infinity','-Infinity') or _amount<=0 or _amount>1000000000 or _amount<>round(_amount,case when _asset='BTC' then 8 else 6 end) then raise exception 'Invalid verified amount or precision'; end if;
   if length(trim(coalesce(_note,''))) < 10 then raise exception 'Verification evidence note required'; end if;
 end if;
 execute format('update public.%I set status=$2, amount_confirmed=$3, admin_note=$4, reviewed_at=now(), verified_at=$5, reviewed_by=$6 where id=$1',table_name)
 using _id, case when _confirm then 'confirmed' else 'rejected' end, case when _confirm then _amount else null end, nullif(left(_note,1000),''), case when _confirm then now() else null end, auth.uid();
 if _confirm then
   insert into public.wallet_ledger(user_id,entry_type,amount,currency,reference_id,note,created_by,is_test,tx_hash)
   values(r.user_id,'deposit',_amount,_asset,_id,
     case when r.is_test then 'TEST ONLY: ' else 'Manually verified real deposit: ' end || left(_note,850),
     auth.uid(),r.is_test,lower(r.tx_hash));
 end if;
end $$;
revoke all on function public.review_crypto_deposit_internal(text,uuid,boolean,numeric,text) from public,anon,authenticated;
create or replace function public.review_deposit_request(_request_id uuid,_confirm boolean,_confirmed_amount numeric default null,_note text default null)
returns void language sql security definer set search_path='' as $$ select public.review_crypto_deposit_internal('USDT',_request_id,_confirm,_confirmed_amount,_note) $$;
create or replace function public.review_bitcoin_deposit_request(_request_id uuid,_confirm boolean,_confirmed_amount numeric default null,_note text default null)
returns void language sql security definer set search_path='' as $$ select public.review_crypto_deposit_internal('BTC',_request_id,_confirm,_confirmed_amount,_note) $$;
revoke all on function public.review_deposit_request(uuid,boolean,numeric,text),public.review_bitcoin_deposit_request(uuid,boolean,numeric,text) from public,anon;
grant execute on function public.review_deposit_request(uuid,boolean,numeric,text),public.review_bitcoin_deposit_request(uuid,boolean,numeric,text) to authenticated;

create or replace function public.guard_wallet_ledger()
returns trigger language plpgsql security definer set search_path='' as $$
declare r record; table_name text; mode text := public.crypto_operation_status()->>'operating_mode';
begin
 if TG_OP <> 'INSERT' then raise exception 'Wallet ledger is append-only'; end if;
 if new.entry_type='deposit' then
   table_name := case when new.currency='BTC' then 'bitcoin_deposit_requests' else 'deposit_requests' end;
   execute format('select * from public.%I where id=$1',table_name) into r using new.reference_id;
   if r.id is null then raise exception 'Verified deposit request required'; end if;
   if r.status <> 'confirmed' or r.verified_at is null or r.reviewed_by is null or r.user_id<>new.user_id or r.amount_confirmed<>new.amount or r.is_test<>new.is_test or new.tx_hash is null or lower(r.tx_hash)<>lower(new.tx_hash) then raise exception 'Credit must match a verified deposit receipt'; end if;
 end if;
 if new.is_test then
   if mode <> 'test' then raise exception 'Test ledger entries require test mode'; end if;
 else
   if mode <> 'manual' or not (new.entry_type='deposit') then raise exception 'Real-money ledger changes are disabled except verified manual deposits'; end if;
 end if;
 return new;
end $$;

-- This migration deliberately does not switch the live project into manual mode.
-- After verified public receiving addresses are assigned, an administrator must explicitly
-- enable manual deposits in crypto_operation_settings; withdrawals remain disabled.
