# Directory and employee backup update

The Documents details panel now uses a compact identity row, metadata, icon actions and Like/Share controls. Storage totals appear when no item is selected.

People has a two-row responsive filter toolbar and an Ex-Emp selector for Left and Terminated. Reset returns to active employees. Department, location, search and experience filters combine with departure status.

## Database setup

Run the updated ../Tekzenit-workspace-update.sql in the existing Supabase project. It applies missing migrations 006–019; migration 019 adds the administrator-only export_employee_backup function. No hosted database changes were made during this implementation.

## Removing an employee

Choose location, employee and departure status, then Continue. Download the ZIP and confirm that it was saved before Delete employee becomes available. A failed file download blocks this UI flow. Removal disables portal access and marks the employee as former; it retains historical records.

The ZIP includes profile/private details, professional records, timesheets and entries, revisions, activity and calendar history, leave and edit requests, project links, relevant audit records, work notifications, map records, avatar and profile document files. Personal workspace notes and their attachments are excluded to preserve their existing privacy rules. The ZIP is a point-in-time operational archive, not a complete Supabase database restore or Auth credential export. It contains sensitive employee information and should be stored privately. The browser requires the administrator to confirm the download was saved; it cannot verify a file on disk.

## Verification

52 automated tests passed, including archive contents, attachment failure and database authorization. The combined SQL update was applied twice in the test database. Production and preview builds passed. Browser checks used fictional preview records only.
