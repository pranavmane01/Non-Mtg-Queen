alter table public.trader_submissions
  add column if not exists broker_email text;

alter table public.trader_submissions
  drop constraint if exists trader_submissions_broker_email_check;

alter table public.trader_submissions
  add constraint trader_submissions_broker_email_check
  check (
    broker_email is null
    or (
      length(trim(broker_email)) between 3 and 254
      and broker_email = trim(broker_email)
      and broker_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  );

grant insert (broker_email) on public.trader_submissions to authenticated;
