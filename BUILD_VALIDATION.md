# BuildBridge Change and Validation Report

Date: 21 November 2026

## Changes Made

- `components/WorkspaceApp.tsx`: repaired the student Opportunities JSX; match criteria now use the authenticated workspace profile with `initialProfile` fallback; company opportunity management uses `initialProfile.id`; legacy OAuth panel supports Google, GitHub, LinkedIn OIDC, and Microsoft only.
- `components/SocialAuthButtons.tsx`: removed Facebook provider identifier, icon fallback, and button; retained the four supported providers.
- `app/globals.css`: aligned provider buttons in four columns on wider screens and two columns on narrow screens.
- `components/AuthForm.tsx`: routes signup and successful password/OAuth sign-in from intent/profile without granting roles; catches OAuth network/provider errors and always releases the busy state.
- `app/auth/callback/route.ts`: catches session exchange failures, preserves the safe requested destination on errors, and routes default callbacks using the authenticated profile.
- `lib/supabase-config.ts`: added public Supabase URL/key validation and actionable configuration diagnostics.
- `lib/supabase.ts`, `lib/supabase/server.ts`, `middleware.ts`, `lib/api-auth.ts`, `lib/supabase/admin.ts`, `app/api/backend/route.ts`, `app/api/ai/route.ts`, `app/api/resources/route.ts`, `app/api/roadmap/route.ts`, and `app/api/certificates/verify/[certificateCode]/route.ts`: use validated public Supabase configuration; admin authorization also checks `ADMIN_OWNER_EMAIL`, `platform_admin_owner`, matching user ID/email, and confirmed Auth email.
- `app/api/health/route.ts`: reports missing/invalid configuration, invalid key, unavailable project, rejected request, or network failure; returns `503` unless Supabase is ready and never returns keys.
- `app/api/coursework/quiz/route.ts`: validates untrusted quiz answers as unknown values before grading.
- `lib/workspace-page.tsx`, `app/workspace/page.tsx`, `app/student/dashboard/page.tsx`, `app/company/dashboard/page.tsx`, and `app/admin/page.tsx`: enforce database-profile role routing and reuse the existing workspace UI.
- `database-schema.sql`, `supabase/auth-setup-repair.sql`, and `supabase/enable-social-auth-company-role.sql`: remove metadata/RPC company role escalation and bind RLS admin checks to the manually provisioned owner.
- `supabase/migrations/20261121020000_existing_database_compatibility.sql`: added guarded, additive marketplace compatibility fields; preserves the existing status enum and aborts on incompatible status types or duplicate slugs.
- `supabase/preflight-existing-database.sql`, `supabase/postflight-existing-database.sql`: added read-only catalog/schema/RLS/foreign-key/owner diagnostics.
- `.env.example`: lists the supported anon or publishable public key alternatives.
- `docs/DATABASE-MIGRATIONS.md`, `docs/DEPLOYMENT.md`, `QUICKSTART-WINDOWS.md`, `README.md`, `RUN-THIS-FIRST.txt`, and `BASELINE_VALIDATION.md`: document safe database ordering, Windows setup, the four OAuth providers, Vercel Preview/Production workflow, and rollback boundaries; removed Facebook setup references.

## Automated Validation

- Node.js: `v26.13.1` (meets the Node.js 22+ requirement).
- `npm ci`: passed; installed 434 packages. npm reported 2 audit findings (1 moderate, 1 high); no forced dependency changes were made.
- `npm run typecheck`: passed.
- `npm run lint`: passed with existing `<img>` optimization and React hook dependency warnings. Next.js 15 also reports `next lint` deprecation.
- `npm run build`: passed against local `.env.local` configuration.
- Credential-free production build: passed with all app credentials blank in an isolated child process; `.env.local` was not changed.
- Configured production HTTP smoke: `/` `200`; `/auth/sign-in` `200`; `/auth/sign-up` `200`; `/api/health` `200` with `supabaseStatus=ready` and `supabaseReachable=true`; `/workspace` `307` to sign-in; `/student/dashboard`, `/company/dashboard`, and `/admin` each `307` to sign-in without a session.
- Auth page provider check: both sign-in and sign-up render Google, GitHub, LinkedIn, and Microsoft; Facebook is absent.
- The smoke-test production server was stopped after checks.

