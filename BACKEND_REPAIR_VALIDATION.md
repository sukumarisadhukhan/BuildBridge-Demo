# BuildBridge backend repair: validation report

Updated: 22 November 2026
Scope: repository audit and repair. The hosted Supabase catalog, migration history, and Vercel environment could not be queried from this workspace; user-reported live state is labeled accordingly.

## Changes in this pass

| File | Change |
| --- | --- |
| `supabase/migrations/20261121025000_company_certificate_signatories_prerequisite.sql` | New. Creates `company_certificate_signatories` (same definition, RLS and policies as `certificate-redesign.sql`) before `20261121030000` references it. Additive and idempotent. |
| `supabase/migrations/20261121055000_coursework_maps_updated_at.sql` | New. Adds `coursework_maps.updated_at` with an update trigger. Additive and idempotent. No privileges changed. |
| `app/api/coursework/route.ts` | The file-size error now says 4 MB, matching the enforced limit and the upload screen. |
| `supabase/BACKEND_PREFLIGHT.sql` | New. Read-only checks for the three reported errors and for migration state. |
| `supabase/BACKEND_POSTFLIGHT.sql` | New. Read-only verification after migration, plus a PostgREST schema reload. |
| `docs/DATABASE-MIGRATIONS.md` | Rewritten with the corrected order and the verification steps. |
| `BACKEND_REPAIR_VALIDATION.md` | This report. |
| `app/api/backend/route.ts` | Company verification now requires the configured administrator and an approved DNS-verified domain request; company profile writes no longer set verification state. |
| `supabase/migrations/20261121056000_company_verification_security.sql` | New additive privilege-hardening migration; authenticated users can insert owner/name and update name only. |
| `supabase/auth-setup-repair.sql`, `database-schema.sql` | Apply the same least-privilege company column grants on repair/fresh-install paths. |
| `supabase/BACKEND_PREFLIGHT.sql`, `supabase/BACKEND_POSTFLIGHT.sql`, `supabase/preflight-existing-database.sql`, `supabase/postflight-existing-database.sql` | Added coursework/learning prerequisites, migration-history context, RLS, answer-key, and company-verification checks. |
| `supabase/project-milestone-relationship-repair.sql` | Now refuses to add the FK when prerequisite tables/columns are missing or milestone rows are orphaned. |
| `docs/DATABASE-MIGRATIONS.md` | Clarified conditional migration order, live-project comparison, and no-rerun/no-history-edit rules. |

## Root causes of the reported errors

### Current user-reported live state

The user reports that `profiles.preferred_language`, `phone_number`, `avatar_path`, and `career_goal` exist; project assignment and milestone tables exist; and the five coursework tables do not. This state has not been independently queried from Supabase.

**`profiles.preferred_language` error.** The application profile, roadmap, coursework, and YouTube recommendation routes consistently read `profiles.preferred_language`, with `'en'` as their fallback. Since the user reports that the column exists in the SQL Editor project, adding it again is not the fix. The remaining likely discrepancy is that local, Vercel Production, Vercel Preview, and SQL Editor point at different Supabase projects, or that the failing request is reaching a different deployment. Compare only the Supabase URL host in each environment; do not share API keys. The local project host was inspected without reading or printing its keys. Vercel configuration is unavailable in this workspace.

**Coursework tables absent.** `20261121050000_profile_and_auth_enhancements.sql` creates the five coursework tables in a transaction, but ends by granting DELETE on `mentor_conversations`, which is created by `learning-ai.sql`. If that prerequisite is absent, the transaction fails at the final grant and the coursework DDL rolls back. The migration file's dependency is confirmed by source inspection; whether the prerequisite exists or the migration is recorded in the live project remains unknown. `20261121055000` must not run before `coursework_maps` exists.

**Project relationship.** API queries embed `project_milestones` through `projects`; the required FK is `project_milestones.project_id -> projects.id`. Do not run the relationship repair if it already exists. The repair SQL now checks for orphan rows and stops rather than deleting data.

The user's SQL Editor output now confirms that `public.project_milestones` exists but `project_id` does not. This makes the live table incompatible with both migration 30000 and the PostgREST embeds. The preflight was hardened to report this as `FAIL` and emit only the table's column/constraint metadata instead of aborting. No project ID was inferred and no milestone data was changed; the correct additive repair depends on the table's actual columns and constraints.

The user also reports that all seven tables created by `20261121040000_platform_identity_notifications.sql` are missing, while `profiles.preferred_language` and all five coursework tables are present. This indicates the notification migration's effects are absent in the SQL Editor project. Do not rerun 50000/55000. After verifying the migration prerequisites, run 40000 to install the missing notification/domain schema; its `ADD COLUMN IF NOT EXISTS` preserves the already-existing language column.

### Security repair

