import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {createWriteStream} from 'node:fs';
import {join} from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {identityLocalEnv} from '../../identity/local-supabase.mjs';
import {nativeHTTPEnvironmentPorts} from '../../turn/native-http-ports.mjs';
import {waitForNativeAPI} from '../../identity/native-api-readiness.mjs';
import {matchesCoverageResult} from '../../../../lib/server/privacy/coverage/consumer.ts';
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
test('owned real GoTrue -> coverage route -> existing owner handler -> DB -> exact result consumer; fixture grants stay distinct from target',{
 skip:process.env.VP_DATA_COVERAGE_HTTP!=='true',timeout:300000,
},async t=>{
 const ports=nativeHTTPEnvironmentPorts(process.env),local=identityLocalEnv();assert.equal(local?.API_URL,ports.supabaseAPI);assert.match(local.DB_CONTAINER,/^supabase_db_vp-native-ask-[a-f0-9]{8}$/);
 const sql=q=>execFileSync('docker',['exec','-i',local.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1'],{input:"set statement_timeout='15s';"+q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 const key=local.PUBLISHABLE_KEY||local.ANON_KEY,users=[];let next;
 t.after(async()=>{
  if(next&&next.exitCode===null){const done=once(next,'exit');next.kill('SIGTERM');await Promise.race([done,new Promise(r=>setTimeout(r,3000))]);if(next.exitCode===null){next.kill('SIGKILL');await done;}}
  for(const user of users)sql('delete from public.trip_events where owner_id='+literal(user.id)+';delete from public.trip_audit_events where owner_id='+literal(user.id)+';delete from auth.users where id='+literal(user.id)+';');
  if(users.length)assert.equal(sql('select count(*) from auth.users where id in('+users.map(u=>literal(u.id)).join(',')+');'),'0');
 });
 const log=createWriteStream(join(process.env.VP_IDENTITY_SUPABASE_WORKDIR,'coverage-next.log'),{mode:0o600});
 next=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(ports.apiPort)],{env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:local.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key,VISEPANDA_NATIVE_LOCAL_SESSION:'true',VISEPANDA_NATIVE_LOCAL_TRIP:'true',VISEPANDA_NATIVE_LOCAL_SERVICE_KEY:local.SERVICE_ROLE_KEY,VISEPANDA_TRIP_PROTOCOL_V2:'true',DATA_COVERAGE_LOCAL:'1',COMMUNITY_INTERNAL_REVIEW:'1'},stdio:['ignore','pipe','pipe']});
 next.stdout.pipe(log);next.stderr.pipe(log);next.once('exit',()=>log.end());await waitForNativeAPI(ports.api,next);
 const path='/api/privacy/native/v1/coverage';
 const call=async(path,token,body,headers={})=>{const response=await fetch(ports.api+path,{method:body===undefined?'GET':'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)}),signal:AbortSignal.timeout(60000)});return{status:response.status,body:await response.json(),cache:response.headers.get('cache-control')};};
 async function user(){
  const auth=createClient(local.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false}}),email='vpj58-'+uuid()+'@example.test',password='VPJ58-Disposable-'+uuid()+'!';
  const signup=await auth.auth.signUp({email,password});assert.equal(signup.error,null);assert.ok(signup.data.user&&signup.data.session);const row={id:signup.data.user.id,email,password};users.push(row);
  const attemptId=uuid(),credentials=await call('/api/auth/native/v2/credentials',null,{email,password,attemptId});assert.equal(credentials.status,200);
  const login=await call('/api/auth/native/v2/login',credentials.body.accessToken,{attemptId});assert.equal(login.status,200,JSON.stringify(login.body));
  const catalog=await call(path,credentials.body.accessToken);assert.equal(catalog.status,200);assert.match(catalog.cache,/no-store/);assert.equal(catalog.body.actorId,row.id);
  return{...row,...credentials.body,catalog:catalog.body};
 }
 const owner=await user(),other=await user();
 const selection=(user,moduleId,action,command,phase='execute',tripId=null)=>({schemaVersion:user.catalog.schemaVersion,catalogVersion:user.catalog.catalogVersion,actorId:user.id,sessionId:user.catalog.sessionId,mobileEpoch:user.catalog.mobileEpoch,moduleId,moduleVersion:user.catalog.modules.find(m=>m.id===moduleId).version,operationId:command.operationId??command.requestId??uuid(),action,phase,confirmed:true,tripId,commandBytes:'\t'+JSON.stringify(command)});
 const exit=async(user,selected)=>{const raw=JSON.stringify(selected),result=await call(path,user.accessToken,raw);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(matchesCoverageResult(result.body,raw),true,JSON.stringify(result.body));return result.body;};
 assert.equal((await call(path,null)).status,401);
 assert.equal((await call(path,owner.accessToken,undefined,{Cookie:'ambiguous=1'})).status,400);
 assert.equal(sql("select has_function_privilege('authenticated','public.community_workspace(jsonb)','execute');"),'t','accepted original community RPC ACL is preserved');
 assert.equal(sql('select enabled from community_private.settings;'),'f');
 t.diagnostic('Observed accepted original community RPC ACL=true with internal feature settings=false; owner cleanup/export remains available by original contract. No new ACL or target change. Subsequent submission enables only this disposable synthetic fixture switch.');
 for(const moduleId of ['ugc','safety','publication']){
  const exported=await exit(owner,selection(owner,moduleId,'export',{action:'export'}));assert.equal(exported.state,'scoped_complete',JSON.stringify(exported));
  assert.equal(exported.result.data.actorId,owner.id);assert.equal(exported.allUserDataCompleted,false);
 }
 sql('update community_private.settings set enabled=true;');
 const submission={action:'submit',operationId:uuid(),submissionId:uuid(),contentKind:'experience',title:'Owned synthetic coverage source',content:'Synthetic explicit owner body',benefitDisclosure:'Fixture only',place:null,consent:'internal-review-v1'};
 assert.equal((await call('/api/community/native/v1',owner.accessToken,submission,{'x-community-expected-actor':owner.id,'x-community-expected-session':owner.catalog.sessionId})).status,200);
 const selected=selection(owner,'ugc','export',{action:'export'}),exported=await exit(owner,selected);assert.equal(exported.result.data.submissions[0].content,submission.content);
 assert.equal((await call(path,other.accessToken,selected)).status,409);
 const otherExport=await exit(other,selection(other,'ugc','export',{action:'export'}));assert.equal(otherExport.result.data.submissions.length,0);
 for(const moduleId of ['publication','safety','ugc']){
  const command={action:'delete',operationId:uuid(),confirmed:true},selected=selection(owner,moduleId,'delete',command),deleted=await exit(owner,selected);assert.equal(deleted.state,'scoped_complete',JSON.stringify(deleted));
  const recovered=await exit(owner,{...selected,phase:'recover'});assert.equal(recovered.state,'scoped_complete');
  assert.equal(recovered.result.data.state,'committed');assert.notEqual(deleted.requestDigest,recovered.requestDigest);
  const changed=await exit(owner,{...selected,commandBytes:JSON.stringify(command)});assert.equal(changed.state,'unavailable','same operation changed original bytes rejected');
 }
 assert.equal(sql('select content from community_private.submissions where id='+literal(submission.submissionId)+';'),'','selected owner module body erased');
 // New export-only source projection: default ACL denied, followed by one
 // explicit isolated fixture GRANT. No worker/artifact/source writer is altered.
 assert.equal(sql("select has_function_privilege('authenticated','public.privacy_coverage_module_export_v1(jsonb)','execute');"),'f');
 const noGrant=await exit(owner,selection(owner,'notifications','export',{action:'export',requestId:uuid(),confirmed:true}));assert.equal(noGrant.state,'unavailable');assert.equal(noGrant.result,null);
 sql('grant execute on function public.privacy_coverage_module_export_v1(jsonb) to authenticated;');
 const fixtureTrip=uuid(),fixtureDevice=uuid();
 sql(`insert into public.trips(id,owner_id,title) values(${literal(fixtureTrip)},${literal(owner.id)},'Synthetic lifecycle metadata fixture');
 insert into notification_private.devices(id,owner_id,session_id,epoch,revision,token,environment,topic,permission,time_zone,active)
 values(${literal(fixtureDevice)},${literal(owner.id)},${literal(owner.catalog.sessionId)},${owner.catalog.mobileEpoch},1,'aabb','sandbox','fixture.only','denied','Asia/Shanghai',false);`);
 t.diagnostic('New module owner RPC default EXECUTE denied. GRANT plus synthetic Trip/device rows exist only in this uniquely owned fixture; source-free progress and lifecycle metadata are distinct from Trip content/provider push.');
 for(const moduleId of ['notifications','lifecycle']){
  const command={action:'export',requestId:uuid(),confirmed:true},selected=selection(owner,moduleId,'export',command),bundle=await exit(owner,selected);
  assert.equal(bundle.state,'scoped_complete',JSON.stringify(bundle));assert.equal(bundle.result.data.allUserDataCompleted,false);assert.equal(bundle.result.data.expiresAt,bundle.result.data.capturedAt+30000);
  if(moduleId==='notifications') {assert.equal(bundle.result.data.sections.notifications[0].deviceId,fixtureDevice);assert.ok(!('token' in bundle.result.data.sections.notifications[0]));}
  else {assert.equal(bundle.result.data.sections.trips[0].tripId,fixtureTrip);assert.equal(bundle.result.data.sections.trips[0].title,'Synthetic lifecycle metadata fixture');assert.ok(!('content' in bundle.result.data.sections.trips[0]));}
  assert.equal((await call(path,other.accessToken,selected)).status,409);
  const foreignRequest=selection(other,moduleId,'export',command),foreign=await exit(other,foreignRequest);assert.equal(foreign.state,'unavailable');assert.equal(foreign.result,null);
  const badScope=await exit(owner,selection(owner,moduleId==='notifications'?'lifecycle':'notifications','export',command));assert.equal(badScope.state,'unavailable');assert.equal(badScope.result,null);
  assert.equal(sql('select count(*) from coverage_export_private.requests_v1 where request_id='+literal(command.requestId)+';'),'1');
 }
 const missingDelete=await exit(owner,selection(owner,'notifications','delete',{}));assert.equal(missingDelete.state,'unavailable');assert.equal(missingDelete.reason,'MODULE_DELETE_NOT_IMPLEMENTED');
 const stale={...selection(owner,'ugc','export',{action:'export'}),mobileEpoch:owner.catalog.mobileEpoch+1};assert.equal((await call(path,owner.accessToken,stale)).status,409);
 const client=createClient(local.API_URL,key,{global:{headers:{Authorization:'Bearer '+owner.accessToken}},auth:{persistSession:false,autoRefreshToken:false}});
 assert.equal((await client.rpc('native_session_v2',{p_action:'logout'})).error,null);
 assert.equal((await call(path,owner.accessToken)).status,401);
});
