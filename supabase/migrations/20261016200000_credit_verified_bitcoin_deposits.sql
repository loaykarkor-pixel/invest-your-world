-- Credit the internal BTC ledger atomically when an admin confirms a verified Bitcoin deposit.
-- This does NOT scan Bitcoin or verify chain state automatically; the admin must verify on-chain first.
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

  update public.bitcoin_deposit_requests
  set status = case when _confirm then 'confirmed' else 'rejected' end,
      amount_confirmed = case when _confirm then _confirmed_amount else null end,
      admin_note = nullif(left(coalesce(_note, ''), 1000), ''),
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = _request_id and status = 'pending_verification'
  returning user_id, tx_hash into v_user_id, v_tx_hash;

  if not found then
    raise exception 'Bitcoin deposit request not found or already reviewed';
  end if;

  if _confirm then
    if v_tx_hash is null then
      raise exception 'A transaction ID is required before confirmation';
    end if;
    insert into public.wallet_ledger
      (user_id, entry_type, amount, currency, reference_id, note, created_by)
    values
      (v_user_id, 'deposit', _confirmed_amount, 'BTC', _request_id::text,
       'Verified Bitcoin mainnet deposit TXID: ' || v_tx_hash, auth.uid());
  end if;
end;
$$;

revoke all on function public.review_bitcoin_deposit_request(uuid, boolean, numeric, text) from public;
grant execute on function public.review_bitcoin_deposit_request(uuid, boolean, numeric, text) to authenticated;
