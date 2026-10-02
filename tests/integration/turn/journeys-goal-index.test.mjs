import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_TURN_DB_TEST==='1',container='journeys-index-'+uuid().slice(0,8);
let created=false;
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const quote=v=>"'"+v.replaceAll("'","''")+"'";
const actor=(a,q)=>`set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='{"session_id":"${a.session}","role":"authenticated"}';set request.jwt.claim.role='authenticated';set role authenticated;${q}`;
const read=async(a,cursor=null)=>JSON.parse(await db(actor(a,`select public.read_journeys_goal_index_v1('${a.policy}',${cursor===null?'null':quote(cursor)});`)));
before(async()=>{
 if(!enabled)return;
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
 assert.equal(r.code,0,r.stderr);created=true;
 for(let i=0;i<60;i++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,250));}
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 const files=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
 const mine=files.indexOf('20261002120000_journeys_goal_index.sql');assert.ok(mine>0);
 for(const f of files.slice(0,mine))await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
 const migration=readFileSync('supabase/migrations/'+files[mine],'utf8');
 await db('begin;'+migration+'rollback;');assert.equal(await db("select to_regprocedure('public.read_journeys_goal_index_v1(uuid,text)') is null;"),'t');
 assert.equal(await db("select to_regprocedure('public.read_assistant_conversation_v1(uuid,uuid)') is not null;"),'t');
 await db('begin;'+migration+'commit;');
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
const fixture=async(expired=false)=>{
 const a={owner:uuid(),session:uuid(),policy:uuid(),consent:uuid(),conversation:uuid()};
 await db(`insert into auth.users(id) values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');
 insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at) values('${a.policy}','qwen','synthetic','https://example.test/v1','test','test','test','test','test','${'a'.repeat(64)}','合成','Synthetic','retain_after_hide_v1',now()-interval '1 hour',${expired?"now()-interval '1 second'":"now()+interval '1 day'"},now()+interval '1 day');
 insert into turn_private.text_consents(owner_id,policy_id,consent_id) values('${a.owner}','${a.policy}','${a.consent}');
 insert into turn_private.assistant_conversations(id,owner_id,policy_id,consent_id) values('${a.conversation}','${a.owner}','${a.policy}','${a.consent}');
 insert into turn_private.assistant_goals(id,conversation_id,owner_id,current_text) select gen_random_uuid(),'${a.conversation}','${a.owner}','Undated goal '||i from generate_series(1,45) i;`);
 return a;
};

