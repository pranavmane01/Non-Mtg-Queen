# NON MTG QUEEN

Responsive React + Vite + Tailwind community frontend backed by Supabase Auth, PostgreSQL, private Storage, and Supabase Edge Functions. The frontend is not usable for authenticated actions until a real Supabase project has been configured.

## Local frontend

1. Copy `.env.example` to `.env`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from the Supabase project API settings. Do not put a secret/service-role key, database password, or Resend key in a `VITE_` variable.
3. Run `npm install` and `npm run dev`.

## Supabase deployment

Install the Supabase CLI and link this folder to your project. Apply the database migrations before deploying the existing Edge Functions:

```powershell
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy public-settings
supabase functions deploy admin-api
supabase functions deploy email-webhook
```

The checked-in `supabase/config.toml` sets JWT verification on for `admin-api` and off for `public-settings` and `email-webhook`. Keep these settings when deploying; the latter two functions perform their own public-read or webhook-secret checks.

The migrations create the required tables, profile/member ID trigger, restricted RLS policies, review RPC, storage bucket, and private storage policies. The `20261111000100_prevent_self_review.sql` hardening migration prevents an administrator from reviewing their own submission and bounds review remarks. The `20261112000000_service_role_table_access.sql` migration grants the server-only `service_role` the least table privileges used by the Edge Functions; it does not grant those privileges to `anon` or `authenticated`. The `20261113000000_add_broker_email_to_submissions.sql` migration adds broker email to verification submissions while remaining safe for existing rows. The `20261114000000_add_vip_revocation.sql` migration adds an admin-authorized, atomic VIP revocation workflow and audit-history entry. The `trader-verification` bucket accepts private JPG, PNG, and WebP files up to 5 MB.

To apply them in the Supabase Dashboard instead, open **SQL Editor** for the project and run `20261110000000_initial_schema.sql`, `20261111000100_prevent_self_review.sql`, `20261112000000_service_role_table_access.sql`, `20261113000000_add_broker_email_to_submissions.sql`, then `20261114000000_add_vip_revocation.sql`. Dashboard SQL Editor runs do not automatically populate the CLI migration history. If you later use `supabase db push`, the CLI may apply these files again; these migrations use repeatable create/replace, `IF NOT EXISTS`, and upsert operations for the objects they manage.

Supabase Edge Functions receive the project URL and server-only service role key from the Supabase runtime. Configure these additional secrets in the Supabase Dashboard (Edge Functions > Secrets):

- `RESEND_API_KEY` — Resend API key. Leave unset until email sending is configured.
- `EMAIL_FROM` — verified sender, for example `NON MTG QUEEN <no-reply@your-verified-domain>`.
- `ADMIN_SETUP_SECRET` — strong, one-time secret for initial administrator setup.
- `DATABASE_WEBHOOK_SECRET` — a separate strong secret for registration email webhook validation.

The `admin-api` function also uses the runtime-provided `SUPABASE_ANON_KEY` to validate the caller's access token with Supabase Auth. Keep the service-role key and all mail/setup secrets out of browser and Cloudflare Pages variables.

Never set the service-role key, database password, Resend key, or either setup/webhook secret in the Cloudflare Pages build environment or browser code. Only the two `VITE_` values above are public.

### First administrator

1. Enable email confirmations in Supabase Auth and set the site URL plus allowed redirect URLs for localhost and the production domain. Configure a custom SMTP provider (Resend) in Supabase Auth if branded confirmation and password reset messages are needed.
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

This workspace currently has no initialized Git repository or remote, so it must be connected to the repository you choose before Cloudflare Pages can import it. Example PowerShell commands (replace the remote URL with your repository):

```powershell
git init -b main
git add --all
git status --short
git diff --cached --name-only
git commit -m "Prepare NON MTG QUEEN website"
git remote add origin YOUR_GIT_REMOTE_URL
git push -u origin main
```

`.env` is ignored and `.env.example` is allowed. Before committing, confirm the staged file list does not contain `.env`, credentials, or local build output. In Cloudflare Pages, import that repository and set:

- Framework preset: **Vite**
- Build command: `npm run build`
- Build output directory: `dist`
- Production build variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` only

The `public/_redirects` file preserves client-side React Router routes such as `/login`, `/admin`, and `/vip` on direct page loads and refreshes. Do not add Supabase service-role, Resend, admin setup, or webhook secrets to Cloudflare Pages; those belong only in Supabase Edge Function secrets. Add the deployed domain to Supabase Auth's site URL and redirect allowlist.

Before connecting the Pages production branch, push the source and verify `npm ci`, `npm run lint`, and `npm run build` succeed. After Pages deploys, verify registration and password-reset redirect URLs against the production domain. Deploy the Supabase migrations and all three Edge Functions to the intended Supabase project separately; a successful Cloudflare build does not deploy database changes or Edge Functions.

## Manual end-to-end verification

Use separate, real accounts and a configured Supabase project; no demo/test credentials are shipped:

1. Register a member and verify its email. Confirm a profile and unique `NMQ-` ID are created.
2. Sign in, use password recovery, and confirm the reset flow.
3. Submit a Trader ID with and without a JPG/PNG/WebP screenshot. Confirm the screenshot is private and a second pending submission is rejected.
4. Create an ordinary second account and confirm it cannot list other profiles, change role/VIP fields, read admin settings, access admin actions, or retrieve the VIP invite.
5. Bootstrap the first admin with the one-time secret, remove the secret, and sign in again.
6. Confirm the admin dashboard can search/filter members, see submission details, create a short-lived signed screenshot link, and view verification history.
7. Approve a pending member. Confirm status/history/notification persistence, email result feedback, VIP page access, and private invite retrieval.
8. For a separate pending member, reject with a reason and confirm the reason/email/notification. Request resubmission and confirm a new Trader ID submission is accepted.
9. Test mobile layouts and verify unauthenticated requests to private functions fail.

Do not treat the backend as production-ready until this procedure succeeds against the actual Supabase and Resend configuration.
