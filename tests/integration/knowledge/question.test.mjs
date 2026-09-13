import test from 'node:test';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {waitUntil} from '../identity/database-barrier.mjs';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';

const enabled=process.env.VP_KNOWLEDGE_QUESTION_DB_TEST==='1';
test('first-party reviewed question: real PostgreSQL eligibility, coverage and isolation',{skip:!enabled,timeout:180000},async t=>{
 const container='vpj16-question-'+uuid().slice(0,8);
 const run=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
 assert.equal(run.code,0,run.stderr);t.after(async()=>assert.equal((await command('docker',['rm','-f',container])).code,0));
 const db=async q=>{const result=await sql(container,q);assert.equal(result.code,0,result.stderr);return result.stdout.trim();};
 const lit=x=>"'"+String(x).replaceAll("'","''")+"'";
 let ready=false;for(let i=0;i<60;i++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0){ready=true;break;}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 await db('create schema extensions;create extension pgcrypto with schema extensions;');
 const migrations=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
 for(const f of migrations){
  const content=readFileSync('supabase/migrations/'+f,'utf8');
  if(f.endsWith('_vpj_16_payment_questions.sql')){
   await db('begin;'+content+'rollback;');
   assert.equal(await db("select to_regprocedure('knowledge_review_private.question_definition(text)') is null;"),'t');
  }
  if(f.endsWith('_vpj_16_reviewed_question.sql')){
   await db('begin;'+content+'rollback;');
   assert.equal(await db("select to_regprocedure('public.knowledge_answer_v1(jsonb)') is null;"),'t');
  }
  await db('begin;'+content+'commit;');
 }
 const actor=async()=>{const value={owner:uuid(),session:uuid()};await db(`insert into auth.users values('${value.owner}');insert into auth.sessions(id,user_id) values('${value.session}','${value.owner}');`);return value;};
 const author=await actor(),reviewer=await actor(),reader=await actor();
 const prefix=a=>`set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({session_id:a.session})}';set role authenticated;`;
 const call=(a,name,input)=>db(prefix(a)+`select public.${name}(${lit(JSON.stringify(input))}::jsonb);`).then(JSON.parse);
 const input={questionId:'rail_boarding_documents',questionVersion:1,city:'shanghai',locale:'en'};
 const answer=(change={})=>call(reader,'knowledge_answer_v1',{...input,...change});
 const rejects=async(a,input,pattern)=>{const r=await sql(container,prefix(a)+`select public.knowledge_answer_v1(${lit(JSON.stringify(input))}::jsonb);`);assert.notEqual(r.code,0);assert.match(r.stderr,pattern);};
 await t.test('rollback, disabled switch, closed question scope and RPC roles',async()=>{
  await rejects(reader,input,/KNOWLEDGE_DISABLED/);
  for(const bad of [{...input,questionVersion:2},{...input,text:'Also book my train'}, {...input,city:'london'}, {...input,questionId:'anything'}, {...input,locale:'ar'}])await rejects(reader,bad,/INVALID_INPUT/);
  for(const role of ['anon','service_role'])assert.notEqual((await sql(container,`set role ${role};select public.knowledge_answer_v1(${lit(JSON.stringify(input))});`)).code,0);
 });
 await db(`update knowledge_review_private.settings set enabled=true;update knowledge_review_private.publication_settings set enabled=true;insert into knowledge_review_private.members(actor_id,active) values('${author.owner}',true),('${reviewer.owner}',true);`);
 const source={sourceKey:'question-fixture',revisionLabel:'one',publisher:'Synthetic test author',uri:'urn:vpj15:synthetic:question',locator:'Fixture only',snippet:'PRIVATE SNIPPET MUST NOT LEAK',usageDeclaration:'Private synthetic declaration'};
 const statement=objectId=>({schemaVersion:'knowledge-statement/1',assertion:{subjectId:'rail_eticket_boarding',predicate:'requires_document',objectId,conditions:['adult_foreign_passport'],exclusions:['no_guarantee']},scope:{cities:['shanghai'],scene:'rail',audience:'international_independent_traveler'},expressions:{en:{text:'Synthetic '+objectId,conditions:['Adult foreign-passport test only.'],exclusions:['No real boarding guarantee.']},zh:{text:'合成 '+objectId,conditions:['仅限成年外籍护照测试。'],exclusions:['不保证真实乘车。']}},sources:[source]});
 const publish=async(s)=>{const cid=uuid();await call(author,'ops_review_workspace',{action:'submit_statement',operationId:uuid(),candidateId:cid,title:'Synthetic question evidence',statement:s});await call(reviewer,'ops_review_workspace',{action:'review',operationId:uuid(),candidateId:cid,expectedVersion:1,decision:'reviewed',note:'Independent synthetic review'});await call(reviewer,'ops_review_workspace',{action:'publish_statement',operationId:uuid(),candidateId:cid,expectedVersion:2,expiresAt:new Date(Date.now()+3600000).toISOString(),useBasis:'original_factual_summary',useNote:'Private synthetic use note'});return cid;};
 const revoke=cid=>call(reviewer,'ops_review_workspace',{action:'revoke_statement',operationId:uuid(),candidateId:cid,expectedPublicationVersion:1,note:'Synthetic withdrawal'});
 const required=['original_valid_booking_id','valid_ticket_not_itinerary_or_receipt'];let first,second,corroboration;
 await t.test('missing support is honest; a single supported obligation stays partial',async()=>{
  const empty=await answer();assert.equal(empty.answer.outcome,'no_answer');assert.deepEqual(empty.answer.claims.map(c=>c.reasons),[['missing'],['missing']]);
  first=await publish(statement(required[0]));const partial=await answer();assert.equal(partial.answer.outcome,'partial');assert.equal(partial.statements.length,1);assert.equal(partial.answer.claims[1].status,'unavailable');
 });
 await t.test('complete bilingual answers preserve exact qualifiers and source context',async()=>{
  second=await publish(statement(required[1]));
  for(const locale of ['en','zh']){const result=await answer({locale});assert.equal(result.answer.outcome,'answered');assert.equal(result.statements.length,2);for(const row of result.statements){assert.deepEqual(row.conditions,statement(row.assertion.objectId).expressions[locale].conditions);assert.deepEqual(row.exclusions,statement(row.assertion.objectId).expressions[locale].exclusions);assert.equal(row.sources[0].locator,source.locator);}assert.doesNotMatch(JSON.stringify(result),/PRIVATE SNIPPET|Private synthetic/);}
  assert.equal((await answer({city:'beijing'})).answer.outcome,'no_answer');
 });
 await t.test('corroboration is retained; incompatible wording cannot become a ranked complete answer',async()=>{
  const s=statement(required[0]);s.sources=[{...source,sourceKey:'other-question-source'}];corroboration=await publish(s);
  assert.equal((await answer()).statements.length,3);
  const differing=statement(required[0]);differing.expressions.zh.conditions=['不同限制。'];const conflict=await publish(differing);
  const result=await answer();assert.equal(result.answer.outcome,'partial');assert.equal(result.answer.claims[0].status,'unresolved_variants');assert.equal(result.statements.length,1);
  await revoke(conflict);assert.equal((await answer()).answer.outcome,'answered');
 });
 await t.test('a publication appearing after the base read is frozen behind its own revocation lock',async()=>{
  // Instrument only the existing base reader in this disposable database. The
  // production answer function remains exact and unmodified throughout the race.
  await db(`alter function public.knowledge_read_v1(jsonb) rename to question_test_original_read;
   create function public.knowledge_read_v1(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
   declare result jsonb;begin result:=public.question_test_original_read(p_input);perform pg_advisory_xact_lock(716031);return result;end $$;`);
  const live=[];
  const connection=()=>{const child=spawn('docker',['exec','-i',container,'psql','-h','/tmp/vpj59-socket','-U','postgres','-X','-Atq','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});const state={child,out:'',err:'',done:once(child,'close')};child.stdout.on('data',b=>state.out+=b);child.stderr.on('data',b=>state.err+=b);live.push(state);return state;};
  const gate=connection(),reading=connection();
  let writing;
  try{
   gate.child.stdin.write("begin;select pg_advisory_xact_lock(716031);select 'gate-ready';\n");
   await waitUntil(async()=>gate.out.includes('gate-ready'),5000,'gate');
   reading.child.stdin.write(`begin;set application_name='vpj16-race-reader';${prefix(reader)}select public.knowledge_answer_v1(${lit(JSON.stringify({...input,city:'guangzhou'}))}::jsonb);\n`);
   await waitUntil(async()=>(await db("select count(*) from pg_stat_activity where application_name='vpj16-race-reader' and wait_event='advisory';"))==='1',5000,'base read barrier');
   const newlyPublished=statement(required[0]);newlyPublished.scope.cities=['guangzhou'];const cid=await publish(newlyPublished);
   gate.child.stdin.end('commit;\n');await gate.done;
   await waitUntil(async()=>reading.out.includes('knowledge-answer/1'),5000,'answer');
   const projected=JSON.parse(reading.out.trim());assert.equal(projected.answer.outcome,'partial');assert.equal(projected.statements.length,1);
   const revokeInput={action:'revoke_statement',operationId:uuid(),candidateId:cid,expectedPublicationVersion:1,note:'Concurrent synthetic withdrawal'};
   writing=sql(container,`set application_name='vpj16-race-writer';${prefix(reviewer)}select public.ops_review_workspace(${lit(JSON.stringify(revokeInput))});`);
   await waitUntil(async()=>(await db("select count(*) from pg_stat_activity where application_name='vpj16-race-writer' and cardinality(pg_blocking_pids(pid))>0;"))==='1',5000,'revocation lock');
   reading.child.stdin.end('commit;\n');await reading.done;
   assert.equal((await writing).code,0);
  }finally{
   for(const item of live){if(!item.child.stdin.writableEnded)item.child.stdin.end('rollback;\n');await item.done;}
   if(writing)await writing;
   await db('drop function public.knowledge_read_v1(jsonb);alter function public.question_test_original_read(jsonb) rename to knowledge_read_v1;');
  }
  assert.deepEqual((await answer({city:'guangzhou'})).answer.claims[0].reasons,['revoked']);
 });
 await t.test('revocation and expiry suppress text and identify observed causes',async()=>{
  await revoke(first);await revoke(corroboration);
  const revoked=await answer();assert.equal(revoked.answer.outcome,'partial');assert.deepEqual(revoked.answer.claims[0].reasons,['revoked']);assert.equal(revoked.statements.length,1);
  await db(`update knowledge_review_private.publications set published_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' where candidate_id='${second}';`);
  const expired=await answer();assert.equal(expired.answer.outcome,'no_answer');assert.deepEqual(expired.answer.claims[1].reasons,['expired']);assert.equal(expired.statements.length,0);
 });
 await t.test('payment coverage preserves revoked obligations, exact relations and bilingual qualifiers',async()=>{
  const definitions=JSON.parse(await db("select jsonb_object_agg(k,knowledge_review_private.question_definition(k)) from unnest(array['payment_card_acceptance','payment_mobile_setup','payment_cash_access','payment_getting_started']) k;"));
  const overview=definitions.payment_getting_started;
  assert.equal(overview.claims.length,4);
  const published=[];
  for(const relation of overview.claims){
   const s=statement(relation.objectId);s.assertion={...s.assertion,...relation};s.scope.scene='payment';
   published.push(await publish(s));
  }
  const full=await answer({questionId:'payment_getting_started'});
  assert.equal(full.answer.outcome,'answered');assert.equal(full.scope.scene,'payment');assert.equal(full.statements.length,4);
  await revoke(published[0]);
  for(const locale of ['en','zh']){
   const partial=await answer({questionId:'payment_getting_started',locale});
   assert.equal(partial.answer.outcome,'partial');assert.equal(partial.statements.length,3);
   assert.deepEqual(partial.answer.claims[0].reasons,['revoked']);
   assert.ok(partial.statements.every(s=>s.conditions.length===1&&s.exclusions.length===1&&s.text.startsWith(locale==='en'?'Synthetic ':'合成 ')));
   assert.equal((await answer({questionId:'payment_card_acceptance',locale})).answer.outcome,'no_answer');
   assert.equal((await answer({questionId:'payment_mobile_setup',locale})).statements.length,1);
   assert.equal((await answer({questionId:'payment_cash_access',locale})).statements.length,2);
  }
  const mobileAndCash=await answer({questionId:'payment_mobile_and_cash'});
  assert.equal(mobileAndCash.answer.outcome,'answered','unrequested revoked card relation cannot downgrade mobile+cash');
  assert.equal(mobileAndCash.statements.length,3);
  const impostor=statement(overview.claims[1].objectId);impostor.scope.scene='payment';
  await publish(impostor);
  assert.equal((await answer({questionId:'payment_mobile_setup'})).statements.length,1,'same object ID under the wrong subject cannot qualify');
  for(const role of ['anon','authenticated','service_role'])assert.notEqual((await sql(container,`set role ${role};select knowledge_review_private.question_definition('payment_mobile_setup');`)).code,0);
 });
 await t.test('capacity overflow fails instead of hiding evidence behind a retrieval limit',async()=>{
  const support=statement(required[0]);support.scope.cities=['beijing'];
  for(let i=0;i<50;i++)await publish(support);
  const boundary=await answer({city:'beijing'});assert.equal(boundary.statements.length,50);assert.equal(boundary.answer.outcome,'partial');
  await publish(support);await rejects(reader,{...input,city:'beijing'},/KNOWLEDGE_CAPACITY/);
 });
 await t.test('switch and session loss never masquerade as knowledge gaps; no task or model receipt',async()=>{
  await db('update knowledge_review_private.publication_settings set enabled=false;');await rejects(reader,input,/KNOWLEDGE_DISABLED/);
  await db(`delete from auth.sessions where id='${reader.session}';`);await rejects(reader,input,/UNAUTHENTICATED|SESSION_REPLACED/);
  assert.equal(await db('select count(*) from turn_private.service_tasks;select count(*) from turn_private.text_dispatches;select count(*) from public.model_budget_attempts;'),'0\n0\n0');
 });
});
