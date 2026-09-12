import fs from 'node:fs';import assert from 'node:assert/strict';import {spawn,execFileSync} from 'node:child_process';import {query,env,dockerArgs,image} from './transport.mjs';
const root='/Users/jtcao/Library/Caches/visepanda/grounded-crash-20260913',locale=process.argv[2];assert.ok(['en','zh'].includes(locale));const c=JSON.parse(fs.readFileSync('worker-'+locale+'.json')),intent=JSON.parse(fs.readFileSync('native-'+locale+'-root-intent.json'));
const save=(name,value)=>fs.writeFileSync(locale+'-'+name+'.json',JSON.stringify({at:new Date().toISOString(),...value},null,2)+'\n',{mode:0o600,flag:'wx'});const lit=x=>"'"+x.replaceAll("'","''")+"'";
const admission=JSON.parse(query(`begin read only;set local role postgres;select coalesce(json_agg(to_jsonb(x)),'[]')from(select c.turn_id,l.task_id,w.state,w.attempt,w.lease_ms from turn_private.text_content c join turn_private.service_task_turns l on l.turn_id=c.turn_id join turn_private.work w on w.turn_id=c.turn_id where c.owner_id='${c.ownerId}'and c.policy_id='${c.policyId}'and c.input_text=${lit(intent.text)}and c.created_at>=to_timestamp(${intent.at-1}))x;rollback;`));assert.equal(admission.length,1);const t=admission[0];assert.equal(t.state,'queued');assert.equal(t.attempt,0);assert.equal(t.lease_ms,120000);save('admitted',t);
let holder,service,holderPid,killed=false,holderOutput='',childPid;const label='vpj07-crash-'+locale+'-'+Date.now();
const args=dockerArgs('psql',['-X','-q','-At','-v','ON_ERROR_STOP=1']);args.splice(args.indexOf(image),0,'-e','PGAPPNAME');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const state=()=>JSON.parse(query(`begin read only;set local role postgres;select json_build_object('work',(select json_build_object('turnId',turn_id,'state',state,'attempt',attempt,'expiresAt',expires_at,'expired',expires_at<=clock_timestamp())from turn_private.work where turn_id='${t.turn_id}'),'blockers',(select coalesce(json_agg(json_build_object('pid',pid,'budgetRpc',position('reserve_model_budget' in query)>0,'waitEvent',wait_event)),'[]')from pg_stat_activity where ${holderPid}=any(pg_blocking_pids(pid))),'attempts',(select count(*)from public.model_budget_attempts where task_id='${t.task_id}'));rollback;`));
try{
 holder=spawn('docker',args,{env:{...env,PGAPPNAME:label},stdio:['pipe','pipe','pipe']});holder.stdout.on('data',x=>holderOutput+=x);holder.stderr.resume();
 holder.stdin.write(`begin;set local role postgres;set local statement_timeout='40s';set local idle_in_transaction_session_timeout='40s';select id from public.model_budget_scopes where id='${c.budget.scopeId}'and owner_id='${c.ownerId}'for update;select 'BARRIER_READY:'||pg_backend_pid();\n`);
 const readyDeadline=Date.now()+12000;while(!holderOutput.includes('BARRIER_READY:')&&Date.now()<readyDeadline){assert.equal(holder.exitCode,null);await wait(50);}holderPid=Number(holderOutput.match(/BARRIER_READY:(\d+)/)?.[1]);assert.ok(Number.isInteger(holderPid)&&holderPid>0);assert.ok(holderOutput.split('\n').includes(c.budget.scopeId));save('barrier',{holderPid,scopeId:c.budget.scopeId,statementTimeoutMs:40000});
 service=spawn(process.execPath,['service.mjs',locale,'crash'],{cwd:root,env:process.env,stdio:['ignore',fs.openSync('service-'+locale+'-crash.log','wx'),fs.openSync('service-'+locale+'-crash.stderr.log','wx')]});
 const deadline=Date.now()+17000;let observed;
 while(Date.now()<deadline){
  observed=state();if(observed.work?.state==='leased'&&observed.blockers.length===1&&observed.blockers[0].budgetRpc)break;
  assert.equal(service.exitCode,null);await wait(100);
 }
 assert.equal(observed?.work?.state,'leased');assert.equal(observed.work.attempt,1);assert.equal(observed.work.expired,false);assert.equal(observed.attempts,0);assert.equal(observed.blockers.length,1);assert.equal(observed.blockers[0].budgetRpc,true);
 const processRecord=JSON.parse(fs.readFileSync('service-'+locale+'-crash-process.json'));assert.equal(processRecord.parentPid,service.pid);childPid=processRecord.pid;
 const cmd=execFileSync('ps',['-p',String(childPid),'-o','command='],{encoding:'utf8'});assert.ok(cmd.includes(root+'/frozen/lib/server/jobs/run-staging-text-service.mjs')&&cmd.includes(root+'/service-'+locale+'.json'));
 const journal=fs.readFileSync('service-'+locale+'-crash.jsonl','utf8').trim().split('\n').map(JSON.parse);assert.equal(journal.filter(x=>x.schemaVersion==='provider-destination/1'&&x.phase==='attempted').length,0);
 save('before-kill',{...observed,childPid,parentPid:service.pid,providerInvocations:0});process.kill(childPid,'SIGKILL');killed=true;save('kill',{childPid,signal:'SIGKILL'});
 const drainDeadline=Date.now()+16000;let after;
 do{after=state();if(after.blockers.length===0)break;await wait(150);}while(Date.now()<drainDeadline);
 assert.equal(after.blockers.length,0,'Orphaned budget RPC did not drain');assert.equal(after.attempts,0,'Reservation unexpectedly persisted');save('after-kill-before-unlock',after);
 holder.stdin.end('rollback;\n\\q\n');await new Promise(resolve=>holder.once('close',resolve));holder=null;
 const resultDeadline=Date.now()+5000;while(!fs.existsSync('service-'+locale+'-crash-result.json')&&Date.now()<resultDeadline)await wait(100);const result=JSON.parse(fs.readFileSync('service-'+locale+'-crash-result.json'));assert.equal(result.signal,'SIGKILL');assert.equal(result.result,null);
 save('crash-checkpoint',{status:'PASS',taskId:t.task_id,turnId:t.turn_id,realProcessKilled:true,providerInvocations:0,modelBudgetAttempts:0,leaseNotModified:true});console.log({status:'PASS',locale,turnId:t.turn_id,taskId:t.task_id,leaseExpiresAt:after.work.expiresAt});
}finally{
 if(service&&!killed){try{const r=JSON.parse(fs.readFileSync('service-'+locale+'-crash-process.json'));if(r.parentPid===service.pid)process.kill(r.pid,'SIGKILL');}catch{} }
 if(holder){try{holder.stdin.end('rollback;\n\\q\n');}catch{} }
}
