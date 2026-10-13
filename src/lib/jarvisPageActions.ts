import { rememberJarvisAction } from "./jarvisUndo";
export type JarvisPageAction = { id: string; label: string; aliases: string[]; element: HTMLElement };
const ids = new WeakMap<HTMLElement, string>();
let sequence = 0;
export function normalizeAction(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\bjeera\b/g, "jira").replace(/\bchat(?=\s+view\b)/g,"chart").replace(/\bsymbiosis\b/g,"symbiosys")
    .replace(/\btime sheets?\b/g, "timesheet").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
export function actionTarget(value: string) {
  return normalizeAction(value).replace(/^(?:(?:jarvis|please)\s+)+/, "")
    .replace(/^(?:can you |could you )?/, "")
    .replace(/^(?:open|click(?: on)?|press|tap|select|show|launch|go to|take me to|switch to|change to)\s+/, "")
    .replace(/^(?:the|a|my)\s+/, "").replace(/\s+(?:button|link|tab|page)(?: please)?$/, "").trim();
}
export function canUseControl(element: HTMLElement) {
  if (!element.isConnected || element.closest('.jarvis-layer,.jarvis-conversation,[inert],[aria-hidden="true"],[hidden]')) return false;
  if (element.matches(':disabled,[aria-disabled="true"]')) return false;
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
}
export function discoverPageActions(): JarvisPageAction[] {
  const result: JarvisPageAction[] = [];
  for (const element of document.querySelectorAll<HTMLElement>('button,a[href],[role="button"],[role="tab"],input[type="button"],input[type="submit"]')) {
    if (!canUseControl(element)) continue;
    const labelled = (element.getAttribute("aria-labelledby") || "").split(/\s+/).map(id => document.getElementById(id)?.textContent || "").join(" ").trim();
    const label = (element.getAttribute("aria-label") || labelled || element.innerText || element.getAttribute("title") || element.getAttribute("value") || "").replace(/\s+/g, " ").trim();
    if (!label || label.length > 160 || /\b(?:delete|clear all)\b/i.test(label)) continue;
    if (element instanceof HTMLAnchorElement && !["http:", "https:", "mailto:", "tel:"].includes(element.protocol)) continue;
    let id = ids.get(element); if (!id) { id = `control-${++sequence}`; ids.set(element, id); }
    const container = element.closest('article,.person-card,.project-card,[role="row"]');
    const context = container?.querySelector('h2,h3,h4,strong')?.textContent?.trim();
    const aliases = [normalizeAction(label), actionTarget(label)];
    if (/\b(?:card|grid) view\b/i.test(label)) aliases.push("grid view", "card view", "grid");
    if (/\blist view\b/i.test(label)) aliases.push("list view", "list");
    if (/\btable view\b/i.test(label)) aliases.push("table view");
    if (/\bchart view\b/i.test(label)) aliases.push("chart view");
    if (/^back to all people$/i.test(label)) aliases.push("close profile", "close my profile", "back to people");
    if (/^close dialog$/i.test(label)) {
      const dialog = element.closest('[role="dialog"]');
      const title = dialog?.querySelector('h1,h2,h3')?.textContent?.trim();
      aliases.push("close", "close popup", "close dialog");
      if (title) aliases.push(`close ${normalizeAction(title)}`);
      if (title && /jira/i.test(title)) aliases.push("close jira");
    }
    if (context && context !== label) aliases.push(normalizeAction(`${label} ${context}`), normalizeAction(context));
    result.push({ id, label: context && context !== label ? `${label} — ${context}` : label, aliases: [...new Set(aliases)], element });
  }
  return result;
}
export function actionSimilarity(a: string, b: string) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  const edit = 1 - row[b.length] / Math.max(a.length, b.length);
  const aw = new Set(a.split(" ")), bw = new Set(b.split(" "));
  const overlap = [...aw].filter(word => bw.has(word)).length / Math.max(aw.size, bw.size);
  return Math.max(edit, overlap * .9);
}
export function matchPageActions(command: string, actions = discoverPageActions()) {
  const target = actionTarget(command);
  const exact = actions.filter(action => action.aliases.includes(target) || action.aliases.includes(normalizeAction(command)));
  const ranked = actions.map(action => ({ action, score: Math.max(...action.aliases.map(alias => actionSimilarity(target, alias))) }))
    .filter(item => item.score >= .45).sort((a, b) => b.score - a.score).slice(0, 5).map(item => item.action);
  return { exact, suggestions: exact.length ? exact.slice(0, 5) : ranked };
}
export function activatePageAction(action: JarvisPageAction) {
  const fresh = discoverPageActions().find(item => item.id === action.id);
  if (!fresh || fresh.label !== action.label) throw new Error("That control is no longer available. Please repeat your command on the current page.");
  fresh.element.scrollIntoView({ block: "nearest", behavior: "instant" });
  const previousUrl = location.pathname + location.search;
  const dialogs = new Set(document.querySelectorAll('[role="dialog"]'));
  const previousToggle = document.querySelector<HTMLElement>('[aria-pressed="true"],[role="tab"][aria-selected="true"]');
  fresh.element.focus({ preventScroll: true });
  fresh.element.click();
  if (/^close/i.test(fresh.label)) return; // Modal records its own reopening action.
  window.setTimeout(() => {
    const opened = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(el => !dialogs.has(el) && !el.classList.contains("jarvis-layer"));
    if (opened) rememberJarvisAction(`opening ${fresh.label}`, () => {
      const close = opened.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]');
      if (!close?.isConnected) throw new Error("That dialog is no longer open.");
      close.click();
    });
    else if (location.pathname + location.search !== previousUrl) rememberJarvisAction(`opening ${fresh.label}`, () => {
      window.history.pushState(null, "", previousUrl); window.dispatchEvent(new PopStateEvent("popstate"));
    });
    else if (previousToggle && previousToggle !== fresh.element && fresh.element.hasAttribute("aria-pressed")) {
      rememberJarvisAction(`changing ${fresh.label}`, () => {
        if (!previousToggle.isConnected) throw new Error("Open the original page before undoing this view change.");
        previousToggle.click();
      });
    } else rememberJarvisAction(`selecting ${fresh.label}`, null);
  }, 0);
}
