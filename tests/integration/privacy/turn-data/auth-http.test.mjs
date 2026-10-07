// Owned disposable Auth -> original producer -> registered privacy HTTP -> source effects -> original D2 bytes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as uuid,randomBytes,createHash } from 'node:crypto';
import { spawn,execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createWriteStream,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { identityLocalEnv } from '../../identity/local-supabase.mjs';
import { nativeHTTPEnvironmentPorts } from '../../turn/native-http-ports.mjs';
import { waitForNativeAPI } from '../../identity/native-api-readiness.mjs';
import { runConfiguredCoreExport } from '../../../../lib/server/privacy/export-runner.mjs';
import { turnDigest } from '../../../../lib/server/privacy/turn-data/contract.ts';
import { decodeTurnList,decodeTurnPreview,decodeTurnReceipt } from '../../../../lib/server/privacy/turn-data/protocol.ts';
import { decodeTurnExportPage } from '../../../../lib/server/privacy/turn-data/export.ts';
import { CATALOG_VERSION } from '../../../../lib/server/privacy/coverage/catalog.ts';
import { matchesCoverageResult } from '../../../../lib/server/privacy/coverage/consumer.ts';

test('real signed owner erases one completed Turn and preserves actual parents/other Turn, then original D2 exports remaining sources',{
  skip:process.env.VP_TURN_DATA_HTTP!=='true',timeout:300000,
},async t=>{
  const ports=nativeHTTPEnvironmentPorts(process.env),local=identityLocalEnv();assert.equal(local?.API_URL,ports.supabaseAPI);
  assert.match(local.DB_CONTAINER,/^supabase_db_vp-native-ask-[a-f0-9]{8}$/);
  const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
  const sql=q=>execFileSync('docker',['exec','-i',local.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1'],{
    input:"set statement_timeout='15s';"+q,encoding:'utf8',stdio:['pipe','pipe','pipe'],
  }).trim();
  const publishable=local.PUBLISHABLE_KEY||local.ANON_KEY,users=[];let next;
  t.after(async()=>{
    if(next&&next.exitCode===null){const stopped=once(next,'exit');next.kill('SIGTERM');await Promise.race([stopped,new Promise(r=>setTimeout(r,3000))]);if(next.exitCode===null){next.kill('SIGKILL');await stopped;}}
    for(const u of users)sql(`delete from public.trip_events where owner_id='${u.id}';delete from public.trip_audit_events where owner_id='${u.id}';delete from auth.users where id='${u.id}';`);
    assert.equal(sql('select count(*) from auth.users where id in('+users.map(u=>literal(u.id)).concat([literal('00000000-0000-4000-8000-000000000000')]).join(',')+');'),'0');
  });
  const policyConfig={enabled:true,environment:'local',maxRunMs:90000,artifactTtlMs:60000,downloadTicketTtlMs:30000,maxPages:100,pageSize:100,maxBytes:500000};
  const keyConfig={algorithm:'AES-256-GCM',keyId:'owned-turn-data-key',key:randomBytes(32).toString('base64url')};
  const env={NEXT_PUBLIC_SUPABASE_URL:local.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:publishable,
    VISEPANDA_NATIVE_LOCAL_SESSION:'true',VISEPANDA_NATIVE_LOCAL_TRIP:'true',VISEPANDA_NATIVE_LOCAL_SERVICE_KEY:local.SERVICE_ROLE_KEY,
    VISEPANDA_TRIP_PROTOCOL_V2:'true',DATA_TURN_DATA_LOCAL:'1',DATA_COVERAGE_LOCAL:'1',VISEPANDA_CORE_EXPORT_POLICY:JSON.stringify(policyConfig),VISEPANDA_CORE_EXPORT_KEY:JSON.stringify(keyConfig),
    VISEPANDA_NATIVE_STAGING:'false',VISEPANDA_NATIVE_PRODUCTION:'false',VERCEL_ENV:''};
  const log=createWriteStream(join(process.env.VP_IDENTITY_SUPABASE_WORKDIR,'turn-data-next.log'),{mode:0o600});
  next=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(ports.apiPort)],{env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
  next.stdout.pipe(log);next.stderr.pipe(log);next.once('exit',()=>log.end());await waitForNativeAPI(ports.api,next);
  const call=async(route,token,body,method='POST',headers={})=>{
    const r=await fetch(ports.api+route,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)}),signal:AbortSignal.timeout(60000)});
    return {status:r.status,body:await r.json(),headers:r.headers};
  };
  async function user(){
    const c=createClient(local.API_URL,publishable,{auth:{persistSession:false,autoRefreshToken:false}}),email='vp-turn-data-'+uuid()+'@example.test',password='Owned-Disposable-'+uuid()+'!';
    const signup=await c.auth.signUp({email,password});assert.equal(signup.error,null);assert.ok(signup.data.user);const row={id:signup.data.user.id};users.push(row);
    const attemptId=uuid(),credentials=await call('/api/auth/native/v2/credentials',null,{email,password,attemptId});assert.equal(credentials.status,200);
    assert.equal((await call('/api/auth/native/v2/login',credentials.body.accessToken,{attemptId})).status,200);
    const client=createClient(local.API_URL,publishable,{global:{headers:{Authorization:'Bearer '+credentials.body.accessToken}},auth:{persistSession:false,autoRefreshToken:false}});
    const session=await client.rpc('native_session_v2',{p_action:'session'});assert.equal(session.error,null);
    return {...row,client,token:credentials.body.accessToken,actor:{ownerId:row.id,sessionId:session.data.sessionId,mobileEpoch:session.data.mobileEpoch}};
  }
  const owner=await user(),foreign=await user(),path='/api/privacy/native/v1/turn-data',list={action:'list',scope:'turn-sensitive-data/1',cursor:null,limit:20};
  assert.equal((await call(path,owner.token,list)).status,503,'New RPC remains ungranted in actual full local migration set');
  for(const role of ['anon','authenticated','service_role'])assert.equal(sql('select has_function_privilege('+literal(role)+",'public.privacy_turn_data_v1(text,text,bigint)','execute');"),'f');
  sql('grant execute on function public.privacy_turn_data_v1(text,text,bigint) to authenticated;grant execute on function public.privacy_core_export_v1(text,jsonb) to authenticated,service_role;');
  t.diagnostic('Only owned disposable fixture grants existing-role RPCs; no target grants/new role/provider send/fees or real-user data.');
  const policy=uuid(),conversation=uuid(),notice='a'.repeat(64);
  sql(`insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at)
    values('${policy}','qwen','synthetic fixture','https://fixture.invalid/v1','local','local','local','fixture','fixture','${notice}','合成','Synthetic','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day');`);
  const accepted=await owner.client.rpc('accept_text_policy',{p_policy_id:policy,p_notice_hash:notice});assert.equal(accepted.error,null);assert.equal(accepted.data.kind,'accepted');
  const service=createClient(local.API_URL,local.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  async function completed(text){
    const message=uuid(),turn=uuid(),r=await owner.client.rpc('submit_assistant_message_v1',{p_conversation_id:conversation,p_message_id:message,p_idempotency_key:uuid(),p_policy_id:policy,p_locale:'en',p_text:text,p_relationship:'independent_question',p_goal_id:null,p_expected_goal_version:null,p_task_id:null,p_parent_message_id:null,p_turn_id:turn});
    assert.equal(r.error,null);assert.equal(r.data.kind,'accepted');
    const claimed=await service.rpc('claim_text_work',{p_owner_id:owner.id,p_policy_id:policy});assert.equal(claimed.error,null);assert.equal(claimed.data.kind,'leased');assert.equal(claimed.data.turnId,turn);
    const keys={p_turn_id:turn,p_lease_token:claimed.data.leaseToken};const authorization=await service.rpc('authorize_text_dispatch',{...keys,p_policy_id:policy,p_provider:'qwen'});assert.equal(authorization.error,null);assert.equal(authorization.data.kind,'authorized');
    const done=await service.rpc('complete_text_work',{...keys,p_kind:'answered',p_text:'Original synthetic completed output '+text});assert.equal(done.error,null);assert.equal(done.data.kind,'finished');
    return {message,turn,task:sql(`select task_id from turn_private.service_task_turns where turn_id='${turn}';`)};
  }
  const selected=await completed('Selected original input'),other=await completed('Preserved other input');
  const trip=uuid();assert.equal((await call('/api/trips/native/v2',owner.token,{tripId:trip,title:'Retained confirmed Trip'})).status,201);
  const proposal=await call('/api/trips/native/v2/'+trip+'/proposal',owner.token,{patch:{expectedVersion:0,operations:[{kind:'set_title',title:'Original confirmed Trip body'}]}});assert.equal(proposal.status,201);
  const diff=await call('/api/trips/native/v2/'+trip+'/proposal?proposalId='+proposal.body.proposalId,owner.token,undefined,'GET');assert.equal(diff.status,200);
  assert.equal((await call('/api/trips/native/v2/'+trip+'/confirm',owner.token,{proposalId:proposal.body.proposalId,idempotencyKey:uuid(),digest:diff.body.proposal.digest})).status,200);
  const mc=await owner.client.rpc('native_memory_command_v1',{p_input:{action:'consentCreate',operationId:uuid()}});assert.equal(mc.error,null);
  const explicit=await owner.client.rpc('native_memory_command_v1',{p_input:{action:'create',operationId:uuid(),memoryId:uuid(),receiptId:uuid(),consentId:mc.data.consentId,constraintKind:'preference',summary:'Retained explicit Memory',saveLongTerm:true}});assert.equal(explicit.error,null);
  const stable=()=>sql(`select jsonb_build_object('conversation',(select to_jsonb(v) from turn_private.assistant_conversations v where id='${conversation}'),
    'otherTurn',(select to_jsonb(v) from public.turns v where id='${other.turn}'),'otherText',(select to_jsonb(v) from turn_private.text_content v where turn_id='${other.turn}'),
    'otherMessage',(select to_jsonb(v) from turn_private.assistant_messages v where id='${other.message}'),'otherTask',(select to_jsonb(v) from turn_private.service_tasks v where id='${other.task}'),
    'trip',(select to_jsonb(v) from public.trips v where id='${trip}'),
    'tripSnapshots',(select jsonb_agg(to_jsonb(v) order by version) from public.trip_version_snapshots v where trip_id='${trip}'),
    'tripEvents',(select jsonb_agg(to_jsonb(v) order by id) from public.trip_events v where trip_id='${trip}'),
    'tripProposals',(select jsonb_agg(to_jsonb(v) order by id) from public.trip_proposals v where trip_id='${trip}'),
    'memory',(select jsonb_agg(to_jsonb(v) order by id) from public.memory_profiles v where owner_id='${owner.id}'),
    'memoryReceipts',(select jsonb_agg(to_jsonb(v) order by id) from public.memory_receipts v where owner_id='${owner.id}'),
    'selectedDispatchMetadata',(select jsonb_agg(to_jsonb(v) order by lease_token) from turn_private.text_dispatches v where turn_id='${selected.turn}'),
    'selectedTaskMetadata',(select to_jsonb(v)-'goal_digest' from turn_private.service_tasks v where id='${selected.task}'),
    'selectedThread',(select to_jsonb(v) from public.chat_threads v join public.turns t on t.thread_id=v.id where t.id='${selected.turn}'),
    'budget',(select coalesce(jsonb_agg(to_jsonb(v) order by scope_id,attempt_id),'[]') from public.model_budget_attempts v where task_id in('${selected.turn}','${selected.task}','${other.turn}','${other.task}')));`);
  assert.equal((await call('/api/privacy/native/v1/coverage',owner.token,undefined,'GET')).status,200);
  const before=stable(),inventory=await call(path,owner.token,list);assert.equal(inventory.status,200);assert.ok(decodeTurnList(inventory.body.data,list,owner.actor,Date.now()));assert.equal(inventory.body.data.items.length,2);
  const s={scope:list.scope,requestId:uuid(),turnId:selected.turn,objectIds:[]},p={action:'preview',...s};assert.notEqual((await call(path,foreign.token,p)).status,200);
  const planned=await call(path,owner.token,p);assert.equal(planned.status,200);assert.ok(decodeTurnPreview(planned.body.data,p,owner.actor,Date.now()));assert.equal(planned.body.data.eligible,true);assert.deepEqual(planned.body.data.graph.turnIds,[selected.turn]);
  const erase={action:'erase',...s,sourceDigest:planned.body.data.sourceDigest,previewDigest:planned.body.data.previewDigest,confirmed:true},raw='\n '+JSON.stringify(erase)+' ';
  const envelope={schemaVersion:'data-coverage/1',catalogVersion:CATALOG_VERSION,actorId:owner.id,sessionId:owner.actor.sessionId,mobileEpoch:owner.actor.mobileEpoch,moduleId:'turn',moduleVersion:'turn-data/1',operationId:s.requestId,action:'delete',phase:'execute',confirmed:true,tripId:null,commandBytes:raw};
  const erased=await call('/api/privacy/native/v1/coverage',owner.token,envelope);assert.equal(erased.status,200);assert.ok(matchesCoverageResult(erased.body,JSON.stringify(envelope)));assert.equal(erased.body.state,'scoped_complete');
  const original=erased.body.result.data;assert.ok(decodeTurnReceipt(original,erase,owner.actor,turnDigest(raw),Date.now()));assert.equal(original.decision.parentData,'selected_digest_redacted');assert.equal(stable(),before);
  assert.equal(sql(`select input_text='[deleted by scoped turn request]' and output_text is null and output_kind is null and hidden_at is not null from turn_private.text_content where turn_id='${selected.turn}';`),'t');
  assert.equal(sql(`select input_text='[deleted by scoped turn request]' from turn_private.assistant_messages where id='${selected.message}';`),'t');
  assert.equal(sql(`select count(*) from public.chat_turn_events where turn_id='${selected.turn}';`),'0');assert.equal(sql(`select count(*) from turn_private.work where turn_id='${selected.turn}';`),'0');
  const recovered=await call(path,owner.token,{action:'recover',...s,mutationBytes:raw});assert.equal(recovered.status,200);assert.deepEqual(recovered.body.data,original);
  assert.notEqual((await call(path,owner.token,{action:'recover',...s,mutationBytes:JSON.stringify(erase)})).status,200);
  const ps={scope:'turn-delete-progress/1',requestId:uuid(),turnId:null,objectIds:[s.requestId]},pc={action:'preview',...ps};
  const progress=await call(path,owner.token,pc);assert.equal(progress.status,200);assert.ok(decodeTurnPreview(progress.body.data,pc,owner.actor,Date.now()));assert.equal(progress.body.data.eligible,true);
  const pe={action:'erase',...ps,sourceDigest:progress.body.data.sourceDigest,previewDigest:progress.body.data.previewDigest,confirmed:true},pb=JSON.stringify(pe);
  const pr=await call(path,owner.token,pb);assert.equal(pr.status,200);assert.ok(decodeTurnReceipt(pr.body.data,pe,owner.actor,turnDigest(pb),Date.now()));assert.equal(pr.body.data.decision.sourceTurn,'not_modified');assert.equal(stable(),before);
  const fresh=await completed('Fresh same-conversation unrelated input');assert.ok(fresh.turn);
  const afterFresh=JSON.parse(stable()),beforeFresh=JSON.parse(before);assert.equal(afterFresh.conversation.next_sequence,beforeFresh.conversation.next_sequence+1);
  afterFresh.conversation.next_sequence=beforeFresh.conversation.next_sequence;assert.deepEqual(afterFresh,beforeFresh,'Only original conversation sequence advances for fresh unrelated Turn');
  const keyFile=join(process.env.VP_IDENTITY_SUPABASE_WORKDIR,'turn-export-key.json'),serviceFile=join(process.env.VP_IDENTITY_SUPABASE_WORKDIR,'turn-export-service-key');
  writeFileSync(keyFile,JSON.stringify(keyConfig),{mode:0o600});writeFileSync(serviceFile,local.SERVICE_ROLE_KEY,{mode:0o600});
  const requestId=uuid(),queued=await call('/api/privacy/native/v1/exports',owner.token,{requestId,confirmed:true});assert.equal(queued.status,202);
  const exportReceipt=await runConfiguredCoreExport(requestId,{configuration:{VISEPANDA_CORE_EXPORT_POLICY:JSON.stringify(policyConfig),VP_PRIVACY_EXPORT_DB_URL:local.API_URL,VP_PRIVACY_EXPORT_KEY_FILE:keyFile,VP_PRIVACY_EXPORT_DB_KEY_FILE:serviceFile}});
  const turnModule=exportReceipt.modules.find(m=>m.module==='turn');assert.deepEqual([turnModule.status,turnModule.reason,turnModule.pages,turnModule.rows],['complete','NONE',1,1]);
  const ticket=await call('/api/privacy/native/v1/exports/'+requestId+'/download-ticket',owner.token,{});assert.equal(ticket.status,200);
  const download=await fetch(ports.api+'/api/privacy/native/v1/exports/'+requestId+'/download',{headers:{Authorization:'Bearer '+owner.token,'X-Export-Download-Token':ticket.body.token,'X-Export-Operation-ID':ticket.body.operationId},signal:AbortSignal.timeout(60000)});assert.equal(download.status,200);
  const exported=Buffer.from(await download.arrayBuffer());assert.equal(createHash('sha256').update(exported).digest('hex'),exportReceipt.artifactDigest);assert.equal(exported.length,exportReceipt.artifactBytes);
  const bundle=JSON.parse(exported.toString('utf8'));assert.ok(decodeTurnExportPage({schemaVersion:'turn-core-export/1',section:'snapshot',sourceDigest:turnModule.digest,items:bundle.data.turn.snapshot,hasMore:false,nextCursor:null,sectionComplete:true},100,owner.id,Date.now()));
  assert.equal(exported.includes('Selected original input'),false);assert.equal(exported.includes('Preserved other input'),true);assert.equal(bundle.allUserDataCompleted,false);
  const blocked=await call(path,owner.token,{action:'preview',scope:list.scope,requestId:uuid(),turnId:other.turn,objectIds:[]});assert.equal(blocked.status,200);assert.equal(blocked.body.data.eligible,false);assert.ok(blocked.body.data.conflicts.includes('CORE_EXPORT_COPY'),'Actual mixed D2 ciphertext cannot be silently erased with another selected Turn');
});
