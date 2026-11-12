# NON MTG QUEEN

Responsive React + Vite + Tailwind community website backed by Supabase Auth, PostgreSQL, private Storage, and Supabase Edge Functions. The Pages frontend is deployed at [non-mtg-queen.pages.dev](https://non-mtg-queen.pages.dev), connected to Supabase project `xihesbbbdvvhzvaibzvb`.

## Local frontend

1. Copy `.env.example` to `.env`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from the Supabase project API settings. Do not put a secret/service-role key, database password, or Resend key in a `VITE_` variable.
3. Run `npm install` and `npm run dev`.

## Supabase deployment

The initial schema, self-review hardening, and service-role grants were applied to the live project in the Supabase Dashboard. The two later migrations below are still pending and must be applied before deploying the matching backend functions:

```powershell
supabase login
supabase link --project-ref xihesbbbdvvhzvaibzvb
supabase migration list
```

Apply only these pending files in the Supabase Dashboard SQL Editor, in order:

1. `supabase/migrations/20261113000000_add_broker_email_to_submissions.sql`
2. `supabase/migrations/20261114000000_add_vip_revocation.sql`

Do not rerun the initial schema or hardening migrations on the live project unless you have checked their status first. Supabase Dashboard SQL Editor runs do not automatically populate CLI migration history; reconcile the migration history before using `supabase db push` to avoid reapplying already-installed migrations.

The initial migration creates the tables, member ID trigger, RLS policies, review/bootstrap RPCs, private storage bucket and policies. The self-review hardening migration prevents administrators from reviewing their own submissions and limits remarks. The service-role grant migration limits privileged backend access to the required tables. The broker email migration adds a validated optional broker email field. The VIP revocation migration adds an atomic admin-only revocation action with an audit entry and notification. The `trader-verification` bucket accepts private JPG, PNG, and WebP files up to 5 MB.

After applying the pending migrations, deploy the existing functions (do not create duplicates):

```powershell
supabase functions deploy admin-api --project-ref xihesbbbdvvhzvaibzvb
supabase functions deploy email-webhook --project-ref xihesbbbdvvhzvaibzvb
supabase functions deploy public-settings --project-ref xihesbbbdvvhzvaibzvb
```

The checked-in `supabase/config.toml` enables JWT verification for `admin-api` and disables gateway JWT verification for `public-settings` and `email-webhook`; the latter functions perform their own server-side checks. Preserve these settings. `admin-api` validates caller JWTs and admin roles, while `email-webhook` requires its dedicated `x-webhook-secret`.

Supabase Edge Functions receive the project URL and server-only service role key from the Supabase runtime. Configure these additional secrets in the Supabase Dashboard (Edge Functions > Secrets):

- `RESEND_API_KEY` — Resend API key. Leave unset until email sending is configured.
- `EMAIL_FROM` — verified sender, for example `NON MTG QUEEN <no-reply@your-verified-domain>`.
- `ADMIN_SETUP_SECRET` — strong, one-time secret for initial administrator setup.
- `DATABASE_WEBHOOK_SECRET` — a separate strong secret for registration email webhook validation.

The `admin-api` function also uses the runtime-provided `SUPABASE_ANON_KEY` to validate the caller's access token with Supabase Auth. Keep the service-role key and all mail/setup secrets out of browser and Cloudflare Pages variables.

Never set the service-role key, database password, Resend key, or either setup/webhook secret in the Cloudflare Pages build environment or browser code. Only the two `VITE_` values above are public.

### First administrator

1. In Supabase **Authentication > URL Configuration**, set the site URL to `https://non-mtg-queen.pages.dev` and add it, plus any development origin you use, to the redirect allowlist. Enable email confirmations. Configure SMTP separately if using Resend for Auth confirmation and password reset emails.
2. Register the account that will be the owner, verify its email, and sign in.
3. Configure `ADMIN_SETUP_SECRET` as a Supabase Edge Function secret.
4. Visit `/admin/setup` while signed in and enter that secret. The server promotes the account only if no admin exists; there is no public admin registration field.
5. Remove the one-time `ADMIN_SETUP_SECRET` after successful setup.
6. Configure the admin notification address, support address, Telegram links, and broker URL under Admin > Website settings.

### Registration email notifications

The database creates an in-app admin notification for each new profile. The registration webhook sends a Resend welcome email to the member when configured and an additional registration notice to the configured admin email. If Resend credentials are missing, the webhook reports `emailConfigured: false` and does not block account creation. To enable these emails, create a Supabase Database Webhook for `public.profiles` INSERT events that calls:

`https://YOUR_PROJECT_REF.supabase.co/functions/v1/email-webhook`

Add the header `x-webhook-secret` with the same value configured as `DATABASE_WEBHOOK_SECRET`. The function only accepts profile insert events. Member verification and password reset emails are sent by Supabase Auth; configure its SMTP provider and templates separately.

## Security behavior

- Auth sessions use Supabase Auth and its persisted session support.
- Member IDs and profiles are provisioned by a database trigger; passwords are never copied into app tables.
- Members cannot set role or VIP status, read other profiles/submissions, or directly review applications.
- Admin review mutations, initial admin bootstrap, and email delivery are handled by Edge Functions. The database review RPC is executable only by `service_role` and independently rejects self-review.
- Screenshots live in a private bucket under a per-user folder. Admin viewing uses an authenticated Edge Function to return a 60-second signed URL.
- The private VIP invitation is not included in public settings or frontend build data. An Edge Function returns it only after checking the caller's current approved status.
- Email credentials and other privileged values are server-side Supabase Function secrets.
- The Edge Functions currently use wildcard CORS headers. This does not grant authorization: admin actions still require a verified bearer token and server-side role check, bootstrap requires its setup secret, and the webhook requires its dedicated secret. Restrict allowed origins as additional hardening if a fixed production origin is adopted.

## Cloudflare Pages

The GitHub repository is connected to the Pages project `non-mtg-queen`, with production branch `main`, automatic deployments enabled, build command `npm run build`, and output directory `dist`. Pages automatically serves the SPA entry point for nested routes when no top-level `404.html` is present; no custom `_redirects` file is needed.

The production build variables are only:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Never add a service-role key, Resend key, admin setup secret, webhook secret, or database password to Cloudflare Pages variables or browser code. Add any custom domain to Supabase Auth's site URL/redirect allowlist before using it for authentication.

Push code changes to `main` to trigger an automatic Pages deployment. Verify the deployment status in Cloudflare Pages and test the home page and direct routes such as `/register`, `/admin/login`, and `/admin/settings`. A successful Pages build does not deploy database migrations or Edge Functions.

## Manual end-to-end verification

Use separate, real accounts and a configured Supabase project; no demo/test credentials are shipped:

1. Register a member and verify its email. Confirm a profile and unique `NMQ-` ID are created.
2. Sign in, update profile name/mobile, use password recovery, and confirm the reset flow.
3. Submit a Trader ID with and without a JPG/PNG/WebP screenshot. Confirm the screenshot is private and a second pending submission is rejected.
4. Create an ordinary second account and confirm it cannot list other profiles, change role/VIP fields, read admin settings, access admin actions, or retrieve the VIP invite.
5. Bootstrap the first admin with the one-time secret, remove the secret, and sign in again. Confirm a member cannot access `/admin` or the admin API.
6. Confirm the admin dashboard can search/filter members, see submission details, create a short-lived signed screenshot link, and view verification history.
7. Approve a pending member. Confirm status/history/notification persistence, email result feedback, VIP page access, and private invite retrieval.
8. For a separate pending member, reject with a reason and confirm the reason/email/notification. Request resubmission and confirm a new Trader ID submission is accepted.
9. Revoke VIP access and confirm the member can no longer retrieve the invitation.
10. Test mobile layouts and verify unauthenticated requests to private functions fail.

## Current verification and remaining setup

- **Verified:** Cloudflare Pages production build deployed successfully from GitHub. The live homepage connected to Supabase and loaded public settings; direct `/register` navigation worked.
- **Verified locally:** `npm run build` succeeds. It reports an existing large JavaScript chunk warning.
- **Not verified:** Real user registration, email verification, password reset, storage upload, admin bootstrap, review/revocation, VIP invite enforcement, and Resend delivery have not been tested end to end.
- **Pending on Supabase:** apply the two migrations listed above, deploy the updated Edge Functions, configure Auth URLs/SMTP, and set `ADMIN_SETUP_SECRET`, `DATABASE_WEBHOOK_SECRET`, and (when email is enabled) `RESEND_API_KEY` plus `EMAIL_FROM` in Supabase Edge Function secrets.
- **Environment limitation:** `npm run lint` currently cannot start because Windows Application Control blocks the installed Oxlint native binding. No reinstall was performed.

Do not treat the backend as production-ready until the manual verification procedure succeeds against the real Supabase and Resend configuration.
