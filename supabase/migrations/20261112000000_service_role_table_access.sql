-- Edge Functions use the server-only service_role key and bypass RLS.
-- Grant only the table operations currently needed by the backend.
grant select on public.profiles,
  public.trader_submissions,
  public.vip_memberships,
  public.verification_history,
  public.notifications,
  public.admin_settings
to service_role;

grant insert, update on public.admin_settings to service_role;
