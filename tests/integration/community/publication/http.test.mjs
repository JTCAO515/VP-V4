import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID as uuid} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';import {once} from 'node:events';import {createWriteStream,mkdirSync,writeFileSync} from 'node:fs';import {join} from 'node:path';
import {createClient} from '@supabase/supabase-js';import {createServerClient} from '@supabase/ssr';
import {identityLocalEnv} from '../../identity/local-supabase.mjs';import {nativeHTTPEnvironmentPorts} from '../../turn/native-http-ports.mjs';import {waitForNativeAPI} from '../../identity/native-api-readiness.mjs';
import {decodePublicationOutcome,matchesPublicationOutcome} from '../../../../lib/server/community/publication/contract.ts';
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
test('owned real Auth + Native/Ops HTTP: controlled consent, independent rights/publication, exact readers/save, original canonical Save/Proposal, irreversible reference invalidation and scoped privacy',{
 skip:process.env.VP_COMMUNITY_PUBLICATION_HTTP!=='true',timeout:300000,
},async t=>{
 const ports=nativeHTTPEnvironmentPorts(process.env),local=identityLocalEnv();assert.equal(local?.API_URL,ports.supabaseAPI);assert.match(local.DB_CONTAINER,/^supabase_db_vp-native-ask-[a-f0-9]{8}$/);
 const sql=q=>execFileSync('docker',['exec','-i',local.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1'],{input:"set statement_timeout='15s';"+q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 const key=local.PUBLISHABLE_KEY||local.ANON_KEY,users=[];let next;
 t.after(async()=>{
  if (next && next.exitCode===null) {const done=once(next,'exit');next.kill('SIGTERM');await Promise.race([done,new Promise(r=>setTimeout(r,3000))]);if (next.exitCode===null) {next.kill('SIGKILL');await done;}}
  if (users.length) {const ids=users.map(x=>literal(x.id)).join(',');sql(`delete from public.trip_events where owner_id in(${ids});delete from public.trip_audit_events where owner_id in(${ids});delete from auth.users where id in(${ids});`);assert.equal(sql(`select count(*) from auth.users where id in(${ids});`),'0');}
 });
 const log=createWriteStream(join(process.env.VP_IDENTITY_SUPABASE_WORKDIR,'publication-next.log'),{mode:0o600});
 next=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(ports.apiPort)],{env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:local.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key,VISEPANDA_NATIVE_LOCAL_SESSION:'true',VISEPANDA_NATIVE_LOCAL_SERVICE_KEY:local.SERVICE_ROLE_KEY,VISEPANDA_TRIP_PROTOCOL_V2:'true',VISEPANDA_PLACE_ACTIONS_ENABLED:'true',OPS_LOCAL_REVIEW:'1',COMMUNITY_INTERNAL_REVIEW:'1',COMMUNITY_SAFETY_INTERNAL:'1',COMMUNITY_PUBLICATION_CONTROLLED:'1'},stdio:['ignore','pipe','pipe']});next.stdout.pipe(log);next.stderr.pipe(log);next.once('exit',()=>log.end());await waitForNativeAPI(ports.api,next);
 const call=async(path,token,body,headers={})=>{const r=await fetch(ports.api+path,{method:body===undefined?'GET':'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};};
 async function user() {
  const auth=createClient(local.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false}}),email='vpj48-publication-'+uuid()+'@example.test',password='VPJ48-Disposable-'+uuid()+'!';
  const signed=await auth.auth.signUp({email,password});assert.equal(signed.error,null);assert.ok(signed.data.user&&signed.data.session);
  const row={id:signed.data.user.id,email,password};users.push(row);const attemptId=uuid();
  const credential=await call('/api/auth/native/v2/credentials',null,{email,password,attemptId});assert.equal(credential.status,200);const login=await call('/api/auth/native/v2/login',credential.body.accessToken,{attemptId});assert.equal(login.status,200,'original native v2 enrollment');
  return {...row,...credential.body,sid:JSON.parse(Buffer.from(credential.body.accessToken.split('.')[1],'base64url')).session_id};
 }
 const owner=await user(),reader=await user(),foreign=await user(),reviewer=await user(),rights=await user(),publisher=await user();
 const native='/api/community/publication/native/v1',ops='/api/ops/community/publication',j1='/api/community/native/v1',safety='/api/community/safety/native/v1';
 const nc=(a,body)=>call(native,a.accessToken,body,{'x-community-publication-expected-actor':a.id,'x-community-publication-expected-session':a.sid});
 const jc=(a,body)=>call(j1,a.accessToken,body,{'x-community-expected-actor':a.id,'x-community-expected-session':a.sid});
 const sc=(a,body)=>call(safety,a.accessToken,body,{'x-community-safety-expected-actor':a.id,'x-community-safety-expected-session':a.sid});
 async function cookieActor(a,path=ops,prefix='publication') {
  const cookies=[],web=createServerClient(local.API_URL,key,{cookies:{getAll:()=>cookies,setAll:rows=>{for(const c of rows){const i=cookies.findIndex(x=>x.name===c.name);if(i>=0)cookies[i]=c;else cookies.push(c);}}}});
  const established=await web.auth.signInWithPassword({email:a.email,password:a.password});assert.equal(established.error,null);const sid=JSON.parse(Buffer.from(established.data.session.access_token.split('.')[1],'base64url')).session_id;
  const stem=prefix?`x-community-${prefix}`:'x-community';
  return body=>call(path,null,body,{Cookie:cookies.map(c=>`${c.name}=${c.value}`).join('; '),Origin:ports.api,[`${stem}-expected-actor`]:a.id,[`${stem}-expected-session`]:sid});
 }
 const rc=await cookieActor(rights),pc=await cookieActor(publisher),review=await cookieActor(reviewer,'/api/ops/community',''),pm=await cookieActor(publisher,'/api/ops/community/safety','safety'),rm=await cookieActor(rights,'/api/ops/community/safety','safety');
 // Original J1 uses headers without a module suffix.
 const j1Review=async body=>{const response=await review(body);return response;};
 const ok=response=>{assert.equal(response.status,200,JSON.stringify(response.body));assert.ok(decodePublicationOutcome(response.body.data),JSON.stringify(response.body));assert.match(response.cache,/no-store/);return response.body.data;};
 const nope=(response,code='PUBLICATION_NOT_FOUND')=>{assert.equal(response.body.error,code,JSON.stringify(response.body));assert.ok(!('data' in response.body));};
 assert.equal(sql('select enabled from community_publication_private.settings;'),'f');assert.equal(sql('select count(*) from community_publication_private.qualifications;'),'0');
 assert.equal(sql("select has_table_privilege('authenticated','community_publication_private.publications','select');"),'f');assert.equal(sql("select has_function_privilege('anon','public.community_workspace(jsonb)','execute');"),'f');
 nope(await nc(owner,{action:'list',cursor:null,query:''}),'PUBLICATION_DISABLED');
 // This newly named local fixture alone may change settings and test qualifications.
 sql(`update community_private.settings set enabled=true;update community_safety_private.settings set enabled=true;update community_publication_private.settings set enabled=true;insert into community_private.reviewers(actor_id,active) values(${literal(reviewer.id)},true);insert into community_publication_private.qualifications(actor_id,rights_reviewer,publisher) values(${literal(rights.id)},true,false),(${literal(publisher.id)},false,true);insert into community_safety_private.moderators(actor_id,active) values(${literal(rights.id)},true),(${literal(publisher.id)},true);`);
 async function controlledGrant(a,id,version=2) {sql(`insert into community_safety_private.controlled_readers(actor_id,submission_id,submission_version,expires_at) values(${literal(a.id)},${literal(id)},${version},clock_timestamp()+interval '5 minutes') on conflict(actor_id,submission_id) do update set submission_version=excluded.submission_version,expires_at=excluded.expires_at,revoked=false;`);}
 async function chain(label,place=null) {
  const submission={action:'submit',operationId:uuid(),submissionId:uuid(),contentKind:'experience',title:'Synthetic '+label,content:'Owned synthetic travel text '+label,benefitDisclosure:'Fixture self-reported interest',place,consent:'internal-review-v1'};
  assert.equal((await jc(owner,submission)).status,200);
  const approved=await j1Review({action:'review',operationId:uuid(),submissionId:submission.submissionId,expectedVersion:1,decision:'approve',note:'Internal independent review of synthetic text'});assert.equal(approved.status,200,JSON.stringify(approved.body));
  const preview=ok(await nc(owner,{action:'preview',submissionId:submission.submissionId})).preview;assert.equal(preview.object.copyright,'unknown');assert.equal(preview.audience,'controlled_registered');
  const request={action:'requestPublication',operationId:uuid(),publicationId:uuid(),submissionId:submission.submissionId,expectedSubmissionVersion:preview.object.submissionVersion,expectedSafetyVersion:preview.object.safetyVersion,previewDigest:preview.previewDigest,consent:'controlled-preview-v1',rightsDeclaration:'own-text-v1'};
  const requested=ok(await nc(owner,request)).publication;assert.equal(requested.state,'pending_rights');
  const rightsReview={action:'rightsReview',operationId:uuid(),publicationId:request.publicationId,expectedPublicationVersion:requested.version,expectedSubmissionVersion:request.expectedSubmissionVersion,expectedSafetyVersion:request.expectedSafetyVersion,decision:'approve',note:'Checked synthetic author-owned text and limited controlled display purpose'};
  nope(await rc(rightsReview));assert.equal(sql(`select count(*) from community_publication_private.operations where operation_id=${literal(rightsReview.operationId)};`),'0','qualification does not grant lawful body access');
  await controlledGrant(rights,submission.submissionId);await controlledGrant(publisher,submission.submissionId);await controlledGrant(reader,submission.submissionId);
  const reviewed=ok(await rc(rightsReview)).publication;assert.equal(reviewed.state,'rights_approved');
  const publish={action:'publish',operationId:uuid(),publicationId:request.publicationId,expectedPublicationVersion:reviewed.version,expectedSubmissionVersion:request.expectedSubmissionVersion,expectedSafetyVersion:request.expectedSafetyVersion};
  const raw='\t'+JSON.stringify(publish);const published=ok(await pc(raw)).publication;assert.equal(published.state,'published');
  const live=ok(await nc(reader,{action:'detail',publicationId:request.publicationId})).experience;assert.equal(live.copyright,'author_declared_own_text_independently_reviewed');assert.equal(live.publiclyVisible,false);assert.equal(live.retrievalEligible,false);assert.equal(live.content,submission.content);
  const save={action:'save',operationId:uuid(),referenceId:uuid(),publicationId:request.publicationId,expectedPublicationVersion:live.publicationVersion,expectedSubmissionVersion:live.submissionVersion,expectedSafetyVersion:live.safetyVersion};
  const saved=ok(await nc(reader,save)).reference;assert.equal(saved.availability,'current');assert.equal(saved.experience.id,live.id);
  return {submission,request,publish,publishBytes:raw,live,save};
 }
 async function ownedTrip(a) {
  const tripId=uuid(),dayId=uuid();const api='/api/trips/native/v2/'+tripId;
  assert.equal((await call('/api/trips/native/v2',a.accessToken,{tripId,title:'Synthetic own canonical Trip'})).status,201);
  const proposed=await call(api+'/proposal',a.accessToken,{patch:{expectedVersion:0,operations:[{kind:'upsert_day',dayId,date:'2026-10-06',timeZone:'Asia/Shanghai'}]}});assert.equal(proposed.status,201,JSON.stringify(proposed.body));
  const pending=await call(api+'/proposal?proposalId='+proposed.body.proposalId,a.accessToken);assert.equal(pending.status,200);
  const confirmed=await call(api+'/confirm',a.accessToken,{proposalId:proposed.body.proposalId,idempotencyKey:uuid(),digest:pending.body.proposal.digest});assert.equal(confirmed.status,200,JSON.stringify(confirmed.body));
  return {id:tripId,dayId,api};
 }
 const authorTrip=await ownedTrip(owner),readerTrip=await ownedTrip(reader),poi=uuid(),providerPoiId=uuid();
 // Exact fixture canonical mapping is created locally; no provider call/observation claimed.
 sql(`insert into public.canonical_pois(id,primary_name_zh,primary_name_en) values(${literal(poi)},'自有测试地点','Fixture exact place');insert into public.provider_poi_mappings(canonical_poi_id,provider,provider_poi_id,raw_name) values(${literal(poi)},'amap',${literal(providerPoiId)},'Synthetic fixture mapping');grant execute on function public.read_place_action_context_v1(uuid,jsonb),public.execute_place_action_v1(uuid,jsonb) to authenticated;`);
 const selection={canonicalPoiId:poi,provider:'amap',providerPoiId};const placeCall=(a,trip,input)=>call('/api/explore/native/v1/trips/'+trip.id+'/place-actions',a.accessToken,input);
 const authorContext=await placeCall(owner,authorTrip,{action:'context',expectedTripVersion:1,selection,locale:'en'});assert.equal(authorContext.status,200,JSON.stringify(authorContext.body));
 const authorSave=await placeCall(owner,authorTrip,{action:'save',operationId:uuid(),expectedTripVersion:1,selection,expectedMappingDigest:authorContext.body.mappingDigest,expectedSaveRevision:0});assert.equal(authorSave.status,200,JSON.stringify(authorSave.body));
 const first=await chain('withdrawal',{tripId:authorTrip.id,placeReferenceId:authorSave.body.referenceId,expectedTripVersion:1,mappingDigest:authorContext.body.mappingDigest});
 assert.equal(first.live.place.canonicalPoiId,poi);assert.equal(first.live.place.mappingDigest,authorContext.body.mappingDigest);assert.ok(!('tripId' in first.live.place));assert.ok(!('placeReferenceId' in first.live.place));
 const readerContext=await placeCall(reader,readerTrip,{action:'context',expectedTripVersion:1,selection,locale:'en'});assert.equal(readerContext.status,200,JSON.stringify(readerContext.body));assert.equal(readerContext.body.mappingDigest,first.live.place.mappingDigest);
 const readerSave=await placeCall(reader,readerTrip,{action:'save',operationId:uuid(),expectedTripVersion:1,selection,expectedMappingDigest:first.live.place.mappingDigest,expectedSaveRevision:0});assert.equal(readerSave.status,200,JSON.stringify(readerSave.body));
 const add={action:'add',operationId:uuid(),expectedTripVersion:1,selection,expectedMappingDigest:first.live.place.mappingDigest,dayId:readerTrip.dayId,itemId:uuid(),startsAt:'2026-10-06T10:00:00+08:00',endsAt:'2026-10-06T11:00:00+08:00',locale:'en'};
 const added=await placeCall(reader,readerTrip,add);assert.equal(added.status,200,JSON.stringify(added.body));assert.equal(added.body.proposalReview.baseVersion,1);
 const beforeConfirm=await call(readerTrip.api,reader.accessToken);assert.equal(beforeConfirm.body.trip.headVersion,1,'place Add remains a proposal until original explicit confirm');
 const pendingPlace=await call(readerTrip.api+'/proposal?proposalId='+added.body.proposalReview.id,reader.accessToken);assert.equal(pendingPlace.status,200);assert.equal(pendingPlace.body.proposal.after.days[0].items[0].title,'Fixture exact place');
 const confirmedPlace=await call(readerTrip.api+'/confirm',reader.accessToken,{proposalId:added.body.proposalReview.id,idempotencyKey:uuid(),digest:pendingPlace.body.proposal.digest});assert.equal(confirmedPlace.status,200,JSON.stringify(confirmedPlace.body));
 const confirmedPlan=(await call(readerTrip.api,reader.accessToken)).body;assert.equal(confirmedPlan.trip.headVersion,2);
 nope(await nc(foreign,{action:'detail',publicationId:first.request.publicationId}));
 const foreignSave={...first.save,operationId:uuid(),referenceId:uuid(),expectedPublicationVersion:999};nope(await nc(foreign,foreignSave));assert.equal(sql(`select count(*) from community_publication_private.operations where operation_id=${literal(foreignSave.operationId)};`),'0');
 const list=ok(await nc(reader,{action:'list',cursor:null,query:'withdrawal'}));assert.ok(list.experiences.some(x=>x.id===first.live.id));assert.equal(ok(await nc(foreign,{action:'list',cursor:null,query:''})).experiences.length,0);
 const replay=ok(await pc({action:'operation',operationId:first.publish.operationId,mutationBytes:first.publishBytes}));assert.equal(replay.publication.state,'published');
 assert.equal((await call(native,null,{action:'list',cursor:null,query:''})).status,401);assert.equal((await nc(owner,first.publish)).status,403,'native cannot publish');
 // Exact source withdrawal denies Explore/search/old URL/reference/replay body.
 assert.equal((await jc(owner,{action:'withdraw',operationId:uuid(),submissionId:first.submission.submissionId,expectedVersion:2})).status,200);
 nope(await nc(reader,{action:'detail',publicationId:first.live.id}));assert.equal(ok(await nc(reader,{action:'list',cursor:null,query:'withdrawal'})).experiences.length,0);
 const unavailable=ok(await nc(reader,{action:'reference',referenceId:first.save.referenceId})).reference;assert.equal(unavailable.experience,null);assert.equal(unavailable.availability,'unavailable');
 const staleReplay=await pc({action:'operation',operationId:first.publish.operationId,mutationBytes:first.publishBytes});nope(staleReplay);assert.ok(!JSON.stringify(staleReplay).includes(first.submission.content),'qualified replay is denied when current source body authority is unavailable');
 const preserved=(await call(readerTrip.api,reader.accessToken)).body;assert.equal(preserved.trip.headVersion,2);assert.deepEqual(preserved.content,confirmedPlan.content,'source invalidation preserves original confirmed user-owned plan');
 const second=await chain('safety restoration');
 const report={action:'report',operationId:uuid(),reportId:uuid(),submissionId:second.submission.submissionId,expectedSubmissionVersion:2,expectedSafetyVersion:0,category:'rights',details:'Synthetic private reporter reason',consent:'internal-safety-v1'};assert.equal((await sc(reader,report)).status,200);
 const removed=await pm({action:'disposition',operationId:uuid(),reportId:report.reportId,expectedReportVersion:1,expectedSubmissionVersion:2,expectedSafetyVersion:0,decision:'remove',note:'Fixture current safety removal'});assert.equal(removed.status,200,JSON.stringify(removed.body));
 nope(await nc(reader,{action:'detail',publicationId:second.live.id}));const disposition=(await sc(owner,{action:'read',collection:'dispositions',id:second.submission.submissionId})).body.data.record;
 const appeal={action:'appeal',operationId:uuid(),appealId:uuid(),submissionId:second.submission.submissionId,expectedSubmissionVersion:disposition.submissionVersion,expectedSafetyVersion:disposition.safetyVersion,basis:'safety_removal',statement:'Fixture author retained-source appeal',consent:'internal-safety-v1'};assert.equal((await sc(owner,appeal)).status,200);
 const restored=await rm({action:'appealReview',operationId:uuid(),appealId:appeal.appealId,expectedAppealVersion:1,expectedSubmissionVersion:disposition.submissionVersion,expectedSafetyVersion:disposition.safetyVersion,decision:'restore',note:'Independent retained-source restoration'});assert.equal(restored.status,200,JSON.stringify(restored.body));
 assert.equal((await sc(reader,{action:'object',submissionId:second.submission.submissionId})).status,200,'source restoration remains legitimate J2');nope(await nc(reader,{action:'detail',publicationId:second.live.id}));assert.equal(ok(await nc(reader,{action:'reference',referenceId:second.save.referenceId})).reference.experience,null,'old reference never silently rebinds');
 const third=await chain('rights erasure');
 const block={action:'block',operationId:uuid(),blockId:uuid(),submissionId:third.submission.submissionId,expectedSubmissionVersion:2,expectedSafetyVersion:0};assert.equal((await sc(reader,block)).status,200);nope(await nc(reader,{action:'detail',publicationId:third.live.id}));assert.equal(ok(await nc(reader,{action:'reference',referenceId:third.save.referenceId})).reference.experience,null);
 assert.equal((await sc(reader,{action:'unblock',operationId:uuid(),blockId:block.blockId,expectedVersion:1})).status,200);
 const ownedReviews=ok(await rc({action:'export'}));assert.ok(ownedReviews.authoredRightsReviews.length>=3);assert.ok(ownedReviews.authoredRightsReviews.every(x=>x.note));assert.ok(!JSON.stringify(ownedReviews).includes(owner.id));assert.ok(!JSON.stringify(ownedReviews).includes(third.submission.content));
 ok(await rc({action:'delete',operationId:uuid(),confirmed:true}));nope(await nc(reader,{action:'detail',publicationId:third.live.id}));const clearedRights=ok(await rc({action:'export'}));assert.ok(clearedRights.authoredRightsReviews.every(x=>x.note===null));assert.equal(clearedRights.qualification,null);
 const readerExport=ok(await nc(reader,{action:'export'}));assert.ok(readerExport.references.length>=3);assert.ok(readerExport.references.every(x=>x.experience===null));assert.ok(!JSON.stringify(readerExport).includes(third.submission.content));
 ok(await nc(reader,{action:'delete',operationId:uuid(),confirmed:true}));const erasedReader=ok(await nc(reader,{action:'export'}));assert.ok(erasedReader.references.every(x=>x.state==='erased' && x.publicationId===null && x.experience===null));
 const planAfterScopedDelete=(await call(readerTrip.api,reader.accessToken)).body;assert.equal(planAfterScopedDelete.trip.headVersion,2);assert.deepEqual(planAfterScopedDelete.content,confirmedPlan.content,'scoped reference deletion does not erase or rewrite a confirmed Trip');
 // Re-enrollment cannot restore publications invalidated by rights deletion.
 sql(`insert into community_publication_private.qualifications(actor_id,rights_reviewer) values(${literal(rights.id)},true);`);nope(await nc(reader,{action:'detail',publicationId:third.live.id}));
 if(process.env.VP_COMMUNITY_PUBLICATION_RECORD_FIXTURE==='1') {mkdirSync('tests/fixtures/community/publication',{recursive:true});writeFileSync('tests/fixtures/community/publication/producer.json',JSON.stringify({fixtureSchema:'community-publication-j3j4-fixture/1',endpoint:ports.api,samples:{list,unavailable,replay,ownedReviews,clearedRights,readerExport,erasedReader}},null,2)+'\n',{mode:0o600});}
 const replacement=uuid();const credential=await call('/api/auth/native/v2/credentials',null,{email:owner.email,password:owner.password,attemptId:replacement});assert.equal(credential.status,200);assert.equal((await call('/api/auth/native/v2/login',credential.body.accessToken,{attemptId:replacement})).status,200);assert.equal((await nc(owner,{action:'mine',cursor:null})).status,401,'old native scope cannot read or clean up');
 t.diagnostic('Settings/grants/qualification/data confined to the named disposable instance. Real ordinary Auth+HTTP+original canonical Save/Proposal/explicit Confirm observed; real target/public/provider/device/unified account exit UNRUN. Fixture canonical mapping is not real provider evidence.');
});
