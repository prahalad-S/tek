import { useEditorTaskWorkflow, WorkflowTimeline, WorkflowMail } from "./EditorTaskWorkflow";
import { takeJiraWorkflow, pendingJiraProject } from "../lib/jiraWorkflowContext";
import type { JiraAssignedIssue } from "../lib/jiraActions";
import { captureJiraPreview } from "../lib/jiraPreviewCapture";
import Teams from "./Teams";
import Calendar from "./Calendar";
import { rememberJarvisAction } from "../lib/jarvisUndo";
import { useEffect, useRef, useState } from "react";
import {
  Github,
  Code2,
  Play,
  Save,
  Download,
  Upload,
  FileCode2,
  Monitor,
  Smartphone,
} from "lucide-react";
import JSZip from "jszip";
import EditorWorker from "./EditorWorker";
import EditorVoiceTask from "./EditorVoiceTask";
import type { VoiceTaskResult } from "./EditorVoiceTask";
import {
  parseJarvisInstruction,
  planJarvisInstruction,
} from "../lib/jarvisInstructions";
import EditorGitHubPush from "./EditorGitHubPush";
import { githubRequest, validGitHubWorkspace } from "../lib/githubConnection";
import type {
  GitHubConnection,
  GitHubWorkspace,
} from "../lib/githubConnection";
import EditorJarvis from "./EditorJarvis";
import { useAuth } from "../app/providers";

