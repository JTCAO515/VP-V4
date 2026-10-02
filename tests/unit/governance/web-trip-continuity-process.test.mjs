import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {runOpsProcess} from '../../integration/service-cases/ops-process.mjs';

// Deliberately short/punctuated values defeated the former substring-redaction approach.
const payload='error password: p!x\nCookie: a=b!; z=q\nAuthorization: Bearer a.b.c\npostgres://u:p!x@h/db\nfailed https://h/?k=x\n';
const prefix='VP_OPS_PROCESS_FAILURE ';
test('shared fixed classifier remains silent on successful secret-like CLI output',async()=>{
 const lines=[];
 const code=await runOpsProcess(process.execPath,['-e',`process.stdout.write(${JSON.stringify(payload)});process.stderr.write(${JSON.stringify(payload)});`],{phase:'start',report:line=>lines.push(line)});
 assert.equal(code,0);assert.deepEqual(lines,[]);
});
test('continuity startup/cleanup injection preserves original failure and only owned cleanup',()=>{
 const directory=mkdtempSync(join(tmpdir(),'vpj41-cli-injection-')),record=join(directory,'calls.jsonl'),fake=join(directory,'supabase');
 writeFileSync(join(directory,'docker'),`#!${process.execPath}\nconst args=process.argv.slice(2);if(args[1]==='show')process.stdout.write('synthetic');else if(args[1]==='inspect')process.stdout.write(JSON.stringify([{Endpoints:{docker:{Host:'unix:///synthetic-only.sock'}}}]));else process.exitCode=1;`,{mode:0o700});
 writeFileSync(fake,`#!${process.execPath}\nconst fs=require('node:fs'),args=process.argv.slice(2),workdir=args[args.indexOf('--workdir')+1];
 const config=fs.readFileSync(workdir+'/supabase/config.toml','utf8');fs.appendFileSync(process.env.CONTINUITY_INJECTION_RECORD,JSON.stringify({phase:args[0],args,workdir,project:config.match(/^project_id = "([^"]+)"/m)[1]})+'\\n');
 process.stdout.write(${JSON.stringify(payload)});process.stderr.write(${JSON.stringify(payload+'address already in use')});process.exitCode=args[0]==='start'?37:Number(process.env.CONTINUITY_INJECTION_CLEANUP_EXIT);`,{mode:0o700});
 try{
  for(const cleanupExit of [0,29]){
   writeFileSync(record,'');
   const env={...process.env,PATH:directory+':'+process.env.PATH,VP_SUPABASE_CLI:fake,CONTINUITY_INJECTION_RECORD:record,CONTINUITY_INJECTION_CLEANUP_EXIT:String(cleanupExit)};
   delete env.DOCKER_HOST;delete env.DOCKER_CONTEXT;delete env.VERCEL_ENV;
   const r=spawnSync(process.execPath,['tests/integration/web-trip-continuity/run.mjs'],{encoding:'utf8',timeout:15000,env});
   assert.equal(r.status,37,'cleanup failure cannot swallow or replace original startup failure');assert.equal(r.stdout,'');
   const lines=r.stderr.trim().split('\n');assert.equal(lines.length,cleanupExit?2:1);
   for(const [i,line]of lines.entries()){
    assert.ok(line.startsWith(prefix));
    assert.deepEqual(JSON.parse(line.slice(prefix.length)),{schema:'ops-process-failure/1',phase:i?'cleanup':'start',exitCode:i?29:37,termination:'exit',launchError:'none',hints:['port_conflict']});
   }
   assert.doesNotMatch(r.stderr,/password|Cookie|Authorization|Bearer|postgres:|https:|p!x|a\.b\.c|a=b!/);
   const calls=readFileSync(record,'utf8').trim().split('\n').map(JSON.parse);assert.deepEqual(calls.map(x=>x.phase),['start','stop']);
   assert.equal(calls[0].workdir,calls[1].workdir);assert.match(calls[0].project,/^vp-web-continuity-[a-f0-9]{8}$/);
   assert.deepEqual(calls[1].args,['stop','--workdir',calls[0].workdir,'--no-backup']);
   assert.equal(existsSync(calls[0].workdir),Boolean(cleanupExit),'failed cleanup retains only its own recovery directory');
   if(cleanupExit)rmSync(calls[0].workdir,{recursive:true});
  }
 }finally{rmSync(directory,{recursive:true});}
});
