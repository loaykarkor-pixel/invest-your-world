-- Harden USDT TRC20 withdrawals and credit manually verified USDT deposits atomically.
-- This records requests and ledger entries only; it never sends crypto or scans a chain.

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
declare
  v_user_id uuid;
  v_tx_hash text;
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
  where id = _request_id and status = 'pending_verification'
  returning user_id, tx_hash into v_user_id, v_tx_hash;

  if not found then
    raise exception 'Deposit request not found or already reviewed';
  end if;

  if _confirm then
    if v_tx_hash is null then
      raise exception 'A transaction ID is required before confirmation';
    end if;
    insert into public.wallet_ledger
      (user_id, entry_type, amount, currency, reference_id, note, created_by)
    values
      (v_user_id, 'deposit', _confirmed_amount, 'USDT', _request_id::text,
       'Manually verified USDT TRC20 deposit TXID: ' || v_tx_hash, auth.uid());
  end if;
end;
$$;

revoke all on function public.review_deposit_request(uuid, boolean, numeric, text) from public;
grant execute on function public.review_deposit_request(uuid, boolean, numeric, text) to authenticated;

-- Withdrawals must be created through this RPC, which serializes per-user requests
-- and reserves the amount while requests are pending or approved.
create or replace function public.request_usdt_withdrawal(
  _amount numeric,
  _destination_address text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance numeric(20,8);
  v_reserved numeric(20,8);
  v_request_id uuid;
  v_address text := trim(coalesce(_destination_address, ''));
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if _amount is null or _amount <= 0 or _amount > 1000000000 then
    raise exception 'Enter a valid positive withdrawal amount';
  end if;
  if _amount <> round(_amount, 8) then
    raise exception 'Amount supports up to 8 decimal places';
  end if;
  if v_address !~ '^T[1-9A-HJ-NP-Za-km-z]{33}$' then
    raise exception 'Invalid TRC20 destination address';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));

  select coalesce(sum(l.amount), 0)
    into v_balance
  from public.wallet_ledger l
  where l.user_id = v_user_id and l.currency = 'USDT';

  select coalesce(sum(w.amount), 0)
    into v_reserved
  from public.withdrawal_requests w
  where w.user_id = v_user_id
    and w.currency = 'USDT'
    and w.status in ('pending', 'approved');

  if _amount > v_balance - v_reserved then
    raise exception 'Insufficient available USDT balance';
  end if;

  insert into public.withdrawal_requests
    (user_id, amount, currency, network, destination_address, status)
  values
    (v_user_id, _amount, 'USDT', 'TRC20', v_address, 'pending')
  returning id into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.request_usdt_withdrawal(numeric, text) from public;
grant execute on function public.request_usdt_withdrawal(numeric, text) to authenticated;

-- Prevent clients from bypassing the server-side balance check with direct inserts.
drop policy if exists "users create own pending withdrawal requests" on public.withdrawal_requests;
revoke insert on public.withdrawal_requests from authenticated;
