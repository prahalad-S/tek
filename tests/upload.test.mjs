import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadWithProgress} from '../src/lib/uploadTransport.ts';
class FakeXHR {
 static current;
 constructor(){FakeXHR.current=this;this.upload={};this.headers={};this.status=200;}
 open(method,url){this.method=method;this.url=url;}
 setRequestHeader(name,value){this.headers[name]=value;}
 send(file){this.file=file;}
 abort(){this.onabort?.();}
}
test('upload progress follows transferred bytes and waits for server response',async()=>{
 const original=globalThis.XMLHttpRequest;globalThis.XMLHttpRequest=FakeXHR;
 try{const progress=[];const controller=new AbortController();let finished=false;
 const task=uploadWithProgress(new Blob(['sample']),'https://test.invalid/upload','test-token','test-public-key','text/plain',p=>progress.push(p),controller.signal).then(()=>{finished=true});
 const xhr=FakeXHR.current;assert.equal(xhr.headers.Authorization,'Bearer test-token');assert.equal(xhr.method,'POST');
 xhr.upload.onprogress({lengthComputable:true,loaded:30,total:100});xhr.upload.onprogress({lengthComputable:true,loaded:100,total:100});
 assert.deepEqual(progress,[30,99]);assert.equal(finished,false);xhr.onload();await task;assert.equal(finished,true);
 }finally{globalThis.XMLHttpRequest=original}
});
test('upload cancellation, timeout and HTTP errors reject instead of reporting success',async()=>{
 const original=globalThis.XMLHttpRequest;globalThis.XMLHttpRequest=FakeXHR;
 try{for(const action of ['cancel','timeout','http']){const controller=new AbortController();const task=uploadWithProgress(new Blob(['sample']),'https://test.invalid/upload','test','test','text/plain',()=>{},controller.signal);const xhr=FakeXHR.current;
 if(action==='cancel')controller.abort();else if(action==='timeout')xhr.ontimeout();else{xhr.status=403;xhr.onload();}
 await assert.rejects(task,/cancelled|timed out|403/);
 }}finally{globalThis.XMLHttpRequest=original}
});
