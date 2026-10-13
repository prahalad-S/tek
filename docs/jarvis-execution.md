# Jarvis execution setup

## Implemented in this revision

- Local Node companion, bound to 127.0.0.1:4318.
- Owner-only Supabase session validation and an expiring random pairing code.
- One configured project directory; hidden files, credential paths, symlinks and private migration folders are excluded.
- Editor source loading, file review and writes with SHA-256 conflict checks.
- Open the approved project in Antigravity, Git status/fetch/fast-forward pull, create a jarvis/ branch, npm build, commit and push reviewed files.
- Container-ready single-owner execution worker, using the same restricted actions.

The authenticated jarvis-editor Edge Function now provides selected-file AI edit proposals and an owner-only cloud-worker proxy. Source-transfer permission was granted by the user. The editor still asks for consent for each selected-file request. No AI keys or worker secrets are collected in the dashboard.

## Start the local companion

Prerequisites: Node 22+, Git and Antigravity. Sign into GitHub through your normal Git credential manager. Do not put GitHub tokens into repository URLs.

1. Copy `tools/jarvis/.env.example` to `tools/jarvis/.env.local`.
2. Set `JARVIS_PROJECT_ROOT` to your chosen repository folder (for example `F:\symportal`).
3. Set `JARVIS_OWNER_USER_ID` to your portal user's UUID from Supabase Dashboard → Authentication → Users. Use the user ID, not an email address or employee record ID.
4. Set `SUPABASE_ANON_KEY` to your existing Supabase public/publishable key. Never use a service-role key.
5. Keep `SUPABASE_URL` pointed at the portal's Supabase project.
6. Set `JARVIS_NPM_CLI` to the absolute path to npm-cli.js. For a standard Windows Node installation this is usually `C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js`. Confirm it exists on your computer.
7. From the repository terminal, run `npm run jarvis:companion`.
8. Open the pairing JSON file at `%USERPROFILE%\.tek-jarvis\pairing.json`. Enter its `code` in Editor → Project companion. The code remains in browser memory and expires after 8 hours. Restart the companion to revoke the old code.

The env file is gitignored. The pairing file lives outside the repository. Configure the project folder locally; browser requests cannot select arbitrary folders.

## Local workflow

1. Connect, inspect Git status, then Fetch/Pull if the working tree is clean.
2. Create a branch such as `jarvis/dark-mode` before editing.
3. Load project (export any browser edits first).
4. Edit files and review the Before/After contents.
5. Confirm applying the reviewed files. Changes made separately in Antigravity since loading will cause a conflict; reload and reconcile them.
6. Run build only after reviewing package.json scripts. These scripts are project code and execute on your computer. API/worker secrets are excluded from the build environment.
7. Commit reviewed files with a descriptive message, then separately approve Push working branch.

Git publishing uses the existing Git authentication on the computer. It does not configure your GitHub account, force-push, merge, or publish from main/master. Other staged files prevent a commit; remaining uncommitted changes prevent a push. A failed commit may leave the reviewed files staged; inspect Git status and reconcile that state outside Jarvis before retrying.

## Cloud worker deployment preparation

Build the image from the repository root:

    docker build -f tools/jarvis/Dockerfile -t tek-jarvis-worker .

The build context excludes repository files and secrets; only the worker source enters the image. Each worker supports ONE owner and ONE mounted repository. This is not a shared multi-employee service.

On a Docker-compatible host, mount a dedicated repository at `/workspace` and set:

- `JARVIS_OWNER_USER_ID`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (public key)
- `JARVIS_WORKER_SECRET` (random value, at least 32 characters)

Terminate HTTPS at the host/reverse proxy. Keep port 4318 private to the proxy/backend. Never disable authentication or expose a Docker socket. Use a dedicated, disposable container and least-privileged GitHub credentials. Install project dependencies inside that container after inspecting the project. Run as the non-root user included in the Dockerfile. A worker needs a writable repository volume owned by that user.

The backend proxy validates the portal session and forward the worker secret only server-to-server. The browser must not receive the worker secret. Deploy jarvis-editor and configure its server-side secrets, then choose Cloud worker in the editor. The proxy validates the portal user and matches JARVIS_OWNER_USER_ID before forwarding an operation.

## Current limits

