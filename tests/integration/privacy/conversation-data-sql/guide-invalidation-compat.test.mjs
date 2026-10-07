import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID as uuid,createHash} from 'node:crypto';
import {readFileSync,readdirSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {command,sql} from '../../cost/fixtures/postgres-rpc.mjs';

test('Guide invalidation append preserves budget overlap, strict source guards and permanent parent fences', {skip:process.env.VP_CONVERSATION_SOURCE_AUDIT!=='1',timeout:90000}, async()=>{
const container='vpj58-guide-candidate-'+uuid().slice(0,8),lit=v=>"'"+String(v).replaceAll("'","''")+"'";
const candidate=readFileSync('supabase/migrations/20261007030000_conversation_guide_invalidation_compat.sql','utf8');
mkdirSync('artifacts/VPJ-58/conversation-data-sql/guide-invalidation-append-candidate',{recursive:true});
const report={kind:'actual disposable append verification; SQL claims/admin fixture, no target activation',candidateSHA256:createHash('sha256').update(candidate).digest('hex')};
const started=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
assert.equal(started.code,0,started.stderr);
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const waitMarker=async marker=>{for(let i=0;i<100;i++){if(await db(`select exists(select 1 from pg_stat_activity where application_name=${lit(marker)} and wait_event_type='Timeout');`)==='t')return;await new Promise(r=>setTimeout(r,10));}throw Error('owned holder did not reach actual hold');};
try{
 for(let i=0;i<100;i++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f<='20261006060000_conversation_data.sql').sort())await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
 const resultSQL=process.env.VP_CONVERSATION_COMPAT_RESULT_SQL??'supabase/migrations/20261007010000_result_data.sql';
 const profileSQL=process.env.VP_CONVERSATION_COMPAT_PROFILE_SQL??(existsSync('supabase/migrations/20261007020000_profile_data.sql')?'supabase/migrations/20261007020000_profile_data.sql':null);
 for(const file of [resultSQL,profileSQL].filter(Boolean)){const bytes=readFileSync(file);await db('begin;'+bytes.toString()+'commit;');report[file.split('/').at(-1)]=createHash('sha256').update(bytes).digest('hex');}
 const strict=()=>db(`select jsonb_build_object('profile',${profileSQL?'profile_data_private.schema_v1()':'null'},'result',result_data_private.schema_supported_v1());`);
 const baselineStrict=JSON.parse(await strict());assert.deepEqual(baselineStrict,{profile:profileSQL?true:null,result:true});
 if(!profileSQL) report.profileVerification='UNRUN: Profile migration is absent from this checkout';
 const owner=uuid(),policy=uuid(),consent=uuid(),thread=uuid(),turn=uuid(),task=uuid(),scope=uuid(),otherTask=uuid();
 await db(`insert into auth.users values('${owner}');
 insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at)
 values('${policy}','qwen','fixture','https://fixture.invalid/v1','local','local','local','fixture','fixture','${'a'.repeat(64)}','合成','Synthetic','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day');
 insert into turn_private.text_consents(owner_id,policy_id,consent_id) values('${owner}','${policy}','${consent}');
 insert into public.chat_threads(id,owner_id) values('${thread}','${owner}');
 insert into public.turns(id,owner_id,thread_id,status) values('${turn}','${owner}','${thread}','completed');
 begin;
 insert into turn_private.service_tasks(id,owner_id,thread_id,goal_turn_id,last_turn_id,policy_id,consent_id,scope_version,goal_digest)
 values('${task}','${owner}','${thread}','${turn}','${turn}','${policy}','${consent}',1,'${'a'.repeat(64)}');
 insert into turn_private.text_content(turn_id,owner_id,thread_id,policy_id,consent_id,locale,input_text,output_kind,output_text)
 values('${turn}','${owner}','${thread}','${policy}','${consent}','en','Candidate input','answered','Candidate answer');commit;
 insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at)
 values('${scope}','${owner}','CNY',10000,1000,10,10,true,clock_timestamp()+interval '1 day');
 insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled)
 values('${scope}','qwen','synthetic','fixture',10000,1000,true);
 insert into guide_private.bindings_v1(turn_id,owner_id,session_id,trip_id,reference_id,trip_version,locale,interest,digest,operation_id,command_digest,thread_id,task_id,completed_ids,canonical_poi_id,rights_revision,expires_at,position_expires_at)
 values('${turn}','${owner}','${uuid()}','${uuid()}','${uuid()}',1,'en','culture','${'a'.repeat(64)}','${uuid()}','${'b'.repeat(64)}','${thread}','${task}','["retained-progress"]','${uuid()}',1,now()+interval '1 day',now()+interval '1 day');`);
 const invalidate=`update guide_private.bindings_v1 set invalidated=true,completed_ids='[]' where turn_id='${turn}';`;
 const acl=()=>db("select proacl::text||coalesce(proconfig::text,'')||prosecdef::text||provolatile::text from pg_proc where oid='conversation_data_private.guard_source_v1()'::regprocedure;");
 const beforeACL=await acl();
 for(const after of [false,true]){
  if(after){await db('begin;'+candidate+'rollback;');assert.equal(await acl(),beforeACL);await db('begin;'+candidate+'commit;');assert.equal(await acl(),beforeACL);assert.deepEqual(JSON.parse(await strict()),baselineStrict);}
  const holderMarker='candidate-scope-'+uuid(),workerMarker='candidate-reserve-'+uuid();
  const holder=sql(container,`set application_name=${lit(holderMarker)};begin;select 1 from public.model_budget_scopes where id='${scope}' for update;select pg_sleep(3);commit;`);
  await waitMarker(holderMarker);
  const worker=sql(container,`set application_name=${lit(workerMarker)};set role service_role;set request.jwt.claim.role='service_role';select public.reserve_model_budget('${scope}','${owner}','${task}','${uuid()}','qwen','synthetic','fixture',100);`);
  let observed=false;for(let i=0;i<100;i++){
   if(await db(`select exists(select 1 from pg_stat_activity where application_name=${lit(workerMarker)} and wait_event_type='Lock' and cardinality(pg_blocking_pids(pid))>0);`)==='t'){observed=true;break;}
   await new Promise(r=>setTimeout(r,10));}
  assert.ok(observed,'actual original reserve RPC waits for scope after owning canonical Task');
  const result=await sql(container,invalidate);
  if(!after){assert.notEqual(result.code,0);assert.match(result.stderr,/could not obtain lock on row in relation "service_tasks"/);report.before='actual original reserve RPC overlap: unchanged Guide invalidation fails Task row lock';}
  else{assert.equal(result.code,0,result.stderr);assert.equal(await db(`select exists(select 1 from pg_stat_activity where application_name=${lit(workerMarker)} and wait_event_type='Lock');`),'t');report.after='same invalidation commits while original reserve still waits; parent-changing update retains strict Task lock refusal';}
  if(after){
   for(const change of [`invalidated=true,completed_ids='[]',task_id='${otherTask}'`,"invalidated=false,completed_ids='[]'","invalidated=true,completed_ids='[]',interest='history'","invalidated=true,completed_ids='[\"new-progress\"]'"]){
    const rebound=await sql(container,`begin;update guide_private.bindings_v1 set ${change} where turn_id='${turn}';rollback;`);
    assert.notEqual(rebound.code,0);assert.match(rebound.stderr,/could not obtain lock on row in relation "service_tasks"/);
   }
  }
  assert.equal((await holder).code,0);const reserved=await worker;assert.equal(reserved.code,0,reserved.stderr);assert.equal(JSON.parse(reserved.stdout.trim()).kind,'reserved');
 }
 assert.equal(await db(`select count(*) from public.model_budget_attempts where task_id='${task}' and status='reserved' and reserved_micros=100;`),'2');
 assert.equal(await db(`select budget_scope_id from turn_private.service_tasks where id='${task}';`),scope);
 const marker='candidate-exclusive-'+uuid();
 const exclusive=sql(container,`set application_name=${lit(marker)};begin;select pg_advisory_xact_lock(hashtextextended('conversation-data-entity:taskIds:${task}',0));select pg_sleep(1);rollback;`);
 await waitMarker(marker);const overlap=await sql(container,invalidate);assert.notEqual(overlap.code,0);assert.match(overlap.stderr,/CONVERSATION_CONFLICT/);assert.equal((await exclusive).code,0);
 const op=uuid();
 const permanentSQL=`begin;insert into conversation_data_private.operations_v1(request_id,owner_id,session_id,mobile_epoch,scope,root_kind,root_id,object_ids,source_digest,preview_digest,source_authorities,captured_at,expires_at,state,preview_erased,request_digest,decision)
 values('${op}','${owner}','${uuid()}',1,'conversation-sensitive-data/1','thread','${thread}',array[]::uuid[],'${'a'.repeat(64)}','${'b'.repeat(64)}','[]',1,30001,'erased',true,'${'c'.repeat(64)}',
 '{"graph":{"taskIds":["${task}"],"threadIds":[],"turnIds":[],"conversationIds":[],"goalIds":[],"messageIds":[],"artifactIds":[]}}');${invalidate}rollback;`;
 for(const command of [invalidate,`update guide_private.bindings_v1 set invalidated=true,completed_ids='[]',task_id='${otherTask}' where turn_id='${turn}';`]){
  const permanent=await sql(container,permanentSQL.replace(invalidate,command));assert.notEqual(permanent.code,0);assert.match(permanent.stderr,/CONVERSATION_CONFLICT/);
 }
 const newParent=await sql(container,permanentSQL.replace(`"${task}"`,`"${otherTask}"`).replace(invalidate,`update guide_private.bindings_v1 set task_id='${otherTask}' where turn_id='${turn}';`));
 assert.notEqual(newParent.code,0);assert.match(newParent.stderr,/CONVERSATION_CONFLICT/);
 const cascadeOwner=uuid(),cascadeThread=uuid(),cascadeTurn=uuid(),cascadeTask=uuid(),cascadeConsent=uuid();
 await db(`insert into auth.users values('${cascadeOwner}');
 insert into turn_private.text_consents(owner_id,policy_id,consent_id) values('${cascadeOwner}','${policy}','${cascadeConsent}');
 insert into public.chat_threads(id,owner_id) values('${cascadeThread}','${cascadeOwner}');
 insert into public.turns(id,owner_id,thread_id,status) values('${cascadeTurn}','${cascadeOwner}','${cascadeThread}','completed');
 begin;insert into turn_private.service_tasks(id,owner_id,thread_id,goal_turn_id,last_turn_id,policy_id,consent_id,scope_version,goal_digest)
 values('${cascadeTask}','${cascadeOwner}','${cascadeThread}','${cascadeTurn}','${cascadeTurn}','${policy}','${cascadeConsent}',1,'${'a'.repeat(64)}');
 insert into turn_private.text_content(turn_id,owner_id,thread_id,policy_id,consent_id,locale,input_text)
 values('${cascadeTurn}','${cascadeOwner}','${cascadeThread}','${policy}','${cascadeConsent}','en','Owned cascade fixture');commit;
 insert into guide_private.bindings_v1(turn_id,owner_id,session_id,trip_id,reference_id,trip_version,locale,interest,digest,operation_id,command_digest,thread_id,task_id,completed_ids,canonical_poi_id,rights_revision,expires_at,position_expires_at)
 select '${cascadeTurn}','${cascadeOwner}',session_id,trip_id,reference_id,trip_version,locale,interest,digest,'${uuid()}',command_digest,'${cascadeThread}','${cascadeTask}',completed_ids,canonical_poi_id,rights_revision,expires_at,position_expires_at from guide_private.bindings_v1 where turn_id='${turn}';
 delete from auth.users where id='${cascadeOwner}';`);
 assert.equal(await db(`select count(*) from auth.users where id='${cascadeOwner}';`),'0');
 assert.equal(await db(`select count(*) from guide_private.bindings_v1 where owner_id='${cascadeOwner}';`),'0');
 report.qualifierNegatives=['parent move','invalidated true to false reopen','other metadata','nonempty progress'];
 report.parentFences={oldParent:true,newParent:true,qualifiedAccountCascade:true};
 report.strictCompatibility={baseline:baselineStrict,after:JSON.parse(await strict()),registry:'original Result/Profile guards executed unchanged; no hash rewrite'};
 assert.deepEqual(report.strictCompatibility.after,baselineStrict);
 report.negatives='exclusive erase entity overlap and permanent Task fence still reject identity-stable invalidation';report.budget='two actual original reservations and canonical binding retained';report.acl='function ACL/config/security/volatility unchanged';report.allAssertionsPassed=true;
 console.log('GUIDE_CANDIDATE_PASS',JSON.stringify(report));
}finally{const cleanup=await command('docker',['rm','-f',container]);assert.equal(cleanup.code,0,cleanup.stderr);report.cleanupPass=true;writeFileSync('artifacts/VPJ-58/conversation-data-sql/guide-invalidation-append-candidate/append-proof.json',JSON.stringify(report,null,2)+'\n');}
});
