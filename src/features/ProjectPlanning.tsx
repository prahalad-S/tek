import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight, CalendarDays, Settings2 } from "lucide-react";
import { Avatar, Badge, ErrorState, Loading } from "../components/ui";
import { client } from "../lib/supabase";
import { dateKey } from "../lib/domain";
import { addDays } from "./calendar/domain";
import { previewWork } from "../lib/preview";
import type { Employee, Project } from "../lib/types";
// Previous palette retained for an easy color-only revert.
// Soft palette: #9c83df, #66b8aa, #eaa263, #709ddd, #cf83ae, #87b678.
const brightColors=["#9253df","#219d91","#ed7842","#4387d4","#cd528d","#58a14e"];
const colors=brightColors;
type Work={id:string;project_id:string;user:string;work_date:string;description:string;minutes:number;task_status:string};
type Task=Work & {start:number;duration:number;assignees:Employee[]};
function seedOf(value:string) { let seed=0;for(const letter of value) seed=(Math.imul(seed,31)+letter.charCodeAt(0))>>>0;return seed; }
const taskNames=["Competitor analysis","Wireframing","Prototyping & testing","Design review","Feature development","Planning meeting","Accessibility review","Research & discovery"];
type Membership={project_id:string;user_id:string|null;employee_id?:string};
const isAssigned=(person:Employee,projectId:string,members:Membership[])=>members.some(m=>m.project_id===projectId&&(m.employee_id===person.id || !!person.user_id&&m.user_id===person.user_id));
function fictionalTasks(people:Employee[],projects:Project[],members:Membership[],start:string,count:number,includeEveryone=false):Task[] {
  return projects.flatMap(project=>{
    const team=people.filter(person=>includeEveryone || isAssigned(person,project.id,members));
    return team.map((person,personIndex)=>{
      const seed=seedOf(person.id+project.id), duration=[.75,1.5,2,2.5,3,3.25][seed%6];
      const offset=((seed>>>4)%Math.max(1,Math.floor((count-duration)*4)))/4;
      const colleagues=[person,...Array.from({length:seed%3},(_,i)=>team[(personIndex+i+1)%team.length])].filter((p,i,all)=>all.findIndex(v=>v.id===p.id)===i);
      return {id:`sample-${person.id}-${project.id}`,project_id:project.id,user:person.user_id || person.id,work_date:addDays(start,Math.floor(offset)),description:taskNames[(seed>>>8)%taskNames.length],minutes:duration*480,task_status:["Completed","In Progress","Pending"][seed%3],start:offset,duration,assignees:colleagues};
    });
  });
}
function recordedTasks(work:Work[],people:Employee[],start:string):Task[] {
  const tasks:Task[]=[];
  for(const row of [...work].sort((a,b)=>a.work_date.localeCompare(b.work_date))) {
    const offset=Math.round((Date.parse(row.work_date+"T00:00:00Z")-Date.parse(start+"T00:00:00Z"))/86400000);
    const previous=[...tasks].reverse().find(t=>t.user===row.user&&t.project_id===row.project_id&&t.description===row.description&&t.task_status===row.task_status&&Math.floor(t.start+t.duration-0.001)===offset-1);
    if(previous) { previous.duration=offset-previous.start+Math.min(1,row.minutes/480);previous.minutes+=row.minutes; }
    else tasks.push({...row,start:offset,duration:Math.max(.125,Math.min(1,row.minutes/480)),assignees:people.filter(p=>p.user_id===row.user)});
  }
  return tasks;
}
function taskLanes(tasks:Task[]) {
  const ends:number[]=[];
  return [...tasks].sort((a,b)=>a.start-b.start).map(task=>{let lane=ends.findIndex(end=>end<=task.start-.08);if(lane<0) lane=ends.length;ends[lane]=task.start+task.duration;return {task,lane};});
}
export default function ProjectPlanning({projects,selected,people,members,preview,onSelect,onBack,onManage}:{projects:Project[];selected:Project|null;people:Employee[];members:{project_id:string;user_id:string|null;employee_id?:string}[];preview:boolean;onSelect:(p:Project|null)=>void;onBack:()=>void;onManage:(p:Project)=>void}) {
  const [anchor,setAnchor]=useState(dateKey(new Date()));
  const [period,setPeriod]=useState("week");
  const [search,setSearch]=useState("");
  const [focused,setFocused]=useState<Task|null>(null);
  const [testData,setTestData]=useState(true);
  const start=period==="month" ? anchor.slice(0,7)+"-01" : (()=>{const d=new Date(anchor+"T12:00:00");return addDays(anchor,-((d.getDay()+6)%7));})();
  const count=period==="month" ? new Date(Number(start.slice(0,4)),Number(start.slice(5,7)),0).getDate() : 7;
  const end=addDays(start,count-1);
  const days=Array.from({length:count},(_,i)=>addDays(start,i));
  const visibleProjects=selected ? [selected] : projects;
  const ids=visibleProjects.map(p=>p.id);
  const query=useQuery({enabled:!testData,queryKey:["project-planning-work",preview,ids.join(","),start,end],queryFn:async({signal})=>{
    if(preview) return previewWork.filter(w=>ids.includes(w.project_id)&&w.work_date>=start&&w.work_date<=end).map(w=>({...w,user:w.timesheets.user_id}));
    const output:Work[]=[]; if(!ids.length) return output;
    for(let offset=0;;offset+=500) {
      const r=await client().from("time_entries").select("id,project_id,work_date,description,minutes,task_status,timesheets!inner(user_id)").in("project_id",ids).gte("work_date",start).lte("work_date",end).order("id").range(offset,offset+499).abortSignal(signal);
      if(r.error) throw r.error;
      for(const w of r.data || []) {const sheet=Array.isArray(w.timesheets)?w.timesheets[0]:w.timesheets;output.push({...w,user:sheet?.user_id || ""});}
      if(!r.data || r.data.length<500) break;
    }
    return output;
  }});
  const uniquePeople=useMemo(()=>[...new Map(people.map(p=>[p.id,p])).values()],[people]);
  const projectPeople=useMemo(()=>selected ? uniquePeople.filter(p=>isAssigned(p,selected.id,members)) : uniquePeople,[uniquePeople,selected,members]);
  const recorded=useMemo(()=>(query.data || []).filter(w=>!selected || projectPeople.some(p=>p.user_id===w.user)),[query.data,selected,projectPeople]);
  const tasks=useMemo(()=>testData ? fictionalTasks(uniquePeople,visibleProjects,members,start,count,!selected) : recordedTasks(recorded,projectPeople,start),[testData,uniquePeople,projects,selected,members,recorded,projectPeople,start,count]);
  const work=useMemo(()=>testData ? tasks.flatMap(task=>days.flatMap((day,index)=>{
    const overlap=Math.max(0,Math.min(index+1,task.start+task.duration)-Math.max(index,task.start));
    return overlap>0 ? [{...task,id:`${task.id}-${day}`,work_date:day,minutes:Math.round(overlap*480)}] : [];
  })) : recorded,[testData,tasks,recorded,start,count]);
  const team=useMemo(()=>projectPeople.filter(p=>`${p.full_name} ${p.title||""}`.toLowerCase().includes(search.toLowerCase())),[projectPeople,search]);
  const stats=visibleProjects.map(p=>{const rows=work.filter(w=>w.project_id===p.id);return {project:p,hours:rows.reduce((a,w)=>a+w.minutes/60,0),total:rows.length,done:rows.filter(w=>w.task_status==="Completed").length};}).sort((a,b)=>Number(b.total>0)-Number(a.total>0) || b.done-a.done || a.project.name.localeCompare(b.project.name));
  const hours=work.reduce((a,w)=>a+w.minutes/60,0),done=work.filter(w=>w.task_status==="Completed").length;
  const progress=work.length ? Math.round(done/work.length*100):0;
  const daily=days.map(day=>work.filter(w=>w.work_date===day).reduce((a,w)=>a+w.minutes/60,0));
  const max=Math.max(1,...daily);
  const coordinates=daily.map((h,i)=>({x:10+i*280/Math.max(1,days.length-1),y:92-h/max*75}));
  const curve=coordinates.map((point,i)=>{
    if(!i) return `M${point.x} ${point.y}`;
    const previous=coordinates[i-1],mid=(previous.x+point.x)/2;
    return `C${mid} ${previous.y},${mid} ${point.y},${point.x} ${point.y}`;
  }).join(" ");
  function move(direction:number) {setFocused(null);if(period==="week") setAnchor(addDays(anchor,direction*7)); else {const d=new Date(start+"T12:00:00");d.setMonth(d.getMonth()+direction);setAnchor(dateKey(d));}}
  return <section className="project-planning">
    <div className="planning-heading"><div><button className="text-button" onClick={onBack}><ArrowLeft size={15}/> Project cards</button><h2>{selected?.name || "All projects"}</h2><p>{selected?.description || "People, projects and recorded work in one shared view."}</p></div><div className="planning-heading-actions"><Badge>{selected?.status || `${projects.length} projects`}</Badge>{selected && <button className="button secondary" onClick={()=>onManage(selected)}><Settings2 size={15}/>Manage project</button>}</div></div>
    <div className="planning-summary"><div><strong>{visibleProjects.length}</strong><span>Projects</span></div><div><strong>{team.length}</strong><span>Employees shown</span></div><div><strong>{Number(hours.toFixed(1))}h</strong><span>{testData?"Sample work hours":"Recorded work"}</span></div><div><strong>{done}/{work.length}</strong><span>Completed entries</span></div></div>
    <div className={`planning-test-banner ${testData?"is-enabled":""}`}><span role="status">{testData?`Test data is ON · fictional tasks for ${selected?"assigned project teammates":"all employees, including unassigned employees"} · stored only in this view`:"Test data is OFF · showing visible recorded work"}</span><button type="button" className="button secondary" aria-pressed={testData} onClick={()=>{setTestData(value=>!value);setFocused(null);}}>{testData?"Remove test data":"Show test data"}</button></div>
    {preview && !testData && <p className="planning-note">Preview data · fictional recorded work.</p>}
    <div className="planning-layout"><section className="panel planning-timeline-panel">
      <div className="planning-toolbar"><div><CalendarDays size={17}/><strong>{new Date(start+"T12:00:00").toLocaleDateString(undefined,{month:"long",year:"numeric"})}</strong><button className="icon-button" aria-label="Previous planning period" onClick={()=>move(-1)}><ChevronLeft size={17}/></button><button className="icon-button" aria-label="Next planning period" onClick={()=>move(1)}><ChevronRight size={17}/></button><button className="text-button" onClick={()=>setAnchor(dateKey(new Date()))}>Today</button></div><div><input aria-label="Search planning employees" placeholder="Find an employee…" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Planning period" value={period} onChange={e=>{setPeriod(e.target.value);setFocused(null);}}><option value="week">Week</option><option value="month">Month</option></select></div></div>
      {!testData && query.isPending ? <Loading/> : !testData && query.error ? <ErrorState error={query.error} retry={()=>void query.refetch()}/> : <div className="planning-timeline-scroll"><div className="planning-timeline" style={{minWidth:period==="month"?1040:640}}>
        <div className="planning-date-row"><strong>Team & activity</strong><div style={{gridTemplateColumns:`repeat(${count},minmax(0,1fr))`}}>{days.map(day=><span key={day} className={day===dateKey(new Date())?"is-today":""}><small>{new Date(day+"T12:00:00").toLocaleDateString(undefined,{weekday:"short"})}</small>{Number(day.slice(-2))}</span>)}</div></div>
        {team.map(person=>{
          const placed=taskLanes(tasks.filter(task=>task.user===(testData?(person.user_id || person.id):person.user_id)));
          const lanes=Math.max(1,...placed.map(p=>p.lane+1));
          return <div className="planning-person-row planning-gantt-row" key={person.id} style={{minHeight:Math.max(88,lanes*48+24)}}>
            <div className="planning-person"><Avatar person={person} size="small"/><span><strong>{person.full_name}</strong><small>{person.title || person.location || "Team member"}</small></span></div>
            <div className="planning-gantt-track">
              <div className="planning-gantt-grid" style={{gridTemplateColumns:`repeat(${count},minmax(0,1fr))`}}>{days.map(day=><div key={day} className={`planning-day ${[0,6].includes(new Date(day+"T12:00:00").getDay())?"is-weekend":""} ${day===dateKey(new Date())?"is-today":""}`}/>)}</div>
              {placed.map(({task,lane})=>{
                const left=Math.max(0,task.start),right=Math.min(count,task.start+task.duration);
                if(right<=left) return null;
                const project=projects.find(p=>p.id===task.project_id);
                const title=`${project?.name}: ${task.description} · ${task.duration} day span · ${task.minutes/60} work hours · ${task.task_status} · ${task.assignees.map(p=>p.full_name).join(", ")}`;
                return <button key={task.id} className={`planning-gantt-pill ${task.task_status==="Completed"?"is-completed":""}`} style={{left:`${left/count*100}%`,width:`calc(${(right-left)/count*100}% - 6px)`,top:12+lane*48,background:colors[seedOf(task.id)%colors.length]}} onClick={()=>setFocused(task)} title={title} aria-label={title}>
                  <span className="planning-gantt-label">{task.description}</span>
                  <span className="planning-gantt-avatars">{task.assignees.slice(0,3).map(p=><span key={p.id} title={p.full_name}><Avatar person={p} size="small"/></span>)}</span>
                </button>;
              })}
            </div>
          </div>;
        })}
        {!team.length && <p className="muted">No assigned employees match this selection. Use Manage project to add teammates.</p>}
      </div></div>}
      <p className="planning-note">{testData?"Sample Gantt chart · continuous capsules span fractional days (8 work hours per day). Avatars illustrate fictional task teams; they do not change project assignments.":"Recorded activity ranges · matching entries on consecutive dates are joined. Capsule spans show calendar coverage, not verified deadlines. Empty days have no visible records."}</p>
    </section><aside className="planning-side">
      {focused && <section className="panel planning-detail">
        <header className="planning-detail-heading"><div><span className="planning-detail-eyebrow">{testData?"Sample task":"Entry details"}</span><h3>{projects.find(p=>p.id===focused.project_id)?.name}</h3></div><button type="button" className="icon-button" aria-label="Close entry details" title="Close entry details" onClick={()=>setFocused(null)}>×</button></header>
        <p className="planning-detail-description">{focused.description}</p>
        <Badge>{focused.task_status}</Badge>
        <dl className="planning-detail-facts"><div><dt>Start date</dt><dd>{new Date(focused.work_date+"T12:00:00").toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}</dd></div><div><dt>Timeline span</dt><dd>{focused.duration} days</dd></div><div><dt>Work hours</dt><dd>{focused.minutes/60} hours</dd></div></dl>
        <div className="planning-detail-team"><span className="planning-detail-eyebrow">Team</span><div>{focused.assignees.map(person=><span className="planning-detail-person" key={person.id}><Avatar person={person} size="small"/><span>{person.full_name}</span></span>)}</div></div>
      </section>}
      <section className="panel"><h3>Project status</h3><div className="planning-donut" style={{background:`conic-gradient(#9c83df ${progress}%,var(--border) 0)`}}><div><strong>{work.length?`${progress}%`:"—"}</strong><small>entries complete</small></div></div><div className="planning-status-legend"><span>Completed <b>{done}</b></span><span>In progress <b>{work.filter(w=>w.task_status==="In Progress").length}</b></span><span>Pending <b>{work.filter(w=>w.task_status==="Pending").length}</b></span></div></section>
      <section className="panel"><h3>Overall projects</h3><div className="planning-project-list">{stats.map((stat,i)=><button key={stat.project.id} onClick={()=>{onSelect(stat.project);setFocused(null);}}><span><strong>{stat.project.name}</strong><small>{stat.done} / {stat.total} entries</small></span><span className="planning-progress"><i style={{width:`${stat.total?stat.done/stat.total*100:0}%`,background:colors[i%colors.length]}}/></span><small>{Number(stat.hours.toFixed(1))} {testData?"sample":"recorded"} hours · {stat.project.status}</small></button>)}</div></section>
      <section className="panel"><h3>{testData?"Sample activity":"Recorded activity"}</h3><p className="muted">Work hours per day</p><svg viewBox="0 0 300 110" role="img" aria-label={`Daily recorded hours: ${days.map((d,i)=>`${d}: ${daily[i]}`).join(", ")}`}><path d="M10 92H290" fill="none" stroke="var(--border)"/><path d={curve} fill="none" stroke="#709ddd" strokeWidth="3" strokeLinecap="round"/>{daily.map((h,i)=><circle key={days[i]} cx={10+i*280/Math.max(1,days.length-1)} cy={92-h/max*75} r="3" fill="#709ddd"><title>{days[i]}: {h} hours</title></circle>)}</svg><div className="planning-chart-dates"><small>{start}</small><small>{end}</small></div></section>
    </aside></div>
  </section>;
}
