import assert from 'node:assert/strict';
import test from 'node:test';
import {TURN_SOURCE_SCHEMA,TRIP_TURN_SOURCE_SCHEMA,decodeTurnExportPage} from '../../../lib/server/privacy/turn-data/export.ts';
import {validPlaceRequestProof,validPlaceAnswerBasis} from '../../../lib/server/privacy/turn-data/contract.ts';
import wire from './sql-wire-positive.json' with {type:'json'};
test('Place export3 retains full ordinary/Trip graphs and rejects unsupported proof or incomplete inventory',()=>{
const id='11111111-1111-4111-8111-111111111111',s=wire.request.submission,now=Date.now(),r=wire.accepted.originalReceipt;
const proof={schemaVersion:'canonical-place-proof/1',operationId:s.idempotencyKey,scopeKind:'thread',scopeId:s.threadId,operation:wire.accepted.operation,requestDigest:wire.accepted.binding.requestDigest,expectation:wire.request.expectation,basis:{subjectId:'reviewed-subject',city:'shanghai',scene:'travel',sourceDigest:'a'.repeat(64)},originalReceipt:r};
function page(trip=false,place=true){
 const specs=trip?TRIP_TURN_SOURCE_SCHEMA:TURN_SOURCE_SCHEMA;
 const sources=specs.map(spec=>({relation:spec.relation,rows:[]}));const rows=n=>sources.find(g=>g.relation===n).rows;
 function add(n,values){const spec=specs.find(g=>g.relation===n);const row=Object.fromEntries(spec.columns.map(c=>[c.name,!c.notNull?null:c.type==='uuid'?id:c.type==='integer'?1:c.type==='bigint'?'1':c.type==='boolean'?false:c.type==='timestamp with time zone'?'2026-10-15T00:00:00Z':c.type==='jsonb'?{}:'value']));Object.assign(row,values);rows(n).push(row);return row;}
 add('public.turns',{id:s.turnId,owner_id:id,thread_id:s.threadId});
 add('turn_private.service_tasks',{id:s.serviceTask.id,owner_id:id,thread_id:s.threadId,goal_turn_id:s.turnId,last_turn_id:s.turnId,policy_id:s.policyId,consent_id:id,expected_result:'text_answer',...(trip?{trip_objective:null}:{})});
 add('turn_private.text_content',{turn_id:s.turnId,owner_id:id,thread_id:s.threadId,policy_id:s.policyId,consent_id:id,locale:'en'});
 add('turn_private.service_task_turns',{turn_id:s.turnId,task_id:s.serviceTask.id,owner_id:id,parent_turn_id:null,relationship:'new_goal',idempotency_key:s.idempotencyKey});
 add('turn_private.grounded_turns',{turn_id:s.turnId,task_id:s.serviceTask.id,owner_id:id,city:'shanghai',locale:'en',basis:null,...(place?{selected_place_request:structuredClone(proof)}:{})});
 if(trip)add('turn_private.service_tasks',{id:'ffffffff-ffff-4fff-8fff-ffffffffffff',owner_id:id,thread_id:s.threadId,goal_turn_id:s.turnId,last_turn_id:s.turnId,policy_id:s.policyId,consent_id:id,expected_result:'trip_modification',trip_objective:{schemaVersion:'trip-service-task-erased/1',outcome:'erased',goalId:id}});
 const data=sources.reduce((n,g)=>n+g.rows.length,0);
 return {schemaVersion:place?'turn-core-export/3':trip?'turn-trip-core-export/1':'turn-core-export/1',section:'snapshot',sourceDigest:'a'.repeat(64),items:[{ownerId:id,sources,operations:[],fences:[],sourceIdentityKeys:[],sourceRows:{data,operations:0,fences:0,sourceIdentityKeys:0},sourceAuthorities:[{policyId:s.policyId,consentId:id}]}],hasMore:false,nextCursor:null,sectionComplete:true};
}
const decode=v=>decodeTurnExportPage(v,1,id,now,v.schemaVersion==='turn-trip-core-export/1');
let checks=0;const ok=v=>{assert.ok(decode(v));checks++;},bad=v=>{assert.equal(decode(v),null);checks++;};
for(const trip of [false,true]){
 const p=page(trip,true);ok(p);const g=p.items[0].sources.find(g=>g.relation==='turn_private.grounded_turns').rows[0];
 for(const mutate of [x=>x.selected_place_request=null,x=>x.selected_place_request.requestDigest='forged',x=>x.selected_place_request.originalReceipt.serviceTaskId=id,x=>x.selected_place_request.expectation.locale='zh',x=>x.selected_place_request.operation.messageId=id,x=>x.selected_place_request.originalReceipt.version=3,x=>x.basis={publications:[],claims:[{id:'opening_hours',status:'covered',reasons:[],factIds:[id]}]}]){const q=structuredClone(p);mutate(q.items[0].sources.find(g=>g.relation==='turn_private.grounded_turns').rows[0]);bad(q);}
 const legacy=page(trip,false);const bytes=JSON.stringify(legacy.items);assert.equal(JSON.stringify(decode(legacy).items),bytes);checks++;
 const falsely3=structuredClone(legacy);falsely3.schemaVersion='turn-core-export/3';bad(falsely3);
 const wrongVersion=structuredClone(p);wrongVersion.schemaVersion=trip?'turn-trip-core-export/1':'turn-core-export/1';bad(wrongVersion);
 const wrongGraph=structuredClone(p);wrongGraph.items[0].sources.find(g=>g.relation==='turn_private.text_content').rows[0].thread_id=id;bad(wrongGraph);
 const extra=structuredClone(p);extra.items[0].extra='unexpected';bad(extra);
}
// A legacy NULL-slot row keeps its old exact columns beside a new Place row.
const coexist=page();const src=coexist.items[0].sources;
for(const [table,key] of [['public.turns','id'],['turn_private.text_content','turn_id'],['turn_private.service_task_turns','turn_id'],['turn_private.grounded_turns','turn_id']]){
 const rows=src.find(g=>g.relation===table).rows;const row=structuredClone(rows[0]);row[key]='ffffffff-ffff-4fff-8fff-ffffffffffff';delete row.selected_place_request;rows.push(row);coexist.items[0].sourceRows.data++;
}ok(coexist);
// Mixed inventory is indivisible: omitted Trip groups/counters/parents are rejected.
const mixed=page(true);mixed.items[0].sources.pop();bad(mixed);
const incomplete=page(true);incomplete.items[0].sources.find(g=>g.relation==='turn_private.service_tasks').rows[1].trip_objective={schemaVersion:'trip-service-task-erased/1'};bad(incomplete);
assert.equal(validPlaceRequestProof({...proof,question:'not exported'},{}),false);assert.equal(validPlaceAnswerBasis({publications:[],claims:[{id:'opening_hours',status:'covered',reasons:['invented'],factIds:[]}]}),false);checks+=2;
assert.equal(checks,31);
});

