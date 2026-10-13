import { useId } from "react";
export default function ProjectActivitySparkline({projectId}:{projectId:string}) {
  const id=useId().replace(/:/g,"");
  let seed=0; for(const letter of projectId) seed=(Math.imul(seed,31)+letter.charCodeAt(0))>>>0;
  const points=Array.from({length:6},(_,i)=>({x:5+i*24,y:12+((seed>>>(i*4))%30)}));
  const curve=points.map((p,i)=>{if(!i) return `M${p.x} ${p.y}`;const previous=points[i-1],mid=(previous.x+p.x)/2;return `C${mid} ${previous.y},${mid} ${p.y},${p.x} ${p.y}`;}).join(" ");
  return <span className="project-card-sparkline" title="Sample activity · fictional illustration">
    <svg viewBox="0 0 130 56" role="img" aria-label="Sample activity: fictional project trend">
      <defs><linearGradient id={`activity-${id}`} x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#538dff"/><stop offset="48%" stopColor="#a16ddd"/><stop offset="100%" stopColor="#f36b95"/></linearGradient></defs>
      <path d={curve} fill="none" stroke={`url(#activity-${id})`} strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  </span>;
}
