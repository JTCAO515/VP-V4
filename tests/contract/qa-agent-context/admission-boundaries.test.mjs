import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';

// Optional read-only root exercises the same fixture against Main's integrated
// prompt version. It never modifies the producer or another owner's checkout.
const root=process.env.QAWEB_CONSUMER_ROOT??resolve(import.meta.dirname,'../../..');
const {assembleQaSessionContext}=await import(pathToFileURL(join(root,'lib/server/qa-agent-context/session.ts')));
const {TEXT_TASK_SYSTEM_PROMPT:prompt}=await import(pathToFileURL(join(root,'lib/server/model-gateway/prompt/text-turn.ts')));
const bytes=s=>Buffer.byteLength(s,'utf8');
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const binding={actorId:id(1),authSessionId:id(9),sessionId:id(2),taskId:id(3),scopeVersion:1,turnId:id(4),policyId:id(5),consentId:id(6),provider:'qwen',endpoint:'https://fixture.invalid/v1/chat/completions'};
function input(user,assistant,current) {
 const history=[{turnId:id(10),role:'user',content:user},{turnId:id(10),role:'assistant',content:assistant}];
 return {kind:'qa_input',schemaVersion:'qa-context/1',contextMode:'qa_session_history_v1',ownerId:binding.actorId,authSessionId:binding.authSessionId,turnId:binding.turnId,threadId:binding.sessionId,serviceTaskId:binding.taskId,policyId:binding.policyId,consentId:binding.consentId,provider:binding.provider,endpoint:binding.endpoint,text:current,locale:'zh',history,sourceTurnIds:[id(4),id(10)],contextDigest:'a'.repeat(64)};
}
const messages=r=>[...r.history.slice(-6).map(({role,content})=>({role,content})),{role:'user',content:r.text}];
const totals=r=>({content:messages(r).reduce((n,m)=>n+bytes(m.content),0),prompt:bytes(JSON.stringify([{role:'system',content:prompt},...messages(r)]))});
const accept=r=>assembleQaSessionContext(binding,r);
const reject=r=>assert.throws(()=>accept(r),/DATA_POLICY_BLOCKED/);

// Exact SQL-predictable JSON string interior length over valid Unicode scalar text.
function scalarEncodedBytes(s) {
 return [...s].reduce((n,c)=>n+(/["\\\b\t\n\f\r]/u.test(c)?2:c.codePointAt(0)<32?6:bytes(c)),0);
}
test('review repro and exact 16 KiB content boundary reject BEFORE producer admission',()=>{
 const r=input('中'.repeat(4000),'a','中'.repeat(4000));
 assert.equal(totals(r).content,24001);reject(r);
 const edge=input('中'.repeat(4000),'a','中'.repeat(1461));
 assert.equal(totals(edge).content,16384);accept(edge);
 const over={...edge,text:edge.text+'a'};assert.equal(totals(over).content,16385);reject(over);
});
test('JSON control escaping independently crosses prompt limit while raw content remains small',()=>{
 const r=input('\u0001'.repeat(4000),'a','x');
 const available=32768-totals({...r,text:''}).prompt;
 const current='\u0001'.repeat(Math.floor(available/6))+'a'.repeat(available%6);
 const edge={...r,text:current};assert.ok(edge.text.length>0&&edge.text.length<=4000);
 assert.equal(totals(edge).prompt,32768);assert.ok(totals(edge).content<16384);accept(edge);
 const over={...edge,text:edge.text+'a'};assert.equal(totals(over).prompt,32769);reject(over);
});
test('astral code points use two UTF16 units and four UTF8 bytes; existing valid_text rule matches',()=>{
 const scalarUnits=s=>[...s].reduce((n,c)=>n+(c.codePointAt(0)>65535?2:1),0);
 for(const s of ['😀'.repeat(2000),'😀'.repeat(2001),'中a😀'])assert.equal(scalarUnits(s),s.length);
 accept(input('😀'.repeat(2000),'a','😀'.repeat(2000)));
 reject(input('x','a','😀'.repeat(2001)));
});
test('SQL scalar JSON length formula exactly predicts quotes, slash, controls and Unicode',()=>{
 const samples=['normal','中😀','"\\/','\b\t\n\f\r','\u0001\u000b\u001f','a\u2028\u2029\uFEFF',...Array.from({length:31},(_,i)=>String.fromCodePoint(i+1))];
 for(const s of samples){
  assert.equal(scalarEncodedBytes(s),bytes(JSON.stringify(s))-2);
  const r=input(s+'x',s+'a',s+'z'),m=messages(r);
  const predicted=bytes(JSON.stringify([{role:'system',content:prompt}]))+m.reduce((n,x)=>n+(x.role==='user'?29:34)+scalarEncodedBytes(x.content),0);
  assert.equal(predicted,totals(r).prompt);
 }
});
test('4000-byte system reserve is conservative for the pinned prompt; raw-byte-only preflight is insufficient',()=>{
 const systemIncrement=bytes(JSON.stringify([{role:'system',content:prompt}]))-1;
 assert.ok(systemIncrement<=4000,`prompt reserve invalid: ${systemIncrement}`);
 for(const r of [input('中'.repeat(4000),'a','中'.repeat(1461)),input('\u0001'.repeat(4000),'a','\u0001'.repeat(817)+'abc'),input('"'.repeat(4000),'\\'.repeat(4000),'a')]){
  // JSONB adds formatting spaces. Its byte count is >= this compact JSON array
  // for PostgreSQL-valid UTF8 strings, so this proves the reserved-system part.
  const compactWithReserve=bytes(JSON.stringify(messages(r)))+4000;
  assert.ok(compactWithReserve>=totals(r).prompt);
  if(totals(r).content<=16384&&compactWithReserve<=32768)accept(r);
 }
});
