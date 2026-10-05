import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID as uuid} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';import {once} from 'node:events';import {createWriteStream,mkdirSync,writeFileSync} from 'node:fs';import {join} from 'node:path';
import {createClient} from '@supabase/supabase-js';import {createServerClient} from '@supabase/ssr';
import {identityLocalEnv} from '../../identity/local-supabase.mjs';import {nativeHTTPEnvironmentPorts} from '../../turn/native-http-ports.mjs';import {waitForNativeAPI} from '../../identity/native-api-readiness.mjs';
import {decodeSafetyOutcome,decodeSafetyRecord} from '../../../../lib/server/community/safety/contract.ts';
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
test('owned real ordinary Auth + Native/Ops HTTP: lawful report, independent disposition/appeal, block, J1 invalidation and complete scoped privacy',{
 skip:process.env.VP_COMMUNITY_SAFETY_HTTP!=='true',timeout:300000,
},async t=>{
 const ports=nativeHTTPEnvironmentPorts(process.env),local=identityLocalEnv();assert.equal(local?.API_URL,ports.supabaseAPI);assert.match(local.DB_CONTAINER,/^supabase_db_vp-native-ask-[a-f0-9]{8}$/);
 const sql=q=>execFileSync('docker',['exec','-i',local.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1'],{input:"set statement_timeout='15s';"+q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 const key=local.PUBLISHABLE_KEY||local.ANON_KEY,users=[];let next;
 t.after(async()=>{
  if (next && next.exitCode===null) {const done=once(next,'exit');next.kill('SIGTERM');await Promise.race([done,new Promise(r=>setTimeout(r,3000))]);if (next.exitCode===null) {next.kill('SIGKILL');await done;}}
  if (users.length) sql('delete from auth.users where id in('+users.map(x=>literal(x.id)).join(',')+');');
 });
 const log=createWriteStream(join(process.env.VP_IDENTITY_SUPABASE_WORKDIR,'safety-next.log'),{mode:0o600});
 next=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(ports.apiPort)],{env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:local.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key,VISEPANDA_NATIVE_LOCAL_SESSION:'true',VISEPANDA_NATIVE_LOCAL_SERVICE_KEY:local.SERVICE_ROLE_KEY,VISEPANDA_TRIP_PROTOCOL_V2:'true',OPS_LOCAL_REVIEW:'1',COMMUNITY_INTERNAL_REVIEW:'1',COMMUNITY_SAFETY_INTERNAL:'1'},stdio:['ignore','pipe','pipe']});next.stdout.pipe(log);next.stderr.pipe(log);next.once('exit',()=>log.end());await waitForNativeAPI(ports.api,next);
 const call=async(path,token,body,headers={})=>{const r=await fetch(ports.api+path,{method:'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};};
 async function user() {
  const auth=createClient(local.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false}}),email='vpj64-'+uuid()+'@example.test',password='VPJ64-Disposable-'+uuid()+'!';
  const signed=await auth.auth.signUp({email,password});assert.equal(signed.error,null);assert.ok(signed.data.user&&signed.data.session);
  const row={id:signed.data.user.id,email,password};users.push(row);const attemptId=uuid();
  const credential=await call('/api/auth/native/v2/credentials',null,{email,password,attemptId});assert.equal(credential.status,200);const login=await call('/api/auth/native/v2/login',credential.body.accessToken,{attemptId});assert.equal(login.status,200,'original Native v2 login');
  return {...row,...credential.body,mobileEpoch:login.body.mobileEpoch,sid:JSON.parse(Buffer.from(credential.body.accessToken.split('.')[1],'base64url')).session_id};
 }
 const owner=await user(),reporter=await user(),foreign=await user(),moderator=await user(),reviewer=await user();
 const native='/api/community/safety/native/v1',ops='/api/ops/community/safety',j1='/api/community/native/v1';
 const nc=(a,body)=>call(native,a.accessToken,body,{'x-community-safety-expected-actor':a.id,'x-community-safety-expected-session':a.sid});
 const jc=(a,body)=>call(j1,a.accessToken,body,{'x-community-expected-actor':a.id,'x-community-expected-session':a.sid});
 async function cookieActor(a) {
  const cookies=[],web=createServerClient(local.API_URL,key,{cookies:{getAll:()=>cookies,setAll:rows=>{for (const c of rows) {const i=cookies.findIndex(x=>x.name===c.name);if (i>=0) cookies[i]=c;else cookies.push(c);}}}});
  const established=await web.auth.signInWithPassword({email:a.email,password:a.password});assert.equal(established.error,null);const sid=JSON.parse(Buffer.from(established.data.session.access_token.split('.')[1],'base64url')).session_id;
  return body=>call(ops,null,body,{Cookie:cookies.map(c=>`${c.name}=${c.value}`).join('; '),Origin:ports.api,'x-community-safety-expected-actor':a.id,'x-community-safety-expected-session':sid});
 }
 const mc=await cookieActor(moderator),rc=await cookieActor(reviewer);
 const ok=(response)=>{assert.equal(response.status,200,JSON.stringify(response.body));assert.ok(decodeSafetyOutcome(response.body.data),JSON.stringify(response.body));assert.match(response.cache,/no-store/);return response.body.data;};
 const nope=(response,code='SAFETY_NOT_FOUND')=>{assert.equal(response.body.error,code,JSON.stringify(response.body));assert.ok(!('data' in response.body));};
 assert.equal(sql('select enabled from community_safety_private.settings;'),'f');assert.equal(sql('select count(*) from community_safety_private.moderators;'),'0');assert.equal(sql('select count(*) from community_safety_private.controlled_readers;'),'0');
 assert.equal(sql("select has_table_privilege('authenticated','community_safety_private.reports','select');"),'f');assert.equal(sql("select has_function_privilege('anon','public.community_workspace(jsonb)','execute');"),'f');
 nope(await nc(owner,{action:'objects',cursor:null}),'SAFETY_DISABLED');
 // Only this uniquely owned local fixture gets qualification/consent test rows.
 sql('update community_private.settings set enabled=true;update community_safety_private.settings set enabled=true;');
 const submission={action:'submit',operationId:uuid(),submissionId:uuid(),contentKind:'experience',title:'Synthetic controlled content',content:'Synthetic current user experience only',benefitDisclosure:'Self-reported fixture relationship',place:null,consent:'internal-review-v1'};
 const raw=JSON.stringify(submission);assert.equal((await jc(owner,raw)).status,200);
 nope(await nc(foreign,{action:'object',submissionId:submission.submissionId}));
 const grant=a=>sql(`insert into community_safety_private.controlled_readers(actor_id,submission_id,submission_version,expires_at) values(${literal(a.id)},${literal(submission.submissionId)},1,clock_timestamp()+interval '5 minutes');`);
 grant(reporter);
 sql(`insert into community_private.reviewers(actor_id,active) values(${literal(moderator.id)},true),(${literal(reviewer.id)},true);insert into community_safety_private.moderators(actor_id,active) values(${literal(moderator.id)},true),(${literal(reviewer.id)},true);`);
 const objects=ok(await nc(reporter,{action:'objects',cursor:null}));assert.ok(objects.objects.some(x=>x.id===submission.submissionId));
 const object=ok(await nc(reporter,{action:'object',submissionId:submission.submissionId})).object;assert.equal(object.authorDisclosure,'unknown');assert.equal(object.copyright,'unknown');assert.equal(object.source,'user_experience');assert.equal(object.publiclyVisible,false);assert.ok(object.canReport && object.canBlock);
 const report={action:'report',operationId:uuid(),reportId:uuid(),submissionId:object.id,expectedSubmissionVersion:object.submissionVersion,expectedSafetyVersion:object.safetyVersion,category:'rights',details:'PRIVATE-REPORTER-SYNTHETIC',consent:'internal-safety-v1'};
 const reportRaw='\t'+JSON.stringify(report,null,1);const reported=ok(await nc(reporter,reportRaw));assert.equal(reported.record.id,report.reportId);assert.ok(decodeSafetyRecord(reported.record));
 nope(await nc(owner,{action:'read',collection:'reports',id:report.reportId}));nope(await nc(foreign,{action:'read',collection:'reports',id:report.reportId}));
 const ownerState=ok(await nc(owner,{action:'read',collection:'dispositions',id:object.id}));assert.ok(!JSON.stringify(ownerState).includes(report.details));assert.ok(!JSON.stringify(ownerState).includes(reporter.id));
 const inspected=ok(await mc({action:'inspect',collection:'reports',id:report.reportId})).record;assert.equal(inspected.details,report.details);
 const decision={action:'disposition',operationId:uuid(),reportId:report.reportId,expectedReportVersion:1,expectedSubmissionVersion:inspected.submissionVersion,expectedSafetyVersion:inspected.safetyVersion,decision:'remove',note:'Only this public-to-parties explanation is retained'};
 const removed=ok(await mc(decision));assert.equal(removed.record.state,'removed');assert.ok(!JSON.stringify(removed).includes(reporter.id));
 nope(await nc(reporter,{action:'object',submissionId:object.id}));nope(await nc(owner,{action:'object',submissionId:object.id}));
 for (const prior of [await jc(owner,{action:'read',submissionId:object.id}),await jc(owner,raw),await jc(owner,{action:'operation',operationId:submission.operationId,mutationBytes:raw})]) {assert.ok(prior.status===404 || prior.status===403,JSON.stringify(prior.body));assert.ok(!JSON.stringify(prior.body).includes(submission.content));}
 const receipt=ok(await nc(reporter,{action:'read',collection:'reports',id:report.reportId}));assert.equal(receipt.record.state,'removed');assert.equal(receipt.record.note,decision.note);
 const authorDisposition=ok(await nc(owner,{action:'read',collection:'dispositions',id:object.id})).record;assert.equal(authorDisposition.state,'removed');assert.ok(authorDisposition.appealable);assert.ok(!JSON.stringify(authorDisposition).includes(report.details));
 const appeal={action:'appeal',operationId:uuid(),appealId:uuid(),submissionId:object.id,expectedSubmissionVersion:authorDisposition.submissionVersion,expectedSafetyVersion:authorDisposition.safetyVersion,basis:'safety_removal',statement:'AUTHOR-PRIVATE-SYNTHETIC-APPEAL',consent:'internal-safety-v1'};
 const appealed=ok(await nc(owner,appeal));assert.equal(appealed.record.state,'pending');nope(await nc(reporter,{action:'read',collection:'appeals',id:appeal.appealId}));
 nope(await mc({action:'inspect',collection:'appeals',id:appeal.appealId}),'SAFETY_FORBIDDEN');
 const appealRecord=ok(await rc({action:'inspect',collection:'appeals',id:appeal.appealId})).record;
 const appealReview={action:'appealReview',operationId:uuid(),appealId:appeal.appealId,expectedAppealVersion:1,expectedSubmissionVersion:appealRecord.submissionVersion,expectedSafetyVersion:appealRecord.safetyVersion,decision:'restore',note:'Independent reviewer restored the retained current source'};
 const restored=ok(await rc(appealReview));assert.equal(restored.record.state,'restored');
 const live=ok(await nc(reporter,{action:'object',submissionId:object.id})).object;assert.equal(live.content,submission.content);assert.equal(live.publiclyVisible,false);
 const block={action:'block',operationId:uuid(),blockId:uuid(),submissionId:live.id,expectedSubmissionVersion:live.submissionVersion,expectedSafetyVersion:live.safetyVersion};const blocked=ok(await nc(reporter,block));assert.equal(blocked.record.state,'blocked');assert.ok(!JSON.stringify(blocked.record).includes(owner.id));
 nope(await nc(reporter,{action:'object',submissionId:live.id}));nope(await nc(foreign,{action:'unblock',operationId:uuid(),blockId:block.blockId,expectedVersion:1}));
 const unblocked=ok(await nc(reporter,{action:'unblock',operationId:uuid(),blockId:block.blockId,expectedVersion:1}));assert.equal(unblocked.record.state,'unblocked');
 assert.equal(ok(await nc(reporter,{action:'object',submissionId:live.id})).object.content,submission.content);
 sql(`update community_safety_private.controlled_readers set revoked=true where actor_id=${literal(reporter.id)};`);nope(await nc(reporter,{action:'object',submissionId:live.id}));
 sql(`update community_safety_private.controlled_readers set revoked=false,expires_at=clock_timestamp()-interval '1 second' where actor_id=${literal(reporter.id)};`);nope(await nc(reporter,{action:'object',submissionId:live.id}));
 sql(`update community_safety_private.controlled_readers set expires_at=clock_timestamp()+interval '5 minutes' where actor_id=${literal(reporter.id)};`);
 assert.equal((await jc(owner,{action:'withdraw',operationId:uuid(),submissionId:object.id,expectedVersion:1})).status,200);nope(await nc(reporter,{action:'object',submissionId:live.id}));
 const abandoned={...report,operationId:uuid(),reportId:uuid()};const abandonedRaw=JSON.stringify(abandoned);const abandonedOutcome=ok(await nc(reporter,{action:'abandon',operationId:abandoned.operationId,mutationBytes:abandonedRaw}));assert.equal(abandonedOutcome.state,'abandoned');
 const forbiddenReplay=await nc(reporter,abandonedRaw);assert.ok(forbiddenReplay.status===409 || forbiddenReplay.status===200 && forbiddenReplay.body.data.state==='abandoned');assert.equal(sql(`select count(*) from community_safety_private.reports where id=${literal(abandoned.reportId)};`),'0');
 sql('update community_safety_private.settings set enabled=false;');
 const moderatorExport=ok(await mc({action:'export'}));assert.equal(moderatorExport.authoredDecisions.length,1);assert.equal(moderatorExport.authoredDecisions[0].note,decision.note);assert.ok(!JSON.stringify(moderatorExport).includes(report.details));assert.ok(!JSON.stringify(moderatorExport).includes(appeal.statement));assert.ok(!JSON.stringify(moderatorExport).includes(reporter.id));
 const ownerExport=ok(await nc(owner,{action:'export'}));assert.equal(ownerExport.appeals.length,1);assert.ok(!JSON.stringify(ownerExport).includes(report.details));
 const reporterExport=ok(await nc(reporter,{action:'export'}));assert.equal(reporterExport.reports.length,1);assert.equal(reporterExport.blocks.length,1);assert.equal(reporterExport.readerGrants.length,1);assert.equal(reporterExport.readerGrants[0].submissionId,object.id);assert.ok(!JSON.stringify(reporterExport).includes(appeal.statement));
 ok(await mc({action:'delete',operationId:uuid(),confirmed:true}));const survivingReport=ok(await nc(reporter,{action:'read',collection:'reports',id:report.reportId}));assert.equal(survivingReport.record.details,report.details);assert.equal(survivingReport.record.note,null);
 ok(await nc(reporter,{action:'delete',operationId:uuid(),confirmed:true}));const erased=ok(await nc(reporter,{action:'export'}));assert.ok(erased.reports.every(x=>x.state==='erased' && x.details===null));assert.ok(erased.blocks.every(x=>x.state==='erased' && x.submissionId===null));assert.equal(erased.readerGrants.length,0);assert.ok(!JSON.stringify(erased).includes(report.details));
 const authorAfter=ok(await nc(owner,{action:'read',collection:'appeals',id:appeal.appealId}));assert.equal(authorAfter.record.statement,appeal.statement,'foreign author data survives reporter/moderator deletion');
 sql('update community_safety_private.settings set enabled=true;');const old=ok(await nc(reporter,{action:'operation',operationId:report.operationId,mutationBytes:reportRaw}));assert.equal(old.record.details,null,'old receipt cannot revive erased detail');
 if (process.env.VP_COMMUNITY_SAFETY_RECORD_FIXTURE==='1') {mkdirSync('tests/fixtures/community/safety',{recursive:true});writeFileSync('tests/fixtures/community/safety/producer.json',JSON.stringify({fixtureSchema:'community-safety-j2-fixture/1',endpoint:ports.api,samples:{objects,object:{...objects,kind:'object',object:object,objects:undefined,nextCursor:undefined,complete:undefined},reported,receipt,authorDisposition:ownerState,appealed,restored,blocked,unblocked,ownerExport,reporterExport,moderatorExport,erased}},null,2)+'\n',{mode:0o600});}
 const replacement=uuid();const credentials=await call('/api/auth/native/v2/credentials',null,{email:owner.email,password:owner.password,attemptId:replacement});assert.equal(credentials.status,200);assert.equal((await call('/api/auth/native/v2/login',credentials.body.accessToken,{attemptId:replacement})).status,200);assert.equal((await nc(owner,{action:'mine',collection:'appeals',cursor:null})).status,401,'old Native scope is fenced');
 t.diagnostic('All authority/qualification/reader changes above were only in the named disposable fixture; real target roles, publication, device and account-wide handlers UNRUN.');
});
