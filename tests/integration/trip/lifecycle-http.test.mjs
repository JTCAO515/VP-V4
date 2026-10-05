import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as uuid } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { identityLocalEnv } from '../identity/local-supabase.mjs';
import { nativeHTTPEnvironmentPorts } from '../turn/native-http-ports.mjs';
import { waitForNativeAPI } from '../identity/native-api-readiness.mjs';
import { webTripResult } from '../artifacts/fixtures/web-trip-result.mjs';
import { lifecycleDigest } from '../../../lib/server/trip/lifecycle/operations.ts';
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";

test('real disposable Auth → HTTP → atomic lifecycle → saved reads, original Memory and unknown ACK recovery',{
 skip:process.env.VP_TRIP_LIFECYCLE_HTTP!=='true',timeout:240000,
},async t=>{
 const ports=nativeHTTPEnvironmentPorts(process.env),local=identityLocalEnv();
 assert.equal(local?.API_URL,ports.supabaseAPI);assert.match(local.DB_CONTAINER,/^supabase_db_vp-native-ask-[a-f0-9]{8}$/);
 const sql=q=>execFileSync('docker',['exec','-i',local.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1'],{input:"set statement_timeout='10s';"+q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 const key=local.PUBLISHABLE_KEY||local.ANON_KEY,users=[];let next;
 const cleanup=async()=>{
  if(next&&next.exitCode===null){const exited=once(next,'exit');next.kill('SIGTERM');await Promise.race([exited,new Promise(r=>setTimeout(r,3000))]);if(next.exitCode===null){next.kill('SIGKILL');await exited;}}
  if(users.length)sql('delete from auth.users where id in('+users.map(u=>literal(u.id)).join(',')+');');
 };
 t.after(cleanup);
 for(let n=0;n<2;n++){
  const auth=createClient(local.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false}}),email='vpj61-'+uuid()+'@example.test',password='VPJ61-Disposable-Only-'+uuid()+'!';
  const signup=await auth.auth.signUp({email,password});assert.equal(signup.error,null,'synthetic signup');assert.ok(signup.data.user&&signup.data.session);users.push({id:signup.data.user.id,email,password,client:auth,session:signup.data.session});
 }
 const log=createWriteStream(join(process.env.VP_IDENTITY_SUPABASE_WORKDIR,'lifecycle-next.log'),{mode:0o600});
 next=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(ports.apiPort)],{env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:local.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key,VISEPANDA_NATIVE_LOCAL_SESSION:'true',VISEPANDA_NATIVE_LOCAL_SERVICE_KEY:local.SERVICE_ROLE_KEY,VISEPANDA_NATIVE_LOCAL_TRIP:'true',VISEPANDA_TRIP_PROTOCOL_V2:'true'},stdio:['ignore','pipe','pipe']});
 next.stdout.pipe(log);next.stderr.pipe(log);next.once('exit',()=>log.end());await waitForNativeAPI(ports.api,next);
 const call=async(path,token,method='GET',body,extra={})=>{
  const r=await fetch(ports.api+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...extra},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
  return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};
 };
 const login=async user=>{
  const attemptId=uuid(),credential=await call('/api/auth/native/v2/credentials',null,'POST',{email:user.email,password:user.password,attemptId});assert.equal(credential.status,200);
  assert.equal((await call('/api/auth/native/v2/login',credential.body.accessToken,'POST',{attemptId})).status,200);return credential.body.accessToken;
 };
 const owner=await login(users[0]),other=await login(users[1]),base='/api/trips/native/v2/lifecycle';
 assert.equal((await call(base)).status,401);
 assert.equal(sql("select has_function_privilege('authenticated','public.trip_lifecycle_v1(text,jsonb,text)','execute');"),'f');
 const inactive=await call(base,owner);assert.equal(inactive.status,503);assert.deepEqual(inactive.body,{error:{code:'UNAVAILABLE'}},'default ACL is not runtime activation');
 // Main-authorized qualification only in this uniquely owned disposable database.
 // It is intentionally absent from the migration, target environment and release.
 sql('grant execute on function public.trip_lifecycle_v1(text,jsonb,text) to authenticated;');
 t.diagnostic('DEFAULT_RPC_DENY_PASS; following Auth/HTTP cases use explicit disposable-only qualification grant, not target activation');
 const read=async(token=owner)=>{const r=await call(base,token);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.serviceStatus,'unavailable');return r.body;};
 let view=await read();assert.deepEqual(view.capacity,{draftCount:0,draftLimit:3,activeTripId:null,activeLimit:1,legacyCount:0});assert.equal(view.ownerId,users[0].id);
 const command=(action,tripId,extra={})=>({action,operationId:uuid(),expectedRevision:view.revision,expectedActiveTripId:view.capacity.activeTripId,expectedSessionId:view.sessionId,confirmed:true,tripId,...extra});
 const mutate=async cmd=>{const raw='\n'+JSON.stringify(cmd,null,2)+'\n',r=await call(base,owner,'POST',raw);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.requestDigest,lifecycleDigest(raw));return {raw,...r};};
 const trips=[];
 for(let n=0;n<3;n++){view=await read();const id=uuid(),r=await mutate(command('create',id,{title:'Own new Trip '+n}));assert.equal(r.body.status,'applied');trips.push(id);}
 view=await read();const blocked=command('create',uuid(),{title:'Over capacity'}),no=await mutate(blocked);assert.equal(no.body.status,'declined');assert.equal(no.body.reason,'TRIP_CAPACITY');
 assert.deepEqual((await call(base,owner,'POST',no.raw)).body,no.body);
 assert.equal((await call(base,owner,'POST',JSON.stringify(blocked))).status,409,'same op different bytes');
 assert.deepEqual((await call(base+'/operations/'+blocked.operationId,owner)).body.receipt,no.body);
 assert.equal(sql('select count(*) from public.trips where owner_id='+literal(users[0].id)+';'),'3');
 const confirm=async id=>{
  const proposal=await call('/api/trips/native/v2/'+id+'/proposal',owner,'POST',{patch:{expectedVersion:0,operations:[{kind:'upsert_day',dayId:'OldDay',date:'2026-01-01',timeZone:'Asia/Shanghai'}]}});assert.equal(proposal.status,201,JSON.stringify(proposal.body));
  const review=await call('/api/trips/native/v2/'+id+'/proposal',owner);assert.equal(review.status,200);const p=review.body.proposal;
  const done=await call('/api/trips/native/v2/'+id+'/confirm',owner,'POST',{proposalId:p.id,idempotencyKey:uuid(),digest:p.digest});assert.equal(done.status,200,JSON.stringify(done.body));
 };
 await confirm(trips[0]);view=await read();assert.equal(view.trips.find(t=>t.tripId===trips[0]).state,'draft','past dates never imply Active/archive');
 const active=await mutate(command('activate',trips[0],{expectedHeadVersion:1}));assert.equal(active.body.status,'applied');assert.equal(active.body.capacity.activeTripId,trips[0]);
 view=await read();const newId=uuid(),nextTrip=await mutate(command('create',newId,{title:'Empty next Trip'}));assert.equal(nextTrip.body.status,'applied');
 const empty=await call('/api/trips/native/v2/'+newId,owner);assert.equal(empty.status,200);assert.equal(empty.body.trip.headVersion,0);assert.equal(empty.body.content.days.length,0,'old dates/items not copied');
 assert.equal((await call('/api/trips/native/v2',owner,'POST',{tripId:uuid(),title:'Old API capacity bypass'})).status>=400,true);
 view=await read();const abandonCommand=command('create',uuid(),{title:'Cancel before delayed create'}),abandonRaw=JSON.stringify(abandonCommand);
 const cancelled=await call(base+'/operations/'+abandonCommand.operationId+'/abandon',owner,'POST',abandonRaw);assert.equal(cancelled.status,200);assert.equal(cancelled.body.reason,'USER_ABANDONED');
 assert.deepEqual((await call(base,owner,'POST',abandonRaw)).body,cancelled.body);assert.equal((await read()).capacity.draftCount,3);
 const memoryBase='/api/memory/native/v1/profiles',consent=await call(memoryBase,owner,'POST',{action:'consentCreate',operationId:uuid()});assert.equal(consent.status,200);
 const memory={action:'create',operationId:uuid(),memoryId:uuid(),receiptId:uuid(),consentId:consent.body.receipt.consentId,constraintKind:'preference',summary:'Explicit quiet restaurants',saveLongTerm:true};
 const saved=await call(memoryBase,owner,'POST',memory);assert.equal(saved.status,200);
 const ref={memoryId:memory.memoryId,revision:1,sourceReceiptId:memory.receiptId,consentId:memory.consentId};
 view=await read();const ended=command('archive',trips[0],{expectedHeadVersion:1,preference:{action:'keep',memoryRefs:[ref]}}),archive=await mutate(ended);assert.equal(archive.body.status,'applied');assert.equal(archive.body.preference,'kept');
 assert.deepEqual((await call(base+'/operations/'+ended.operationId,owner)).body.receipt,archive.body,'unknown ACK recovered by original op');
 const kept=await call(memoryBase,owner);assert.equal(kept.body.profiles.find(m=>m.id===memory.memoryId).revision,1,'archive does not resave or regrant Memory');
 const archiveRead=await call('/api/trips/native/v2/'+trips[0],owner);assert.equal(archiveRead.status,200);assert.equal(archiveRead.body.content.days[0].date,'2026-01-01','archive retains results');
 assert.equal((await call(base+'/operations/'+ended.operationId,other)).body.receipt,null,'foreign owner receives no receipt');
 assert.equal((await call('/api/trips/native/v2/'+trips[0],other)).status,403);
 const forgotten=await call(memoryBase,owner,'POST',{action:'state',operationId:uuid(),memoryId:memory.memoryId,sourceReceiptId:memory.receiptId,expectedRevision:1,state:'deleted'});assert.equal(forgotten.status,200);
 assert.equal((await call(base+'/operations/'+ended.operationId,owner)).status,409,'Memory forgetting erases replayable selection');
 assert.equal(sql('select count(*) from trip_lifecycle_private.operations_v1 where owner_id='+literal(users[0].id)+' and operation_id='+literal(ended.operationId)+' and request_bytes is null and receipt is null;'),'1');
 const webSession=users[1].session,cookie='sb-'+new URL(local.API_URL).hostname.split('.')[0]+'-auth-token=base64-'+Buffer.from(JSON.stringify(webSession)).toString('base64url');
 const web=await call('/api/trips/lifecycle',null,'GET',undefined,{cookie});assert.equal(web.status,200,JSON.stringify(web.body));assert.equal(web.body.ownerId,users[1].id);assert.equal(web.body.capacity.draftCount,0);
 assert.equal((await call('/api/trips/lifecycle',owner)).status,400,'cookie endpoint rejects bearer');
 const webCmd={action:'create',operationId:uuid(),expectedRevision:web.body.revision,expectedActiveTripId:null,expectedSessionId:web.body.sessionId,confirmed:true,tripId:uuid(),title:'Web empty next'};
 assert.equal((await call('/api/trips/lifecycle',null,'POST',webCmd,{cookie,Origin:'https://foreign.invalid'})).status,403);
 const webCreated=await call('/api/trips/lifecycle',null,'POST',webCmd,{cookie,Origin:ports.api});assert.equal(webCreated.status,200,JSON.stringify(webCreated.body));assert.equal(webCreated.body.status,'applied');
 const webOp=await call('/api/trips/lifecycle/operations/'+webCmd.operationId,null,'GET',undefined,{cookie});assert.equal(webOp.status,200);assert.deepEqual(webOp.body.receipt,webCreated.body);
 // Reuse the accepted original publisher fixture; it records synthetic source
 // data and completed task output without contacting or dispatching any provider.
 const savedResult=await webTripResult(local,sql,{owner:users[1].id,client:users[1].client});
 for(const version of [1,2]){
  const before=await call('/api/results/native/v'+version+'/trip?tripId='+savedResult.trip,other);assert.equal(before.status,200);assert.equal(before.body.data.artifactId,savedResult.artifact);assert.equal(Object.hasOwn(before.body.data,'archiveHistorical'),false);
 }
 const resultView=await read(other),archiveResult={action:'archive',operationId:uuid(),expectedRevision:resultView.revision,expectedActiveTripId:resultView.capacity.activeTripId,expectedSessionId:resultView.sessionId,confirmed:true,tripId:savedResult.trip,expectedHeadVersion:1,preference:{action:'skip'}};
 const resultEnded=await call(base,other,'POST',archiveResult);assert.equal(resultEnded.status,200);assert.equal(resultEnded.body.status,'applied');
 for(const version of [1,2]){
  const ref=await call('/api/results/native/v'+version+'/trip?tripId='+savedResult.trip,other);assert.equal(ref.status,200);assert.equal(ref.body.data.archiveHistorical,true);assert.equal(ref.body.data.artifactId,savedResult.artifact);
  const body=await call('/api/results/native/v'+version+'?artifactId='+savedResult.artifact+'&revision=1',other);assert.equal(body.status,200);assert.equal(body.body.data.current,false);assert.equal(body.body.data.historicalReadable,true);assert.equal(body.body.data.source.tripId,savedResult.trip);
 }
 const webSaved=await call('/api/trips/'+savedResult.trip+'/comparison-result',null,'GET',undefined,{cookie});assert.equal(webSaved.status,200);assert.equal(webSaved.body.data.current,false);assert.equal(webSaved.body.data.artifactId,savedResult.artifact);
 // Revoke original source consent: the historical marker never bypasses it.
 const revoked=await users[1].client.rpc('withdraw_text_policy',{p_policy_id:savedResult.policy});assert.ifError(revoked.error);
 for(const version of [1,2]){
  const ref=await call('/api/results/native/v'+version+'/trip?tripId='+savedResult.trip,other);assert.equal(ref.status,200);assert.equal(ref.body.data.kind,'unavailable');
  const body=await call('/api/results/native/v'+version+'?artifactId='+savedResult.artifact+'&revision=1',other);assert.equal(body.status,200);assert.equal(body.body.data.kind,'unavailable');
 }
 const old=owner;await login(users[0]);assert.equal((await call(base,old)).status,401);assert.equal((await call(base+'/operations/'+blocked.operationId,old)).status,401);
 assert.equal(sql('select count(*) from public.model_budget_attempts;'),'0');
 t.diagnostic('LIFECYCLE_REAL_AUTH_HTTP_SQL_PASS; synthetic disposable owners; zero model/provider/budget requests; no target migration or real user export/delete');
});
