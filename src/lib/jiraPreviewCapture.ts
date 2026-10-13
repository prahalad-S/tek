import html2canvas from "html2canvas";
import { previewDocument, type WorkspaceFiles } from "./editorGithub";

// Project scripts stay in the opaque sandbox; only a script-free snapshot can
// share the portal origin for the canvas renderer's document cloning operation.
export function captureJiraPreview(files: WorkspaceFiles, entry: string, frame: () => HTMLIFrameElement | null, show: (html: string) => void, signal: AbortSignal) {
  const rendered = previewDocument(files, entry), id = crypto.randomUUID();
  const captureCode = `window.addEventListener('load', () => setTimeout(() => {
    try {
      const clone = document.documentElement.cloneNode(true);
      const originals = document.documentElement.querySelectorAll('*'), copies = clone.querySelectorAll('*');
      originals.forEach((node, i) => {
        const copy = copies[i]; if (!copy || ['SCRIPT','STYLE','META','LINK'].includes(node.tagName)) return;
        const style = getComputedStyle(node);
        copy.setAttribute('style', Array.from(style).map(key => key+':'+style.getPropertyValue(key)).join(';'));
        if (node.tagName === 'CANVAS') { const img = document.createElement('img'); img.src=node.toDataURL('image/png'); img.setAttribute('style',copy.getAttribute('style')); copy.replaceWith(img); }
        if (node instanceof HTMLInputElement) copy.setAttribute('value', node.value);
        if (node instanceof HTMLTextAreaElement) copy.textContent = node.value;
      });
      parent.postMessage({ kind:'jarvis-preview-capture', id:${JSON.stringify(id)}, html:clone.outerHTML }, '*');
    } catch(error) { parent.postMessage({ kind:'jarvis-preview-capture', id:${JSON.stringify(id)}, error:String(error) }, '*'); }
  }, 2000));`;
  const html = rendered.html.replace("script-src ", `script-src 'nonce-${id}' `)
    .replace(/<\/body>/i, () => `<script nonce="${id}">${captureCode}</script></body>`);
  return new Promise<string>((resolve, reject) => {
    let snapshot: HTMLIFrameElement | null = null, received = false;
    const cleanup = () => { clearTimeout(timeout); snapshot?.remove(); window.removeEventListener("message", receive); signal.removeEventListener("abort", cancel); rendered.urls.forEach(URL.revokeObjectURL); };
    const cancel = () => { cleanup(); reject(new Error("Task stopped. Completed external updates remain; check the timeline before retrying.")); };
    const receive = async (event: MessageEvent) => {
      if (received || event.source !== frame()?.contentWindow || event.data?.kind !== "jarvis-preview-capture" || event.data?.id !== id) return;
      received = true;
      try {
        if (event.data.error) throw new Error(event.data.error);
        if (typeof event.data.html !== "string" || event.data.html.length > 6000000) throw new Error("Preview snapshot is too large.");
        const doc = new DOMParser().parseFromString(event.data.html, "text/html");
        doc.querySelectorAll('script,iframe,frame,object,embed,base,meta,link').forEach(node => node.remove());
        for (const node of doc.querySelectorAll('*')) for (const attr of [...node.attributes]) {
          if (/^on/i.test(attr.name) || ['srcdoc','href','action','formaction','srcset'].includes(attr.name)) node.removeAttribute(attr.name);
          if (['src','poster'].includes(attr.name) && !/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(attr.value)) node.removeAttribute(attr.name);
        }
        const policy = doc.createElement('meta'); policy.httpEquiv='Content-Security-Policy';
        policy.content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-src 'self' about:; form-action 'none'; base-uri 'none'"; doc.head.prepend(policy);
        snapshot = document.createElement('iframe'); snapshot.sandbox.add('allow-same-origin'); snapshot.setAttribute('aria-hidden','true');
        snapshot.style.cssText=`position:fixed;left:-10000px;top:0;width:${Math.max(320,frame()?.clientWidth || 800)}px;height:${Math.max(300,frame()?.clientHeight || 600)}px;border:0;pointer-events:none`;
        const loaded = new Promise<void>(done => { snapshot!.onload = () => done(); });
        snapshot.srcdoc = '<!doctype html>' + doc.documentElement.outerHTML; document.body.append(snapshot); await loaded;
        if (signal.aborted) return;
        const body = snapshot.contentDocument?.body; if (!body) throw new Error("Snapshot could not render.");
        const canvas = await html2canvas(body, { backgroundColor:null, scale:1, logging:false, useCORS:false, imageTimeout:3000, width:Math.min(snapshot.clientWidth,1600), height:Math.min(Math.max(snapshot.clientHeight,body.scrollHeight),1600) });
        const png = canvas.toDataURL('image/png'); if (png.length > 2800000) throw new Error("Screenshot exceeds 2 MB.");
        cleanup(); if (!signal.aborted) resolve(png);
      } catch (error) { cleanup(); reject(new Error(`Preview screenshot failed: ${error instanceof Error ? error.message : error}`)); }
    };
    const timeout = setTimeout(() => { cleanup(); reject(new Error("The preview could not finish capturing. No changes were published.")); }, 30000);
    window.addEventListener("message", receive); signal.addEventListener("abort", cancel, { once:true });
    if (signal.aborted) cancel(); else show(html);
  });
}
