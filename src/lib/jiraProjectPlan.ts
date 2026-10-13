import { identifySourceElements, matchPublishedElement } from "./jarvisElementIdentity";
import { planJarvisInstruction } from "./jarvisInstructions";
import type { WorkspaceFiles } from "./editorGithub";
import type { SimplePlan } from "./simpleTasks";
import type { SiteElement } from "./publishedSite";
// Jira rich-text layout and invisible characters should not change a command's meaning.
export function normalizeJiraInstruction(value: string) {
  return value.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim();
}
// Deliberately bounded: ambiguity produces a refusal, never an arbitrary source edit.
export function jiraProjectPlan(command: string, files: WorkspaceFiles, elements: SiteElement[]): SimplePlan {
  command = normalizeJiraInstruction(command);
  if (!/left\s+side\s+panel.*background.*sign\s*in.*background.*JOB\s*DESK.*black/i.test(command)) return planJarvisInstruction(command, files, "");
  const html = Object.keys(files).filter(path => /\.html?$/i.test(path));
  const candidates = html.map(path => ({ path, document: new DOMParser().parseFromString(files[path], "text/html") })).filter(item => /job\s*desk/i.test(item.document.body.textContent || ""));
  if (candidates.length !== 1) throw new Error("I cannot safely identify one HTML page containing JOB DESK. Use the companion for this task.");
  const { path, document } = candidates[0];
  const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
  const signIn = elements.filter(e => ["button", "a", "input"].includes(e.tag) && normalize(e.text) === "signin" && !["transparent", "rgba(0, 0, 0, 0)"].includes(e.background));
  const labels = elements.filter(e => normalize(e.text) === "jobdesk" && (e.childCount === undefined || e.childCount === 0));
  const leftCandidates = elements.filter(e => e.x >= 0 && e.x < 100 && e.width >= 150 && e.width < 900 && e.height >= 350);
  let panels = leftCandidates.filter(e => /left|sidebar|side-panel|sidepanel/i.test([e.id, ...e.classes].join(" ")));
  if (!panels.length && labels.length === 1 && labels[0].domPath) {
    // Geometry plus containment identifies an unnamed left panel; never choose by geometry alone.
    const containing = leftCandidates.filter(e => e.domPath && labels[0].domPath!.startsWith(e.domPath + " > ") && !["transparent", "rgba(0, 0, 0, 0)"].includes(e.background));
    const largestArea = Math.max(0, ...containing.map(e => e.width * e.height));
    panels = containing.filter(e => e.width * e.height === largestArea);
  }
  if (signIn.length !== 1 || panels.length !== 1 || labels.length !== 1) throw new Error("I cannot uniquely identify the left panel, JOB DESK text and sign-in button on the published site. No files changed.");
  const panelElement = matchPublishedElement(document, panels[0]);
  const labelElement = matchPublishedElement(document, labels[0]);
  const buttonElement = matchPublishedElement(document, signIn[0]);
  const color = signIn[0].background;
  if (!panelElement || !labelElement || !buttonElement || !panelElement.contains(labelElement) || !/^rgba?\([0-9.,% ]+\)$/.test(color)) throw new Error("The intended published elements could not be confidently located in the imported HTML. No files changed.");
  const original = files[path];
  const identified = identifySourceElements(original, document, [
    { element: panelElement, className: "jarvis-left-panel" },
    { element: labelElement, className: "jarvis-job-desk" },
  ]);
  const [panel, label] = identified.selectors;
  const rules = `<style id="jarvis-jira-panel">\n${panel} { background-color: ${color} !important; }\n${label} { color: #000000 !important; }\n</style>`;
  const pattern = /<style id="jarvis-jira-panel">[\s\S]*?<\/style>/;
  const content = pattern.test(identified.content) ? identified.content.replace(pattern, () => rules) : /<\/head\s*>/i.test(identified.content) ? identified.content.replace(/<\/head\s*>/i, () => `${rules}\n</head>`) : `${rules}\n${identified.content}`;
  return { summary: "Matched the left panel background to the sign-in button and changed JOB DESK text to black", changes: content === original ? [] : [{ path, content, reason: "Added unique Jarvis styling classes to confidently matched source elements" }] };
}
