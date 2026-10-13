export type CalendarAutomationDraft = { date: string; project: string; projectId: string; description: string; minutes: number };
export function automationWait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve,reject) => {
    if (signal.aborted) { reject(new Error("Task stopped")); return; }
    const stop = () => { clearTimeout(timer); reject(new Error("Task stopped")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort",stop); resolve(); },ms);
    signal.addEventListener("abort",stop,{once:true});
  });
}
export async function automationElement(selector: string, signal: AbortSignal, root: ParentNode = document) {
  const deadline = Date.now()+30000;
  while (!signal.aborted && Date.now()<deadline) {
    const element = root.querySelector<HTMLElement>(selector);
    if (element && element.getBoundingClientRect().width) return element;
    await automationWait(100,signal);
  }
  throw new Error(`Could not find the calendar control: ${selector}`);
}
export async function automationClick(element: HTMLElement, signal: AbortSignal, keepRoute = false) {
  element.scrollIntoView({ block:"center", inline:"nearest", behavior:"smooth" });
  await automationWait(300,signal);
  const rect = element.getBoundingClientRect(), cursor = document.createElement("span");
  cursor.className = "jarvis-task-cursor"; cursor.setAttribute("aria-hidden","true"); cursor.textContent = "➤";
  document.body.append(cursor);
  try {
    const animation = cursor.animate([{transform:`translate(${Math.max(10,rect.left-160)}px,${Math.min(innerHeight-30,rect.top+110)}px)`},{transform:`translate(${rect.left+rect.width/2}px,${rect.top+rect.height/2}px)`}],{duration:900,easing:"ease-in-out",fill:"forwards"});
    await automationWait(900,signal); animation.finish();
    if (keepRoute) element.addEventListener("click",event => event.preventDefault(),{once:true,capture:true});
    element.click(); await automationWait(350,signal);
  } finally { cursor.remove(); }
}
