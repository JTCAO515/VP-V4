import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {nativeDatabase} from './native-db.mjs';
import {fixturePorts,claims} from './fixture.mjs';
import {produceTripCandidate} from './producer-fixture.mjs';
import {exportCanonical} from '../../../lib/server/privacy/export-dispatcher.ts';
import {decodeTurnExportPage,TURN_SOURCE_SCHEMA} from '../../../lib/server/privacy/turn-data/export.ts';
const flags={skip:!process.env.VP_TRIP_PG_BIN,timeout:180000};
const str=s=>"'"+String(s).replaceAll("'","''")+"'";
const page=s=>({schemaVersion:s.snapshot.sources.some(g=>g.relation.startsWith('scoped_edit_private.'))?'turn-trip-core-export/1':'turn-core-export/1',section:'snapshot',sourceDigest:s.sourceDigest,items:[s.snapshot],hasMore:false,nextCursor:null,sectionComplete:true});
test('real legacy v1 text Task/receipt exports unchanged; mixed v1/v2 receipts keep their exact independent counter sets',flags,async t=>{
 const {db,upgrade}=await nativeDatabase(t);const f=fixturePorts(db);
 const a=await f.workerFixture(),task=uuid(),turn=uuid();await f.call(a,'submit_service_task_turn',[uuid(),turn,uuid(),a.policy,'en','Legacy text goal',task,1,'new_goal',null]);const l=await f.rawService('claim_text_work',{p_owner_id:a.owner,p_policy_id:a.policy});assert.equal(l.kind,'leased');
 await f.rawService('authorize_text_dispatch',{p_turn_id:l.turnId,p_lease_token:l.leaseToken,p_policy_id:a.policy,p_provider:'qwen'});assert.equal((await f.rawService('complete_text_work',{p_turn_id:l.turnId,p_lease_token:l.leaseToken,p_kind:'answered',p_text:'Legacy synthetic answer'})).kind,'finished');
 const original=(await db(`select turn_data_private.export_source_v1('${a.owner}') v`))[0].v;
 await db('begin;'+upgrade+'commit;');await db('update turn_private.service_task_capacity_settings set trip_enabled=true,enabled=false');
 const before=(await db(`select turn_data_private.export_source_v1('${a.owner}') v`))[0].v;assert.equal(exportCanonical(before),exportCanonical(original),'zero-Trip original v1 source bytes must remain identical');assert.ok(decodeTurnExportPage(page(before),100,a.owner,Date.now()));
 assert.ok(before.snapshot.sources.find(g=>g.relation==='turn_private.service_tasks').rows.every(r=>!Object.hasOwn(r,'trip_objective')));assert.ok(TURN_SOURCE_SCHEMA.find(s=>s.relation==='turn_private.service_tasks').columns.every(c=>c.name!=='trip_objective'));
 // Existing v1 API is still owner-only. C0 owner+claims calls its real original
 // procedure without changing production ACL, creating a genuine old receipt.
 const callOld=async(command)=>{const prefix=claims(a).replace('set role authenticated;','');return (await db(prefix+`select public.privacy_turn_data_v1(${str(command.action)},${str(JSON.stringify(command))},1) v`))[0].v;};
 const selection={scope:'turn-sensitive-data/1',requestId:uuid(),turnId:turn,objectIds:[]},p=await callOld({action:'preview',...selection});assert.equal(p.eligible,true);assert.ok(!Object.keys(p.eraseCounts).some(k=>k.startsWith('trip')));
 const oldReceipt=await callOld({action:'erase',...selection,sourceDigest:p.sourceDigest,previewDigest:p.previewDigest,confirmed:true});assert.equal(oldReceipt.state,'erased');
 const oldSource=(await db(`select turn_data_private.export_source_v1('${a.owner}') v`))[0].v;assert.ok(decodeTurnExportPage(page(oldSource),100,a.owner,Date.now()));
 const x=await produceTripCandidate(f,db,{actor:a});const mixed=(await db(`select turn_data_private.export_source_v1('${a.owner}') v`))[0].v;
 assert.ok(decodeTurnExportPage(page(mixed),100,a.owner,Date.now(),true));
 const request={schemaVersion:'turn-trip-data/1',scope:'turn-sensitive-data/1',requestId:uuid(),turnId:x.task.turnId,objectIds:[]};const pp=await f.call(a,'privacy_trip_service_task_v1',[a.trip,'turn','preview',JSON.stringify({action:'preview',...request}),1]);assert.equal(pp.eligible,true);await f.call(a,'privacy_trip_service_task_v1',[a.trip,'turn','erase',JSON.stringify({action:'erase',...request,sourceDigest:pp.sourceDigest,previewDigest:pp.previewDigest,confirmed:true}),1]);
 const after=(await db(`select turn_data_private.export_source_v1('${a.owner}') v`))[0].v;const decoded=decodeTurnExportPage(page(after),100,a.owner,Date.now(),true);assert.ok(decoded);
 const message=after.snapshot.sources.find(g=>g.relation==='turn_private.assistant_messages').rows.find(m=>m.task_id===x.task.taskId);assert.equal(message.turn_id,null);assert.equal(message.input_text,'[deleted by scoped turn request]');
 const malformed=structuredClone(page(after)),old=malformed.items[0].operations.find(r=>r.requestId===selection.requestId);old.decision.erasedCounts.tripWork=0;assert.equal(decodeTurnExportPage(malformed,100,a.owner,Date.now(),true),null);
});
