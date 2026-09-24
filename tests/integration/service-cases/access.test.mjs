import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {identityLocalEnv} from '../identity/local-supabase.mjs';

test('CaseRequest and limited AccessGrant through real local identity, HTTP and PostgreSQL', {skip:process.env.VP_OPS_LOCAL_INTEGRATION!=='true',timeout:240000}, async t => {
 const env=identityLocalEnv();
 assert.match(env.DB_CONTAINER,/^supabase_db_vp-service-cases-/);
 const key=env.PUBLISHABLE_KEY||env.ANON_KEY;
 const sql=input=>execFileSync('docker',['exec','-i',env.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 const admin=createClient(env.API_URL,env.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const api='http://127.0.0.1:'+process.env.VP_OPS_API_PORT;
 const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',new URL(api).port],{env:{...process.env,SERVICE_CASES_LOCAL:'1',VISEPANDA_NATIVE_LOCAL_SESSION:'true',NEXT_PUBLIC_SUPABASE_URL:env.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key,VISEPANDA_NATIVE_LOCAL_SERVICE_KEY:env.SERVICE_ROLE_KEY},stdio:['ignore','pipe','pipe']});
 const log=createWriteStream('/tmp/vpj57-api.log');server.stdout.pipe(log);server.stderr.pipe(log);
 t.after(async()=>{const done=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await done;log.end();});
 for(let i=0;i<150;i++){try{const r=await fetch(api+'/api/service-cases/native/v1',{method:'POST'});if(r.status===401)break;}catch{}await new Promise(r=>setTimeout(r,300));}
 async function actor(staff=false){
  const email='case-'+randomUUID()+'@example.test',password='Synthetic-'+randomUUID();
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{staff:true}});assert.equal(created.error,null);
  const attemptId=randomUUID();
  const credentials=await fetch(api+'/api/auth/native/v2/credentials',{method:'POST',body:JSON.stringify({email,password,attemptId})});
  assert.equal(credentials.status,200);const auth=await credentials.json();
  const login=await fetch(api+'/api/auth/native/v2/login',{method:'POST',headers:{Authorization:'Bearer '+auth.accessToken},body:JSON.stringify({attemptId})});assert.equal(login.status,200);
  if(staff)sql(`insert into service_cases_private.staff(actor_id,label,active) values('${auth.subject}','Synthetic employee',true);`);
  return {...auth,client:createClient(env.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+auth.accessToken}}})};
 }
 const owner=await actor(),other=await actor(),first=await actor(true),second=await actor(true);
 const call=async(who,input,headers={})=>{const r=await fetch(api+'/api/service-cases/native/v1',{method:'POST',headers:{...(who?{Authorization:'Bearer '+who.accessToken}:{}),...headers},body:JSON.stringify(input)});return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};};
 const cid=randomUUID(); const create={action:'create',caseId:cid,category:'transport',problem:'Synthetic missed connection; no Trip data.'};
 let rev=0;
 const grant=(who=first,revision=rev)=>({action:'grant',caseId:cid,expectedRevision:revision,recipientId:who.subject,durationMinutes:15,sharedFields:['problem']});
 const read=(who,revision=rev)=>call(who,{action:'read',caseId:cid,expectedRevision:revision});
 await t.test('private creation, replay, no automatic employee access, strict fields',async()=>{
  assert.equal((await call(null,create)).status,401);
  assert.equal((await call(owner,create,{Origin:api})).status,400);
  assert.equal((await call(owner,{...create,ownerId:other.subject})).status,400);
  const a=await call(owner,create);assert.equal(a.status,200,JSON.stringify(a.body));assert.equal(a.body.data.accepted,false);assert.equal(a.body.data.grantState,'revoked');assert.match(a.cache,/no-store/);
  assert.deepEqual((await call(owner,create)).body,a.body);
  assert.equal((await call(owner,{...create,problem:'changed replay'})).status,409);
  assert.equal((await call(other,create)).status,403);
  assert.equal((await read(first)).status,403);
  assert.equal((await call(other,{action:'list'})).body.data.cases.length,0);
  assert.equal((await call(owner,{action:'create',caseId:randomUUID(),category:'general',problem:'General support without any grant'})).status,200);
 });
 await t.test('minimal exact preview fields, named recipient, revision replacement and expired access',async()=>{
  assert.equal((await call(owner,{...grant(),sharedFields:['problem','profile']})).status,400);
  assert.equal((await call(owner,grant(other))).status,403);
  let response=await call(owner,grant());assert.equal(response.status,200,JSON.stringify(response.body));rev++;
  let r=await read(first);assert.equal(r.status,200);assert.equal(r.body.data.problem,create.problem);assert.deepEqual(Object.keys(r.body.data).sort(),['accepted','caseId','expiresAt','grantRevision','problem','status']);
  assert.equal((await read(second)).status,403);assert.equal((await read(other)).status,403);
  assert.equal((await call(other,grant())).status,403);
  assert.equal((await call(owner,grant(second))).status,200);rev++;
  assert.equal((await read(first)).status,403);assert.equal((await read(second)).status,200);
  assert.equal((await read(second,rev-1)).status,403);
  assert.equal((await call(owner,grant(first,rev-1))).status,409);
  sql(`update service_cases_private.cases set expires_at=clock_timestamp()-interval '1 second' where id='${cid}';`);
  assert.equal((await read(second)).status,403);
  assert.equal((await call(owner,{action:'list'})).body.data.cases.find(x=>x.caseId===cid).grantState,'expired');
 });
 await t.test('revoke and stale grant replay cannot resurrect access; live staff removal',async()=>{
  assert.equal((await call(owner,grant(first))).status,200);rev++;
  const prior=grant(first,rev-1);
  assert.equal((await call(owner,{action:'revoke',caseId:cid,expectedRevision:rev})).status,200);rev++;
  assert.equal((await read(first)).status,403);assert.equal((await call(owner,prior)).status,409);
  assert.equal((await call(owner,grant(first))).status,200);rev++;
  sql(`update service_cases_private.staff set active=false where actor_id='${first.subject}';`);
  assert.equal((await read(first)).status,403);
  assert.ok((await first.client.rpc('service_case_v1',{p_input:{action:'read',caseId:cid,expectedRevision:rev}})).error,'direct RPC denies removed employee');
 });
 await t.test('anonymous direct RPC rejected and historical grants remain paged',async()=>{
  const anon=createClient(env.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false}});
  // Synthetic JWT context exercises the public DB entry point independently of HTTP.
  const sessionId=JSON.parse(Buffer.from(owner.accessToken.split('.')[1],'base64url')).session_id;
  const result=sql(`begin; set local role authenticated; select set_config('request.jwt.claims','{"sub":"${owner.subject}","session_id":"${sessionId}","role":"authenticated","is_anonymous":true}',true); do $$ begin perform public.service_case_v1('{"action":"list"}'); raise exception 'anonymous bypass'; exception when others then if sqlerrm <> 'UNAUTHENTICATED' then raise; end if; end $$; rollback;`);
  assert.ok(result.includes('true'));
  assert.ok((await anon.rpc('service_case_v1',{p_input:{action:'list'}})).error);
  for(let i=0;i<51;i++)assert.equal((await call(owner,{...create,caseId:randomUUID(),problem:'Synthetic page '+i})).status,200);
  const firstPage=await call(owner,{action:'list'}),secondPage=await call(owner,{action:'list',offset:50});
  assert.equal(firstPage.body.data.cases.length,50);
  assert.ok(secondPage.body.data.cases.some(x=>x.caseId===cid));
 });
 await t.test('atomic audit rollback, direct table denial and session revocation',async()=>{
  sql("create function service_cases_private.fail_audit() returns trigger language plpgsql as $$ begin raise exception 'synthetic'; end $$; create trigger fail_audit before insert on service_cases_private.audit for each row execute function service_cases_private.fail_audit();");
  assert.equal((await call(owner,grant(second))).status,503);
  assert.equal(sql(`select revision from service_cases_private.cases where id='${cid}';`),String(rev));
  sql('drop trigger fail_audit on service_cases_private.audit; drop function service_cases_private.fail_audit();');
  assert.ok((await owner.client.schema('service_cases_private').from('cases').select('*')).error);
  assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='service_cases_private' and c.relkind='r' and not c.relrowsecurity;"),'0');
  assert.equal((await call(owner,grant(second))).status,200);rev++;
  sql(`delete from auth.sessions where user_id='${second.subject}';`);
  assert.equal((await read(second)).status,401);
 });
});
