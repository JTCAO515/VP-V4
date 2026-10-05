// Actual network-none PostgreSQL and ops/source relations; administrator claim
// fixture is not deployed signed-ops, scheduler, supplier or fee evidence.
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';import {readFileSync,readdirSync} from 'node:fs';

import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
let baseline;
const entries=['public.submit_grounded_turn(uuid,uuid,uuid,uuid,text,text,uuid,integer,text,uuid,text)','public.start_text_turn(uuid,uuid,uuid,uuid,text,text)','public.enqueue_turn_work(uuid,uuid,uuid,integer,integer)','turn_private.lock_text_work(uuid,uuid)','public.read_grounded_work(uuid,uuid)','public.authorize_grounded_dispatch(uuid,uuid,uuid,text,text)','turn_private.complete_selected_grounded_work(uuid,uuid,text,text,text)','public.complete_grounded_place_work(uuid,uuid,text,text,text,text)','public.complete_grounded_work_with_needs(uuid,uuid,text,text,text)','public.read_grounded_turn(uuid)'];
const snapshot=()=>db("select jsonb_object_agg(oid::regprocedure::text,jsonb_build_object('body',prosrc,'acl',proacl::text)) from pg_proc where oid=any(array["+entries.map(x=>"'"+x+"'::regprocedure::oid").join(',')+"]);");
const enabled=process.env.VP_TURN_DB_TEST==='1',container='vpj28-guide-'+uuid().slice(0,8);let created=false;
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const lit=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
const rpc=async(actor,name,p)=>JSON.parse(await db(`begin;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${actor.id}';set request.jwt.claims='${JSON.stringify({session_id:actor.session})}';${name==='create_trip_proposal_patch'?"select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.":'select public.'}${name}(`+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+(name==='create_trip_proposal_patch'?') r;commit;':');commit;')));
before(async()=>{
 if(!enabled)return;const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(r.code,0,r.stderr);created=true;
 for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){const source=readFileSync('supabase/migrations/'+f,'utf8');if(f==='20261005080000_place_guide.sql'){baseline=JSON.parse(await snapshot());await db('begin;'+source+'rollback;');assert.deepEqual(JSON.parse(await snapshot()),baseline,'append rollback restores all original worker bodies and ACL');assert.equal(await db("select to_regnamespace('guide_private') is null;"),'t');}await db('begin;'+source+'commit;');}
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
async function fixture(options={}){
 const actors=Array.from({length:5},()=>({id:uuid(),session:uuid()})),[author,reviewer,mapper,owner,rightsReviewer]=actors;
 for(const a of actors)await db(`insert into auth.users(id) values('${a.id}');insert into auth.sessions(id,user_id) values('${a.session}','${a.id}');insert into identity_private.mobile_accounts(owner_id) values('${a.id}');insert into knowledge_review_private.members(actor_id,active) values('${a.id}',true);`);
 await db('update knowledge_review_private.settings set enabled=true;update knowledge_review_private.publication_settings set enabled=true;');
 const rpc=async(a,name,p)=>JSON.parse(await db(`begin;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.id}';set request.jwt.claims='${JSON.stringify({session_id:a.session,is_anonymous:false})}';set role authenticated;${name==='create_trip_proposal_patch'?"select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.":'select public.'}${name}(`+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+(name==='create_trip_proposal_patch'?') r;commit;':');commit;')));
 const candidate=uuid(),statement={schemaVersion:'knowledge-statement/2',assertion:{subjectId:'test_gallery',predicate:'opens_during',objectId:'opening_hours',conditions:[],exclusions:[]},scope:{cities:['shanghai'],scene:'attraction',audience:'international_independent_traveler'},place:{names:{en:'Test Gallery',zh:'测试展馆'}},value:{startsAt:new Date(Date.now()+8*3600000).toISOString().slice(0,10)+'T01:00:00Z',endsAt:new Date(Date.now()+8*3600000).toISOString().slice(0,10)+'T08:00:00Z',timeZone:'Asia/Shanghai'},expressions:{en:{text:'Synthetic opening window',conditions:[],exclusions:[]},zh:{text:'合成开放时窗',conditions:[],exclusions:[]}},sources:[{sourceKey:'support-'+uuid(),revisionLabel:'one',publisher:'Fixture source',uri:'urn:vpj15:synthetic:support',locator:'Fixture only',snippet:'NO REAL SUPPLIER',usageDeclaration:'private synthetic fixture'}]};
 Object.assign(statement,options);
 await rpc(author,'ops_review_workspace',{p_input:{action:'submit_statement',operationId:uuid(),candidateId:candidate,title:'Synthetic typed source',statement}});
 await rpc(reviewer,'ops_review_workspace',{p_input:{action:'review',operationId:uuid(),candidateId:candidate,expectedVersion:1,decision:'reviewed',note:'Independent fixture review'}});
 await rpc(reviewer,'ops_review_workspace',{p_input:{action:'publish_statement',operationId:uuid(),candidateId:candidate,expectedVersion:2,useBasis:'original_factual_summary',useNote:'synthetic only no deployment',expiresAt:new Date(Date.now()+86400000).toISOString()}});
 const st=JSON.parse(await db(`select jsonb_build_object('id',statement_id,'revision',revision,'hash',trip_support_private.hash(payload)) from knowledge_review_private.statements where candidate_id='${candidate}';`)),poi=uuid(),trip=uuid(),placeRef=uuid();
 await db(`insert into public.canonical_pois(id,primary_name_zh,primary_name_en) values('${poi}','测试展馆','Test Gallery');insert into public.trips(id,owner_id,title,head_version) values('${trip}','${owner.id}','User intent not globally verified',0);insert into public.trip_place_references(id,trip_id,owner_id,reference_kind,canonical_poi_id) values('${placeRef}','${trip}','${owner.id}','canonical','${poi}');`);
 const basis=await rpc(owner,'knowledge_read_v1',{p_input:{city:'shanghai',scene:'attraction',locale:'en'}});assert.equal(basis.status,'available');
 const sourceRefs=JSON.parse(await db(`select jsonb_agg(jsonb_build_object('sourceRevisionId',r.id,'revisionLabel',r.revision_label,'snippetHash',r.snippet_hash,'submittedBy',r.submitted_by) order by r.id) from knowledge_review_private.statement_sources ss join knowledge_review_private.source_revisions r on r.id=ss.source_revision_id where ss.candidate_id='${candidate}';`)),digest=await db(`select trip_support_private.hash(${lit(sourceRefs)}::jsonb);`);
 const mapping=await rpc(mapper,'submit_trip_support_entity_mapping_v1',{p_input:{operationId:uuid(),canonicalPoiId:poi,statementId:st.id,expectedClaimRevision:st.revision,expectedPayloadHash:st.hash,expectedSourceDigest:digest,basisMetadata:{city:'shanghai',scene:'attraction',locale:'en',sourceRefs}}});assert.equal(mapping.kind,'mapping_candidate',JSON.stringify(mapping));
 const mapped=await rpc(reviewer,'review_trip_support_entity_mapping_v1',{p_mapping:mapping.mappingId,p_expected_version:mapping.version,p_expected_digest:mapping.digest,p_decision:'approve'});assert.equal(mapped.kind,'mapping_reviewed');
 return {rpc,rightsReviewer,owner,reviewer,author,mapper,trip,sourceRefs,poi,placeRef,candidate,statement,mapping:mapped};
}
const input=(f,action='read',more={})=>({action,expectedTripVersion:0,placeReferenceId:f.placeRef,locale:'en',interest:'general',...more});
const guide=async(f,c)=>{const result=await f.rpc(f.owner,'guide_place_v1',{p_trip:f.trip,p_input:c});if(process.env.VP_GUIDE_TS_WIRE_ROOT){const {decodeGuideOutcome}=await import(process.env.VP_GUIDE_TS_WIRE_ROOT+'/lib/server/guide/projection.ts');assert.ok(decodeGuideOutcome(result,f.trip,c,Date.now()),'actual paired TS decoder accepts owner SQL outcome');}return result;};
async function use(f,flags={display:true,tts:true,cache:true,prompt:true},ttl=3600000){
 const proof=JSON.parse(await db(`select guide_private.proof_v1(guide_private.mapping_v1('${f.mapping.mappingId}'));`));
 assert.ok(proof);
 const p={operationId:uuid(),mappingId:f.mapping.mappingId,expectedProof:proof,...flags,useBasis:'Explicit synthetic per-use permission, fixture only',locator:'Synthetic decision',expiresAt:new Date(Date.now()+ttl).toISOString()};
 const r=await f.rpc(f.mapper,'submit_guide_use_v1',{p_input:p});assert.equal(r.kind,'use_candidate',JSON.stringify(r));
 assert.equal((await f.rpc(f.mapper,'review_guide_use_v1',{p_id:r.id,p_revision:r.revision,p_digest:r.digest,p_decision:'approve'})).kind,'blocked');
 const approved=await f.rpc(f.rightsReviewer,'review_guide_use_v1',{p_id:r.id,p_revision:r.revision,p_digest:r.digest,p_decision:'approve'});assert.equal(approved.kind,'use_reviewed');return {...r,revision:approved.revision};
}
run('full append replay, original ACL and default deny, no content/role/grant seeds',async()=>{
 assert.equal(await db("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='guide_private' and c.relkind='r' and not c.relrowsecurity;"),'0');
 assert.equal(await db("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join (values('anon'),('authenticated'),('service_role'))r(role) where (n.nspname='guide_private' or p.proname in('guide_place_v1','submit_guide_use_v1','review_guide_use_v1')) and has_function_privilege(r.role,p.oid,'EXECUTE');"),'0');
 const denied=await sql(container,"set role authenticated;select public.guide_place_v1(null,null);");assert.notEqual(denied.code,0);assert.match(denied.stderr,/permission denied/);
 await db('grant execute on function public.guide_place_v1(uuid,jsonb),public.submit_guide_use_v1(jsonb),public.review_guide_use_v1(uuid,bigint,text,text),public.submit_trip_support_entity_mapping_v1(jsonb),public.review_trip_support_entity_mapping_v1(uuid,bigint,text,text) to authenticated;'); // isolated fixture only
 assert.equal(await db("select has_function_privilege('authenticated','public.submit_grounded_turn(uuid,uuid,uuid,uuid,text,text,uuid,integer,text,uuid,text)','EXECUTE') and has_function_privilege('service_role','public.read_grounded_work(uuid,uuid)','EXECUTE');"),'t');
});
run('current exact canonical published fact, independent per-use rights, whole qualifiers, replay zero units',async()=>{
 const f=await fixture();assert.equal((await guide(f,input(f))).reason,'rights_unavailable');await use(f);
 const ready=await guide(f,input(f));assert.equal(ready.kind,'ready',JSON.stringify(ready));assert.equal(ready.tripVersion,0);assert.equal(ready.canonicalPoiId,f.poi);assert.equal(ready.segments[0].text,'Synthetic opening window');assert.equal(ready.replayAskUnits,0);assert.equal(ready.generationCost,null);assert.deepEqual(ready.unsupportedNarratives,['history','legend']);
 if(process.env.VP_GUIDE_TS_WIRE_ROOT){const {decodeGuideOutcome}=await import(process.env.VP_GUIDE_TS_WIRE_ROOT+'/lib/server/guide/projection.ts');assert.ok(decodeGuideOutcome(ready,f.trip,input(f),Date.now()),'actual TS decoder accepts SQL projection');}
 const c=input(f,'progress',{operationId:uuid(),expectedDigest:ready.digest,completedSegmentIds:[ready.segments[0].id]});const saved=await guide(f,c);assert.deepEqual(saved.completedSegmentIds,c.completedSegmentIds);
 assert.equal((await guide(f,input(f,'replay',{expectedDigest:ready.digest}))).digest,ready.digest);
 const exp=await guide(f,input(f,'export'));assert.equal(exp.records.length,1);assert.equal(exp.scope,'guide_selection_metadata');assert.equal(exp.coverage,'complete_for_selection');assert.deepEqual(exp.bindings,[]);assert.equal(Object.hasOwn(exp.records[0],'text'),false);
 assert.equal((await guide(f,input(f,'read',{locale:'zh'}))).reason,'unsupported_language');
 assert.equal((await guide(f,input(f,'replay',{expectedDigest:'f'.repeat(64)}))).reason,'source_changed');
 await db(`update public.trips set head_version=1 where id='${f.trip}';`);assert.equal((await guide(f,input(f))).reason,'source_changed');
 assert.equal((await guide(f,input(f,'forget',{operationId:uuid()}))).kind,'forgotten');assert.equal(await db(`select count(*) from guide_private.progress_v1 where owner_id='${f.owner.id}';`),'0');
});
run('source withdrawal and use/member/canonical correction synchronously remove stale retained metadata',async()=>{
 for(const mode of ['source','rights','member','canonical']){
 const f=await fixture(),r=await use(f),v=await guide(f,input(f));await guide(f,input(f,'progress',{operationId:uuid(),expectedDigest:v.digest,completedSegmentIds:[]}));
 if(mode==='source')await f.rpc(f.author,'ops_source_revision_withdraw_v1',{p_input:{operationId:uuid(),sourceRevisionId:f.sourceRefs[0].sourceRevisionId,reason:'Synthetic withdrawal'}});
 if(mode==='rights')await f.rpc(f.rightsReviewer,'review_guide_use_v1',{p_id:r.id,p_revision:r.revision,p_digest:r.digest,p_decision:'revoke'});
 if(mode==='member')await db(`update knowledge_review_private.members set active=false,revision=revision+1 where actor_id='${f.rightsReviewer.id}';`);
 if(mode==='canonical')await db(`update public.canonical_pois set primary_name_en='Changed identity' where id='${f.poi}';`);
 assert.equal(await db(`select count(*) from guide_private.progress_v1 where owner_id='${f.owner.id}';`),'0',mode);assert.equal((await guide(f,input(f))).kind,'unavailable',mode);assert.equal((await guide(f,input(f,'forget',{operationId:uuid()}))).kind,'forgotten');
 }
});
run('no inherited TTS/cache/prompt permission and closed head0 input',async()=>{
 const f=await fixture();await use(f,{display:true,tts:false,cache:false,prompt:false});const v=await guide(f,input(f));assert.equal(v.kind,'ready');assert.deepEqual(v.rights,{revision:2,display:true,tts:false,cache:false,prompt:false});
 assert.equal((await guide(f,input(f,'progress',{operationId:uuid(),expectedDigest:v.digest,completedSegmentIds:[]}))).reason,'rights_unavailable');
 for(const bad of [input(f,'read',{expectedTripVersion:'0'}),input(f,'read',{expectedTripVersion:0.5}),input(f,'read',{extra:true})])await assert.rejects(guide(f,bad),/INVALID_INPUT/);
 assert.equal(await db("select guide_private.utf16('😀广州');"),'4');
});
const worker=async(name,p={})=>JSON.parse(await db("set request.jwt.claim.role='service_role';set request.jwt.claim.sub='';set request.jwt.claims='{}';set role service_role;select public."+name+'('+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');'));
async function follow(f){
 const policy=uuid(),thread=uuid(),notice='a'.repeat(64);await db(`insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at,context_mode) values('${policy}','qwen','synthetic-test-only','https://synthetic.invalid/inference','fixture-source','fixture-processing','fixture-storage','test-terms','test-notice','${notice}','测试告知','Test notice','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day','knowledge_intent_v1');`);
 await f.rpc(f.owner,'accept_text_policy',{p_policy_id:policy,p_notice_hash:notice});const v=await guide(f,input(f));
 const c=input(f,'follow_up',{operationId:uuid(),expectedDigest:v.digest,question:'What are the Test Gallery opening hours?',threadId:thread,turnId:uuid(),policyId:policy,completedSegmentIds:[v.segments[0].id],serviceTask:{id:uuid(),scopeVersion:1,relationship:'new_goal',parentTurnId:null}});
 const out=await guide(f,c);assert.equal(out.kind,'submitted',JSON.stringify(out));assert.equal(await db(`select count(*) from public.chat_threads where id='${thread}' and owner_id='${f.owner.id}' and trip_id is null;`),'1','original submit uniquely creates fresh thread');assert.equal((await guide(f,c)).reused,true);
 const lease=await worker('claim_grounded_work',{p_owner_id:f.owner.id,p_policy_id:policy});assert.equal(lease.turnId,c.turnId);return {c,policy,v,lease,keys:{p_turn_id:lease.turnId,p_lease_token:lease.leaseToken}};
}
run('Guide marked original submission, current input/dispatch/completion/history and no standalone bypass',async()=>{
 const f=await fixture();await use(f);const b=await follow(f);
 const v=await worker('read_grounded_work',b.keys);assert.equal(v.kind,'intent_input');assert.ok(v.text.includes('[VP Guide context'));assert.ok(v.text.includes('Synthetic opening window'));assert.equal(v.history,undefined);assert.ok(v.text.includes(b.c.completedSegmentIds[0]),'explicit played segment position is in prompt context');
 assert.equal(await db(`select trip_id is null from public.chat_threads where id='${b.c.threadId}';`),'t');assert.equal(await db(`select count(*) from turn_private.work where turn_id='${b.c.turnId}';`),'1');
 assert.equal((await worker('authorize_grounded_dispatch',{...b.keys,p_policy_id:b.policy,p_provider:'qwen',p_context_digest:v.contextDigest})).kind,'authorized');
 assert.equal((await worker('complete_grounded_work',{...b.keys,p_intent:'payment_card_acceptance',p_request_scope:'single'})).kind,'blocked','unmapped generic claims blocked');
 assert.equal((await worker('complete_grounded_place_work',{...b.keys,p_intent:'place_opening_hours',p_request_scope:'single',p_unanswered_needs:'[]',p_place_name:'Other Gallery'})).kind,'blocked');
 assert.equal((await worker('complete_grounded_place_work',{...b.keys,p_intent:'place_opening_hours',p_request_scope:'single',p_unanswered_needs:'[]',p_place_name:'Test Gallery'})).kind,'finished');
 assert.equal(await db(`select completed_ids from guide_private.bindings_v1 where turn_id='${b.c.turnId}';`),'[]','terminal completion clears transient position');
 const read=await f.rpc(f.owner,'read_grounded_turn',{p_turn_id:b.c.turnId});assert.equal(read.kind,'grounded_turn');assert.equal(read.result.knowledge.statements.length,1,'actual exact mapped statement is returned through original result');assert.ok(read.result.knowledge.statements.every(s=>s.assertionId===b.v.segments[0].assertionId));
 await f.rpc(f.author,'ops_source_revision_withdraw_v1',{p_input:{operationId:uuid(),sourceRevisionId:f.sourceRefs[0].sourceRevisionId,reason:'Synthetic revoked after completion'}});
 assert.notEqual((await f.rpc(f.owner,'read_grounded_turn',{p_turn_id:b.c.turnId})).kind,'grounded_turn');
 assert.equal(await db(`select invalidated from guide_private.bindings_v1 where turn_id='${b.c.turnId}';`),'t');
 const exported=await guide(f,input(f,'export',{expectedTripVersion:42}));assert.equal(exported.bindings.length,1);assert.equal(exported.bindings[0].invalidated,true);assert.equal(exported.bindings[0].turnId,b.c.turnId);assert.equal(exported.records.length,0);assert.equal(Object.hasOwn(exported.bindings[0],'question'),false);assert.equal(Object.hasOwn(exported.bindings[0],'text'),false);
});
run('revocation between input and dispatch, after dispatch before completion and Trip/session deletion stay marked',async()=>{
 for(const mode of ['before_dispatch','before_completion','trip','session']){
 const f=await fixture();await use(f);const b=await follow(f),v=await worker('read_grounded_work',b.keys);
 if(mode!=='before_dispatch')assert.equal((await worker('authorize_grounded_dispatch',{...b.keys,p_policy_id:b.policy,p_provider:'qwen',p_context_digest:v.contextDigest})).kind,'authorized');
 if(mode==='trip')await db(`delete from public.trip_place_references where trip_id='${f.trip}';delete from public.trips where id='${f.trip}';`);
 else if(mode==='session')await db(`delete from auth.sessions where id='${f.owner.session}';`);
 else await f.rpc(f.author,'ops_source_revision_withdraw_v1',{p_input:{operationId:uuid(),sourceRevisionId:f.sourceRefs[0].sourceRevisionId,reason:'Synthetic withdrawal before dispatch/completion'}});
 assert.equal((await worker('read_grounded_work',b.keys)).kind,'blocked');assert.equal((await worker('authorize_grounded_dispatch',{...b.keys,p_policy_id:b.policy,p_provider:'qwen',p_context_digest:v.contextDigest})).kind,'blocked');assert.equal((await worker('complete_grounded_place_work',{...b.keys,p_intent:'place_opening_hours',p_request_scope:'single',p_unanswered_needs:'[]',p_place_name:'Test Gallery'})).kind,'blocked');
 assert.equal(await db(`select invalidated from guide_private.bindings_v1 where turn_id='${b.c.turnId}';`),'t');
 assert.equal(await db(`select count(*) from public.model_budget_attempts where task_id='${b.c.turnId}';`),'0','SQL fixture does not invoke supplier or fabricate cost');
 }
});

run('ordinary original admission/queue/lock bodies and all original ACL unchanged; only exact marked seams',async()=>{
 const current=JSON.parse(await snapshot());
 for(const key of Object.keys(baseline)){
  assert.equal(current[key].acl,baseline[key].acl,key+' original ACL');
  let body=current[key].body;
  body=body.replace(/ if exists\(select 1 from guide_private\.bindings_v1 where turn_id=p_turn_id\) and guide_private\.bound_v1\(p_turn_id,(?:null|p_lease_token)\) is null then return jsonb_build_object\('kind','blocked'\);end if;\n/g,'');
  body=body.replace(/ if exists\(select 1 from guide_private\.bindings_v1 where turn_id=p_turn_id\) then return guide_private\.place_complete_v1\(p_turn_id,p_lease_token,p_intent,p_request_scope,p_unanswered_needs,p_place_name\);end if;\n/g,'');
  body=body.replace(/ if exists\(select 1 from guide_private\.bindings_v1 where turn_id=p_turn_id\) and knowledge_review_private\.question_definition\(p_intent\) is not null and guide_private\.answer_basis_v1\(p_turn_id,p_lease_token,p_intent,p_subject\) is null then return jsonb_build_object\('kind','blocked'\);end if;\n/g,'');
  body=body.replace("payload:=payload||jsonb_build_object('contextDigest',encode(pg_catalog.sha256(convert_to(jsonb_build_array(payload,g.city,g.scope_version)::text,'UTF8')),'hex')); if exists(select 1 from guide_private.bindings_v1 where turn_id=p_turn_id) then return guide_private.input_v1(p_turn_id,p_lease_token,payload);end if;return payload;", "return payload||jsonb_build_object('contextDigest',encode(pg_catalog.sha256(convert_to(jsonb_build_array(payload,g.city,g.scope_version)::text,'UTF8')),'hex'));");
  body=body.replaceAll('if (exists(select 1 from guide_private.bindings_v1 where turn_id=p_turn_id) and guide_private.bound_v1(p_turn_id,p_lease_token) is null) or not turn_private.lock_text_work(p_turn_id,p_lease_token) then','if not turn_private.lock_text_work(p_turn_id,p_lease_token) then');
  body=body.replace('knowledge_review_private.resolve_question(knowledge_review_private.selected_question_input(p_intent,g.city,g.locale,p_subject),case when exists(select 1 from guide_private.bindings_v1 where turn_id=p_turn_id) then guide_private.answer_basis_v1(p_turn_id,p_lease_token,p_intent,p_subject) else null end)','knowledge_review_private.resolve_question(knowledge_review_private.selected_question_input(p_intent,g.city,g.locale,p_subject))');
  assert.equal(body,baseline[key].body,key+' ordinary body byte equivalence after removing marked-only seams');
 }
});

run('actual ordinary role rejects foreign objects and pre-existing foreign/bound/inactive threads; original submit owns creation',async()=>{
 const f=await fixture();await use(f);const b=await follow(f);
 const foreign={id:uuid(),session:uuid()};await db(`insert into auth.users(id) values('${foreign.id}');insert into auth.sessions(id,user_id) values('${foreign.session}','${foreign.id}');`);
 await assert.rejects(f.rpc(foreign,'guide_place_v1',{p_trip:f.trip,p_input:input(f)}),/FORBIDDEN/);
 const c={...b.c,operationId:uuid(),turnId:uuid(),threadId:uuid(),serviceTask:{...b.c.serviceTask,id:uuid()}};
 for(const mode of ['foreign','bound','inactive']){
  c.threadId=uuid();c.operationId=uuid();c.turnId=uuid();c.serviceTask.id=uuid();
  await db(`insert into public.chat_threads(id,owner_id,trip_id,status) values('${c.threadId}','${mode==='foreign'?foreign.id:f.owner.id}',${mode==='bound'?"'"+f.trip+"'":'null'},'${mode==='inactive'?'archived':'active'}');`);
  await assert.rejects(guide(f,c),/FORBIDDEN/);assert.equal(await db(`select count(*) from guide_private.bindings_v1 where turn_id='${c.turnId}';`),'0','failed submit atomically rolls back Guide sidecar');
 }
});

run('whole qualifiers and exact UTF16/120sec limits never truncate or infer translation',async()=>{
 const assertion={subjectId:'test_gallery',predicate:'opens_during',objectId:'opening_hours',conditions:['date_specific'],exclusions:['no_live_hours']};
 const expressions={en:{text:'Synthetic dated window.',conditions:['Only the published date applies.'],exclusions:['This does not confirm that the venue is open now.']},zh:{text:'合成日期时窗。',conditions:['仅适用于已发布日期。'],exclusions:['不确认场所当前营业。']}};
 const f=await fixture({assertion,expressions});await use(f);const v=await guide(f,input(f));assert.deepEqual(v.segments[0].conditions,expressions.en.conditions);assert.deepEqual(v.segments[0].exclusions,expressions.en.exclusions);
 const long=await fixture({expressions:{en:{text:'a '.repeat(499).trim(),conditions:[],exclusions:[]},zh:{text:'合成时窗',conditions:[],exclusions:[]}}});await use(long);assert.equal((await guide(long,input(long))).reason,'capacity','more than120sec complete text rejected');
});

run('expired original rights lease rejects work but owner forget/export retain safe metadata coverage',async()=>{
 const f=await fixture();await use(f,undefined,2000);const b=await follow(f);await new Promise(r=>setTimeout(r,2100));
 assert.equal((await worker('read_grounded_work',b.keys)).kind,'blocked');
 const exp=await guide(f,input(f,'export',{expectedTripVersion:9007199254740991}));assert.equal(exp.kind,'export');assert.equal(exp.bindings.length,1);assert.ok(Date.parse(exp.bindings[0].expiresAt)<Date.now());assert.equal(exp.coverage,'complete_for_selection');assert.equal(exp.records.length,0);
 assert.equal((await guide(f,input(f,'forget',{operationId:uuid(),expectedTripVersion:9007199254740991}))).kind,'forgotten');
});

run('cache false permits explicit prompt-only position on first new goal; original sameop change fails and terminal clears',async()=>{
 const f=await fixture();await use(f,{display:true,tts:false,cache:false,prompt:true});const b=await follow(f);
 assert.equal(await db(`select count(*) from guide_private.progress_v1 where owner_id='${f.owner.id}';`),'0');
 assert.deepEqual(JSON.parse(await db(`select completed_ids from guide_private.bindings_v1 where turn_id='${b.c.turnId}';`)),b.c.completedSegmentIds);
 await assert.rejects(guide(f,{...b.c,completedSegmentIds:[]}),/IDEMPOTENCY_KEY_REUSE/);
 const payload=await worker('read_grounded_work',b.keys);assert.equal(payload.kind,'intent_input');
 assert.equal((await worker('complete_grounded_work',{...b.keys,p_intent:'technical_failure',p_request_scope:'unknown'})).kind,'finished');
 assert.equal(await db(`select completed_ids from guide_private.bindings_v1 where turn_id='${b.c.turnId}';`),'[]');
 assert.deepEqual((await guide(f,input(f))).completedSegmentIds,[],'prompt permission never restores replay progress');
});

const metadata=f=>db(`select jsonb_build_object('bindings',(select coalesce(jsonb_agg(to_jsonb(b) order by turn_id),'[]') from guide_private.bindings_v1 b where owner_id='${f.owner.id}'),'progress',(select coalesce(jsonb_agg(to_jsonb(p) order by reference_id,locale,interest),'[]') from guide_private.progress_v1 p where owner_id='${f.owner.id}'));`);
async function staleBinding(b,state){
 await db(`update guide_private.bindings_v1 set invalidated=${state==='invalidated'},expires_at=clock_timestamp()+interval '${state==='source_expired'?'-1':'3600'} seconds',position_expires_at=clock_timestamp()-interval '1 second',completed_ids=${lit(b.c.completedSegmentIds)}::jsonb where turn_id='${b.c.turnId}';`);
}
run('foreign reads of expired or invalidated Guide bindings have zero metadata writes',async()=>{
 const f=await fixture();await use(f);const b=await follow(f),foreign={id:uuid(),session:uuid()};
 await db(`insert into auth.users(id) values('${foreign.id}');insert into auth.sessions(id,user_id) values('${foreign.session}','${foreign.id}');`);
 for(const state of ['source_expired','position_expired','invalidated']){
  await staleBinding(b,state);const before=await metadata(f);
  assert.notEqual((await f.rpc(foreign,'read_grounded_turn',{p_turn_id:b.c.turnId})).kind,'grounded_turn');
  assert.equal(await metadata(f),before,state+' foreign denied read must not clear position or invalidate metadata');
 }
});
run('invalid worker token on expired or invalidated Guide bindings has zero metadata writes',async()=>{
 const f=await fixture();await use(f);const b=await follow(f);
 for(const state of ['source_expired','position_expired','invalidated']){
  await staleBinding(b,state);const before=await metadata(f),keys={...b.keys,p_lease_token:uuid()};
  assert.equal((await worker('read_grounded_work',keys)).kind,'blocked');
  assert.equal(await metadata(f),before,state+' invalid worker read must not write metadata');
  assert.equal((await worker('authorize_grounded_dispatch',{...keys,p_policy_id:b.policy,p_provider:'qwen',p_context_digest:'a'.repeat(64)})).kind,'blocked');
  assert.equal(await metadata(f),before,state+' invalid worker dispatch must not write metadata');
 }
});
