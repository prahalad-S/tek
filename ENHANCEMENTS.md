# Tekzenit calendar, directory and profile update

Superseded where noted by [WORKSPACE_REFINEMENTS.md](WORKSPACE_REFINEMENTS.md): use `../Tekzenit-workspace-update.sql` for the latest update, including editable submitted timesheets and the rolling 48-hour boundary.

Implemented locally on 26 September 2026. Apply migrations 006–010 to the existing Supabase project before using these features with real data. The supplied incremental SQL assumes migrations 001–005 have already run. Do not rerun the initial schema or employee import as part of this update.

## Requested features

| Request | Implementation |
| --- | --- |
| Calendar views | Week, month and twelve-month year overview; month/year selectors; Today and previous/next navigation. |
| Hours | Presets 1–8 and 9+, plus an editable precise duration. Shared by calendar and timesheets. |
| Work interactions | Drag to another date; right-click or keyboard-accessible options for edit, copy, paste, move, repeat and delete; drag the resize handle forward to repeat work. Mutations require confirmation where appropriate. |
| Calendar safeguards | Original today/previous-two-calendar-days rule, evaluated in Asia/Kolkata by the database; restricted-date popup, access requests and scoped manager grants expiring after 48 hours. Submitted timesheets remain locked. |
| Calendar context | Daily work/approved-leave totals, missing/partial indicators, expanded day list, project/person/status/search filters and CSV export including leave. |
| Leave | Casual, Sick, Earned, Emergency and Unpaid; full/half day; date range and reason; approval notifications; move/copy/extend/delete pending requests. Overlapping requests cannot exceed a full leave day. Approved leave stays locked. |
| Management | Assign work to authorized teammates, review date-access requests, grant individual/team access. Department managers cannot manage unrelated departments. |
| Events and holidays | Company or department scope, create/edit/delete, event location/organizer/participants/status/type/category/details, upcoming lists. Company scope requires an administrator. |
| Brand | Tekzenit identity in the application, sign-in and generated documents. |
| Directory | Animated department/location filtering, sorting and card/list switching. Expanded profile on the left, four-column avatar rail on the right; selecting another person exchanges that avatar slot with the previous selection. Mobile layout stacks these areas. Reduced-motion preferences are respected. |
| Profiles | Employee code, photo, contact/location, summary, skills, languages, experience, education, projects, awards and certificates. Edits persist through Supabase commands into normalized tables. |
| Privacy | Coworkers see professional details and professional documents. Owner/administrator can read phone, address, personal fields and private documents such as offer letters. Database and Storage policies enforce this boundary. |
| Downloads | ID card, business card and resume generated from the profile, with photo where available, in PDF and real editable DOCX. Uploaded documents use private storage and signed downloads. |

## Deliberate differences from the legacy application

- The historical edit rule is two calendar days, matching the source; it is not an exact rolling 48-hour timer or a minimum-hours rule. Access grants last 48 hours.
- Repeating work requires confirmation rather than silently recording additional hours. Approved leave and submitted timesheets cannot be moved to bypass locks.
- Offer letters are uploaded actual documents. The application does not invent employment terms or generate an authoritative offer from a generic template.
- Employee document categories determine sharing: the upload form identifies professional categories as shared. Personal documents and offer letters belong in their private categories.
- PDF export preserves Unicode through canvas rendering; it is currently an image-based PDF, without searchable text or accessibility tags. DOCX remains editable. Very long card content may continue onto another page rather than being silently clipped.
- Existing professional extensions are not inferred from missing legacy data. Employees fill in their new structured profile sections. Existing private backups remain outside the public build and source archive.
- The directory loads authorized profiles in batches; this is suitable for the current small directory, but a much larger organization should adopt server-side filtering and virtualization.
- Native drag/drop targets desktop pointer use; explicit move/repeat menu actions provide a keyboard/touch alternative.

## Verification

28 automated domain/database tests pass, including ownership, role scopes, document metadata and storage visibility, historical edit restrictions, approval locks, overlapping leave and combined work/leave totals. TypeScript and the production build pass. Browser suites exercise fictional preview data, filters, exact avatar slot swaps, calendar views/actions, profile forms, six document downloads, dark/light themes and mobile overflow. Sample PDFs were rendered and visually reviewed; DOCX files were checked as valid OOXML.

These checks use local embedded PostgreSQL and a fictional browser preview. They do not establish that the new migration has been applied or that live authenticated workflows have been verified in the hosted project. No deployment or Git push was performed.

## Apply and verify in your existing project

1. Run the supplied `Tekzenit-calendar-profile-update.sql` once in the Supabase SQL Editor. It wraps migrations 006–010 in a transaction and contains no employee data.
2. Sign in with a provisioned employee account. Save a skill and employee code, reload, and confirm persistence. Upload a photo and generate the three document types.
3. With a second employee account, verify professional profile access and absence of private contact details/offer letters. With the administrator account, verify access to those private fields.
4. Create, move and copy a draft calendar entry; request access for an older date; approve as the appropriate manager; verify a submitted week remains locked.
5. Upload a private offer letter and shared resume, then verify downloads under both accounts. Confirm the intended production Auth URL/redirect and SMTP settings before deployment.

The prior employee import and first-administrator setup remain separate steps if they have not already been completed. No passwords or privileged keys are included in this update.
