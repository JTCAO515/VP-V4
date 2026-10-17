import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,readFile,writeFile,lstat,rm,appendFile,symlink,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {initializeQaAcceptanceJournal,openQaAcceptanceJournal,verifyQaAcceptanceJournal} from '../../../lib/server/qa-agent/acceptance-journal.ts';
import {grantFor,acceptanceWorker} from './acceptance-fixture.mjs';
const exec=promisify(execFile);
async function fixture(t,grant=grantFor()) {
 const dir=await realpath(await mkdtemp(join(tmpdir(),'qa-acceptance-owned-'))),path=join(dir,`qa-acceptance-${grant.runId}.jsonl`);
 t.after(()=>rm(dir,{recursive:true,force:true}));
 await initializeQaAcceptanceJournal(path,grant);return {dir,path,grant};
}
const read=async path=>(await readFile(path,'utf8')).trim().split('\n').map(JSON.parse);
async function childRun(f,action='worker') {
 const helper=new URL('./acceptance-fixture.mjs',import.meta.url).href;
 const journal=new URL('../../../lib/server/qa-agent/acceptance-journal.ts',import.meta.url).href;
 const script=action==='crash'
  ? `const {openQaAcceptanceJournal}=await import(${JSON.stringify(journal)});await openQaAcceptanceJournal(process.argv[1],JSON.parse(process.argv[2])).enter(new AbortController().signal);process.exit(0);`
  : `const {acceptanceWorker}=await import(${JSON.stringify(helper)});const w=acceptanceWorker({path:process.argv[1],grant:JSON.parse(process.argv[2])});console.log(JSON.stringify({result:await w.run(),physical:w.physical,claims:w.claims}));`;
 const r=await exec(process.execPath,['--experimental-strip-types','--input-type=module','-e',script,f.path,JSON.stringify(f.grant)],{cwd:fileURLToPath(new URL('../../../',import.meta.url))});
 return r.stdout.trim()?JSON.parse(r.stdout):null;
}

