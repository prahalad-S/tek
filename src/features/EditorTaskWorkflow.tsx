import { getJiraWorkflowMode } from "../lib/jiraWorkflowContext";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../app/providers";
import { jiraRequest, type JiraAssignedIssue, type JiraUpdate } from "../lib/jiraActions";
import { githubRequest, type GitHubWorkspace } from "../lib/githubConnection";
import { jiraProjectPlan, normalizeJiraInstruction } from "../lib/jiraProjectPlan";
import { publishedSite } from "../lib/publishedSite";
import { projects, rpc } from "../lib/api";
import { dateKey } from "../lib/domain";
import { rememberJarvisAction } from "../lib/jarvisUndo";
import { automationClick, automationElement, type CalendarAutomationDraft } from "../lib/jarvisUiAutomation";
import introMusic from "../assets/jarvis/intro.mp3";
import tick from "../assets/jarvis/tick.svg";

type Row = { id: string; text: string; level: number; status: "running" | "done" | "blocked" | "error"; url?: string; seconds?: number };
export type TaskMail = { to: string; subject: string; body: string; screenshot: string; attachments: File[] };
type Options = {
  historyKey: string;
  apply: (workspace: GitHubWorkspace) => void;
  preview: (workspace: GitHubWorkspace, signal: AbortSignal) => Promise<string>;
  hidePreview: () => void;
};
function stopError() { return new Error("Task stopped. Completed commits and Jira updates remain. Review the timeline before retrying."); }
function wait(ms: number, signal: AbortSignal) { return new Promise<void>((resolve, reject) => {
  if (signal.aborted) { reject(stopError()); return; }
  const done = () => { signal.removeEventListener("abort", abort); resolve(); };
  const timer = setTimeout(done, ms);
  const abort = () => { clearTimeout(timer); reject(stopError()); };
  signal.addEventListener("abort", abort, { once: true });
}); }
// Persist navigation links, never replay a compose payload when reopened.
function navigationOnlyUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname === "teams.microsoft.com") { url.searchParams.delete("message"); return url.href; }
    if (url.hostname === "outlook.office.com" && url.pathname.includes("/deeplink/compose")) return "https://outlook.office.com/mail/";
  } catch { /* Relative in-app links remain unchanged. */ }
  return value;
}
function openTab(url: string) {
  const tab = window.open("about:blank", "_blank");
  if (!tab) return false;
  tab.opener = null; tab.location.href = url; return true;
}
// External protocol handlers have no success API. Focus changes are only a
// handoff hint; never treat them as proof that a message was delivered.
async function handoffTeams(webUrl: string, signal: AbortSignal, countdown: (seconds:number, web:boolean) => void) {
  const frame = document.createElement("iframe");
  frame.hidden = true; frame.title = "Open Teams desktop";
  let handedOff = false;
  const blurred = () => { handedOff = true; };
  const visibility = () => { if (document.hidden) handedOff = true; };
  window.addEventListener("blur",blurred);
  document.addEventListener("visibilitychange",visibility);
  try {
    frame.src = webUrl.replace(/^https:/,"msteams:");
    document.body.appendChild(frame);
    for (let seconds=20;seconds>=0;seconds--) { countdown(seconds,false); if(seconds) await wait(1000,signal); }
    if (handedOff) return { desktop: true, webOpened: false };
    const webOpened = openTab(webUrl);
    for (let seconds=10;seconds>=0;seconds--) { countdown(seconds,true); if(seconds) await wait(1000,signal); }
    return { desktop: false, webOpened };
  } finally {
    frame.remove(); window.removeEventListener("blur",blurred);
    document.removeEventListener("visibilitychange",visibility);
  }
}
function outlookDraftUrl(mail: TaskMail) {
  const body = mail.body.replace("The published website screenshot is attached.", "The published website screenshot is available in the Jira ticket attachments.");
  return `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(mail.to)}&subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(body)}`;
}
function requestMailApp(mail: TaskMail) { return openTab(outlookDraftUrl(mail)); }
export function useEditorTaskWorkflow(options: Options) {
  const { profile, member, preview } = useAuth();
  const qc = useQueryClient();
  const historyKey = `${options.historyKey}:task-history`;
  const [rows, setRows] = useState<Row[]>(() => {
    try { return (JSON.parse(localStorage.getItem(historyKey) || "[]") as Row[]).map(r => ({...r, ...(r.url ? {url:navigationOnlyUrl(r.url)} : {}), ...(r.status === "running" ? {status:"blocked" as const,text:`${r.text} (interrupted)`} : {})})); } catch { return []; }
  });
  const runPrefix = useRef(""), historyWrites = useRef(true);
  useEffect(() => { try { if (rows.length) localStorage.setItem(historyKey,JSON.stringify(rows)); else localStorage.removeItem(historyKey); } catch { /* Storage may be unavailable; keep the visible history. */ } },[historyKey,rows]);
  const [active, setActive] = useState(false);
  const [approval,setApproval] = useState<{id:string;question:string} | null>(null);
  const [phase, setPhase] = useState<"processing" | "mail" | "complete" | "error">(() => {
    const last = rows.at(-1);
    return last?.id.endsWith(":done") && last.status === "done" ? "complete" : last ? "error" : "processing";
  });
  const [mail, setMail] = useState<TaskMail | null>(null);
  const [mailVisible, setMailVisible] = useState(false);
  const [mailFading,setMailFading] = useState(false);
  const [teams, setTeams] = useState<{ email: string; name: string; message: string } | null>(null);
  const [calendarDraft, setCalendarDraft] = useState<CalendarAutomationDraft | null>(null);
  const [calendarSaved, setCalendarSaved] = useState(false);
  const [calendarUrl, setCalendarUrl] = useState("");
  const [requirementsConflict, setRequirementsConflict] = useState<{ title: string; description: string; titleResult: string; descriptionResult: string } | null>(null);
  const [issue, setIssue] = useState<JiraAssignedIssue | null>(null);
  const controller = useRef<AbortController | null>(null), current = useRef("");
  const running = useRef(false), mounted = useRef(true);
  const calendarContinue = useRef<((error?: Error) => void) | null>(null);
  const taskMusic = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    mounted.current = true;
    const stop = () => { controller.current?.abort(); taskMusic.current?.pause(); };
    window.addEventListener("jarvis-workflow-stop", stop);
    return () => { mounted.current = false; stop(); window.removeEventListener("jarvis-workflow-stop", stop); window.dispatchEvent(new CustomEvent("jarvis-workflow-music", { detail: false })); };
  }, []);
  function row(id: string, text: string, status: Row["status"] = "running", level = 0, extra: Partial<Row> = {}) {
    current.current = id;
    if (!mounted.current || !historyWrites.current) return;
    id = `${runPrefix.current}:${id}`;
    setRows(old => old.some(r => r.id === id) ? old.map(r => r.id === id ? { ...r, text, status, ...extra } : r) : [...old, { id, text, status, level, ...extra }]);
  }
  async function verifyLink(id: string, label: string, url: string, signal: AbortSignal, duration=15) {
    const opened = openTab(url);
    const navigationUrl = navigationOnlyUrl(url);
    for (let seconds = duration; seconds >= 0; seconds--) {
      row(id, opened ? label : `${label.replace(/^Opening /, "Open ")} — browser blocked the new tab; use this link`, opened ? "done" : "blocked", 1, { url: navigationUrl, seconds });
      if (seconds) await wait(1000, signal);
    }
  }
  async function start(imported: GitHubWorkspace, ticket: JiraAssignedIssue) {
    if (running.current) return;
    running.current = true; historyWrites.current = true; runPrefix.current = crypto.randomUUID();
    const abort = new AbortController(); controller.current = abort;
    const signal = abort.signal, started = Date.now();
    const check = () => { if (signal.aborted || !mounted.current) throw stopError(); };
    setActive(true); setRequirementsConflict(null); setCalendarSaved(false); setPhase("processing"); setIssue(null); setMail(null); setTeams(null); setCalendarDraft(null); setCalendarUrl("");
    window.dispatchEvent(new CustomEvent("jarvis-workflow-music", { detail: true }));
    const audio = new Audio(introMusic); audio.volume = 0.35; audio.loop = true; taskMusic.current = audio;
    void audio.play().catch(() => {});
    let completedSummary = "", commitUrl = "", snapshot = "", verificationWebsite = "";
    const mode = getJiraWorkflowMode();
    async function approve(question:string) {
      check(); if (mode === "auto") return;
      const id=crypto.randomUUID(); setApproval({id,question});
      await new Promise<void>((resolve,reject) => {
        const cleanup=() => { window.removeEventListener("jarvis-step-approve",accept); signal.removeEventListener("abort",stopped); setApproval(null); };
        const accept=(event:Event) => { if ((event as CustomEvent).detail !== id) return; cleanup(); resolve(); };
        const stopped=() => { cleanup(); reject(stopError()); };
        window.addEventListener("jarvis-step-approve",accept); signal.addEventListener("abort",stopped,{once:true});
        window.dispatchEvent(new CustomEvent("jarvis-github-result",{detail:question}));
        if(signal.aborted) stopped();
      }); check();
    }
    try {
      if (preview || !profile?.user_id) throw new Error("Sign in to run this connected workflow.");
      row("import", "Imported files successfully from GitHub", "done");
      row("work", `Working on ${ticket.key} — this might take some time`);
      const details = await jiraRequest<JiraAssignedIssue>({ action: "details", issueKey: ticket.key }, signal); check(); setIssue(details);
      const fresh = await githubRequest<GitHubWorkspace>({ action: "import", repository: imported.repository, branch: imported.branch }, signal); check();
      if (Object.keys(fresh.files).some(path => /(?:^|\/)(?:package\.json|vite\.config\.|next\.config\.)|\.(?:tsx|jsx|vue|svelte)$/i.test(path))) throw new Error("This project requires a build environment. Use the local companion or cloud worker; no files were changed or published.");
      row("site", "Inspecting the repository website and imported source files");
      await approve("Can I inspect the published website and imported project files?");
      const site = await publishedSite(fresh.repository, signal); check();
      row("site", "Repository website inspected in the background", "done");
      let plan = jiraProjectPlan(details.summary, fresh.files, site.elements);
      let requirementSource = "Jira issue summary";
      // Repeated instructions need one plan; distinct requirements still require validation.
      const descriptionText = normalizeJiraInstruction(details.description || "");
      const summaryText = normalizeJiraInstruction(details.summary);
      const comparable = (text: string) => text.toLowerCase().replace(/[’‘]/g, "'").replace(/[.!?]+$/, "");
      if (descriptionText && comparable(descriptionText) !== comparable(summaryText)) {
        let descriptionPlan;
        try { descriptionPlan = jiraProjectPlan(descriptionText, fresh.files, site.elements); }
        catch (error) {
          throw new Error(`I understood the issue title, but could not interpret its description: ${error instanceof Error ? error.message : "Unrecognised instructions"} Please clarify the description. No files were changed.`);
        }
        const changesOf = (value: typeof plan) => JSON.stringify(value.changes.map(c => [c.path,c.content]).sort((a,b) => a[0].localeCompare(b[0])));
        if (changesOf(descriptionPlan) !== changesOf(plan)) {
          setRequirementsConflict({ title: details.summary, description: details.description || "", titleResult: plan.summary, descriptionResult: descriptionPlan.summary });
          row("requirements", "The title and description produce different edits. Choose which instructions define this task", "blocked");
          const selection = await new Promise<"title" | "description">((resolve, reject) => {
            const cleanup = () => { window.removeEventListener("jarvis-requirements-choice", choose); window.removeEventListener("jarvis-task-approve", remind); signal.removeEventListener("abort", stopped); };
            const remind = () => window.dispatchEvent(new CustomEvent("jarvis-github-result", { detail: "Please choose use summary or use description first. The editor shows both instructions." }));
            const choose = (event: Event) => {
              const value = (event as CustomEvent).detail;
              if (value !== "title" && value !== "description") return;
              cleanup(); resolve(value);
            };
            const stopped = () => { cleanup(); reject(stopError()); };
            window.addEventListener("jarvis-requirements-choice", choose);
            window.addEventListener("jarvis-task-approve", remind);
            signal.addEventListener("abort", stopped, { once: true });
            window.dispatchEvent(new CustomEvent("jarvis-github-result", { detail: "The title and description produce different edits. Review both in the editor, then say use summary or use description." }));
            if (signal.aborted) stopped();
          }); check();
          if (selection === "description") plan = descriptionPlan;
          requirementSource = `User selected the Jira ${selection} as the task instructions`;
          setRequirementsConflict(null);
          row("requirements", `Using the ${selection} instructions selected by you`, "done");
        }
      }
      row("analysis", `Scanned ${Object.keys(fresh.files).length} imported files. Applying: ${plan.summary}`);
      check();
      await approve(`I can do this task: ${plan.summary}. Do you want me to do it?`);
      const latestIssue = await jiraRequest<JiraAssignedIssue>({ action: "details", issueKey: details.key }, signal); check(); setIssue(latestIssue);
      if (normalizeJiraInstruction(latestIssue.summary) !== normalizeJiraInstruction(details.summary) || normalizeJiraInstruction(latestIssue.description || "") !== normalizeJiraInstruction(details.description || "")) throw new Error("This Jira issue changed during analysis. The latest details are now shown. Reimport the repository to analyse the updated requirements. No files were changed.");
      row("analysis", "Latest Jira requirements rechecked", "done");
      completedSummary = plan.summary;
      const updated = { ...fresh, files: { ...fresh.files, ...Object.fromEntries(plan.changes.map(change => [change.path, change.content])) } };
      options.apply(updated); check();
      await approve("Can I run the preview and capture it?");
      row("preview", "Running preview for two seconds", "running", 1);
      snapshot = await options.preview(updated, signal); check(); options.hidePreview();
      row("preview", "Preview rendered for two seconds", "done", 1);
      row("work", `Applied supported task: ${plan.summary}`, "done");
      row("finished", "Finished the supported HTML/CSS change", "done", 1);

      await approve("Can I commit and push the files to GitHub?");
      row("push", "Reading latest branch, committing changes and pushing to GitHub");
      rememberJarvisAction("publishing a GitHub commit", null);
      const pushed = plan.changes.length ? await githubRequest<{ commitSha: string }>({ action: "push", repository: fresh.repository, branch: fresh.branch, baseCommit: fresh.commitSha, message: `${ticket.key}: ${plan.summary}`, confirmed: true, changes: plan.changes.map(({ path, content }) => ({ path, content })) }, signal) : { commitSha: fresh.commitSha };
      check();
      if (!/^[a-f0-9]{40}$/i.test(pushed.commitSha)) throw new Error("GitHub did not confirm a commit. Check the repository before retrying.");
      options.apply({ ...updated, commitSha: pushed.commitSha });
      commitUrl = `https://github.com/${fresh.repository}/commit/${pushed.commitSha}`;
      row("push", plan.changes.length ? "Committed and pushed to GitHub" : "GitHub already contains this change; no duplicate commit", "done");
      await approve("Can I open the GitHub repository for you to verify?");
      await verifyLink("github", "Opening GitHub repository for you to verify", `https://github.com/${fresh.repository}`, signal); check();
      await approve("Can I capture the updated published website in the background?");
      row("screenshot", "Waiting for GitHub Pages to publish the changes, then capturing the website", "running", 1);
      const published = await publishedSite(fresh.repository, signal, plan.changes.length ? plan.changes : Object.entries(fresh.files).filter(([path]) => /\.(?:html?|css|js)$/.test(path)).slice(0,20).map(([path, content]) => ({ path, content }))); check();
      snapshot = published.screenshot; verificationWebsite = published.website;
      row("screenshot", "Captured the updated published website in the background", "done", 1);
      await approve("Can I add the comment and screenshot to Jira and move the issue to In Testing?");
      row("jira", "Adding Jira comment and screenshot, then moving status to In Testing");
      rememberJarvisAction("updating a Jira ticket", null);
      const comment = `${plan.summary}.\nRequirements: ${requirementSource}.\nFiles: ${plan.changes.map(c => c.path).join(", ") || "No new file changes required"}.\nPublished website checked and screenshot captured. Please verify the result in QA.\nCommit: ${commitUrl}`;
      const result = await jiraRequest<JiraUpdate>({ action: "update-ticket", issueKey: details.key, comment, screenshot: snapshot, confirmed: true }, signal); check();
      row("jira", "Jira comment and screenshot saved; In Testing confirmed", "done");
      await approve("Can I open the updated Jira ticket for verification?");
      await verifyLink("jira-link", "Opening Jira for you to verify", result.url, signal); check(); setPhase("mail");
      const recipient = "srilakshmi.tatapudi@tekzenit.com";
      const name = "Srilakshmi";
      const draft = { to: "srilakshmi.tatapudi@tekzenit.com", subject: `${details.key}: ${details.summary} — ready for testing`, body: `Hi Srilakshmi,\n\n${plan.summary}. The task has been completed and the Jira issue is now In Testing. Please verify the result in Jira.\n\nJira: ${result.url}\nGitHub commit: ${commitUrl}\n\nThe published website screenshot is attached.\n\nThanks,\n${profile.full_name}\n${profile.title || ""}`, screenshot: snapshot, attachments: [] };
      await approve("Can I create the email draft for Srilakshmi?");
      setMailFading(false); setMail(draft); setMailVisible(true);
      row("mail", "Preparing an email draft for Srilakshmi");
      for (let seconds=15;seconds>=0;seconds--) {
        row("mail", "Email draft ready; Outlook opens after this countdown", "done",0,{seconds});
        if (seconds) await wait(1000,signal);
      }
      check();
      await approve("Can I open the Outlook draft for you to send manually?");
      await verifyLink("outlook", "Opened Outlook Web draft link - review and send manually", outlookDraftUrl(draft), signal,20); check();
      row("mail", "Email draft handed off; sending is not verified", "done");
      setMailFading(true); await wait(2000,signal); check();
      setMailVisible(false); setMail(null); setMailFading(false);
      const message = `${draft.body.replace("Hi Srilakshmi,", `Hi ${name},`).replace("The published website screenshot is attached.", "Screenshot: see the Jira ticket attachment.")}\n\nSubject: ${draft.subject}`;
      const teamsUrl = `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(recipient)}&message=${encodeURIComponent(message)}`;
      const teamsChatUrl = navigationOnlyUrl(teamsUrl);
      await approve("Can I open Srilakshmi’s Teams chat with the draft for you to send manually?");
      row("teams", "Opening Srilakshmi’s chat with the draft in Teams desktop first; web is the fallback", "running", 1);
      const teamsHandoff = await handoffTeams(teamsUrl,signal,(seconds,web) => row("teams",web ? "Teams web draft requested; review and send manually" : "Srilakshmi’s Teams desktop chat and draft requested; waiting before updating timesheet", "done",1,{seconds,url:teamsChatUrl})); check();
      row("teams", teamsHandoff.desktop ? "Srilakshmi’s Teams desktop chat and draft requested; review and send manually. Use Open to reopen her chat without inserting the draft again." : teamsHandoff.webOpened ? "Srilakshmi’s Teams web chat and draft opened; review and send manually" : "Teams launch could not be confirmed. Use Open to access the web draft", teamsHandoff.desktop || teamsHandoff.webOpened ? "done" : "blocked", 1, {url:teamsChatUrl,seconds:0});
      await approve("Can I open Calendar and fill the timesheet with the elapsed task time?");
      row("time", "Recording actual elapsed task time");
      let list = await projects(); check();
      let project = list.find(p => p.status === "active" && p.name.trim().toLowerCase() === details.project?.trim().toLowerCase());
      if (!project) project = list.find(p => p.status === "active" && p.name.trim().toLowerCase() === "others");
      if (!project) {
        if (!member || !["admin", "manager"].includes(member.role)) throw new Error("An administrator must create the Others project before this timesheet entry can be saved. GitHub and Jira updates are already complete.");
        await approve("The timesheet needs an Others project. Can I create it?");
        await rpc("save_project_details", { p_name: "Others", p_description: "Work without a matching active Jira project", p_status: "active", p_client: "", p_country: "", p_city: "", p_id: null }); check();
        list = await projects(); project = list.find(p => p.name.toLowerCase() === "others" && p.status === "active");
      }
      if (!project) throw new Error("Could not find the timesheet project.");
      const minutes = Math.max(1, Math.ceil((Date.now() - started) / 60000));
      const date = dateKey(new Date());
      const description = `${ticket.key}: ${completedSummary}. Automated workflow elapsed time (${minutes} minute${minutes === 1 ? "" : "s"}, rounded up). ${commitUrl}`;
      const sidebarCalendar = await automationElement('nav[aria-label="Main navigation"] a[href$="/calendar"]', signal);
      await automationClick(sidebarCalendar, signal, true); check();
      await new Promise<void>((resolve,reject) => {
        const timeout = setTimeout(() => { calendarContinue.current = null; signal.removeEventListener("abort",stopped); reject(new Error("Calendar form did not finish in time. No timesheet entry was submitted. Check calendar access and retry.")); },90000);
        const stopped = () => { clearTimeout(timeout); calendarContinue.current = null; reject(stopError()); };
        calendarContinue.current = error => { clearTimeout(timeout); signal.removeEventListener("abort",stopped); calendarContinue.current = null; error ? reject(error) : resolve(); };
        signal.addEventListener("abort",stopped,{once:true});
        setCalendarDraft({ date, project: project.name, projectId: project.id, description, minutes });
        if (signal.aborted) stopped();
      }); check();
      await approve(`Can I save ${minutes} minute${minutes === 1 ? "" : "s"} in ${project.name} for today?`);
      rememberJarvisAction("saving elapsed task time", null);
      const entryId = await rpc<string>("save_calendar_entry", { p_user: profile.user_id, p_date: date, p_project: project.id, p_description: description, p_minutes: minutes, p_status: "Completed", p_id: null, p_version: null }); check();
      if (!entryId) throw new Error("The timesheet save was not confirmed. Check Calendar before retrying.");
      await qc.invalidateQueries(); check();
      row("time", `Recorded ${minutes} minute${minutes === 1 ? "" : "s"} of actual elapsed time in ${project.name}`, "done");
      const target = `/calendar?view=day&date=${date}&jarvisEntry=${encodeURIComponent(entryId)}`;
      setCalendarUrl(target); row("calendar", "Opening calendar to verify the saved entry", "done", 1);
      setCalendarSaved(true);
      await wait(1000, signal); check();
      await approve("Can I close the calendar entry and return to Editor?");
      const sidebarEditor = await automationElement('nav[aria-label="Main navigation"] a[href$="/editor"]',signal);
      await automationClick(sidebarEditor,signal,true); check();
      setCalendarDraft(null);
      await wait(3000,signal);
      await approve("Can I finish the workflow and open the published website for verification?");
      row("done", "# done - ✓", "done"); setPhase("complete");
      await wait(400,signal); check();
      taskMusic.current?.pause(); taskMusic.current = null;
      window.dispatchEvent(new CustomEvent("jarvis-workflow-music", { detail: false }));
      for (let seconds=5;seconds>=0;seconds--) {
        row("done", "# done - ✓", "done",0,{seconds});
        if (seconds) await wait(1000,signal);
      }
      check();
      const websiteOpened = openTab(verificationWebsite);
      // Keep Done as the final step; attach the verification link to that row.
      row("done", websiteOpened ? "# done - ✓" : "# done - ✓ — browser blocked the website tab; use Open to verify", "done", 0, {url:verificationWebsite});
      window.requestAnimationFrame(() => { document.querySelector(".task-timeline .task-step:last-child")?.scrollIntoView({block:"end",behavior:"smooth"}); });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The task could not finish.";
      window.dispatchEvent(new CustomEvent("jarvis-github-result", { detail: message }));
      row(current.current || "error", message, "error"); setPhase("error"); setCalendarDraft(null); options.hidePreview();
    } finally {
      taskMusic.current?.pause(); taskMusic.current = null; calendarContinue.current = null;
      running.current = false;
      if (mounted.current) { setActive(false); setApproval(null); setRequirementsConflict(null); }
      window.dispatchEvent(new CustomEvent("jarvis-workflow-music", { detail: false }));
    }
  }
  function calendarReady(error?: Error) { calendarContinue.current?.(error); }
  function chooseRequirements(source: "title" | "description") {
    if (requirementsConflict) window.dispatchEvent(new CustomEvent("jarvis-requirements-choice", { detail: source }));
  }
  function clearHistory() {
    historyWrites.current = false; controller.current?.abort(); taskMusic.current?.pause();
    setRows([]); setPhase("processing"); setIssue(null); setCalendarUrl(""); setMail(null); setMailVisible(false);
    localStorage.removeItem(historyKey);
  }
  return { approval, approveStep: () => { if(approval) window.dispatchEvent(new CustomEvent("jarvis-step-approve",{detail:approval.id})); }, mailFading, clearHistory, calendarSaved, calendarReady, calendarSignal: controller.current?.signal, requirementsConflict, chooseRequirements, rows, active, phase, mail, setMail, mailVisible, setMailVisible, teams, calendarDraft, calendarUrl, issue, start, stop: () => controller.current?.abort() };
}
export type Workflow = ReturnType<typeof useEditorTaskWorkflow>;
export function TypedText({ text, speed = 12, onComplete }: { text: string; speed?: number; onComplete?: () => void }) {
  const [length, setLength] = useState(0);
  const callback = useRef(onComplete); callback.current = onComplete;
  useEffect(() => {
    setLength(0);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setLength(text.length); callback.current?.(); return; }
    let index = 0;
    const timer = setInterval(() => { index = Math.min(text.length,index+3); setLength(index); if (index >= text.length) { clearInterval(timer); callback.current?.(); } }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);
  return <>{text.slice(0, length)}</>;
}
function WorkflowStep({ row }: { row: Row }) {
  const [typed, setTyped] = useState(false);
  useEffect(() => setTyped(false), [row.text]);
  return <li className={`task-step depth-${row.level} status-${row.status}`}>
    <span><TypedText text={row.text} onComplete={() => setTyped(true)} />{!typed || row.status === "running" ? <span className="task-dots" aria-label="In progress">...</span> : row.status === "done" ? <img src={tick} alt="Completed" /> : <span className="task-warning">{row.status === "error" ? "✕" : "!"}</span>}
    {row.seconds !== undefined && <small key={row.seconds} className="task-countdown">{row.seconds}</small>}
    {row.url && <> <a href={row.url} target="_blank" rel="noreferrer">Open</a></>}</span>
  </li>;
}
export function WorkflowTimeline({ flow }: { flow: Workflow }) {
  return <section className="task-timeline" aria-label="Jira task progress"><header>
    <button type="button" className={`task-phase ${flow.active && flow.phase === "processing" ? "is-running" : ""}`}>{flow.phase === "complete" ? "finished the task" : "Processing"}</button>
    {flow.mail && <button type="button" className={`task-phase ${flow.active && flow.phase === "mail" ? "is-running" : ""}`} onClick={() => flow.setMailVisible(true)}>Send mail</button>}
    {flow.active && <button className="text-button" type="button" onClick={flow.stop}>Stop task</button>}
  </header>
    {flow.issue && <p className="task-issue">{flow.issue.key} · {flow.issue.project || "Project not provided"} · Issue summary: {flow.issue.summary}</p>}
    {flow.issue?.description && <details open><summary>Latest Jira description</summary><p>{flow.issue.description}</p>{flow.issue.updated && <small>Updated in Jira: {new Date(flow.issue.updated).toLocaleString()}</small>}</details>}
    {flow.requirementsConflict && <section className="task-requirements" role="region" aria-label="Choose task instructions">
      <h3>Which instructions should Jarvis follow?</h3>
      <p>These instructions produced different edits. Choose the intended task to continue automatically.</p>
      <h4>Issue summary</h4><p style={{ whiteSpace: "pre-wrap" }}>{flow.requirementsConflict.title}</p>
      <p>Planned result: {flow.requirementsConflict.titleResult}</p>
      <button type="button" className="button secondary" onClick={() => flow.chooseRequirements("title")}>Use issue summary</button>
      <h4>Description</h4><p style={{ whiteSpace: "pre-wrap" }}>{flow.requirementsConflict.description}</p>
      <p>Planned result: {flow.requirementsConflict.descriptionResult}</p>
      <button type="button" className="button secondary" onClick={() => flow.chooseRequirements("description")}>Use description</button>
    </section>}
    {flow.approval && <section className="task-requirements" data-jarvis-approval={flow.approval.id} role="region" aria-label="Approve next action">
      <p>{flow.approval.question}</p>
      <button type="button" className="button" onClick={flow.approveStep}>Yes, proceed</button>
      <button type="button" className="button secondary" onClick={flow.stop}>Stop task</button>
    </section>}
    <ol>{flow.rows.map(row => <WorkflowStep key={row.id} row={row} />)}</ol>
    {flow.calendarUrl && <a href={flow.calendarUrl}>Open saved calendar entry</a>}
  </section>;
}
function downloadFile(content: Blob, name: string) { const url = URL.createObjectURL(content); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export function WorkflowMail({ flow }: { flow: Workflow }) {
  const mail = flow.mail!, body = useRef<HTMLDivElement>(null), [typing, setTyping] = useState(true), [count, setCount] = useState(0);
  useEffect(() => { setCount(0); const timer = setInterval(() => setCount(n => n + 8), 20); return () => clearInterval(timer); }, []);
  useEffect(() => { if (typing && body.current) { body.current.innerText = mail.body.slice(0, count); if (count >= mail.body.length) setTyping(false); } }, [count, typing, mail.body]);
  const update = (value: Partial<TaskMail>) => flow.setMail(old => old ? { ...old, ...value } : old);
  async function saveDraft() {
    const boundary = `jarvis-${crypto.randomUUID()}`;
    const b64 = (value: string) => { const bytes = new TextEncoder().encode(value); let text = ""; for (const byte of bytes) text += String.fromCharCode(byte); return btoa(text).match(/.{1,76}/g)?.join("\r\n") || ""; };
    const clean = (s: string) => s.replace(/[\r\n]/g, " ");
    let eml = `To: ${clean(mail.to)}\r\nSubject: =?UTF-8?B?${b64(mail.subject).replace(/\r\n/g, "")}?=\r\nX-Unsent: 1\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(mail.body)}\r\n`;
    const png = mail.screenshot.split(",")[1];
    eml += `--${boundary}\r\nContent-Type: image/png\r\nContent-Disposition: attachment; filename="preview.png"\r\nContent-Transfer-Encoding: base64\r\n\r\n${png.match(/.{1,76}/g)?.join("\r\n")}\r\n`;
    for (const file of mail.attachments) {
      const bytes = new Uint8Array(await file.arrayBuffer()); let text = ""; for (const byte of bytes) text += String.fromCharCode(byte);
      eml += `--${boundary}\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename="${clean(file.name).replace(/["\\]/g,"_")}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${btoa(text).match(/.{1,76}/g)?.join("\r\n")}\r\n`;
    }
    downloadFile(new Blob([eml + `--${boundary}--\r\n`], { type: "message/rfc822" }), "jira-update-draft.eml");
  }
  return <section className={`task-mail${flow.mailFading ? " is-fading" : ""}`}><h2>Send Mail <small>Draft — not sent</small></h2>
    <input aria-label="Recipient" type="email" value={typing ? mail.to.slice(0, count) : mail.to} onChange={e => { setTyping(false); update({ to: e.target.value }); }} />
    <input aria-label="Subject" value={typing ? mail.subject.slice(0, Math.max(0,count-mail.to.length)) : mail.subject} onChange={e => { setTyping(false); update({ subject: e.target.value }); }} />
    <div className="task-rich-editor"><div className="task-mail-toolbar">{[["undo","↶"],["redo","↷"],["bold","B"],["italic","I"],["formatBlock","H1"],["formatBlock","H2"]].map(([cmd,label],i) => <button key={i} type="button" onMouseDown={e => e.preventDefault()} onClick={() => { setTyping(false); body.current?.focus(); document.execCommand(cmd,false,label === "H1" ? "h1" : label === "H2" ? "h2" : undefined); update({ body: body.current?.innerText || mail.body }); }}>{label}</button>)}
      <label>Attach files<input type="file" multiple onChange={e => { const files = [...(e.target.files || [])]; if (files.reduce((n,f) => n+f.size,0) <= 10*1024*1024) update({ attachments: files }); }} /></label></div>
      <div ref={body} contentEditable suppressContentEditableWarning spellCheck onInput={() => { setTyping(false); update({ body: body.current?.innerText || "" }); }} />
      <img className="task-mail-shot" src={mail.screenshot} alt="Captured project preview attached to draft" />
    </div><small>Browser spell checking is on; right-click an underlined word for suggestions.</small>
    {mail.attachments.map(file => <small key={file.name}>{file.name}</small>)}
    <p className="muted">Jarvis waits fifteen seconds before opening Outlook Web, then waits another twenty seconds before fading out this draft. Sign in if needed and press Send yourself. Use Save Mail for a draft with the screenshot attachment; sending is not verified here.</p>
    <footer><button className="button secondary" type="button" onClick={() => requestMailApp(mail)}>Open Outlook Web again</button><button className="button" type="button" onClick={() => void saveDraft()}>Save Mail</button><button className="button secondary" type="button" onClick={() => flow.setMailVisible(false)}>Back to task</button></footer>
  </section>;
}
