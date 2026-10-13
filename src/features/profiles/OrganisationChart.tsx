import { client } from "../../lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../app/providers";
import { directoryPeople, previewExtended } from "../../lib/profiles";
import { previewEmployees } from "../../lib/preview";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Building2, Network, CircleDot, GitFork, ZoomIn, ZoomOut, RotateCcw, ArrowDownAZ, ArrowUpAZ, Shuffle, BriefcaseBusiness, UserPlus, ListRestart } from "lucide-react";
import { Avatar, Modal } from "../../components/ui";
import type { Employee } from "../../lib/types";
const palette=["#8a72df","#37ad9a","#ed8c65","#dc6b9d","#5f9bd9","#bdac41"];
type SortMode="default"|"ascending"|"descending"|"random"|"experience"|"latest";
type Node={id:string;label:string;subtitle:string;person?:Employee;color:string;x:number;y:number;parent?:string;kind:string};
export default function OrganisationChart({people,onClose,onSelect}:{people:Employee[];onClose:()=>void;onSelect:(person:Employee)=>void}) {
  const {preview}=useAuth();
  const directory=useQuery({queryKey:["organisation-directory",preview],queryFn:()=>preview?Promise.resolve(previewEmployees):directoryPeople()});
  const directoryPeopleData=directory.data || people;
  const [horizontal,setHorizontal]=useState(false),[zoom,setZoom]=useState(.35);
  const [sort,setSort]=useState<SortMode>("default");
  const [randomRanks,setRandomRanks]=useState<Record<string,number>>({});
  const experience=useQuery({queryKey:["organisation-experience",preview],enabled:sort==="experience",queryFn:async({signal})=>{
    const rows:{employee_id:string;start_date:string;end_date:string|null}[]=[];
    if(preview) for(const person of directoryPeopleData) rows.push(...previewExtended(person).experience.map(e=>({employee_id:person.id,start_date:e.start_date,end_date:e.end_date})));
    else for(let offset=0;;offset+=500){
      const result=await client().from("employee_experience").select("employee_id,start_date,end_date").order("id").range(offset,offset+499).abortSignal(signal);
      if(result.error)throw result.error;rows.push(...result.data);if(result.data.length<500)break;
    }
    const totals:Record<string,number>={};
    for(const person of directoryPeopleData){
      const ranges=rows.filter(r=>r.employee_id===person.id).map(r=>({start:Date.parse(r.start_date),end:r.end_date?Date.parse(r.end_date):Date.now()})).filter(r=>Number.isFinite(r.start)&&Number.isFinite(r.end)&&r.end>=r.start).sort((a,b)=>a.start-b.start);
      let total=0,end=0;for(const range of ranges){total+=Math.max(0,range.end-Math.max(range.start,end));end=Math.max(end,range.end);}if(ranges.length)totals[person.id]=total;
    }
    return totals;
  }});
  function chooseSort(value:SortMode){if(value==="random")setRandomRanks(Object.fromEntries(directoryPeopleData.map(p=>[p.id,Math.random()])));setSort(value);}
  const viewport=useRef<HTMLDivElement>(null);
  const [viewportElement,setViewportElement]=useState<HTMLDivElement|null>(null);
  const attachViewport=useCallback((element:HTMLDivElement|null)=>{viewport.current=element;setViewportElement(element);},[]);
  const [size,setSize]=useState({width:1000,height:600});
  const [pan,setPan]=useState({x:0,y:0});
  const drag=useRef<{x:number;y:number;left:number;top:number;moved:boolean;target:HTMLElement}|null>(null);
  const suppressClick=useRef(false);
  useLayoutEffect(()=>{const v=viewportElement;if(!v)return;const measure=()=>setSize({width:v.clientWidth,height:v.clientHeight});measure();const observer=new ResizeObserver(measure);observer.observe(v);return()=>observer.disconnect();},[viewportElement]);
  useEffect(()=>{
    const element=viewportElement;if(!element)return;
    const wheel=(event:WheelEvent)=>{
      event.preventDefault();event.stopPropagation();
      const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?element.clientHeight:1);
      setZoom(value=>Math.round(Math.max(.15,Math.min(1.4,value*Math.exp(-delta*.0015)))*100)/100);
    };
    element.addEventListener("wheel",wheel,{passive:false});
    return()=>element.removeEventListener("wheel",wheel);
  },[viewportElement]);
  function changeView(value:boolean){setHorizontal(value);setZoom(value?.55:.35);}

  const layout=useMemo(()=>{
    const unique=[...new Map(directoryPeopleData.map(p=>[p.id,p])).values()];
    const ceo=unique.find(person=>/\bceo\b|chief executive officer/i.test(person.title));
    const departmentPeople=unique.filter(person=>person.id!==ceo?.id);
    function compare(a:Employee,b:Employee) {
      if(sort==="ascending")return a.full_name.localeCompare(b.full_name);
      if(sort==="descending")return b.full_name.localeCompare(a.full_name);
      if(sort==="random")return (randomRanks[a.id]??0)-(randomRanks[b.id]??0);
      if(sort==="experience")return (experience.data?.[b.id]??-1)-(experience.data?.[a.id]??-1) || a.full_name.localeCompare(b.full_name);
      if(sort==="latest")return (Date.parse(b.joined_on || "")||0)-(Date.parse(a.joined_on || "")||0) || a.full_name.localeCompare(b.full_name);
      return 0;
    }
    const groups=[...new Set(departmentPeople.map(p=>p.departments?.name || "Unassigned"))].sort().map(name=>({name,people:departmentPeople.filter(p=>(p.departments?.name || "Unassigned")===name).sort(compare)}));
    const radius=Math.max(650,unique.length*40),circleSize=radius*2+420,center=circleSize/2;
    const chartHeight=Math.max(500,(size.height-60)/zoom);
    const height=horizontal?chartHeight:circleSize,width=horizontal?Math.max(1200,1000+Math.max(0,...groups.map(g=>g.people.length))*390):circleSize;
    const nodes:Node[]=[{id:"company",label:"Tekzenit",subtitle:ceo?.full_name || "Organisation",person:ceo,color:"#7560c7",x:horizontal?180:center,y:horizontal?height/2:center,kind:"company"}];
    let offset=0;
    groups.forEach((group,index)=>{
      const color=palette[index%palette.length],sector=group.people.length/Math.max(1,departmentPeople.length)*Math.PI*2;
      const angle=-Math.PI/2+offset+sector/2;
      const deptY=(index+.5)*chartHeight/Math.max(1,groups.length);
      nodes.push({id:`department:${group.name}`,label:group.name,subtitle:`${group.people.length} employees`,color,x:horizontal?550:center+Math.cos(angle)*radius*.45,y:horizontal?deptY:center+Math.sin(angle)*radius*.45,parent:"company",kind:"department"});
      group.people.forEach((person,i)=>{
        const a=-Math.PI/2+offset+(i+.5)/group.people.length*sector;
        nodes.push({id:person.id,label:person.full_name,subtitle:person.title || "Team member",person,color,x:horizontal?1000+i*390:center+Math.cos(a)*radius,y:horizontal?deptY:center+Math.sin(a)*radius,parent:`department:${group.name}`,kind:"employee"});
      });
      offset+=sector;
    });
    return {nodes,width,height};
  },[directoryPeopleData,horizontal,size.height,zoom,sort,randomRanks,experience.data]);
  useEffect(()=>{
    const company=layout.nodes[0];
    setPan(horizontal?{x:35,y:size.height/2-company.y*zoom}:{x:0,y:0});
  },[horizontal,zoom,size.width,size.height,directory.data]);
  return <Modal open onClose={onClose} title="Organisation chart" description="Company, departments and employees. Reporting lines are not configured in this workspace." wide className="organisation-modal">
    {directory.isPending && <p className="muted">Loading the full employee directory…</p>}
    {directory.error && <p role="alert">The full employee directory could not be loaded. Showing the currently available people.</p>}
    {sort==="experience" && experience.isPending && <p className="muted" role="status">Loading recorded career experience…</p>}
    {sort==="experience" && experience.error && <p role="alert">Experience could not be loaded. Showing name order; choose another sort or try again.</p>}
    <div className="organisation-toolbar"><div className="organisation-view-toggle"><button type="button" className="icon-button" aria-label="Circular organisation view" title="Circular view" aria-pressed={!horizontal} onClick={()=>changeView(false)}><CircleDot size={20}/></button><button type="button" className="icon-button" aria-label="Horizontal organisation view" title="Horizontal view" aria-pressed={horizontal} onClick={()=>changeView(true)}><GitFork size={20}/></button><span className="organisation-tool-divider" aria-hidden="true"/>{([
      {id:"ascending",label:"Ascending: name A to Z",Icon:ArrowDownAZ},
      {id:"descending",label:"Descending: name Z to A",Icon:ArrowUpAZ},
      {id:"random",label:"Random employee order",Icon:Shuffle},
      {id:"experience",label:"By experience: most recorded career experience first",Icon:BriefcaseBusiness},
      {id:"latest",label:"Latest employees: newest joining date first",Icon:UserPlus},
      {id:"default",label:"Default employee order",Icon:ListRestart},
    ] as const).map(({id,label,Icon})=><button key={id} type="button" className="icon-button" aria-label={label} title={label} aria-pressed={sort===id} onClick={()=>chooseSort(id)}><Icon size={19}/></button>)}</div><span>Drag to explore · scroll wheel to zoom · select an employee to open their profile</span><div><button className="icon-button" aria-label="Zoom out organisation chart" onClick={()=>setZoom(z=>Math.max(.15,z-.1))}><ZoomOut size={17}/></button><span>{Math.round(zoom*100)}%</span><button className="icon-button" aria-label="Zoom in organisation chart" onClick={()=>setZoom(z=>Math.min(1.4,z+.1))}><ZoomIn size={17}/></button><button className="icon-button" aria-label="Reset organisation chart view" onClick={()=>{setZoom(horizontal?.55:.35);const company=layout.nodes[0];const z=horizontal?.55:.35;setPan(horizontal?{x:35,y:size.height/2-company.y*z}:{x:0,y:0});}}><RotateCcw size={17}/></button></div></div>
    <div className="organisation-viewport" ref={attachViewport} tabIndex={0} aria-label="Draggable organisation chart"
      onPointerDown={e=>{if(e.button===1){e.preventDefault();return;}if(e.button!==0)return;e.preventDefault();e.currentTarget.focus();suppressClick.current=false;drag.current={x:e.clientX,y:e.clientY,left:pan.x,top:pan.y,moved:false,target:e.target as HTMLElement};e.currentTarget.setPointerCapture(e.pointerId);}}
      onPointerMove={e=>{const d=drag.current;if(!d)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.hypot(dx,dy)>4){d.moved=true;suppressClick.current=true;setPan({x:d.left+dx,y:d.top+dy});}}}
      onPointerUp={e=>{const d=drag.current;drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);if(d&&!d.moved){const id=d.target.closest<HTMLElement>('[data-org-person]')?.dataset.orgPerson;const person=directoryPeopleData.find(p=>p.id===id);if(person){onClose();onSelect(person);}}}}
      onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}
      onClickCapture={e=>{if(suppressClick.current){e.preventDefault();e.stopPropagation();}}}
      onKeyDown={e=>{const delta=60;if(e.key==="ArrowLeft")setPan(p=>({...p,x:p.x+delta}));else if(e.key==="ArrowRight")setPan(p=>({...p,x:p.x-delta}));else if(e.key==="ArrowUp")setPan(p=>({...p,y:p.y+delta}));else if(e.key==="ArrowDown")setPan(p=>({...p,y:p.y-delta}));else return;e.preventDefault();}}>
      <div className={`organisation-canvas ${horizontal?"is-horizontal":""} ${drag.current?.moved?"is-panning":""}`} style={{width:layout.width,height:layout.height,left:horizontal?0:"50%",top:horizontal?0:"50%",transformOrigin:horizontal?"top left":"center center",transform:horizontal?`translate(${pan.x}px,${pan.y}px) scale(${zoom})`:`translate(-50%, -50%) translate(${pan.x}px,${pan.y}px) scale(${zoom})`}}>
        {!horizontal && <div className="organisation-orbit" style={{width:layout.width*.54,height:layout.width*.54,left:layout.width*.23,top:layout.height*.23}}/>}
        <svg width={layout.width} height={layout.height} aria-hidden="true">{layout.nodes.filter(n=>n.parent).map(node=>{const parent=layout.nodes.find(p=>p.id===node.parent)!;const mid=(parent.x+node.x)/2;return <path key={node.id} d={`M${parent.x} ${parent.y} C${mid} ${parent.y},${mid} ${node.y},${node.x} ${node.y}`} fill="none" stroke={node.color} strokeOpacity=".45" strokeWidth="2"/>;})}</svg>
        {layout.nodes.map(node=><button key={node.id} type="button" className={`organisation-node organisation-node--${node.kind}`} style={{left:node.x,top:node.y,"--org-color":node.color} as React.CSSProperties} data-org-person={node.person?.id} onClick={e=>{if(e.detail===0&&node.person){onClose();onSelect(node.person);}}} aria-label={node.person?`Open ${node.label} profile`:node.label}>
          <span className="organisation-node-ring">{node.kind==="company"?<><span className="organisation-ceo-icon"><Building2 size={60}/></span><span className="organisation-ceo-label">CEO</span></>:node.person?<Avatar person={node.person} size="hero"/>:<Network size={40}/>}</span><strong>{node.label}</strong><small>{node.subtitle}</small>
        </button>)}
      </div>
    </div>
  </Modal>;
}