The API's `verify_company` action previously had no admin-role gate, and the general authenticated table grant plus owner update policy allowed company owners to write their own verification fields. The backend now checks the configured platform administrator, requires an approved DNS-verified domain request, and performs verification with the server-only admin client. An additive migration `20261121056000` restricts authenticated company-table writes to `name` updates and `owner_user_id`/`name` inserts. Existing `verified` and `verification_status` values are preserved.

The workspace has no generated Supabase `Database` type; `lib/types.ts` contains application types only. Correct generated database types require exporting them from the verified live project after schema reconciliation. Hand-authoring a claimed generated schema without that catalog would risk hiding mismatches.

## Verification performed

| Check | Environment | Result |
| --- | --- | --- |
| Documented fresh-install chain | PostgreSQL 16 with a local stand-in for Supabase `auth` and `storage` | Pass |
| Existing-database upgrade path | PostgreSQL 16, starting from base and marketplace state | Pass |
| Re-running the versioned migrations on both databases | PostgreSQL 16 | Pass |
| `BACKEND_PREFLIGHT.sql` on a bare install | PostgreSQL 16 | Reports MISSING items with the migration that creates each one |
| `BACKEND_POSTFLIGHT.sql` on both migrated databases | PostgreSQL 16 | 23 PASS, 1 PENDING (owner provisioning, a manual step) |
| `updated_at` trigger | PostgreSQL 16 | Pass: unchanged on insert, advances on update |
| PostgREST 16.6 contract tests (real JWTs, RLS enforced) | PostgREST against the migrated schema | 20 of 20 pass |
| `npm run typecheck` | Locked TypeScript 5.9.3 | Pass |
| `npm run lint` | Next.js 15 | Pass with no errors. Warnings are pre-existing: `<img>` usage and hook dependency arrays |
| `npm run build` | Next.js 15.5.29 | Pass: compiled, 29 pages generated |

The PostgREST contract tests cover: an authenticated student embedding `project_milestones` through `projects`; anonymous access to projects being denied; drafts hidden from students and visible to the owning company; student assignment starts and cross-student isolation; `preferred_language` default, self-update, persistence, cross-user update blocking, and role self-escalation blocking; and coursework insert, history, cross-user insert and read blocking, anonymous denial, and owner-only delete.

The database/PostgREST results above are from the earlier repair pass. The current 22 November changes have been checked with `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`; all passed. Lint and build retain the existing warnings noted above. SQL syntax and catalog effects for the new migration still require execution against the actual Supabase project after preflight.

## Not verified

- The hosted Supabase schema or migration history. This workspace has no `psql`, Supabase CLI, Vercel CLI, or linked `.vercel` project configuration. Do not infer the result of a live migration from local checks.
- Whether `learning-ai.sql` has been applied to the target project; whether migration versions 50000/55000 are recorded; or whether those records agree with actual tables.
- Whether SQL Editor and Vercel Production/Preview use the same project URL.
- Interface behaviour: language persistence across refresh and sign-out, Gemini coursework analysis (no `GEMINI_API_KEY` available), YouTube recommendations, roadmap generation, OAuth providers, and the "Failed to fetch" registration error.
- Full end-to-end execution of the project workflow, dashboard aggregation, certificate issuance, and a live RLS audit remain unverified. Relevant API paths and SQL definitions were source-reviewed, not exercised against hosted Supabase.
- Auth itself. The local tests use a stand-in for Supabase Auth, which signs the JWTs and sets the `sub` claim.

## Open evidence needed from the live project

1. Rerun the updated `supabase/BACKEND_PREFLIGHT.sql` in the same SQL Editor project. Save all results, including the `project_milestones` column/constraint diagnostics, coursework tables, `mentor_conversations`, and 50000/55000/56000 history rows.
2. Compare the project URL host in local `.env.local`, SQL Editor, and Vercel Production/Preview. Never share keys.
3. If 50000 is not recorded, coursework objects are absent, and `mentor_conversations` exists, apply the existing migration. If 50000 is recorded but objects are absent, do not rerun it or edit history; prepare a new corrective migration from the captured catalog state.
4. If 50000 is pending and `mentor_conversations` is absent, apply `learning-ai.sql` first; then recheck the preflight before running 50000.
5. Apply 55000 only after `coursework_maps` exists. Run postflight after the ordered changes.

## Environment notes

- The uploaded archive's `node_modules/.bin` files had no execute permission, so `npx` fetched a different TypeScript. The sandbox was corrected with `chmod +x`. The repository does not track `node_modules`, so nothing in the repository changed.
- The uploaded repository has many uncommitted changes. Patches in this pass are relative to the existing working tree; unrelated existing changes were left intact.
- Only the local Supabase URL host was inspected to compare project identity. No keys were read or printed. Vercel settings are not available in this workspace.