test('cross-conversation index includes older goals, has exact references, stable pages and closed payload',{skip:!enabled},async()=>{
 const a=await fixture(),old=uuid();
 await db(`insert into turn_private.assistant_conversations(id,owner_id,policy_id,consent_id,created_at) values('${old}','${a.owner}','${a.policy}','${a.consent}',now()-interval '1 day');
 insert into turn_private.assistant_goals(id,conversation_id,owner_id,current_text) values('${uuid()}','${old}','${a.owner}','Older conversation goal');
 insert into turn_private.assistant_conversations(id,owner_id,policy_id,consent_id) select gen_random_uuid(),'${a.owner}','${a.policy}','${a.consent}' from generate_series(1,20);`);
 const legacyList=JSON.parse(await db(actor(a,`select public.list_assistant_conversations_v1('${a.policy}');`)));assert.equal(legacyList.conversations.length,20);assert.ok(!legacyList.conversations.some(c=>c.conversationId===old));
 const rows=[];let cursor=null;let stamp;
 do {const p=await read(a,cursor);assert.equal(p.kind,'journeys_goal_index');assert.equal(p.snapshot,stamp??p.snapshot);stamp=p.snapshot;
 assert.deepEqual(Object.keys(p).sort(),['goals','kind','nextCursor','snapshot']);assert.ok(p.goals.length<=20);rows.push(...p.goals);cursor=p.nextCursor;}while(cursor);
 assert.equal(rows.length,46);assert.ok(rows.some(r=>r.conversationId===old));assert.equal(new Set(rows.map(r=>r.goalId)).size,46);
 assert.deepEqual(rows.map(r=>r.conversationId+'.'+r.goalId),rows.map(r=>r.conversationId+'.'+r.goalId).sort());
 for(const r of rows){assert.deepEqual(Object.keys(r).sort(),['conversationId','goalId','relation','scopeVersion','text']);assert.equal(r.scopeVersion,1);}
});
test('foreign owner/session, correction/deletion/new conversation invalidate cursors without metadata',{skip:!enabled},async()=>{
 const a=await fixture(),b=await fixture();let p=await read(a);
 assert.deepEqual(await read(b,p.nextCursor),{kind:'unavailable'});
 const alternate=uuid();await db(`insert into auth.sessions(id,user_id) values('${alternate}','${a.owner}');`);
 assert.deepEqual(await read({...a,session:alternate},p.nextCursor),{kind:'unavailable'});
 await db(`update turn_private.assistant_goals set scope_version=2,current_text='Corrected' where id='${p.goals[0].goalId}';`);
 assert.deepEqual(await read(a,p.nextCursor),{kind:'unavailable'});p=await read(a);
 await db(`delete from turn_private.assistant_goals where id='${p.goals[0].goalId}';`);assert.deepEqual(await read(a,p.nextCursor),{kind:'unavailable'});p=await read(a);
 await db(`insert into turn_private.assistant_conversations(id,owner_id,policy_id,consent_id) values('${uuid()}','${a.owner}','${a.policy}','${a.consent}');`);
 assert.deepEqual(await read(a,p.nextCursor),{kind:'unavailable'});
});
test('withdrawal/policy expiry/account deletion fail closed and ineligible old consent titles never escape',{skip:!enabled},async()=>{
 const a=await fixture(),old=uuid();await db(`insert into turn_private.assistant_conversations(id,owner_id,policy_id,consent_id) values('${old}','${a.owner}','${a.policy}','${uuid()}');
 insert into turn_private.assistant_goals(id,conversation_id,owner_id,current_text) values('${uuid()}','${old}','${a.owner}','PRIVATE INELIGIBLE TITLE');`);
 const p=await read(a);assert.ok(!JSON.stringify(p).includes('PRIVATE'));await db(`update turn_private.text_consents set revoked_at=now() where owner_id='${a.owner}';`);
 assert.deepEqual(await read(a,p.nextCursor),{kind:'unavailable'});assert.deepEqual(await read(a),{kind:'unavailable'});
 const b=await fixture(true);assert.deepEqual(await read(b),{kind:'unavailable'});
 const c=await fixture();await db(`delete from auth.users where id='${c.owner}';`);const result=await sql(container,actor(c,`select public.read_journeys_goal_index_v1('${c.policy}',null);`));assert.notEqual(result.code,0);assert.match(result.stderr,/UNAUTHENTICATED/);
});
test('hard bounded candidate scans including sparse ineligible histories return unavailable not empty',{skip:!enabled},async()=>{
 const a=await fixture();await db(`insert into turn_private.assistant_goals(id,conversation_id,owner_id,current_text) select gen_random_uuid(),'${a.conversation}','${a.owner}','Overflow' from generate_series(1,456);`);
 assert.deepEqual(await read(a),{kind:'unavailable'});
 const b=await fixture();await db(`delete from turn_private.assistant_goals where owner_id='${b.owner}';insert into turn_private.assistant_conversations(id,owner_id,policy_id,consent_id) select gen_random_uuid(),'${b.owner}','${b.policy}',gen_random_uuid() from generate_series(1,100);`);
 assert.deepEqual(await read(b),{kind:'unavailable'});
 const c=await fixture();await db(`delete from turn_private.assistant_goals where owner_id='${c.owner}';`);assert.equal((await read(c)).goals.length,0);
});
test('Trip head/archive changes invalidate cursor; fresh unknown has no Trip ID; terminal10001 remains read only',{skip:!enabled},async()=>{
 const a=await fixture(),first=await read(a),goal=first.goals[0].goalId,trip=uuid();
 await db(`insert into public.trips(id,owner_id,title,head_version) values('${trip}','${a.owner}','Owned',1);`);
 await db(actor(a,`select public.set_assistant_goal_trip_link_v1('${uuid()}','${a.conversation}','${goal}',null,1,0,'link','${trip}',1,true);`));
 let p=await read(a);assert.equal(p.goals[0].relation.state,'linked');await db(`update public.trips set head_version=2 where id='${trip}';`);
 assert.deepEqual(await read(a,p.nextCursor),{kind:'unavailable'});p=await read(a);assert.deepEqual(p.goals[0].relation,{state:'unknown',tripId:null,tripHeadVersion:null});
 await db(`update public.trips set head_version=1 where id='${trip}';insert into public.trip_archives(trip_id,owner_id,archived_version,idempotency_key) values('${trip}','${a.owner}',1,'${uuid()}');`);
 assert.deepEqual(await read(a,p.nextCursor),{kind:'unavailable'});
 await db(`update turn_private.assistant_goals set scope_version=10000 where id='${goal}';`);
 await db(actor(a,`select public.set_assistant_goal_trip_link_v1('${uuid()}','${a.conversation}','${goal}',null,10000,1,'unlink',null,null,true);`));
 p=await read(a);assert.equal(p.goals[0].scopeVersion,10001);assert.equal(p.goals[0].relation.state,'unlinked');
 const r=await sql(container,actor(a,`select public.set_assistant_goal_trip_link_v1('${uuid()}','${a.conversation}','${goal}',null,10001,2,'link','${trip}',1,true);`));assert.notEqual(r.code,0);
});
test('malformed/memberless cursor and direct RPC ACL exclude anon/service and internal helper',{skip:!enabled},async()=>{
 const a=await fixture(),p=await read(a);
 for(const role of ['anon','authenticated','service_role']){assert.equal(await db(`select has_function_privilege('${role}','turn_private.journeys_goal_index_snapshot_v1(uuid)','execute');`),'f');assert.equal(await db(`select has_function_privilege('${role}','public.read_journeys_goal_index_v1(uuid,text)','execute');`),role==='authenticated'?'t':'f');}
 assert.deepEqual(await read(a,'bad'),{kind:'unavailable'});
 const parts=p.nextCursor.split('.');parts[2]=uuid();assert.deepEqual(await read(a,parts.join('.')),{kind:'unavailable'});
 for(const role of ['anon','service_role']){const r=await sql(container,`set role ${role};select public.read_journeys_goal_index_v1('${a.policy}',null);`);assert.notEqual(r.code,0);assert.match(r.stderr,/permission denied/);}
 const r=await sql(container,actor(a,`select turn_private.journeys_goal_index_snapshot_v1('${a.policy}');`));assert.notEqual(r.code,0);assert.match(r.stderr,/permission denied/);
});

