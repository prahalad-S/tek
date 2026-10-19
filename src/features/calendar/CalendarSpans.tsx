import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { CalendarEntry } from "./domain";
export default function CalendarSpans({ entries, renderEntry }: { entries: CalendarEntry[]; renderEntry:(entry:CalendarEntry)=>ReactNode }) {
  const layer = useRef<HTMLDivElement>(null);
  const [rects,setRects]=useState<{id:string;entry:CalendarEntry;left:number;top:number;width:number}[]>([]);
  const signature=entries.map(e=>`${e.id}:${e.work_date}:${e.minutes}:${e.version}`).join('|');
  useLayoutEffect(()=>{
    const grid=layer.current?.parentElement;if(!grid)return;
    let frame=0;
    const measure=()=>{
      const bounds=grid.getBoundingClientRect();
      const groups=new Map<string,CalendarEntry[]>();
      entries.forEach(e=>{if(e.calendar_span_id)groups.set(e.calendar_span_id,[...(groups.get(e.calendar_span_id)||[]),e]);});
      const result:typeof rects=[];
      for(const [id,items] of groups){
        const rows=new Map<number,{entry:CalendarEntry;left:number;top:number;right:number}>();
        for(const e of [...items].sort((a,b)=>a.work_date.localeCompare(b.work_date))){
          const cell=grid.querySelector<HTMLElement>(`[data-date="${e.work_date}"]`);
          const slot=cell?.querySelector<HTMLElement>(`[data-span-slot="${id}"]`);
          if(!cell||!slot)continue;
          const c=cell.getBoundingClientRect(),s=slot.getBoundingClientRect(),key=Math.round(c.top);
          const right=c.left+8+(c.width-16)*Math.min(1,e.minutes/480);
          const row=rows.get(key);
          if(row){row.right=right;row.entry=e;}else rows.set(key,{entry:e,left:c.left+8,top:s.top,right});
        }
        for(const [key,row] of rows)result.push({id:`${id}:${key}`,entry:row.entry,left:row.left-bounds.left,top:row.top-bounds.top,width:row.right-row.left});
      }
      setRects(old=>JSON.stringify(old)===JSON.stringify(result)?old:result);
    };
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure);};
    const observer=new ResizeObserver(schedule);observer.observe(grid);
    grid.querySelectorAll('.work-calendar-day').forEach(el=>observer.observe(el));
    measure();window.addEventListener('resize',schedule);
    return()=>{observer.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);};
  },[signature]);
  return <div ref={layer} className="calendar-span-layer">{rects.map(r=><div key={r.id} className="calendar-span-pill" style={{left:r.left,top:r.top,width:r.width}}>{renderEntry(r.entry)}</div>)}</div>;
}
