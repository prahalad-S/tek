import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
try {
 const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
 page.on('console', message => { if (message.type() === 'error') console.log(message.text()); });
 page.on('pageerror', error => console.log(error.message));
 await page.goto('http://127.0.0.1:5173/preview/editor');
 await page.getByRole('heading', { name: 'Your creative workspace' }).waitFor();
 const result = await page.evaluate(async () => {
   const { captureJiraPreview } = await import('/src/lib/jiraPreviewCapture.ts');
   const frame = document.createElement('iframe'); frame.sandbox = 'allow-scripts'; frame.width = '640'; frame.height = '480'; document.body.append(frame);
   const screenshot = await captureJiraPreview({ 'index.html': '<html><head></head><body style="margin:0;min-height:480px;background:#ff0000;color:white"><h1>Welcome</h1><script>document.body.style.background="#000080"</script></body></html>' }, 'index.html', () => frame, html => { frame.srcdoc = html; }, new AbortController().signal);
   const image = new Image(); image.src = screenshot; await image.decode();
   const canvas = document.createElement('canvas'); canvas.width=image.width; canvas.height=image.height;
   const context=canvas.getContext('2d');context.drawImage(image,0,0);
   return { pixel:[...context.getImageData(600,400,1,1).data], bytes:screenshot.length, sandbox:frame.sandbox.value };
 });
 assert.deepEqual(result.pixel, [0,0,128,255]);
 assert.equal(result.sandbox, 'allow-scripts');
 console.log('Sandboxed preview capture passed: navy background rendered; PNG created without same-origin access.');
} finally { await browser.close(); }
