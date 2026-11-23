# BuildBridge Deployment and Rollback

Vercel deployment and Supabase migration are separate operations. A successful frontend deployment does not apply SQL or configure authentication providers.

## Local Validation

Use Node.js 22 or newer. From PowerShell in the repository root:

```powershell
node --version
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Copy `.env.example` to `.env.local` and use a non-production Supabase project for local work. The public landing page and build must work without API credentials. Auth, profile, data, AI and email operations require the respective real service configuration and should show an actionable error when it is absent.

Smoke-test local rendering and unauthenticated protection:

```powershell
npm.cmd run start
Invoke-WebRequest http://localhost:3000/
Invoke-WebRequest http://localhost:3000/auth/sign-in
Invoke-WebRequest http://localhost:3000/api/health -SkipHttpErrorCheck
Invoke-WebRequest http://localhost:3000/workspace -MaximumRedirection 0 -SkipHttpErrorCheck
```

The health endpoint returns `503` until Supabase is configured and reachable. An unauthenticated workspace request should redirect to sign-in when Supabase is configured; without Supabase it renders a configuration message instead.

## Supabase Setup

Follow [`DATABASE-MIGRATIONS.md`](DATABASE-MIGRATIONS.md) for the correct fresh-versus-existing database procedure. Take a backup and run the read-only preflight first for an existing database. Vercel does not run these SQL files.

Set public variables `NEXT_PUBLIC_SUPABASE_URL`, one of `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_APP_URL`. Server-only variables are `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_OWNER_EMAIL`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, `UNSUBSCRIBE_TOKEN_SECRET`, and `APP_BASE_URL`. Optional variables are `YOUTUBE_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, and `GEMINI_MODEL`. Never put a server secret in a `NEXT_PUBLIC_` variable or commit `.env.local`.

### OAuth Redirects

For every provider, set its client ID and secret in Supabase Authentication, not in this repository. Add each exact application callback to Supabase Authentication → URL Configuration → Redirect URLs:

- `http://localhost:3000/auth/callback`
- The exact Vercel Preview origin followed by `/auth/callback`
- The production origin followed by `/auth/callback`

Register the Supabase callback URL, normally `https://<project-ref>.supabase.co/auth/v1/callback`, with the identity provider. In particular, Google Cloud's authorized redirect URI remains this Supabase URL; it is not the BuildBridge `/auth/callback` URL. BuildBridge passes its current origin and requested internal destination through Supabase. Provider identifiers are Google `google`, GitHub `github`, LinkedIn `linkedin_oidc`, and Microsoft `azure`. Test each provider separately after configuring its credentials. Preview and production domains may need separate provider allowlists.

Set the Supabase Site URL to the canonical production origin. For email confirmation and password recovery, also allow the local, Preview and Production application callback paths. Do not use a broad wildcard unless the project owner has reviewed its scope.

## Vercel Preview and Production

1. In Vercel Project Settings → Git, record the configured **Production Branch** and current Production domain before pushing. The current local Git branch is `master`, but that alone does not establish Vercel's production-branch setting. Do not change that setting as part of this repair.
2. Keep the existing live Production deployment intact. Push the repair to a separate non-production branch and open a pull request. Confirm Vercel labels the resulting deployment **Preview**, not Production. If the configured production branch is `master`, do not push test commits directly to `master`.
3. Configure Preview variables separately, preferably with a dedicated test Supabase project and test provider credentials. Never copy production service-role, mail, AI or cron secrets into an untrusted Preview environment. Set the Preview `NEXT_PUBLIC_APP_URL` and `APP_BASE_URL` to the exact Preview origin when those are used.
4. Add that exact Preview callback URL to the test Supabase Auth allowlist and to the relevant OAuth provider's application settings. Verify email confirmation, reset-password, session restoration and logout on the Preview domain.
5. Run the automated checks and test role journeys on Preview. Run Supabase preflight/postflight against the intended database separately; a successful Preview build does not prove a migration is safe or applied.
6. Only after Preview acceptance, merge through the repository's normal review process into the Production Branch shown in Vercel settings. Do not force-push, delete branches, alter deployment settings, or promote an untested deployment.
7. Verify Vercel marks the new deployment **Production**, check `/api/health`, then smoke-test the public page, sign-in, callback and authenticated role dashboards. Check Vercel logs without exposing environment values.

## Environment Variables

| Variable | Scope |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public client key; configure one |
| `NEXT_PUBLIC_APP_URL` | Public canonical application origin |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only privileged database/auth operations |
| `ADMIN_OWNER_EMAIL` | Server-only confirmed, manually provisioned platform owner email |
| `GEMINI_API_KEY` | Server-only AI Mentor and coursework generation |
| `RESEND_API_KEY` | Server-only email delivery |
| `CRON_SECRET` | Server-only scheduled-job authorization |
| `UNSUBSCRIBE_TOKEN_SECRET` | Server-only unsubscribe token signing secret |
| `APP_BASE_URL` | Server-side canonical links and email URLs |
| `YOUTUBE_API_KEY` | Optional server-side YouTube Data API |
| `EMAIL_FROM`, `EMAIL_FROM_NAME` | Optional verified mail sender |
| `GEMINI_MODEL` | Optional primary AI Mentor model; defaults to `gemini-3.8-flash` |
| `GEMINI_FALLBACK_MODELS` | Optional comma-separated server-only fallback models; defaults include `gemini-3.6-flash` and `gemini-3.5-flash-lite` |

Configure the notification cron variables before expecting email. A notification is not reported as delivered unless the provider returns a successful response.

## Rollback

For a failed frontend deployment, use Vercel's rollback to the last known-good Production deployment, or revert the repair commit with a new commit and deploy that through the normal branch process. Confirm the selected build was previously validated; do not promote an untested artifact. Do not force-push or change the configured Production Branch.

Frontend rollback does not reverse database migrations, OAuth settings, or records. Use the reviewed Supabase backup only under the database recovery plan. Otherwise fix forward with a new additive migration; do not drop tables, remove policies indiscriminately, or run the initial schema against Production.

## Acceptance Tests Requiring External Services

After Preview configuration, test: student signup/email confirmation/login/refresh/logout; each enabled OAuth provider; company request → DNS TXT verification → owner approval → company role; ordinary-user denial at `/admin`; verified-company opportunity publish and student application; student evidence submission and assigning-company review; email unsubscribe and notification delivery. These flows require real Supabase, DNS, OAuth, email and/or Gemini configuration and cannot be certified from a local compile alone.
