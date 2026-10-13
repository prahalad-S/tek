import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../src/lib/simpleTasks.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {simpleTask}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
test('heading task changes only first h1 and preserves attributes and the rest of the page',()=>{
 const original='<h1 id="hero"><span>Old heading</span></h1><h1>Other heading</h1><script>keep()</script>';
 const files={'index.html':original};const plan=simpleTask('Change the heading to Welcome',files);
 assert.equal(plan.changes[0].content,'<h1 id="hero">Welcome</h1><h1>Other heading</h1><script>keep()</script>');
 assert.equal(files['index.html'],original);
});
test('heading text is escaped and does not become executable markup',()=>{
 const plan=simpleTask('Change heading to <img src=x onerror=alert(1)> & Hello',{'index.html':'<h1>Old</h1>'});
 assert.equal(plan.changes[0].content,'<h1>&lt;img src=x onerror=alert(1)&gt; &amp; Hello</h1>');
});
test('ambiguous or unsupported tasks fail without an edit proposal',()=>{
 assert.throws(()=>simpleTask('Change heading to Welcome',{'a.html':'<h1>A</h1>','b.html':'<h1>B</h1>'}),/exactly one/);
 assert.throws(()=>simpleTask('Change heading to Welcome',{'a.html':'<p>Hi</p>'}),/no h1/);
 assert.throws(()=>simpleTask('Delete everything',{'a.html':'<h1>A</h1>'}),/predefined/);
});
test('CSS recipe is repeatable and retains existing CSS when switching themes',()=>{
 const files={'style.css':'.card { border-radius: 8px; }'};
 const dark=simpleTask('Make the page dark',files).changes[0].content;
 assert.equal(simpleTask('Make the page dark',{'style.css':dark}).changes.length,0);
 const light=simpleTask('Make the page light',{'style.css':dark}).changes[0].content;
 assert.ok(light.startsWith(files['style.css']));assert.equal(light.match(/Jarvis simple-task styles/g).length,2);
 assert.ok(!light.includes('#111827'));
});