test('exact hard boundaries of100 conversations/500 goals pass,501st sparse candidate fails closed',{skip:!enabled},async()=>{
 const a=await fixture();await db(`insert into turn_private.assistant_conversations(id,owner_id,policy_id,consent_id) select gen_random_uuid(),'${a.owner}','${a.policy}',gen_random_uuid() from generate_series(1,99);
 insert into turn_private.assistant_goals(id,conversation_id,owner_id,current_text) select gen_random_uuid(),'${a.conversation}','${a.owner}','Boundary goal' from generate_series(1,455);`);
 const p=await read(a);assert.equal(p.kind,'journeys_goal_index');assert.equal(p.goals.length,20);
 const old=uuid();await db(`update turn_private.assistant_conversations set consent_id='${old}' where id='${a.conversation}';`);
 const empty=await read(a);assert.equal(empty.kind,'journeys_goal_index');assert.equal(empty.goals.length,0);
 await db(`insert into turn_private.assistant_goals(id,conversation_id,owner_id,current_text) values('${uuid()}','${a.conversation}','${a.owner}','Hidden overflow');`);
 assert.deepEqual(await read(a),{kind:'unavailable'});
});
test('queued Trip deletion and missing canonical receipt invalidate relation/page with no receipt leak',{skip:!enabled},async()=>{
 for(const mutation of ['receipt','deletion']){
 const a=await fixture(),p=await read(a),goal=p.goals[0].goalId,trip=uuid(),operation=uuid();
 await db(`insert into public.trips(id,owner_id,title,head_version) values('${trip}','${a.owner}','Owned',1);`);
 await db(actor(a,`select public.set_assistant_goal_trip_link_v1('${operation}','${a.conversation}','${goal}',null,1,0,'link','${trip}',1,true);`));
 const before=await read(a);assert.equal(before.goals[0].relation.state,'linked');
 if(mutation==='receipt')await db(`delete from turn_private.assistant_goal_trip_receipts where operation_id='${operation}';`);
 else await db(`set request.jwt.claims='{"session_id":"${a.session}","role":"authenticated"}';insert into privacy_private.trip_deletions(request_id,owner_id,trip_id,expected_version) values('${uuid()}','${a.owner}','${trip}',1);`);
 assert.deepEqual(await read(a,before.nextCursor),{kind:'unavailable'});
 const fresh=await read(a);assert.equal(fresh.kind,'journeys_goal_index');assert.ok(!JSON.stringify(fresh).includes(operation));
 assert.notEqual(fresh.goals[0].relation.state,'linked');assert.equal(fresh.goals[0].relation.tripId,null);
 }
});