import page from '../../../artifacts/AGENT-005/canonical-place-ask-20261015/export3-candidate/sql-export3-page.json' with {type:'json'};
import context from '../../../artifacts/AGENT-005/canonical-place-ask-20261015/export3-candidate/sql-export3-context.json' with {type:'json'};
import {createHash} from 'node:crypto';
import {exportCanonical} from '../../../lib/server/privacy/export-dispatcher.ts';
test('actual SQL export3 page crosses the applied consumer without changing snapshot or canonical source digest',()=>{
 const decoded=decodeTurnExportPage(page,context.limit,context.owner,context.now);
 assert.ok(decoded);assert.deepEqual(decoded.items,page.items);
 assert.equal(createHash('sha256').update(exportCanonical({snapshot:decoded.items}),'utf8').digest('hex'),decoded.sourceDigest);
});

function lineageFixture(relationship='clarification') {
 const p=structuredClone(page),groups=p.items[0].sources;
 const rows=n=>groups.find(g=>g.relation===n).rows;
 const selected=rows('turn_private.grounded_turns').find(r=>r.selected_place_request);
 const current=selected.turn_id,parent='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
 const task=rows('turn_private.service_tasks').find(r=>r.id===selected.task_id);
 for(const [table,key] of [['public.turns','id'],['turn_private.text_content','turn_id'],['turn_private.service_task_turns','turn_id']]) {
  const original=rows(table).find(r=>r[key]===current),copy=structuredClone(original);copy[key]=parent;
  if(table==='turn_private.text_content') {copy.output_kind=relationship==='repair'?'technical_failure':'clarification';copy.output_text='Original parent outcome';}
  if(table==='turn_private.service_task_turns') {copy.relationship='new_goal';copy.parent_turn_id=null;}
  rows(table).push(copy);rows(table).sort((a,b)=>String(a[key]).localeCompare(String(b[key])));p.items[0].sourceRows.data++;
 }
 task.goal_turn_id=parent;
 const link=rows('turn_private.service_task_turns').find(r=>r.turn_id===current);
 link.relationship=relationship;link.parent_turn_id=parent;
 selected.selected_place_request.originalReceipt.relationship=relationship;
 selected.selected_place_request.originalReceipt.parentTurnId=parent;
 return {p,rows,selected,task,link,current,parent};
}
for(const relationship of ['clarification','repair'])test(`Place v3 accepts an actual same-Task ${relationship} parent`,()=>{
 const {p}=lineageFixture(relationship);assert.ok(decodeTurnExportPage(p,context.limit,context.owner,context.now));
});
for(const mode of ['self','other-task','other-thread','other-text-thread','other-owner','missing-text','cycle','wrong-root'])test(`Place v3 rejects ${mode} parent lineage`,()=>{
 const {p,rows,selected,task,link,current,parent}=lineageFixture();
 const parentLink=rows('turn_private.service_task_turns').find(r=>r.turn_id===parent);
 if(mode==='self') {link.parent_turn_id=current;selected.selected_place_request.originalReceipt.parentTurnId=current;}
 if(mode==='other-task') {
  const other=structuredClone(task);other.id='ffffffff-ffff-4fff-8fff-ffffffffffff';rows('turn_private.service_tasks').push(other);rows('turn_private.service_tasks').sort((a,b)=>a.id.localeCompare(b.id));p.items[0].sourceRows.data++;parentLink.task_id=other.id;
 }
 if(mode==='other-thread')rows('public.turns').find(r=>r.id===parent).thread_id='ffffffff-ffff-4fff-8fff-ffffffffffff';
 if(mode==='other-text-thread')rows('turn_private.text_content').find(r=>r.turn_id===parent).thread_id='ffffffff-ffff-4fff-8fff-ffffffffffff';
 if(mode==='other-owner')rows('public.turns').find(r=>r.id===parent).owner_id='ffffffff-ffff-4fff-8fff-ffffffffffff';
 if(mode==='missing-text'){const group=p.items[0].sources.find(g=>g.relation==='turn_private.text_content');group.rows=group.rows.filter(r=>r.turn_id!==parent);p.items[0].sourceRows.data--;}
 if(mode==='cycle'){parentLink.relationship='repair';parentLink.parent_turn_id=current;}
 if(mode==='wrong-root')task.goal_turn_id=current;
 assert.equal(decodeTurnExportPage(p,context.limit,context.owner,context.now),null);
});

