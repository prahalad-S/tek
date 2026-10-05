Latest calendar design and location holiday update: see [ROSTER_HOLIDAYS_UPDATE.md](ROSTER_HOLIDAYS_UPDATE.md).

Latest directory, item-details and backup update: see [EMPLOYEE_BACKUP_UPDATE.md](EMPLOYEE_BACKUP_UPDATE.md).

Latest notes and employee editing update: see [NOTES_UPDATE.md](NOTES_UPDATE.md).

# Tekzenit · React + Supabase

Latest update: see [EXPERIENCE_UPDATE.md](EXPERIENCE_UPDATE.md). Run `../Tekzenit-workspace-update.sql` for missing migrations 006–020. The latest calendar, analytics, directory and map behavior supersedes earlier notes below.

A replacement employee workspace with a modular React frontend, SCSS design system, Supabase Auth, PostgreSQL and private Storage. Vercel serves static frontend files. There is no Express server, server.js, or Vercel API backend. Optional Supabase Edge Functions handle Jarvis and private address geocoding because provider credentials must stay off the browser.

## Latest calendar and profile update

See [ENHANCEMENTS.md](ENHANCEMENTS.md) for the requested features, privacy boundaries, verification and incremental migration instructions. Existing installations with migrations 001–005 should run the current combined update through 020.

## Delivery status

The replacement source, normalized migrations, private import preparation, automated tests and fictional design preview are implemented locally. The user confirmed running the initial Supabase schema. The new calendar/profile migrations have been prepared locally and still need applying. No production deployment or Git push was performed by this task. The original checkout at `E:\ai\dir\cc-app` was not modified because write permission was not granted. Removing sensitive assets from that original checkout and its existing deployment remains outstanding.

The design preview intentionally uses invented people and simulated mutations. A connected workspace uses real Supabase requests and never silently falls back to sample data. Production builds disable preview unless explicitly enabled.

## Quick start

Use Node.js 24 and npm. Copy `.env.example` to `.env.local` and supply your project's URL and **public publishable key**. Never put a Supabase secret/service-role key or AI provider key in a `VITE_` variable.

```sh
npm ci
npm run dev
```

For the fictional design preview without a Supabase connection:

```sh
npm run build:preview
npm run preview:design
```

Open `http://127.0.0.1:5173/preview/people`. The normal sign-in page remains disabled until Supabase is configured. To build for production, keep `VITE_ENABLE_PREVIEW=false` and run `npm run build`. Deploy only `dist`.

## Connect a new Supabase project

1. Create a dedicated **new** Supabase project. These migrations establish permissions in the public schema and must not be applied blindly to a shared or existing production database.
2. Apply the files in `supabase/migrations` in filename order using the Supabase SQL editor, or link the project with the Supabase CLI and run `supabase db push`. Review the exact target before applying. The migrations create business tables, RLS policies, SQL commands and two private storage buckets.
3. Enable email/password authentication, email confirmation, a minimum 12-character password and production SMTP. Use verification links and password-recovery links; the app has no OTP login flow. Configure the Supabase Site URL and allowed redirects for your actual Vercel/custom domain, including `/password`, plus localhost only for development. Local `config.toml` does not automatically change all hosted dashboard settings.
4. Import the reviewed employee directory as described below, or provision the first employee manually in the database. An authenticated account alone gives no workspace access: its verified email must also be provisioned.
5. The employee activates their account on the sign-in screen, verifies their email, then signs in with email and password. The profile is claimed by that verified email, and the employee can fill in their code and personal details. Blank codes are NULL; codes do not grant authority and must be unique when supplied.
6. Bootstrap the first administrator in the Supabase SQL editor after that person's verified account has claimed its employee profile. Use the exact intended email:

```sql
update public.memberships
set role = 'admin'
where user_id = (
  select id from auth.users where email = 'replace-with-your-work-email'
);
```

Verify exactly one intended membership changed. Subsequent employee provisioning and role changes are available in Access management. Managers review other employees in their department; administrators review other employees across departments. Nobody approves their own work.

## Private migration

`private-backup/` and `private-migration/` are ignored by Git and excluded from the delivery archive. Keep them outside public hosting, restrict filesystem access and use encrypted backups. Ignoring a file does not remove it from existing Git history or an already published deployment.

The prepared source directory has 119 employees. Migration intentionally imports **zero legacy calendar work entries**. It excludes 419 unmatched entries and 12 ID-less entries, and privately archives the remaining 47. The conflicting nested 268-person public dataset is not merged. Details are in `MIGRATION_REPORT.md`.

```sh
npm run migration:prepare
```

This reads `private-backup/legacy-data` and writes a private normalized import and report; it does not contact Supabase. Review the report before import. To import into the new project, set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in a secure local shell, then:

```sh
npm run migration:import -- --confirm-import
```

The privileged key stays in the local process. Do not send it in chat or commit it. Import uses stable IDs and skips duplicate primary keys; it is intended for a new database. It does not delete existing remote records, import old passwords/sessions, or upload old employee documents automatically. Upload reviewed documents through each employee's private storage flow. A failed multi-table import may have partially completed; inspect errors and rerun against the same reviewed input rather than changing IDs.

## Architecture

