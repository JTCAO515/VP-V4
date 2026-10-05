import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID as uuid} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';import {once} from 'node:events';import {createWriteStream,mkdirSync,writeFileSync} from 'node:fs';import {join} from 'node:path';
import {createClient} from '@supabase/supabase-js';import {createServerClient} from '@supabase/ssr';
import {identityLocalEnv} from '../identity/local-supabase.mjs';import {nativeHTTPEnvironmentPorts} from '../turn/native-http-ports.mjs';import {waitForNativeAPI} from '../identity/native-api-readiness.mjs';
import {decodeCommunityOutcome,decodeCommunityItem} from '../../../lib/server/community/contract.ts';
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
test('owned real Auth/HTTP J1: registered submission, independent Cookie review, current result, withdraw, original bytes, abandon and scoped privacy',{
 skip:process.env.VP_COMMUNITY_J1_HTTP!=='true',timeout:300000,
},async t=>{
 const ports=nativeHTTPEnvironmentPorts(process.env),local=identityLocalEnv();assert.equal(local?.API_URL,ports.supabaseAPI);assert.match(local.DB_CONTAINER,/^supabase_db_vp-native-ask-[a-f0-9]{8}$/);
 const sql=q=>execFileSync('docker',['exec','-i',local.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1'],{input:"set statement_timeout='15s';"+q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 const key=local.PUBLISHABLE_KEY||local.ANON_KEY,users=[];let next;
 t.after(async()=>{
  if (next && next.exitCode===null) {const done=once(next,'exit');next.kill('SIGTERM');await Promise.race([done,new Promise(r=>setTimeout(r,3000))]);if (next.exitCode===null) {next.kill('SIGKILL');await done;}}
  if (users.length) sql('delete from auth.users where id in('+users.map(x=>literal(x.id)).join(',')+');');
 });
 const log=createWriteStream(join(process.env.VP_IDENTITY_SUPABASE_WORKDIR,'community-next.log'),{mode:0o600});
 next=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(ports.apiPort)],{env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:local.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key,VISEPANDA_NATIVE_LOCAL_SESSION:'true',VISEPANDA_NATIVE_LOCAL_SERVICE_KEY:local.SERVICE_ROLE_KEY,VISEPANDA_TRIP_PROTOCOL_V2:'true',OPS_LOCAL_REVIEW:'1',COMMUNITY_INTERNAL_REVIEW:'1'},stdio:['ignore','pipe','pipe']});next.stdout.pipe(log);next.stderr.pipe(log);next.once('exit',()=>log.end());await waitForNativeAPI(ports.api,next);
 const call=async(path,token,body,headers={})=>{const r=await fetch(ports.api+path,{method:'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};};
 async function user() {
  const auth=createClient(local.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false}}),email='vpj48-'+uuid()+'@example.test',password='VPJ48-Disposable-'+uuid()+'!';
  const signed=await auth.auth.signUp({email,password});assert.equal(signed.error,null);assert.ok(signed.data.user&&signed.data.session);
  const row={id:signed.data.user.id,email,password};users.push(row);const attemptId=uuid();
  const credential=await call('/api/auth/native/v2/credentials',null,{email,password,attemptId});assert.equal(credential.status,200);const login=await call('/api/auth/native/v2/login',credential.body.accessToken,{attemptId});assert.equal(login.status,200,'original native v2 login');
  return {...row,...credential.body,mobileEpoch:login.body.mobileEpoch,sid:JSON.parse(Buffer.from(credential.body.accessToken.split('.')[1],'base64url')).session_id};
 }
 const owner=await user(),other=await user(),staff=await user();const native='/api/community/native/v1',ops='/api/ops/community';
 const ownerCall=(body,headers={})=>call(native,owner.accessToken,body,{'x-community-expected-actor':owner.id,'x-community-expected-session':owner.sid,...headers});
 const otherCall=body=>call(native,other.accessToken,body,{'x-community-expected-actor':other.id,'x-community-expected-session':other.sid});
 assert.equal((await call(native,null,{action:'mine',cursor:null})).status,401);
 assert.equal(sql("select has_function_privilege('anon','public.community_workspace(jsonb)','execute');"),'f');
 assert.equal(sql("select has_table_privilege('authenticated','community_private.submissions','select');"),'f');
 assert.equal(sql('select enabled from community_private.settings;'),'f');assert.equal(sql('select count(*) from community_private.reviewers;'),'0');
 const submission={action:'submit',operationId:uuid(),submissionId:uuid(),contentKind:'experience',title:'Synthetic travel experience',content:'\\'.repeat(4000),benefitDisclosure:'Synthetic self-reported interest only',place:null,consent:'internal-review-v1'};
 assert.equal((await ownerCall(submission)).body.error,'COMMUNITY_DISABLED');
 // Separate fixture authority setup: no target GRANT, account/role or disclosure claim.
 sql('update community_private.settings set enabled=true;');t.diagnostic('Observed default-disabled switch, empty reviewers and denied private-table/anonymous ACL. Remaining authority seeds exist only in this owned disposable fixture.');
 const raw='\n'+JSON.stringify(submission,null,2)+'\n';const sent=await ownerCall(raw);assert.equal(sent.status,200,JSON.stringify(sent.body));assert.ok(decodeCommunityOutcome(sent.body.data));assert.equal(sent.body.data.submission.authorDisclosure,'unknown');assert.equal(sent.body.data.submission.reviewerDisclosure,null);assert.equal(sent.body.data.submission.publiclyVisible,false);assert.match(sent.cache,/no-store/);
 const recovery={action:'operation',operationId:submission.operationId,mutationBytes:raw};
 assert.ok(JSON.stringify(recovery).length>10000,'legitimate escaped recovery exceeds old outer UTF16 cap');
 const recovered=await ownerCall(recovery);assert.equal(recovered.status,200,JSON.stringify(recovered.body));assert.equal(recovered.body.data.state,'committed');assert.equal(recovered.body.data.submission.content,submission.content);
 const alreadyCommitted=await ownerCall({...recovery,action:'abandon'});assert.equal(alreadyCommitted.status,200);assert.equal(alreadyCommitted.body.data.state,'committed');assert.equal(alreadyCommitted.body.data.submission.content,submission.content,'abandon never undoes a committed submit');
 assert.equal((await ownerCall({...recovery,mutationBytes:raw+' '.repeat(10001-raw.length)})).status,400,'inner mutation limit retained');
 const paddedOuter=JSON.stringify(recovery)+' '.repeat(49153-Buffer.byteLength(JSON.stringify(recovery)));assert.equal((await ownerCall(paddedOuter)).status,413,'outer recovery cap enforced');
 const boundarySubmission={...submission,operationId:uuid(),submissionId:uuid(),title:'中'.repeat(160),content:'中'.repeat(4000),benefitDisclosure:'中'.repeat(400)};
 const boundaryBare=JSON.stringify(boundarySubmission),boundaryRaw='\t'.repeat(10000-boundaryBare.length)+boundaryBare;assert.equal(boundaryRaw.length,10000);assert.ok(Buffer.byteLength(boundaryRaw)<24000);
 const boundaryRecovery={action:'operation',operationId:boundarySubmission.operationId,mutationBytes:boundaryRaw};assert.ok(Buffer.byteLength(JSON.stringify(boundaryRecovery))>24000 && Buffer.byteLength(JSON.stringify(boundaryRecovery))<49152);
 assert.equal((await ownerCall(boundaryRaw)).status,200,'original valid large Unicode mutation');
 const boundaryResult=await ownerCall(boundaryRecovery);assert.equal(boundaryResult.status,200,JSON.stringify(boundaryResult.body));assert.equal(boundaryResult.body.data.submission.content,boundarySubmission.content);
 const boundaryAbandon=await ownerCall({...boundaryRecovery,action:'abandon'});assert.equal(boundaryAbandon.status,200);assert.equal(boundaryAbandon.body.data.state,'committed','committed original is not undone');
 assert.equal((await ownerCall({action:'withdraw',operationId:uuid(),submissionId:boundarySubmission.submissionId,expectedVersion:1})).status,200);
 assert.equal((await ownerCall(JSON.stringify(submission))).status,409,'same op changed bytes denied');assert.equal((await ownerCall(raw)).status,200);
 assert.equal((await otherCall({action:'read',submissionId:submission.submissionId})).status,404);
 assert.equal((await ownerCall({...submission,operationId:uuid(),submissionId:uuid(),authorDisclosure:'official'})).status,400);
 assert.equal((await ownerCall({action:'submit',operationId:uuid(),submissionId:uuid(),contentKind:'help',title:'Unqualified place',content:'Synthetic question',benefitDisclosure:'',place:{tripId:uuid(),placeReferenceId:uuid(),expectedTripVersion:0,mappingDigest:'0'.repeat(64)},consent:'internal-review-v1'})).body.error,'COMMUNITY_PLACE_UNAVAILABLE');
 const cookies=[],web=createServerClient(local.API_URL,key,{cookies:{getAll:()=>cookies,setAll:rows=>{for (const c of rows) {const i=cookies.findIndex(x=>x.name===c.name);if (i>=0) cookies[i]=c;else cookies.push(c);}}}});const established=await web.auth.signInWithPassword({email:staff.email,password:staff.password});assert.equal(established.error,null);staff.webSid=JSON.parse(Buffer.from(established.data.session.access_token.split('.')[1],'base64url')).session_id;
 const staffHeaders=()=>({Cookie:cookies.map(c=>`${c.name}=${c.value}`).join('; '),Origin:ports.api,'x-community-expected-actor':staff.id,'x-community-expected-session':staff.webSid});const staffCall=(body,headers={})=>call(ops,null,body,{...staffHeaders(),...headers});
 assert.equal((await staffCall({action:'queue',cursor:null})).status,403,'registered Cookie identity grants no community review');
 sql(`insert into community_private.reviewers(actor_id,active) values(${literal(staff.id)},true);`);
 const queue=await staffCall({action:'queue',cursor:null});assert.equal(queue.status,200,JSON.stringify(queue.body));assert.ok(decodeCommunityOutcome(queue.body.data));assert.equal(queue.body.data.complete,true);assert.equal(queue.body.data.submissions.length,1);
 assert.equal((await staffCall({action:'inspect',submissionId:submission.submissionId},{'x-community-expected-session':uuid()})).status,403);
 sql(`insert into community_private.reviewers(actor_id,active) values(${literal(owner.id)},true);`);
 const ownerRPC=createClient(local.API_URL,key,{global:{headers:{Authorization:'Bearer '+owner.accessToken}},auth:{persistSession:false,autoRefreshToken:false}});
 const selfReview={action:'review',operationId:uuid(),submissionId:submission.submissionId,expectedVersion:1,decision:'approve',note:'Synthetic self-review must fail'};
 const selfAttempt=await ownerRPC.rpc('community_workspace',{p_input:{protocol:'community-j1/1',command:selfReview,mutationBytes:JSON.stringify(selfReview)}});assert.equal(selfAttempt.error?.message,'COMMUNITY_SELF_REVIEW');
 const review={action:'review',operationId:uuid(),submissionId:submission.submissionId,expectedVersion:1,decision:'approve',note:'Synthetic explanation explicitly shared with author'};
 const reviewRaw=JSON.stringify(review,null,1),approved=await staffCall(reviewRaw);assert.equal(approved.status,200,JSON.stringify(approved.body));assert.equal(approved.body.data.submission.status,'published');assert.equal(approved.body.data.submission.reviewerDisclosure,'unknown');assert.equal(approved.body.data.submission.publiclyVisible,false);
 const result=await ownerCall({action:'read',submissionId:submission.submissionId});assert.equal(result.status,200);assert.ok(decodeCommunityItem(result.body.data.submission));assert.equal(result.body.data.submission.reviewNote,review.note);assert.ok(result.body.data.submission.history.some(e=>e.action==='reviewed'));
 const withdraw={action:'withdraw',operationId:uuid(),submissionId:submission.submissionId,expectedVersion:2};assert.equal((await otherCall(withdraw)).status,404);assert.equal((await ownerCall(withdraw)).status,200);
 for (const response of [await ownerCall(raw),await staffCall(reviewRaw),await ownerCall({action:'operation',operationId:submission.operationId,mutationBytes:raw})]) {assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.data.submission.status,'withdrawn');assert.equal(response.body.data.submission.content,'');}
 const absent={...submission,operationId:uuid(),submissionId:uuid(),contentKind:'help'};const absentRaw=JSON.stringify(absent);assert.equal((await ownerCall({action:'operation',operationId:absent.operationId,mutationBytes:absentRaw})).body.data.state,'absent');assert.equal((await ownerCall({action:'abandon',operationId:absent.operationId,mutationBytes:absentRaw})).body.data.state,'abandoned');const abandoned=await ownerCall(absentRaw);assert.ok(abandoned.status===409 || abandoned.status===200 && abandoned.body.data.state==='abandoned');assert.equal(sql(`select count(*) from community_private.submissions where id=${literal(absent.submissionId)};`),'0');
 const rejected={...submission,operationId:uuid(),submissionId:uuid(),contentKind:'help'};assert.equal((await ownerCall(rejected)).status,200);const rejectedReview={...review,operationId:uuid(),submissionId:rejected.submissionId,decision:'reject'};assert.equal((await staffCall(rejectedReview)).status,200);assert.equal((await ownerCall({action:'withdraw',operationId:uuid(),submissionId:rejected.submissionId,expectedVersion:2})).status,200,'author may withdraw rejected content');
 const foreign={...submission,operationId:uuid(),submissionId:uuid(),title:'Foreign author content must survive'};assert.equal((await otherCall(foreign)).status,200);assert.equal((await staffCall({...review,operationId:uuid(),submissionId:foreign.submissionId,decision:'reject'})).status,200);
 sql(`insert into community_private.disclosures_j1(actor_id,disclosure) values(${literal(staff.id)},'employee');`);
 sql('update community_private.settings set enabled=false;');const exported=await ownerCall({action:'export'});assert.equal(exported.status,200,JSON.stringify(exported.body));assert.ok(decodeCommunityOutcome(exported.body.data));assert.equal(exported.body.data.coverage,'complete_for_community');assert.equal(exported.body.data.submissions.length,3);assert.ok(exported.body.data.receipts.length>=3);assert.ok(!JSON.stringify(exported.body.data).includes(foreign.content));
 const staffExport=await staffCall({action:'export'});assert.equal(staffExport.status,200,JSON.stringify(staffExport.body));assert.ok(decodeCommunityOutcome(staffExport.body.data));assert.equal(staffExport.body.data.reviewerQualification.active,true);assert.equal(staffExport.body.data.trustedDisclosure,'employee');assert.ok(staffExport.body.data.reviews.length>=3);assert.ok(!JSON.stringify(staffExport.body.data).includes(foreign.title));
 const staffDelete=await staffCall({action:'delete',operationId:uuid(),confirmed:true});assert.equal(staffDelete.status,200,JSON.stringify(staffDelete.body));const surviving=await otherCall({action:'read',submissionId:foreign.submissionId});assert.equal(surviving.status,200);assert.equal(surviving.body.data.submission.content,foreign.content);assert.equal(surviving.body.data.submission.status,'rejected');assert.equal(surviving.body.data.submission.reviewNote,null);assert.equal(surviving.body.data.submission.reviewerDisclosure,null);
 const deletion={action:'delete',operationId:uuid(),confirmed:true};const deleted=await ownerCall(deletion);assert.equal(deleted.status,200);const erased=await ownerCall({action:'read',submissionId:submission.submissionId});assert.equal(erased.status,200,JSON.stringify(erased.body));assert.equal(erased.body.data.submission.status,'deleted');assert.equal(erased.body.data.submission.content,'');
 sql('update community_private.settings set enabled=true;');const replay=await ownerCall(raw);assert.equal(replay.status,200,JSON.stringify(replay.body));assert.equal(replay.body.data.submission.content,'');assert.equal(replay.body.data.submission.status,'deleted');
 assert.equal((await staffCall({action:'queue',cursor:null})).status,403,'erasure removes independent reviewer qualification');
 if (process.env.VP_COMMUNITY_RECORD_FIXTURE==='1') {
  mkdirSync('tests/fixtures/community',{recursive:true});
  writeFileSync('tests/fixtures/community/j1-producer.json',JSON.stringify({schemaVersion:'community-j1-fixture/1',endpoint:ports.api,ownerId:owner.id,sessionId:owner.sid,epoch:owner.mobileEpoch,samples:{submitted:sent.body,reviewed:result.body,exported:exported.body,erased:erased.body,deleted:deleted.body}},null,2)+'\n',{mode:0o600});
 }
 const replacementAttempt=uuid();const replacement=await call('/api/auth/native/v2/credentials',null,{email:owner.email,password:owner.password,attemptId:replacementAttempt});assert.equal(replacement.status,200);assert.equal((await call('/api/auth/native/v2/login',replacement.body.accessToken,{attemptId:replacementAttempt})).status,200);assert.equal((await ownerCall({action:'mine',cursor:null})).status,401,'old mobile session fenced');
});
