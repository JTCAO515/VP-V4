import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {db,owned} from './kernel.mjs';
const out=fileURLToPath(new URL('.',import.meta.url));
const lit=v=>v===null?'null':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const results=[];
const actors=Array.from({length:3},()=>({id:uuid(),session:uuid()}));
const [ops,other,customer]=actors;
const auth=a=>`set request.jwt.claim.sub='${a.id}';set request.jwt.claim.role='authenticated';set request.jwt.claims='${JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session})}';set role authenticated;`;
const service="set request.jwt.claim.sub='';set request.jwt.claim.role='service_role';set request.jwt.claims='{\"role\":\"service_role\"}';set role service_role;";
async function op(a,input){return JSON.parse(await db(auth(a)+`select public.ops_control_operations_v1('${JSON.stringify(input)}');`));}
async function rpc(name,values){return JSON.parse(await db(service+`select public.${name}(${Object.entries(values).map(([k,v])=>k+'=>'+lit(v)).join(',')});`));}
async function check(label,fn){try{await fn();results.push({label,result:'PASS'});}catch(error){results.push({label,result:'FAIL',error:String(error)});throw error;}finally{writeFileSync(out+'behavior-results.json',JSON.stringify({environment:'Owned network-none PG17; SQL Auth claims fixture, not GoTrue/provider',results},null,2)+'\n');}}
await owned();
await db(actors.map(a=>`insert into auth.users values('${a.id}');insert into auth.sessions(id,user_id) values('${a.session}','${a.id}');insert into identity_private.mobile_accounts(owner_id) values('${a.id}');`).join('\n')+
 `update knowledge_review_private.settings set enabled=true;insert into knowledge_review_private.members(actor_id,active) values('${ops.id}',true),('${other.id}',true);`);

await check('live Ops identity/current real session; anon/nonmember/private kernel denied',async()=>{
 const w=await op(ops,{schemaVersion:'ops-control/1',action:'workspace'});
 assert.equal(w.sessionId,ops.session);assert.equal(w.sessionEpoch,'0');assert.equal(w.recoveryReady,false);
 await assert.rejects(op(customer,{schemaVersion:'ops-control/1',action:'workspace'}),/OPS_FORBIDDEN/);
 await assert.rejects(db(auth(ops)+"select ops_control_private.operations_v1('{}');"),/permission denied/);
 await assert.rejects(db("set role anon;select public.ops_control_operations_v1('{}');"),/permission denied/);
});
await check('private restore reconciliation keeps controls stopped and advances floors',async()=>{
 await db(`with manifest as(select jsonb_build_object('schemaVersion','ops-control-restore/1','revision',0,
  'controls',(select jsonb_agg(jsonb_build_object('scope',jsonb_build_object('kind',kind,'key',key),'stopRevision',0) order by kind,key) from ops_control_private.controls_v1),
  'budgets','[]'::jsonb,'retiredOperations','[]'::jsonb,'erasedActors','[]'::jsonb) v)
  select ops_control_private.reconcile_restore_v1(v,encode(sha256(convert_to(v::text,'UTF8')),'hex')) from manifest;`);
 const w=await op(ops,{schemaVersion:'ops-control/1',action:'workspace'});assert.equal(w.recoveryReady,true);
 assert.ok(w.controls.every(x=>x.state==='disabled'&&x.stopRevision===w.revision));
});
let revision=(await op(ops,{schemaVersion:'ops-control/1',action:'workspace'})).revision;
for(const c of(await op(ops,{schemaVersion:'ops-control/1',action:'workspace'})).controls){
 const r=await op(ops,{schemaVersion:'ops-control/1',action:'set',operationId:uuid(),expectedRevision:revision,scope:c.scope,state:'enabled'});revision=r.revision;
}
let operation;
await check('global CAS, exact replay, payload/subject collision, receipt uniform unavailability',async()=>{
 operation={schemaVersion:'ops-control/1',action:'set',operationId:uuid(),expectedRevision:revision,scope:{kind:'provider',key:'glm'},state:'disabled'};
 const first=await op(ops,operation);revision=first.revision;
 assert.deepEqual(await op(ops,operation),first);
 await assert.rejects(op(ops,{...operation,state:'enabled'}),/OPS_CONFLICT/);
 await assert.rejects(op(other,operation),/OPS_CONFLICT/);
 await assert.rejects(op(ops,{...operation,operationId:uuid()}),/OPS_CONFLICT/);
 await assert.rejects(op(other,{schemaVersion:'ops-control/1',action:'receipt',operationId:operation.operationId}),/OPS_UNAVAILABLE/);
 await assert.rejects(op(other,{schemaVersion:'ops-control/1',action:'receipt',operationId:uuid()}),/OPS_UNAVAILABLE/);
});
const scope=uuid(),policy=uuid();
await db(`insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at)
 values('${scope}','${customer.id}','CNY',1000000,100000,10,10,true,now()+interval '1 day');
 insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled)
 values('${scope}','qwen','qwen3.7-plus-2026-05-26','synthetic-v1',1000000,10000,true),('${scope}','glm','glm-5.3-flash','synthetic-v1',1000000,10000,true);
 insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at)
 values('${policy}','qwen','Synthetic only','https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions','fixture','fixture','fixture','synthetic-v1','synthetic-v1',repeat('a',64),'合成告知','Synthetic notice','retain_after_hide_v1',now()-interval '1 day',now()+interval '1 day',now()+interval '1 day');`);
