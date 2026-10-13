import type { Employee } from "./types";
import type { ExtendedProfile } from "./profiles";
import { personalExportRows } from "./profileExportDetails";
export type ResumeStyle="editorial"|"organic"|"timeline";
export const resumeStyles=[{id:"editorial" as const,name:"Editorial",description:"Warm sidebar, framed portrait and clean sections"},{id:"organic" as const,name:"Modern organic",description:"Soft shapes, circular portrait and two columns"},{id:"timeline" as const,name:"Career timeline",description:"Wide header and a chronological experience column"}];
export async function styledResumePdf(e:Employee,p:ExtendedProfile,photo:ImageBitmap|null,preview:boolean,style:ResumeStyle,includePrivate=false,onPreview?:(image:string)=>void) {
  const {PDFDocument}=await import("pdf-lib");
  await document.fonts.ready;
  const width=1240,height=1754,accent=style==="editorial"?"#a77f76":style==="organic"?"#b7847c":"#bd8587";
  const pages:HTMLCanvasElement[]=[];
  function canvas(index:number) {
    while(pages.length<=index) {
      const c=document.createElement("canvas");c.width=width;c.height=height;const ctx=c.getContext("2d")!;
      ctx.fillStyle=style==="timeline"?"#faf9f6":"#fff";ctx.fillRect(0,0,width,height);
      if(style==="editorial") {ctx.fillStyle="#eee0d7";ctx.fillRect(0,0,365,height);}
      if(style==="organic") {
        ctx.fillStyle="#f4e5d4";ctx.beginPath();ctx.ellipse(200,180,250,170,-.4,0,Math.PI*2);ctx.fill();
        ctx.fillStyle="#f4e0e3";ctx.beginPath();ctx.arc(60,height-40,170,0,Math.PI*2);ctx.fill();
        ctx.fillStyle="#f0e5db";ctx.beginPath();ctx.arc(width,height-70,160,0,Math.PI*2);ctx.fill();
      }
      if(style==="timeline") {ctx.strokeStyle="#e3dbd7";ctx.beginPath();ctx.moveTo(430,380);ctx.lineTo(430,height-110);ctx.stroke();}
      ctx.font='18px "Inter Variable",sans-serif';ctx.fillStyle="#8a8180";ctx.fillText(index===0?"TEKZENIT / PROFESSIONAL PROFILE":e.full_name+" / CONTINUED",style==="editorial"?410:60,52);
      pages.push(c);
    }
    return pages[index].getContext("2d")!;
  }
  function textLines(text:string,size:number,max:number,bold=false) {
    const ctx=canvas(0);ctx.font=`${bold?600:400} ${size}px "Inter Variable",sans-serif`;
    const lines:string[]=[];
    for(const paragraph of String(text || "").split("\n")) {
      let line="";
      for(const word of paragraph.split(/\s+/)) {
        const chunks=word.match(new RegExp(`.{1,${Math.max(8,Math.floor(max/(size*.65)))}}`,"gu")) || [""];
        for(const chunk of chunks) {if(line&&ctx.measureText(line+" "+chunk).width>max){lines.push(line);line=chunk;}else line+=(line?" ":"")+chunk;}
      }
      if(line) lines.push(line);
    }
    return lines;
  }
  function column(x:number,max:number,initial:number) {
    let index=0,y=initial;
    function ensure(space:number) {if(y+space>height-100){index++;canvas(index);y=125;}}
    return {
      gap(n=25){ensure(n);y+=n;},
      position(){return y;},
      moveTo(value:number){y=value;},
      heading(value:string){ensure(90);y+=20;const ctx=canvas(index);ctx.fillStyle=accent;ctx.fillRect(x,y-22,max,2);ctx.font='600 19px "Inter Variable",sans-serif';ctx.fillText(value.toUpperCase(),x,y+10);y+=55;},
      text(value:string,size=22,bold=false,color="#4a4443") {for(const line of textLines(value,size,max,bold)){ensure(size*1.55);const ctx=canvas(index);ctx.font=`${bold?600:400} ${size}px "Inter Variable",sans-serif`;ctx.fillStyle=color;ctx.fillText(line,x,y);y+=size*1.5;}},
      dot(){ensure(35);const ctx=canvas(index);ctx.fillStyle=accent;ctx.beginPath();ctx.arc(x-20,y-7,4,0,Math.PI*2);ctx.fill();}
    };
  }
  const ctx=canvas(0);
  function portrait(x:number,y:number,size:number,round:boolean) {
    ctx.save();ctx.beginPath();if(round)ctx.arc(x+size/2,y+size/2,size/2,0,Math.PI*2);else ctx.rect(x,y,size,size);ctx.clip();
    ctx.fillStyle="#dccbc5";ctx.fillRect(x,y,size,size);
    if(photo) {const crop=Math.min(photo.width,photo.height);ctx.drawImage(photo,(photo.width-crop)/2,(photo.height-crop)/2,crop,crop,x,y,size,size);}
    else {ctx.fillStyle=accent;ctx.textAlign="center";ctx.font='600 72px "Inter Variable",sans-serif';ctx.fillText(e.full_name.split(" ").map(w=>w[0]).slice(0,2).join(""),x+size/2,y+size*.62);ctx.textAlign="left";}
    ctx.restore();
  }
  const sidebar=column(style==="editorial"?42:60,style==="timeline"?310:270,style==="editorial"?425:410);
  const main=column(style==="timeline"?490:420,style==="timeline"?690:750,style==="editorial"?360:410);
  const header=column(style==="editorial"?420:style==="organic"?440:390,style==="editorial"?730:720,155);
  portrait(style==="editorial"?70:65,style==="editorial"?95:100,style==="timeline"?220:230,style!=="editorial");
  if(style==="editorial") {ctx.strokeStyle=accent;ctx.lineWidth=2;ctx.strokeRect(55,80,260,260);}
  header.text(e.full_name,style==="timeline"?44:50,true,"#302c2b");header.gap(10);header.text(e.title || "Professional profile",23,false,accent);header.text(e.departments?.name || "",19);
  main.moveTo(Math.max(style==="editorial"?360:410,header.position()+45));
  sidebar.heading("Contact");sidebar.text(e.email,18);sidebar.text(e.location,19);if(p.profile.website)sidebar.text(p.profile.website,18);sidebar.gap();
  if(style!=="timeline") {
    if(p.skills.length) {sidebar.heading("Skills");p.skills.forEach(skill=>{sidebar.text(skill,20);sidebar.gap(9);});}
    if(p.profile.languages.length){sidebar.heading("Languages");sidebar.text(p.profile.languages.join(" • "),20);}
  }
  const summary=p.profile.summary || e.bio;
  if(summary){main.heading("About me");main.text(summary);main.gap();}
  const career=style==="timeline"?sidebar:main;
  if(p.experience.length){career.heading("Work experience");for(const r of p.experience){if(style==="timeline")career.dot();career.text(r.role || "Role",24,true);career.text(r.company,20,false,accent);career.text([r.start_date,r.end_date || "Present"].filter(Boolean).join(" - "),17);if(r.description)career.text(r.description,20);career.gap(28);}}
  if(p.education.length){main.heading("Education");for(const r of p.education){main.text(r.qualification,24,true);main.text(r.institution,21);main.text([r.start_year,r.end_year].filter(Boolean).join(" - "),18,false,accent);main.gap(24);}}
  if(style==="timeline"&&p.skills.length){main.heading("Skills & expertise");main.text(p.skills.join(" • "),23);main.gap();}
  if(p.achievements.length){main.heading("Selected work & achievements");for(const r of p.achievements){main.text(r.title,23,true);if(r.description)main.text(r.description,20);if(r.url)main.text(r.url,18,false,accent);main.gap(20);}}
  if(style==="timeline"&&p.profile.languages.length){main.heading("Languages");main.text(p.profile.languages.join(" • "));}
  const privateRows=personalExportRows(p,includePrivate);if(privateRows.length){main.heading("Personal information");for(const [label,value] of privateRows){main.text(label,18,true,accent);main.text(value,21);main.gap(12);}}
  const pdf=await PDFDocument.create();
  for(const [index,c] of pages.entries()) {
    const context=c.getContext("2d")!;context.fillStyle="#928783";context.font='16px "Inter Variable",sans-serif';context.fillText(preview?"FICTIONAL DESIGN PREVIEW":e.full_name,style==="editorial"?410:60,height-40);context.fillText(`${index+1} / ${pages.length}`,width-100,height-40);
    const image=await pdf.embedPng(c.toDataURL("image/png"));pdf.addPage([595.28,841.89]).drawImage(image,{x:0,y:0,width:595.28,height:841.89});
  }
  if(onPreview && pages[0]) {
    const thumbnail=document.createElement("canvas");thumbnail.width=300;thumbnail.height=Math.round(300*height/width);
    thumbnail.getContext("2d")!.drawImage(pages[0],0,0,thumbnail.width,thumbnail.height);
    onPreview(thumbnail.toDataURL("image/jpeg",.85));
  }
  pdf.setTitle(`${e.full_name} - ${style} resume`);
  return new Blob([new Uint8Array(await pdf.save())],{type:"application/pdf"});
}
