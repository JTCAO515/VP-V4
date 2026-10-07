import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID as uuid,createHash} from 'node:crypto';import {writeFileSync} from 'node:fs';
import {sql} from '../../../cost/fixtures/postgres-rpc.mjs';
import {db,fixture,publish,comparison,call,query,selected,eraseFor,actor,lit,json,container,claims} from './runtime.mjs';
import {decodeResultPreview,decodeResultReceipt,decodeResultList,validOperationRow} from './wire.mjs';
const evidence=[];
const reject=async(q,pattern)=>{const r=await sql(container,q);assert.notEqual(r.code,0);assert.match(r.stderr,pattern);return r;};
const run=(name,fn)=>test(name,async()=>{await fn();evidence.push(name);writeFileSync('tests/integration/privacy/result-data-sql/ownproof/adversarial.json',JSON.stringify({kind:'actual PG SQL claims, no signed Auth/target/provider',passed:evidence},null,2)+'\n');});
const exactPreview=async(a,s=selected(a))=>{const p=await call(a,{action:'preview',...s});assert.ok(decodeResultPreview(p,s,actor(a),Date.now()));return p;};
run('all historical revisions/withdrawal and bigint event IDs erase; unselected result and every source full row retained',async()=>{
 const a=await fixture(),other=uuid();await publish(a,other,0,uuid(),{...comparison,title:'Unselected'});
 await publish(a,a.artifact,1,uuid(),{...comparison,summary:'Second revision'});
 await db(`alter sequence turn_private.result_events_id_seq restart with 9007199254740993;set request.jwt.claim.role='service_role';select public.withdraw_result_artifact_v1('${a.owner}','${a.artifact}',2);`);
 const snapshot=()=>db(`select jsonb_build_object('source',(select jsonb_agg(to_jsonb(x) order by id) from turn_private.assistant_messages x where conversation_id='${a.conversation}'),'goal',(select to_jsonb(x) from turn_private.assistant_goals x where id='${a.goal}'),'conversation',(select to_jsonb(x) from turn_private.assistant_conversations x where id='${a.conversation}'),'task',(select to_jsonb(x) from turn_private.service_tasks x where id='${a.task}'),'turn',(select to_jsonb(x) from public.turns x where id='${a.turn}'),'body',(select to_jsonb(x) from turn_private.text_content x where turn_id='${a.turn}'),'other',(select to_jsonb(x) from turn_private.result_artifacts x where id='${other}'),'otherRevisions',(select jsonb_agg(to_jsonb(x)) from turn_private.result_revisions x where artifact_id='${other}'));`);
 const lc={action:'list',scope:'result-sensitive-data/1',rootKind:'artifact',cursor:null,limit:20};const listing=await call(a,lc);assert.ok(decodeResultList(listing,lc,actor(a),Date.now()));assert.equal(listing.items.length,2);assert.equal(listing.items.find(x=>x.rootId===a.artifact).lifecycle,'withdrawn');assert.equal(listing.items.find(x=>x.rootId===a.artifact).revisionCount,2);
 const before=await snapshot(),s=selected(a),p=await exactPreview(a,s);assert.equal(p.eligible,true);assert.deepEqual(p.graph.revisions,[1,2]);assert.ok(p.graph.eventIds.includes('9007199254740993'));
 const c=eraseFor(s,p),bytes=' \n'+JSON.stringify(c)+'  ',r=await call(a,c,bytes);assert.ok(decodeResultReceipt(r,s,actor(a),createHash('sha256').update(bytes).digest('hex'),Date.now()));assert.equal(await snapshot(),before);
 assert.equal(await db(`select count(*) from turn_private.result_revisions where artifact_id='${a.artifact}';`),'0');assert.deepEqual(await call(a,{action:'recover',...s,mutationBytes:bytes}),r);
 await reject(query(a,{action:'recover',...s,mutationBytes:JSON.stringify(c)}),/RESULT_SOURCE_CHANGED/);
 const fresh=uuid();assert.equal((await publish(a,fresh,0,uuid(),comparison)).kind,'published');
 await reject(`set request.jwt.claim.role='service_role';select public.publish_result_artifact_v2('${a.owner}','${a.artifact}',0,'${uuid()}','${a.task}','${a.goal}','${a.message}',null,null,1,'[]',${json(comparison)},'[]');`,/RESULT_CONFLICT/);
 await reject(`set request.jwt.claim.role='service_role';select public.publish_result_artifact_v2('${a.owner}','${uuid()}',0,'${p.graph.publicationKeys[0]}','${a.task}','${a.goal}','${a.message}',null,null,1,'[]',${json(comparison)},'[]');`,/RESULT_CONFLICT/);
});
run('historical decision JSON and result selfFK blockers protect every dependent, including withdrawn',async()=>{
 const a=await fixture(),decision=uuid();await publish(a,decision,0,uuid(),{schemaVersion:'decision/1',title:'Decision',summary:'Pending',comparisonRef:{artifactId:a.artifact,revision:1},state:'pending',chosenOptionId:null,actions:[]});
 await db(`set request.jwt.claim.role='service_role';select public.withdraw_result_artifact_v1('${a.owner}','${decision}',1);`);
 const p=await exactPreview(a);assert.equal(p.eligible,false);assert.ok(p.conflicts.includes('DECISION_REFERENCE'));
 const s=selected(a);const p2=await exactPreview(a,s);await reject(query(a,eraseFor(s,p2)),/RESULT_CONFLICT/);assert.equal(await db(`select count(*) from turn_private.result_artifacts where id in('${a.artifact}','${decision}');`),'2');
 // Remove scalar selfFK in a fixture while retaining historical JSON; audit must still find it.
 await db(`update turn_private.result_artifacts set source_result_id=null where id='${decision}';`);assert.ok((await exactPreview(a)).conflicts.includes('DECISION_REFERENCE'));
});
run('typed plural refs and task_result notifications block, generic reminder resultId has no result authority',async()=>{
 const a=await fixture();const op=uuid();await db(`insert into notification_private.operations(owner_id,operation_id,trip_id,action,request_digest,receipt) values('${a.owner}','${op}','${a.trip}','register_device','${'a'.repeat(64)}',${json({resultId:a.artifact})});`);
 assert.equal((await exactPreview(a)).eligible,true);
 await db(`insert into notification_private.operations(owner_id,operation_id,trip_id,action,request_digest,receipt) values('${a.owner}','${uuid()}','${a.trip}','register_device','${'a'.repeat(64)}',${json({source:{kind:'task_result',sourceId:a.artifact}})});`);assert.ok((await exactPreview(a)).conflicts.includes('NOTIFICATION_REFERENCE'));
 await db(`delete from notification_private.operations where operation_id='${op}';insert into notification_private.operations(owner_id,operation_id,trip_id,action,request_digest,receipt) values('${a.owner}','${uuid()}','${a.trip}','register_device','${'a'.repeat(64)}',${json({artifactIds:[a.artifact]})});`);assert.ok((await exactPreview(a)).conflicts.includes('NOTIFICATION_REFERENCE'));
});
run('Brief original request BYTEA is parsed; malformed original bytes fail closed',async()=>{
 const a=await fixture(),op=uuid(),bytes=JSON.stringify({sources:{artifactIds:[a.artifact]}});await db(`insert into service_brief_private.operations(actor_id,session_id,surface,operation_id,case_id,request_digest,request_bytes,receipt) values('${a.owner}','${a.session}','owner','${op}','${uuid()}','${'a'.repeat(64)}',convert_to(${lit(bytes)},'UTF8'),'{}');`);
 assert.ok((await exactPreview(a)).conflicts.includes('BRIEF_REFERENCE'));
 await reject(`update service_brief_private.operations set request_bytes=decode('ff','hex') where operation_id='${op}';`,/SOURCE_UNAVAILABLE/);
});
run('full-row CAS detects retained source change and reverse dependency insertion before mutation',async()=>{
 const a=await fixture(),s=selected(a),p=await exactPreview(a,s);await db(`update turn_private.assistant_goals set current_text='Changed source' where id='${a.goal}';`);
 await reject(query(a,eraseFor(s,p)),/RESULT_SOURCE_CHANGED/);assert.equal(await db(`select count(*) from turn_private.result_artifacts where id='${a.artifact}';`),'1');
 const s2=selected(a),p2=await exactPreview(a,s2);await db(`insert into notification_private.operations(owner_id,operation_id,trip_id,action,request_digest,receipt) values('${a.owner}','${uuid()}','${a.trip}','register_device','${'a'.repeat(64)}',${json({artifactIds:[a.artifact]})});`);
 await reject(query(a,eraseFor(s2,p2)),/RESULT_SOURCE_CHANGED/);
});
run('ordinary original source authority revocation, stale epoch, recent reauth and foreign roots fail closed',async()=>{
 const a=await fixture(),b=await fixture(),s=selected(a),p=await exactPreview(a,s);
 await reject(query(a,{action:'preview',...s},undefined,2),/SESSION_REPLACED/);
 await reject(query(b,{action:'preview',...s}),/RESULT_SOURCE_UNAVAILABLE/);
 await db(`update turn_private.text_consents set revoked_at=clock_timestamp() where owner_id='${a.owner}' and policy_id='${a.policy}';`);await reject(query(a,eraseFor(s,p)),/DATA_POLICY_BLOCKED/);
 await db(`update auth.sessions set created_at=clock_timestamp()-interval '6 minutes' where id='${b.session}';`);await reject(query(b,{action:'list',scope:'result-sensitive-data/1',rootKind:'artifact',cursor:null,limit:20}),/REAUTHENTICATION_REQUIRED/);
});
run('finite own progress clears selected transients and preserves exact immutable receipts and enumerable fences',async()=>{
 const a=await fixture(),s=selected(a),p=await exactPreview(a,s),c=eraseFor(s,p),bytes=JSON.stringify(c),r=await call(a,c,bytes);
 const requests=[];for(let i=0;i<24;i++){const req=uuid();requests.push(req);await call(a,{action:'preview',scope:'result-delete-progress/1',requestId:req,rootKind:null,rootId:null,objectIds:[s.requestId]});}
 const inventory={action:'list',scope:'result-delete-progress/1',rootKind:null,cursor:null,limit:20};const first=await call(a,inventory);assert.ok(decodeResultList(first,inventory,actor(a),Date.now()));assert.equal(first.items.length,20);assert.equal(first.hasMore,true);
 const next={...inventory,cursor:first.nextCursor},second=await call(a,next);assert.ok(decodeResultList(second,next,actor(a),Date.now()));assert.equal(second.items.length,5);assert.equal(second.sourceDigest,first.sourceDigest);assert.ok([...first.items,...second.items].every(v=>validOperationRow(v,a.owner,Date.now())));
 const ids=[requests[0],requests[1],s.requestId].sort(),sel={scope:'result-delete-progress/1',requestId:uuid(),rootKind:null,rootId:null,objectIds:ids},pp=await call(a,{action:'preview',...sel});assert.ok(decodeResultPreview(pp,sel,actor(a),Date.now()));
 const er=eraseFor(sel,pp),rr=await call(a,er);assert.equal(rr.decision.clearedPreviews,2);assert.equal(rr.decision.retainedFences,3);assert.deepEqual(await call(a,{action:'recover',...s,mutationBytes:bytes}),r);
 const after=await call(a,inventory);assert.ok(after.items.some(x=>x.previewErased));assert.equal(await db('select count(*) from result_data_private.transaction_proofs_v1;'),'0');
});
run('six impact relations close across both sides of cross-set item/receipt/delivery/projection links; hashes include connected unselected set',async()=>{
 const a=await fixture(),source=uuid(),set1=uuid(),set2=uuid(),item=uuid(),delivery=uuid(),projection=uuid();
 await db(`insert into knowledge_review_private.source_revisions(id,source_key,revision_label,declaration,snippet_hash,submitted_by) values('${source}','result-fixture-${source}','1','{}','${'a'.repeat(64)}','${a.owner}');
 insert into knowledge_review_private.source_impact_sets(id,operation_id,source_id,signal_kind,source_snapshot,graph_snapshot,digest,author_id,complete,item_count) values
 ('${set1}','${uuid()}','${source}','observation_unavailable','{}','[]','${'b'.repeat(64)}','${a.owner}',true,1),('${set2}','${uuid()}','${source}','observation_unavailable','{}','[]','${'b'.repeat(64)}','${a.owner}',true,0);
 insert into knowledge_review_private.source_impact_items(id,set_id,target_key,target) values('${item}','${set1}','result:${a.artifact}',${json({kind:'result_artifact',id:a.artifact,revision:1})});
 insert into knowledge_review_private.source_impact_pages(set_id,cursor_key,base_version,receipt) values('${set1}','',1,'{}'),('${set2}','',1,'{}');
 insert into knowledge_review_private.source_impact_outbox(id,set_id,item_id,consumer,review_version,digest,state) values('${delivery}','${set2}','${item}','knowledge_recheck_projection',1,'${'b'.repeat(64)}','queued');
 insert into knowledge_review_private.source_impact_projections(id,delivery_id,set_id,target,source_snapshot,disposition,review_version,digest) values('${projection}','${delivery}','${set1}','{}','{}','recheck_required',1,'${'b'.repeat(64)}');
 update knowledge_review_private.source_impact_outbox set receipt_id='${projection}' where id='${delivery}';
 insert into knowledge_review_private.source_impact_review_requests(delivery_id,projection_id,status,refresh_attempted,cost_unknown) values('${delivery}','${projection}','pending',false,true);`);
 const sets=JSON.parse(await db(`select to_jsonb(result_data_private.impact_sets_v1(jsonb_build_object('artifactIds',jsonb_build_array('${a.artifact}'))));`));assert.deepEqual(sets,[set1,set2].sort());
 const p=await exactPreview(a);assert.ok(p.conflicts.includes('KNOWLEDGE_MIXED_COPY'));
 const raw=JSON.parse(await db(`select result_data_private.source_v1('${a.owner}','${a.artifact}');`));assert.equal(raw.reverse.filter(r=>r.table.startsWith('knowledge_review_private.source_impact_')).length,8);
 await db(`insert into knowledge_review_private.source_impact_pages(set_id,cursor_key,base_version,receipt) values('${set2}','new-connected-page',1,'{"changedConnectedSet":true}');`);
 const p2=await exactPreview(a);assert.notEqual(p2.sourceDigest,p.sourceDigest);
});
run('unregistered incoming cascade FK and complete touched-byte overflow block without partial eligible graph',async()=>{
 const a=await fixture();await db('create table public.result_ownproof_future(id uuid primary key,artifact_id uuid references turn_private.result_artifacts(id) on delete cascade);');
 try{const p=await exactPreview(a);assert.ok(p.conflicts.includes('SOURCE_UNSUPPORTED'));assert.equal(p.eligible,false);}finally{await db('drop table public.result_ownproof_future;');}
 assert.equal(await db('select result_data_private.schema_supported_v1();'),'t');
 // Large original source text is retained data and counts toward the bounded
 // touched snapshot, even when hashes themselves would have fit the budget.
 await db(`insert into notification_private.operations(owner_id,operation_id,trip_id,action,request_digest,receipt) values('${a.owner}','${uuid()}','${a.trip}','register_device','${'a'.repeat(64)}',jsonb_build_object('artifactIds',jsonb_build_array('${a.artifact}'),'storedCopy',repeat('x',1000001)));`);
 const p=await exactPreview(a);assert.ok(p.conflicts.includes('SCOPE_TOO_LARGE'));assert.equal(p.eligible,false);assert.equal(p.eraseCounts.artifacts,0);
});
const waitMarker=async marker=>{for(let i=0;i<100;i++){if(await db(`select exists(select 1 from pg_stat_activity where application_name=${lit(marker)} and wait_event='PgSleep');`)==='t')return;await new Promise(r=>setTimeout(r,10));}throw Error('holder did not reach actual database wait');};
run('ordinary same-id publication preserves original 23505; shared result guards add no producer serialization',async()=>{
 const a=await fixture(),id=uuid();const statement=key=>`set request.jwt.claim.role='service_role';select public.publish_result_artifact_v2('${a.owner}','${id}',0,'${key}','${a.task}','${a.goal}','${a.message}',null,null,1,'[]',${json(comparison)},'[]');`;
 const marker='result-publish-'+uuid();const first=sql(container,`set application_name=${lit(marker)};begin;${statement(uuid())}select pg_sleep(0.8);commit;`);await waitMarker(marker);
 const second=sql(container,statement(uuid()));const r1=await first,r2=await second;assert.equal(r1.code,0,r1.stderr);assert.notEqual(r2.code,0);assert.match(r2.stderr,/duplicate key.*result_artifacts_pkey/);assert.doesNotMatch(r2.stderr,/RESULT_CONFLICT/);
});
run('eraser exclusive/NOWAIT conflicts with real incoming writer; source remains; permanent OLD planning parent cannot move after erase',async()=>{
 const a=await fixture(),s=selected(a),p=await exactPreview(a,s);const marker='result-ref-writer-'+uuid();
 const writer=sql(container,`set application_name=${lit(marker)};begin;insert into notification_private.operations(owner_id,operation_id,trip_id,action,request_digest,receipt) values('${a.owner}','${uuid()}','${a.trip}','register_device','${'a'.repeat(64)}',${json({artifactIds:[a.artifact]})});select pg_sleep(0.8);rollback;`);await waitMarker(marker);
 await reject(query(a,eraseFor(s,p)),/RESULT_CONFLICT/);assert.equal((await writer).code,0);assert.equal(await db(`select count(*) from turn_private.result_artifacts where id='${a.artifact}';`),'1');
 await call(a,eraseFor(s,p));assert.equal(await db(`select result_data_private.fenced_v1('artifactIds','${a.artifact}');`),'t');
 await reject(`insert into notification_private.operations(owner_id,operation_id,trip_id,action,request_digest,receipt) values('${a.owner}','${uuid()}','${a.trip}','register_device','${'a'.repeat(64)}',${json({artifactIds:[a.artifact]})});`,/RESULT_CONFLICT/);
});
run('absolute 30s lifetime rollback after actual delete effects; committed ACK recovers unchanged past TTL',async()=>{
 const a=await fixture(),s=selected(a),p=await exactPreview(a,s),c=eraseFor(s,p);const b=await fixture(),bs=selected(b),bp=await exactPreview(b,bs),bc=eraseFor(bs,bp),bytes=' '+JSON.stringify(bc)+'\n';const receipt=await call(b,bc,bytes);
 await db(`create function result_data_private.ownproof_delay_v1() returns trigger language plpgsql as $$begin if old.artifact_id='${a.artifact}' then perform pg_sleep(2);end if;return old;end$$;create trigger zz_result_ownproof_delay_v1 before delete on turn_private.result_events for each row execute function result_data_private.ownproof_delay_v1();`);
 try{const remaining=p.expiresAt-Date.now()-1500;if(remaining>0)await new Promise(r=>setTimeout(r,remaining));await reject(query(a,c),/RESULT_EXPIRED|RESULT_CONFLICT/);assert.equal(await db(`select count(*) from turn_private.result_artifacts where id='${a.artifact}';`),'1');assert.equal(await db(`select count(*) from turn_private.result_events where artifact_id='${a.artifact}';`),'1');
  const afterReceipt=receipt.expiresAt-Date.now()+10;if(afterReceipt>0)await new Promise(r=>setTimeout(r,afterReceipt));assert.deepEqual(await call(b,{action:'recover',...bs,mutationBytes:bytes}),receipt);
 }finally{await db('drop trigger zz_result_ownproof_delay_v1 on turn_private.result_events;drop function result_data_private.ownproof_delay_v1();');}
 assert.equal(await db('select count(*) from result_data_private.transaction_proofs_v1;'),'0');
});
run('original message source receipt producer blocks result erasure; source receipts and conversation remain unchanged',async()=>{
 const a=await fixture(),message=uuid();await db(`begin;${claims(a)}select public.submit_assistant_message_sources_v2('${a.conversation}','${message}','${uuid()}','${a.policy}','en','Read selected stored result','follow_up','${a.goal}',1,null,'${a.message}',null,${json({artifact:{artifactId:a.artifact,revision:1},trip:null,evidence:[]})});commit;`);
 const before=await db(`select to_jsonb(x) from turn_private.assistant_message_source_receipts x where message_id='${message}';`);const p=await exactPreview(a);assert.ok(p.conflicts.includes('CONVERSATION_SOURCE_REFERENCE'));assert.equal(p.eligible,false);assert.equal(await db(`select to_jsonb(x) from turn_private.assistant_message_source_receipts x where message_id='${message}';`),before);
});
run('private operation immutable fields, caller GUC, session deletion and current-session inventory preserve permanent state',async()=>{
 const a=await fixture(),s=selected(a),p=await exactPreview(a,s),c=eraseFor(s,p),bytes=JSON.stringify(c),r=await call(a,c,bytes);
 await reject(`set result_data_private.erase_authority='true';update result_data_private.operations_v1 set source_digest='${'b'.repeat(64)}' where request_id='${s.requestId}';`,/RESULT_CONFLICT/);
 await reject(`delete from result_data_private.operations_v1 where request_id='${s.requestId}';`,/RESULT_CONFLICT/);
 await reject(`begin;${claims(a)}set role authenticated;select * from result_data_private.operations_v1;rollback;`,/permission denied/);
 const nextSession=uuid();await db(`insert into auth.sessions(id,user_id) values('${nextSession}','${a.owner}');update identity_private.mobile_accounts set session_id='${nextSession}',epoch=2 where owner_id='${a.owner}';insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch) values('${a.owner}','${uuid()}','${nextSession}',2);delete from auth.sessions where id='${a.session}';`);
 assert.equal(await db(`select count(*) from result_data_private.operations_v1 where request_id='${s.requestId}';`),'1');assert.equal(await db(`select result_data_private.fenced_v1('artifactIds','${a.artifact}');`),'t');
 await reject(query(a,{action:'recover',...s,mutationBytes:bytes}),/SESSION_REPLACED/);
 const current={...a,session:nextSession};const inventory={action:'list',scope:'result-delete-progress/1',rootKind:null,cursor:null,limit:20};const rows=JSON.parse(await db(query(current,inventory,undefined,2)));assert.equal(rows.items[0].sessionId,a.session);assert.equal(rows.mobileEpoch,2);
 await reject(query(current,{action:'recover',...s,mutationBytes:bytes},undefined,2),/SESSION_REPLACED/);
});
run('actual confirmed Trip content/history/proposals and used explicit Memory profile/receipts/consent remain byte-identical',async()=>{
 const a=await fixture({linked:true,memory:true}),s=selected(a);
 const snapshot=()=>db(`select jsonb_build_object('trip',(select to_jsonb(x) from public.trips x where id='${a.trip}'),
 'versions',(select jsonb_agg(to_jsonb(x) order by version) from public.trip_version_snapshots x where trip_id='${a.trip}'),
 'tripEvents',(select jsonb_agg(to_jsonb(x) order by id) from public.trip_events x where trip_id='${a.trip}'),
 'proposals',(select jsonb_agg(to_jsonb(x) order by id) from public.trip_proposals x where trip_id='${a.trip}'),
 'memory',(select to_jsonb(x) from public.memory_profiles x where id='${a.memory}'),
 'memoryReceipts',(select jsonb_agg(to_jsonb(x) order by id) from public.memory_receipts x where memory_id='${a.memory}'),
 'memoryConsent',(select to_jsonb(x) from public.memory_consents x where id='${a.memoryConsent}'));`);
 const before=await snapshot(),p=await exactPreview(a,s);assert.equal(p.eligible,true);assert.deepEqual(p.retainedReferences.tripIds,[a.trip]);assert.deepEqual(p.retainedReferences.memoryIds,[a.memory]);assert.equal(p.retainCounts.trips,1);assert.equal(p.retainCounts.memories,1);
 const r=await call(a,eraseFor(s,p));assert.equal(r.decision.sourceTrip,'not_modified');assert.equal(r.decision.explicitMemory,'not_modified');assert.equal(await snapshot(),before);
});
run('actual fifth proposal-reference metadata is decoded by sole corrected TS; selected proposal source is blocked and unchanged',async()=>{
 const a=await fixture({linked:true}),proposal=JSON.parse(await db(`${claims(a)}select row_to_json(x) from public.create_trip_proposal_patch('${a.trip}',${json({expectedVersion:1,operations:[{kind:'set_title',title:'Pending proposal'}]})}) x;`));
 const id=uuid();await publish(a,id,0,uuid(),{schemaVersion:'change-proposal-reference/1',proposalId:proposal.proposal_id,proposalRevision:proposal.revision,actions:[]});
 const lc={action:'list',scope:'result-sensitive-data/1',rootKind:'artifact',cursor:null,limit:20},listing=await call(a,lc);assert.ok(decodeResultList(listing,lc,actor(a),Date.now()));assert.deepEqual(listing.items.find(x=>x.rootId===id).resultTypes,['change-proposal-reference/1']);
 const source={...a,artifact:id},s=selected(source),before=await db(`select to_jsonb(x) from public.trip_proposals x where id='${proposal.proposal_id}';`),p=await exactPreview(source,s);assert.ok(p.conflicts.includes('PROPOSAL_REFERENCE'));assert.equal(p.eligible,false);await reject(query(source,eraseFor(s,p)),/RESULT_CONFLICT/);assert.equal(await db(`select to_jsonb(x) from public.trip_proposals x where id='${proposal.proposal_id}';`),before);
});
