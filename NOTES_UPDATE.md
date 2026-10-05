# Notes workspace and employee profile update

Run `../Tekzenit-workspace-update.sql` in Supabase SQL Editor, then reload the app. The bundle requires initial migrations 001–005, applies missing updates through 018, and skips completed updates. No hosted database changes were made during development.

## Employee editing
Migration 016 makes private details and map pins belong to the employee record, independently of account activation. Administrators and authorized location editors can save phone, address, personal details and manual map coordinates before the employee signs in. Existing details are backfilled, and claiming the account links the existing data without losing it. Saving a changed address invalidates its old map pin. Work email remains an Auth identity; profile document uploads still require an activated account. Existing role grants continue to apply.

The People toolbar places tenure, search, department, location, sort/reset, view and add/delete controls on one line on desktop. At smaller widths it wraps accessibly. The removal dialog offers Location and Employee dropdowns, plus Left/Terminated radio options.

## Notes and files
Migration 017 adds private folders, notes and files with owner-enforced row policies and a private Storage bucket. Notes support bold, italic, H1/H2, emojis, per-note undo/redo, and browser spell check (dependent on the user's browser dictionaries). Pasted content is plain text; stored rich text is reconstructed using a strict formatting-only allowlist before display. Unsaved changes have a discard guard.

Folders, notes, search, card/table views and the selected-item panel are connected to Supabase. Files include images, PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT/CSV and ZIP, limited to 20 MB each. Upload progress uses actual transferred bytes; 100% is shown only after the server and metadata registration succeed. Cancellation, timeout and server failures are handled separately; failed registrations attempt to remove their storage object. Existing employee documents remain available in the workspace.

The storage donut summarizes accessible file sizes by documents, images and other files. It is not a Supabase plan quota or organization-wide usage meter. Notes metadata is not counted as file storage. Preview folders/notes last only for the current page session; live saves persist. Preview uploads and notifications are not sent.

## Sharing and likes
Migration 018 adds explicit read-only note sharing, including attached files, plus per-employee likes. Only the owner changes sharing. Newly added recipients get a durable in-app notification linking to the note; saving the same recipients again does not spam them. Recipients can read and like/unlike, but cannot edit, delete or re-share the owner's note. Unchecking recipients revokes subsequent database and Storage requests. Previously issued signed file URLs expire after 120 seconds; downloaded copies cannot be recalled. New attachments to a shared note are also shared. Deleting a note leaves its attachments in the owner's files and removes their shared access. Personal notes have no administrator bypass.

Notifications refresh every 60 seconds; note access/data and likes refresh every 30 seconds. Sharing can be changed through the selected note's right-side Share button, beside Like. Only activated, provisioned employee accounts can receive shares.

## Validation
49 automated tests pass, including fresh migrations, repeatable combined upgrades, pending employee edits and activation, owner and shared-note privacy, read-only recipient access, notification deduplication, like uniqueness, access revocation, and upload progress/error/cancellation. Production and preview builds pass. Browser checks cover folder creation, note formatting, emoji insertion, saving/reopening, undo/redo, view toggles, sharing search/selection, liking, employee location filtering and enabled administrator phone/address fields.

Live Auth/Storage upload and notification delivery should be exercised after applying the SQL; no live employee data was edited during verification.