const turn=uuid();
await db(auth(customer)+`select public.accept_text_policy('${policy}',repeat('a',64));select public.submit_text_turn('${uuid()}','${turn}','${uuid()}','${policy}','en','Synthetic scope test');`);
const lease=await rpc('claim_text_work',{p_owner_id:customer.id,p_policy_id:policy});
const leaseValue=lease.lease??lease;assert.equal(leaseValue.turnId,turn);
const attempt=uuid();
await check('actual legacy text turn tuple, real reserve/dispatch; differing provider refused',async()=>{
 assert.equal((await rpc('reserve_model_budget',{p_scope_id:scope,p_owner_id:customer.id,p_task_id:turn,p_attempt_id:attempt,p_provider:'qwen',p_model:'qwen3.7-plus-2026-05-26',p_price_version:'synthetic-v1',p_reserved_micros:100})).kind,'reserved');
 assert.equal((await rpc('dispatch_model_budget',{p_scope_id:scope,p_owner_id:customer.id,p_attempt_id:attempt})).kind,'dispatched');
 const mismatch=uuid();
 assert.equal((await rpc('reserve_model_budget',{p_scope_id:scope,p_owner_id:customer.id,p_task_id:turn,p_attempt_id:mismatch,p_provider:'glm',p_model:'glm-5.3-flash',p_price_version:'synthetic-v1',p_reserved_micros:100})).kind,'reserved');
 const denied=await rpc('dispatch_model_budget',{p_scope_id:scope,p_owner_id:customer.id,p_attempt_id:mismatch});
 assert.deepEqual(denied,{kind:'disabled',code:'OPS_SCOPE_UNAVAILABLE'});
 assert.equal(await db(`select status from public.model_budget_attempts where scope_id='${scope}' and attempt_id='${mismatch}';`),'reserved');
});
await check('budget stop keeps in-flight pending; resume refuses then genuinely settled overrun recovers without resets',async()=>{
 const before=await db(`select limit_micros||':'||task_limit_micros||':'||expires_at::text from public.model_budget_scopes where id='${scope}';`);
 assert.equal((await rpc('stop_model_budget',{p_scope_id:scope,p_owner_id:customer.id})).kind,'stopped');
 assert.equal(await db(`select status from public.model_budget_attempts where scope_id='${scope}' and attempt_id='${attempt}';`),'pending');
 let state=await op(ops,{schemaVersion:'ops-control/1',action:'budget_read',scopeId:scope});assert.equal(state.eligibility,'unresolved');
 await assert.rejects(op(ops,{schemaVersion:'ops-control/1',action:'budget_resume',operationId:uuid(),scopeId:scope,expectedRevision:state.revision}),/OPS_UNAVAILABLE/);
 assert.equal((await rpc('finish_model_budget',{p_scope_id:scope,p_owner_id:customer.id,p_attempt_id:attempt,p_action:'settle',p_actual_micros:150})).kind,'settled');
 state=await op(ops,{schemaVersion:'ops-control/1',action:'budget_read',scopeId:scope});assert.equal(state.frozen,true);assert.equal(state.eligibility,'eligible');
 await op(ops,{schemaVersion:'ops-control/1',action:'budget_resume',operationId:uuid(),scopeId:scope,expectedRevision:state.revision});
 assert.equal(await db(`select limit_micros||':'||task_limit_micros||':'||expires_at::text from public.model_budget_scopes where id='${scope}';`),before);
 assert.equal(await db(`select status||':'||actual_micros from public.model_budget_attempts where scope_id='${scope}' and attempt_id='${attempt}';`),'settled:150');
});
await check('actor metadata projection counts actual audits; membership revoke denies replay',async()=>{
 const own=JSON.parse(await db(`select ops_control_private.export_actor_operations_v1('${ops.id}');`));assert.ok(own.length>=14);
 assert.ok(own.every(x=>x.ownerId===ops.id&&x.kind==='ops_control_operation/1'&&!('sessionId'in x)&&!('sessionEpoch'in x)));
 await db(`update knowledge_review_private.members set active=false where actor_id='${ops.id}';`);
 await assert.rejects(op(ops,{schemaVersion:'ops-control/1',action:'receipt',operationId:operation.operationId}),/OPS_FORBIDDEN/);
});
console.log(JSON.stringify({passed:results.filter(x=>x.result==='PASS').length,failed:results.filter(x=>x.result==='FAIL').length,
 providerCalls:0,proof:'Real isolated SQL/RPC/Auth-row claims fixture only; GoTrue/target/provider/device UNRUN'}));
