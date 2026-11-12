create or replace function public.review_trader_submission(
  p_submission_id uuid,
  p_admin_id uuid,
  p_action text,
  p_remarks text default null
)
returns public.trader_submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_submission public.trader_submissions;
  v_status text;
  v_title text;
  v_message text;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = p_admin_id and p.role = 'admin'
  ) then
    raise exception 'Administrator authorization required';
  end if;
  if p_action is null or p_action not in ('APPROVE', 'REJECT', 'REQUEST_RESUBMISSION') then
    raise exception 'Unsupported review action';
  end if;
  if p_action = 'REJECT' and nullif(trim(p_remarks), '') is null then
    raise exception 'A rejection reason is required';
  end if;
  if length(p_remarks) > 2000 then
    raise exception 'Review remarks must be 2000 characters or fewer';
  end if;

  select * into v_submission
  from public.trader_submissions
  where id = p_submission_id
  for update;
  if not found then
    raise exception 'Submission not found';
  end if;
  if v_submission.user_id = p_admin_id then
    raise exception 'Administrators cannot review their own submissions';
  end if;
  if v_submission.status <> 'PENDING' then
    raise exception 'Only pending submissions can be reviewed';
  end if;

  v_status := case when p_action = 'APPROVE' then 'APPROVED' else 'REJECTED' end;
  update public.trader_submissions
  set status = v_status,
      rejection_reason = case when p_action = 'REJECT' then trim(p_remarks) else null end,
      resubmission_requested = p_action = 'REQUEST_RESUBMISSION',
      reviewed_at = now(),
      reviewed_by = p_admin_id
  where id = p_submission_id
  returning * into v_submission;

  insert into public.vip_memberships(user_id, status, approved_at, approved_by)
  values (
    v_submission.user_id,
    v_status,
    case when p_action = 'APPROVE' then now() else null end,
    case when p_action = 'APPROVE' then p_admin_id else null end
  )
  on conflict (user_id) do update
  set status = excluded.status,
      approved_at = excluded.approved_at,
      approved_by = excluded.approved_by,
      updated_at = now();

  update public.profiles
  set vip_status = v_status
  where id = v_submission.user_id;

  insert into public.verification_history(submission_id, admin_id, action, remarks)
  values (p_submission_id, p_admin_id, p_action, nullif(trim(p_remarks), ''));

  v_title := case p_action
    when 'APPROVE' then 'VIP application approved'
    when 'REJECT' then 'VIP application rejected'
    else 'Trader ID resubmission requested'
  end;
  v_message := case p_action
    when 'APPROVE' then 'Congratulations! Your free VIP access has been approved.'
    when 'REJECT' then 'Your application was rejected. Reason: ' || trim(p_remarks)
    else 'Please update and resubmit your Trader ID information.'
  end;
  insert into public.notifications(user_id, title, message)
  values (v_submission.user_id, v_title, v_message);

  return v_submission;
end;
$$;

revoke all on function public.review_trader_submission(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.review_trader_submission(uuid, uuid, text, text)
  to service_role;
