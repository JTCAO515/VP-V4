import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {resource} from './db.mjs';
import {fixture,actorRpc,scalar,close} from './fixtures.mjs';
const state=join(resource.nonce,'legacy.json');
async function snapshot(f){return {turn:await scalar('select turn_data_private.source_v1($1,$2) value',[f.owner.id,f.submission.turnId]),conversation:await scalar("select conversation_data_private.source_v1($1,'thread',$2) value",[f.owner.id,f.submission.threadId]),export:await scalar('select turn_data_private.export_source_v1($1) value',[f.owner.id])};}
try{
 if(process.argv[2]==='before'){
  const f=await fixture('knowledge_intent_v1'),s=f.submission;
  assert.equal((await actorRpc(f.owner,'submit_grounded_turn',{p_thread_id:s.threadId,p_turn_id:s.turnId,p_idempotency_key:s.idempotencyKey,p_policy_id:f.policy,p_locale:s.locale,p_text:s.text,p_task_id:s.serviceTask.id,p_scope_version:1,p_relationship:'new_goal',p_parent_turn_id:null,p_city:'shanghai'})).kind,'accepted');
  const l=await actorRpc(null,'claim_grounded_work',{p_owner_id:f.owner.id,p_policy_id:f.policy},'service_role');const keys={p_turn_id:l.turnId,p_lease_token:l.leaseToken};
  const input=await actorRpc(null,'read_grounded_work',keys,'service_role');assert.equal(input.kind,'intent_input');
  assert.equal((await actorRpc(null,'authorize_grounded_dispatch',{...keys,p_policy_id:f.policy,p_provider:'qwen',p_context_digest:input.contextDigest},'service_role')).kind,'authorized');
  assert.equal((await actorRpc(null,'complete_grounded_work',{...keys,p_intent:'rail_boarding_documents',p_request_scope:'single'},'service_role')).kind,'finished');
  const original=await snapshot(f);writeFileSync(state,JSON.stringify({f,original}),{mode:0o600});console.log('LEGACY_REAL_PRODUCER_BASELINE_CAPTURED');
 }else{
  const {f,original}=JSON.parse(readFileSync(state,'utf8'));assert.deepEqual(await snapshot(f),original);console.log('LEGACY_NULL_GROUNDED_TURN_CONVERSATION_EXPORT_EXACT_JSON_BYTES_PASS');
 }
}finally{await close();}
