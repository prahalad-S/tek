# Workspace refinements

This update implements the follow-up navigation, calendar and profile requests locally. It supersedes earlier descriptions of locked submitted timesheets and the two-calendar-day editing rule.

## Interface

- Back arrow on workspace, sign-in and password pages.
- Avatar dropdown with icons: My team, My projects, Team projects, Settings & profile, Log out. Team uses the employee's department; project shortcuts use project membership.
- Sidebar assistant promotion and duplicate My profile action removed. The floating Jarvis launcher remains.
- Events, holidays, analytics and maps shortcuts beside the theme control. Analytics shows directory counts, departments, locations and profile completeness. Maps lists work locations and opens the selected location in OpenStreetMap; it never exposes personal addresses.
- Ascending, descending, random and default sorting buttons replace the dropdown.
- Linear position/opacity animations avoid stretching avatars or text and preserve opening, swapping and closing behavior.
- Employee provisioning includes location; projects store client name, country and city.
- Clear history hides currently listed records for the current account, retaining timesheets and audit records. Its confirmation explains this.

## Calendar and leave

- Undo reverses the latest calendar operation from the last 24 hours, including grouped extensions. Subsequent edits by another person prevent unsafe undo. Date permissions still apply.
- Dragging/moving/extending applies without a confirmation dialog. Explicit menu actions retain destination selection.
- Editing a submitted or approved timesheet reopens it as draft and clears its reviewer. Submission snapshots remain intact. Approved leave remains protected.
- Dates older than 48 hours require an access request with reason, range and edit type. A date's midnight in Asia/Kolkata defines its age because entries have dates rather than start timestamps. This usually permits today and yesterday. Manager/admin scope and temporary grants still apply.
- All Projects and Leave filter options; Detailed and Color bands radio modes; both support dragging and extension.
- Export dialog selects date range, type and project, reports hours, and expands multi-day leave into daily rows. Maximum range: one year.
- Animated leave sending indicator with reduced-motion support. Leads/admins receive persisted review notifications; employees receive happy/declined outcome notifications. Managers can open approvals from notifications.
- Pending leave automatically approves after its entire requested period ends. The migration schedules hourly processing with Supabase Cron and checks on application refresh. Reviewed requests are untouched. Conflicting work/leave totals remain pending for a manager rather than bypassing the 24-hour limit.

The schedule follows [Supabase Cron installation](https://supabase.com/docs/guides/cron/install) and [scheduling instructions](https://supabase.com/docs/guides/cron/quickstart). Verify the hosted job after migration; the local database cannot test the scheduler itself.

## Photos and documents

- Draggable/resizable crop area, circular preview, zoom, rotation, square/free aspect ratio and keyboard adjustment sliders. Confirm saves the cropped photo.
- Compact document rows with inline upload/View replace large cards. Categories include resume, PAN, Aadhaar, ID, payslip, business card, offer/joining/relieving letters, certificate and personal files.
- Generated ID/business/resume popups offer PDF and Word downloads. Uploaded PDFs/images preview in the popup; uploaded Word files download for a document editor. Uploaded files retain their original format.
- Personal identifiers, payslips and employment letters remain owner/admin only. Professional categories use the explicit shared-category policy. Generated shared documents exclude private fields.
- PDF remains image-based; Word is editable OOXML.

## Apply and verify

Run `../Tekzenit-workspace-update.sql` in your project's SQL Editor. It requires initial migrations 001–005, applies missing 006–011 updates and skips completed ones. It contains no employee data or credentials and does not rerun the employee import.

Verify employee/manager/admin workflows and the `tekzenit-elapsed-leave` Cron job afterward. The publishable key cannot apply privileged schema changes. No hosted database changes, deployment or Git push were performed by this task.

Local database tests cover permissions, reopening, private documents, date restrictions, grouped undo/concurrency, automatic leave processing, history isolation and new project/employee fields. The bundled SQL was also applied twice to an initial-only fixture and the database suite passed.

Browser suites cover navigation, sorting, profile transitions, analytics/themes, calendar modes, exports, documents/downloads, cropping, forms and mobile overflow. They use fictional preview data; database tests use local embedded PostgreSQL.
