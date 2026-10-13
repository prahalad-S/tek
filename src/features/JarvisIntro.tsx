import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
export default function JarvisIntro({onReveal,onDone}:{onReveal:()=>void;onDone:()=>void}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const [fading,setFading]=useState(false);
  const callbacks=useRef({onReveal,onDone});callbacks.current={onReveal,onDone};
  useEffect(()=>{
    let cancelled=false,frame=0,finished=false,assistantRevealed=false;
    let revealTimer:ReturnType<typeof setTimeout>|undefined,fadeTimer:ReturnType<typeof setTimeout>|undefined;
    function showAssistant(){if(cancelled||assistantRevealed)return;assistantRevealed=true;callbacks.current.onReveal();}
    function reveal(){if(cancelled||finished)return;finished=true;setFading(true);showAssistant();fadeTimer=setTimeout(()=>{if(!cancelled)callbacks.current.onDone();},650);}
    const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if(reduced){revealTimer=setTimeout(reveal,0);return()=>{cancelled=true;if(revealTimer)clearTimeout(revealTimer);if(fadeTimer)clearTimeout(fadeTimer);};}
    async function animate() {
      const target=document.querySelector<HTMLElement>(".app-shell"),surface=canvas.current;
      if(!target||!surface){reveal();return;}
      const width=window.innerWidth,height=window.innerHeight;
      const tile=Math.max(14,Math.round(Math.sqrt(width*height/5500)));
      const columns=Math.ceil(width/tile),rows=Math.ceil(height/tile);
      const pixels=document.createElement("canvas");pixels.width=columns;pixels.height=rows;
      const pixelContext=pixels.getContext("2d",{willReadFrequently:true})!;
      let image:Uint8ClampedArray|null=null;
      // Snapshot stays on this device. It is never uploaded or persisted.
      const capture=async()=>{
        const {default:html2canvas}=await import("html2canvas");
        return html2canvas(target,{scale:Math.min(.7,900/width),width,height,windowWidth:width,windowHeight:height,scrollX:window.scrollX,scrollY:window.scrollY,useCORS:true,allowTaint:false,logging:false,backgroundColor:null,imageTimeout:700,
          ignoreElements:element=>element.matches("iframe,video,.jarvis-intro-overlay,.jarvis-layer,.jarvis-conversation,.jarvis-conversation-body")});
      };
      let captureTimer:ReturnType<typeof setTimeout>|undefined;
      try {
        const snapshot=await Promise.race([capture(),new Promise<null>(resolve=>{captureTimer=setTimeout(()=>resolve(null),1200);})]);
        if(cancelled)return;
        if(snapshot){pixelContext.drawImage(snapshot,0,0,columns,rows);image=pixelContext.getImageData(0,0,columns,rows).data;snapshot.width=0;snapshot.height=0;}
      } catch { /* External embeds or unsupported CSS can prevent capture. */ }
      finally {if(captureTimer)clearTimeout(captureTimer);}
      if(cancelled)return;
      surface.width=width;surface.height=height;
      const context=surface.getContext("2d")!;
      const dark=document.documentElement.dataset.theme==="dark";
      const centerX=width/2,centerY=height/2,maxRadius=Math.hypot(centerX,centerY);
      const started=performance.now();
      function draw(now:number) {
        if(cancelled)return;
        const progress=Math.min(1,(now-started)/1500);
        if(progress>=.05)showAssistant();
        const radius=progress*(maxRadius+tile*4),band=Math.max(65,maxRadius*.18);
        context.clearRect(0,0,width,height);
        for(let row=0;row<rows;row++) for(let col=0;col<columns;col++) {
          const x=col*tile,y=row*tile,dx=x+tile/2-centerX,dy=y+tile/2-centerY,distance=Math.hypot(dx,dy);
          const envelope=Math.exp(-Math.pow((distance-radius)/band,2));
          if(envelope<.04)continue;
          const ripple=Math.sin((distance-radius)/band*Math.PI*3)*envelope;
          const displacement=ripple*tile*1.8;
          const index=(row*columns+col)*4;
          const block=tile*(.8+Math.abs(ripple)*.65);
          context.globalAlpha=envelope*.92;
          if(image&&image[index+3]>0)context.fillStyle=`rgb(${image[index]} ${image[index+1]} ${image[index+2]})`;
          else context.fillStyle=dark?`hsl(${245+35*Math.sin(col*.13+row*.1)} 65% ${40+envelope*20}%)`:`hsl(${245+35*Math.sin(col*.13+row*.1)} 45% ${70-envelope*22}%)`;
          context.fillRect(x+dx/Math.max(1,distance)*displacement+(tile-block)/2,y+dy/Math.max(1,distance)*displacement+(tile-block)/2,block,block);
          if(Math.abs(ripple)>.45){context.globalAlpha=envelope*.2;context.fillStyle=dark?"#b6a1ff":"#8b6ad1";context.fillRect(x,y,block,block);}
        }
        context.globalAlpha=1;
        if(progress<1)frame=requestAnimationFrame(draw);else reveal();
      }
      frame=requestAnimationFrame(draw);
    }
    void animate();
    // Always recover if capture or browser rendering stalls.
    revealTimer=setTimeout(reveal,3000);
    const resized=()=>reveal();window.addEventListener("resize",resized,{once:true});
    return()=>{cancelled=true;cancelAnimationFrame(frame);if(revealTimer)clearTimeout(revealTimer);if(fadeTimer)clearTimeout(fadeTimer);window.removeEventListener("resize",resized);};
  },[]);
  return createPortal(<div className={`jarvis-intro-overlay jarvis-pixel-intro${fading?" is-fading":""}`} aria-hidden="true"><canvas ref={canvas}/></div>,document.body);
}
