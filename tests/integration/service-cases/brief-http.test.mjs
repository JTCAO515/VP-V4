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
import {briefRequestDigest} from '../../../lib/server/service-cases/brief/http.ts';
import {BRIEF_NOTICE,decodeBrief,decodeBriefSourceOptions,decodeBriefDataBundle,decodeBriefOwnerState} from '../../../lib/server/service-cases/brief/contract.ts';
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";

test('disposable real Auth and cookie staff read explicitly selected live Brief sources with original Memory correction and bytes recovery',{
 skip:process.env.VP_TRAVELER_BRIEF_HTTP!=='true',timeout:300000,
},async t=>{
 const ports=nativeHTTPEnvironmentPorts(process.env),local=identityLocalEnv();
 assert.equal(local?.API_URL,ports.supabaseAPI);assert.match(local.DB_CONTAINER,/^supabase_db_vp-native-ask-[a-f0-9]{8}$/);
 const sql=q=>execFileSync('docker',['exec','-i',local.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1'],{input:"set statement_timeout='15s';"+q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 const key=local.PUBLISHABLE_KEY||local.ANON_KEY,users=[];let next;
 t.after(async()=>{
  if(next&&next.exitCode===null){const done=once(next,'exit');next.kill('SIGTERM');await Promise.race([done,new Promise(r=>setTimeout(r,3000))]);if(next.exitCode===null){next.kill('SIGKILL');await done;}}
  if(users.length)sql('delete from auth.users where id in('+users.map(u=>literal(u.id)).join(',')+');');
 });
 const log=createWriteStream(join(process.env.VP_IDENTITY_SUPABASE_WORKDIR,'brief-next.log'),{mode:0o600});
 next=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(ports.apiPort)],{env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:local.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key,VISEPANDA_NATIVE_LOCAL_SESSION:'true',VISEPANDA_NATIVE_LOCAL_SERVICE_KEY:local.SERVICE_ROLE_KEY,VISEPANDA_NATIVE_LOCAL_TRIP:'true',VISEPANDA_TRIP_PROTOCOL_V2:'true',SERVICE_CASES_LOCAL:'1',SERVICE_CASE_BRIEF_LOCAL:'1'},stdio:['ignore','pipe','pipe']});
 next.stdout.pipe(log);next.stderr.pipe(log);next.once('exit',()=>log.end());await waitForNativeAPI(ports.api,next);
 const call=async(path,token,body,headers={})=>{
  const r=await fetch(ports.api+path,{method:'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control'),disposition:r.headers.get('content-disposition')};
 };
 async function user(){
  const auth=createClient(local.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false}}),email='vpj31-'+uuid()+'@example.test',password='VPJ31-Disposable-'+uuid()+'!';
  const signup=await auth.auth.signUp({email,password});assert.equal(signup.error,null,'synthetic signup');assert.ok(signup.data.user&&signup.data.session);
  const row={id:signup.data.user.id,email,password};users.push(row);
  const attemptId=uuid(),credential=await call('/api/auth/native/v2/credentials',null,{email,password,attemptId});assert.equal(credential.status,200);
  const login=await call('/api/auth/native/v2/login',credential.body.accessToken,{attemptId});
  if(login.status!==200){
   const diagnostic=createClient(local.API_URL,key,{global:{headers:{Authorization:'Bearer '+credential.body.accessToken}},auth:{persistSession:false,autoRefreshToken:false}});
   const failed=await diagnostic.rpc('native_session_v2',{p_action:'login',p_attempt:attemptId});
   const message=failed.error?.message??'';
   t.diagnostic(JSON.stringify({phase:'original_native_login',sqlCode:failed.error?.code??'unknown',hint:/record.*has no field/.test(message)?'trigger_record_field':/ambiguous/.test(message)?'ambiguous_column':'unknown'}));
  }
  assert.equal(login.status,200,JSON.stringify(login.body));
  return {...row,...credential.body,sid:JSON.parse(Buffer.from(credential.body.accessToken.split('.')[1],'base64url')).session_id};
 }
 const owner=await user(),other=await user(),staff=await user();
 const native='/api/service-cases/native/brief/v1',legacy='/api/service-cases/native/v1',ops='/api/ops/service-cases/brief/v1',memory='/api/memory/native/v1/profiles',pace='/api/memory/native/v1/travel-pace';
 assert.equal((await call(native,null,{action:'source_options',caseId:uuid()})).status,401);
 assert.equal(sql("select has_function_privilege('authenticated','public.service_case_brief_v1(jsonb,text,text)','execute');"),'f');
 assert.equal((await call(native,owner.accessToken,{action:'source_options',caseId:uuid()})).status,503,'source default ACL remains denied');
 assert.equal(sql('select count(*) from service_cases_private.staff;'),'0');
 sql('grant execute on function public.service_case_brief_v1(jsonb,text,text) to authenticated;');
 assert.equal((await call(native,owner.accessToken,{action:'source_options',caseId:uuid()})).body.error.code,'BRIEF_DISABLED');
 sql('update service_brief_private.settings set enabled=true;');
 t.diagnostic('Default denied ACL, disabled feature and empty staff observed. Subsequent cases use disposable fixture GRANT and synthetic staff only; no target/provider/contact action.');
 const cookies=[],web=createServerClient(local.API_URL,key,{cookies:{getAll:()=>cookies,setAll:rows=>{for(const c of rows){const i=cookies.findIndex(x=>x.name===c.name);if(i>=0)cookies[i]=c;else cookies.push(c);}}}});
 const established=await web.auth.signInWithPassword({email:staff.email,password:staff.password});assert.equal(established.error,null);
 staff.sid=JSON.parse(Buffer.from(established.data.session.access_token.split('.')[1],'base64url')).session_id;
 const staffHeaders=()=>({Cookie:cookies.map(c=>`${c.name}=${c.value}`).join('; '),Origin:ports.api,'x-ops-expected-actor':staff.id,'x-ops-expected-session':staff.sid});
 const staffCall=(body,headers={})=>call(ops,null,body,{...staffHeaders(),...headers});
 const caseId=uuid();
 assert.equal((await call(legacy,owner.accessToken,{action:'create',caseId,category:'general',problem:'Synthetic explicit Case problem only'})).status,200);
 assert.equal((await staffCall({action:'locate',caseId})).status,403);
 sql(`insert into service_cases_private.staff(actor_id,label,active) values(${literal(staff.id)},'Disposable synthetic employee',true);`);
 assert.equal((await call(legacy,owner.accessToken,{action:'grant',caseId,expectedRevision:0,recipientId:staff.id,durationMinutes:15,sharedFields:['problem']})).status,200);
 assert.equal((await staffCall({action:'locate',caseId})).status,403,'ordinary problem grant is not Brief consent');
 const paceSave=await call(pace,owner.accessToken,{action:'save',operationId:uuid(),expectedRevision:0,travelPace:'relaxed',noticeVersion:'local-planning-cross-trip-v1'});assert.equal(paceSave.status,200,JSON.stringify(paceSave.body));
 const consent=await call(memory,owner.accessToken,{action:'consentCreate',operationId:uuid()});assert.equal(consent.status,200,JSON.stringify(consent.body));
 const memoryId=uuid(),sourceReceiptId=uuid(),saved=await call(memory,owner.accessToken,{action:'create',operationId:uuid(),memoryId,receiptId:sourceReceiptId,consentId:consent.body.receipt.consentId,constraintKind:'preference',summary:'Synthetic explicitly saved museum preference',saveLongTerm:true});assert.equal(saved.status,200,JSON.stringify(saved.body));
 const opts=await call(native,owner.accessToken,{action:'source_options',caseId});assert.equal(opts.status,200,JSON.stringify(opts.body));assert.ok(decodeBriefSourceOptions(opts.body.data));assert.equal(opts.body.data.intake,null,'no guessed budget source without a Case Trip/intake');assert.equal(opts.body.data.profilePace.value,'relaxed');assert.equal(opts.body.data.memories[0].source.id,memoryId);
 const sources={profilePace:true,memories:[{id:memoryId,revision:1}],intakeMessageId:null};
 const freshPreview=async()=>{
  const result=await call(native,owner.accessToken,{action:'preview',caseId,recipientId:staff.id,grantRevision:1,sources});assert.equal(result.status,200,JSON.stringify(result.body));assert.ok(decodeBrief(result.body.data));return result.body.data;
 };
 const p=await freshPreview();assert.equal(p.fields.find(f=>f.field==='budget').state,'unknown');assert.equal(p.fields.find(f=>f.field==='response_detail').state,'unknown');
 assert.equal((await staffCall({action:'locate',caseId})).status,403,'preview still grants no staff field access');
 const command={action:'share',operationId:uuid(),caseId,recipientId:staff.id,grantRevision:1,expectedRevision:p.revision,previewId:p.previewId,sourceDigest:p.sourceDigest,selectedKeys:['problem','travel_pace','memory:'+memoryId],noticeVersion:BRIEF_NOTICE,confirmed:true};
 const raw='\n'+JSON.stringify(command,null,2)+'\n',shared=await call(native,owner.accessToken,raw);assert.equal(shared.status,200,JSON.stringify(shared.body));assert.equal(shared.body.data.requestDigest,briefRequestDigest(raw));
 assert.deepEqual((await call(native,owner.accessToken,raw)).body,shared.body);assert.equal((await call(native,owner.accessToken,JSON.stringify(command))).status,409,'original byte identity is immutable');
 const locator=await staffCall({action:'locate',caseId});assert.equal(locator.status,200,JSON.stringify(locator.body));assert.ok(!('fields'in locator.body.data));
 const read={action:'read',caseId,recipientId:staff.id,grantRevision:1,expectedRevision:shared.body.data.revision};
 const viewed=await staffCall(read);assert.equal(viewed.status,200,JSON.stringify(viewed.body));assert.match(viewed.cache,/no-store/);assert.equal(viewed.body.data.fields.length,3);assert.equal(viewed.body.data.fields.find(f=>f.field==='preference').value,'Synthetic explicitly saved museum preference');
 assert.equal((await staffCall(read,{'x-ops-expected-session':uuid()})).status,403);assert.equal((await call(native,other.accessToken,read)).status,403);assert.equal((await staffCall({action:'export',requestId:uuid(),confirmed:true})).status,403);
 const corrected=await call(memory,owner.accessToken,{action:'update',operationId:uuid(),memoryId,sourceReceiptId,expectedRevision:1,summary:'Synthetic corrected nature preference',saveLongTerm:true});assert.equal(corrected.status,200,JSON.stringify(corrected.body));
 assert.notEqual((await staffCall(read)).status,200,'source correction denies old URL');assert.notEqual((await call(native,owner.accessToken,raw)).status,200,'old share retry cannot resurrect values');assert.notEqual((await call(native,owner.accessToken,{action:'read_preview',previewId:p.previewId})).status,200);
 sources.memories[0].revision=2;const p2=await freshPreview();assert.ok(p2.revision>p.revision);
 const nextShare={...command,operationId:uuid(),expectedRevision:p2.revision,previewId:p2.previewId,sourceDigest:p2.sourceDigest,selectedKeys:['memory:'+memoryId]},r2=await call(native,owner.accessToken,nextShare);assert.equal(r2.status,200,JSON.stringify(r2.body));
 const v2=await staffCall({...read,expectedRevision:r2.body.data.revision});assert.equal(v2.status,200);assert.equal(v2.body.data.fields.length,1,'unselected fields do not enter staff Brief');assert.equal(v2.body.data.fields[0].value,'Synthetic corrected nature preference');
 const audit=await call(native,owner.accessToken,{action:'audit',caseId});assert.equal(audit.status,200);assert.equal(audit.body.data.complete,true);assert.ok(audit.body.data.events.some(e=>e.action==='read'));assert.ok(!JSON.stringify(audit.body.data).includes('Synthetic corrected nature preference'));
 const pendingPreview=await freshPreview(),pending={...command,operationId:uuid(),expectedRevision:pendingPreview.revision,previewId:pendingPreview.previewId,sourceDigest:pendingPreview.sourceDigest},bytes=JSON.stringify(pending,null,1);
 assert.equal((await call(native,owner.accessToken,{action:'read_operation',operationId:pending.operationId})).body.data.receipt,null);
 const abandoned=await call(native,owner.accessToken,{action:'abandon',operationId:pending.operationId,mutationBytes:bytes});assert.equal(abandoned.status,200,JSON.stringify(abandoned.body));assert.equal(abandoned.body.data.outcome,'cancelled');assert.equal((await call(native,owner.accessToken,bytes)).body.data.outcome,'cancelled');
 // Privacy handlers remain operational with the new business feature switched off.
 sql('update service_brief_private.settings set enabled=false;');
 const requestId=uuid(),exported=await call(native,owner.accessToken,{action:'export',requestId,confirmed:true});assert.equal(exported.status,200,JSON.stringify(exported.body));assert.ok(decodeBriefDataBundle(exported.body.data));assert.match(exported.disposition,new RegExp(requestId));assert.equal(exported.body.data.coverage.sourceValues,'not_copied');assert.equal(exported.body.data.allUserDataCompleted,false);assert.ok(!JSON.stringify(exported.body.data.rows).includes('Synthetic corrected nature preference'));
 const deleted=await call(native,owner.accessToken,{action:'delete',operationId:uuid(),caseId,recipientId:staff.id,grantRevision:1,expectedRevision:r2.body.data.revision,confirmed:true});assert.equal(deleted.status,200,JSON.stringify(deleted.body));
 assert.equal((await call(native,owner.accessToken,{action:'read_operation',operationId:deleted.body.data.operationId})).status,200);
 sql('update service_brief_private.settings set enabled=true;');assert.notEqual((await staffCall({...read,expectedRevision:r2.body.data.revision})).status,200);assert.equal((await call(native,owner.accessToken,{action:'read_operation',operationId:nextShare.operationId})).status,410);
 assert.equal(sql(`select summary from public.memory_profiles where id=${literal(memoryId)};`),'Synthetic corrected nature preference','Brief deletion leaves the original Memory authority intact');
 // Synthetic limit rows exercise bounded audit without inventing human activity.
 const previewOnly=uuid();
 assert.equal((await call(legacy,owner.accessToken,{action:'create',caseId:previewOnly,category:'general',problem:'Synthetic preview-only privacy cleanup'})).status,200);
 const ungranted=await call(native,owner.accessToken,{action:'owner_state',caseId:previewOnly});assert.equal(ungranted.status,200);assert.equal(ungranted.body.data.recipientId,null);assert.equal(ungranted.body.data.briefRevision,0);
 assert.equal((await call(native,owner.accessToken,{action:'preview',caseId:previewOnly,recipientId:staff.id,grantRevision:0,sources:{profilePace:false,memories:[],intakeMessageId:null}})).status,403,'null recipient cannot create Brief or preview references');
 assert.equal(sql(`select count(*) from service_brief_private.previews where case_id=${literal(previewOnly)};`),'0');
 assert.equal((await call(legacy,owner.accessToken,{action:'grant',caseId:previewOnly,expectedRevision:0,recipientId:staff.id,durationMinutes:15,sharedFields:['problem']})).status,200);
 const noSources={profilePace:false,memories:[],intakeMessageId:null};
 const firstPreview=await call(native,owner.accessToken,{action:'preview',caseId:previewOnly,recipientId:staff.id,grantRevision:1,sources:noSources});assert.equal(firstPreview.status,200);
 let metadata=await call(native,owner.accessToken,{action:'owner_state',caseId:previewOnly});assert.equal(metadata.status,200,JSON.stringify(metadata.body));assert.ok(decodeBriefOwnerState(metadata.body.data));assert.equal(metadata.body.data.briefRevision,0);assert.equal(metadata.body.data.state,'absent');assert.ok(!('sourceDigest'in metadata.body.data));assert.ok(!('fields'in metadata.body.data));
 assert.equal((await call(native,other.accessToken,{action:'owner_state',caseId:previewOnly})).status,403);assert.equal((await staffCall({action:'owner_state',caseId:previewOnly})).status,403);
 sql(`insert into service_brief_private.audit(case_id,owner_id,revision,actor_id,action,recipient_id,grant_revision,field_keys) select ${literal(previewOnly)},${literal(owner.id)},0,${literal(owner.id)},'read',${literal(staff.id)},1,'[]'::jsonb from generate_series(1,201);update service_brief_private.settings set enabled=false;`);
 const unavailableAudit=await call(native,owner.accessToken,{action:'audit',caseId:previewOnly});assert.equal(unavailableAudit.status,503);assert.equal(unavailableAudit.body.error.code,'BRIEF_LIMIT');
 metadata=await call(native,owner.accessToken,{action:'owner_state',caseId:previewOnly});assert.equal(metadata.status,200);assert.equal(metadata.body.data.briefRevision,0);
 const deletedPreview=await call(native,owner.accessToken,{action:'delete',operationId:uuid(),caseId:metadata.body.data.caseId,recipientId:metadata.body.data.recipientId,grantRevision:metadata.body.data.grantRevision,expectedRevision:metadata.body.data.briefRevision,confirmed:true});assert.equal(deletedPreview.status,200,JSON.stringify(deletedPreview.body));assert.equal(deletedPreview.body.data.revision,1);
 assert.equal(sql(`select count(*) from service_brief_private.previews where case_id=${literal(previewOnly)};`),'0');assert.equal(sql(`select count(*) from service_brief_private.audit where case_id=${literal(previewOnly)};`),'0');
 sql('update service_brief_private.settings set enabled=true;');
 const revoked=uuid();assert.equal((await call(legacy,owner.accessToken,{action:'create',caseId:revoked,category:'general',problem:'Synthetic revoked-grant metadata cleanup'})).status,200);
 assert.equal((await call(legacy,owner.accessToken,{action:'grant',caseId:revoked,expectedRevision:0,recipientId:staff.id,durationMinutes:15,sharedFields:['problem']})).status,200);
 const revPreview=await call(native,owner.accessToken,{action:'preview',caseId:revoked,recipientId:staff.id,grantRevision:1,sources:noSources});assert.equal(revPreview.status,200);
 const revShare=await call(native,owner.accessToken,{...command,caseId:revoked,operationId:uuid(),expectedRevision:revPreview.body.data.revision,previewId:revPreview.body.data.previewId,sourceDigest:revPreview.body.data.sourceDigest,selectedKeys:['problem']});assert.equal(revShare.status,200);
 assert.equal((await call(legacy,owner.accessToken,{action:'revoke',caseId:revoked,expectedRevision:1})).status,200);
 sql('update service_brief_private.settings set enabled=false;');
 const revMeta=await call(native,owner.accessToken,{action:'owner_state',caseId:revoked});assert.equal(revMeta.status,200,JSON.stringify(revMeta.body));assert.equal(revMeta.body.data.grantRevision,2);assert.equal(revMeta.body.data.state,'invalidated');assert.equal(revMeta.body.data.recipientId,staff.id);
 const cleaned=await call(native,owner.accessToken,{action:'withdraw',operationId:uuid(),caseId:revoked,recipientId:revMeta.body.data.recipientId,grantRevision:revMeta.body.data.grantRevision,expectedRevision:revMeta.body.data.briefRevision,confirmed:true});assert.equal(cleaned.status,200,JSON.stringify(cleaned.body));assert.equal(cleaned.body.data.revision,revMeta.body.data.briefRevision+1);
 assert.equal((await call(native,owner.accessToken,{action:'owner_state',caseId:uuid()})).status,403,'deleted or unknown Case has no owner metadata');
 assert.equal(sql('select count(*) from public.trips;'),'0');assert.equal(sql('select count(*) from public.trip_proposals;'),'0');
});
