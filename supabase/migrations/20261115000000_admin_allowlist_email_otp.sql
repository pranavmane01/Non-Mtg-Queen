create or replace function public.is_authorized_admin_email(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(coalesce(p_email, ''))) in (
    'pranavmane205@gmail.com',
    'queotexsupport@gmail.com'
  );
$$;
revoke all on function public.is_authorized_admin_email(text) from public, anon, authenticated;

do $$
begin
  execute 'alter table public.profiles disable trigger profiles_protect_fields';
  update public.profiles p
  set role = 'member',
      updated_at = now()
  where p.role = 'admin'
    and not exists (
      select 1
      from auth.users u
      where u.id = p.id
        and u.email_confirmed_at is not null
        and lower(u.email) = lower(p.email)
        and public.is_authorized_admin_email(u.email)
    );
  execute 'alter table public.profiles enable trigger profiles_protect_fields';
end;
$$;

create or replace function public.enforce_admin_email_allowlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'admin' and not exists (
    select 1
    from auth.users u
    where u.id = new.id
      and u.email_confirmed_at is not null
      and lower(u.email) = lower(new.email)
      and public.is_authorized_admin_email(u.email)
  ) then
    raise exception 'Administrator role is restricted to the verified administrator allowlist';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_admin_email_allowlist on public.profiles;
create trigger profiles_enforce_admin_email_allowlist
  before insert or update of role, email on public.profiles
  for each row execute procedure public.enforce_admin_email_allowlist();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and u.email_confirmed_at is not null
      and lower(u.email) = lower(p.email)
      and public.is_authorized_admin_email(u.email)
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is null or new.email is null then
    return new;
  end if;

  insert into public.profiles(id, member_id, full_name, email)
  values (
    new.id,
    'NMQ-' || lpad(nextval('public.member_id_sequence')::text, 6, '0'),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'Member'),
    lower(new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_confirmed
  after insert or update of email_confirmed_at on auth.users
  for each row execute procedure public.handle_new_auth_user();

create or replace function public.bootstrap_first_admin(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_confirmed_at timestamptz;
  v_admin_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('non-mtg-queen-first-admin'));

  select u.email, u.email_confirmed_at
  into v_email, v_confirmed_at
  from auth.users u
  where u.id = p_user_id
  for update;
  if not found or v_confirmed_at is null or not public.is_authorized_admin_email(v_email) then
    raise exception 'A verified allowlisted account is required for administrator setup';
  end if;

  select count(*) into v_admin_count
  from public.profiles p
  where p.role = 'admin';
  if v_admin_count >= 2 then
    raise exception 'The maximum number of administrators is already configured';
  end if;

  update public.profiles
  set role = 'admin'
  where id = p_user_id
    and role = 'member'
    and lower(email) = lower(v_email);
  if not found then
    raise exception 'The verified account profile was not found or is already an administrator';
  end if;
end;
$$;
revoke all on function public.bootstrap_first_admin(uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_first_admin(uuid) to service_role;

update public.admin_settings
set support_email = 'nonmtgqueen.support@gmail.com'
where singleton = true
  and support_email is distinct from 'nonmtgqueen.support@gmail.com';
