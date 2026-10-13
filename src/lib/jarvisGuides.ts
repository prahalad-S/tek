import { automationClick, automationElement, automationWait } from "./jarvisUiAutomation";
let scrollFrame = 0;
export function stopJarvisScroll() { cancelAnimationFrame(scrollFrame); scrollFrame = 0; }
export function scrollJarvis(direction: "up" | "down" | "top" | "bottom") {
  stopJarvisScroll();
  const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].filter(e => !e.closest('.jarvis-layer') && e.getClientRects().length);
  const root = dialogs.at(-1) || document.querySelector<HTMLElement>('.page-content') || document.body;
  const candidates = [root, ...root.querySelectorAll<HTMLElement>('*')].filter(e => e.scrollHeight > e.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(e).overflowY));
  const target = candidates.sort((a,b) => b.clientHeight-a.clientHeight)[0] || (dialogs.length ? root : document.scrollingElement as HTMLElement);
  if (!target || target.scrollHeight <= target.clientHeight) return false;
  const end = direction === "top" || direction === "up" ? 0 : target.scrollHeight-target.clientHeight;
  const sign = end < target.scrollTop ? -1 : 1;
  let previous = performance.now();
  function frame(now: number) {
    const delta = Math.min(50, now-previous); previous=now;
    const next = target.scrollTop + sign*delta*.22;
    target.scrollTop = sign > 0 ? Math.min(next,end) : Math.max(next,end);
    if (Math.abs(target.scrollTop-end)>1) scrollFrame=requestAnimationFrame(frame);
  }
  scrollFrame=requestAnimationFrame(frame); return true;
}
export async function guideClick(selector:string, signal:AbortSignal) {
  const element=await automationElement(selector,signal);
  await automationClick(element,signal);
}
export { automationWait };
