import { useRef, useState } from "react";
import {
  Monitor,
  Plug,
  Unplug,
  FolderOpen,
  GitBranch,
  UploadCloud,
} from "lucide-react";
import { useAuth } from "../app/providers";
import { client } from "../lib/supabase";
import { Modal } from "../components/ui";
import type { WorkspaceFiles } from "../lib/editorGithub";
type Snapshot = {
  files: WorkspaceFiles;
  hashes: Record<string, string>;
  project: string;
};
export default function EditorWorker({
  files,
  onLoad,
  onImportGitHub,
  onImportLocal,
}: {
  files: WorkspaceFiles;
  onImportGitHub: () => void;
  onImportLocal: () => void;
  onLoad: (files: WorkspaceFiles, project: string) => void;
}) {
  const { profile } = useAuth();
  const [mode, setMode] = useState<"local" | "cloud">("local");
  const [code, setCode] = useState("");
  const [connected, setConnected] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [project, setProject] = useState("");
  const [branch, setBranch] = useState("jarvis/my-task");
  const [message, setMessage] = useState("");
  const [review, setReview] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const baseline = useRef<Snapshot | null>(null);
  const changes = baseline.current
    ? Object.entries(files)
        .filter(([path, content]) => baseline.current!.files[path] !== content)
        .map(([path, content]) => ({
          path,
          content,
          expectedHash: baseline.current!.hashes[path] ?? null,
        }))
    : [];
  async function request(action: string, extra: Record<string, unknown> = {}) {
    const {
      data: { session },
    } = await client().auth.getSession();
    if (!session)
      throw new Error("Sign into the portal to pair your companion.");
    if (mode === "cloud") {
      const { data, error } = await client().functions.invoke("jarvis-editor", {
        body: { action: "cloud", request: { action, ...extra } },
      });
      if (error) {
        let detail =
          "Cloud worker is unavailable. Check its server configuration.";
        try {
          detail = (await error.context?.json())?.error ?? detail;
        } catch {}
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);
      return data;
    }
    const response = await fetch("http://127.0.0.1:4318/api", {
      method: "POST",
      signal: AbortSignal.timeout(145000),
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "X-Companion-Code": code,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Companion request failed.");
    return data;
  }
  async function operate(action: string) {
    if (busy) return;
    setBusy(true);
    try {
      if (action === "status") {
        const data = await request(action);
        setConnected(true);
        setProject(data.project);
        setStatus(
          data.gitStatus?.trim() || "Connected. Working tree is clean.",
        );
      } else if (action === "files") {
        const data: Snapshot = await request(action);
        baseline.current = data;
        onLoad(data.files, data.project);
        setStatus(
          `Loaded ${Object.keys(data.files).length} source files from ${data.project}.`,
        );
      } else if (action === "apply") {
        const data = await request(action, { changes });
        setStatus(data.message);
        const updated: Snapshot = await request("files");
        baseline.current = updated;
        onLoad(updated.files, updated.project);
      } else {
        const data = await request(action, {
          name: branch,
          message,
          confirmScript: action === "build",
        });
        setStatus(data.message || "Operation completed.");
      }
      setReview(null);
      setConfirmed(false);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not reach the companion. Start it and pair again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function disconnect() {
    setConnected(false);
    setCode("");
    baseline.current = null;
    setProject("");
    setStatus(
      "Disconnected from this browser. Stop the companion process to revoke the pairing session.",
    );
  }
  return (
    <section className="editor-worker">
      <label>
        Execution location{" "}
        <select
          value={mode}
          disabled={connected || busy}
          onChange={(event) => {
            setMode(event.target.value as "local" | "cloud");
            setCode("");
            setStatus("");
          }}
        >
          <option value="local">This computer</option>
          <option value="cloud">Cloud worker</option>
        </select>
      </label>
      <header>
        <div>
          <Monitor size={21} />
          <div>
            <h2>Project companion</h2>
            <p>
              {connected
                ? `Connected · ${project}`
                : "Connect your approved project"}
            </p>
          </div>
        </div>
        {connected && (
          <button
            className="button secondary"
            onClick={disconnect}
            disabled={busy}
          >
            <Unplug size={15} />
            Disconnect
          </button>
        )}
      </header>
      {!connected ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void operate("status");
          }}
        >
          <input
            type="password"
            autoComplete="off"
            aria-label="Companion pairing code"
            placeholder={
              mode === "cloud"
                ? "Cloud access uses your portal sign-in"
                : "Pairing code from your companion"
            }
            disabled={mode === "cloud" || busy}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button
            className="button secondary"
            disabled={busy || (mode === "local" && !code)}
          >
            <Plug size={15} />
            {busy
              ? "Connecting…"
              : mode === "cloud"
                ? "Connect cloud"
                : "Connect local"}
          </button>
        </form>
      ) : (
        <>
          <div className="editor-worker-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setLoadOpen(true)}
            >
              <FolderOpen size={15} />
              Load project
            </button>
            <button
              className="button secondary"
              disabled={busy || mode === "cloud"}
              onClick={() => void operate("open")}
            >
              Open VS Code
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void operate("status")}
            >
              Git status
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void operate("fetch")}
            >
              Fetch
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setReview("pull")}
            >
              Pull latest
            </button>
          </div>
          <div className="editor-worker-fields">
            <label>
              Working branch
              <input
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              />
            </label>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setReview("branch")}
            >
              <GitBranch size={15} />
              Create branch
            </button>
            <label>
              Commit message
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Changed UI to dark mode"
              />
            </label>
          </div>
          <div className="editor-worker-actions">
            <button
              className="button"
              disabled={busy || !changes.length}
              onClick={() => setReview("apply")}
            >
              Review {changes.length} file changes
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setReview("build")}
            >
              Run build
            </button>
            <button
              className="button secondary"
              disabled={busy || !message.trim()}
              onClick={() => setReview("commit")}
            >
              Commit reviewed files
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setReview("push")}
            >
              <UploadCloud size={15} />
              Push working branch
            </button>
          </div>
        </>
      )}
      {status && <pre role="status">{status}</pre>}
      <small>
        Portal user ID for companion setup:{" "}
        {profile?.user_id ?? "Sign into your live portal"}. Pairing code stays
        in memory. Only the configured project folder is accessible. Cloud
        hosting and AI connection still require setup.
      </small>
      <Modal open={loadOpen} onClose={() => setLoadOpen(false)} title="Load project" description="Choose where to import your project files from.">
        <div className="editor-worker-actions">
          <button type="button" className="button" onClick={() => {
            setLoadOpen(false); baseline.current = null;
            setStatus("GitHub import loads the browser editor. The companion remains connected to its configured local folder.");
            onImportGitHub();
          }}>Import from GitHub</button>
          <button type="button" className="button secondary" onClick={() => {
            setLoadOpen(false); baseline.current = null;
            setStatus("Local file import loads the browser editor. To edit files on disk with VS Code, load the connected folder below.");
            onImportLocal();
          }}>Import local files</button>
          <button type="button" className="button secondary" onClick={() => {
            setLoadOpen(false); setReview("files");
          }}>Load connected folder</button>
        </div>
        <p className="muted">GitHub and file imports replace the browser workspace. Load the connected folder to use companion file review, build and Git controls for that folder.</p>
      </Modal>
      <Modal
        open={review !== null}
        onClose={() => {
          if (!busy) {
            setReview(null);
            setConfirmed(false);
          }
        }}
        title="Review project action"
        description="Confirm the action and its effect before continuing."
      >
        {review === "files" && (
          <p>
            This replaces the editor workspace with source files from your
            approved project. Export browser edits you want to keep first.
          </p>
        )}
        {review === "apply" && (
          <>
            <p>
              These files will be written to your local project. If a file
              changed on disk since loading, the companion rejects the action.
            </p>
            {changes.map((change) => (
              <details key={change.path}>
                <summary>{change.path}</summary>
                <div className="editor-change-review">
                  <div>
                    <strong>Before</strong>
                    <pre>
                      {baseline.current?.files[change.path] ?? "New file"}
                    </pre>
                  </div>
                  <div>
                    <strong>After</strong>
                    <pre>{change.content}</pre>
                  </div>
                </div>
              </details>
            ))}
          </>
        )}
        {review === "build" && (
          <p>
            This runs your project's npm build script, including its prebuild
            and postbuild hooks. Review package.json first; project scripts
            execute code on this computer.
          </p>
        )}
        {review === "branch" && (
          <p>
            Create the branch <strong>{branch}</strong>. The working tree must
            be clean.
          </p>
        )}
        {review === "pull" && (
          <p>
            Fetch and fast-forward the current branch from its upstream.
            Existing uncommitted changes prevent this action.
          </p>
        )}
        {review === "commit" && (
          <p>
            Stage files applied by this session and commit with{" "}
            <strong>{message}</strong>. Other staged files prevent this action.
          </p>
        )}
        {review === "push" && (
          <p>
            Publish the reviewed commit to the GitHub origin on the current
            jarvis/ working branch. This sends those source changes to GitHub.
            Your existing Git sign-in is used.
          </p>
        )}
        <label className="editor-replace">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            disabled={busy}
          />
          I have reviewed this action and approve it.
        </label>
        <button
          className="button"
          disabled={!confirmed || busy}
          onClick={() => review && void operate(review)}
        >
          {busy ? "Working…" : "Confirm action"}
        </button>
      </Modal>
    </section>
  );
}
