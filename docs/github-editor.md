# GitHub import → edit → push

This editor flow uses the deployed `github-editor` Supabase Edge Function. It does not use a cloud worker, local companion or OpenAI.

## One-time connection

Create a fine-grained personal access token at https://github.com/settings/personal-access-tokens/new.
- Resource owner: `prahalad-S`.
- Repository access: **Only select repositories → circular-animation**.
- Repository permissions: **Contents → Read and write**. Metadata read access is included by GitHub.
- Choose an expiration. Replace the secret when the token expires. No account or workflow permissions are needed.

In Supabase project `pyjmujnwtxdgwqowiezp`, open **Edge Functions → Secrets** and configure:

| Secret | Value |
| --- | --- |
| `GITHUB_EDITOR_TOKEN` | The new GitHub token; never paste it into chat or the dashboard editor |
| `GITHUB_EDITOR_REPOSITORY` | `prahalad-S/circular-animation` |
| `GITHUB_EDITOR_OWNER_USER_ID` | Your authenticated portal user UUID (shown in the GitHub setup dialog) |
| `APP_ORIGIN` | Preserve existing origins and include `http://127.0.0.1:5173`, `http://localhost:5173`, and your production dashboard origin if used |

The connection is restricted to this portal account and repository. It is intended for this user's own repository. Other employees do not receive access to the token. A multi-user integration needs a GitHub App and separate per-user authorization.

Deploy with `supabase functions deploy github-editor --project-ref pyjmujnwtxdgwqowiezp` after source updates. Supabase supplies its own URL and anonymous key; no database migration is required. Changing the secrets does not require rebuilding the Vite frontend. The GitHub token must never be a `VITE_*` variable or browser input.

## Everyday flow

1. Sign into the live portal and open **Editor → GitHub**.
2. Click **Check connection**. It should say **GitHub connected**.
3. Enter `https://github.com/prahalad-S/circular-animation`, find the repository, choose the branch (for example `main`), and click **Import files**.
4. Select `style.css` in Jarvis **Simple tasks**, choose **Set background to #e0f2fe**, review the proposal and apply it. Use **Run preview** to see the result.
5. Click **Push changes**, inspect the repository, branch and before/after contents, enter a commit message and confirm **Push to this repository**.
6. The server creates one commit and updates the imported branch. Use **View commit on GitHub** to open the result. Save the browser workspace if you want to restore its current baseline after a reload.

The direct GitHub push updates the branch selected during import; it does not impose a `jarvis/` branch. If branch rules require pull requests, choose an existing branch that permits direct writes. This flow does not create branches or bypass protection rules.

## Guarantees and limits

- Authenticated Supabase user validation, explicit owner check, repository allowlist, exact CORS origin checks and server-only credentials.
- Import loads one immutable commit. Up to 40 supported files, 1 MB per file and 4 MB decoded contents total.
- Push validates all file paths, rejects hidden/private files, symlinks and submodules, and preserves skipped repository files and existing executable modes.
- Changed and newly added supported files form a single commit. File deletion is not currently offered.
- An outdated branch fails before writing. A competing update during publication fails GitHub's non-force ref update. GitHub objects may exist without being published if a later operation fails.
- Failed operations preserve browser edits. Export them before reimporting. On an uncertain network result, check the GitHub branch before retrying.
- Connection status checks authentication and repository access. GitHub verifies the token's write permission and branch rules during push; no temporary file or commit is made just to check permissions.
- This connector does not execute imported code. GitHub may run any existing repository automation when a commit is pushed.

References: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens and https://docs.github.com/en/rest/git/refs.

Current setup: the backend is deployed, and the owner UUID and repository secrets have been configured from the existing local companion account. The user has since supplied the GitHub token and reported that the secure import/push flow works. Frontend TypeScript compilation and Deno function compilation passed; an authenticated import/push has not been exercised because the GitHub token is not yet configured.

## One voice command

After securely importing a clean branch, click **Speak to Jarvis**, allow microphone access and say:

> Change the background color to red and update the repo.

Jarvis recognizes the command, changes the single CSS file (or selected CSS file when there are several), refreshes the preview, creates a commit named `Set the page background to red`, pushes to the imported repository and branch, saves the workspace baseline, and navigates the result window to that exact commit. There is no second commit/push command or confirmation for this explicit publishing instruction.

The microphone stays focused on the portal while listening. When the push finishes, Jarvis attempts to open the commit in a new browser window/tab. Allow pop-ups for the portal to enable automatic opening; **View latest commit** is always available as a fallback. Typed commands can reserve a waiting window during the submit click. GitHub tokens stay server-side.

The same instruction can be entered in the **One-command task for Jarvis** field and submitted with **Run command**. Commands without `and update the repo` apply to the editor only. Supported commands include background colors (red, blue, green, black, white, yellow, orange, purple, pink, gray/grey, teal, navy, brown, cyan, magenta, light blue, dark blue, light gray/grey, transparent or hex), dark/light mode, changing a heading, and adding a heading.

Recognition runs only after clicking the microphone, stops after one command, and can be cancelled before a task starts. Unsupported commands do not edit or publish. Existing unpushed edits block automatic publishing so they are not accidentally included. A failed push preserves the new edit; use the existing manual push flow or export before reimporting. No automated retry, OpenAI call, cloud worker or local companion is used. Browser speech services may process microphone audio; browser support and service availability vary. The typed command is the fallback when voice recognition is unavailable.

References: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition and https://developer.mozilla.org/en-US/docs/Web/API/Window/open.

### Speech completion and retry handling

The listener collects continuous speech, displays the transcript, and automatically ends after a short silence. It processes captured text when recognition ends, even if the browser leaves it marked interim. **Finish command** can stop listening and run the captured command immediately; **Cancel** discards it. The microphone stays on the portal rather than opening a waiting window during listening. On completion the app attempts to open the GitHub commit; if the browser blocks this, use **View latest commit**, or allow pop-ups for the portal. Typed commands can still reserve a result window during the submit click.

Automatic publishing now compares the desired task result against the imported commit. A previously applied identical task, or a previous generated recipe replaced by the requested recipe, can finish publishing without a second edit. Unrelated pending edits still stop automatic publishing. The floating Jarvis button on the Editor page focuses the editor task panel; the timesheet assistant remains available on other pages.

### Automatic publishing default

Speak to Jarvis and Run command now commit and push every supported task by default, matching the requested one-command workflow. The phrase `and update the repo` is accepted but no longer required. Append `and preview only` or `and do not push` to explicitly keep an edit in the browser.

Before applying a publishing task, Jarvis reads the latest branch and reapplies the supported recipe to fresh source. It preserves other changes already on GitHub and avoids duplicate commits when the desired change is already there. It still refuses unrelated unpushed browser edits. If a concurrent update happens after this fresh read, the backend's non-force update stops the push. Failure feedback names the stage and includes the GitHub error; success names the repository, branch and commit.