- Source snapshots support up to 200 files / 1 MB; files over 150 KB are skipped. Hidden files, binary assets and certain generated/private folders are excluded. Use a smaller approved repository if it exceeds these limits.
- Up to 20 reviewed source files per apply action. No deletion endpoint or arbitrary terminal command endpoint.
- Browser preview handles standalone HTML/CSS/JS. TSX/React projects can be edited through the companion and built there; the editor preview does not run npm development servers.
- Screenshots, autonomous coding loops, private GitHub repository importing, Jira updates, Outlook email are not implemented by this worker revision. AI file proposals are implemented separately by the authenticated backend.
- Frontend TypeScript compilation passed. Live AI, permission/pairing, Antigravity and Git operations have not been exercised in this environment. The jarvis-editor Edge Function was deployed to the existing Supabase project. No cloud worker deployment, Git commit or push was performed.
## Enable AI proposals

In Supabase → Edge Functions → Secrets, configure:

- `OPENAI_API_KEY`: an OpenAI Platform project API key with API billing enabled. Do not put this in a VITE variable, paste it into chat, or use your Jira token here.
- `OPENAI_MODEL`: the exact Responses API model ID available to your OpenAI project and supporting structured JSON output. No model is silently selected by the code.
- `APP_ORIGIN`: the existing exact portal origins, comma separated.

Deploy `jarvis-editor`. The backend reuses the existing `reserve_agent_request` database function for active-member access and daily limits; no new database migration is required if that existing function is already installed. Requests fail closed if it is missing.

In Editor → Jarvis, choose source files (up to 30 / 200 KB), enter your request and approve the specific transfer. The AI can propose edits ONLY to the selected paths. It receives the request and the selected file contents, not the whole folder. Review before/after content and apply the proposal to the browser editor. Applying a proposal does NOT write to disk, run a build or publish; use the companion's separate review controls for those actions.

## Enable cloud execution

After provisioning a Docker host and a dedicated, writable repository:

1. Use `tools/jarvis/compose.yaml`. Provide its environment variables from host-managed private configuration. Ensure the repository volume is owned by container user 1000.
2. Run the worker behind an HTTPS reverse proxy. The Compose file exposes its port only to the host loopback interface, drops Linux capabilities and sets CPU, memory and process limits. Keep one owner/repository per worker.
3. Configure Git authentication and identity on the dedicated worker; local computer credentials are not uploaded. The worker does not install dependencies automatically. Inspect dependencies and install them in the dedicated repository container before building.
4. In Supabase secrets, set `JARVIS_WORKER_URL` to the HTTPS worker origin, `JARVIS_WORKER_SECRET` to the same random worker secret as the container, and `JARVIS_OWNER_USER_ID` to the same owner UUID.
5. In Editor → Project companion, choose Cloud worker and Connect cloud. No pairing code is needed; the backend handles the worker secret.
6. Load project, edit or request a proposal, review changes and apply them to the cloud repository. Each source read/write is authenticated as the configured owner.

Cloud deployment needs your host choice and configured repository. This task does not provision a paid host, clone a private repository, upload credentials, or start a remote worker automatically.
## Try simple tasks without an OpenAI key

Editor → Jarvis defaults to Simple tasks / No API key. This is a deterministic recipe engine, not an AI model. It recognizes a small documented command set:

- Make the page dark
- Make the page light
- Set background to #e0f2fe (3- or 6-digit hex colors)
- Change the heading to Welcome (arbitrary plain text, first h1 only)

Choose exactly one relevant HTML or CSS file, prepare the task, inspect Before/After and apply it to the editor. Then run preview. Unsupported commands are rejected rather than guessed. All recipe processing stays in the browser. Writing to a local project, committing and pushing still uses the paired companion and separate approvals.

`examples/jarvis-simple/index.html` is the untouched demo input, with `style.css` beside it. `welcome.html` is the generated result from the requested heading task. The command was executed locally against that demo. The portal heading was not modified. TypeScript compilation and four focused recipe tests passed; the paired companion disk-write workflow remains unexercised until its owner ID is configured.
For an alternate Antigravity installation, set JARVIS_EDITOR_EXE to its absolute executable path in tools/jarvis/.env.local and restart the companion.

## Circular animation repository
The local companion is configured for F:\circular-animation, cloned from https://github.com/prahalad-S/circular-animation.git, on jarvis/ui-demo.
Start the companion, pair it in Editor, and choose Load project to establish the disk baseline. Use Simple tasks and Make the page dark with style.css selected, or Add heading Welcome with index.html selected (this project initially has no h1). Review and apply the proposal in Editor, then review and apply files to the companion. Commit and push the current working branch using the companion controls. Do not create the existing branch again.
This static project has no npm build script: use the editor preview instead of Run build. Its Freepik images are allowed in the preview; other external script and network access remains blocked.
