import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {command,sql} from '../../../tests/integration/cost/fixtures/postgres-rpc.mjs';
import {executeQaWork} from '../../../lib/server/qa-agent/executor.ts';
import {PROTOCOL_MODELS} from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';
const dir='artifacts/qa-agent-service/budget-denial-proof',nonce=randomUUID().slice(0,12),container='qa-agent-denial-'+nonce;
const ownerLabel='01a13385-177b-7351-b540-2530568af80d',image='public.ecr.aws/supabase/postgres:17.6.1.159';
const migration='supabase/migrations/20261013050429_qa_agent_web.sql',revision='16018dd2',expected='df5565ae49363dc83d4e0db9686653d43dc79cb2b011e4d56e343f45d654afa9';
let created=false;const evidence={container,nonce,owner:ownerLabel,reviewedRevision:revision,migration,expectedMigrationSha:expected,executorSha256:createHash('sha256').update(readFileSync('lib/server/qa-agent/executor.ts')).digest('hex'),cases:[],cleanup:false};
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const literal=v=>v===null?'null':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const call=async(name,params,actor)=>JSON.parse(await db((actor?`set request.jwt.claim.sub='${actor.owner}';set request.jwt.claims='${JSON.stringify({session_id:actor.session})}';set request.headers='{"origin":"https://synthetic.invalid","cookie":"fixture"}';`:"")+`set role ${actor?'authenticated':'service_role'};select public.${name}(${Object.entries(params).map(([k,v])=>k+'=>'+literal(v)).join(',')});`));
const note=(label,data={})=>{evidence.cases.push({label,result:'PASS',...data});console.log('PASS '+label);};
async function fixture(){
 const a={owner:randomUUID(),session:randomUUID(),thread:randomUUID(),task:randomUUID(),turn:randomUUID(),policy:randomUUID(),scope:randomUUID()};
 await db(`insert into auth.users values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');
 insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at,context_mode) values('${a.policy}','qwen','synthetic-only','https://synthetic.invalid/inference','fixture','fixture','fixture','fixture-v1','qa-fixture-v1','${'a'.repeat(64)}','仅合成历史','Synthetic bounded history','retain_after_hide_v1',now()-interval '1 day',now()+interval '1 day',now()+interval '1 day','qa_session_history_v1');
 insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at) values('${a.scope}','${a.owner}','CNY',10000,10000,20,1,true,now()+interval '1 day');
 insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled) values('${a.scope}','qwen','${PROTOCOL_MODELS.qwen}','fixture-v1',10000,1000,true);`);
 assert.equal((await call('qa_accept_policy_v1',{p_policy_id:a.policy,p_notice_hash:'a'.repeat(64)},a)).kind,'accepted');
 assert.equal((await call('qa_submit_message_v1',{p_thread_id:a.thread,p_turn_id:a.turn,p_idempotency_key:a.turn,p_policy_id:a.policy,p_locale:'en',p_text:'Synthetic budget test',p_task_id:a.task,p_relationship:'qa_followup'},a)).kind,'accepted');return a;
}
async function scenario(mode){
 const a=await fixture(),calls=[];let sends=0,leaseToken,authorization;
 const config={scopeId:a.scope,priceVersion:'fixture-v1',reservedMicros:100,maxOutputTokens:128,timeoutMs:10000};
 const deps={rpc:async(name,params)=>{
  calls.push({name,params});
  if(name==='qa_authorize_dispatch_v1'&&mode==='unknown-before')throw Error('Synthetic lost ACK before SQL invocation');
  const result=await call(name,params);
  if(name==='qa_claim_work_v1')leaseToken=result.leaseToken;
  if(name==='reserve_model_budget'&&result.kind==='reserved'&&mode==='blocked')await db(`update public.model_budget_scopes set enabled=false where id='${a.scope}';`);
  if(name==='qa_authorize_dispatch_v1'){
   authorization=result;assert.equal(result.kind,mode==='blocked'?'blocked':'authorized');
   if(mode==='unknown-after')throw Error('Synthetic lost ACK after real SQL dispatch');
  }
  return result;
 },provider:{provider:'qwen',endpoint:'https://synthetic.invalid/inference',price:()=>20,transport:async()=>{sends++;if(mode==='transport-failure')throw Error('Synthetic transport failure');return Response.json({synthetic:true});}},recordUsage:async()=>{},
 invokeContext:async args=>{
  const r=await args.rpc('qa_authorize_dispatch_v1',{p_turn_id:args.lease.turnId,p_lease_token:args.lease.leaseToken,p_scope_id:a.scope,p_policy_id:a.policy,p_provider:'qwen',p_context_digest:args.input.contextDigest},args.signal);
  if(r.kind!=='authorized')return {kind:'unavailable',code:'DATA_POLICY_BLOCKED',usage:null,cost:'unknown'};
  await args.transport({provider:'qwen',endpoint:'https://synthetic.invalid/inference',method:'POST',body:'{}',signal:args.signal});
  return {kind:'protocol_validated',provider:'qwen',model:PROTOCOL_MODELS.qwen,output:JSON.stringify({outcome:'answered',text:'Synthetic saved answer'}),usage:{inputTokens:10,outputTokens:10,totalTokens:20,cachedInputTokens:null,uncachedInputTokens:null,reasoningTokens:null,cost:'unknown'}};
 }};
 const outcome=await executeQaWork(a.owner,a.policy,config,deps,new AbortController().signal);
 assert.equal(outcome,mode==='normal'?'finished':'unavailable');
 const state=JSON.parse(await db(`select jsonb_build_object('status',status,'actualMicros',actual_micros) from public.model_budget_attempts where attempt_id='${leaseToken}';`));
 const expectedStatus={blocked:'released','unknown-before':'reserved','unknown-after':'pending','transport-failure':'pending',normal:'settled'}[mode];
 assert.equal(state.status,expectedStatus);assert.equal(state.actualMicros,mode==='normal'?20:null);
 assert.equal(sends,mode==='normal'||mode==='transport-failure'?1:0);assert.equal(calls.filter(c=>c.name==='qa_authorize_dispatch_v1').length,1);
 assert.equal(calls.filter(c=>c.name==='reserve_model_budget').length,1);
 const finalAction=calls.filter(c=>c.name==='finish_model_budget').at(-1)?.params.p_action;
 assert.equal(finalAction,mode==='blocked'?'release':mode==='normal'?'settle':'pending');
 if(mode==='blocked')await db(`update public.model_budget_scopes set enabled=true where id='${a.scope}';`);
 const nextId=randomUUID(),next=await call('reserve_model_budget',{p_scope_id:a.scope,p_owner_id:a.owner,p_task_id:a.turn,p_attempt_id:nextId,p_provider:'qwen',p_model:PROTOCOL_MODELS.qwen,p_price_version:'fixture-v1',p_reserved_micros:100});
 assert.equal(next.kind,mode==='blocked'||mode==='normal'?'reserved':'exhausted');
 if(next.kind==='reserved')assert.equal((await call('finish_model_budget',{p_scope_id:a.scope,p_owner_id:a.owner,p_attempt_id:nextId,p_action:'release',p_actual_micros:null})).kind,'released');
 const dispatches=Number(await db(`select count(*) from turn_private.text_dispatches where turn_id='${a.turn}';`));
 assert.equal(dispatches,mode==='blocked'||mode==='unknown-before'?0:1);
 note(mode,{state,sends,dispatches,nextReservation:next.kind,finalAction,authorization:authorization?.kind??'unknown'});
}
try{
 const source=await command('git',['show',revision+':'+migration]);assert.equal(source.code,0,source.stderr);assert.equal(createHash('sha256').update(source.stdout).digest('hex'),expected);
 const inspected=await command('docker',['image','inspect',image,'--format','{{.Id}}']);assert.equal(inspected.code,0,inspected.stderr);evidence.imageId=inspected.stdout.trim();
 const start=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--label','qa-agent-proof-owner='+ownerLabel,'--label','qa-agent-proof-nonce='+nonce,'--user','postgres','--entrypoint','/bin/sh',image,'-c','umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(start.code,0,start.stderr);created=true;
 const info=JSON.parse((await command('docker',['inspect',container])).stdout)[0];assert.equal(info.HostConfig.NetworkMode,'none');assert.deepEqual(info.HostConfig.PortBindings??{},{});assert.deepEqual(info.Mounts,[]);
 let ready=false;for(let i=0;i<80;i++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0){ready=true;break;}await new Promise(r=>setTimeout(r,250));}assert.ok(ready);
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;");
 for(const name of readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort())await db('begin;'+readFileSync('supabase/migrations/'+name,'utf8')+'commit;');
 await db('begin;'+source.stdout+'commit;');note('original migrations and exact reviewed QA SQL installed only in owned fixture');
 for(const mode of ['blocked','unknown-before','unknown-after','transport-failure','normal'])await scenario(mode);
 evidence.result='PASS';
}catch(error){evidence.result='FAIL';evidence.error=String(error.stack);console.error(error);process.exitCode=1;}
finally{
 if(created){const current=JSON.parse((await command('docker',['inspect',container])).stdout)[0];assert.equal(current.Config.Labels['qa-agent-proof-owner'],ownerLabel);assert.equal(current.Config.Labels['qa-agent-proof-nonce'],nonce);assert.equal((await command('docker',['rm','-f',container])).code,0);assert.notEqual((await command('docker',['inspect',container])).code,0);evidence.cleanup=true;}
 writeFileSync(dir+'/result-'+nonce+'.json',JSON.stringify(evidence,null,2)+'\n');console.log('OWN CLEANUP '+evidence.cleanup);
}
