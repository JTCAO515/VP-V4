import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {initializeQaAcceptanceJournal} from '../../../lib/server/qa-agent/acceptance-journal.ts';
import {grantFor} from './acceptance-fixture.mjs';

test('control stop survives denied sidecar creation while A owns dispatch; new process C cannot claim/send',async t=>{
 const dir=await realpath(await mkdtemp(join(tmpdir(),'qa-stop-create-owned-'))),grant=grantFor(),path=join(dir,`qa-acceptance-${grant.runId}.jsonl`);
 t.after(()=>rm(dir,{recursive:true,force:true}));await initializeQaAcceptanceJournal(path,grant);
 const journal=new URL('../../../lib/server/qa-agent/acceptance-journal.ts',import.meta.url).href,helper=new URL('./acceptance-fixture.mjs',import.meta.url).href;
 const script=`import {mock} from 'node:test';import {randomUUID} from 'node:crypto';const fs=await import('node:fs/promises');const {default:unused,...named}=fs;
 let denied=0;mock.module('node:fs/promises',{namedExports:{...named,open:async(...args)=>{if(String(args[0]).endsWith('.stop')){denied++;throw Object.assign(Error('synthetic stop create denied'),{code:'EACCES'});}return fs.open(...args);}}});
 const {openQaAcceptanceJournal}=await import(${JSON.stringify(journal)});const path=process.argv[1],grant=JSON.parse(process.argv[2]);
 const a=openQaAcceptanceJournal(path,grant),b=openQaAcceptanceJournal(path,grant),permit=await a.enter(new AbortController().signal);
 await permit.beforeDispatch({turnId:randomUUID(),attemptId:randomUUID(),requestDigest:'c'.repeat(64)});let bError=null;
 try{await b.requestStop();}catch(e){bError=e.code??e.name;}await permit.finish('success');
 console.log(JSON.stringify({denied,bError}));`;
 const first=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','--experimental-test-module-mocks','--input-type=module','-e',script,path,JSON.stringify(grant)],{encoding:'utf8',stdio:['pipe','pipe','pipe']}));
 const next=`const {acceptanceWorker}=await import(${JSON.stringify(helper)});const w=acceptanceWorker({path:process.argv[1],grant:JSON.parse(process.argv[2])});console.log(JSON.stringify({result:await w.run(),claims:w.claims,physical:w.physical}));`;
 const c=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',next,path,JSON.stringify(grant)],{encoding:'utf8',stdio:['pipe','pipe','pipe']}));
 console.log(JSON.stringify({case:'control-stop-create-refusal',b:first,c}));
 assert.deepEqual(c,{result:'unavailable',claims:0,physical:0});assert.equal(first.bError,null);assert.equal(first.denied,0,'stop persistence does not require creating a sidecar');
});

test('original hosted-root chain preserves B failure with sidecar creation denied until after A completes',()=>{
 const preload=`import {mock} from 'node:test';const fs=await import('node:fs/promises');const {default:unused,...named}=fs;let armed=false;
 mock.module('node:fs/promises',{namedExports:{...named,open:async(...args)=>{if(armed&&String(args[0]).endsWith('.stop'))throw Object.assign(Error('synthetic stop create denied'),{code:'EACCES'});return fs.open(...args);}}});
 globalThis.__qaDenyStopCreation=async action=>{armed=true;try{return await action();}finally{armed=false;}};`;
 const path=new URL('./acceptance-hosted.test.mjs',import.meta.url).pathname;
 const env={...process.env};delete env.NODE_TEST_CONTEXT;
 let output;
 try {output=execFileSync(process.execPath,['--experimental-strip-types','--experimental-test-module-mocks','--import','data:text/javascript,'+encodeURIComponent(preload),'--test','--test-name-pattern=real hosted root',path],{env,encoding:'utf8',stdio:['pipe','pipe','pipe']});}
 catch(error){console.log(String(error.stdout));throw error;}
 console.log(output);assert.match(output,/root-stop-create-refusal/);
});