## External Validation Still Required

- No SQL was applied to the live Supabase database. `psql` was unavailable, so SQL syntax/catalog checks were not executed against a local PostgreSQL instance. Run the preflight and postflight SQL against the intended database under the ordered procedure in `docs/DATABASE-MIGRATIONS.md`.
- Live registration, email confirmation, password reset, remember-me persistence, logout, and authenticated session restoration require a test account; they were not completed in this HTTP-only smoke test.
- Google, GitHub, LinkedIn OIDC, and Microsoft OAuth each require provider credentials and redirect allowlists; provider-by-provider login remains unverified.
- Company DNS proof, administrator approval, opportunity publishing/application, evidence submission/review, and owner-only admin actions require a configured test database and role accounts; these were not exercised end to end.
- Vercel's configured Production Branch and current live deployment were not accessible through this workspace. The local branch is `master`; do not push there until Vercel settings are verified. No Production deployment was changed.

## Addendum — 22 November 2026

- `app/api/backend/route.ts`: company profile creation now omits verification fields and the `verify_company` action requires the configured platform administrator plus a previously DNS-verified and approved domain request.
- `supabase/migrations/20261121056000_company_verification_security.sql`: added a guarded, additive migration restricting authenticated company writes to organization name and owner/name insertion. No existing verification values or rows are changed.
- The fresh-install schema and auth repair grant the same column-level restrictions. Preflight/postflight scripts now report coursework and learning prerequisites, migration-history context, RLS, answer-key access, and company verification privileges.
- `supabase/project-milestone-relationship-repair.sql` now checks its tables, columns, and orphan rows before adding the relationship.
- Current `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` passed. Lint/build retain existing image/hook warnings and the Next.js `next lint` deprecation notice.
- Hosted Supabase migration history, SQL Editor schema, and Vercel Production/Preview URLs remain unverified. `psql`, Supabase CLI, and Vercel CLI are not available in this workspace; no live migration was run or claimed.
- The user's SQL Editor preflight initially stopped because the existing `project_milestones` table lacks `project_id`. The updated preflight now reports that as a schema failure and emits the table's column and constraint definitions. No migration or backfill is safe until that shape is reviewed.

## Addendum — 22 November 2026 integration pass

- Added `20261121057000_project_workflow_rls_and_storage.sql` to establish assignment/submission/milestone-progress RLS and private evidence Storage policies without recreating records or tables.
- Updated [`app/api/backend/route.ts`](</C:/Users/RADHA KRISHNA/Downloads/ai prompt war/done/app/api/backend/route.ts>) to load student, company and admin assignments and milestone progress; evidence metadata is now bounded and checked before submission records are inserted.
- Updated [`app/api/projects/route.ts`](</C:/Users/RADHA KRISHNA/Downloads/ai prompt war/done/app/api/projects/route.ts>) to sort milestone lists consistently by `sequence_number` or `sequence`.
- Expanded [`lib/types.ts`](</C:/Users/RADHA KRISHNA/Downloads/ai prompt war/done/lib/types.ts) with project milestone, assignment, progress, submission, coursework and theory-certificate application types.
- `app/page.tsx` was audited and requires no change: it is a marketing landing page and contains no hardcoded project or submission workflow data.
- `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` pass. Lint/build retain existing `<img>`, hook dependency and `next lint` warnings.
- Live assignment creation, Storage upload, submission trigger, company review, and certificate issuance were not executed because hosted Supabase credentials/test accounts are not available in this workspace.
