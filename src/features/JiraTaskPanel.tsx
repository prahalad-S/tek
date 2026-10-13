import { completedTaskComment } from "../lib/jarvisTaskContext";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import EditorVoiceTask from "./EditorVoiceTask";
import { jiraRequest, parseJiraTask, jiraCanonicalCommand, type JiraAssignedIssue, type JiraUpdate } from "../lib/jiraActions";
export default function JiraTaskPanel() {
  const qc = useQueryClient();
  const [description, setDescription] = useState("");
  const [commentPreview, setCommentPreview] = useState("");
  const [needsDescription, setNeedsDescription] = useState(false);
  const pendingDescription = useRef<((value: string | null) => void) | null>(null);
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<JiraAssignedIssue[]>([]);
  const pending = useRef<((key: string | null) => void) | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; pending.current?.(null); pending.current = null; pendingDescription.current?.(null); pendingDescription.current = null; }; }, []);
  function choose(key: string | null) {
    const resolve = pending.current;
    pending.current = null;
    setChoices([]);
    resolve?.(key);
  }
  function supplyDescription(value: string | null) {
    const resolve = pendingDescription.current;
    pendingDescription.current = null;
    setNeedsDescription(false);
    resolve?.(value);
  }
  return <>
    <label>Task description (optional)
      <textarea className="input" rows={2} maxLength={3000} disabled={busy && !needsDescription} value={description} onChange={event => setDescription(event.target.value)} placeholder="Leave blank to use the last task Jarvis completed in this browser session. Otherwise describe the work completed." />
    </label>
    {needsDescription && <section className="action-preview" role="status">
      <h3>Your command was recognized</h3>
      <p>Jarvis has no recent completed task to describe. Enter the comment text above, then continue. Your original command is waiting.</p>
      <div className="form-actions">
        <button type="button" className="button" disabled={!description.trim()} onClick={() => supplyDescription(description.trim())}>Add comment and move to In Testing</button>
        <button type="button" className="button secondary" onClick={() => supplyDescription(null)}>Cancel</button>
      </div>
    </section>}
    {commentPreview && <p className="jira-list-note">Comment: {commentPreview}</p>}

    <EditorVoiceTask kind="jira" workspace={null} disabled={false} onBusyChange={setBusy} onRun={async (instruction, progress) => {
      const task = parseJiraTask(instruction);
      setCommentPreview("");
      progress("Command recognized. Preparing the task comment…");
      let comment = task.automaticComment ? description.trim() || await completedTaskComment() : "the issue has been fixed";
      if (!mounted.current) throw new Error("Jira action cancelled.");
      if (!comment) {
        progress("Command recognized. Enter a task description above to continue this command.");
        comment = await new Promise<string | null>(resolve => {
          pendingDescription.current = resolve;
          setNeedsDescription(true);
        });
      }
      if (!comment) throw new Error("Jira action cancelled. No comment or status update was submitted.");
      if (!mounted.current) throw new Error("Jira action cancelled.");
      setCommentPreview(comment);

      progress(task.matchedStoredPhrase ? `Recognized fallback phrase: ${task.automaticComment ? "Add the completed-task comment and move to In Testing" : jiraCanonicalCommand}. Syncing your assigned issues…` : "Syncing your assigned Jira issues…");
      const sync = await jiraRequest<{ issues: JiraAssignedIssue[] }>({ action: "list" });
      if (!mounted.current) throw new Error("Jira action cancelled.");
      if (!sync.issues.length) throw new Error("No issues are assigned to you. No Jira update was submitted.");
      let key: string | null = task.issueKey;
      if (key && !sync.issues.some(issue => issue.key === key)) throw new Error(`${key} is not in your assigned issues. No update was submitted.`);
      if (!key && sync.issues.length === 1) key = sync.issues[0].key;
      if (!key) {
        progress("Choose the Jira issue to update below.");
        key = await new Promise<string | null>(resolve => { pending.current = resolve; setChoices(sync.issues); });
      }
      if (!key || !mounted.current) throw new Error("Jira action cancelled. No update was submitted.");
      progress(`${key}: checking the workflow, then adding the comment and moving to In Testing…`);
      try {
        const result = await jiraRequest<JiraUpdate>({ action: "update-ticket", issueKey: key, comment, confirmed: true });
        return { summary: result.summary, actionUrl: result.url };
      } finally {
        void qc.invalidateQueries({ queryKey: ["jira-assigned-issues"] });
      }
    }} />
    {choices.length > 0 && <section className="action-preview" aria-label="Choose a Jira issue">
      <h3>Which issue should Jarvis update?</h3>
      <p>Add the displayed task comment and move the selected ticket to In Testing.</p>
      <div className="jira-issue-list">{choices.map(issue => <button type="button" className="button secondary" key={issue.key} onClick={() => choose(issue.key)} style={{ whiteSpace: "normal", textAlign: "left", justifyContent: "flex-start" }}>
        <strong>{issue.key}</strong> {issue.summary} · {issue.status}
      </button>)}</div>
      <button type="button" className="button secondary" onClick={() => choose(null)}>Cancel update</button>
    </section>}
  </>;
}
