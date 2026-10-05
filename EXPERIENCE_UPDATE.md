# Tekzenit experience update — 27 September 2026

This update supersedes older calendar, analytics and map behavior described in earlier notes.

## Latest layout refinement

Projects now offers grid/list toggles on every scope. List rows retain project details, status and avatars, and remain usable on small screens. People filters, sort controls, search and grid/list switching move complete cards with linear translation; text and other card contents remain visible. Avatar-only hiding/reveal is reserved for profile opening, switching and closing. Browser checks verify mid-animation visibility, project detail opening, and mobile overflow. No new migration is required.

## Follow-up: sorting, avatar stacks and motion

- All six analytics table columns now have full-cell sort buttons, visible ascending/descending arrows and deterministic sorting. Projects is now sortable; missing values remain last. Browser checks assert the actual row order in both directions.
- Project cards show overlapping avatar stacks and an overflow count. Assigned teammates are used where available; otherwise a clearly labelled employee spotlight shows a stable random selection from the visible directory. This does not change project membership. Empty client/location lines are omitted.
- Department, location, sorting and card/list controls share the same straight-line avatar transition. Competing layout and hover transforms were removed. Avatar copies hand over to their real elements in a single paint, and only text is animated during profile reveal, preventing the end-of-animation blink.
- No new database migration or dependency is needed for this follow-up.

## Implemented

- Calendar preview edits now change the visible sample calendar for the current tab. Undo restores the preceding state for adds, edits, moves, copies, extensions and deletion; reloading resets the fictional data. Connected accounts use transactional PostgreSQL undo with concurrency checks.
- Dates older than 48 hours are blocked in entry forms and drag operations. The same rule applies to administrators; historical changes require an explicit, unexpired access grant. The date boundary uses midnight in Asia/Kolkata because entries record dates, not an entry time. Access grants refresh every 30 seconds.
- Analytics has a sortable employee table and six charts: departments, joining year, locations, qualifications, employment status and project participation. Search, department, project status, employee status and qualification filters apply to every chart and the table. Missing joining dates are excluded from the joining chart; missing qualifications are labelled rather than invented.
- Directory transitions hide text, move avatar copies along straight paths for 500 ms with uniform scaling, then reveal the selected profile from top to bottom. Selecting another avatar exchanges its exact rail slot with the previous selection. Closing restores the directory layout. Reduced-motion preferences bypass movement.
- Profile skills have removable tags and an Add skills dialog with manual entry and categorized suggestions. Applying updates the editor; Save complete profile persists the normalized skills in Supabase.
- Private details use completeness progress and compact cards. Identifiers are masked by default. Existing owner/admin database restrictions remain in place.
- Generated resume PDFs use a clean editorial layout with professional details only. PDF preview/download and Word export remain available. Project dialogs are wider with two-column fields; calendar radio alignment is corrected.
- Maps are embedded with zoom, employee avatars, location filtering and map-to-profile navigation. Back returns to the map. Pins at an identical coordinate spread around their actual position so every avatar remains selectable. Map loading/failure states and OpenStreetMap attribution are visible.

## Apply the hosted database update

The user confirmed the initial 001–005 schema only. Run the updated `../Tekzenit-workspace-update.sql` in the intended Supabase project's SQL Editor. It applies missing migrations 006–013 and skips completed updates. It includes no employee imports or secrets. A fresh installation can instead apply all numbered migration files in order.

Migration 012 removes the administrator date bypass and adds map pins, access policies, address-change invalidation and geocoding rate limits. It does not delete employee records. The combined update has been tested twice against a database containing the initial schema to check repeat execution.

## Map setup and privacy

After migration 012, employees can save an address and place a pin manually in Profile. Pins default to owner/admin visibility. The employee may explicitly share the coordinate with coworkers; the underlying residential address remains private. Changing an address removes its previous pin, preventing an outdated or previously shared home location from remaining visible.

Automatic address lookup is implemented in `supabase/functions/geocode-profile` but is not deployed or configured in the hosted project. It needs an approved HTTPS, Nominatim-compatible geocoding service authorized to process employee addresses. It deliberately refuses the public Nominatim endpoint. A manual pin needs no geocoding provider.

Set these Supabase Edge Function secrets:

- `GEOCODER_URL`: approved HTTPS search endpoint returning an array containing `lat` and `lon`.
- `GEOCODER_TOKEN`: optional server-only bearer credential for that endpoint.

Then deploy `geocode-profile` to the intended Supabase project. Its configuration disables the gateway JWT check because the function itself validates the caller with `auth.getUser`. All data requests retain the caller's JWT and RLS; no service-role key is used. The function reads only the caller's stored address, caches its successful pin, and rate-limits requests. Address changes trigger lookup from the profile save flow. Failed or unconfigured lookup leaves profile saving successful and offers manual placement. Do not put geocoder credentials in frontend environment variables.

