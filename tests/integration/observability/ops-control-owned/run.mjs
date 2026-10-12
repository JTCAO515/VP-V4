import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {writeFileSync,readFileSync} from 'node:fs';
import {db,rpc,auth,lit,out,sha,lease,owned} from './fixture.mjs';
import {owner,planning,v2Fixture,v2Prepared,budget} from './v2-seeds.mjs';
import {workerFixture,leaseAsk,saveCandidate,readOp,submit,prepare,basis,snap} from './scoped-seeds.mjs';
import {executeScopedTripEdit} from '../../../../lib/server/turn/scoped-edit/executor.ts';
import {decodeOpsPause,decodeOpsRefusal} from '../../../../lib/server/observability/ops-control/refusal.ts';
const results=[];
async function check(label,fn){if(process.argv[2]&&!label.startsWith('actual '+process.argv[2]+' '))return;try{await fn();results.push({label,result:'PASS'});console.log('PASS '+label);}catch(error){results.push({label,result:'FAIL',error:String(error)});throw error;}finally{writeFileSync(out+'actual-results.json',JSON.stringify({sourceBodySha256:lease.source.fullbodySha256,environment:'Own PG17.6 SQL Auth rows/claims, synthetic policy/observations/usage; no GoTrue/provider',results,providerCalls:0,targetDevice:'UNRUN'},null,2)+'\n');}}
await owned();
assert.equal(sha(readFileSync('/Users/jtsm5p/Documents/Codex/VP-V5-worktrees/vpj37-ops-control-sql-20261011/artifacts/VPJ-37/ops-control-sql-20261011/fullbody.candidate.sql')),lease.source.fullbodySha256);
const ops={owner:uuid(),session:uuid()};
await db(`insert into auth.users(id) values('${ops.owner}');insert into auth.sessions(id,user_id) values('${ops.session}','${ops.owner}');insert into identity_private.mobile_accounts(owner_id) values('${ops.owner}');update knowledge_review_private.settings set enabled=true;insert into knowledge_review_private.members(actor_id,active) values('${ops.owner}',true);`);
const operation=input=>rpc('ops_control_operations_v1',{p_input:input},ops);
const workspace=()=>operation({schemaVersion:'ops-control/1',action:'workspace'});
async function control(kind,key,state){const w=await workspace();return operation({schemaVersion:'ops-control/1',action:'set',operationId:uuid(),expectedRevision:w.revision,scope:{kind,key},state});}
await db(`with manifest as(select jsonb_build_object('schemaVersion','ops-control-restore/1','revision',0,'controls',(select jsonb_agg(jsonb_build_object('scope',jsonb_build_object('kind',kind,'key',key),'stopRevision',0) order by kind,key) from ops_control_private.controls_v1),'budgets','[]'::jsonb,'retiredOperations','[]'::jsonb,'erasedActors','[]'::jsonb) v) select ops_control_private.reconcile_restore_v1(v,encode(sha256(convert_to(v::text,'UTF8')),'hex')) from manifest;`);
assert.equal((await workspace()).recoveryReady,true);
for(const c of (await workspace()).controls)await control(c.scope.kind,c.scope.key,'enabled');
async function scopeFor(a){const scope=uuid();await db(`insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at) values('${scope}','${a.owner}','CNY',1000000,100000,10,10,true,now()+interval '1 day');insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled) values('${scope}','qwen','qwen3.7-plus-2026-05-26','synthetic-v1',1000000,10000,true);`);return scope;}
const reserve=(a,scope,task,attempt)=>rpc('reserve_model_budget',{p_scope_id:scope,p_owner_id:a.owner,p_task_id:task,p_attempt_id:attempt,p_provider:'qwen',p_model:'qwen3.7-plus-2026-05-26',p_price_version:'synthetic-v1',p_reserved_micros:100});
await check('actual text owner/task/provider tuple allows dispatch; foreign-task tuple denied; capability stop refuses fresh claim',async()=>{
 const a=await owner(),turn=uuid(),scope=await scopeFor(a),attempt=uuid();
 const r=await db(auth(a)+`select public.submit_text_turn('${uuid()}','${turn}','${uuid()}','${a.policy}','en','Synthetic scope test');`);assert.ok(r);
 const claim=await rpc('claim_text_work',{p_owner_id:a.owner,p_policy_id:a.policy});const l=claim.lease??claim;assert.equal(l.turnId,turn);
 assert.equal((await reserve(a,scope,turn,attempt)).kind,'reserved');assert.equal((await rpc('dispatch_model_budget',{p_scope_id:scope,p_owner_id:a.owner,p_attempt_id:attempt})).kind,'dispatched');
 const wrong=uuid();assert.equal((await reserve(a,scope,uuid(),wrong)).kind,'reserved');assert.deepEqual(await rpc('dispatch_model_budget',{p_scope_id:scope,p_owner_id:a.owner,p_attempt_id:wrong}),{kind:'disabled',code:'OPS_SCOPE_UNAVAILABLE'});
 await control('capability','text','disabled');assert.equal(decodeOpsRefusal(await rpc('authorize_text_dispatch',{p_turn_id:turn,p_lease_token:l.leaseToken,p_policy_id:a.policy,p_provider:'qwen'})),'OPS_CONTROL_DISABLED');await control('capability','text','enabled');
});
await check('actual V1 dispatch tuple authorizes once; wrong digest denied; provider stop pauses original turn and preserves pending accounting/readback',async()=>{
 const a=await owner(),accepted=await rpc('submit_planning_comparison_v1',planning(a),a);assert.equal(accepted.kind,'accepted');const l=await rpc('claim_planning_comparison_work_v1',{p_owner_id:a.owner,p_planning_policy_id:a.planningPolicy});assert.equal(l.kind,'leased');const input=await rpc('read_planning_comparison_work_v1',{p_turn_id:l.turnId,p_lease_token:l.leaseToken});assert.equal(input.kind,'planning_input');
 const scope=await scopeFor(a),attempt=uuid();assert.equal((await reserve(a,scope,input.taskId,attempt)).kind,'reserved');assert.equal((await rpc('dispatch_model_budget',{p_scope_id:scope,p_owner_id:a.owner,p_attempt_id:attempt})).kind,'dispatched');
 const p={p_turn_id:l.turnId,p_lease_token:l.leaseToken,p_context_digest:input.contextDigest,p_scope_id:scope,p_attempt_id:attempt};assert.equal((await rpc('authorize_planning_dispatch_v1',{...p,p_context_digest:'0'.repeat(64)})).kind,'blocked');assert.equal((await rpc('authorize_planning_dispatch_v1',p)).kind,'authorized');
 await control('provider','qwen','disabled');const stopped=await rpc('pause_planning_comparison_v1',{p_turn_id:l.turnId,p_lease_token:l.leaseToken});assert.deepEqual(decodeOpsPause(stopped),{kind:'ops_paused',code:'OPS_CONTROL_DISABLED',accounting:'pending'});
 assert.equal(await db(`select status from public.model_budget_attempts where scope_id='${scope}' and attempt_id='${attempt}';`),'pending');assert.equal(await db(`select state from turn_private.work where turn_id='${l.turnId}';`),'failed');assert.equal(await db(`select output_kind from turn_private.text_content where turn_id='${l.turnId}' and owner_id='${a.owner}';`),'blocked');assert.equal((await rpc('claim_planning_comparison_work_v1',{p_owner_id:a.owner,p_planning_policy_id:a.planningPolicy})).kind,'empty');await control('provider','qwen','enabled');
});
await check('actual V2 canonical destination/output proves exact tuple; foreign digest refused; city stop pauses original task/turn and retains settled cost',async()=>{
 const f=await v2Prepared();const good=await rpc('read_planning_intake_model_output_v1',{...f.six,p_scope:f.b.scope,p_text_policy:f.b.textPolicy,p_price_version:f.b.priceVersion},null,true);assert.equal(good.kind,'model_state');assert.equal(good.state,'settled');
 const bad=await rpc('read_planning_intake_model_output_v1',{...f.six,p_scope:f.b.scope,p_text_policy:f.b.textPolicy,p_price_version:f.b.priceVersion,p_intake_digest:'0'.repeat(64)},null,true);assert.notEqual(bad.state,'settled');
 await control('city','shanghai','disabled');const stopped=await rpc('pause_planning_intake_work_v1',{...f.six,p_reason:'blocked'},null,true);assert.deepEqual(stopped,{kind:'ops_paused',code:'OPS_CONTROL_DISABLED',accounting:'pending',taskId:f.b.task,turnId:f.b.turn});assert.equal(await db(`select status||':'||actual_micros from public.model_budget_attempts where scope_id='${f.b.scope}' and attempt_id='${f.b.attempt}';`),'settled:15');assert.equal(await db(`select state from turn_private.work where turn_id='${f.b.turn}';`),'failed');assert.notEqual((await rpc('complete_planning_intake_comparison_v1',f.complete,null,true)).kind,'published');await control('city','shanghai','enabled');
});
await check('actual scoped settled output publish stop uses real TS executor and original-operation receipt/readback; foreign binding refused; Trip/no Proposal unchanged',async()=>{
 const a=await workerFixture(),w=await leaseAsk(a);const before=await snap(a);await saveCandidate(a,w,20,false);const wrong=await rpc('authorize_scoped_trip_edit_effect_v1',{p_binding:{...w.b,operationId:uuid()},p_effect:'publish'});assert.notEqual(wrong.kind,'authorized');
 await control('capability','scoped_trip_edit_v1','disabled');let providerCalls=0;
 const ports={now:()=>Date.now(),price:()=>20,recordUsage:async()=>assert.fail('settled output must not settle twice'),transport:async()=>{providerCalls++;assert.fail('no provider replay');},rpc:async(name,p)=>rpc(name,p)};
 assert.equal(await executeScopedTripEdit(w.l,ports,new AbortController().signal),'ops_paused');assert.equal(providerCalls,0);const read=await readOp(a,w.m.operationId);assert.equal(read.receipt.kind,'scoped_edit_pending/1');assert.equal(read.receipt.reason,'ops_control_disabled');assert.equal(read.receipt.operationId,w.m.operationId);assert.deepEqual(await snap(a),before);assert.equal(await db(`select count(*) from public.trip_proposals where trip_id='${a.trip}';`),'0');assert.equal(await db(`select status||':'||actual_micros from public.model_budget_attempts where scope_id='${a.scope}' and attempt_id='${w.b.attemptId}';`),'settled:20');
 await assert.rejects(submit(a,{action:'ask',operationId:uuid(),basis:basis(w.c),text:'New synthetic request'}),/OPS_CONTROL_DISABLED/);await control('capability','scoped_trip_edit_v1','enabled');
});
console.log(JSON.stringify({pass:results.length,fail:0,providerCalls:0,productAppend:false}));
