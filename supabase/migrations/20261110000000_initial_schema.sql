-- Initial NON MTG QUEEN Supabase schema and security policies.
create extension if not exists pgcrypto;
create sequence if not exists public.member_id_sequence start with 1000;
revoke all on sequence public.member_id_sequence from public, anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  member_id text not null unique,
  full_name text not null check (length(trim(full_name)) between 1 and 120),
  email text not null unique,
  mobile text,
  role text not null default 'member' check (role in ('member', 'admin')),
  vip_status text not null default 'NOT_SUBMITTED'
    check (vip_status in ('NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trader_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  broker_name text not null check (length(trim(broker_name)) between 1 and 120),
  trader_id text not null check (length(trim(trader_id)) between 1 and 160),
  screenshot_path text,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  rejection_reason text,
  resubmission_requested boolean not null default false,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id)
);

create index if not exists trader_submissions_user_submitted_idx
  on public.trader_submissions(user_id, submitted_at desc);
create index if not exists trader_submissions_status_idx
  on public.trader_submissions(status);
create index if not exists trader_submissions_trader_id_idx
  on public.trader_submissions(trader_id);
create unique index if not exists trader_submissions_one_active_per_member_idx
  on public.trader_submissions(user_id)
  where status in ('PENDING', 'APPROVED');

create table if not exists public.vip_memberships (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.verification_history (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.trader_submissions(id) on delete cascade,
  admin_id uuid not null references public.profiles(id),
  action text not null check (action in ('APPROVE', 'REJECT', 'REQUEST_RESUBMISSION')),
  remarks text,
  created_at timestamptz not null default now()
);
create index if not exists verification_history_submission_idx
  on public.verification_history(submission_id, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);

create table if not exists public.admin_settings (
  singleton boolean primary key default true check (singleton),
  admin_email text,
  brand_name text not null default 'NON MTG QUEEN',
  public_telegram_url text not null default 'https://t.me/+Gfmw8VN2tJhjZTM1',
  broker_referral_url text not null default 'https://broker-qx.pro/sign-up/?lid=2383209',
  private_vip_telegram_url text,
  support_email text,
  updated_at timestamptz not null default now()
);
insert into public.admin_settings(singleton) values (true) on conflict (singleton) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), 'anon') <> 'service_role' and pg_trigger_depth() <= 1 and (
    new.id is distinct from old.id
    or new.member_id is distinct from old.member_id
    or new.email is distinct from old.email
    or new.role is distinct from old.role
    or new.vip_status is distinct from old.vip_status
  ) then
    raise exception 'Protected profile fields cannot be changed by members';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id, member_id, full_name, email, mobile)
  values (
    new.id,
    'NMQ-' || lpad(nextval('public.member_id_sequence')::text, 6, '0'),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'Member'),
    lower(new.email),
    nullif(trim(new.raw_user_meta_data ->> 'mobile'), '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

create or replace function public.notify_admin_of_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications(user_id, title, message)
  select p.id, 'New member registration', 'A new member has created an account.'
  from public.profiles p
  where p.role = 'admin';
  return new;
end;
$$;
drop trigger if exists profile_admin_registration_notification on public.profiles;
create trigger profile_admin_registration_notification
  after insert on public.profiles
  for each row execute procedure public.notify_admin_of_registration();

drop trigger if exists profiles_protect_fields on public.profiles;
create trigger profiles_protect_fields
  before update on public.profiles
  for each row execute procedure public.protect_profile_fields();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

drop trigger if exists vip_memberships_set_updated_at on public.vip_memberships;
create trigger vip_memberships_set_updated_at
  before update on public.vip_memberships
  for each row execute procedure public.set_updated_at();

create or replace function public.guard_trader_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), 'anon') = 'service_role' then
    return new;
  end if;
  if new.user_id <> auth.uid() or new.status <> 'PENDING'
    or new.rejection_reason is not null or new.resubmission_requested then
    raise exception 'Invalid trader submission';
  end if;
  if new.screenshot_path is not null
    and (storage.foldername(new.screenshot_path))[1] <> auth.uid()::text then
    raise exception 'Screenshot must belong to the submitting member';
  end if;
  if exists (
    select 1 from public.trader_submissions s
    where s.user_id = new.user_id and s.status in ('PENDING', 'APPROVED')
  ) then
    raise exception 'A pending or approved submission already exists';
  end if;
  if exists (
    select 1 from public.trader_submissions s
    where s.user_id = new.user_id and s.resubmission_requested = false
      and s.status = 'REJECTED'
  ) then
    raise exception 'Resubmission has not been requested by an administrator';
  end if;
  return new;
end;
$$;

drop trigger if exists trader_submission_guard on public.trader_submissions;
create trigger trader_submission_guard
  before insert on public.trader_submissions
  for each row execute procedure public.guard_trader_submission();

create or replace function public.set_membership_pending_after_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.vip_memberships(user_id, status)
  values (new.user_id, 'PENDING')
  on conflict (user_id) do update
  set status = 'PENDING',
      approved_at = null,
      approved_by = null,
      updated_at = now();
  update public.profiles
  set vip_status = 'PENDING'
  where id = new.user_id;
  return new;
