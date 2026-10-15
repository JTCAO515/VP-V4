import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtempSync,chmodSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomUUID as uuid} from 'node:crypto';
import {nativeDatabase} from './native-db.mjs';
import {fixturePorts} from './fixture.mjs';
test('actual CLI entry selects only explicit Trip profile and runs the original loop to a real SQL candidate', {skip:!process.env.VP_TRIP_PG_BIN,timeout:180000},async t=>{
 const {db,upgrade}=await nativeDatabase(t);await db('begin;'+upgrade+'commit;');const f=fixturePorts(db);
 await db('update turn_private.service_task_capacity_settings set trip_enabled=true,enabled=true');
 const a=await f.workerFixture(true),goal=await f.canonical(a),c=await f.prepare(a,goal),ask={action:'ask',operationId:uuid(),basis:{contextId:c.contextId,contextDigest:c.contextDigest,baseVersion:0},text:'Move B to d2'};
 const task=await f.call(a,'submit_trip_service_task_v1',[a.trip,ask,goal]);
 const profile={schemaVersion:'vpj10-hosted-trip-service-task/1',loop:{schemaVersion:'vpj07-hosted-text-worker/1',pollIntervalMs:1000,maxLifetimeMs:60000,drainMs:0,concurrency:1,groupLimit:1,modes:['current_input_v1'],qwen:{priceVersion:'synthetic-v1',pricing:{mode:'flat',inputMicrosPerMillion:1000000,outputMicrosPerMillion:1000000,cachedInputMicrosPerMillion:null},reservedMicros:2000000,maxOutputTokens:1000,timeoutMs:10000,configurationId:a.configuration,configurationVersion:1}},target:{ownerId:a.owner,policyId:a.policy,scopeId:a.scope}};
 let child;let providerCalls=0;const sqlCalls=[];
 const server=createServer(async(req,res)=>{try{let text='';for await(const b of req)text+=b;const wire=JSON.parse(text);let result;
  if(wire.url.startsWith('https://dzqdzetcctkhbrhlxxgn.supabase.co/rest/v1/rpc/')){const name=wire.url.split('/').at(-1),params=JSON.parse(wire.body);sqlCalls.push([name,params.p_method]);result=await f.rawService(name,params);if(params.p_method==='complete_scoped_trip_edit_work_v1'&&result.kind==='candidate_saved')setTimeout(()=>child?.kill('SIGTERM'),200);}
  else{assert.equal(wire.url,'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');providerCalls++;const p=JSON.parse(wire.body);result={model:p.model,usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15},choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({kind:'candidate',edits:[{kind:'move_item',itemId:'b',toDayId:'d2'}]})}}]};}
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(result));
 }catch(e){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message}));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const directory=mkdtempSync('/tmp/agent008-cli-journal-');chmodSync(directory,0o700);t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const broker=`http://127.0.0.1:${server.address().port}/fixture`;
 const baseEnv={PATH:process.env.PATH,VISEPANDA_HOSTED_TEXT_WORKER:'true',VISEPANDA_HOSTED_TRIP_SERVICE_TASK_WORKER:'true',VISEPANDA_HOSTED_WORKER_DB_KEY:'synthetic-trip-worker-key',VISEPANDA_HOSTED_WORKER_QWEN_KEY:'synthetic-trip-provider-key',VISEPANDA_HOSTED_WORKER_JOURNAL_DIR:directory,VISEPANDA_HOSTED_WORKER_BUILD:'agent008-fixture',VISEPANDA_HOSTED_WORKER_PROFILE:JSON.stringify(profile),VISEPANDA_QWEN_ENDPOINT:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',VP_TRIP_FIXTURE_IPC:broker};
 async function run(overrides){return new Promise((resolveRun,reject)=>{let stdout='',stderr='';child=spawn(process.execPath,['--import',resolve('tests/integration/service-task-trip/cli-fixture-preload.mjs'),resolve('lib/server/jobs/run-hosted-text-worker.mjs')],{cwd:process.cwd(),env:{...baseEnv,...overrides},stdio:['ignore','pipe','pipe']});const timer=setTimeout(()=>{child.kill('SIGTERM');reject(Error('Owned CLI deadline'));},20000);child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);resolveRun({code,stdout,stderr});});});}
 for(const overrides of [{VISEPANDA_HOSTED_TRIP_SERVICE_TASK_WORKER:'maybe'},{VISEPANDA_HOSTED_SCOPED_EDIT_WORKER:'true'},{VISEPANDA_HOSTED_TRIP_SERVICE_TASK_WORKER:undefined},{VISEPANDA_HOSTED_WORKER_PROFILE:JSON.stringify({...profile,schemaVersion:'vpj10-hosted-scoped-edit/1'})}]){
  const result=await run(overrides);assert.equal(result.code,1);assert.match(result.stderr,/unavailable/);assert.equal(sqlCalls.length,0);assert.equal(providerCalls,0);
 }
 const result=await run({});assert.equal(result.code,0,result.stderr);assert.equal(providerCalls,1);
 const returned=result.stdout.trim().split('\n').map(s=>JSON.parse(s)).find(r=>r.phase==='returned');assert.equal(returned.finished,1);
 assert.ok(sqlCalls.every(([name])=>['trip_service_task_worker_v1','hosted_worker_heartbeat'].includes(name)));
 assert.equal((await db(`select count(*)::int n from public.trip_proposals where owner_id='${a.owner}'`))[0].n,0);
 assert.equal((await db(`select state from turn_private.service_task_capacity where task_id='${task.taskId}'`))[0].state,'reserved');
 const j=(await db(`select binding from scoped_edit_private.work_v1 where task_id='${task.taskId}'`))[0];const p=await f.call(a,'submit_scoped_trip_edit_v1',[a.trip,{action:'select_candidate',operationId:uuid(),basis:ask.basis,askOperationId:ask.operationId,candidateId:j.binding.attemptId}]);
 assert.equal(await f.call(a,'confirm_and_apply_trip_proposal',[p.proposalId,uuid(),p.proposalDigest]),'(applied,1)');
 for(const name of readdirSync(directory)){const log=readFileSync(join(directory,name),'utf8');assert.ok(!log.includes('synthetic-trip-worker-key')&&!log.includes('synthetic-trip-provider-key')&&!log.includes('Move B to d2'));}
});
