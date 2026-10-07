// Real owned GoTrue/JWT -> original registered configured D2 worker -> encrypted owner HTTP download.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as uuid, randomBytes, createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createWriteStream, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { identityLocalEnv } from '../../identity/local-supabase.mjs';
import { nativeHTTPEnvironmentPorts } from '../../turn/native-http-ports.mjs';
import { waitForNativeAPI } from '../../identity/native-api-readiness.mjs';
import { runConfiguredCoreExport } from '../../../../lib/server/privacy/export-runner.mjs';
import { coreExportHTTP } from '../../../../lib/server/privacy/export-http.ts';
import { decodeProfileExportPage } from '../../../../lib/server/privacy/profile-export/contract.ts';

test('signed owner Auth consumes an actual Profile snapshot, real protected bytes and clear-before-consume source fence', {
  skip: process.env.VP_PROFILE_EXPORT_HTTP !== 'true', timeout:300000,
}, async t => {
  const ports=nativeHTTPEnvironmentPorts(process.env),local=identityLocalEnv();
  assert.equal(local?.API_URL,ports.supabaseAPI);assert.match(local.DB_CONTAINER,/^supabase_db_vp-native-ask-[a-f0-9]{8}$/);
  const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
  const sql=q=>execFileSync('docker',['exec','-i',local.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1'],
    {input:"set statement_timeout='15s';"+q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
  const publishable=local.PUBLISHABLE_KEY||local.ANON_KEY,users=[];let next;
  t.after(async()=>{
    if(next && next.exitCode===null){const stopped=once(next,'exit');next.kill('SIGTERM');await Promise.race([stopped,new Promise(r=>setTimeout(r,3000))]);if(next.exitCode===null){next.kill('SIGKILL');await stopped;}}
    for(const user of users)sql('delete from auth.users where id='+literal(user.id)+';');
    if(users.length)assert.equal(sql('select count(*) from auth.users where id in('+users.map(u=>literal(u.id)).join(',')+');'),'0');
  });
  const policy={enabled:true,environment:'local',maxRunMs:90000,artifactTtlMs:60000,downloadTicketTtlMs:30000,maxPages:100,pageSize:100,maxBytes:500000};
  const keyConfig={algorithm:'AES-256-GCM',keyId:'owned-profile-export-key',key:randomBytes(32).toString('base64url')};
  const env={NEXT_PUBLIC_SUPABASE_URL:local.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:publishable,
    VISEPANDA_NATIVE_LOCAL_SESSION:'true',VISEPANDA_NATIVE_LOCAL_TRIP:'true',VISEPANDA_NATIVE_LOCAL_SERVICE_KEY:local.SERVICE_ROLE_KEY,
    VISEPANDA_TRIP_PROTOCOL_V2:'true',DATA_PROFILE_DATA_LOCAL:'1',VISEPANDA_CORE_EXPORT_POLICY:JSON.stringify(policy),VISEPANDA_CORE_EXPORT_KEY:JSON.stringify(keyConfig),
    VISEPANDA_NATIVE_STAGING:'false',VISEPANDA_NATIVE_PRODUCTION:'false',VERCEL_ENV:''};
  const originalEnv=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
  t.after(()=>{for(const[k,v]of Object.entries(originalEnv))v===undefined?delete process.env[k]:process.env[k]=v;});
  const log=createWriteStream(join(process.env.VP_IDENTITY_SUPABASE_WORKDIR,'profile-export-next.log'),{mode:0o600});
  next=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(ports.apiPort)],
    {env:{...process.env,...env},stdio:['ignore','pipe','pipe']});next.stdout.pipe(log);next.stderr.pipe(log);next.once('exit',()=>log.end());
  await waitForNativeAPI(ports.api,next);
  const call=async(route,token,body,method='POST',headers={})=>{
    const response=await fetch(ports.api+route,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json',...headers},
      ...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)}),signal:AbortSignal.timeout(60000)});
    return {status:response.status,body:await response.json(),headers:response.headers};
  };
  async function user(){
    const auth=createClient(local.API_URL,publishable,{auth:{persistSession:false,autoRefreshToken:false}});
    const email='vp-profile-export-'+uuid()+'@example.test',password='Owned-Disposable-'+uuid()+'!';
    const signup=await auth.auth.signUp({email,password});assert.equal(signup.error,null);assert.ok(signup.data.user&&signup.data.session);
    const row={id:signup.data.user.id};users.push(row);
    async function fresh(){
      const attemptId=uuid(),credentials=await call('/api/auth/native/v2/credentials',null,{email,password,attemptId});assert.equal(credentials.status,200);
      assert.equal((await call('/api/auth/native/v2/login',credentials.body.accessToken,{attemptId})).status,200);
      const client=createClient(local.API_URL,publishable,{global:{headers:{Authorization:'Bearer '+credentials.body.accessToken}},auth:{persistSession:false,autoRefreshToken:false}});
      const session=await client.rpc('native_session_v2',{p_action:'session'});assert.equal(session.error,null);
      return {...row,token:credentials.body.accessToken,client,actor:{ownerId:row.id,sessionId:session.data.sessionId,mobileEpoch:session.data.mobileEpoch}};
    }
    return {...await fresh(),fresh};
  }
  const owner=await user(),foreign=await user(),exports='/api/privacy/native/v1/exports';
  assert.equal(sql('select profile_data_private.schema_v1() and result_data_private.schema_supported_v1() and export_private.profile_hooks_valid_v1();'),'t',
    'Actual current full migration set must preserve strict Profile/Result schemas and the reviewed source/retrieval hooks');
  for(const role of ['anon','authenticated','service_role'])assert.equal(sql('select has_function_privilege('+literal(role)+",'public.privacy_core_export_v1(text,jsonb)','execute');"),'f');
  const denied=await call(exports,owner.token,{requestId:uuid(),confirmed:true});assert.equal(denied.status,503);
  sql('grant execute on function public.privacy_core_export_v1(text,jsonb) to authenticated,service_role;grant execute on function public.privacy_profile_data_v1(text,text,bigint) to authenticated;');
  t.diagnostic('Only owned disposable fixture grants original D2/Profile RPCs; no target/service-provider/Storage/fees/deploy/real user data.');
  const saved={p_display_name:'Signed owner 汉字😀',p_travel_pace:'relaxed',p_locale:'en',p_currency:'USD',p_distance_unit:'mile',p_temperature_unit:'fahrenheit',p_default_departure_time:'24:00:00.000000'};
  assert.equal((await owner.client.rpc('save_user_profile',saved)).error,null);
  const paceInput={action:'save',operationId:uuid(),expectedRevision:0,travelPace:'packed',noticeVersion:'local-planning-cross-trip-v1'};
  const pace=await owner.client.rpc('native_travel_pace_v1',{p_input:paceInput});assert.equal(pace.error,null);
  const initialPreviewId=uuid();
  const initialPreview=await call('/api/privacy/native/v1/profile-data',owner.token,{action:'preview',
    scope:'profile-sensitive-data/1',requestId:initialPreviewId,profileId:owner.id,objectIds:[]});
  assert.equal(initialPreview.status,200);assert.equal(initialPreview.body.data.eligible,true);
  assert.equal(initialPreview.body.data.profile.defaultDepartureTime,'24:00:00');
  const keyFile=join(process.env.VP_IDENTITY_SUPABASE_WORKDIR,'owned-export-key.json'),serviceFile=join(process.env.VP_IDENTITY_SUPABASE_WORKDIR,'owned-export-service-key');
  writeFileSync(keyFile,JSON.stringify(keyConfig),{mode:0o600});writeFileSync(serviceFile,local.SERVICE_ROLE_KEY,{mode:0o600});
  sql(`insert into export_private.core_policies_v1(id,revision,enabled,environment,key_id,max_run_ms,artifact_ttl_ms,ticket_ttl_ms,max_pages,page_size,max_bytes,valid_until)values('${uuid()}',1,true,'local','${keyConfig.keyId}',90000,60000,30000,100,100,500000,clock_timestamp()+interval '1 hour');`);
  const workerConfig={VP_PRIVACY_EXPORT_WORKER:'true',VP_PRIVACY_EXPORT_ENVIRONMENT:'local',VP_PRIVACY_LOCAL_DISPOSABLE:'true',VISEPANDA_CORE_EXPORT_POLICY:JSON.stringify(policy),
    VP_PRIVACY_EXPORT_DB_URL:local.API_URL,VP_PRIVACY_EXPORT_KEY_FILE:keyFile,VP_PRIVACY_EXPORT_DB_KEY_FILE:serviceFile};
  async function exportSnapshot(){
    const requestId=uuid(),queued=await call(exports,owner.token,{requestId,confirmed:true});assert.equal(queued.status,202);
    const receipt=await runConfiguredCoreExport(requestId,{configuration:workerConfig});assert.equal(receipt.state,'ready_partial');
    const module=receipt.modules.find(m=>m.module==='profile');assert.deepEqual([module.status,module.reason,module.pages,module.rows],['complete','NONE',1,1]);
    assert.equal(sql(`select count(*) from export_private.profile_snapshot_provenance_v1 where request_id='${requestId}' and generation=${receipt.generation};`),'1');
    const ticket=await call(exports+'/'+requestId+'/download-ticket',owner.token,{});assert.equal(ticket.status,200);
    return {requestId,receipt,ticket:ticket.body};
  }
  const ready=await exportSnapshot(),admission={...owner.actor};
  Object.assign(owner,await owner.fresh());assert.notEqual(owner.actor.sessionId,admission.sessionId);assert.ok(owner.actor.mobileEpoch>admission.mobileEpoch);
  const oldHeaders={'X-Export-Download-Token':ready.ticket.token,'X-Export-Operation-ID':ready.ticket.operationId};
  assert.notEqual((await call(exports+'/'+ready.requestId+'/download',owner.token,undefined,'GET',oldHeaders)).status,200,'Old ticket cannot transfer to the new Native session');
  const freshTicket=await call(exports+'/'+ready.requestId+'/download-ticket',owner.token,{});assert.equal(freshTicket.status,200,'Same owner fresh session may download originally admitted job');
  ready.ticket=freshTicket.body;
  assert.equal(sql(`select count(*) from export_private.profile_snapshot_provenance_v1 where request_id='${ready.requestId}' and session_id='${admission.sessionId}' and session_epoch=${admission.mobileEpoch};`),'1','Immutable proof retains original admission actor');
  const downloadHeaders={'X-Export-Download-Token':ready.ticket.token,'X-Export-Operation-ID':ready.ticket.operationId};
  assert.notEqual((await call(exports+'/'+ready.requestId+'/download',foreign.token,undefined,'GET',downloadHeaders)).status,200);
  const downloaded=await fetch(ports.api+exports+'/'+ready.requestId+'/download',{headers:{Authorization:'Bearer '+owner.token,...downloadHeaders},signal:AbortSignal.timeout(60000)});
  assert.equal(downloaded.status,200);assert.match(downloaded.headers.get('cache-control'),/private.*no-store/);
  const bytes=Buffer.from(await downloaded.arrayBuffer());assert.equal(bytes.length,ready.receipt.artifactBytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),ready.receipt.artifactDigest);
  const bundle=JSON.parse(bytes.toString('utf8')),item=bundle.data.profile.snapshot[0];assert.equal(item.profile.profile.displayName,saved.p_display_name);
  assert.deepEqual(Object.fromEntries(['displayName','travelPace','locale','currency','distanceUnit','temperatureUnit','defaultDepartureTime'].map(k=>[k,item.profile.profile[k]])),
    {displayName:saved.p_display_name,travelPace:'packed',locale:'en',currency:'USD',distanceUnit:'mile',temperatureUnit:'fahrenheit',defaultDepartureTime:'24:00:00'});
  assert.deepEqual(item.profile.profile.paceRequest,paceInput);assert.equal(item.profile.summary.hasPaceUndo,true);assert.deepEqual(item.sourceRows,{profiles:1,watermarks:1,operations:1});
  assert.equal(item.operations[0].requestId,initialPreviewId);assert.equal(item.operations[0].ownerId,owner.id);assert.equal(item.operations[0].sessionId,admission.sessionId);
  assert.deepEqual(item.operations[0].summary,initialPreview.body.data.summary);assert.equal(Object.hasOwn(item.operations[0],'profile'),false);
  assert.ok(decodeProfileExportPage({schemaVersion:'profile-core-export/1',section:'snapshot',sourceDigest:ready.receipt.modules.find(m=>m.module==='profile').digest,items:[item],hasMore:false,nextCursor:null,sectionComplete:true},100,owner.id,Date.now()));
  assert.equal(bundle.notices.downloadedFilesRecallable,false);assert.equal(bundle.allUserDataCompleted,false);
  assert.notEqual((await call(exports+'/'+ready.requestId+'/download',owner.token,undefined,'GET',downloadHeaders)).status,200);

  // Force a real source clear after actual download_prepare but before actual consume.
  const second=await exportSnapshot(),originalFetch=globalThis.fetch;let raced=false;
  t.mock.method(globalThis,'fetch',async(input,init)=>{
    const request=new Request(input,init),response=await originalFetch(input,init);
    if(!raced&&new URL(request.url).pathname.endsWith('/privacy_core_export_v1')&&request.method==='POST'){
      const body=await request.json();if(body.p_action==='download_prepare'&&response.status===200){
        const prepared=await response.clone().json();if(prepared.kind==='privacy_export_download/1'){
          raced=true;const selection={scope:'profile-sensitive-data/1',requestId:uuid(),profileId:owner.id,objectIds:[]};
          const preview=await owner.client.rpc('privacy_profile_data_v1',{p_action:'preview',p_input_bytes:JSON.stringify({action:'preview',...selection}),p_expected_epoch:owner.actor.mobileEpoch});
          assert.equal(preview.error,null);assert.equal(preview.data.eligible,true);
          const erase={action:'erase',...selection,sourceDigest:preview.data.sourceDigest,previewDigest:preview.data.previewDigest,confirmed:true};
          const cleared=await owner.client.rpc('privacy_profile_data_v1',{p_action:'erase',p_input_bytes:JSON.stringify(erase),p_expected_epoch:owner.actor.mobileEpoch});
          assert.equal(cleared.error,null);assert.equal(cleared.data.state,'erased');
        }
      }
    }
    return response;
  });
  const request=new Request(ports.api+exports+'/'+second.requestId+'/download',{headers:{Authorization:'Bearer '+owner.token,
    'X-Export-Download-Token':second.ticket.token,'X-Export-Operation-ID':second.ticket.operationId}});
  const blocked=await coreExportHTTP(request,'download',second.requestId,{policy:()=>JSON.stringify(policy),key:()=>JSON.stringify(keyConfig)});
  assert.equal(raced,true);assert.notEqual(blocked.status,200);assert.equal(sql(`select pace_state||':'||profile_saved_fields::text from public.user_profiles where owner_id='${owner.id}';`),'revoked:[]');
  assert.notEqual((await call(exports+'/'+second.requestId+'/download-ticket',owner.token,{})).status,200);
  assert.notEqual((await call(exports+'?requestId='+second.requestId,owner.token,undefined,'GET')).status,200);
});