```text
src/
  app/           shell, authentication and theme providers
  components/    reusable dialogs, avatars, state displays, notices
  features/      independently loaded pages and Jarvis dialog
  lib/           Supabase client, data access, types, domain utilities
  styles/        tokens, foundations, components, layout, pages, responsive rules
supabase/
  migrations/    normalized schema, RLS, validated business commands
  functions/assistant/  authenticated AI proposal generation
scripts/         private migration, public-output checks, preview build
tests/           database security, domain behavior, browser smoke checks
```

React Router handles routes; TanStack Query owns remote data and invalidation. Context holds session/theme only. Forms keep local draft state. The theme follows light, dark or system preference; only the theme is stored as an app preference in localStorage. Supabase manages its session lifecycle. React renders text without legacy HTML injection. Radix dialogs provide focus handling and keyboard dismissal. Loading, error and empty states are explicit.

Directory queries are paginated. Pages load on demand; fonts and icons are bundled locally. Notifications poll every 60 seconds. The schema separates employee directory fields, private contact details, departments, skills, projects, project memberships, timesheets/entries/revisions, leave, events, documents, access, notifications, audit events and assistant proposals. UUID relationships replace employee-code joins. PostgreSQL constraints and transactional commands enforce ownership, permissions, workflow transitions and concurrency.

## Jarvis: limited runtime actions

Jarvis can prepare one draft time entry from an explicit project, calendar date, duration and work description. It cannot submit timesheets, change permissions, send email or modify external systems. The user sees the complete proposal and must confirm. A proposal does not create a business timesheet; confirmation uses the same database validation as manual entry. Actions are owner-bound, expire, are idempotent and reject a changed timesheet. Cancelling or allowing expiry makes the proposal unusable. A daily request quota limits provider use. The model never receives a service-role credential.

To activate the optional function, configure `APP_ORIGIN`, `OPENAI_API_KEY` and `OPENAI_MODEL` as Supabase Edge Function secrets and deploy `assistant`. Choose a Responses API model that supports strict JSON-schema outputs. `APP_ORIGIN` must match the frontend origin exactly. The project URL and anon key are provided by Supabase's function environment. The function explicitly validates the bearer token with Supabase Auth even though gateway JWT verification is disabled in its configuration. Do not remove that validation.

No provider call was tested or deployed without your project configuration. Requests send the user's message and active project names/IDs to the AI provider with `store:false`; establish your organization's provider/data-retention agreement before enabling it. Preview chat is explicitly labeled as a design demonstration.

## Storage and security boundaries

- Personal documents and offer letters are readable by their owner and administrators; professional document categories are shared with active workspace members. Avatar reads are available to active members. Owner/admin uploads and deletes enforce the target employee folder.
- The browser receives short-lived signed download links. Do not paste them into public channels. Previously issued links can remain valid until their short expiry even after access is revoked.
- Allowed MIME types and size limits apply, but this implementation does not include antivirus/content scanning. Add a quarantine/scanning workflow if required before accepting untrusted external documents.
- Browser keys are public by design; database and Storage policies enforce access. Private details have separate owner/admin policies. App-side hiding is not a security boundary.
- Disabled memberships lose access on subsequent database requests. Already downloaded data cannot be recalled.
- The app's Vercel configuration includes a CSP and security headers. Validate them on the final custom domain, including any additional Supabase domain you use.
- Replacing the original public files does not revoke leaked credentials, remove Git history or purge cached public files. Review the original deployment and repository separately before cutover.

## Verification and deployment

```sh
npm test
npm run build
npm run check:public
npm audit
```

Database tests execute the actual migrations against embedded PostgreSQL with test Auth/Storage schemas. They verify RLS, role boundaries, owner isolation, approval transitions, concurrency and assistant confirmation rules. They are not a substitute for smoke tests against hosted Supabase Auth, email delivery, Storage and Edge Functions.

For browser checks, run the design preview then `npm run test:browser`. The browser script uses local Microsoft Edge by default; set `BROWSER_EXECUTABLE` for another Chromium installation. Screenshots are private review artifacts. The GitHub workflow runs database/domain tests, the production build and public-output checks.

Connect this source folder to a GitHub repository and import it in Vercel with the Vite preset, build command `npm run build`, output `dist`, and the two public Supabase environment variables. Keep preview disabled in production. Use a protected `main`, short `feature/*` branches and reviewed pull requests. Use a separate Supabase project for staging: a Vercel preview must not silently write to the production database. Apply reviewed database migrations before releasing frontend code that depends on them. Prefer additive migrations and forward fixes; database restore is an operational procedure, not a frontend rollback.

## Deliberate limits and next steps

Core directory, profile, projects, time entries, approvals, leave, documents, notifications, calendar creation and CSV exports have live data paths. Project teams support adding/removing activated employees; assignments are organizational and do not grant access privileges. Calendar editing and profile skills/documents are implemented in migrations 006–010. Advanced reporting, map/geocoding, Outlook/Jira integrations and an audit-log browsing page are not included. They must not be presented as connected or functional. History currently shows the latest 100 authorized timesheets, not a payroll report. Legacy maps and document URLs were not copied into the public app.

Before production cutover: connect and test a staging Supabase project, review imported rows and admin assignments, verify signup/recovery email flows, test uploads/deletions and RLS with separate real users, exercise AI confirmation using the configured provider, validate accessibility with representative users, and remove sensitive legacy hosting assets after preserving the private backup. No live cutover has been performed by this delivery.
#   t e k  
 