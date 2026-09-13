import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the production effect with deterministic external IO and timers.
// This tests lifecycle/race behavior; actual React rendering is verified in UI.
const compiled=ts.transpileModule(readFileSync('components/chat/SavedAnswers.tsx','utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022},
}).outputText;
const data=(owner='a',lifetimeMs=30000,label='first')=>({ownerId:owner,lifetimeMs,turns:[{id:label}]});
async function harness(){
 let now=0,sequence=0,subject='a',authChanged,cleanup;const timers=new Map(),states=[],requests=[],events=new Map();
 const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
 const listen=(name,handler)=>events.set(name,handler),remove=name=>events.delete(name);
 const doc={visibilityState:'visible',addEventListener:listen,removeEventListener:remove};
 const nav={onLine:true};
 const auth={auth:{getSession:async()=>({data:{session:subject?{user:{id:subject}}:null}}),onAuthStateChange:fn=>{authChanged=fn;return {data:{subscription:{unsubscribe(){authChanged=undefined;}}}};}}};
 const react={useState:initial=>{const i=states.length;states.push(initial);return [initial,v=>{states[i]=v;}];},useRef:current=>({current}),useEffect:effect=>{cleanup=effect();}};
 const exports={};const context={exports,AbortController,performance:{now:()=>now},navigator:nav,document:doc,window:{addEventListener:listen,removeEventListener:remove},queueMicrotask,
  setTimeout:(fn,ms)=>{const id=++sequence;timers.set(id,{at:now+ms,fn});return id;},clearTimeout:id=>timers.delete(id),
  fetch:(_url,options)=>new Promise(resolve=>requests.push({signal:options.signal,resolve})),
  require:name=>{if(name==='react')return react;if(name==='react/jsx-runtime')return {jsx:()=>null,jsxs:()=>null};if(name.includes('browser-auth-client'))return {createPasswordAuthClient:()=>auth};if(name.includes('grounded/copy'))return {savedAnswerCopy:{en:{}}};if(name.endsWith('.css'))return {default:{}};throw Error('Unexpected import '+name);},
 };
 vm.runInNewContext(compiled,context,{filename:'SavedAnswers.tsx'});exports.SavedAnswers({locale:'en'});
 const h={states,requests,doc,nav,
  auth:async owner=>{subject=owner;authChanged('SIGNED_IN',owner?{user:{id:owner}}:null);await flush();},
  event:async name=>{events.get(name)?.();await flush();},
  reply:async(index,body,ok=true)=>{requests[index].resolve({ok,json:async()=>({data:body})});await flush();},
  tick:async ms=>{const end=now+ms;for(;;){const next=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();await flush();}now=end;await flush();},
  cleanup:()=>cleanup(),
 };
 await h.auth('a');assert.equal(requests.length,1);return h;
}
test('early refresh keeps current data and replaces the deadline only after an authorized response',async()=>{
 const h=await harness();await h.reply(0,data());await h.tick(24999);assert.equal(h.requests.length,1);
 await h.tick(1);assert.equal(h.requests.length,2);assert.equal(h.states[1],'ready');assert.equal(h.states[0].turns[0].id,'first');
 await h.tick(2000);await h.reply(1,data('a',30000,'second'));await h.tick(3000);
 assert.equal(h.states[1],'ready');assert.equal(h.states[0].turns[0].id,'second','old expiry must not hide the authorized replacement');h.cleanup();
});
test('a stalled refresh cannot extend old visibility and its late response cannot restore content',async()=>{
 const h=await harness();await h.reply(0,data());await h.tick(25000);assert.equal(h.requests.length,2);
 await h.tick(4999);assert.equal(h.states[1],'ready');await h.tick(1);
 assert.equal(h.states[1],'checking');assert.equal(h.requests[1].signal.aborted,true);assert.equal(h.requests.length,3);
 await h.reply(1,data('a',30000,'late'));assert.equal(h.states[1],'checking');assert.notEqual(h.states[0]?.turns[0].id,'late');
 await h.reply(2,data('a',30000,'current'));assert.equal(h.states[1],'ready');assert.equal(h.states[0].turns[0].id,'current');h.cleanup();
});
test('refresh failure, offline, background and auth replacement hide data and fence late responses',async()=>{
 for(const action of ['failure','offline','hidden','logout','owner']){
  const h=await harness();await h.reply(0,data());await h.tick(25000);
  if(action==='failure')await h.reply(1,null,false);
  if(action==='offline'){h.nav.onLine=false;await h.event('offline');}
  if(action==='hidden'){h.doc.visibilityState='hidden';await h.event('visibilitychange');}
  if(action==='logout')await h.auth(null);
  if(action==='owner')await h.auth('b');
  assert.notEqual(h.states[1],'ready',action);assert.equal(h.requests[1].signal.aborted,true,action);
  if(action!=='failure')await h.reply(1,data('a',30000,'late-owner-a'));
  assert.notEqual(h.states[1],'ready',action);assert.notEqual(h.states[0]?.turns[0].id,'late-owner-a',action);
  if(action==='owner'){await h.reply(2,data('b',30000,'owner-b'));assert.equal(h.states[0].ownerId,'b');assert.equal(h.states[1],'ready');}
  h.cleanup();
 }
});
test('short lifetimes avoid busy refresh loops and full request elapsed time reduces display lifetime',async()=>{
 const short=await harness();await short.reply(0,data('a',4000));await short.tick(3999);assert.equal(short.requests.length,1);await short.tick(1);assert.equal(short.states[1],'checking');assert.equal(short.requests.length,2);short.cleanup();
 const edge=await harness();await edge.reply(0,data('a',5001));await edge.tick(999);assert.equal(edge.requests.length,1);await edge.tick(1);assert.equal(edge.requests.length,2);edge.cleanup();
 const slow=await harness();await slow.tick(2000);await slow.reply(0,data('a',6000));await slow.tick(3999);assert.equal(slow.states[1],'ready');await slow.tick(1);assert.equal(slow.states[1],'checking');slow.cleanup();
});