test('two original worker dispatches survive actual process restart; third has no claim/reserve/provider',async t=>{
 const f=await fixture(t),one=acceptanceWorker(f);assert.equal(await one.run(),'finished');assert.equal(one.physical,1);
 assert.deepEqual(await childRun(f),{result:'finished',physical:1,claims:1});
 const three=acceptanceWorker(f);assert.equal(await three.run(),'unavailable');assert.equal(three.physical,0);assert.equal(three.claims,0);
 const rows=await read(f.path);assert.equal(rows.filter(r=>r.kind==='dispatch').length,2);assert.equal(rows.filter(r=>r.kind==='success').length,2);
 assert.equal(rows.some(r=>Object.hasOwn(r,'body')||Object.hasOwn(r,'text')),false);
});
test('concurrent worker instances and a separate process cannot overlap the same journal run',async t=>{
 const f=await fixture(t);let arrived,release;
 const entered=new Promise(r=>arrived=r),held=new Promise(r=>release=r);
 const one=acceptanceWorker({...f,beforeProvider:async()=>{arrived();await held;}}),running=one.run();await entered;
 const two=acceptanceWorker(f);assert.equal(await two.run(),'unavailable');assert.equal(two.claims,0);
 assert.deepEqual(await childRun(f),{result:'unavailable',physical:0,claims:0});
 release();assert.equal(await running,'finished');assert.equal(one.physical,1);
 const next=acceptanceWorker(f);assert.equal(await next.run(),'finished');assert.equal(next.physical,1);
});
test('first failure or unknown ACK/usage is sticky across restart, with original pending holds',async t=>{
 for(const behavior of ['provider-error','dispatch-ack-unknown','settle-ack-unknown','completion-ack-unknown','usage-unknown','usage-over-cap','duplicate-send']){
  const f=await fixture(t),one=acceptanceWorker({...f,behavior});assert.equal(await one.run(),'unavailable',behavior);
  assert.ok(one.physical<=1);assert.equal((await read(f.path)).at(-1).kind,'stopped',behavior);
  assert.deepEqual(await childRun(f),{result:'unavailable',physical:0,claims:0},behavior);
  if(behavior!=='completion-ack-unknown')assert.equal(one.finish.at(-1),'pending',behavior);
  assert.equal(one.finish.includes('release'),false,behavior);
 }
});
test('crash after durable enter retains original lock and denies a restarted worker without auto-recovery',async t=>{
 const f=await fixture(t);await childRun(f,'crash');assert.equal((await read(f.path)).at(-1).kind,'enter');
 assert.ok((await lstat(f.path+'.lock')).isFile());assert.deepEqual(await childRun(f),{result:'unavailable',physical:0,claims:0});
});
test('root stop intent persists without stealing an active permit and vetoes its not-yet-sent request',async t=>{
 const f=await fixture(t),active=openQaAcceptanceJournal(f.path,f.grant),other=openQaAcceptanceJournal(f.path,f.grant);
 const permit=await active.enter(new AbortController().signal);await other.requestStop();
 assert.ok((await lstat(f.path+'.lock')).isFile());assert.ok((await read(f.path)).some(e=>e.kind==='veto'));
 await assert.rejects(lstat(f.path+'.stop'),{code:'ENOENT'});
 await assert.rejects(permit.beforeDispatch({turnId:'33333333-3333-4333-8333-333333333333',attemptId:'44444444-4444-4444-8444-444444444444',requestDigest:'a'.repeat(64)}));
 await permit.finish('stopped');await assert.rejects(verifyQaAcceptanceJournal(f.path,f.grant));
 assert.deepEqual(await childRun(f),{result:'unavailable',physical:0,claims:0});
});
test('expiry during authorized SQL dispatch prevents physical send and preserves pending budget',async t=>{
 const now=Date.now(),f=await fixture(t,{...grantFor(now),expiresAt:now+1000});
 // Deterministic clock advance at the original SQL authorization seam.
 const clock=t.mock.method(Date,'now',()=>now);
 const w=acceptanceWorker({...f,onDispatchAuthorized:()=>clock.mock.mockImplementation(()=>now+1001)});
 assert.equal(await w.run(),'unavailable');assert.equal(w.physical,0);assert.equal(w.finish.at(-1),'pending');
 assert.equal((await read(f.path)).at(-1).kind,'stopped');clock.mock.restore();
 const restarted=acceptanceWorker(f);assert.equal(await restarted.run(),'unavailable');assert.equal(restarted.claims,0);
});
test('wrong actor/policy/config/source/job binding refuses construction before any RPC or send',async t=>{
 const f=await fixture(t);
 for(const grant of [{...f.grant,binding:{...f.grant.binding,ownerId:'99999999-9999-4999-8999-999999999999'}},
  {...f.grant,binding:{...f.grant.binding,policyId:'99999999-9999-4999-8999-999999999999'}},
  {...f.grant,binding:{...f.grant.binding,scopeId:'99999999-9999-4999-8999-999999999999'}},
  {...f.grant,binding:{...f.grant.binding,noticeHash:'b'.repeat(64)}},
  {...f.grant,binding:{...f.grant.binding,configurationId:'99999999-9999-4999-8999-999999999999'}},
  {...f.grant,binding:{...f.grant.binding,configurationVersion:2}},
  {...f.grant,binding:{...f.grant.binding,sourceCommit:'1'.repeat(40)}},
  {...f.grant,binding:{...f.grant.binding,jobDigest:'1'.repeat(64)}}])assert.throws(()=>acceptanceWorker({...f,grant}));
 await assert.rejects(initializeQaAcceptanceJournal(f.path,f.grant));
 const missingGrant={...f.grant,runId:'99999999-9999-4999-8999-999999999999'};
 const other=acceptanceWorker({...f,grant:missingGrant,path:join(f.dir,`qa-acceptance-${missingGrant.runId}.jsonl`)});assert.equal(await other.run(),'unavailable');assert.equal(other.physical,0);
});
test('empty queue consumes no physical slot; replaying same Turn under a new lease stops instead of resending',async t=>{
 const f=await fixture(t);assert.equal(await acceptanceWorker({...f,behavior:'empty'}).run(),'empty');
 const turnId='33333333-3333-4333-8333-333333333333',one=acceptanceWorker({...f,turnId});assert.equal(await one.run(),'finished');
 const same=acceptanceWorker({...f,turnId});assert.equal(await same.run(),'unavailable');assert.equal(same.physical,0);assert.equal(same.finish.at(-1),'pending');
 assert.equal((await read(f.path)).at(-1).kind,'stopped');
});
test('uncontrolled original worker and an independent authorized run do not inherit another run stop',async t=>{
 const stopped=await fixture(t);assert.equal(await acceptanceWorker({...stopped,behavior:'provider-error'}).run(),'unavailable');
 const other=await fixture(t);assert.equal(await acceptanceWorker(other).run(),'finished');
 const ordinary=acceptanceWorker({uncontrolled:true});assert.equal(await ordinary.run(),'finished');assert.equal(ordinary.physical,1);
});
test('truncated journal, altered grant, and symlink refuse without provider or silent file replacement',async t=>{
 const f=await fixture(t);const original=await readFile(f.path);
 await appendFile(f.path,'{"kind":');const w=acceptanceWorker(f);assert.equal(await w.run(),'unavailable');assert.equal(w.claims,0);
 assert.ok((await readFile(f.path)).equals(Buffer.concat([original,Buffer.from('{"kind":')])));
 const g=await fixture(t);const header=(await read(g.path))[0];header.grant.runId='99999999-9999-4999-8999-999999999999';
 await writeFile(g.path,JSON.stringify(header)+'\n');assert.equal(await acceptanceWorker(g).run(),'unavailable');
 const h=await fixture(t);await rename(h.path,h.path+'.original');await symlink(h.path+'.original',h.path);
 const alias=acceptanceWorker(h);assert.equal(await alias.run(),'unavailable');assert.equal(alias.physical,0);
 assert.ok((await lstat(h.path)).isSymbolicLink());
});
