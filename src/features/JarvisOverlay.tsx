import { darkThemes, themeFromSpeech } from "../app/themes";
import cautionVideo from "../assets/jarvis/caution.mp4";
import { guideClick, automationWait, scrollJarvis, stopJarvisScroll } from "../lib/jarvisGuides";
import { assignedJiraQuery, type AssignedJiraIssues } from "../lib/jiraIssueCache";
import { normalizeGitHubSpeech } from "../lib/jarvisSpeechAliases";
import { actionSimilarity, actionTarget, discoverPageActions, matchPageActions, activatePageAction, normalizeAction, type JarvisPageAction } from "../lib/jarvisPageActions";
import { directoryPeople } from "../lib/profiles";
import { isJarvisStopCommand } from "../lib/jarvisControls";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Mic, MicOff, X, ArrowUp, Square } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth, useTheme } from "../app/providers";
import { client } from "../lib/supabase";
import { projects } from "../lib/api";
import { dateKey, weekStart, downloadCsv } from "../lib/domain";
import { previewProjects, previewWork, previewEmployees } from "../lib/preview";
import { companyHolidays } from "../lib/companyHolidays";
import { jiraRequest, type JiraAssignedIssue } from "../lib/jiraActions";
import { jarvisDate, spokenHours } from "../lib/jarvisConversation";
import type { Project, Employee } from "../lib/types";
import { useJarvisSpeech } from "./useJarvisSpeech";
import { rememberJarvisAction, undoJarvisAction, clearJarvisHistory } from "../lib/jarvisUndo";
import { prepareJiraWorkflow, clearJiraWorkflow, setJiraWorkflowMode } from "../lib/jiraWorkflowContext";
import introMusic from "../assets/jarvis/intro.mp3";
import lightVideo from "../assets/jarvis/assistant-white.gif";
import gif from "../assets/jarvis/assistant.gif";
type Draft = { date: string; description: string; hours: number | null; project: string };
const introduction = 'Hi! How can I help you?';
const autoModeWarning = 'Caution: Proceeding in Auto Mode is high risk and could lead to critical errors. We strongly recommend switching to Approval Mode.';
const blank = (): Draft => ({ date: "", description: "", hours: null, project: "" });
export default function JarvisOverlay({ onClose, openJira, onCommandReceived, introReveal=false }: { onClose: () => void; openJira: () => void; onCommandReceived: () => void; introReveal?:boolean }) {
  const { profile, member, preview, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [lightAnimation, setLightAnimation] = useState(!darkThemes.has(document.documentElement.dataset.theme || "light"));
  useEffect(() => {
    const update = () => setLightAnimation(!darkThemes.has(document.documentElement.dataset.theme || "light"));
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    update(); return () => observer.disconnect();
  }, []);
  const navigate = useNavigate(), qc = useQueryClient();
  const location = useLocation();
  const [suggestions, setSuggestions] = useState<JarvisPageAction[]>([]);
  const [profileChoices, setProfileChoices] = useState<Employee[]>([]);
  const [availableControls, setAvailableControls] = useState<string[]>([]);
  useEffect(() => { setSuggestions([]); setProfileChoices([]); setAvailableControls([]); }, [location.pathname, location.search]);
  const base = preview ? "/preview" : "";
  const [reply, setReply] = useState(introduction);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const [availableProjects, setProjects] = useState<Project[]>([]);
  const projectRef = useRef<Project[]>([]);
  const [exporting, setExporting] = useState(false);
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`), [to, setTo] = useState(dateKey(new Date()));
  const operation = useRef(0), controller = useRef<AbortController | null>(null), writeSubmitted = useRef(false);
  const mounted = useRef(true);
  const locked = useRef(false);
  const queued = useRef<string[]>([]);
  const projectPrompt = useRef<"open" | "source" | null>(null);
  const [modeChoice,setModeChoice] = useState<"choose" | "caution" | null>(null);
  const [autoHover,setAutoHover]=useState(false);
  useEffect(()=>{if(!modeChoice)setAutoHover(false);},[modeChoice]);
  const modeChoiceRef = useRef<"choose" | "caution" | null>(null);
  const [warningLength,setWarningLength] = useState(0);
  useEffect(() => {
    setWarningLength(0);
    if (modeChoice !== "caution") return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setWarningLength(autoModeWarning.length); return; }
    let length=0;
    const timer=setInterval(() => { length++; setWarningLength(length); if(length >= autoModeWarning.length) clearInterval(timer); },35);
    return () => clearInterval(timer);
  },[modeChoice]);
  const editorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechPending = useRef(false);

  const assignedIssues = useRef<JiraAssignedIssue[]>([]);
  const readingJira = useRef(false);
  const [workflowMusic, setWorkflowMusic] = useState(false);
  useEffect(() => { const update = (e: Event) => setWorkflowMusic((e as CustomEvent<boolean>).detail); window.addEventListener("jarvis-workflow-music", update); return () => window.removeEventListener("jarvis-workflow-music", update); }, []);
  const music = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    clearJarvisHistory();

    const audio = new Audio(introMusic); audio.volume = 0.4; music.current = audio;
    return () => { audio.pause(); music.current = null; };
  }, []);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [bodyLeft,setBodyLeft] = useState<number | null>(null);
  const bodyDrag = useRef<{x:number;left:number} | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const docked = useRef(false);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  function receiveCommand() {
    onCommandReceived();
    if (docked.current) return;
    const previous = dialogRef.current?.getBoundingClientRect();
    docked.current = true;
    const width = Math.min(380, window.innerWidth - 32), height = Math.min(340, window.innerHeight - 32);
    const left = Math.max(8, window.innerWidth - width - 16), top = Math.max(8, window.innerHeight - height - 16);
    if (previous && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dialogRef.current?.animate([
        { transformOrigin: "top left", transform: `translate(${previous.left - left}px, ${previous.top - top}px) scale(${previous.width / width}, ${previous.height / height})` },
        { transformOrigin: "top left", transform: "translate(0, 0) scale(1)" }
      ], { duration: 500, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
    }
    setSize({ width, height });
    setPosition({ left: Math.max(8, window.innerWidth - width - 16), top: Math.max(8, window.innerHeight - height - 16) });
  }
  function beginDrag(event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button,input,textarea,select,a,summary,[role=button]")) return;
    const box = dialogRef.current?.getBoundingClientRect(); if (!box) return;
    // Keep the native resize corner usable.
    if (event.clientX >= box.right - 22 && event.clientY >= box.bottom - 22) return;
    drag.current = { x: event.clientX, y: event.clientY, left: box.left, top: box.top };
    event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault();
  }
  function continueDrag(event: React.PointerEvent<HTMLElement>) {
    if (drag.current) moveDialog(drag.current.left + event.clientX - drag.current.x, drag.current.top + event.clientY - drag.current.y);
  }
  function endDrag(event: React.PointerEvent<HTMLElement>) {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function beginBodyDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button,input,textarea,select,a,summary,[role=button]")) return;
    const box = event.currentTarget.getBoundingClientRect();
    bodyDrag.current = {x:event.clientX,left:box.left};
    event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault();
  }
  function continueBodyDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!bodyDrag.current) return;
    const width = event.currentTarget.getBoundingClientRect().width;
    setBodyLeft(Math.max(8,Math.min(window.innerWidth-width-8,bodyDrag.current.left+event.clientX-bodyDrag.current.x)));
  }
  function endBodyDrag(event: React.PointerEvent<HTMLDivElement>) {
    bodyDrag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  useEffect(() => {
    const imported = () => {
      const box = dialogRef.current?.getBoundingClientRect(); if (!box) return;
      const width = Math.min(380,window.innerWidth-32), height = Math.min(340,window.innerHeight-32);
      const left = 16, top=16;
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) dialogRef.current?.animate([
        {transformOrigin:"top left",transform:`translate(${box.left-left}px,${box.top-top}px) scale(${box.width/width},${box.height/height})`},
        {transformOrigin:"top left",transform:"translate(0,0) scale(1)"}
      ],{duration:500,easing:"ease",fill:"none"});
      docked.current=true; setSize({width,height}); setPosition({left,top});
    };
    window.addEventListener("jarvis-files-imported",imported);
    return () => window.removeEventListener("jarvis-files-imported",imported);
  },[]);
  function moveDialog(left: number, top: number) {
    const rect = dialogRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({ left: Math.max(8, Math.min(left, window.innerWidth - rect.width - 8)), top: Math.max(8, Math.min(top, window.innerHeight - rect.height - 8)) });
  }
  useLayoutEffect(() => {
    const rect = dialogRef.current?.getBoundingClientRect();
    if (rect) setPosition({ left: rect.left, top: rect.top });
    const constrain = () => { const box = dialogRef.current?.getBoundingClientRect(); if (box) moveDialog(box.left, box.top); };
    window.addEventListener("resize", constrain);
    return () => window.removeEventListener("resize", constrain);
  }, []);
  const voice = useJarvisSpeech(text => { receiveCommand(); void run(text); }, (clear, phrase) => { receiveCommand(); interruptReply(clear, phrase); }, text => normalizeGitHubSpeech(text,projectPrompt.current === "source" || location.pathname.endsWith("/editor")), text => projectPrompt.current === "source" && /^github[.!?]*$/i.test(text.trim()));
  useEffect(() => {
    window.dispatchEvent(new Event(voice.userSpeaking ? "jarvis-user-speaking" : "jarvis-user-idle"));
  }, [voice.userSpeaking]);

  useEffect(() => { if (inputRef.current) inputRef.current.scrollLeft = inputRef.current.scrollWidth; }, [voice.text]);
  useEffect(() => {
    const audio = music.current; if (!audio) return;
    if (workflowMusic) { audio.pause(); return; }
    if (voice.speaking || voice.userSpeaking || voice.text.trim() || busy) audio.pause();
    else if ((!audio.ended && !sessionStorage.getItem("jarvis-intro-played")) || workflowMusic) { audio.loop = workflowMusic; void audio.play().then(() => sessionStorage.setItem("jarvis-intro-played", "1")).catch(() => {}); } else audio.pause();
  }, [voice.speaking, voice.userSpeaking, voice.text, busy, workflowMusic]);
  useEffect(() => {
    const completed = (event: Event) => { answer((event as CustomEvent<string>).detail); };
    window.addEventListener("jarvis-github-result", completed);
    return () => window.removeEventListener("jarvis-github-result", completed);
  });
  speechPending.current = voice.userSpeaking || !!voice.text.trim();
  function clearEditorTimer() { if (editorTimer.current) clearTimeout(editorTimer.current); editorTimer.current = null; }
  function clearSourceTimer() { if (sourceTimer.current) clearTimeout(sourceTimer.current); sourceTimer.current = null; }
  function chooseProjectSource(github = true) {
    if (!mounted.current || projectPrompt.current !== "source") return;
    clearSourceTimer(); projectPrompt.current = null; voice.setText(""); voice.silence();
    navigate(`${base}/editor`);
    let attempts=0;
    const open = () => {
      if (!mounted.current) return;
      if (!document.querySelector(".editor-toolbar") && ++attempts < 40) { sourceTimer.current=setTimeout(open,50); return; }
      sourceTimer.current=null;
      if (github) window.dispatchEvent(new CustomEvent("jarvis-github", {detail:"open"}));
      else (document.querySelector('.editor-toolbar input[type="file"]') as HTMLInputElement | null)?.click();
    };
    open();
    if (!github) answer("Use Import to choose your project files."); else setReply("");
  }
  function chooseWorkflowMode(mode: "approval" | "auto", confirmed=false) {
    setAutoHover(false);
    voice.setText(""); voice.silence(); clearSourceTimer();
    if (mode === "auto" && !confirmed) {
      modeChoiceRef.current="caution"; setModeChoice("caution");
      setReply(autoModeWarning); voice.say(autoModeWarning); return;
    }
    setJiraWorkflowMode(mode); modeChoiceRef.current=null; setModeChoice(null);
    projectPrompt.current="source";
    answer("From local computer or from GitHub?");
    sourceTimer.current=setTimeout(() => chooseProjectSource(true),5000);
  }
  function openIssueEditor(key?: string) {
    clearEditorTimer(); readingJira.current = false; voice.setText("");
    navigate(`${base}/editor`);
    const issue = key ? assignedIssues.current.find(i => i.key === key) : assignedIssues.current.length === 1 ? assignedIssues.current[0] : undefined;
    if (!issue) { answer("Which issue should I work on? Say its issue key."); return; }
    prepareJiraWorkflow(issue); projectPrompt.current = null;
    modeChoiceRef.current="choose"; setModeChoice("choose");
    answer("Select a workflow mode using the buttons or your voice.");
  }
  function askOpenEditor() {
    clearEditorTimer(); readingJira.current = false;
    const prompt = "Do you want me to open editor?";
    setReply(prompt);
    voice.say(prompt,false,() => {
      const openWhenQuiet = () => {
        if (!mounted.current || projectPrompt.current !== "open") return;
        if (speechPending.current) { editorTimer.current = setTimeout(openWhenQuiet,500); return; }
        openIssueEditor();
      };
      editorTimer.current = setTimeout(openWhenQuiet,5000);
    });
  }
  const replyVersion = useRef(0);
  function answer(message: string) { replyVersion.current++; if (!mounted.current) return; readingJira.current = false; setReply(message); voice.say(message); }
  function updateDraft(value: Draft | null) { draftRef.current = value; setDraft(value); }
  function interruptReply(clear = true, phrase = "") {
    if (modeChoiceRef.current === "caution" && /\bauto(?: mode)?\b/i.test(phrase)) { chooseWorkflowMode("auto",true); return; }
    if (/^(?:please\s+)?remove(?:\s+(?:all|suggestions|the suggestions|all suggestions))?[.!?]*$/i.test(phrase.trim())) {
      voice.discardCommand(); voice.setText("");
      setSuggestions([]); setProfileChoices([]); setAvailableControls([]);
      setReply(""); voice.startListening(); return;
    }
    if (readingJira.current && /\bskip\b/i.test(phrase) && !/\b(?:cancel|delete|clear|no)\b/i.test(phrase)) {
      readingJira.current = false; voice.setText(""); voice.resetListening();
      askOpenEditor(); return;
    }
    cancel(clear);
  }
  function readJiraIssues(message: string) {
    readingJira.current = true; setReply(message);
    voice.say(message, false, () => {
      if (!readingJira.current || !mounted.current) return;
      readingJira.current = false;
      askOpenEditor();
    });
  }
  function cancel(clear = true) {
    replyVersion.current++;
    stopJarvisScroll();
    clearEditorTimer(); clearSourceTimer(); modeChoiceRef.current=null; setModeChoice(null); readingJira.current = false; clearJiraWorkflow(); projectPrompt.current = null;
    window.dispatchEvent(new Event("jarvis-workflow-stop"));
    window.dispatchEvent(new CustomEvent("jarvis-github", { detail: "cancel" }));
    music.current?.pause();
    queued.current = []; setSuggestions([]); setProfileChoices([]); setAvailableControls([]);
    operation.current++; controller.current?.abort(); voice.discardCommand(); locked.current = false; setBusy(false);
    updateDraft(null); setExporting(false); if (clear) voice.setText("");
    voice.resetListening();
    setReply(writeSubmitted.current ? "Stopped. A save request was already sent; check your timesheet before trying again." : clear ? "" : "Stopped. What would you like to do instead?");
  }
  useEffect(() => {
    mounted.current = true;
    // Start only after the user has opened Jarvis. Browser permission is still required.
    const greeting = setTimeout(() => voice.say(introduction, true), 0);
    voice.startListening();
    return () => { clearEditorTimer(); clearSourceTimer(); clearTimeout(greeting); mounted.current = false; stopJarvisScroll(); operation.current++; controller.current?.abort(); };
  }, []);
  function finishOperation(id: number) {
    if (!mounted.current || id !== operation.current) return;
    locked.current = false; setBusy(false);
    const next = queued.current.shift();
    if (next) queueMicrotask(() => { if (mounted.current && id === operation.current) void run(next); });
  }
  async function ownEntries(start: string, end: string, signal: AbortSignal) {
    if (preview) return previewWork.filter(e => e.timesheets.user_id === "preview" && e.work_date >= start && e.work_date <= end);
    const rows: { work_date: string; description: string; minutes: number; projects?: { name: string } | null }[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client().from("time_entries").select("work_date,description,minutes,projects(name),timesheets!inner(user_id)")
        .eq("timesheets.user_id", profile!.user_id!).gte("work_date", start).lte("work_date", end).order("work_date").order("id").range(offset, offset + 499).abortSignal(signal);
      if (error) throw error;
      rows.push(...(data as unknown as typeof rows)); if (data.length < 500) break;
    }
    return rows;
  }
  async function exportTimesheet(start: string, end: string) {
    if (locked.current) return;
    if (!start || !end || start > end || end > dateKey(new Date())) { answer("Choose a valid date range ending today or earlier."); return; }
    const id = ++operation.current; controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    locked.current = true; setBusy(true);
    try {
      const rows = await ownEntries(start, end, abort.signal);
      if (id !== operation.current || !mounted.current) return;
      downloadCsv(`my-timesheet-${start}-to-${end}.csv`, [["Date", "Project", "Description", "Hours"], ...rows.map(e => [e.work_date, e.projects?.name ?? "", e.description, e.minutes / 60])]);
      setExporting(false); answer(`Downloaded ${rows.length} time entries from ${start} to ${end}${preview ? ". This is preview data" : ""}.`);
    } catch (e) { if (id === operation.current) answer(e instanceof Error ? e.message : "Could not download your timesheet."); }
    finally { finishOperation(id); }
  }
  async function saveDraft(value: Draft) {
    if (locked.current) return;
    if (!value.date || !value.description.trim() || value.hours === null || !value.project) { answer("Please provide the date, work description, hours and project before saving."); return; }
    if (value.hours <= 0 || value.hours > 24 || value.date > dateKey(new Date())) { answer("Choose a date up to today and hours greater than zero and no more than 24."); return; }
    if (preview) { answer("This is a preview. Sign into your live workspace to save a timesheet."); return; }
    const id = ++operation.current; controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    locked.current = true; writeSubmitted.current = true; setBusy(true);
    try {
      rememberJarvisAction("saving a timesheet entry", null);
      const { error } = await client().rpc("save_calendar_entry", { p_user: profile!.user_id, p_date: value.date, p_project: value.project, p_description: value.description.trim(), p_minutes: Math.round(value.hours * 60), p_status: "In Progress", p_id: null, p_version: null }).abortSignal(abort.signal);
      if (error) throw error;
      if (id !== operation.current || !mounted.current) return;
      updateDraft(null); writeSubmitted.current = false;
      for (const key of ["sheet", "entries", "calendar-entries"]) void qc.invalidateQueries({ queryKey: [key] });
      answer(`Saved ${value.hours} hours for ${value.date}: ${value.description}. Your timesheet has not been submitted.`);
    } catch (e) { if (id === operation.current) answer(`The save was not confirmed. Check your timesheet before retrying. ${e instanceof Error ? e.message : "Connection failed."}`); }
    finally { finishOperation(id); }
  }
  function askDraft(value: Draft) {
    updateDraft(value);
    if (!value.date) answer("Which day should I fill? Say today, yesterday, Monday, or a date such as January 10.");
    else if (!value.description || value.hours === null) answer(`For ${value.date}, what should I fill and how many hours? Say add followed by your work, then time followed by the hours.`);
    else if (!value.project) answer("Which project is this work for? Say its name or choose it below.");
    else void saveDraft(value);
  }
  function useSuggestion(action: JarvisPageAction) {
    receiveCommand(); voice.setText(""); voice.silence(); setSuggestions([]);
    try { activatePageAction(action); answer(`Selected ${action.label}.`); }
    catch (error) { answer(error instanceof Error ? error.message : "That control is unavailable."); }
  }
  function openPerson(person: Employee) {
    receiveCommand(); voice.setText(""); setProfileChoices([]);
    const previous = location.pathname + location.search; rememberJarvisAction("opening a profile", () => navigate(previous));
    navigate(`${base}/people?person=${encodeURIComponent(person.id)}`); answer(`Opening ${person.full_name}'s profile.`);
  }
  function suggestControls(command: string) {
    const matches = matchPageActions(command);
    setSuggestions(matches.suggestions);
    if(matches.suggestions.length) { answer(`Do you mean ${matches.suggestions[0].label}? Say yes to perform it, or choose another option below.`); return; }
    const message="Sorry, I did not understand. Can you be more specific?";
    const version=++replyVersion.current;
    readingJira.current=false; setReply(message);
    voice.say(message,false,()=>{
      if(!mounted.current || version!==replyVersion.current) return;
      setReply(""); voice.setText(""); voice.resetListening();
    });
  }
  async function run(raw: string) {
    replyVersion.current++;
    if (raw.trim()) receiveCommand();
    const text = normalizeGitHubSpeech(raw,projectPrompt.current === "source" || location.pathname.endsWith("/editor")).toLowerCase()
    .replace(/\bjeera\b/g, "jira")
    .replace(/\bdialogue\b/g, "dialog")
    .replace(/\btime sheet\b/g, "timesheet")
      .replace(/\bdark mood\b/g, "dark mode")
        .replace(/\bgridview\b/g, "grid view")
         .replace(/\bgreat view\b/g, "grid view")
    .replace(/[^a-z0-9.\s-]/g, " ")
    .replace(/\s+/g, " ").trim()
    .replace(/^(?:(?:jarvis|please)\s+)+/, "" )
    .replace(/^(?:can|could) you\s+(?:please\s+)?(?=(?:open|click)\b)/, "" )
    .replace(/^(open|click(?: on)?)\s+my\s+/, "$1 ");
    if (/^stop scrolling[.!?]*$/.test(text)) { stopJarvisScroll(); voice.setText(""); voice.silence(); setReply("Scrolling stopped."); return; }
    if (/^(?:please )?scroll(?: (?:the )?(?:page|popup|dialog))? (?:to (?:the )?)?(down|up|top|bottom)[.!?]*$/.test(text)) {
      voice.setText(""); const direction=text.match(/(down|up|top|bottom)[.!?]*$/)![1] as "down"|"up"|"top"|"bottom";
      setReply(scrollJarvis(direction) ? "Scrolling… Say stop scrolling to pause." : "There is nothing to scroll here."); return;
    }
    if (/^(?:jarvis\s+)?(?:please\s+)?listen(?:\s+(?:again|to me))?$/.test(text.replace(/[.!?]+$/, ""))) {
      voice.setText(""); voice.resetListening(); setReply("Ready for your next command."); return;
    }
    if (/^(?:please )?remove(?: (?:all|suggestions|the suggestions|all suggestions))?[.!?]*$/.test(text)) { interruptReply(true,text); return; }
    if (/^(?:please )?(?:close|dismiss)(?: (?:the )?(?:popup|pop up|dialog|modal|window))?[.!?]*$/.test(text)) {
      voice.discardCommand(); voice.setText("");
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).filter(dialog =>
        !dialog.classList.contains("jarvis-layer") && !dialog.closest('[aria-hidden="true"],[inert]') &&
        dialog.getBoundingClientRect().width > 0 && getComputedStyle(dialog).visibility !== "hidden");
      const top = dialogs.at(-1);
      const close = top?.querySelector<HTMLButtonElement>('button[aria-label^="Close" i],button[data-jarvis-close]') || top?.parentElement?.closest('[role="dialog"]')?.querySelector<HTMLButtonElement>('button[aria-label^="Close" i]');
      if (close && !close.disabled) { close.click(); setReply(""); }
      else setReply(top ? "This popup has no available close action." : "There is no popup open.");
      voice.startListening(); return;
    }
    if (modeChoiceRef.current) {
      if (/\bapproval(?: mode)?\b/.test(text)) { chooseWorkflowMode("approval"); return; }
      if (/\bauto(?: mode)?\b/.test(text)) { chooseWorkflowMode("auto",modeChoiceRef.current === "caution"); return; }
      answer("Select a workflow mode using the buttons or your voice."); return;
    }
    const approval = document.querySelector<HTMLElement>('[data-jarvis-approval]');
    if (approval && /^(?:yes|yes please|yeah|yep|do it|proceed|continue|go ahead)[.!?]*$/.test(text)) {
      voice.discardCommand(); voice.setText("");
      window.dispatchEvent(new CustomEvent("jarvis-step-approve",{detail:approval.dataset.jarvisApproval})); return;
    }
    if (/^(?:undo|undo (?:that|last action|last task)|revert|go back)$/.test(text)) { cancel(true); answer(undoJarvisAction()); return; }
    if (location.pathname.endsWith("/editor") && /^(?:use|follow)(?: the)? (?:(?:issue )?summary|title|description)(?: instructions)?$/.test(text) && document.querySelector(".task-requirements")) {
      voice.setText(""); window.dispatchEvent(new CustomEvent("jarvis-requirements-choice", { detail: /description/.test(text) ? "description" : "title" })); return;
    }
    if (/^(?:do it|finish the task|lets finish the task|let s finish the task)$/.test(text) && location.pathname.endsWith("/editor")) {
      voice.setText(""); window.dispatchEvent(new Event("jarvis-task-approve")); return;
    }
    if (projectPrompt.current === "open" && /^(?:yes|yes please|open editor|open the editor|open project files|open the project files|(?:yes )?[a-z][a-z0-9_]*-\d+)$/.test(text)) {
      openIssueEditor(text.match(/[a-z][a-z0-9_]*-\d+/i)?.[0].toUpperCase()); return;
    }
    if (projectPrompt.current === "source" && /\b(?:github|git|get|local|computer)\b/.test(text)) {
      chooseProjectSource(!/\b(?:local|computer)\b/.test(text)); return;
    }
    if (location.pathname.endsWith("/editor") && document.querySelector(".editor-repository-choices")) {
      const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".editor-repository-choices button"));
      const selected = buttons.find(button => normalize(button.textContent || "") === normalize(text));
      if (selected) { voice.setText(""); window.dispatchEvent(new CustomEvent("jarvis-github", { detail: { repositoryName: selected.textContent } })); voice.silence(); setReply(""); return; }
    }
    if (isJarvisStopCommand(text) || /^(?:skip|skip reading)$/.test(text)) { interruptReply(true, text); return; }
    if (locked.current) {
      if (queued.current.length >= 5) { setReply("Five requests are already waiting. Say no to cancel them."); return; }
      queued.current.push(raw);
      voice.setText("");
      setReply("Your next request is queued. Say no to stop and cancel waiting requests.");
      return;
    }
    voice.setText("");
    voice.silence();
    const numberWords: Record<string, number> = { one: 0, first: 0, two: 1, second: 1, three: 2, third: 2, four: 3, fourth: 3, five: 4, fifth: 4 };
    const selection = text.replace(/^(?:option|number|the)\s+/, "").replace(/\s+one$/, "");
    const index = /^\d$/.test(selection) ? Number(selection) - 1 : numberWords[selection];
    if (suggestions.length || profileChoices.length) {
      const choiceIndex = /^(?:yes|yes please|yes do it|yeah|yep|correct|that one)$/.test(text) ? 0 : index;
      if (choiceIndex !== undefined) {
        if (suggestions[choiceIndex]) useSuggestion(suggestions[choiceIndex]);
        else if (profileChoices[choiceIndex]) openPerson(profileChoices[choiceIndex]);
        else answer("Choose one of the displayed options.");
        return;
      }
    }
    const selectedPerson = profileChoices.find(person => normalizeAction(person.full_name) === actionTarget(text));
    if (selectedPerson) { openPerson(selectedPerson); return; }
    setSuggestions([]); setProfileChoices([]); setAvailableControls([]);
    const id = ++operation.current; controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    writeSubmitted.current = false; locked.current = true; setBusy(true);
    const valid = () => mounted.current && id === operation.current;
    const go = (path: string, message: string) => { if (valid()) { const previous = location.pathname + location.search; rememberJarvisAction("navigation", () => navigate(previous)); navigate(base + "/" + path); answer(message); } };
    try {
      const resumeDownload=document.querySelector<HTMLButtonElement>('.resume-style-preview-modal [data-jarvis-resume-download]');
      if(resumeDownload && /^(?:(?:can|could) you )?(?:please )?(?:click )?(?:download|export)(?: (?:my |the |this |selected )?(?:resume|pdf|resume pdf|it))?(?: please)?[.!?]*$/.test(text)) {
        if(resumeDownload.disabled) { answer("Your resume is still being prepared. Say download when the preview is ready."); return; }
        resumeDownload.click(); voice.setText(""); answer("Preparing your selected resume download."); return;
      }
      if (/^(?:log\s*out|logout|sign\s*out) and (?:log\s*in|login|sign\s*in)(?: in (?:3|three) seconds)?[.!?]*$/.test(text)) {
        sessionStorage.setItem("jarvis-login-once",String(Date.now()));
        await signOut(); navigate("/login"); onClose(); return;
      }
      if (/^(?:export|download)(?:[- ]download)? (?:them|both|both documents)[.!?]*$/.test(text) && document.querySelector('.profile-document-pair')) {
        window.dispatchEvent(new Event("jarvis-profile-pair-download")); answer("Downloading your ID card and resume together."); return;
      }
      const howTo = text.match(/^how\s+(?:(?:can|do|could|should)\s+i|to)\s+(?:please\s+)?(view|download|open|see|access|export)\s+(?:(?:my|the|a)\s+)?(.+?)[.!?]*$/);
      const pair = /\bid card\b/.test(text) && /\bresume\b/.test(text) && (/\b(?:show|open|click)\b/.test(text) || !!howTo);
      const walkthrough = text.match(/^(?:walkthrough|walk through|guide me)(?: to| through)?(?: my| the)? (.+?)[.!?]*$/);
      if (pair || walkthrough || howTo) {
        const target=walkthrough?.[1] || howTo?.[2] || "id card and resume";
        const downloadGuide=!!howTo && /download|export/.test(howTo[1]);
        const documentLabels:Record<string,string>={"id card":"ID card",resume:"Resume","business card":"Business card","pan card":"PAN card","aadhaar card":"Aadhaar card",payslip:"Payslip","offer letter":"Offer letter","joining letter":"Joining letter","relieving letter":"Relieving letter",certificate:"Certificate","personal document":"Other personal document"};
        const documentLabel=documentLabels[target.replace(/^my /,"")];
        const narrate=async(message:string)=>{
          setReply("");
          let index=0; const timer=window.setInterval(()=>{ if(!abort.signal.aborted) setReply(message.slice(0,++index)); },25);
          try {
            await new Promise<void>((resolve)=>{
              const timeout=window.setTimeout(resolve,15000);
              const finish=()=>{clearTimeout(timeout); resolve();};
              abort.signal.addEventListener("abort",finish,{once:true});
              voice.say(message,false,()=>{abort.signal.removeEventListener("abort",finish); finish();});
            });
          } finally { clearInterval(timer); }
          if(abort.signal.aborted) throw new Error("Walkthrough stopped.");
          setReply(message);
        };
        if(pair || documentLabel || /\bprofile\b/.test(target)) {
          await narrate("First, I am opening People.");
          const peopleLink=[...document.querySelectorAll<HTMLAnchorElement>('a[href]')].find(a=>a.pathname===base+"/people" && a.getClientRects().length);
          if(peopleLink) { await guideClick(`a[href="${peopleLink.getAttribute("href")}"]`,abort.signal); }
          else navigate(base+"/people");
          await automationWait(600,abort.signal);
          await narrate("Next, I am finding your profile.");
          const search=document.querySelector<HTMLInputElement>('[aria-label="Search people"]');
          if(search && profile?.full_name) {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(search,profile.full_name);
            search.dispatchEvent(new Event("input",{bubbles:true}));
          }
          if(!document.querySelector(`[data-profile-documents="${profile?.id}"]`)) await guideClick(`[data-person-id="${profile?.id}"] .person-card-main`,abort.signal);
          if(pair || documentLabel) {
            await narrate("I am scrolling to your profile documents.");
            const selector=`[data-profile-documents="${profile?.id}"]`;
            const documents=await (await import("../lib/jarvisUiAutomation")).automationElement(selector,abort.signal);
            documents.scrollIntoView({block:"center",behavior:"smooth"});
            await automationWait(700,abort.signal);
            if(pair) {
              window.dispatchEvent(new Event("jarvis-profile-pair"));
              await narrate("Your ID card and resume are opening side by side. Say download them to export both.");
            } else {
              await narrate(`I am opening your ${documentLabel}.`);
              await guideClick(`${selector} [aria-label="View ${documentLabel}"]`,abort.signal);
              if(downloadGuide) {
                const dialog=await (await import("../lib/jarvisUiAutomation")).automationElement('[role="dialog"] .document-view-actions',abort.signal);
                dialog.scrollIntoView({block:"center",behavior:"smooth"});
                const labels=[...dialog.querySelectorAll<HTMLElement>('button,a')].filter(e=>e.getClientRects().length && /download|^pdf$|^word$/i.test(e.textContent?.trim() || "")).map(e=>e.textContent?.trim()).filter(Boolean);
                await narrate(`Here is your ${documentLabel}. To download it, select ${labels.length ? labels.join(" or ") : "the download button"}. You can say click followed by the button name.`);
              } else await narrate(`Here is your ${documentLabel}.`);
            }
          } else await narrate("Here is your profile.");
        } else {
          const page=target.replace(/^my /,"");
          const routes:Record<string,string>={calendar:"calendar",projects:"projects",timesheet:"timesheets",people:"people",editor:"editor",teams:"teams",analytics:"analytics",maps:"maps",documents:"documents",history:"reports",overview:"home","time off":"leave",settings:"profile",approvals:"approvals","access management":"access"};
          const route=routes[page];
          const action=matchPageActions(`open ${page}`).exact[0];
          if(action) { await narrate(`I am selecting ${page}.`); await (await import("../lib/jarvisUiAutomation")).automationClick(action.element,abort.signal); }
          else if(route && route!=="access" && route!=="approvals") {
            await narrate(`I am opening ${page}.`); navigate(base+"/"+route); await automationWait(600,abort.signal);
          } else { answer("Open the page containing that control and say what can I do here. I could not find a walkthrough target."); return; }
          await narrate(`You are now at ${page}. Say what can I do here for the available actions.`);
        }
        return;
      }
      if (location.pathname.endsWith("/editor") && /^(?:(?:sync from|click(?: on)?|open) )?(?:git ?hub|get hub|get up)(?: button)?$/.test(text)) {
        window.dispatchEvent(new CustomEvent("jarvis-github", { detail: "open" }));
        rememberJarvisAction("opening GitHub import", () => {
          const dialog = document.querySelector('.github-import-modal');
          if (!dialog) throw new Error("The GitHub import dialog is already closed.");
          dialog.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')?.click();
        });
        answer("Choose the repository URL, then say find repository to import its files."); return;
      }
      if (/^(?:click )?find repository$/.test(text) && document.querySelector('.github-import-modal')) {
        const find = discoverPageActions().find(action => action.label === "Find repository");
        if (!find) { answer("Enter a repository URL and wait for the current operation to finish first."); return; }
        window.dispatchEvent(new CustomEvent("jarvis-github", { detail: "find" }));
        answer("Finding the repository, then importing its files. Say undo after import to restore your workspace."); return;
      }
      if (/^(?:log\s*out|sign\s*out|logout)(?:\s+please)?$/.test(text)) { await signOut(); if (valid()) onClose(); return; }
      if (/^(?:close|hide|dismiss)\s+(?:jarvis|assistant)$/.test(text)) { onClose(); return; }
      if (/^(?:open|show|go to)\s+(?:the\s+)?(?:login|sign in)(?:\s+page)?$/.test(text)) { answer("You are already signed in. Say log out if you want to end your session."); return; }
      if (/what (?:can|could) (?:i|you) do here|available (?:actions|controls)|what.*(?:buttons|links).*here/.test(text)) {
        const labels = [...new Set(discoverPageActions().map(action => action.label))];
        setAvailableControls(labels);
        answer(labels.length ? `On this page you can select ${labels.slice(0, 10).join(", ")}. The available actions are listed below.` : "There are no enabled page controls available right now."); return;
      }
      if (/^(?:open|show|click|view)\s+.+\bprofile$/.test(text) && !/\bmy profile$/.test(text)) {
        const name = normalizeAction(text.replace(/^(?:open|show|click|view)\s+/, "").replace(/\s+profile$/, "").replace(/\s+s$/, ""));
        const people = preview ? previewEmployees : await directoryPeople();
        if (!valid()) return;
        const exact = people.filter(person => normalizeAction(person.full_name) === name);
        const matches = exact.length ? exact : people.filter(person => normalizeAction(person.full_name).includes(name));
        if (matches.length === 1) { openPerson(matches[0]); return; }
        if (matches.length > 1) { setProfileChoices(matches.slice(0, 5)); answer(`I suggest ${matches[0].full_name}. Say yes to open this profile, or choose another name below.`); return; }
        const similar = people.map(person => ({ person, score: actionSimilarity(name, normalizeAction(person.full_name)) }))
          .filter(item => item.score >= .45).sort((a, b) => b.score - a.score).slice(0, 5).map(item => item.person);
        if (similar.length) { setProfileChoices(similar); answer(`Do you mean ${similar[0].full_name}? Say yes to open this profile, or choose another name below.`); return; }
        answer("I could not find that employee. Please give their full name or open the People page."); return;
      }
      // Resolve current-page controls before falling back to page navigation.
      const control = matchPageActions(text);
      if (control.exact.length === 1) { useSuggestion(control.exact[0]); return; }
      if (control.exact.length > 1) { setSuggestions(control.suggestions); answer(`Do you mean ${control.suggestions[0].label}? Say yes to perform it, or choose another option below.`); return; }
      if (draftRef.current) {
        const value = { ...draftRef.current };
        if (!value.date) value.date = jarvisDate(text) || "";
        const hours = spokenHours(text); if (hours !== null) value.hours = hours;
        const project = projectRef.current.find(p => text.includes(p.name.toLowerCase())); if (project) value.project = project.id;
        if (/\badd\b/.test(text)) value.description = raw.replace(/^.*?\badd\s+/i, "").replace(/\b(?:time|hours?)\s+.*$/i, "").trim();
        else if (!value.description && hours === null && !project && !jarvisDate(text)) value.description = raw.trim();
        locked.current = false; setBusy(false); askDraft(value); return;
      }
      const requestedTheme = themeFromSpeech(text); if (requestedTheme && /\b(mode|theme)\b/.test(text)) { rememberJarvisAction("changing the theme", () => setTheme(theme)); setTheme(requestedTheme.value); answer(`Switched to ${requestedTheme.label} mode.`); return; }
      if (/\b(?:add|new|create|remove)\b.*\bemployee\b/.test(text)) {
        if (member?.role !== "admin") { answer("Sorry, you have no access. Only administrators can manage employees."); return; }
        go(`access?${/\bremove\b/.test(text) ? "delete" : "new"}=1&jarvis=${Date.now()}`, "Opening employee management. You can review the details in the dialog."); return;
      }
      if (/\b(grid|card|list|table|chart)\b/.test(text) && /\b(view|switch|change)\b/.test(text)) {
        const kind = text.match(/\b(grid|card|list|table|chart)\b/)![1];
        const matches = matchPageActions(`${kind} view`);
        if (matches.exact.length === 1) { useSuggestion(matches.exact[0]); return; }
        if (matches.exact.length > 1) { setSuggestions(matches.exact); answer(`Do you mean ${matches.exact[0].label}? Say yes to select it, or choose another option below.`); return; }
        answer(`This page does not currently offer ${kind} view.`); return;
      }
      if (/\bcalendar\b/.test(text)) {
        const view = /\byear(?:ly)?\b/.test(text) ? "year" : /\bweek(?:ly)?\b/.test(text) ? "week" : /\b(?:day|daily)\b/.test(text) ? "day" : "month";
        const year = text.match(/\b(20\d{2})\b/)?.[1];
        const date = jarvisDate(text) || (year ? `${year}-01-01` : dateKey(new Date()));
        go(`calendar?view=${view}&date=${date}`, `Opening the ${view} calendar.`); return;
      }
      if (/\b(download|export)\b/.test(text) && /\btimesheet\b/.test(text)) {
        const range = raw.match(/\bfrom\s+(.+?)\s+(?:to|until|till|through)\s+(.+)$/i);
        const start = range ? jarvisDate(range[1]) : null;
        const end = range ? jarvisDate(range[2]) : dateKey(new Date());
        locked.current = false; setBusy(false);
        if (start && end) { await exportTimesheet(start, end); return; }
        setExporting(true); answer("Choose the start and end dates below, then download your timesheet."); return;
      }
      if (/\b(fill|record|add)\b.*\b(timesheet|time entry)\b/.test(text)) {
        const list = preview ? previewProjects : await projects();
        if (!valid()) return;
        const active = list.filter(p => p.status === "active"); projectRef.current = active; setProjects(active);
        const value = blank(); value.date = jarvisDate(text) || ""; value.project = active.length === 1 ? active[0].id : "";
        value.hours = spokenHours(text);
        if (/\badd\b/i.test(raw) && /\btimesheet\b.*\badd\b/i.test(raw)) value.description = raw.replace(/^.*?\badd\s+/i, "").replace(/\b(?:time|hours?)\s+.*$/i, "").trim();
        locked.current = false; setBusy(false); askDraft(value); return;
      }
      if (/\btimesheet\b/.test(text) && /\b(filled|date|complete|missing|status)\b/.test(text)) {
        const today = dateKey(new Date()), start = weekStart();
        const rows = await ownEntries(start, today, abort.signal); if (!valid()) return;
        const days: string[] = [];
        for (let d = new Date(start + "T12:00:00"); dateKey(d) <= today; d.setDate(d.getDate() + 1)) if (![0, 6].includes(d.getDay())) days.push(dateKey(d));
        const missing = days.filter(day => !rows.some(r => r.work_date === day && r.minutes > 0));
        answer(missing.length ? `For this week through today, there are no recorded hours on ${missing.join(", ")}. This checks entries, not your required hours or approved leave.` : "Your timesheet has recorded hours for every weekday this week through today. This checks entries, not required hours or submission status."); return;
      }
      if (/\b(holiday|holidays|event|events)\b/.test(text)) {
        const holiday = /\bholidays?\b/.test(text); const today = dateKey(new Date());
        if (preview) {
          const next = companyHolidays.find(h => h.day >= today && (!profile?.location || h.locations.includes(profile.location)));
          answer(holiday && next ? `The next preview holiday is ${next.name} on ${next.day}.` : "There are no upcoming events in this preview."); return;
        }
        let q = client().from(holiday ? "holidays" : "events").select("*");
        q = holiday ? q.gte("day", today).order("day") : q.gte("starts_at", new Date().toISOString()).order("starts_at");
        const { data, error } = await q.limit(100).abortSignal(abort.signal); if (error) throw error; if (!valid()) return;
        const next = data.find(item => !holiday || !Array.isArray(item.locations) || !item.locations.length || item.locations.includes(profile?.location));
        answer(next ? `The next ${holiday ? "holiday" : "event"} is ${next.name}, on ${holiday ? next.day : new Date(next.starts_at).toLocaleString()}. ${next.description || ""}` : `There are no upcoming ${holiday ? "holidays" : "events"} visible to you.`); return;
      }
      if (/\b(jira|issues?|tickets?)\b/.test(text) && /\b(assigned|any|my|have|show|check)\b/.test(text)) {
        if (preview) { answer("Jira is available after you sign into your connected workspace."); return; }
        const query = assignedJiraQuery(profile?.user_id || "");
        const ready = qc.getQueryData<AssignedJiraIssues>(query.queryKey);
        const sync = ready || await qc.fetchQuery(query);
        if (!sync || !Array.isArray(sync.issues)) throw new Error("Jira did not return an issue list. Please try again.");
        if (!valid()) return;
        // Refresh stale data without delaying the spoken count. The task runner
        // separately rechecks current Jira requirements before making edits.
        if (ready) void qc.prefetchQuery(query);
        assignedIssues.current = sync.issues;
        projectPrompt.current = sync.issues.length ? "open" : null;
        if (!sync.issues.length) { answer("There are no issues assigned to you."); return; }
        readJiraIssues(`Yes, ${sync.issues.length} visible issues are assigned to the connected Jira account. ${sync.issues.map(issue => issue.key).join(", ")}.`); return;
      }
      if (/\b(?:open|click|press|tap|select|show|go|take|launch)\b/.test(text)) {
        if (/\bjira\b/.test(text)) { openJira(); answer("Opening Jira."); return; }
        if (/\boutlook|\bmail\b/.test(text)) { answer("Outlook mail is not connected yet."); return; }
        const routes: [RegExp, string, string][] = [
          [/\b(?:my )?profile\b/, `people?person=${encodeURIComponent(profile?.id || "")}`, "your profile"],
          [/\bprojects?\b/, "projects", "projects"], [/\bpeople|employees?\b/, "people", "people"],
          [/\btimesheets?\b/, "timesheets", "your timesheet"], [/\bteams\b/, "teams", "Teams"],
          [/\beditor\b/, "editor", "the editor"], [/\btime off|leave\b/, "leave", "time off"],
          [/\bdocuments?|notes\b/, "documents", "documents"], [/\bhistory|reports\b/, "reports", "history"],
          [/\boverview|home|dashboard\b/, "home", "the overview"], [/\bsettings\b/, "profile", "settings"],
          [/\baccess|permissions\b/, "access", "access management"], [/\bapprovals\b/, "approvals", "approvals"],
          [/\banalytics\b/, "analytics", "analytics"], [/\bmaps?\b/, "maps", "maps"],
        ];
        const found = routes.find(([pattern]) => pattern.test(text));
        if (found) {
          if ((found[1] === "access" && member?.role !== "admin") || (found[1] === "approvals" && member?.role === "employee")) { answer("Sorry, you have no access to that page."); return; }
          go(found[1], `Opening ${found[2]}.`); return;
        }
      }
      suggestControls(text);
    } catch (e) { if (valid()) answer(e instanceof Error ? e.message : "I could not complete that request. Please try again."); }
    finally { finishOperation(id); }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }} modal={false}>
    <Dialog.Portal><Dialog.Content className={`jarvis-layer${introReveal?" jarvis-intro-reveal":""}`} onInteractOutside={e => e.preventDefault()} onOpenAutoFocus={e => e.preventDefault()}>
      <Dialog.Title className="jarvis-accessible">Jarvis</Dialog.Title>
      <Dialog.Description className="jarvis-accessible">Voice controls</Dialog.Description>
      <div ref={dialogRef} className={`jarvis-conversation${docked.current ? " is-docked" : ""}`} tabIndex={0} aria-label="Draggable Jarvis animation" style={position ? { left: position.left, top: position.top, transform: "none", ...(size || {}), maxWidth: `calc(100vw - ${position.left + 8}px)`, maxHeight: `calc(100dvh - ${position.top + 8}px)` } : undefined}
        onPointerDown={beginDrag} onPointerMove={continueDrag} onPointerUp={endDrag} onPointerCancel={() => { drag.current = null; }}
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return;
          const box = dialogRef.current?.getBoundingClientRect(); if (!box) return;
          const step = event.shiftKey ? 40 : 10;
          const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
          if (delta[event.key]) { event.preventDefault(); moveDialog(box.left + delta[event.key][0], box.top + delta[event.key][1]); }
        }}>
      <button className="jarvis-close icon-button" onClick={onClose} aria-label="Close Jarvis"><X size={20} /></button>
      {lightAnimation ? <img className={`jarvis-orb jarvis-orb--light ${voice.speaking ? "is-speaking" : ""}`} src={lightVideo} alt="" />
        : <img className={`jarvis-orb ${voice.speaking ? "is-speaking" : ""}`} src={gif} alt="" />}
      </div>
      <div ref={bodyRef} className="jarvis-conversation-body" style={bodyLeft === null ? undefined : {left:bodyLeft,transform:"none"}} onPointerDown={beginBodyDrag} onPointerMove={continueBodyDrag} onPointerUp={endBodyDrag} onPointerCancel={() => { bodyDrag.current = null; }}>
        <p className="jarvis-reply" role="status">{reply}</p>
        <form onSubmit={e => { e.preventDefault(); voice.submit(); }} className="jarvis-command">
          <input ref={inputRef} aria-label="Speak or type to Jarvis" value={voice.text} onChange={e => voice.setText(e.target.value)} placeholder={voice.listening ? "Listening again…" : voice.error ? "Microphone unavailable — click the mic" : "Connecting microphone…"} maxLength={2000} />
          <button type="button" className="icon-button" aria-label={voice.listening ? "Pause microphone" : "Start microphone"} aria-pressed={voice.listening} onClick={() => voice.listening ? voice.stopListening() : voice.startListening()}>{voice.listening ? <Mic size={19} /> : <MicOff size={19} />}</button>
          <button className="icon-button" aria-label="Send request" disabled={!voice.text.trim() && !busy}><ArrowUp size={19} /></button>
          <button type="button" className="icon-button" aria-label="Stop Jarvis" onClick={() => cancel(true)}><Square size={16} /></button>
        </form>
        <small>{busy ? "Working… Say no to stop." : voice.speaking ? "Jarvis is speaking" : voice.listening ? "" : ""} </small>

        {suggestions.length > 0 && <div className="jarvis-suggestions" aria-label="Suggested actions">{suggestions.map((action, index) => <button type="button" className="button secondary" key={action.id} disabled={busy} onClick={() => useSuggestion(action)}>{index + 1}. {action.label}</button>)}</div>}
        {profileChoices.length > 0 && <div className="jarvis-suggestions" aria-label="Choose an employee">{profileChoices.map((person, index) => <button type="button" className="button secondary" key={person.id} onClick={() => openPerson(person)}>{index + 1}. {person.full_name}</button>)}</div>}
        {availableControls.length > 0 && <details open><summary>Available actions on this page</summary><ul>{availableControls.map(label => <li key={label}>{label}</li>)}</ul></details>}
        {voice.error && <p role="alert">{voice.error}</p>}
        {draft && <div className="jarvis-draft">
          <label>Date<input type="date" max={dateKey(new Date())} value={draft.date} onChange={e => updateDraft({ ...draft, date: e.target.value })} /></label>
          <label>Work description<textarea maxLength={3000} value={draft.description} onChange={e => updateDraft({ ...draft, description: e.target.value })} /></label>
          <label>Hours<input type="number" min="0.25" max="24" step="0.25" value={draft.hours ?? ""} onChange={e => updateDraft({ ...draft, hours: e.target.value ? Number(e.target.value) : null })} /></label>
          <label>Project<select value={draft.project} onChange={e => updateDraft({ ...draft, project: e.target.value })}><option value="">Choose project</option>{availableProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <button className="button" disabled={busy} onClick={() => void saveDraft(draft)}>Save time entry</button>
        </div>}
        {exporting && <div className="jarvis-draft"><label>From<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>To<input type="date" max={dateKey(new Date())} value={to} onChange={e => setTo(e.target.value)} /></label><button className="button" disabled={busy} onClick={() => void exportTimesheet(from, to)}>Download CSV</button></div>}
        <small></small>
      </div>
    </Dialog.Content></Dialog.Portal>
    <Dialog.Root open={!!modeChoice} onOpenChange={open => { if(!open) cancel(true); }} modal={false}>
      <Dialog.Portal>
        <div className="jarvis-mode-backdrop" aria-hidden="true" />
        {(autoHover || modeChoice === "caution") && <video className="jarvis-auto-video" src={cautionVideo} autoPlay muted loop playsInline aria-hidden="true"/>}
        <Dialog.Content className="jarvis-mode-popup" aria-describedby={modeChoice === "caution" ? "jarvis-mode-warning" : undefined} onInteractOutside={event => event.preventDefault()}>
          <Dialog.Title>Choose workflow mode</Dialog.Title>
          <div className="jarvis-mode-options" role="group" aria-label="Workflow mode">
            <button type="button" className={`jarvis-mode-button jarvis-approval-glitch${modeChoice !== "caution" ? " is-selected" : ""}`} aria-pressed={modeChoice !== "caution"} onClick={() => chooseWorkflowMode("approval")}>Approval Mode</button>
            <button type="button" className={`jarvis-mode-button jarvis-auto-mode${modeChoice === "caution" ? " is-selected" : ""}`} onPointerEnter={()=>setAutoHover(true)} onPointerLeave={()=>setAutoHover(false)} aria-pressed={modeChoice === "caution"} onClick={() => chooseWorkflowMode("auto",modeChoice === "caution")}>Auto Mode</button>
          </div>
          {modeChoice === "caution" && <p id="jarvis-mode-warning" className="jarvis-mode-warning" aria-label={autoModeWarning}>{autoModeWarning.slice(0,warningLength)}<span aria-hidden="true" className="jarvis-warning-caret">▏</span></p>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </Dialog.Root>;
}
