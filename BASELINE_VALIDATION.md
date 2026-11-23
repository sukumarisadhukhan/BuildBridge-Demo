# BuildBridge baseline validation report

**Baseline source:** `BuildBridge-main(1).zip`  
**Inspection date:** 2026-11-21  
**Change state:** Created before implementation edits.

## Project inventory

- Existing Next.js 15 App Router application with React 19 and TypeScript.
- 129 archive entries; 22,522 lines across the extracted project files (including the lockfile and SQL assets).
- Existing application routes include landing, sign-in/sign-up, protected workspace, project details, certificate verification, AI, roadmap, learning resources, company-domain verification, notification delivery and backend APIs.
- Existing UI includes project marketplace/management, milestone submissions, certificates, profile preferences, notifications and a draggable AI Mentor launcher.
- Existing Supabase SQL includes core schema, auth repair, profile storage, learning/AI tables, project marketplace, certificate controls, assignment/milestone workflow and identity/notification migrations.

## Existing implementation confirmed by source inspection

- Supabase SSR client and middleware refresh sessions using PKCE cookies.
- Auth callback exchanges the OAuth authorization code and validates the `next` path against protocol-relative and backslash redirects.
- Database migrations define `project_milestones` with a `project_id` foreign key, `project_assignments`, assignment milestone progress, notification/outbox tables and `profiles.preferred_language`.
- The project relationship repair SQL issues `NOTIFY pgrst, 'reload schema'`.
- Profile avatar paths, private `profile-avatars` storage policies, signed URL loading and file upload are already present.
- Roadmap, YouTube resource, Gemini Mentor and preference APIs already exist.
- Project evidence submissions, company reviews, certificate eligibility checks, notifications, deadline reminders and Resend outbox delivery have existing implementation.

## Gaps confirmed before edits

- Sign-up UI has no phone-number field, although phone is intended to be optional and the profile schema contains `phone_number`.
- OAuth controls are available only on sign-in, and the current UI supports Google, GitHub, Microsoft/Azure and LinkedIn OIDC.
- The sign-up screen does not expose social signup controls or securely carry the selected account intent into an OAuth callback.
- Sign-in has no Remember me control or persistence selection.
- The public landing page still renders static three-card feature content rather than the specified animated Learn → Build → Prove → Earn interactive preview.
- Student, company and admin sidebar arrays still include a separate Profile item; profile access is not restricted to the account identity control.
- The existing profile form persists only a subset of requested academic/professional profile details.
- Workspace session activation unconditionally resets the selected in-app screen to Dashboard when invoked, which risks losing the user's current screen on session restoration or user updates.
- Existing Mentor context is limited to the current page, career goal and optional published project; it does not yet include the broader student learning/project context requested in the specification.

## Available validation inputs

- `.env.example` contains placeholders only. No `.env.local` or live service credentials were included in the archive.
- No dashboard reference screenshot was included with this upload, so dashboard changes cannot be matched pixel-for-pixel to that reference.
- `package.json` exposes `typecheck`, `lint` and `build`; no automated test script is defined.

## Baseline execution attempts

- `npm ci --ignore-scripts --no-audit --no-fund` did not complete within the execution window.
- `npm ci --offline --ignore-scripts --no-audit --no-fund` failed because a required package tarball (`yocto-queue@0.1.0`) is not present in the local npm cache.
- `node_modules` is therefore unavailable. Baseline `npm run typecheck`, `npm run lint` and `npm run build` cannot be meaningfully executed until dependencies can be installed.
- No hosted Supabase database, OAuth provider, Gemini API, YouTube API or Resend account was connected for this inspection. Hosted integration behavior is unverified.

## Baseline conclusion

The ZIP is an existing, substantial application and must be treated as an incremental repair. The work that follows preserves the current route structure, database model and established project/certificate/notification workflows. Any database additions are versioned and additive. Hosted behavior will remain explicitly marked as requiring environment configuration and manual Supabase/provider setup.
