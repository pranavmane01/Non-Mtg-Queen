alter table public.verification_history
  drop constraint if exists verification_history_action_check;

alter table public.verification_history
  add constraint verification_history_action_check
  check (action in ('APPROVE', 'REJECT', 'REQUEST_RESUBMISSION', 'REVOKE_VIP'));

create or replace function public.revoke_vip_membership(
  p_submission_id uuid,
  p_admin_id uuid,
  p_remarks text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_submission public.trader_submissions;
  v_remarks text := nullif(trim(p_remarks), '');
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = p_admin_id and p.role = 'admin'
  ) then
    raise exception 'Administrator authorization required';
  end if;
  if p_remarks is null or v_remarks is null then
    raise exception 'A reason is required to revoke VIP access';
  end if;
  if length(v_remarks) > 2000 then
    raise exception 'Revocation remarks must be 2000 characters or fewer';
  end if;

  select * into v_submission
  from public.trader_submissions
  where id = p_submission_id
  for update;
  if not found then
    raise exception 'Submission not found';
  end if;
  if v_submission.status <> 'APPROVED' then
    raise exception 'Only approved VIP submissions can be revoked';
  end if;
  if v_submission.user_id = p_admin_id then
    raise exception 'Administrators cannot revoke their own VIP access';
  end if;

  update public.trader_submissions
  set status = 'REJECTED',
      rejection_reason = v_remarks,
      resubmission_requested = false,
      reviewed_at = now(),
      reviewed_by = p_admin_id
  where id = p_submission_id;

  update public.vip_memberships
  set status = 'REJECTED',
      approved_at = null,
      approved_by = null,
      updated_at = now()
  where user_id = v_submission.user_id
    and status = 'APPROVED';
  if not found then
    raise exception 'Approved VIP membership was not found';
  end if;

  update public.profiles
  set vip_status = 'REJECTED'
  where id = v_submission.user_id;

  insert into public.verification_history(submission_id, admin_id, action, remarks)
  values (p_submission_id, p_admin_id, 'REVOKE_VIP', v_remarks);

  insert into public.notifications(user_id, title, message)
  values (
    v_submission.user_id,
    'VIP access revoked',
    'Your VIP access was revoked by an administrator. Reason: ' || v_remarks
  );
end;
$$;

revoke all on function public.revoke_vip_membership(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.revoke_vip_membership(uuid, uuid, text)
  to service_role;
