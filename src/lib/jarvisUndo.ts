type Step = { label: string; undo: (() => void) | null };
const history: Step[] = [];
let reverting = false;
export function rememberJarvisAction(label: string, undo: (() => void) | null) {
  if (!reverting) { history.push({ label, undo }); if (history.length > 20) history.shift(); }
}
export function undoJarvisAction() {
  const step = history.at(-1);
  if (!step) return "There is no previous action to undo.";
  if (!step.undo) return `I cannot automatically undo ${step.label}. Please review it in the original app.`;
  reverting = true;
  try { step.undo(); history.pop(); return `Undid ${step.label}.`; }
  catch (error) { return error instanceof Error ? error.message : "That action cannot be undone here."; }
  finally { reverting = false; }
}
export function clearJarvisHistory() { history.length = 0; }
