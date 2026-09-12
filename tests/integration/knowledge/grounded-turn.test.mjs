import test from 'node:test';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {waitUntil} from '../identity/database-barrier.mjs';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';

const enabled=process.env.VP_GROUNDED_TURN_DB_TEST==='1';
test('grounded Turn: durable scope, private results and historical eligibility',{skip:!enabled,timeout:180000},async t=>{
 const container='vpj16-grounded-'+uuid().slice(0,8);
 const run=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
 assert.equal(run.code,0,run.stderr);t.after(async()=>assert.equal((await command('docker',['rm','-f',container])).code,0));
 const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
 const lit=v=>v===null?'null':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
 let ready=false;for(let i=0;i<60;i++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0){ready=true;break;}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 await db('create schema extensions;create extension pgcrypto with schema extensions;');
 const migrations=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
 for(const f of migrations){const content=readFileSync('supabase/migrations/'+f,'utf8');if(f.endsWith('_vpj_16_grounded_turn.sql')){await db('begin;'+content+'rollback;');assert.equal(await db("select to_regclass('turn_private.grounded_turns') is null;"),'t');}await db('begin;'+content+'commit;');}
 const actor=async()=>{const a={owner:uuid(),session:uuid()};await db(`insert into auth.users values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');`);return a;};
 const owner=await actor(),other=await actor(),author=await actor(),reviewer=await actor();
 const rpc=(role,a)=>async(name,params={})=>{assert.match(name,/^[a-z_]+$/);const claims=a?`set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({session_id:a.session})}';`:'';return JSON.parse(await db(claims+`set role ${role};select public.${name}(`+Object.entries(params).map(([k,v])=>k+'=>'+lit(v)).join(',')+');'));};
 const user=rpc('authenticated',owner),foreign=rpc('authenticated',other),service=rpc('service_role');
 const policy=uuid(),notice='a'.repeat(64);
 await db(`insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at,context_mode) values('${policy}','qwen','synthetic-test-only','https://synthetic.invalid/inference','fixture-source','fixture-processing','fixture-storage','test-terms','test-notice','${notice}','仅当前问题测试告知','Current-input-only test notice','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day','knowledge_intent_v1');`);
 await user('accept_text_policy',{p_policy_id:policy,p_notice_hash:notice});
 const fresh=(overrides={})=>({p_thread_id:uuid(),p_turn_id:uuid(),p_idempotency_key:uuid(),p_policy_id:policy,p_locale:'en',p_text:'Which booking ID is needed for my train?',p_task_id:uuid(),p_scope_version:1,p_relationship:'new_goal',p_parent_turn_id:null,p_city:'shanghai',...overrides});
 const lease=()=>service('claim_grounded_work',{p_owner_id:owner.owner,p_policy_id:policy});
 const keys=l=>({p_turn_id:l.turnId,p_lease_token:l.leaseToken});
 const authorize=async l=>{const input=await service('read_grounded_work',keys(l));assert.equal(input.kind,'intent_input');assert.equal(Object.keys(input).length,7);return service('authorize_grounded_dispatch',{...keys(l),p_policy_id:policy,p_provider:'qwen',p_context_digest:input.contextDigest});};
 const complete=(l,intent='rail_boarding_documents',requestScope='single')=>service('complete_grounded_work',{...keys(l),p_intent:intent,p_request_scope:requestScope});
 const read=a=>user('read_grounded_turn',{p_turn_id:a.p_turn_id});
 await db(`update knowledge_review_private.settings set enabled=true;update knowledge_review_private.publication_settings set enabled=true;insert into knowledge_review_private.members(actor_id,active) values('${author.owner}',true),('${reviewer.owner}',true);`);
 const op=(a,input)=>rpc('authenticated',a)('ops_review_workspace',{p_input:JSON.stringify(input)});
 const source={sourceKey:'grounded-fixture',revisionLabel:'one',publisher:'Synthetic author',uri:'urn:vpj15:synthetic:grounded',locator:'Fixture only',snippet:'PRIVATE FACT SOURCE MUST NOT ENTER MODEL',usageDeclaration:'Synthetic use only'};
 const statement=objectId=>({schemaVersion:'knowledge-statement/1',assertion:{subjectId:'rail_eticket_boarding',predicate:'requires_document',objectId,conditions:['adult_foreign_passport'],exclusions:['no_guarantee']},scope:{cities:['shanghai'],scene:'rail',audience:'international_independent_traveler'},expressions:{en:{text:'Synthetic '+objectId,conditions:['Test condition.'],exclusions:['No real guarantee.']},zh:{text:'合成 '+objectId,conditions:['测试条件。'],exclusions:['不保证真实服务。']}},sources:[source]});
 const publish=async s=>{const cid=uuid();await op(author,{action:'submit_statement',operationId:uuid(),candidateId:cid,title:'Grounded synthetic statement',statement:s});await op(reviewer,{action:'review',operationId:uuid(),candidateId:cid,expectedVersion:1,decision:'reviewed',note:'Synthetic independent review'});await op(reviewer,{action:'publish_statement',operationId:uuid(),candidateId:cid,expectedVersion:2,expiresAt:new Date(Date.now()+3600000).toISOString(),useBasis:'original_factual_summary',useNote:'Synthetic private summary'});return cid;};
 const revoke=cid=>op(reviewer,{action:'revoke_statement',operationId:uuid(),candidateId:cid,expectedPublicationVersion:1,note:'Synthetic withdrawal'});
 const required=['original_valid_booking_id','valid_ticket_not_itinerary_or_receipt'];let root,first,second;
 await t.test('scope participates in exact retry and unsupported legacy admission is denied',async()=>{
  root=fresh();const pair=await Promise.all([user('submit_grounded_turn',root),user('submit_grounded_turn',root)]);assert.deepEqual(pair.map(x=>x.reused).sort(),[false,true]);
  await assert.rejects(user('submit_grounded_turn',{...root,p_city:'beijing'}),/IDEMPOTENCY_KEY_REUSE/);
  const legacy=fresh();delete legacy.p_city;await assert.rejects(user('submit_service_task_turn',legacy),/DATA_POLICY_BLOCKED/);
  assert.equal((await service('claim_turn_work')).kind,'empty');assert.equal((await service('claim_text_work',{p_owner_id:owner.owner,p_policy_id:policy})).kind,'empty');
  assert.equal((await service('claim_text_task_work',{p_owner_id:owner.owner,p_policy_id:policy})).kind,'empty');
  assert.equal((await foreign('read_grounded_turn',{p_turn_id:root.p_turn_id})).kind,'unavailable');
 });
 await t.test('leased current input and intent completion persist references, never factual generic output',async()=>{
  first=await publish(statement(required[0]));second=await publish(statement(required[1]));
  const l=await lease();assert.equal(l.turnId,root.p_turn_id);assert.equal((await service('read_text_work',keys(l))).kind,'blocked');
  assert.equal((await complete(l)).kind,'blocked','successful intent requires dispatch receipt');
  assert.equal((await authorize(l)).kind,'authorized');assert.equal((await authorize(l)).kind,'blocked','one dispatch per lease');
  assert.equal((await service('complete_text_work',{...keys(l),p_kind:'answered',p_text:'Invented unreviewed prose'})).kind,'unavailable');
  assert.equal((await complete(l)).kind,'finished');const result=await read(root);assert.equal(result.result.originalOutcome,'answered');assert.equal(result.result.knowledge.statements.length,2);
  assert.equal(await db(`select output_text from turn_private.text_content where turn_id='${root.p_turn_id}';`),'reviewed-answer-v1');
  assert.equal(await db(`select turn_private.task_history('${root.p_turn_id}') is null;`),'t');
  assert.equal((await user('list_text_turns',{p_policy_id:policy})).kind,'unavailable');assert.equal((await user('read_text_turn',{p_turn_id:root.p_turn_id})).kind,'unavailable');
  assert.equal((await complete(l)).kind,'blocked','terminal is immutable');
 });
 await t.test('events replay is stable, owner and selected-policy scoped with atomic current card',async()=>{
  const params={p_policy_id:policy,p_turn_id:root.p_turn_id,p_after_sequence:0};
  const a=await user('read_grounded_events',params),b=await user('read_grounded_events',params);
  assert.equal(a.kind,'grounded_events');assert.deepEqual(a.events,b.events);
  assert.equal(a.turn.turnId,root.p_turn_id);assert.equal(a.turn.serviceTaskId,root.p_task_id);
  assert.equal(a.events.at(-1).type,'terminal');assert.equal(a.turn.result.knowledge.statements.length,2);
  const end=await user('read_grounded_events',{...params,p_after_sequence:a.lastSequence});
  assert.deepEqual(end.events,[]);assert.equal(end.turn.turnId,root.p_turn_id,'cursor is not a fact cache');
  assert.equal((await foreign('read_grounded_events',params)).kind,'unavailable');
  assert.equal((await user('read_grounded_events',{...params,p_policy_id:uuid()})).kind,'unavailable');
  for(const cursor of [-1,a.lastSequence+1,null])await assert.rejects(user('read_grounded_events',{...params,p_after_sequence:cursor}),/INVALID_INPUT/);
  await assert.rejects(service('read_grounded_events',params),/permission denied/);
  await assert.rejects(rpc('anon')('read_grounded_events',params),/permission denied/);
 });
 await t.test('history rechecks original evidence and cannot silently replace withdrawn support',async()=>{
  await revoke(first);const replay=await user('read_grounded_events',{p_policy_id:policy,p_turn_id:root.p_turn_id});assert.equal(replay.turn.result.knowledge.answer.outcome,'partial');assert.equal(replay.turn.result.knowledge.statements.length,1);const revoked=await read(root);assert.equal(revoked.result.originalOutcome,'answered');assert.equal(revoked.result.knowledge.answer.outcome,'partial');assert.deepEqual(revoked.result.knowledge.answer.claims[0].reasons,['revoked']);
  await publish(statement(required[0]));const replaced=await read(root);assert.equal(replaced.result.knowledge.answer.outcome,'partial');assert.equal(replaced.result.knowledge.statements.length,1);
  const newTurn=fresh();await user('submit_grounded_turn',newTurn);const l=await lease();await authorize(l);await complete(l);assert.equal((await read(newTurn)).result.knowledge.answer.outcome,'answered');
 });
 await t.test('new conflicting publication suppresses saved factual text without rewriting original outcome',async()=>{
  const conflict=statement(required[1]);conflict.expressions.zh.conditions=['Different synthetic condition.'];const cid=await publish(conflict);
  const value=await read(root);assert.equal(value.result.originalOutcome,'answered');assert.equal(value.result.knowledge.statements.length,0);assert.equal(value.result.knowledge.answer.claims[1].status,'unresolved_variants');
  const partial=fresh();await user('submit_grounded_turn',partial);const l=await lease();await authorize(l);await complete(l);assert.equal((await read(partial)).result.originalOutcome,'partial');
  await revoke(cid);const restored=await read(partial);assert.equal(restored.result.knowledge.answer.outcome,'partial');assert.equal(restored.result.knowledge.answer.claims[1].status,'unresolved_variants');assert.equal(restored.result.knowledge.statements.length,1,'resolving a conflict cannot expand historical coverage');
 });
 await t.test('additional needs stay partial; missing or disabled knowledge is not a complete answer',async()=>{
  const a=fresh();await user('submit_grounded_turn',a);let l=await lease();await authorize(l);await complete(l,'rail_boarding_documents','additional_needs');assert.equal((await read(a)).result.originalOutcome,'partial');
  await db('update knowledge_review_private.publication_settings set enabled=false;');assert.equal((await read(a)).result.projection,'unavailable');assert.equal((await read(a)).result.knowledge,null);
  const b=fresh();await user('submit_grounded_turn',b);l=await lease();await authorize(l);await complete(l);assert.equal((await read(b)).result.originalOutcome,'technical_failure');assert.equal((await read(b)).result.knowledge,null);
  await db('update knowledge_review_private.publication_settings set enabled=true;');
 });
 await t.test('clarification continuation retains task and scope without sending earlier turns',async()=>{
  const a=fresh();await user('submit_grounded_turn',a);let l=await lease();await authorize(l);await complete(l,'clarification','unknown');
  const b=fresh({p_thread_id:a.p_thread_id,p_task_id:a.p_task_id,p_relationship:'clarification',p_parent_turn_id:a.p_turn_id,p_text:'I mean adult foreign-passport domestic train booking identification.'});
  await assert.rejects(user('submit_grounded_turn',{...b,p_city:'beijing'}),/SERVICE_TASK_CONFLICT/);
  await user('submit_grounded_turn',b);l=await lease();const input=await service('read_grounded_work',keys(l));assert.equal(input.text,b.p_text);assert.equal(input.history,undefined);
  await authorize(l);await complete(l);assert.equal((await read(b)).serviceTaskId,a.p_task_id);
 });
 await t.test('four-turn cap preserves exact retries but rejects new clarification work',async()=>{
  let a=fresh();
  for(let i=0;i<4;i++){
   await user('submit_grounded_turn',a);const l=await lease();await authorize(l);await complete(l,'clarification','unknown');
   if(i<3)a=fresh({p_thread_id:a.p_thread_id,p_task_id:a.p_task_id,p_relationship:'clarification',p_parent_turn_id:a.p_turn_id});
  }
  assert.equal((await user('submit_grounded_turn',a)).reused,true);
  const fifth=fresh({p_thread_id:a.p_thread_id,p_task_id:a.p_task_id,p_relationship:'clarification',p_parent_turn_id:a.p_turn_id});
  await assert.rejects(user('submit_grounded_turn',fifth),/SERVICE_TASK_CONFLICT/);
  assert.equal(await db(`select count(*) from turn_private.grounded_turns where task_id='${a.p_task_id}';`),'4');
 });
 await t.test('publication wait cannot commit after the lease expires',async()=>{
  const a=fresh();await user('submit_grounded_turn',a);await db(`update turn_private.work set lease_ms=1500 where turn_id='${a.p_turn_id}';`);
  const l=await lease();await authorize(l);
  const gate=spawn('docker',['exec','-i',container,'psql','-h','/tmp/vpj59-socket','-U','postgres','-X','-Atq','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});
  let output='';const done=once(gate,'close');gate.stdout.on('data',b=>output+=b);gate.stderr.resume();
  let finishing;
  try {
   gate.stdin.write(`begin;select candidate_id from knowledge_review_private.publications where candidate_id='${second}' for update;select 'gate-ready';\n`);
   await waitUntil(async()=>output.includes('gate-ready'),5000,'publication gate');
   finishing=sql(container,`set application_name='grounded-expired-finisher';set role service_role;select public.complete_grounded_work('${a.p_turn_id}','${l.leaseToken}','rail_boarding_documents','single');`);
   await waitUntil(async()=>(await db("select count(*) from pg_stat_activity where application_name='grounded-expired-finisher' and cardinality(pg_blocking_pids(pid))>0;"))==='1',5000,'completion waiting on publication');
   await waitUntil(async()=>(await db(`select expires_at<=clock_timestamp() from turn_private.work where turn_id='${a.p_turn_id}';`))==='t',5000,'actual lease deadline');
   gate.stdin.end('commit;\n');await done;
   const result=await finishing;assert.equal(result.code,0,result.stderr);assert.equal(JSON.parse(result.stdout.trim()).kind,'blocked');
   assert.equal(await db(`select completed_at is null from turn_private.grounded_turns where turn_id='${a.p_turn_id}';`),'t');
   assert.equal(await db(`select output_text is null from turn_private.text_content where turn_id='${a.p_turn_id}';`),'t');
  } finally {if(!gate.stdin.writableEnded)gate.stdin.end('rollback;\n');await done;if(finishing)await finishing;}
 });
 await t.test('ordinary roles cannot execute resolver or mutate results; revoked consent fences reads',async()=>{
  for(const role of ['anon','authenticated','service_role']){
   assert.notEqual((await sql(container,`set role ${role};select * from turn_private.grounded_turns;`)).code,0);
   assert.notEqual((await sql(container,`set role ${role};select knowledge_review_private.resolve_question('{}');`)).code,0);
  }
  await user('withdraw_text_policy',{p_policy_id:policy});assert.equal((await read(root)).kind,'unavailable');
  assert.equal((await user('read_grounded_events',{p_policy_id:policy,p_turn_id:root.p_turn_id})).kind,'unavailable');
  await db(`delete from auth.sessions where id='${owner.session}';`);
  await assert.rejects(user('read_grounded_events',{p_policy_id:policy,p_turn_id:root.p_turn_id}),/UNAUTHENTICATED|SESSION_REPLACED/);
 });
});