import mixedSQL from './mixed-export3-page.json' with {type:'json'};
import tripSQL from './trip-export-page.json' with {type:'json'};
import sourceSchema from '../../../lib/server/privacy/turn-data/source-schema.json' with {type:'json'};
for(const [name,fixture] of [['mixed Place/Trip',mixedSQL],['pure Trip',tripSQL]])test(`actual accepted707 ${name} SQL page retains all 43 sources and original digest`,()=>{
 const p=fixture.page,tripOnly=p.schemaVersion==='turn-trip-core-export/1';
 assert.equal(p.schemaVersion,name==='pure Trip'?'turn-trip-core-export/1':'turn-core-export/3');
 assert.equal(p.items[0].sources.length,43);
 for(const spec of sourceSchema.filter(s=>s.tripOnly))assert.ok(p.items[0].sources.find(g=>g.relation===spec.relation)?.rows.length>0,`original Trip source ${spec.relation} must remain present`);
 const decoded=decodeTurnExportPage(p,fixture.limit,fixture.owner,fixture.now,tripOnly);
 assert.ok(decoded);assert.deepEqual(decoded.items,p.items);
 assert.equal(createHash('sha256').update(exportCanonical({snapshot:decoded.items}),'utf8').digest('hex'),decoded.sourceDigest);
});