end;
$$;
drop trigger if exists trader_submission_set_membership_pending on public.trader_submissions;
create trigger trader_submission_set_membership_pending
  after insert on public.trader_submissions
  for each row execute procedure public.set_membership_pending_after_submission();

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
  if not exists (select 1 from public.profiles p where p.id = p_admin_id and p.role = 'admin') then
    raise exception 'Administrator authorization required';
  end if;
  if p_action not in ('APPROVE', 'REJECT', 'REQUEST_RESUBMISSION') then
    raise exception 'Unsupported review action';
  end if;
  if p_action = 'REJECT' and nullif(trim(p_remarks), '') is null then
    raise exception 'A rejection reason is required';
  end if;

  select * into v_submission
  from public.trader_submissions
  where id = p_submission_id
  for update;
  if not found then
    raise exception 'Submission not found';
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
revoke all on function public.review_trader_submission(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_trader_submission(uuid, uuid, text, text) to service_role;

create or replace function public.bootstrap_first_admin(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('non-mtg-queen-first-admin'));
  if exists (select 1 from public.profiles p where p.role = 'admin') then
    raise exception 'An administrator is already configured';
  end if;
  update public.profiles set role = 'admin' where id = p_user_id and role = 'member';
  if not found then
    raise exception 'Member profile was not found or is already an administrator';
  end if;
end;
$$;
revoke all on function public.bootstrap_first_admin(uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_first_admin(uuid) to service_role;

create or replace function public.notify_admin_of_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications(user_id, title, message)
  select p.id, 'New Trader ID submission', 'A member submitted a Trader ID for verification.'
  from public.profiles p
  where p.role = 'admin';
  return new;
end;
$$;
drop trigger if exists trader_submission_admin_notification on public.trader_submissions;
create trigger trader_submission_admin_notification
  after insert on public.trader_submissions
  for each row execute procedure public.notify_admin_of_submission();

alter table public.profiles enable row level security;
alter table public.trader_submissions enable row level security;
alter table public.vip_memberships enable row level security;
alter table public.verification_history enable row level security;
alter table public.notifications enable row level security;
alter table public.admin_settings enable row level security;

revoke all on public.profiles, public.trader_submissions, public.vip_memberships,
  public.verification_history, public.notifications, public.admin_settings
  from anon, authenticated;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
grant select on public.profiles to authenticated;
grant update (full_name, mobile) on public.profiles to authenticated;
revoke insert, delete on public.profiles from anon, authenticated;
revoke update on public.profiles from anon, authenticated;
grant update (full_name, mobile) on public.profiles to authenticated;

drop policy if exists "submissions_select_own_or_admin" on public.trader_submissions;
create policy "submissions_select_own_or_admin" on public.trader_submissions
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "submissions_insert_own_pending" on public.trader_submissions;
create policy "submissions_insert_own_pending" on public.trader_submissions
  for insert to authenticated with check (
    user_id = auth.uid() and status = 'PENDING'
    and rejection_reason is null and not resubmission_requested
  );
grant select on public.trader_submissions to authenticated;
grant insert (user_id, broker_name, trader_id, screenshot_path) on public.trader_submissions to authenticated;
revoke update, delete on public.trader_submissions from anon, authenticated;

drop policy if exists "vip_memberships_select_own_or_admin" on public.vip_memberships;
create policy "vip_memberships_select_own_or_admin" on public.vip_memberships
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
grant select on public.vip_memberships to authenticated;
revoke insert, update, delete on public.vip_memberships from anon, authenticated;

drop policy if exists "history_select_admin" on public.verification_history;
create policy "history_select_admin" on public.verification_history
  for select to authenticated using (public.is_admin());
grant select on public.verification_history to authenticated;
revoke insert, update, delete on public.verification_history from anon, authenticated;

drop policy if exists "notifications_select_own_or_admin" on public.notifications;
create policy "notifications_select_own_or_admin" on public.notifications
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "notifications_update_own_read" on public.notifications;
create policy "notifications_update_own_read" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select on public.notifications to authenticated;
grant update (is_read) on public.notifications to authenticated;
revoke insert, delete, update on public.notifications from anon, authenticated;
grant update (is_read) on public.notifications to authenticated;

drop policy if exists "settings_admin_only" on public.admin_settings;
create policy "settings_admin_only" on public.admin_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, update on public.admin_settings to authenticated;
revoke insert, delete on public.admin_settings from anon, authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('trader-verification', 'trader-verification', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

revoke all on storage.objects from anon, authenticated;
grant select, insert, delete on storage.objects to authenticated;

drop policy if exists "verification_upload_own_folder" on storage.objects;
create policy "verification_upload_own_folder" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'trader-verification'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "verification_read_own_or_admin" on storage.objects;
create policy "verification_read_own_or_admin" on storage.objects
  for select to authenticated using (
    bucket_id = 'trader-verification'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );
drop policy if exists "verification_delete_own" on storage.objects;
create policy "verification_delete_own" on storage.objects
  for delete to authenticated using (
    bucket_id = 'trader-verification'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
revoke update, delete on storage.objects from authenticated;
grant delete on storage.objects to authenticated;
