import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { simpleTask } from "../lib/simpleTasks";
import { client } from "../lib/supabase";
import type { WorkspaceFiles } from "../lib/editorGithub";
type Plan = {
  summary: string;
  changes: { path: string; content: string; reason: string }[];
};
const allowed = (path: string) =>
  !path
    .split("/")
    .some(
      (part) =>
        part.startsWith(".") ||
        [
          "private-backup",
          "private-migration",
          "node_modules",
          "dist",
          "build",
        ].includes(part),
    ) &&
  !/(^|\/)(secrets?|credentials)(\.|$)/i.test(path) &&
  /\.(html?|css|scss|js|jsx|ts|tsx|mjs|json|md|txt|svg)$/i.test(path);
export default function EditorJarvis({
  files,
  onApply,
}: {
  files: WorkspaceFiles;
  onApply: (files: WorkspaceFiles) => void;
}) {
  const [mode, setMode] = useState<"simple" | "ai">("simple");
  const [prompt, setPrompt] = useState("");
  const [selection, setSelection] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [proposal, setProposal] = useState<{
    plan: Plan;
    originals: WorkspaceFiles;
  } | null>(null);
  useEffect(() => {
    setConsent(false);
  }, [files]);
  const paths = Object.keys(files).filter(allowed).sort();
  const picked = selection.filter((path) => path in files && allowed(path));
  const size = picked.reduce(
    (sum, path) => sum + new TextEncoder().encode(files[path]).length,
    0,
  );
  async function ask() {
    if (busy || (mode === "ai" && !consent) || !prompt.trim() || !picked.length)
      return;
    setBusy(true);
    setNotice("");
    setProposal(null);
    const originals = Object.fromEntries(
      picked.map((path) => [path, files[path]]),
    );
    try {
      if (mode === "simple") {
        const plan = simpleTask(prompt, originals);
        setProposal({ plan, originals });
        setNotice(
          plan.changes.length
            ? "Predefined edit ready. No files were sent to OpenAI or a cloud worker."
            : "The selected file already matches this change.",
        );
        return;
      }
      const { data, error } = await client().functions.invoke("jarvis-editor", {
        body: {
          action: "propose",
          consent: true,
          message: prompt,
          files: originals,
        },
      });
      if (error) {
        let detail =
          "Jarvis is unavailable. Deploy jarvis-editor and configure the OpenAI secrets.";
        try {
          const body = await error.context?.json();
          detail = body?.error ?? detail;
        } catch {}
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);
      if (!data?.plan || !Array.isArray(data.plan.changes))
        throw new Error("Invalid edit proposal. No changes applied.");
      const plan: Plan = data.plan;
      if (
        plan.changes.some(
          (change) =>
            !(change.path in originals) || typeof change.content !== "string",
        )
      )
        throw new Error(
          "Proposal included files outside your selection. No changes applied.",
        );
      setProposal({ plan, originals });
      setNotice(
        "Proposal ready. Review the changes before applying them to the editor.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "AI request failed.");
    } finally {
      setBusy(false);
      setConsent(false);
    }
  }
  function apply() {
    if (!proposal) return;
    if (
      proposal.plan.changes.some(
        (change) => files[change.path] !== proposal.originals[change.path],
      )
    ) {
      setNotice(
        "A file changed after this request. Ask Jarvis again with the updated files.",
      );
      return;
    }
    onApply({
      ...files,
      ...Object.fromEntries(
        proposal.plan.changes.map((change) => [change.path, change.content]),
      ),
    });
    setProposal(null);
    setNotice(
      "Applied to the browser editor only. Preview and review companion file changes before saving to disk.",
    );
  }
  return (
    <section className="editor-jarvis">
      <div>
        <Sparkles size={22} />
        <div>
          <h2>Jarvis, your building partner</h2>
          <p>Select context · Request edits · Review the proposal</p>
        </div>
      </div>
      <label>
        Task mode{" "}
        <select
          value={mode}
          disabled={busy}
          onChange={(event) => {
            setMode(event.target.value as "simple" | "ai");
            setProposal(null);
            setConsent(false);
            setNotice("");
          }}
        >
          <option value="simple">Simple tasks · No API key</option>
          <option value="ai">AI proposals · OpenAI connection required</option>
        </select>
      </label>
      {mode === "simple" && (
        <>
          <p>
            Predefined HTML/CSS edits run in this browser. They do not use an AI
            model.
          </p>
          <div className="editor-worker-actions">
            {[
              "Make the page dark",
              "Make the page light",
              "Set background to #e0f2fe",
              "Change heading to Welcome",
            ].map((command) => (
              <button
                key={command}
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  setPrompt(command);
                  const target =
                    Object.keys(files).find((path) =>
                      command.startsWith("Change heading")
                        ? /\.html?$/i.test(path)
                        : /\.css$/i.test(path),
                    ) ??
                    Object.keys(files).find((path) => /\.html?$/i.test(path));
                  setSelection(target ? [target] : []);
                  setProposal(null);
                }}
              >
                {command}
              </button>
            ))}
          </div>
        </>
      )}
      <details className="editor-ai-files">
        <summary>
          Choose source files ({picked.length} selected ·{" "}
          {Math.ceil(size / 1024)} KB)
        </summary>
        {paths.map((path) => (
          <label key={path}>
            <input
              type="checkbox"
              checked={picked.includes(path)}
              disabled={busy}
              onChange={(event) => {
                setSelection((current) =>
                  event.target.checked
                    ? [...current, path]
                    : current.filter((item) => item !== path),
                );
                setConsent(false);
              }}
            />
            <span>{path}</span>
          </label>
        ))}
      </details>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void ask();
        }}
      >
        <input
          aria-label="Request for Jarvis"
          maxLength={4000}
          placeholder="Make the selected page use a dark theme…"
          value={prompt}
          disabled={busy}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <button
          className="button"
          disabled={
            busy ||
            (mode === "ai" && !consent) ||
            !prompt.trim() ||
            !picked.length ||
            picked.length > 30 ||
            size > 200000
          }
        >
          {busy
            ? "Preparing edits…"
            : mode === "simple"
              ? "Prepare simple task"
              : "Ask Jarvis"}
        </button>
      </form>
      {mode === "ai" && (
        <label className="editor-replace">
          <input
            type="checkbox"
            checked={consent}
            disabled={busy}
            onChange={(event) => setConsent(event.target.checked)}
          />
          Send these selected files and my request to OpenAI for this proposal.
          I have checked them for confidential data and credentials.
        </label>
      )}
      <small>
        {mode === "simple"
          ? "No API key needed. Recipes edit one HTML or CSS file at a time. Preview before writing files through the companion."
          : "Up to 30 selected files / 200 KB. API keys stay in Supabase secrets. Proposals do not publish changes."}
      </small>
      {notice && <p role="status">{notice}</p>}
      {proposal && (
        <div className="editor-ai-proposal">
          <h3>{proposal.plan.summary}</h3>
          {proposal.plan.changes.map((change) => (
            <details key={change.path}>
              <summary>
                {change.path} · {change.reason}
              </summary>
              <div className="editor-change-review">
                <div>
                  <strong>Before</strong>
                  <pre>{proposal.originals[change.path]}</pre>
                </div>
                <div>
                  <strong>After</strong>
                  <pre>{change.content}</pre>
                </div>
              </div>
            </details>
          ))}
          <div className="editor-worker-actions">
            <button
              className="button"
              disabled={!proposal.plan.changes.length}
              onClick={apply}
            >
              Apply reviewed proposal to editor
            </button>
            <button
              className="button secondary"
              onClick={() => setProposal(null)}
            >
              Discard proposal
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
