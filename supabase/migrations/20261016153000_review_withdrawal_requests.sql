-- Admins can approve or reject a request for manual review only.
-- Approval does not send funds or mark a request as paid.
create or replace function public.review_withdrawal_request(
  _request_id uuid,
  _approve boolean,
  _note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Not authorized';
  end if;

  update public.withdrawal_requests
  set status = case when _approve then 'approved' else 'rejected' end,
      admin_note = nullif(left(coalesce(_note, ''), 1000), ''),
      reviewed_at = now()
  where id = _request_id
    and status = 'pending';

  if not found then
    raise exception 'Request not found or already reviewed';
  end if;
end;
$$;

revoke all on function public.review_withdrawal_request(uuid, boolean, text) from public;
grant execute on function public.review_withdrawal_request(uuid, boolean, text) to authenticated;
