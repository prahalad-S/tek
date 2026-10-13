import { useState } from "react";
import { Github, UploadCloud } from "lucide-react";
import { Modal } from "../components/ui";
import { isAsset } from "../lib/editorGithub";
import type { WorkspaceFiles } from "../lib/editorGithub";
import { githubRequest } from "../lib/githubConnection";
import type { GitHubWorkspace } from "../lib/githubConnection";
export default function EditorGitHubPush({
  files,
  workspace,
  onPushed,
  onNotice,
  disabled = false,
  onBusyChange,
}: {
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  files: WorkspaceFiles;
  workspace: GitHubWorkspace | null;
  onPushed: (workspace: GitHubWorkspace) => void;
  onNotice: (message: string) => void;
}) {
  const [review, setReview] = useState<{
    changes: { path: string; content: string }[];
    workspace: GitHubWorkspace;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [commitUrl, setCommitUrl] = useState("");
  const changes = workspace
    ? Object.entries(files)
        .filter(([path, content]) => workspace.files[path] !== content)
        .map(([path, content]) => ({ path, content }))
    : [];
  function open() {
    if (disabled || !workspace || !changes.length) return;
    setReview({ workspace, changes });
    setError("");
    setCommitUrl("");
    setMessage("Update website with Jarvis");
  }
  async function push() {
    if (disabled || !review || busy || !message.trim()) return;
    // The review captures exact contents; edits during the request stay pending after a successful push.
    if (
      workspace?.commitSha !== review.workspace.commitSha ||
      workspace?.repository !== review.workspace.repository ||
      workspace?.branch !== review.workspace.branch ||
      changes.length !== review.changes.length ||
      review.changes.some((change) => files[change.path] !== change.content)
    ) {
      setError(
        "Your workspace changed while this review was open. Close this dialog and review the latest files again.",
      );
      return;
    }
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      const result = await githubRequest<{ commitSha: string; url: string }>({
        action: "push",
        repository: review.workspace.repository,
        branch: review.workspace.branch,
        baseCommit: review.workspace.commitSha,
        message: message.trim(),
        changes: review.changes,
        confirmed: true,
      });
      const baseline = { ...review.workspace.files };
      for (const change of review.changes)
        baseline[change.path] = change.content;
      onPushed({
        ...review.workspace,
        commitSha: result.commitSha,
        files: baseline,
      });
      onNotice(
        `Pushed ${review.changes.length} file(s) to ${review.workspace.repository} · ${review.workspace.branch}. Commit ${result.commitSha.slice(0, 7)}.`,
      );
      setCommitUrl(result.url);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Push failed. Your edits are preserved.",
      );
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  return (
    <>
      <button
        className="button secondary"
        onClick={open}
        disabled={disabled || !workspace || !changes.length || busy}
        title={
          workspace
            ? `Push to ${workspace.repository} · ${workspace.branch}`
            : "Import through the secure GitHub connection first"
        }
      >
        <UploadCloud size={15} /> Push changes
        {changes.length ? ` (${changes.length})` : ""}
      </button>
      <Modal
        open={!!review}
        onClose={() => {
          if (!busy) setReview(null);
        }}
        title={commitUrl ? "Changes pushed" : "Push changes to GitHub"}
        description="Review the destination and files. One click creates a commit on the imported branch."
        wide
      >
        {review && (
          <div className="editor-github-options">
            <div className="editor-github-destination">
              <Github size={18} />
              <div>
                <a
                  href={`https://github.com/${review.workspace.repository}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {review.workspace.repository}
                </a>
                <p>
                  Branch: <strong>{review.workspace.branch}</strong> ·{" "}
                  {review.changes.length} changed file(s)
                </p>
              </div>
            </div>
            {commitUrl ? (
              <>
                <p role="status">Your changes are now on GitHub.</p>
                <a
                  className="button"
                  href={commitUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  View commit on GitHub
                </a>
              </>
            ) : (
              <>
                {review.changes.map((change) => (
                  <details className="editor-github-review" key={change.path}>
                    <summary>
                      {change.path}
                      {!(change.path in review.workspace.files)
                        ? " · New file"
                        : ""}
                    </summary>
                    {isAsset(change.path) ? (
                      <p>Updated binary asset.</p>
                    ) : (
                      <div className="editor-change-review">
                        <div>
                          <small>Before</small>
                          <pre>
                            {review.workspace.files[change.path] ?? "New file"}
                          </pre>
                        </div>
                        <div>
                          <small>After</small>
                          <pre>{change.content}</pre>
                        </div>
                      </div>
                    )}
                  </details>
                ))}
                <label>
                  Commit message
                  <input
                    value={message}
                    maxLength={200}
                    disabled={busy}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Set page background to light blue"
                  />
                </label>
                <p>
                  This updates the branch shown above. If GitHub has newer
                  changes, the push will stop so you can import them first.
                </p>
                {error && (
                  <p className="editor-github-error" role="alert">
                    {error}
                  </p>
                )}
                <button
                  className="button"
                  disabled={busy || !message.trim()}
                  onClick={() => void push()}
                >
                  <UploadCloud size={15} />
                  {busy ? "Pushing…" : "Push to this repository"}
                </button>
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
