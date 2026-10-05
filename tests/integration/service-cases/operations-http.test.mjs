import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {createWriteStream} from 'node:fs';
import {join} from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {identityLocalEnv} from '../identity/local-supabase.mjs';
import {nativeHTTPEnvironmentPorts} from '../turn/native-http-ports.mjs';
import {waitForNativeAPI} from '../identity/native-api-readiness.mjs';
import {serviceRequestDigest} from '../../../lib/server/service-cases/operations/http.ts';
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";

test('disposable real Auth, native HTTP, cookie staff HTTP, operations and original byte recovery',{
 skip:process.env.VP_SERVICE_OPERATIONS_HTTP!=='true',timeout:300000,
},async t=>{
 const ports=nativeHTTPEnvironmentPorts(process.env),local=identityLocalEnv();
 assert.equal(local?.API_URL,ports.supabaseAPI);assert.match(local.DB_CONTAINER,/^supabase_db_vp-native-ask-[a-f0-9]{8}$/);
 const sql=q=>execFileSync('docker',['exec','-i',local.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1'],{input:"set statement_timeout='15s';"+q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 const key=local.PUBLISHABLE_KEY||local.ANON_KEY,users=[];let next;
 t.after(async()=>{
  if(next&&next.exitCode===null){const done=once(next,'exit');next.kill('SIGTERM');await Promise.race([done,new Promise(r=>setTimeout(r,3000))]);if(next.exitCode===null){next.kill('SIGKILL');await done;}}
  if(users.length)sql('delete from auth.users where id in('+users.map(u=>literal(u.id)).join(',')+');');
 });
 const log=createWriteStream(join(process.env.VP_IDENTITY_SUPABASE_WORKDIR,'operations-next.log'),{mode:0o600});
 next=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(ports.apiPort)],{env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:local.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key,VISEPANDA_NATIVE_LOCAL_SESSION:'true',VISEPANDA_NATIVE_LOCAL_SERVICE_KEY:local.SERVICE_ROLE_KEY,VISEPANDA_NATIVE_LOCAL_TRIP:'true',VISEPANDA_TRIP_PROTOCOL_V2:'true',SERVICE_CASES_LOCAL:'1',SERVICE_CASE_OPERATIONS_LOCAL:'1'},stdio:['ignore','pipe','pipe']});
 next.stdout.pipe(log);next.stderr.pipe(log);next.once('exit',()=>log.end());await waitForNativeAPI(ports.api,next);
 const call=async(path,token,body,headers={})=>{
  const r=await fetch(ports.api+path,{method:'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};
 };
 async function user(){
  const auth=createClient(local.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false}}),email='vpj32-'+uuid()+'@example.test',password='VPJ32-Disposable-'+uuid()+'!';
  const signup=await auth.auth.signUp({email,password});assert.equal(signup.error,null,'synthetic signup');assert.ok(signup.data.user&&signup.data.session);
  const row={id:signup.data.user.id,email,password};users.push(row);
  const attemptId=uuid(),credential=await call('/api/auth/native/v2/credentials',null,{email,password,attemptId});assert.equal(credential.status,200);
  assert.equal((await call('/api/auth/native/v2/login',credential.body.accessToken,{attemptId})).status,200);
  return {...row,...credential.body,sid:JSON.parse(Buffer.from(credential.body.accessToken.split('.')[1],'base64url')).session_id};
 }
 const owner=await user(),other=await user(),staff=await user();
 const native='/api/service-cases/native/operations/v1',legacy='/api/service-cases/native/v1',ops='/api/ops/service-cases/v1';
 assert.equal((await call(native,null,{action:'workspace'})).status,401);
 assert.equal(sql("select has_function_privilege('authenticated','public.service_case_operations_v1(jsonb,text,text)','execute');"),'f');
 assert.equal((await call(native,owner.accessToken,{action:'workspace'})).status,503,'default ACL remains denied');
 assert.equal(sql('select count(*) from service_operations_private.operators;'),'0');
 sql('grant execute on function public.service_case_operations_v1(jsonb,text,text) to authenticated;');
 assert.equal((await call(native,owner.accessToken,{action:'workspace'})).body.error.code,'SERVICE_OPERATIONS_DISABLED');
 sql('update service_operations_private.settings set enabled=true;');
 t.diagnostic('Default ACL deny and empty staffing observed; subsequent cases use disposable-only explicit fixture GRANT and synthetic staffing, no target activation or provider action');
 const cookies=[];const web=createServerClient(local.API_URL,key,{cookies:{getAll:()=>cookies,setAll:rows=>{for(const c of rows){const old=cookies.findIndex(x=>x.name===c.name);if(old>=0)cookies[old]=c;else cookies.push(c);}}}});
 const established=await web.auth.setSession({access_token:staff.accessToken,refresh_token:staff.refreshToken});assert.equal(established.error,null,'cookie setup for current synthetic staff session');
 const staffHeaders=()=>({Cookie:cookies.map(c=>`${c.name}=${c.value}`).join('; '),Origin:ports.api,'x-ops-expected-actor':staff.id,'x-ops-expected-session':staff.sid});
 const staffCall=body=>call(ops,null,body,staffHeaders());
 assert.equal((await staffCall({action:'workspace'})).status,403,'unqualified session is not operator authority');
 const shift=uuid();
 sql(`insert into service_cases_private.staff(actor_id,label,active) values(${literal(staff.id)},'Synthetic employee',true);insert into service_operations_private.operators(actor_id,enabled) values(${literal(staff.id)},true);insert into service_operations_private.shifts(id,actor_id,starts_at,ends_at,enabled) values(${literal(shift)},${literal(staff.id)},clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',true);insert into service_operations_private.slots(shift_id,slot) values(${literal(shift)},1);`);
 async function createCase(problem='Synthetic service without source/Brief or supplier contact'){
  const id=uuid();assert.equal((await call(legacy,owner.accessToken,{action:'create',caseId:id,category:'general',problem})).status,200);
  assert.equal((await call(legacy,owner.accessToken,{action:'grant',caseId:id,expectedRevision:0,recipientId:staff.id,durationMinutes:15,sharedFields:['problem']})).status,200);return id;
 }
 const requestService=id=>({action:'request',operationId:uuid(),caseId:id,expectedRevision:0,grantRevision:1,urgency:'normal',trip:{kind:'unknown'}});
 const first=await createCase(),second=await createCase();
 const command=requestService(first),raw='\n'+JSON.stringify(command,null,2)+'\n';
 const sent=await call(native,owner.accessToken,raw);assert.equal(sent.status,200,JSON.stringify(sent.body));assert.equal(sent.body.data.requestDigest,serviceRequestDigest(raw));
 assert.deepEqual((await call(native,owner.accessToken,raw)).body,sent.body);
 assert.equal((await call(native,owner.accessToken,JSON.stringify(command))).status,409,'same JSON with different bytes is not a fresh command');
 assert.equal((await call(native,other.accessToken,{action:'read',caseId:first})).status,403);
 let projected=await call(native,owner.accessToken,{action:'read',caseId:first});assert.equal(projected.status,200,JSON.stringify(projected.body));
 assert.equal(projected.body.data.status,'queued');assert.equal(projected.body.data.staff,null);assert.equal(projected.body.data.brief.kind,'unknown');assert.equal(projected.body.data.sources.kind,'unknown');
 assert.equal((await call(native,owner.accessToken,requestService(second))).status,200);
 const staffInput=(action,id,revision,extra={})=>({action,operationId:uuid(),caseId:id,expectedRevision:revision,grantRevision:1,...extra});
 const accepting=staffInput('accept',first,1);
 const concurrent=await Promise.all([staffCall(accepting),staffCall({...accepting,operationId:uuid()})]);
 assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
 assert.equal((await staffCall(staffInput('accept',second,1))).status,409,'one slot cannot accept two Cases');
 projected=await call(native,owner.accessToken,{action:'read',caseId:first});assert.equal(projected.body.data.status,'accepted');assert.equal(projected.body.data.staff.actorId,staff.id);
 assert.equal((await staffCall(staffInput('assign',first,2))).status,200);
 const waiting=staffInput('update',first,3,{status:'waiting_external',evidence:[],minutes:null,proposal:null});assert.equal((await staffCall(waiting)).status,200);
 assert.equal((await call(native,owner.accessToken,{action:'read',caseId:first})).body.data.status,'waiting_external');
 const invalid=staffInput('update',first,4,{status:'resolved',evidence:[{kind:'contacted_provider',note:'Synthetic contact record only',reference:'fixture:contact',observedAt:Date.now()}],minutes:null,proposal:null});
 assert.equal((await staffCall(invalid)).status,400,'contact does not prove resolution');
 const tutorial=staffInput('update',first,4,{status:'resolved',evidence:[{kind:'tutorial',note:'Synthetic tutorial delivered',reference:'fixture:tutorial',observedAt:Date.now()}],minutes:null,proposal:null});
 assert.equal((await staffCall(tutorial)).status,200);projected=await call(native,owner.accessToken,{action:'read',caseId:first});
 assert.equal(projected.body.data.status,'resolved');assert.equal(projected.body.data.evidence[0].kind,'tutorial');assert.equal(projected.body.data.manualMinutesScope,'recorded_only');
 assert.equal(sql(`select count(*) from service_operations_private.slots where shift_id=${literal(shift)} and case_id is null;`),'1');
 const cancelled=await call(native,owner.accessToken,{action:'cancel',operationId:uuid(),caseId:second,expectedRevision:1,grantRevision:1});assert.equal(cancelled.status,200,JSON.stringify(cancelled.body));
 assert.equal((await staffCall({action:'read',caseId:second})).status,403);
 assert.equal((await call(native,owner.accessToken,{action:'read',caseId:second})).body.data.status,'cancelled');
 const third=await createCase(),pending=requestService(third),pendingBytes=JSON.stringify(pending,null,1);
 assert.equal((await call(native,owner.accessToken,{action:'read_operation',operationId:pending.operationId})).body.data.receipt,null);
 const abandoned=await call(native,owner.accessToken,{action:'abandon',operationId:pending.operationId,mutationBytes:pendingBytes});assert.equal(abandoned.status,200,JSON.stringify(abandoned.body));assert.equal(abandoned.body.data.outcome,'cancelled');
 const fenced=await call(native,owner.accessToken,pendingBytes);assert.equal(fenced.status,200);assert.equal(fenced.body.data.outcome,'cancelled','original command returns its permanent abandonment fence, never applies');
 const fourth=await createCase(),r4=requestService(fourth);assert.equal((await call(native,owner.accessToken,r4)).status,200);
 assert.equal((await call(legacy,owner.accessToken,{action:'revoke',caseId:fourth,expectedRevision:1})).status,200);
 assert.equal((await staffCall({action:'read',caseId:fourth})).status,403);
 assert.equal((await call(native,owner.accessToken,{action:'read_operation',operationId:r4.operationId})).status,410,'erasure is not receipt absence');
 sql(`update service_operations_private.operators set enabled=false where actor_id=${literal(staff.id)};`);
 assert.equal((await staffCall({action:'workspace'})).status,403);
 assert.equal(sql('select count(*) from public.trips;'),'0','service commands wrote no Trip');
 assert.equal(sql('select count(*) from public.trip_proposals;'),'0','service commands fabricated no Proposal');
});
