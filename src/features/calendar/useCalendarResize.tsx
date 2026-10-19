import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { rangeDays, type CalendarEntry } from "./domain";
export function useCalendarResize(canEdit: (date: string) => boolean, onRestricted: (date: string) => void, onCommit: (entry: CalendarEntry, date: string, minutes: number) => void) {
  const [preview, setPreview] = useState<{ rects: {left:number;top:number;width:number}[]; background:string; label:string; hours:number; dayHours:number; x:number;y:number } | null>(null);
  const cleanup = useRef<() => void>(() => {});
  useEffect(() => () => cleanup.current(), []);
  function begin(event: React.PointerEvent, entry: CalendarEntry) {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const from = entry.calendar_span_start || entry.work_date;
    if (!canEdit(from)) { onRestricted(from); return; }
    cleanup.current();
    const source = event.currentTarget.closest<HTMLElement>(".work-entry")!;
    const origin = source.getBoundingClientRect();
    const originCell = document.elementFromPoint(origin.left+2,origin.top+2)?.closest<HTMLElement>(".work-calendar-day") || document.querySelector<HTMLElement>(`.work-calendar-day[data-date="${entry.work_date}"]`);
    const rowOffset = origin.top - (originCell?.getBoundingClientRect().top || origin.top-40);
    const background = getComputedStyle(source).getPropertyValue("--entry-color");
    let target = entry.work_date, minutes = Math.min(480, entry.minutes), moved = false, valid = false;
    const pointerId = event.pointerId;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      if (Math.hypot(e.clientX-event.clientX,e.clientY-event.clientY) < 3 && !moved) return;
      moved = true; source.style.visibility = "hidden";
      const cell = Array.from(document.querySelectorAll<HTMLElement>(".work-calendar-day[data-date]")).find(node => { const r=node.getBoundingClientRect(); return e.clientX>=r.left && e.clientX<=r.right && e.clientY>=r.top && e.clientY<=r.bottom; });
      valid = !!cell?.dataset.date;
      if (!cell || !cell.dataset.date) return;
      target = cell.dataset.date;
      valid = target >= from && rangeDays(from,target).length <= 32;
      if (!valid) { setPreview(null); return; }
      const b = cell.getBoundingClientRect();
      const hours = Math.max(1,Math.min(8,Math.round((e.clientX-b.left-4)/(b.width-8)*8)));
      minutes = hours * 60;
      const dates = rangeDays(from,target);
      const groups = new Map<number,{left:number;right:number;top:number}>();
      for (const date of dates) {
        const node = document.querySelector<HTMLElement>(`.work-calendar-day[data-date="${date}"]`);
        if (!node) continue;
        const r = node.getBoundingClientRect(), key = Math.round(r.top);
        const right = r.left+4+(r.width-8)*(date === target ? hours/8 : 1);
        const row = groups.get(key);
        if (row) row.right = Math.max(row.right,right);
        else groups.set(key,{left:r.left+4,right,top:r.top+rowOffset});
      }
      setPreview({label:entry.description,rects:[...groups.values()].map(r=>({left:r.left,top:r.top,width:r.right-r.left})),background,hours:(dates.length-1)*8+hours,dayHours:hours,x:Math.min(window.innerWidth-190,Math.max(8,e.clientX+12)),y:Math.max(8,e.clientY-50)});
    };
    const stop = () => { window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);window.removeEventListener("pointercancel",cancel);window.removeEventListener("keydown",key);window.removeEventListener("blur",cancel);document.body.classList.remove("calendar-is-resizing");setPreview(null); source.style.visibility = ""; };
    const up = (e: PointerEvent) => {
      if(e.pointerId!==pointerId)return;
      move(e); stop();
      if(moved) { const suppress=(event:MouseEvent)=>{event.preventDefault();event.stopPropagation();}; window.addEventListener("click",suppress,{capture:true,once:true}); setTimeout(()=>window.removeEventListener("click",suppress,true),0); }
      if(!moved || !valid)return;
      for(const d of rangeDays(from,target))if(!canEdit(d)){onRestricted(d);return;}
      onCommit(entry,target,minutes);
    };
    const cancel = () => stop();
    const key = (e: KeyboardEvent) => {if(e.key==="Escape")stop();};
    cleanup.current=stop;
    document.body.classList.add("calendar-is-resizing");
    window.addEventListener("pointermove",move);window.addEventListener("pointerup",up);window.addEventListener("pointercancel",cancel);window.addEventListener("keydown",key);window.addEventListener("blur",cancel);
  }
  return {begin,preview,overlay:preview?createPortal(<div className="resize-overlay">
    {preview.rects.map((r,i)=><div key={i} className="resize-ghost" style={{...r,background:preview.background,height:36,color:"white"}}>{preview.label}</div>)}
    <div className="calendar-resize-hours" role="status" style={{left:preview.x,top:preview.y}}>{preview.hours} hr{preview.hours===1?"":"s"} total · {preview.dayHours} hrs this day</div>
  </div>,document.body):null};
}
