# Local Jira → GitHub workflow

Open the local portal on http://127.0.0.1:5173 and sign in.

1. Ask Jarvis whether any Jira issues are assigned to you.
2. Answer Yes to opening project files. If several tickets exist, say the issue key.
3. Say GitHub. Choose a public repository button or speak its exact name. After four seconds of silence, a unique repository matching the Jira project name is selected automatically. Manual interaction cancels that fallback.
4. Imports replace the browser workspace. Remove files clears that workspace without deleting anything in GitHub.
5. Jarvis scans the supported imported files and inspects the repository's website URL from GitHub About. It proposes only supported, unambiguous HTML/CSS changes. Say Do it or Finish the task to authorize execution.
6. The workflow previews the edit, publishes a commit and waits up to 90 seconds for GitHub Pages to serve the changed file contents. It then captures the published website. A deployment timeout stops the workflow before Jira is updated; the completed GitHub commit remains.
7. The same screenshot goes to Jira and the downloadable mail draft. Jarvis automatically requests the default mail app with recipient, subject and plain-text body, then continues to Teams and timesheet steps without waiting. Browser protocol confirmation may still be required. Mailto cannot attach the screenshot; the message points to the Jira attachment. Save Mail downloads an attachment-bearing draft. Teams is a draft preview only.

## Current boundaries

- Published-site inspection/capture runs only on the local Vite server using installed Microsoft Edge through Playwright. Production requires a separate capture worker.
- Website URL must be HTTPS on the repository owner's github.io host and repository path, for example https://prahalad-s.github.io/AcueLink/.
- The deterministic planner supports existing simple heading/theme/background commands plus the specific left-panel/sign-in-button background and JOB DESK black-text task. Ambiguous elements, additional instructions or build-based projects are refused. This is source and website inspection, not general AI understanding of arbitrary projects.
- GitHub credentials remain in Supabase. The configured account owner can access its additional public repositories only if the token permits them. A fine-grained token must include the chosen repository and Contents read/write permission. No credentials are bundled into the browser.
- Jira requires permission to read the assigned issue, add comments, create attachments and perform the In Testing transition. A screenshot upload or verification failure stops subsequent steps.
- Stop cancels pending work; it does not undo completed commits, Jira updates or timesheet saves.
- Timesheets use elapsed workflow time rounded up to a whole minute, explicitly labelled automated workflow time.

Updated Supabase functions: github-editor and jira, project pyjmujnwtxdgwqowiezp. No database migration is required for these import/capture changes.

GitHub verification opens the repository homepage; the exact commit URL remains in Jira and email as a reference. Editor scrolling stays enabled while file mutations are locked.

## Web handoffs and visible calendar entry

Outlook uses its web compose link and Teams uses its chat draft link. Both have five-second countdowns. Sign in to Outlook Web first; the Teams link can offer desktop or web according to browser settings. Allow pop-ups for the local portal. If blocked, the timeline provides the draft link and explains the issue. Draft handoff is not proof of delivery and no approval-bypass or sent status is fabricated.

The draft URLs contain recipient and message text, but cannot upload images. The same screenshot remains in Jira; the message includes the Jira attachment reference. Save Mail retains an attachment-bearing downloadable draft.

Calendar automation displays the real calendar inside the editor workflow, keeping the runner mounted. A visible cursor visits Calendar, today's day cell, Add work or leave, project, description, hours and Save. It fills the actual entry form, then saves once through the existing authenticated RPC. The workflow returns to the editor and displays Done after save confirmation. Music loops continuously through these steps and stops on completion, cancellation or failure.
