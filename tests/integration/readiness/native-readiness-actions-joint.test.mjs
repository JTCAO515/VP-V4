// Actual current SQL + production Native HTTP. Admin SQL transport and synthetic
// signed Auth prove composition; default authenticated ACL denial remains explicit.
import test from 'node:test';import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';import {readFileSync,readdirSync} from 'node:fs';
import {NextRequest} from 'next/server.js';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
import {nativeFixture,subject,sessionId} from '../../contract/identity/native-fixture.ts';
import {readinessTaskReferenceHTTP} from '../../../lib/server/readiness/task-reference-http.ts';
import {readinessActionsHTTP} from '../../../lib/server/readiness/actions-http.ts';
const enabled=process.env.VP_TURN_DB_TEST==='1',literal=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
test('actual SQL declaration/current date/source permissions survive Native HTTP read/save/lost-ACK retry; no task or Trip writer',{skip:!enabled,timeout:120000},async t=>{
 const container='vpj21-http-'+uuid().slice(0,8);let created=false;
 const db=async q=>{const result=await sql(container,q);assert.equal(result.code,0,result.stderr);return result.stdout.trim();};
 const a={owner:subject,session:sessionId,trip:uuid(),task:uuid(),thread:uuid(),turn:uuid(),policy:uuid(),conversation:uuid(),goal:uuid(),message:uuid(),followup:uuid()};
 const claims=`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${subject}';set request.jwt.claims='${JSON.stringify({role:'authenticated',is_anonymous:false,session_id:sessionId})}';`;
 try{
  const started=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
  assert.equal(started.code,0,started.stderr);created=true;
  for(let i=0;i<100;i++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(resolve=>setTimeout(resolve,100));}
  await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
  await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
  for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db('begin;'+readFileSync('supabase/migrations/'+file,'utf8')+'commit;');
  await db(`insert into auth.users(id) values('${subject}');insert into auth.sessions(id,user_id) values('${sessionId}','${subject}');insert into identity_private.mobile_accounts(owner_id,epoch,session_id) values('${subject}',1,'${sessionId}');insert into identity_private.mobile_attempts values('${subject}','${uuid()}','${sessionId}',1);${claims}
   insert into public.trips(id,owner_id,title) values('${a.trip}','${subject}','Synthetic owned Trip');
   insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at) values('${a.policy}','qwen','synthetic','https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions','local','local','local','test','test','${'a'.repeat(64)}','合成','Synthetic','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day');
   insert into turn_private.text_consents(owner_id,policy_id) values('${subject}','${a.policy}');
   select public.submit_assistant_message_v1('${a.conversation}','${a.message}','${uuid()}','${a.policy}','en','Existing goal','goal_start','${a.goal}',null,null,null,null);
   select public.set_assistant_goal_trip_link_v1('${uuid()}','${a.conversation}','${a.goal}','${a.message}',1,0,'link','${a.trip}',0,true);
   select public.submit_service_task_turn('${a.thread}','${a.turn}','${uuid()}','${a.policy}','en','Existing Task','${a.task}',1,'new_goal',null);
   select public.submit_assistant_message_v1('${a.conversation}','${a.followup}','${uuid()}','${a.policy}','en','Explicit follow up','follow_up','${a.goal}',2,'${a.task}','${a.message}',null);
   update public.turns set status='completed' where id='${a.turn}';update turn_private.work set state='completed',lease_token=null,expires_at=null where turn_id='${a.turn}';update turn_private.text_content set output_kind='answered',output_text='Synthetic completed answer' where turn_id='${a.turn}';`);
  const database='https://dzqdzetcctkhbrhlxxgn.supabase.co',host='vp-v4-readinessjoint-jtcao515s-projects.vercel.app';
  const auth=await nativeFixture(t,database),env={VERCEL_ENV:'preview',VERCEL_URL:host,VISEPANDA_NATIVE_STAGING:'true',VISEPANDA_TRIP_PROTOCOL_V2:'true',KNOWLEDGE_STAGING_READ:'1',VISEPANDA_NATIVE_STAGING_TEXT:'true',VISEPANDA_NATIVE_STAGING_TEXT_POLICY:a.policy,NEXT_PUBLIC_SUPABASE_URL:database,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:auth.config.publishableKey};
  const previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
  t.after(()=>{for(const[k,v]of Object.entries(previous))v===undefined?delete process.env[k]:process.env[k]=v;});
  const prior=globalThis.fetch;let deny=false,lost=false,saveCalls=0;const seen=[];
  t.mock.method(globalThis,'fetch',async(input,init)=>{
   const request=new Request(input,init),path=new URL(request.url).pathname;
   if(!path.startsWith('/rest/v1/rpc/'))return prior(input,init);
   const name=path.split('/').at(-1),params=await request.json();seen.push(name);
   assert.ok(['native_session_v2','read_readiness_declarations_v1','save_readiness_declaration_v1','knowledge_answer_v1','read_task_result_reference_v2','read_trip_result_reference_v2','read_journeys_goal_index_v1','list_assistant_conversation_tasks_v1'].includes(name));
   const query=(deny&&name.includes('readiness')?'set role authenticated;':'')+claims+`select public.${name}(${Object.entries(params).map(([key,value])=>key+' => '+literal(value)).join(',')});`;
   const executed=await sql(container,query);
   if(executed.code!==0)return Response.json({message:executed.stderr,code:'42501'},{status:403});
   if(name==='save_readiness_declaration_v1'){saveCalls++;if(lost){lost=false;throw Error('Synthetic lost save ACK');}}
   return Response.json(JSON.parse(executed.stdout.trim()));
  });
  const common={schemaVersion:'readiness-request/2',taskId:a.task,expectedTripVersion:0,scenario:'connectivity',city:'shanghai',locale:'en',subjectId:null};
  const request=body=>new NextRequest(`https://${host}/api/trips/native/v2/${a.trip}/readiness/actions`,{method:'POST',headers:{authorization:'Bearer '+auth.token},body:JSON.stringify(body)});
  const initial=await readinessActionsHTTP(request({...common,operation:'read'}),a.trip,true);assert.equal(initial.status,200);const first=(await initial.json()).data;
  assert.equal(first.declarationState,'empty');assert.equal(first.userReadiness,'unknown');assert.equal(first.basis.taskId,a.task);
  const save={...common,operation:'save',operationId:uuid(),expectedRevision:0,expectedBasis:first.basis,declaration:{scenario:'connectivity',city:'shanghai',locale:'en',subjectId:null,applies:'no',resourcesReady:'unknown',conditionsChecked:'unknown',checkAt:'now'}};
  lost=true;assert.equal((await readinessActionsHTTP(request(save),a.trip,true)).status,503);
  const retry=await readinessActionsHTTP(request(save),a.trip,true);assert.equal(retry.status,200);const saved=(await retry.json()).data;
  assert.equal(saved.declarationRevision,1);assert.equal(saved.userReadiness,'not_applicable');assert.equal(saveCalls,2);
  const reloaded=(await (await readinessActionsHTTP(request({...common,operation:'read'}),a.trip,true)).json()).data;assert.equal(reloaded.declarationRevision,1);assert.equal(reloaded.declaration.applies,'no');
  const webBody={...common,operation:'save',scenario:'payment',operationId:uuid(),expectedRevision:1,expectedBasis:saved.basis,declaration:{scenario:'payment',city:'shanghai',locale:'en',subjectId:null,applies:'yes',resourcesReady:'yes',conditionsChecked:'yes',checkAt:'now'}};
  const webRequest=new NextRequest(`https://${host}/api/trips/${a.trip}/readiness/actions`,{method:'POST',headers:{cookie:auth.cookie(),origin:'https://'+host},body:JSON.stringify(webBody)});
  const web=await readinessActionsHTTP(webRequest,a.trip,false);assert.equal(web.status,200);
  const webSaved=(await web.json()).data;assert.equal(webSaved.declarationRevision,2);assert.equal(webSaved.userReadiness,'unknown');
  const nativeAfterWeb=(await (await readinessActionsHTTP(request({...common,operation:'read'}),a.trip,true)).json()).data;assert.equal(nativeAfterWeb.declarationRevision,2);
  deny=true;assert.equal((await readinessActionsHTTP(request({...common,operation:'read'}),a.trip,true)).status,503);deny=false;
  const patch={expectedVersion:0,operations:[{kind:'upsert_day',dayId:'actual_day',date:'2026-10-12',timeZone:'Asia/Shanghai'}]};
  const proposed=JSON.parse(await db(claims+`select row_to_json(p) from public.create_trip_proposal_patch('${a.trip}',${literal(patch)}) p;`));
  const proposedDigest=await db(claims+`select digest from public.read_trip_proposal_v2('${proposed.proposal_id}');`);
  assert.equal(await db(claims+`select outcome from public.confirm_and_apply_trip_proposal('${proposed.proposal_id}','${uuid()}','${proposedDigest}');`),'applied');
  const discoverRequest=()=>new NextRequest(`https://${host}/api/trips/native/v2/${a.trip}/readiness/task`,{headers:{authorization:'Bearer '+auth.token}});
  const discovered=await readinessTaskReferenceHTTP(discoverRequest(),a.trip,true);assert.equal(discovered.status,200);
  const options=(await discovered.json()).data;assert.equal(options.kind,'readiness_task_options/1');assert.equal(options.options.length,1);assert.equal(options.options[0].taskId,a.task);assert.equal(options.options[0].tripVersion,1);
  const changed=(await (await readinessActionsHTTP(request({...common,expectedTripVersion:1,operation:'read'}),a.trip,true)).json()).data;
  assert.equal(changed.declarationState,'stale');assert.equal(changed.declaration.applies,'unknown');
  const secondTask=uuid(),secondThread=uuid(),secondTurn=uuid();
  await db(claims+`select public.submit_service_task_turn('${secondThread}','${secondTurn}','${uuid()}','${a.policy}','en','Second actual task','${secondTask}',1,'new_goal',null);
   select public.submit_assistant_message_v1('${a.conversation}','${uuid()}','${uuid()}','${a.policy}','en','Second member','follow_up','${a.goal}',2,'${secondTask}','${a.followup}',null);
   update public.turns set status='completed' where id='${secondTurn}';update turn_private.work set state='completed',lease_token=null,expires_at=null where turn_id='${secondTurn}';update turn_private.text_content set output_kind='answered',output_text='Synthetic answer' where turn_id='${secondTurn}';`);
  const multiple=(await (await readinessTaskReferenceHTTP(discoverRequest(),a.trip,true)).json()).data;
  assert.equal(multiple.kind,'readiness_task_options/1');assert.equal(multiple.options.length,2);
  await db(`update turn_private.text_consents set revoked_at=now() where owner_id='${subject}';`);
  assert.equal((await readinessActionsHTTP(request({...common,operation:'read'}),a.trip,true)).status,403);
  assert.equal((await (await readinessTaskReferenceHTTP(discoverRequest(),a.trip,true)).json()).data.kind,'unavailable');
  assert.equal(await db(`select count(*) from turn_private.service_tasks where owner_id='${subject}';`),'2');assert.equal(await db(`select head_version from public.trips where id='${a.trip}';`),'1');
  assert.ok(!seen.some(name=>name.includes('create_trip')||name.includes('confirm')||name.includes('submit')));
 }finally{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);}
});