import { Modal } from "../components/ui";
import {
  githubGet,
  importRepository,
  isAsset,
  parseRepository,
  previewDocument,
  supportedPath,
} from "../lib/editorGithub";
import type { WorkspaceFiles, Repository, Branch } from "../lib/editorGithub";
type Files = WorkspaceFiles;
const starter: Files = {
  "index.html":
    '<main class="welcome">\n  <span class="label">YOUR NEXT IDEA</span>\n  <h1>Make something beautiful.</h1>\n  <p>Edit your files, then run the preview.</p>\n  <button id="hello">Say hello</button>\n</main>',
  "style.css":
    "* { box-sizing: border-box; }\nbody { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f5fa; color: #20243b; font-family: system-ui, sans-serif; }\n.welcome { padding: 48px; max-width: 600px; }\n.label { font-size: 11px; letter-spacing: .18em; color: #7660bd; }\nh1 { font-size: 44px; letter-spacing: -2px; line-height: 1.1; }\np { color: #73788c; }\nbutton { padding: 12px 22px; border: 0; border-radius: 10px; background: #7660bd; color: white; cursor: pointer; }",
  "script.js":
    'document.getElementById("hello")?.addEventListener("click", () => {\n  document.querySelector("h1").textContent = "Hello, creator!";\n});',
};

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function Editor() {
  const { profile, preview } = useAuth();
  const storageKey = `tek-editor:${preview ? "preview" : profile?.id}`;
  const [files, setFiles] = useState<Files>(starter);
  const captureFrame = useRef<HTMLIFrameElement | null>(null);
  const [workflowPreview, setWorkflowPreview] = useState(false);
  const [importedTask, setImportedTask] = useState<{ workspace: GitHubWorkspace; issue: JiraAssignedIssue } | null>(null);
  const [selected, setSelected] = useState<keyof Files>("index.html");
  const names = Object.keys(files).sort();
  const [entry, setEntry] = useState("index.html");
  const [project, setProject] = useState("Untitled project");
  const [githubOpen, setGithubOpen] = useState(false);
  const autoImport = useRef(false);
  const voiceImport = useRef(false);
  const editorMounted = useRef(true);
  useEffect(() => { editorMounted.current = true; return () => { editorMounted.current = false; }; }, []);
  useEffect(() => {
    const command = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail === "open") { setGithubOpen(true); void checkConnection(); }
      if (detail === "find" && githubOpen && !busy && repoInput.trim()) { autoImport.current = true; voiceImport.current = true; void loadRepository(); }
      if (detail && typeof detail === "object" && typeof detail.repositoryName === "string" && githubOpen && !busy) {
        const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
        const matches = publicRepos.filter(repo => normalize(repo.name) === normalize(detail.repositoryName));
        if (matches.length === 1) { setRepoInput(matches[0].full_name); autoImport.current = true; voiceImport.current = true; void loadRepository(matches[0].full_name); }
      }
      if (detail === "cancel") { autoImport.current = false; controller.current?.abort(); setBusy(false); }
    };
    window.addEventListener("jarvis-github", command);
    return () => window.removeEventListener("jarvis-github", command);
  });

  const [voiceActive, setVoiceActive] = useState(false);
  const [manualPublishBusy, setManualPublishBusy] = useState(false);
  const taskLock = useRef(false);
  const [connection, setConnection] = useState<GitHubConnection | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [githubWorkspace, setGithubWorkspace] =
    useState<GitHubWorkspace | null>(null);
  const [repoInput, setRepoInput] = useState("");
  const [publicRepos, setPublicRepos] = useState<{ name: string; full_name: string }[]>([]);
  const [repository, setRepository] = useState<Repository | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branch, setBranch] = useState("");
  const [busy, setBusy] = useState(false);
  const [githubError, setGithubError] = useState("");
  const [progress, setProgress] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!autoImport.current || !repository || busy || !githubOpen) return;
    document.querySelector(".editor-github-options")?.scrollIntoView({ block: "end", behavior: "smooth" });
    autoImport.current = false;
    void importGithub();
  }, [repository, busy, githubOpen]);
  useEffect(() => {
    if (!githubOpen || busy || repository || !publicRepos.length) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
        const projectName = pendingJiraProject();
        const matches = publicRepos.filter(repo => normalize(repo.name) === normalize(projectName));
        if (projectName && matches.length === 1) {
          setRepoInput(matches[0].full_name); autoImport.current = true; voiceImport.current = true;
          void loadRepository(matches[0].full_name);
        }
      }, 4000);
    };
    const speaking = () => clearTimeout(timer);
    const modal = document.querySelector(".github-import-modal");
    modal?.addEventListener("pointerdown", speaking); modal?.addEventListener("keydown", speaking);
    schedule(); window.addEventListener("jarvis-user-speaking", speaking);
    window.addEventListener("jarvis-user-idle", schedule);
    return () => { clearTimeout(timer); modal?.removeEventListener("pointerdown", speaking); modal?.removeEventListener("keydown", speaking); window.removeEventListener("jarvis-user-speaking", speaking); window.removeEventListener("jarvis-user-idle", schedule); };
  }, [githubOpen, busy, repository, publicRepos]);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState(
    "Your workspace stays in this browser. Export a copy to keep it.",
  );
  const [documentHtml, setDocumentHtml] = useState("");
  const [narrow, setNarrow] = useState(false);
  const previewUrls = useRef<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setGithubWorkspace(null);
    setConnection(null);
    setConnectionError("");
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const value = JSON.parse(raw);
        const restored = value.files ?? value;
        if (
          restored &&
          typeof restored === "object" &&
                    Object.keys(restored).every(
            (name) => supportedPath(name) && typeof restored[name] === "string",
          )
        ) {
          setFiles(restored);
          setSelected(Object.keys(restored)[0] || "");
          setEntry(
            value.entry ??
              Object.keys(restored).find((name) => /\.html?$/i.test(name)) ??
              "",
          );
          setProject(value.project ?? "Untitled project");
          if (validGitHubWorkspace(value.githubWorkspace))
            setGithubWorkspace(value.githubWorkspace);
          setSaved(true);
        }
      }
    } catch {
      setNotice(
        "Browser storage is unavailable. Use Export to keep your work.",
      );
    }
    return () => {
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
      controller.current?.abort();
    };
  }, [storageKey]);
  function run() {
    if (!entry || !(entry in files)) {
      setNotice("Choose an HTML entry file first.");
      return;
    }
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    try {
      const result = previewDocument(files, entry);
      previewUrls.current = result.urls;
      setDocumentHtml(result.html);
      setNotice(
        "Preview refreshed. External scripts, network requests and module imports are blocked; approved preview images can load.",
      );
    } catch {
      setNotice("Could not create the preview. Check your HTML file.");
    }
  }
  function save() {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ files, entry, project, githubWorkspace }),
      );
      setSaved(true);
      setNotice("Saved in this browser for your portal account.");
    } catch {
      setNotice(
        "Could not save in this browser. Export your workspace instead.",
      );
    }
  }
  async function exportFiles() {
    try {
      const zip = new JSZip();
      names.forEach((name) =>
        isAsset(name)
          ? zip.file(name, files[name].split(",")[1], { base64: true })
          : zip.file(name, files[name]),
      );
      download(
        await zip.generateAsync({ type: "blob" }),
        "jarvis-workspace.zip",
      );
      setNotice("Workspace exported.");
    } catch {
      setNotice("Export failed. Please try again.");
    }
  }
  async function importFiles(list: FileList | null) {
    if (!list) return;
    const next = { ...files };
    let count = 0;
    for (const file of Array.from(list)) {
      if (!supportedPath(file.name)) continue;
      if (file.size > 1024 * 1024) {
        setNotice("Each file must be under 1 MB.");
        return;
      }
      if (isAsset(file.name)) {
        next[file.name] = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      } else next[file.name] = await file.text();
      count++;
    }
    if (count) {
      setFiles(next);
      setSaved(false);
      setNotice(`Imported ${count} file(s). Run preview to see your changes.`);
      window.dispatchEvent(new Event("jarvis-files-imported"));
    } else
      setNotice("Choose HTML, CSS, JavaScript, text or image files to import.");
    if (input.current) input.current.value = "";
  }
  function closeGithub() {
    autoImport.current = false;
    controller.current?.abort();
    setBusy(false);
    setGithubOpen(false);
  }
  async function checkConnection() {
    setCheckingConnection(true);
    setConnectionError("");
    try {
      if (preview)
        throw new Error(
          "Sign into your live portal account to connect GitHub. Preview mode cannot use repository credentials.",
        );
      const result = await githubRequest<GitHubConnection>({
        action: "status",
      });
      setConnection(result);
      const owner = result.repository.split("/")[0];
      if (/^[\w-]+$/.test(owner)) {
        try {
        const list: { name: string; full_name: string }[] = [];
        for (let page = 1; page <= 20; page++) {
          const response = await fetch(`https://api.github.com/users/${encodeURIComponent(owner)}/repos?type=owner&per_page=100&page=${page}`);
          if (!response.ok) throw new Error("GitHub repository list is unavailable. Enter the repository URL below.");
          const batch = await response.json() as { name: string; full_name: string; private: boolean }[];
          list.push(...batch.filter(repo => !repo.private));
          if (batch.length < 100) break;
        }
        if (editorMounted.current) setPublicRepos(list.sort((a,b) => a.name.localeCompare(b.name)));
        } catch { setGithubError("Public repository choices could not be loaded. Enter the repository URL below."); }
      }

      if (result.repository)
        setRepoInput(
          (current) => current || `https://github.com/${result.repository}`,
        );
    } catch (error) {
      setConnection(null);
      setConnectionError(
        error instanceof Error
          ? error.message
          : "Could not check the GitHub connection.",
      );
    } finally {
      setCheckingConnection(false);
    }
  }
  async function loadRepository(selectedRepository = repoInput) {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setGithubError("");
    setProgress("Finding repository and branches…");
    setRepository(null);
    try {
      const repo = parseRepository(selectedRepository);
      if (
        connection?.ready &&
        connection.repository.split("/")[0].toLowerCase() === repo.split("/")[0].toLowerCase()
      ) {
        const result = await githubRequest<{
          repository: Repository;
          branches: Branch[];
        }>({ action: "repository", repository: repo });
        if (request.signal.aborted) return;
        setRepository(result.repository);
        setBranches(result.branches);
        setBranch(result.repository.default_branch);
      } else {
        const info = await githubGet<Repository>(repo, request.signal);
        const options = await githubGet<Branch[]>(
          `${repo}/branches?per_page=100`,
          request.signal,
        );
        if (request.signal.aborted) return;
        setRepository(info);
        setBranches(options);
        setBranch(info.default_branch);
      }
      setProgress("");
    } catch (error) {
      autoImport.current = false;
      if (voiceImport.current && !request.signal.aborted) { voiceImport.current = false; window.dispatchEvent(new CustomEvent("jarvis-github-result", { detail: error instanceof Error ? error.message : "GitHub import failed." })); }
      if (!request.signal.aborted)
        setGithubError(
          error instanceof Error ? error.message : "Could not reach GitHub.",
        );
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }
  async function importGithub() {
    if (!repository || !branch) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setGithubError("");
    setProgress("Importing repository files…");
    try {
      const secure =
        connection?.ready &&
        connection.repository.split("/")[0].toLowerCase() ===
          repository.full_name.split("/")[0].toLowerCase();
      const result = secure
        ? await githubRequest<GitHubWorkspace & { skipped: number }>({
            action: "import",
            repository: repository.full_name,
            branch,
          })
        : await importRepository(
            repository.full_name,
            branch,
            request.signal,
            setProgress,
          );
      if (request.signal.aborted) return;
      const html = Object.keys(result.files).filter((name) =>
        /\.html?$/i.test(name),
      );
      const first = html.includes("index.html")
        ? "index.html"
        : (html[0] ?? Object.keys(result.files)[0]);
      const previous = { files: { ...files }, selected, entry, project, githubWorkspace, documentHtml, saved };
      rememberJarvisAction("importing repository files", () => {
        if (!editorMounted.current) throw new Error("Return to the editor before undoing this import. The previous editor session is no longer active.");
        setFiles(previous.files); setSelected(previous.selected); setEntry(previous.entry);
        setProject(previous.project); setGithubWorkspace(previous.githubWorkspace);
        setDocumentHtml(previous.documentHtml); setSaved(previous.saved); setGithubOpen(true);
        setNotice("Restored the workspace from before the GitHub import.");
      });
      setFiles(result.files);
      setSelected(first);
      setEntry(html.includes("index.html") ? "index.html" : (html[0] ?? ""));
      setProject(`${repository.full_name} · ${branch}`);
      if (secure && "commitSha" in result) {
        setGithubWorkspace({
          repository: repository.full_name,
          branch,
          commitSha: result.commitSha,
          files: { ...result.files },
        });
      } else setGithubWorkspace(null);
      setSaved(false);
      setDocumentHtml("");
      setNotice(
        `Imported ${Object.keys(result.files).length} files from ${repository.full_name} (${branch}). ${result.skipped} unsupported files skipped. ${secure ? "Make your edits below, then use Push changes to update this branch." : "Public browser copy. Connect GitHub and import again to enable Push changes."}`,
      );
      setGithubOpen(false);
      window.dispatchEvent(new Event("jarvis-files-imported"));
      setProgress("");
      const ticket = takeJiraWorkflow();
      if (ticket && secure && "commitSha" in result) {
        setImportedTask({ workspace: { repository: repository.full_name, branch, files: { ...result.files }, commitSha: result.commitSha }, issue: ticket });
      }
      if (voiceImport.current) { voiceImport.current = false; if (!(ticket && secure)) window.dispatchEvent(new CustomEvent("jarvis-github-result", { detail: ticket ? "This is a public browser copy. Connect GitHub securely to finish this issue." : "Repository files imported. Tell me the specific HTML or CSS change you want to make." })); }
    } catch (error) {
      autoImport.current = false;
      if (voiceImport.current && !request.signal.aborted) { voiceImport.current = false; window.dispatchEvent(new CustomEvent("jarvis-github-result", { detail: error instanceof Error ? error.message : "GitHub import failed." })); }
      if (!request.signal.aborted)
        setGithubError(
          error instanceof Error
            ? error.message
            : "GitHub import failed. Your workspace is unchanged.",
        );
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }
  async function runVoiceTask(
    instruction: string,
    progress: (message: string) => void,
  ): Promise<VoiceTaskResult> {
    if (taskLock.current) throw new Error("Another task is already running.");
    if (!githubWorkspace || preview)
      throw new Error(
        "Import your project through the secure GitHub connection before running this command.",
      );
    if (busy || manualPublishBusy)
      throw new Error("Wait for the current GitHub operation to finish.");
    const intent = parseJarvisInstruction(instruction);
    progress(
      `Understood: ${intent.command}${intent.publish ? " · Commit and push" : " · Preview only"}`,
    );
    let plan = planJarvisInstruction(intent.command, files, selected);
    let updated = {
      ...files,
      ...Object.fromEntries(
        plan.changes.map((change) => [change.path, change.content]),
      ),
    };
    if (intent.publish) {
      const baselinePlan = planJarvisInstruction(
        intent.command,
        githubWorkspace.files,
        selected,
      );
      const expected = {
        ...githubWorkspace.files,
        ...Object.fromEntries(
          baselinePlan.changes.map((change) => [change.path, change.content]),
        ),
      };
      if (
        Object.entries(updated).some(
          ([path, content]) => expected[path] !== content,
        ) ||
        Object.keys(expected).some((path) => !(path in updated))
      ) {
        throw new Error(
          "The editor contains other unpushed changes outside this task. Push them with Push changes, or export them and import the latest branch first.",
        );
      }
    }
    taskLock.current = true;
    let stage = "Preparing task";
    try {
      let publishingWorkspace = githubWorkspace;
      if (intent.publish) {
        stage = "Reading the latest GitHub branch";
        progress(stage + "…");
        const fresh = await githubRequest<GitHubWorkspace>({
          action: "import",
          repository: githubWorkspace.repository,
          branch: githubWorkspace.branch,
        });
        // Reapply the supported recipe to fresh source, preserving other GitHub changes.
        plan = planJarvisInstruction(intent.command, fresh.files, selected);
        publishingWorkspace = fresh;
        updated = {
          ...fresh.files,
          ...Object.fromEntries(
            plan.changes.map((change) => [change.path, change.content]),
          ),
        };
      }
      stage = "Applying the requested change";
      progress(stage + "…");
      setFiles(updated);
      setSaved(false);
      setDocumentHtml("");
      try {
        const result = previewDocument(updated, entry);
        previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
        previewUrls.current = result.urls;
        setDocumentHtml(result.html);
      } catch {
        /* A preview failure must not discard the file change or stop publishing. */
      }
      if (!intent.publish) {
        const summary = `${plan.summary}. Preview only; GitHub was not updated.`;
        setNotice(summary);
        return { summary };
      }
      let commitSha = publishingWorkspace.commitSha;
      if (plan.changes.length) {
        stage = "Committing and pushing to GitHub";
        progress(
          `${stage}: ${publishingWorkspace.repository} · ${publishingWorkspace.branch}…`,
        );
        const pushed = await githubRequest<{ commitSha: string }>({
          action: "push",
          repository: publishingWorkspace.repository,
          branch: publishingWorkspace.branch,
          baseCommit: publishingWorkspace.commitSha,
          message: plan.summary,
          confirmed: true,
          changes: plan.changes.map(({ path, content }) => ({ path, content })),
        });
        if (!/^[a-f0-9]{40}$/i.test(pushed.commitSha))
          throw new Error(
            "Could not read the new commit. Check GitHub before retrying.",
          );
        commitSha = pushed.commitSha;
      }
      const next = { ...publishingWorkspace, commitSha, files: { ...updated } };
      setGithubWorkspace(next);
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            files: updated,
            entry,
            project,
            githubWorkspace: next,
          }),
        );
        setSaved(true);
      } catch {
        setSaved(false);
      }
      const summary = plan.changes.length
        ? `${plan.summary}. Committed and pushed to ${next.repository} · ${next.branch}. Commit ${commitSha.slice(0, 7)}.`
        : `The latest GitHub branch already has this change. No duplicate commit was needed. Commit ${commitSha.slice(0, 7)}.`;
      setNotice(summary);
      return {
        summary,
        commitSha,
        commitUrl: `https://github.com/${next.repository}/commit/${commitSha}`,
      };
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Task could not finish.";
      const message = `${stage} failed: ${detail} Your editor files are preserved.`;
      setNotice(message);
      throw new Error(message);
    } finally {
      taskLock.current = false;
    }
  }
  const flow = useEditorTaskWorkflow({
    historyKey: storageKey,
    apply: snapshot => {
      setFiles(snapshot.files); setGithubWorkspace(snapshot); setSaved(false);
      const first = Object.keys(snapshot.files).find(path => /\.html?$/i.test(path)) || "";
      if (first) setEntry(first);
      localStorage.setItem(storageKey, JSON.stringify({ files: snapshot.files, entry: first, project, githubWorkspace: snapshot }));
    },
    preview: async (snapshot, signal) => {
      const html = snapshot.files[entry] ? entry : Object.keys(snapshot.files).find(path => /\.html?$/i.test(path));
      if (!html) throw new Error("No HTML entry point. Use the companion or cloud worker.");
      setWorkflowPreview(true);
      return captureJiraPreview(snapshot.files, html, () => captureFrame.current, setDocumentHtml, signal);
    },
    hidePreview: () => { setWorkflowPreview(false); setDocumentHtml(""); },
  });
  useEffect(() => {
    if (!importedTask || busy || flow.active) return;
    const task = importedTask; setImportedTask(null);
    void flow.start(task.workspace, task.issue);
  }, [importedTask, busy]);
  return (<>
    {flow.calendarDraft && flow.approval && <section className="jarvis-calendar-approval" data-jarvis-approval={flow.approval.id} aria-label="Approve next action">
      <p>{flow.approval.question}</p>
      <button type="button" className="button" onClick={flow.approveStep}>Yes, proceed</button>
      <button type="button" className="button secondary" onClick={flow.stop}>Stop task</button>
    </section>}
    {flow.calendarDraft && flow.calendarSignal && <Calendar automation={{ draft: flow.calendarDraft, signal: flow.calendarSignal, onReady: flow.calendarReady, onCancel: flow.stop, saved: flow.calendarSaved }} />}
    <section className="editor-page" style={flow.calendarDraft ? {display:"none"} : undefined}>
      <header className="editor-heading">
        <div>
          <span className="eyebrow">BUILD WITH JARVIS</span>
          <h1>Your creative workspace</h1>
          <p>A little space for your next big idea.</p>
        </div>
        <span className="editor-badge">Browser workspace</span>
      </header>
      <div className="editor-toolbar" inert={voiceActive || flow.active}>
        <strong>
          <Code2 size={17} /> {project}
        </strong>
        <div>
          <button
            className="button secondary"
            onClick={() => input.current?.click()}
          >
            <Upload size={15} />
            Import
          </button>
          <button className="button secondary" disabled={!names.length || busy || manualPublishBusy} onClick={() => {
            window.dispatchEvent(new Event("jarvis-workflow-stop"));
            flow.clearHistory(); setImportedTask(null); setFiles({}); setGithubWorkspace(null); setSelected(""); setEntry(""); setDocumentHtml(""); setProject("Empty workspace"); setSaved(false);
            localStorage.setItem(storageKey, JSON.stringify({ files: {}, project: "Empty workspace", entry: "" }));
            setNotice("Current workspace files removed. Import files to begin.");
          }}>Remove files</button>
          <button
            className="button secondary"
            onClick={() => {
              setGithubOpen(true);
              void checkConnection();
            }}
          >
            <Github size={15} />
            GitHub
          </button>
          <input
            ref={input}
            type="file"
            multiple
            accept=".html,.htm,.css,.js,.mjs,.json,.md,.txt,.svg,.png,.jpg,.jpeg,.gif,.webp,.ico,.woff,.woff2,.ttf"
            hidden
            onChange={(event) =>
              void importFiles(event.target.files).catch(() =>
                setNotice("Could not read the selected files."),
              )
            }
          />
          <EditorGitHubPush
            files={files}
            workspace={githubWorkspace}
            disabled={voiceActive || flow.active}
            onBusyChange={setManualPublishBusy}
            onNotice={setNotice}
            onPushed={(snapshot) => {
              setGithubWorkspace(snapshot);
              setSaved(false);
            }}
          />
          <button className="button secondary" onClick={save}>
            <Save size={15} />
            Save
          </button>
          <button
            className="button secondary"
            onClick={() => void exportFiles()}
          >
            <Download size={15} />
            Export
          </button>
          <button className="button" onClick={run}>
            <Play size={15} />
            Run preview
          </button>
        </div>
      </div>
      <div className="editor-workspace" aria-busy={voiceActive || flow.active}>
        <aside className="editor-files">
          <span className="editor-section-label">FILES</span>
          {names.map((name) => (
            <button
              key={name}
              className={selected === name ? "is-active" : ""}
              disabled={voiceActive || flow.active}
              onClick={() => setSelected(name)}
            >
              <FileCode2 size={16} />
              <span title={name}>{name}</span>
            </button>
          ))}
          <p>{names.length} files · Browser copy</p>
        </aside>
        <div className="editor-code">
          {flow.mailVisible && flow.mail ? <WorkflowMail flow={flow} /> : flow.teams ? <Teams workflowDraft={flow.teams} /> : <>

          <div className="editor-pane-heading">
            <span>{selected}</span>
            <small>{saved ? "Saved" : "Unsaved changes"}</small>
          </div>
          {isAsset(selected) ? (
            <div className="editor-asset">
              {files[selected].startsWith("data:image/") ? (
                <img src={files[selected]} alt={selected} />
              ) : (
                <p>Binary asset · Included in exports</p>
              )}
            </div>
          ) : (
            <textarea
              aria-label={`Edit ${selected}`}
              spellCheck={false}
              readOnly={voiceActive || flow.active}
              value={files[selected] ?? ""}
              onChange={(event) => {
                setFiles({ ...files, [selected]: event.target.value });
                setSaved(false);
              }}
              onKeyDown={(event) => {
                if (voiceActive || flow.active) return;
                if (event.key === "Tab") {
                  event.preventDefault();
                  const area = event.currentTarget;
                  const start = area.selectionStart;
                  const end = area.selectionEnd;
                  setFiles({
                    ...files,
                    [selected]:
                      files[selected].slice(0, start) +
                      "  " +
                      files[selected].slice(end),
                  });
                  setSaved(false);
                  requestAnimationFrame(() => {
                    area.selectionStart = area.selectionEnd = start + 2;
                  });
                }
                if ((event.ctrlKey || event.metaKey) && event.key === "s") {
                  event.preventDefault();
                  save();
                }
              }}
            />
          )}
          </>}
        </div>
        <div className="editor-preview">
          <div className="editor-pane-heading">
            <label className="editor-entry">
              Preview{" "}
              <select
                aria-label="HTML entry file"
                disabled={voiceActive || flow.active}
                value={entry}
                onChange={(event) => setEntry(event.target.value)}
              >
                <option value="" disabled>
                  Choose HTML file
                </option>
                {names
                  .filter((name) => /\.html?$/i.test(name))
                  .map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
              </select>
            </label>
            <div>
              <button
                aria-label="Desktop preview"
                aria-pressed={!narrow}
                onClick={() => setNarrow(false)}
              >
                <Monitor size={16} />
              </button>
              <button
                aria-label="Mobile preview"
                aria-pressed={narrow}
                onClick={() => setNarrow(true)}
              >
                <Smartphone size={16} />
              </button>
            </div>
          </div>
          <div className="editor-preview-stage">
            {flow.rows.length > 0 && !workflowPreview ? <WorkflowTimeline flow={flow} /> : documentHtml ? (
              <iframe
                ref={captureFrame}
                title="Isolated project preview"
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
                srcDoc={documentHtml}
                className={narrow ? "is-mobile" : ""}
              />
            ) : (
              <div className="editor-preview-empty">
                <Monitor size={32} />
                <h3>See your idea take shape</h3>
                <p>Choose Run preview when you’re ready.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="editor-notice" role="status">
        {notice}
      </p>
      <Modal
        open={githubOpen}
        onClose={closeGithub}
        title="Import from GitHub"
        className="github-import-modal"
        onReopen={() => setGithubOpen(true)}
        description="Import files, make your changes with Jarvis, and push back to the same repository."
      >
        {publicRepos.length > 0 && <div className="editor-repository-choices" aria-label="Public repositories" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {publicRepos.map(repo => <button type="button" className="button secondary" key={repo.full_name} disabled={busy} onClick={() => { setRepoInput(`https://github.com/${repo.full_name}`); void loadRepository(repo.full_name); }}>{repo.name}</button>)}
        </div>}
        <div className="editor-github-connection">
          <div>
            <Github size={19} />
            <strong>
              {connection?.ready ? "GitHub connected" : "Connect GitHub"}
            </strong>
          </div>
          {connection?.ready ? (
            <p>
              {connection.repository} · Credentials stay securely on the server.
            </p>
          ) : (
            <>
              <p>
                {connectionError ||
                  connection?.message ||
                  "Check your secure GitHub connection to enable import and push."}
              </p>
              <details>
                <summary>One-time connection setup</summary>
                <ol>
                  <li>
                    <a
                      href="https://github.com/settings/personal-access-tokens/new?name=Jarvis%20Editor&target_name=prahalad-S&expires_in=30&contents=write"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Create a fine-grained GitHub token
                    </a>
                    . Choose resource owner <strong>prahalad-S</strong>,{" "}
                    <strong>
                      Only select repositories â†’ circular-animation
                    </strong>
                    , and <strong>Contents â†’ Read and write</strong>.
                  </li>
                  <li>
                    In{" "}
                    <a
                      href="https://supabase.com/dashboard/project/pyjmujnwtxdgwqowiezp/functions/secrets"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Supabase â†’ Edge Functions â†’ Secrets
                    </a>
                    , save the token as <code>GITHUB_EDITOR_TOKEN</code>. Do not
                    paste it into this editor.
                  </li>
                  <li>
                    Set <code>GITHUB_EDITOR_REPOSITORY</code> to{" "}
                    <code>prahalad-S/circular-animation</code> and{" "}
                    <code>GITHUB_EDITOR_OWNER_USER_ID</code> to your portal user
                    ID:{" "}
                    <code>
                      {profile?.user_id ?? "Sign into the live portal first"}
                    </code>
                    .
                  </li>
                  <li>
                    Click <strong>Check connection</strong>, then find and
                    import your repository below.
                  </li>
                </ol>
                {connection?.missing?.length ? (
                  <p>Still needed: {connection.missing.join(", ")}</p>
                ) : null}
              </details>
            </>
          )}
          <button
            className="button secondary"
            disabled={checkingConnection || busy}
            onClick={() => void checkConnection()}
          >
            {checkingConnection ? "Checking…" : "Check connection"}
          </button>
        </div>
        <form
          className="editor-github-form"
          onSubmit={(event) => {
            event.preventDefault();
            void loadRepository();
          }}
        >
          <label>
            Repository URL or owner/repository
            <input
              value={repoInput}
              disabled={busy}
              placeholder="https://github.com/owner/project"
              onChange={(event) => {
                setRepoInput(event.target.value);
                setRepository(null);
                        }}
            />
          </label>
          <button
            className="button secondary"
            disabled={busy || !repoInput.trim()}
          >
            {busy ? "Working…" : "Find repository"}
          </button>
        </form>
        {repository && (
          <div className="editor-github-options">
            <strong>{repository.full_name}</strong>
            <label>
              Branch
              <select
                disabled={busy}
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
              >
                {branches.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Or enter another branch
              <input
                disabled={busy}
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
              />
            </label>
            <button
              className="button"
              disabled={busy || !branch.trim()}
              onClick={() => void importGithub()}
            >
              Import files
            </button>
          </div>
        )}
        {progress && busy && <p role="status">{progress}</p>}
        {githubError && (
          <p className="editor-github-error" role="alert">
            {githubError}
          </p>
        )}
        <p className="editor-github-note">
          Up to 40 web files, 1 MB per file and 4 MB total. Hidden files and
          build folders are excluded. Your connected repository supports import
          and push. Other public repositories can be imported as browser copies.
        </p>
      </Modal>
      <details className="editor-advanced" inert={voiceActive || flow.active}>
        <summary>Advanced tools · Local companion and cloud execution</summary>
        <EditorWorker
          files={files}
          onImportGitHub={() => { setGithubOpen(true); void checkConnection(); }}
          onImportLocal={() => input.current?.click()}
          onLoad={(loaded, title) => {
            setGithubWorkspace(null);
            setFiles(loaded);
            setSelected(Object.keys(loaded)[0] ?? "");
            setEntry(
              Object.keys(loaded).find((name) => /\.html?$/i.test(name)) ?? "",
            );
            setProject(title);
            setSaved(false);
            setDocumentHtml("");
          }}
        />
      </details>
      <EditorVoiceTask
        workspace={githubWorkspace}
        disabled={busy || manualPublishBusy || preview || flow.active}
        onRun={runVoiceTask}
        onBusyChange={setVoiceActive}
      />
      <div inert={voiceActive || flow.active}>
        <EditorJarvis
          files={files}
          onApply={(updated) => {
            setFiles(updated);
            setSaved(false);
            setDocumentHtml("");
          }}
        />
      </div>
    </section></>
  );
}
