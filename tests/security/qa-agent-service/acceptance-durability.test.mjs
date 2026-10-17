import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {initializeQaAcceptanceJournal} from '../../../lib/server/qa-agent/acceptance-journal.ts';
import {grantFor,acceptanceWorker} from './acceptance-fixture.mjs';

for(const point of ['initial-directory-sync','release-directory-sync','terminal-file-sync','unlink'])test(`durability fault ${point} stays stopped for a separate process, with no successor claim or send`,async t=>{
 const dir=await realpath(await mkdtemp(join(tmpdir(),'qa-acceptance-durability-owned-'))),grant=grantFor(),path=join(dir,`qa-acceptance-${grant.runId}.jsonl`);
 t.after(()=>rm(dir,{recursive:true,force:true}));await initializeQaAcceptanceJournal(path,grant);
 const helper=new URL('./acceptance-fixture.mjs',import.meta.url).href;
 const script=`import {mock} from 'node:test';const fs=await import('node:fs/promises');const {default:unused,...named}=fs;
 let directories=0,files=0,injected=false;
 mock.module('node:fs/promises',{namedExports:{...named,open:async(...args)=>{
  const file=await fs.open(...args),sync=file.sync.bind(file);
  if(args[0]===process.argv[3])file.sync=async()=>{directories++;if((process.argv[4]==='initial-directory-sync'&&directories===1)||(process.argv[4]==='release-directory-sync'&&directories===2)){injected=true;throw Object.assign(Error('synthetic fsync fault'),{code:'EIO'});}return sync();};
  if(args[0]===process.argv[1])file.sync=async()=>{files++;if(process.argv[4]==='terminal-file-sync'&&files===3){await sync();injected=true;throw Object.assign(Error('synthetic unknown fsync ACK'),{code:'EIO'});}return sync();};
  return file;
 },unlink:async(...args)=>{if(process.argv[4]==='unlink'&&args[0]===process.argv[1]+'.lock'){injected=true;throw Object.assign(Error('synthetic unlink refused'),{code:'EACCES'});}return fs.unlink(...args);}}});
 const {acceptanceWorker}=await import(${JSON.stringify(helper)});const w=acceptanceWorker({path:process.argv[1],grant:JSON.parse(process.argv[2])});
 console.log(JSON.stringify({result:await w.run(),physical:w.physical,claims:w.claims,injected}));`;
 const first=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','--experimental-test-module-mocks','--input-type=module','-e',script,path,JSON.stringify(grant),dir,point],{encoding:'utf8',stdio:['pipe','pipe','pipe']}));
 assert.equal(first.injected,true);assert.equal(first.result,'unavailable');assert.ok(first.physical<=1);
 const next=`const {acceptanceWorker}=await import(${JSON.stringify(helper)});const w=acceptanceWorker({path:process.argv[1],grant:JSON.parse(process.argv[2])});console.log(JSON.stringify({result:await w.run(),physical:w.physical,claims:w.claims}));`;
 const restarted=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',next,path,JSON.stringify(grant)],{encoding:'utf8',stdio:['pipe','pipe','pipe']}));
 assert.deepEqual(restarted,{result:'unavailable',physical:0,claims:0});
 const journal=await readFile(path,'utf8');assert.ok(journal.endsWith('\n'));
 const local=acceptanceWorker({path,grant});assert.equal(await local.run(),'unavailable');assert.equal(local.claims,0);assert.equal(local.physical,0);
});
