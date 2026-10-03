// Actual network-none PostgreSQL and ops/source relations; administrator claim
// fixture is not deployed signed-ops, scheduler, supplier or fee evidence.
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
import {runSourceImpactConsumer} from '../../../lib/server/jobs/source-impact-consumer.ts';
const enabled=process.env.VP_TAKEDOWN_DB_TEST==='1',container='vpj17-impact-'+uuid().slice(0,8);let created=false;
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const lit=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
const rpc=async(actor,name,p)=>JSON.parse(await db(`begin;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${actor.id}';set request.jwt.claims='${JSON.stringify({session_id:actor.session})}';select public.${name}(`+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');commit;'));
before(async()=>{
 if(!enabled)return;const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(r.code,0,r.stderr);created=true;
 for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
async function fixture(count=2){
 const author={id:uuid(),session:uuid()},reviewer={id:uuid(),session:uuid()},submitter={id:uuid(),session:uuid()},source=uuid();
 for(const a of [author,reviewer,submitter])await db(`insert into auth.users(id) values('${a.id}');insert into auth.sessions(id,user_id) values('${a.session}','${a.id}');insert into knowledge_review_private.members(actor_id,active) values('${a.id}',true);`);
 await db(`update knowledge_review_private.settings set enabled=true;insert into knowledge_review_private.source_revisions(id,source_key,revision_label,declaration,snippet_hash,submitted_by) values('${source}','fixture-${source}','r1','{}','${'a'.repeat(64)}','${submitter.id}');`);
 const statements=[];for(let n=0;n<count;n++){
  const candidate=uuid(),statement=uuid(),fact=uuid();statements.push({candidate,statement,fact});
  await db(`insert into knowledge_review_private.candidates(id,author_id,title,content,status,version,reviewer_id,review_note,reviewed_at) values('${candidate}','${submitter.id}','Synthetic source claim','Fixture metadata only','reviewed',2,'${reviewer.id}','independent fixture',now());insert into knowledge_review_private.statements(candidate_id,statement_id,payload) values('${candidate}','${statement}','{"fixture":true}');insert into knowledge_review_private.statement_sources values('${candidate}','${source}');insert into knowledge_review_private.publications(candidate_id,fact_id,state,version,published_by,expires_at,use_basis,use_note) values('${candidate}','${fact}','published',1,'${reviewer.id}',now()+interval '1 day','original_factual_summary','synthetic fixture not public supplier evidence');`);
 }
 await rpc(submitter,'ops_source_revision_withdraw_v1',{p_input:{operationId:uuid(),sourceRevisionId:source,reason:'Synthetic explicit withdrawal'}});
 const snapshot=JSON.parse(await db(`select jsonb_build_object('at',withdrawn_at,'hash',snippet_hash,'label',revision_label) from knowledge_review_private.source_revisions where id='${source}';`));
 const capture=limit=>rpc(author,'capture_source_impact_v1',{p_operation:uuid(),p_source:source,p_expected_label:snapshot.label,p_expected_hash:snapshot.hash,p_expected_withdrawn_at:snapshot.at,p_kind:'withdrawn',p_replacement:null,p_limit:limit});
 return {author,reviewer,submitter,source,statements,snapshot,capture};
}
run('actual withdrawal signal captures bounded graph, independent review, persistent effect+ACK and no fake unsupported consumer',async()=>{
 const f=await fixture(),s=await f.capture(1);assert.equal(s.kind,'captured');assert.equal(s.complete,false);assert.equal(s.itemCount,1);
 assert.equal((await rpc(f.author,'review_source_impact_v1',{p_set:s.setId,p_expected_version:s.version,p_expected_digest:s.digest,p_decision:'approve'})).kind,'blocked');
 assert.equal((await rpc(f.reviewer,'review_source_impact_v1',{p_set:s.setId,p_expected_version:s.version,p_expected_digest:s.digest,p_decision:'approve'})).kind,'conflict');
 const next=await rpc(f.author,'append_source_impact_v1',{p_set:s.setId,p_expected_version:s.version,p_expected_digest:s.digest,p_cursor:s.nextCursor,p_limit:100});assert.equal(next.complete,true);assert.equal(next.itemCount,2);
 assert.deepEqual(await rpc(f.author,'append_source_impact_v1',{p_set:s.setId,p_expected_version:s.version,p_expected_digest:s.digest,p_cursor:s.nextCursor,p_limit:100}),next);
 const reviewed=await rpc(f.reviewer,'review_source_impact_v1',{p_set:s.setId,p_expected_version:next.version,p_expected_digest:s.digest,p_decision:'approve'});assert.equal(reviewed.kind,'reviewed');
 let lost=true;const result=await runSourceImpactConsumer({enabled:true,rpc:async(name,p)=>{const response=await rpc(f.author,name,p);if(name==='apply_source_impact_projection_v1'&&lost){lost=false;throw Error('Controlled commit ACK loss');}return response;}},new AbortController().signal);assert.equal(result,'acked');
 assert.equal(await db(`select count(*) from knowledge_review_private.source_impact_projections where set_id='${s.setId}';`),'1');assert.equal(await db(`select count(*) from knowledge_review_private.source_impact_outbox where set_id='${s.setId}' and state='acked';`),'1');
 assert.equal((await rpc(f.author,'claim_source_impact_delivery_v1',{p_consumer:'trip_item_support',p_limit:1,p_lease_ms:15000})).kind,'unsupported');
 assert.equal(await db(`select count(*) from knowledge_review_private.source_impact_outbox where set_id='${s.setId}' and consumer='trip_item_support' and (receipt_id is not null or state<>'unsupported');`),'0');
 assert.equal(await db(`select count(*) from knowledge_review_private.publications where candidate_id in ('${f.statements[0].candidate}','${f.statements[1].candidate}') and state='published';`),'2');
 assert.equal(await db("select has_function_privilege('authenticated','public.capture_source_impact_v1(uuid,uuid,text,text,timestamptz,text,uuid,integer)','EXECUTE');"),'f');
 assert.equal(await runSourceImpactConsumer({enabled:true,rpc:(name,p)=>rpc(f.author,name,p)},new AbortController().signal),'acked');
});
run('real graph insertion before cursor makes append/review stale and current source CAS refuses old signal',async()=>{
 const f=await fixture(),s=await f.capture(1),candidate=uuid(),statement='00000000-0000-4000-8000-'+uuid().slice(-12),fact=uuid();
 await db(`insert into knowledge_review_private.candidates(id,author_id,title,content,status,version,reviewer_id,review_note,reviewed_at) values('${candidate}','${f.submitter.id}','Metadata phantom fixture','No statement delivery or policy change','reviewed',2,'${f.reviewer.id}','fixture',now());insert into knowledge_review_private.statements(candidate_id,statement_id,payload) values('${candidate}','${statement}','{"later":true}');insert into knowledge_review_private.statement_sources values('${candidate}','${f.source}');insert into knowledge_review_private.publications(candidate_id,fact_id,state,version,published_by,expires_at,use_basis,use_note) values('${candidate}','${fact}','published',1,'${f.reviewer.id}',now()+interval '1 day','original_factual_summary','admin metadata fixture; eligibility still gates withdrawal');`);
 assert.ok('statement:'+statement+':1'<s.nextCursor);
 assert.equal((await rpc(f.author,'append_source_impact_v1',{p_set:s.setId,p_expected_version:s.version,p_expected_digest:s.digest,p_cursor:s.nextCursor,p_limit:100})).kind,'stale');
 assert.equal((await rpc(f.reviewer,'review_source_impact_v1',{p_set:s.setId,p_expected_version:s.version,p_expected_digest:s.digest,p_decision:'approve'})).kind,'stale');
 assert.equal(await db(`select count(*) from knowledge_review_private.source_impact_outbox where set_id='${s.setId}';`),'0');
 await db(`update knowledge_review_private.source_revisions set snippet_hash='${'b'.repeat(64)}' where id='${f.source}';`);assert.equal((await f.capture(100)).kind,'stale');
});
run('old lease cannot ACK/fail newer generation; real apply rollback leaves no marker and revoked reviewer blocks effects',async()=>{
 const f=await fixture(1),s=await f.capture(100);await rpc(f.reviewer,'review_source_impact_v1',{p_set:s.setId,p_expected_version:s.version,p_expected_digest:s.digest,p_decision:'approve'});
 const claim=()=>rpc(f.author,'claim_source_impact_delivery_v1',{p_consumer:'knowledge_recheck_projection',p_limit:1,p_lease_ms:15000}),a=await claim();assert.equal(a.kind,'leased');assert.equal(a.setId,s.setId);
 await db(`update knowledge_review_private.source_impact_outbox set expires_at=clock_timestamp()-interval '1 second' where id='${a.deliveryId}';`);const b=await claim();assert.equal(b.deliveryId,a.deliveryId);assert.equal(b.attempt,2);assert.notEqual(b.leaseToken,a.leaseToken);
 const p=x=>({p_delivery:x.deliveryId,p_lease:x.leaseToken,p_expected_attempt:x.attempt,p_expected_digest:x.sourceDigest});
 assert.equal((await rpc(f.author,'apply_source_impact_projection_v1',p(a))).kind,'blocked');assert.equal((await rpc(f.author,'fail_source_impact_delivery_v1',{...p(a),p_code:'transient_error'})).kind,'blocked');
 await db("create function knowledge_review_private.fixture_impact_ack_failure() returns trigger language plpgsql as $$begin if new.state='acked' then raise exception 'FIXTURE_ACK_FAILURE';end if;return new;end$$;create trigger fixture_impact_ack_failure before update on knowledge_review_private.source_impact_outbox for each row execute function knowledge_review_private.fixture_impact_ack_failure();");
 await assert.rejects(rpc(f.author,'apply_source_impact_projection_v1',p(b)),/FIXTURE_ACK_FAILURE/);assert.equal(await db(`select count(*) from knowledge_review_private.source_impact_projections where set_id='${s.setId}';`),'0');assert.equal(await db(`select count(*) from knowledge_review_private.source_impact_review_requests where delivery_id='${b.deliveryId}';`),'0');
 await db('drop trigger fixture_impact_ack_failure on knowledge_review_private.source_impact_outbox;drop function knowledge_review_private.fixture_impact_ack_failure();');
 const failed=await rpc(f.author,'fail_source_impact_delivery_v1',{...p(b),p_code:'transient_error'});assert.equal(failed.kind,'failed');await db(`update knowledge_review_private.source_impact_outbox set next_attempt_at=clock_timestamp()-interval '1 second' where id='${b.deliveryId}';`);const c=await claim();assert.equal(c.attempt,3);
 await db(`update knowledge_review_private.members set active=false,revision=revision+1 where actor_id='${f.reviewer.id}';`);assert.equal((await rpc(f.author,'apply_source_impact_projection_v1',p(c))).kind,'stale');assert.equal(await db(`select count(*) from knowledge_review_private.source_impact_projections where set_id='${s.setId}';`),'0');
});
run('historical payload mismatch stays a source-linked recheck candidate, without collecting private dialog or proving current facts',async()=>{
 const f=await fixture(1),policy=uuid(),turn=uuid(),task=uuid(),privateText='SYNTHETIC_PRIVATE_DIALOG_NOT_COLLECTED';
 await db(`insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at) values('${policy}','qwen','synthetic only','https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions','fixture','fixture','fixture','test','test','${'a'.repeat(64)}','合成','Synthetic','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day');`);
 await rpc(f.author,'accept_text_policy',{p_policy_id:policy,p_notice_hash:'a'.repeat(64)});
 await rpc(f.author,'submit_service_task_turn',{p_thread_id:uuid(),p_turn_id:turn,p_idempotency_key:uuid(),p_policy_id:policy,p_locale:'en',p_text:privateText,p_task_id:task,p_scope_version:1,p_relationship:'new_goal',p_parent_turn_id:null});
 const ref={factId:f.statements[0].fact,assertionId:f.statements[0].statement,revision:1,payloadHash:'f'.repeat(64)};
 assert.notEqual(await db(`select knowledge_review_private.impact_hash(payload) from knowledge_review_private.statements where statement_id='${f.statements[0].statement}';`),ref.payloadHash);
 await db(`insert into turn_private.grounded_turns(turn_id,owner_id,task_id,city,locale,scope_version,intent,request_scope,original_outcome,basis,completed_at) values('${turn}','${f.author.id}','${task}','shanghai','en',1,'rail_boarding_documents','single','answered',${lit({publications:[ref],claims:[]})},now());`);
 const set=await f.capture(100),view=await rpc(f.author,'read_source_impact_v1',{p_set:set.setId,p_cursor:null,p_limit:100});assert.equal(set.itemCount,2);
 const historical=view.items.find(x=>x.target.kind==='historical_answer');assert.ok(historical);assert.deepEqual(historical.target.claimRefs,[ref]);assert.ok(!JSON.stringify(view).includes(privateText));
 assert.equal((await rpc(f.submitter,'review_source_impact_v1',{p_set:set.setId,p_expected_version:set.version,p_expected_digest:set.digest,p_decision:'approve'})).kind,'blocked');
 const reviewed=await rpc(f.reviewer,'review_source_impact_v1',{p_set:set.setId,p_expected_version:set.version,p_expected_digest:set.digest,p_decision:'approve'});assert.equal(reviewed.kind,'reviewed');
 assert.deepEqual(JSON.parse(await db(`select basis->'publications' from turn_private.grounded_turns where turn_id='${turn}';`)),[ref]);
 assert.equal(await db(`select original_outcome from turn_private.grounded_turns where turn_id='${turn}';`),'answered');
});
run('hard graph1000+sentinel overflow cannot approve or silently become a100-item whole set',async()=>{
 const f=await fixture(0);
 await db(`with created as(insert into knowledge_review_private.candidates(id,author_id,title,content,status,version,reviewer_id,review_note,reviewed_at) select gen_random_uuid(),'${f.submitter.id}','Synthetic capacity item','metadata only','reviewed',2,'${f.reviewer.id}','fixture',now() from generate_series(1,1001) returning id),statements as(insert into knowledge_review_private.statements(candidate_id,payload) select id,'{"bounded":true}'::jsonb from created returning candidate_id) insert into knowledge_review_private.statement_sources(candidate_id,source_revision_id) select candidate_id,'${f.source}' from statements;`);
 const result=await f.capture(100);assert.deepEqual(result,{kind:'blocked',reason:'capacity'});
 assert.equal(await db(`select count(*) from knowledge_review_private.source_impact_sets where source_id='${f.source}';`),'0');
});