OpenStreetMap tiles supply imagery; external imagery needs network access. Tile requests reveal the viewed geographic area to the tile service, but never receive employee names or the saved address text. A public rollout should review the tile provider's usage terms and capacity. There is no Express or separate Vercel backend.

## Verification and delivery

- Production TypeScript/Vite build and public-output privacy check passed.
- 40 database/domain checks passed, including undo, historical administrator restrictions, map sharing and address-change invalidation.
- Browser checks cover real preview add → drag → undo → undo, blocked historical dates, exact avatar-slot swaps, analytics sorting/filters, skills editing, resume export, map Back navigation and mobile overflow.
- New resume PDF rendered and visually inspected. The map imagery also loaded successfully in an isolated browser.
- Source and SQL are prepared locally. No hosted database migration, Edge Function deployment, Git push or production deployment was performed in this update.

The source archive excludes `.env.local`, employee backups/imports, installed dependencies, build output and local review screenshots. Original SymPortal files remain unchanged.

## Workspace details and continuous calendar resizing

Migration 013 adds scoped map audiences, birthday dates without birth years, and durable work-history actions. Admins see all pins; managers see their own department only; other employees require an explicit account or matching-location share. Existing broadly shared pins now need an audience selection to remain visible to ordinary coworkers. A team is currently the employee department in the schema.

People sorting uses synchronized linear translations without hiding card contents. Expanded profiles show calendar tenure from joining date. Overview includes current active projects. Personal dropdowns, CEO/regional document display rules, analytics profile links and an independently scrolling content region beneath the stationary header are included.

Calendar edge resizing previews the entry's current background color and height. The last segment follows the pointer inside each cell, without resizing calendar cells or writing records during movement. Release commits the range; Escape cancels. Month, week and year entries expose resize handles. Historical context actions are disabled, and birthday labels exclude private birth years.

History records future create, move, edit, extend, leave and submission actions after migration 013. Older actions are not invented or backfilled. Clearing history hides records for the current viewer without removing the audit trail. The CEO/regional document rules affect display; they do not delete existing files.

Verification: all 40 database/domain checks, production build and public-asset privacy check passed. Browser verification confirmed extension on release and undo, year-view handles, and birthday rendering. Hosted migration 013 has not been applied from this workspace.

## Profile reading and map-save usability

The map dialog now accepts a clicked pin or explicit latitude/longitude and explains missing position/audience information on Save instead of leaving the button silently disabled. It never guesses a coordinate from a sharing location. Saving a pin still requires the previously provided migration 013; no new schema changes are introduced here.

Expanded profiles have an owner-only edit link, professional PDF/Word exports, compact contact header, section cards, experience timeline and education cards. The account menu now includes My profile linking to the signed-in employee's expanded directory card. The bio editor is hidden while preserving its saved value. Private data remains excluded from the professional exports.

## September 29 visual refinements

Profile achievement cards now match education cards with category icons. Profile facts have icons, websites open safely in a new tab with an external-link icon, active status has a green indicator, and experience dates use purple badges. Year-calendar month cards use quieter spacing and retain existing entry drag/resize handlers. Analytics search/reset controls match the 42px selectors.

The supplied Tekzenit SVG is now in src/assets/images and replaces the shared text brand. Dark mode renders a white logo. The duplicate header Events link was removed; Holidays remains. Header Outlook mail and Jira controls only show coming-soon notices. Overview displays birthdays in the next 30 days using the existing migration 013 RPC (including the next year at year-end), with no birth years or new database migration.

## Compact directory and profile exports

Outlook and Jira placeholders moved to a labelled sidebar Integrations group. People now combines its title, count and department/location totals with search, filters and view/sort controls, wrapping on smaller screens. The About section includes an accessible donut based on nine professional fields, excluding private information. Both Word profile sections and the separate PDF resume renderer now include the saved website URL. No database migration is needed for these changes.

## Header chart and personal profile downloads

The completeness donut now sits beside the identity header, with a stacked layout on small screens. Top-level profile PDF/Word downloads include phone, marital status, blood group, gender, alternate phone and address when the caller is the employee or an administrator and private details were returned by RLS. The export helper defaults to excluding private fields; PAN, Aadhaar and DOB are not in the export allowlist. Ordinary document/resume downloads retain the public default. PDF sections now use full-width section bars and generous spacing; Word uses a compact brand line, larger name, consistent typography and page margins.

Production and preview builds passed. Targeted tests confirm private fields are excluded by default and limited to the six requested fields when explicitly included. Hosted database permissions are unchanged.
