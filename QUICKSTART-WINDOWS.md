# BuildBridge Quick Start for Windows

## Prerequisites

- Node.js 22 or newer
- PowerShell opened in the repository root
- A Supabase project for real authentication and authenticated workflows

Check Node and install the locked dependencies:

```powershell
node --version
npm.cmd ci
```

## Configure Local Environment

Copy the example file and edit the copy:

```powershell
Copy-Item .env.example .env.local
```

Set `NEXT_PUBLIC_SUPABASE_URL` and either `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Configure `ADMIN_OWNER_EMAIL` only for the confirmed, manually provisioned platform owner. AI, email, YouTube and cron integrations need their own credentials; see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Never commit `.env.local` or expose server secrets through `NEXT_PUBLIC_` variables.

Without Supabase credentials the public landing page still runs. Auth pages show a configuration message, and `/api/health` returns `503` with a safe readiness diagnostic until Supabase is configured and reachable.

## Database

For an existing BuildBridge database, do not run `database-schema.sql`. Back up first and follow [`docs/DATABASE-MIGRATIONS.md`](docs/DATABASE-MIGRATIONS.md), starting with `supabase/preflight-existing-database.sql`. Only use `database-schema.sql` for a genuinely fresh project.

Configure the local Supabase Auth URL allowlist with `http://localhost:3000/auth/callback`. For social sign-in, set up real provider credentials in Supabase; the provider's redirect URI points to Supabase's `/auth/v1/callback`, while the app callback remains `/auth/callback`.

## Run and Check

```powershell
npm.cmd run dev
```

Open `http://localhost:3000`. Sign-up and sign-in are at `/auth/sign-up` and `/auth/sign-in`. The role dashboards are `/student/dashboard`, `/company/dashboard`, and `/admin`; `/workspace` remains supported. Each dashboard verifies the authenticated database profile on the server.

Before a production change, run:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

For Preview, production-branch, OAuth and rollback steps, follow [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Vercel does not apply database migrations automatically.
