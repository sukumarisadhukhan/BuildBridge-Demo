# BuildBridge Database Migration Guide

The web deployment never applies Supabase SQL automatically. Back up the project before any production change. The SQL files below are manual operations in the Supabase SQL Editor.

## Verification scripts

- `supabase/BACKEND_PREFLIGHT.sql` is read-only. Run it before any migration and save the output. Missing items show `MISSING` and name the migration that creates them.
- `supabase/BACKEND_PREFLIGHT.sql` also reports whether migration versions are visible in Supabase's migration history. SQL Editor runs may not be recorded there; catalog state and saved SQL Editor results are authoritative.
- `supabase/BACKEND_POSTFLIGHT.sql` is read-only except for a PostgREST schema reload at the end. Run it after the migrations. Every row should be `PASS`, except `platform owner provisioned`, which stays `PENDING` until the owner is provisioned in step 13.

## Existing BuildBridge Database

Do not run `database-schema.sql` against an existing project. It is an initial-install schema, not a production upgrade script.

1. Confirm this is the same Supabase project used by the deployed app. Compare the project host in local `.env.local` with the `NEXT_PUBLIC_SUPABASE_URL` value in Vercel's Production and Preview environments. Compare hosts only; never paste public or service-role keys into chat. SQL Editor, local app, and deployed app can point at different projects.
2. Take a Supabase backup. Run `supabase/BACKEND_PREFLIGHT.sql` and `supabase/preflight-existing-database.sql`, and save both outputs. Treat them as the catalog state of the SQL Editor project. Do not add `profiles.preferred_language` or recreate existing assignment tables when those objects already exist.
3. If a preflight reports multiple admin profiles, duplicate project slugs, a non-enum project status, orphaned milestone rows, a missing `project_milestones.project_id`, or unexpected foreign keys, stop and inspect the existing table shape. Do not run migration 30000 or the relationship repair until the existing columns, constraints, and row mapping have been reviewed.
4. Inspect the migration history alongside the object checks. A history row does not prove that the expected objects exist, and SQL Editor runs may not be recorded. Never edit history to hide missing objects or mark a failed migration as applied.
5. Apply `supabase/auth-setup-repair.sql` only after confirming the preflight has at most one admin profile and the existing profile policies can be updated. It replaces named BuildBridge policies and functions, does not drop tables or unrelated policies, and restricts company API roles to inserting an owner/name and updating the display name.
6. Apply `supabase/profile-details.sql` and `supabase/learning-ai.sql` only if their tables/features are missing. Confirm `public.mentor_conversations` exists before applying `20261121050000_profile_and_auth_enhancements.sql`; the latter ends with a grant on that prerequisite. Do not run the coursework migration if its version is recorded and all five objects exist.
7. Apply `supabase/migrations/20261121020000_existing_database_compatibility.sql` only if its marketplace columns are missing. It preserves the existing `project_status` enum and fails rather than converting a mismatched type or deleting duplicate-slug projects.
8. Apply `supabase/migrations/20261121025000_company_certificate_signatories_prerequisite.sql` only if the prerequisite is missing. It creates the table with the same definition, RLS, and policies as `certificate-redesign.sql`.
9. Apply `supabase/migrations/20261121030000_project_assignment_milestone_workflow.sql` only when its required objects are not already installed and its prerequisites pass. Existing assignments and milestones must be preserved.
10. Apply `supabase/migrations/20261121040000_platform_identity_notifications.sql` only if its missing objects require it. It adds `profiles.preferred_language` with default `'en'`; do not run it solely to repair a profile error when that column exists in this project.
11. Apply `supabase/migrations/20261121050000_profile_and_auth_enhancements.sql` only when the coursework objects are absent, its version is not recorded, and `mentor_conversations` exists. If the version is recorded but objects are absent, stop; do not rerun or alter history. First capture the catalog and history output, then prepare a new corrective migration based on that exact state.
12. Apply `supabase/migrations/20261121055000_coursework_maps_updated_at.sql` only after `coursework_maps` exists and `updated_at` is missing. If its history row exists but the column is missing, use a new corrective migration rather than changing history.
13. Apply `supabase/migrations/20261121056000_company_verification_security.sql`. It removes authenticated insert/update access to verification fields while preserving name editing. The backend now requires the configured platform administrator and an approved, DNS-verified domain before setting a company verified.
14. Apply `supabase/migrations/20261121057000_project_workflow_rls_and_storage.sql`. It restores RLS and least-privilege policies for project assignments, milestone progress, submissions and private evidence Storage. It does not recreate records or tables.
15. Review `supabase/certificate-redesign.sql` before applying it. It intentionally changes legacy certificate statuses; review affected counts and take a backup first. Do not apply unless that business decision is approved.
16. Run `supabase/postflight-existing-database.sql`, `supabase/project-workflow-verification.sql` and `supabase/BACKEND_POSTFLIGHT.sql`. Investigate every `FAIL` or `MISSING` result.
17. Provision the one platform owner only after their Auth email is confirmed. Set server-only `ADMIN_OWNER_EMAIL` to the same address, replace the placeholder in `supabase/provision-admin.sql`, and run it as the Supabase project owner. Then confirm `platform owner provisioned` is `PASS`.

If a profile error still names `profiles.preferred_language` after the column is confirmed in SQL Editor, do not add it again. First compare the SQL Editor project host with the deployed app's Vercel Production `NEXT_PUBLIC_SUPABASE_URL`, then check Preview separately. A PostgREST cache reload only helps when both requests target the same project.

The compatibility migration is intentionally limited to the project columns required before the numbered workflow migrations. The numbered migrations create missing assignment, milestone, company-domain, notification, coursework, quiz, and theory-certificate tables with `IF NOT EXISTS`. Existing project and submission rows are retained.

Do not run `supabase/project-marketplace.sql` after the versioned project workflow migration: it is the earlier marketplace installer and can replace workflow policies/functions. Existing databases that need the historical BuildBridge Practice Project seed should review that file separately and apply only the approved seed statements; do not replay its whole installer over production.

## Fresh Supabase Project

1. Run `database-schema.sql` once on a genuinely empty BuildBridge Supabase project.
2. Run `supabase/auth-setup-repair.sql`, then `supabase/profile-details.sql` and `supabase/learning-ai.sql`.
3. Run `supabase/project-marketplace.sql` to install the marketplace and its initial practice-project catalogue.
4. Run `learning-ai.sql` before `20261121050000`, then run the versioned migrations in timestamp order: `20261121020000`, `20261121025000`, `20261121030000`, `20261121040000`, `20261121050000`, `20261121055000`, `20261121056000`, `20261121057000`.
5. Review and apply `supabase/certificate-redesign.sql`; it revokes legacy certificate records from the initial schema under the current issuer rules.
6. Run `supabase/BACKEND_POSTFLIGHT.sql`, the postflight and workflow verification scripts. Provision the confirmed platform owner last.

## Verified locally

The full documented fresh path and the existing-database upgrade path were run on PostgreSQL 16 with a local stand-in for Supabase's `auth` and `storage` objects. Both completed, and re-running the versioned migrations completed without error. This is not evidence about your hosted project; run the preflight there first.

## Rollback

These SQL changes are additive, but policy/function replacement and certificate status updates are not safely reversed by dropping objects. Do not run reverse SQL or drop tables to roll back an application deployment. Restore the pre-migration Supabase backup only with an approved recovery plan; otherwise use a forward-fix migration. Vercel rollback does not roll back Supabase schema or records.

No SQL in this repository has been applied to the live Supabase project or verified against its current catalog from this workspace.
