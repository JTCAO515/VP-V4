import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeTurnExportPage } from '../../../../lib/server/privacy/turn-data/export.ts';
import { snapshot, page, actor, id, now } from '../../../integration/privacy/turn-data/fixtures.mjs';
const decode = value => decodeTurnExportPage(value, 100, actor.ownerId, now + 40000);
test('SQL appended empty direction groups require exact38 shape and cannot be silently omitted', () => {
  const s = snapshot(); assert.equal(s.sources.length, 38); assert.ok(decode(page(s)));
  assert.deepEqual(s.sources.slice(-3).map(g => g.relation), ['turn_private.assistant_directions_intakes_v1', 'turn_private.directions_result_sources_v1', 'turn_private.directions_operations_v1']);
  for (const mutate of [v => v.sources.pop(), v => v.sources.push({relation:'turn_private.unknown',rows:[]}), v => v.sources.slice(-3).reverse().forEach((g,i) => {v.sources[35+i]=g;})]) {
    const v=structuredClone(s);mutate(v);assert.equal(decode(page(v)),null);
  }
});
test('erased permanent direction receipts preserve exact identity but never revive null business parents', () => {
  const s=snapshot(),row={operation_id:id(70),owner_id:actor.ownerId,session_id:actor.sessionId,action:'save',request_bytes_digest:'b'.repeat(64),erased:true,
    artifact_id:null,source_message_id:null,task_turn_id:null,expected_revision:null,result_revision:null,source_digest:null,output_content_digest:null,trip_id:null,proposal_id:null,proposal_artifact_id:null,receipt:null,created_at:new Date(now-100).toISOString()};
  s.sources.find(g=>g.relation==='turn_private.directions_operations_v1').rows.push(row);s.sourceRows.data++;assert.ok(decode(page(s)));
  for (const mutate of [r=>r.owner_id=id(99),r=>r.receipt={},r=>r.task_turn_id=id(4),r=>r.erased=false,r=>r.request_bytes_digest='invalid',r=>r.unreviewed='body']) {
    const v=structuredClone(s);mutate(v.sources.at(-1).rows[0]);assert.equal(decode(page(v)),null);
  }
});

const rows=(s,relation)=>s.sources.find(g=>g.relation===relation).rows;
function activeSnapshot(){
  const s=snapshot(),stamp=new Date(now-100).toISOString();
  rows(s,'turn_private.service_tasks').push({id:id(22),owner_id:actor.ownerId,thread_id:id(7),goal_turn_id:id(4),last_turn_id:id(4),policy_id:id(20),consent_id:id(21),scope_version:1,expected_result:'travel-directions/1',goal_digest:'a'.repeat(64),budget_scope_id:null,created_at:stamp,capacity_enforced:true});
  rows(s,'turn_private.assistant_messages').push({id:id(5),owner_id:actor.ownerId,conversation_id:id(8),sequence:'2',idempotency_key:id(60),request_digest:'a'.repeat(64),policy_id:id(20),consent_id:id(21),locale:'en',input_text:'Original direction follow-up',relationship:'follow_up',goal_id:id(23),scope_version:1,task_id:id(22),parent_message_id:null,turn_id:null,created_at:stamp});
  for(const artifact of [id(70),id(71)])rows(s,'turn_private.result_artifacts').push({id:artifact,owner_id:actor.ownerId,task_id:id(22),goal_id:id(23),input_message_id:id(5),trip_id:null,current_revision:1,lifecycle:'active',created_at:stamp,proposal_id:null,source_result_id:null,source_turn_id:id(4)});
  rows(s,'turn_private.assistant_directions_intakes_v1').push({message_id:id(5),owner_id:actor.ownerId,conversation_id:id(8),goal_id:id(23),task_id:id(22),task_turn_id:id(4),policy_id:id(20),consent_id:id(21),planning_policy_id:id(20),planning_consent_id:id(21),message_sequence:'2',goal_version:1,intake_revision:1,idempotency_key:id(60),request_bytes_digest:'a'.repeat(64),intake:{schemaVersion:'travel-directions-intake/1',destinations:['Shanghai'],durationDays:10,interests:['food'],currentPace:null,budget:null,dates:null,intent:'explore'},memory_basis:[],created_at:stamp});
  rows(s,'turn_private.directions_result_sources_v1').push({artifact_id:id(70),owner_id:actor.ownerId,message_id:id(5),task_turn_id:id(4),source_digest:'a'.repeat(64),initial_content_digest:'b'.repeat(64),initial_output_digest:'c'.repeat(64),previous_artifact_id:id(71),previous_revision:1,publication_key:id(72),created_at:stamp});
  rows(s,'turn_private.directions_operations_v1').push({operation_id:id(90),owner_id:actor.ownerId,session_id:actor.sessionId,action:'save',request_bytes_digest:'b'.repeat(64),erased:false,artifact_id:id(70),source_message_id:id(5),task_turn_id:id(4),expected_revision:1,result_revision:2,source_digest:'a'.repeat(64),output_content_digest:'c'.repeat(64),trip_id:null,proposal_id:null,proposal_artifact_id:null,receipt:{kind:'saved',artifactId:id(70),revision:2,reused:false},created_at:stamp});
  s.sourceRows.data=s.sources.reduce((n,g)=>n+g.rows.length,0);return s;
}
test('active direction intake/source/operation rows retain typed original parents and reject orphan or forged rows',()=>{
  const s=activeSnapshot();assert.ok(decode(page(s)));
  const intake='turn_private.assistant_directions_intakes_v1',source='turn_private.directions_result_sources_v1',ops='turn_private.directions_operations_v1';
  for(const [relation,key,value] of [[intake,'task_id',id(99)],[intake,'task_turn_id',id(99)],[intake,'message_id',id(99)],[intake,'message_sequence',9007199254740992],[intake,'message_sequence','1000001'],[intake,'owner_id',id(99)],[source,'message_id',id(99)],[source,'task_turn_id',id(99)],[source,'previous_artifact_id',id(99)],[source,'source_digest','invalid'],[ops,'source_message_id',id(99)],[ops,'task_turn_id',id(99)],[ops,'artifact_id',id(99)],[ops,'owner_id',id(99)],[ops,'receipt',{}]]){
    const v=structuredClone(s);rows(v,relation)[0][key]=value;assert.equal(decode(page(v)),null,relation+'.'+key);
  }
  const missing=structuredClone(s);rows(missing,intake).length=0;missing.sourceRows.data--;assert.equal(decode(page(missing)),null,'source needs matching typed intake, not merely a retained message');
});
test('Result-only erasure keeps the qualified direction intake and original NULL-turn follow-up input',()=>{
  const s=activeSnapshot();rows(s,'turn_private.result_artifacts').length=0;rows(s,'turn_private.directions_result_sources_v1').length=0;rows(s,'turn_private.directions_operations_v1').length=0;s.sourceRows.data=s.sources.reduce((n,g)=>n+g.rows.length,0);assert.ok(decode(page(s)));
  for(const relation of ['turn_private.assistant_messages','turn_private.service_tasks']){
    const v=structuredClone(s);rows(v,relation).length=0;v.sourceRows.data--;assert.equal(decode(page(v)),null,'retained intake must not waive '+relation+' closure');
  }
});
