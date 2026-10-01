import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_TURN_DB_TEST==='1',container='vpj83-pages-'+uuid().slice(0,8);
let created=false;
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const quote=v=>"'"+v.replaceAll("'","''")+"'";
const actor=(a,q)=>`set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='{"session_id":"${a.session}","role":"authenticated"}';set request.jwt.claim.role='authenticated';set role authenticated;${q}`;
const read=async(a,cursor=null)=>JSON.parse(await db(actor(a,`select public.read_assistant_journeys_page_v1('${a.policy}',${cursor===null?'null':quote(cursor)});`)));
before(async()=>{
 if(!enabled)return;
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
 assert.equal(r.code,0,r.stderr);created=true;
 for(let i=0;i<60;i++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,250));}
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 const files=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
 const mine=files.indexOf('20261002040000_vpj83_journeys_pages.sql');assert.ok(mine>0);
 for(const f of files.slice(0,mine))await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
 const migration=readFileSync('supabase/migrations/'+files[mine],'utf8');
 await db('begin;'+migration+'rollback;');assert.equal(await db("select to_regprocedure('public.read_assistant_journeys_page_v1(uuid,text)') is null;"),'t');
 assert.equal(await db("select to_regprocedure('public.read_assistant_conversation_v1(uuid,uuid)') is not null;"),'t');
 await db('begin;'+migration+'commit;');
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
const fixture=async()=>{
 const a={owner:uuid(),session:uuid(),policy:uuid(),consent:uuid(),conversation:uuid()};
 await db(`insert into auth.users(id) values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');
 insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at) values('${a.policy}','qwen','synthetic','https://example.test/v1','test','test','test','test','test','${'a'.repeat(64)}','合成','Synthetic','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day');
 insert into turn_private.text_consents(owner_id,policy_id,consent_id) values('${a.owner}','${a.policy}','${a.consent}');
 insert into turn_private.assistant_conversations(id,owner_id,policy_id,consent_id) values('${a.conversation}','${a.owner}','${a.policy}','${a.consent}');
 insert into turn_private.assistant_goals(id,conversation_id,owner_id,current_text) select gen_random_uuid(),'${a.conversation}','${a.owner}','Undated goal '||i from generate_series(1,100) i;`);
 return a;
};
test('100 current-conversation goals are readable in five stable pages without message bodies',{skip:!enabled,timeout:120000},async()=>{
 const a=await fixture();const ids=[];let cursor=null;let first;
 const thread=uuid();
 await db(`insert into public.chat_threads(id,owner_id) values('${thread}','${a.owner}');
 do $$declare t uuid;begin for i in 1..50 loop t:=gen_random_uuid();
 insert into public.turns(id,owner_id,thread_id,status) values(t,'${a.owner}','${thread}','completed');
 insert into turn_private.text_content(turn_id,owner_id,thread_id,policy_id,consent_id,locale,input_text,output_kind,output_text) values(t,'${a.owner}','${thread}','${a.policy}','${a.consent}','en',repeat('H',4000),'answered','Synthetic retained answer');
 insert into turn_private.assistant_messages(id,conversation_id,owner_id,sequence,idempotency_key,request_digest,policy_id,consent_id,locale,input_text,relationship,turn_id) values(gen_random_uuid(),'${a.conversation}','${a.owner}',i,gen_random_uuid(),'${'a'.repeat(64)}','${a.policy}','${a.consent}','en',repeat('H',4000),'independent_question',t);
 end loop;end$$;update turn_private.assistant_conversations set next_sequence=51 where id='${a.conversation}';`);
 assert.equal(JSON.parse(await db(actor(a,`select public.read_assistant_conversation_v1('${a.policy}',null);`))).messages.length,50);
 for(let i=0;i<5;i++){const page=await read(a,cursor);if(i===0)first=page;assert.equal(page.kind,'journeys_page');assert.equal(page.goals.length,20);assert.equal(page.conversationId,a.conversation);assert.equal(page.snapshot,first.snapshot);assert.equal(Object.hasOwn(page,'messages'),false);ids.push(...page.goals.map(g=>g.goalId));cursor=page.nextCursor;}
 assert.equal(cursor,null);assert.equal(new Set(ids).size,100);assert.deepEqual(ids,[...ids].sort());
 assert.ok(ids.length>50);assert.equal((await read(a,first.nextCursor)).goals[0].goalId,ids[20]);
});
test('foreign, withdrawn, changed membership and replaced latest conversation cursors return no metadata',{skip:!enabled,timeout:120000},async()=>{
 const a=await fixture(),b=await fixture();const first=await read(a);
 assert.deepEqual(await read(b,first.nextCursor),{kind:'unavailable'});
 await db(`update turn_private.assistant_goals set scope_version=2 where id='${first.goals[0].goalId}';`);assert.deepEqual(await read(a,first.nextCursor),{kind:'unavailable'});
 const current=await read(a);await db(`update turn_private.text_consents set revoked_at=now() where owner_id='${a.owner}';`);assert.deepEqual(await read(a,current.nextCursor),{kind:'unavailable'});
 const latest=await read(b);await db(`insert into turn_private.assistant_conversations(id,owner_id,policy_id,consent_id) values('${uuid()}','${b.owner}','${b.policy}','${b.consent}');`);assert.deepEqual(await read(b,latest.nextCursor),{kind:'unavailable'});
});
test('malformed/memberless cursor and over-cap source fail closed; new RPC ACL excludes anonymous/service',{skip:!enabled,timeout:120000},async()=>{
 const a=await fixture();const page=await read(a);
 const parts=page.nextCursor.split('.');parts[3]=uuid();assert.deepEqual(await read(a,parts.join('.')),{kind:'unavailable'});
 assert.deepEqual(await read(a,'bad'),{kind:'unavailable'});
 await db(`insert into turn_private.assistant_goals(id,conversation_id,owner_id,current_text) values('${uuid()}','${a.conversation}','${a.owner}','over-cap');`);assert.deepEqual(await read(a),{kind:'unavailable'});
 for(const role of ['anon','service_role']){const r=await sql(container,`set role ${role};select public.read_assistant_journeys_page_v1('${a.policy}',null);`);assert.notEqual(r.code,0);assert.match(r.stderr,/permission denied/);}
});
test('relation eligibility is live per page when Trip head/archive/deletion changes without goal-version changes',{skip:!enabled,timeout:120000},async()=>{
 const a=await fixture();const ids=JSON.parse(await db(`select jsonb_agg(id order by id) from turn_private.assistant_goals where conversation_id='${a.conversation}';`));
 const goal=ids[30],trip=uuid();await db(`insert into public.trips(id,owner_id,title,head_version) values('${trip}','${a.owner}','Owned Trip',1);`);
 await db(actor(a,`select public.set_assistant_goal_trip_link_v1('${uuid()}','${a.conversation}','${goal}',null,1,0,'link','${trip}',1,true);`));
 const first=await read(a),cursor=first.nextCursor;
 const linked=(await read(a,cursor)).goals.find(g=>g.goalId===goal);assert.equal(linked.relation.state,'linked');assert.equal(linked.relation.tripId,trip);
 await db(`update public.trips set head_version=2 where id='${trip}';`);
 const stale=(await read(a,cursor)).goals.find(g=>g.goalId===goal);assert.deepEqual(stale.relation,{state:'unknown',tripId:null,tripHeadVersion:null});
 await db(`update public.trips set head_version=1 where id='${trip}';insert into public.trip_archives(trip_id,owner_id,archived_version,idempotency_key) values('${trip}','${a.owner}',1,'${uuid()}');`);
 assert.equal((await read(a,cursor)).goals.find(g=>g.goalId===goal).relation.state,'unknown');
 await db(`set request.jwt.claims='{"session_id":"${a.session}","role":"authenticated"}';delete from public.trip_archives where trip_id='${trip}';insert into privacy_private.trip_deletions(request_id,owner_id,trip_id,expected_version) values('${uuid()}','${a.owner}','${trip}',1);`);
 assert.deepEqual(await read(a,cursor),{kind:'unavailable'});
});
