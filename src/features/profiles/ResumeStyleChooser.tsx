import { useEffect, useState } from "react";
import { Modal } from "../../components/ui";
import { useAuth } from "../../app/providers";
import { downloadProfileDocument } from "../../lib/profileDocuments";
import { errorMessage } from "../../lib/domain";
import { resumeStyles, type ResumeStyle } from "../../lib/resumeStyles";
import type { Employee } from "../../lib/types";
import type { ExtendedProfile } from "../../lib/profiles";
type Preview={url:string;thumbnail:string};
export default function ResumeStyleChooser({employee,data,includePrivate=false,busy,onClose,onDownload}:{employee:Employee;data:ExtendedProfile;includePrivate?:boolean;busy:boolean;onClose:()=>void;onDownload:(style:ResumeStyle)=>Promise<void>}) {
  const {preview}=useAuth();
  const [selected,setSelected]=useState<ResumeStyle>("editorial");
  const [previews,setPreviews]=useState<Partial<Record<ResumeStyle,Preview>>>({});
  const [errors,setErrors]=useState<Partial<Record<ResumeStyle,string>>>({});
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let cancelled=false;const urls:string[]=[];
    setPreviews({});setErrors({});
    async function prepare(){
      for(const style of resumeStyles){
        if(cancelled)return;
        let thumbnail="";
        try {
          await downloadProfileDocument(employee,data,"resume","pdf",preview,blob=>{
            if(cancelled)return;
            const url=URL.createObjectURL(blob);urls.push(url);
            setPreviews(previous=>({...previous,[style.id]:{url,thumbnail}}));
          },includePrivate,style.id,image=>{thumbnail=image;});
        }catch(error){if(!cancelled)setErrors(previous=>({...previous,[style.id]:errorMessage(error)}));}
      }
    }
    void prepare();
    return()=>{cancelled=true;urls.forEach(url=>URL.revokeObjectURL(url));};
  },[employee,data,preview,includePrivate,retry]);
  const current=previews[selected],style=resumeStyles.find(s=>s.id===selected)!;
  return <Modal open onClose={()=>{if(!busy)onClose();}} title="Choose your resume style" description="Select a thumbnail to preview your complete resume before downloading." wide className="resume-style-modal resume-style-preview-modal">
    <div className="resume-preview-layout">
      <nav className="resume-preview-rail" aria-label="Resume styles">{resumeStyles.map(item=><button type="button" key={item.id} className={`resume-style-choice ${selected===item.id?"is-selected":""}`} aria-pressed={selected===item.id} disabled={busy} onClick={()=>setSelected(item.id)}>
        <span className="resume-preview-thumbnail">{previews[item.id]?.thumbnail?<img src={previews[item.id]!.thumbnail} alt={`${item.name} resume first page`}/>:<span>{errors[item.id]?"Preview unavailable":"Preparing preview…"}</span>}</span>
        <strong>{item.name}</strong><small>{item.description}</small>
      </button>)}</nav>
      <section className="resume-embedded-preview" aria-label={`${style.name} resume preview`}>
        <header><div><strong>{style.name}</strong><small>{employee.full_name}</small></div><span>PDF preview</span></header>
        {current?<iframe key={current.url} src={`${current.url}#view=FitH`} title={`${employee.full_name} — ${style.name} resume`}/>:errors[selected]?<div className="resume-preview-placeholder" role="alert"><p>{errors[selected]}</p><button className="button secondary" onClick={()=>setRetry(value=>value+1)}>Retry previews</button></div>:<div className="resume-preview-placeholder" role="status">Preparing your {style.name.toLowerCase()} resume…</div>}
      </section>
    </div>
    <div className="resume-style-actions"><p>Previews use your saved profile details and show the same layout as the downloaded PDF.</p><button className="button" data-jarvis-resume-download disabled={busy||!current} onClick={()=>void onDownload(selected)}>{busy?"Preparing PDF…":`Download ${style.name} PDF`}</button></div>
  </Modal>;
}
