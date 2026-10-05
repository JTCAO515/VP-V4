import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid,createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {createWriteStream,writeFileSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {identityLocalEnv} from '../identity/local-supabase.mjs';
import {nativeHTTPEnvironmentPorts} from '../turn/native-http-ports.mjs';
import {waitForNativeAPI} from '../identity/native-api-readiness.mjs';

function sameItems(actual,expected){
  assert.equal(actual.length,expected.length);
  for(let index=0;index<expected.length;index++){
    const a=actual[index],b=expected[index];
    const {startsAt:as,endsAt:ae,...af}=a,{startsAt:bs,endsAt:be,...bf}=b;
    assert.deepEqual(af,bf,'preserve every non-time field and exact ordering');
    for(const field of ['startsAt','endsAt']){
      assert.equal(Object.hasOwn(a,field),Object.hasOwn(b,field),'preserve optional fixed time presence');
      if(Object.hasOwn(b,field)){
        for(const value of [a[field],b[field]]){
          assert.equal(typeof value,'string');
          assert.match(value,/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/);
          assert(Number.isFinite(Date.parse(value)),'valid original fixed time required');
        }
        assert.equal(Date.parse(a[field]),Date.parse(b[field]),'preserve exact instant without tolerance');
      }
    }
  }
}

test('bounded PDF corrected metadata through real Auth/HTTP/durable RPC/original explicit confirm and same Trip recovery',{
  skip:process.env.VP_PDF_INTAKE_HTTP!=='true',timeout:process.env.VP_PDF_NATIVE_INTEGRATION==='1'?900000:300000,
},async t=>{
  const ports=nativeHTTPEnvironmentPorts(process.env),local=identityLocalEnv();
  assert.equal(local?.API_URL,ports.supabaseAPI);assert.match(local.DB_CONTAINER,/^supabase_db_vp-native-ask-[a-f0-9]{8}$/);
  const key=local.PUBLISHABLE_KEY||local.ANON_KEY,users=[];let next;
  const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
  const sql=q=>execFileSync('docker',['exec','-i',local.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1'],
    {input:"set statement_timeout='15s';"+q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
  t.after(async()=>{
    if(next&&next.exitCode===null){const done=once(next,'exit');next.kill('SIGTERM');await Promise.race([done,new Promise(r=>setTimeout(r,3000))]);if(next.exitCode===null){next.kill('SIGKILL');await done;}}
    if(users.length)sql('delete from auth.users where id in('+users.map(u=>literal(u.id)).join(',')+');');
  });
  const log=createWriteStream(join(process.env.VP_IDENTITY_SUPABASE_WORKDIR,'pdf-next.log'),{mode:0o600});
  next=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(ports.apiPort)],{
    env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:local.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key,
      VISEPANDA_NATIVE_LOCAL_SESSION:'true',VISEPANDA_NATIVE_LOCAL_SERVICE_KEY:local.SERVICE_ROLE_KEY,
      VISEPANDA_NATIVE_LOCAL_TRIP:'true',VISEPANDA_TRIP_PROTOCOL_V2:'true'},stdio:['ignore','pipe','pipe']});
  next.stdout.pipe(log);next.stderr.pipe(log);next.once('exit',()=>log.end());await waitForNativeAPI(ports.api,next);
  const call=async(path,token,body,method='POST',headers={})=>{
    const r=await fetch(ports.api+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json',...headers},
      ...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
    return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};
  };
  async function user(){
    const auth=createClient(local.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false}}),email='vpj55-'+uuid()+'@example.test',password='VPJ55-Disposable-'+uuid()+'!';
    const signup=await auth.auth.signUp({email,password});assert.equal(signup.error,null);assert.ok(signup.data.user&&signup.data.session);
    const row={id:signup.data.user.id,email,password};users.push(row);
    const attemptId=uuid(),credential=await call('/api/auth/native/v2/credentials',null,{email,password,attemptId});assert.equal(credential.status,200);
    assert.equal((await call('/api/auth/native/v2/login',credential.body.accessToken,{attemptId})).status,200);
    return {...row,token:credential.body.accessToken};
  }
  const owner=await user(),other=await user(),tripId=uuid(),base='/api/trips/native/v2/'+tripId,pdf=base+'/pdf-intake';
  assert.equal((await call('/api/trips/native/v2',owner.token,{tripId,title:'Synthetic PDF original Trip'})).status,201);
  const originalPatch={expectedVersion:0,operations:[{kind:'upsert_day',dayId:'original_day',date:'2026-10-06',timeZone:'Asia/Shanghai'},
    {kind:'upsert_item',itemId:'z_fixed_order',dayId:'original_day',title:'Synthetic fixed original booking',startsAt:'2026-10-06T10:00:00+08:00',endsAt:'2026-10-06T12:00:00+08:00'},
    {kind:'upsert_item',itemId:'a_activity',dayId:'original_day',title:'Synthetic original activity'},
    {kind:'reorder_items',dayId:'original_day',itemIds:['z_fixed_order','a_activity']}]};
  const created=await call(base+'/proposal',owner.token,{patch:originalPatch});assert.equal(created.status,201);
  async function pending(id){const r=await call(base+'/proposal?proposalId='+id,owner.token,undefined,'GET');assert.equal(r.status,200);assert.equal(r.body.proposal.stale,false);return r.body.proposal;}
  async function confirm(id){const p=await pending(id);const r=await call(base+'/confirm',owner.token,{proposalId:id,idempotencyKey:uuid(),digest:p.digest});assert.equal(r.status,200);return r;}
  await confirm(created.body.proposalId);
  const savedBefore=await call(base,owner.token,undefined,'GET');assert.equal(savedBefore.status,200);
  const originalItems=structuredClone(savedBefore.body.content.days[0].items);
  const command={operationId:uuid(),expectedHeadVersion:1,contentHash:'a'.repeat(64),byteCount:20_000_000,pageCount:10,extraction:'pdfkit_text',
    expiresAt:new Date(Date.now()+3600000).toISOString(),fields:[{kind:'date',value:'2026-10-06',locator:{page:2,line:4,sourceTextHash:'b'.repeat(64)}},
      {kind:'amount',value:'¥128 用户已校正',locator:{page:10,line:500,sourceTextHash:'c'.repeat(64)}}]};
  assert.equal((await call(pdf+'/preview',null,command)).status,401);
  assert.equal((await call(pdf+'/preview',other.token,command)).status,403);
  assert.equal((await call(pdf+'/preview',owner.token,{...command,pageCount:11})).status,400);
  assert.equal((await call(pdf+'/preview',owner.token,{...command,byteCount:20_000_001})).status,400);
  assert.equal((await call(pdf+'/preview',owner.token,{...command,rawPdf:'disallowed'})).status,400);
  assert.equal((await call(pdf+'/preview',owner.token,command,'POST',{Origin:ports.api})).status,400);
  assert.equal((await call(pdf+'/preview',owner.token,command)).status,503,'PDF RPC default ACL remains denied');
  assert.equal(sql("select has_function_privilege('authenticated','public.pdf_intake_v1(text,uuid,text,bigint)','execute');"),'f');
  sql('grant execute on function public.pdf_intake_v1(text,uuid,text,bigint) to authenticated;');
  t.diagnostic('Subsequent requests use a disposable-only explicit fixture GRANT; real target activation/device/source rights remain UNRUN');
  if(process.env.VP_PDF_NATIVE_INTEGRATION==='1'){
    // One separate synthetic Trip on the same owned Auth/RPC stack; never a second provider or target.
    const nativeTripId=uuid(),nativeBase='/api/trips/native/v2/'+nativeTripId;
    assert.equal((await call('/api/trips/native/v2',owner.token,{tripId:nativeTripId,title:'Synthetic Native PDF fixed Trip'})).status,201);
    const initial=await call(nativeBase+'/proposal',owner.token,{patch:originalPatch});assert.equal(initial.status,201);
    const p=await call(nativeBase+'/proposal?proposalId='+initial.body.proposalId,owner.token,undefined,'GET');assert.equal(p.status,200);
    assert.equal((await call(nativeBase+'/confirm',owner.token,{proposalId:initial.body.proposalId,idempotencyKey:uuid(),digest:p.body.proposal.digest})).status,200);
    const fixture=join(process.env.VP_IDENTITY_SUPABASE_WORKDIR,'native-pdf-fixture.json');
    writeFileSync(fixture,JSON.stringify({apiOrigin:ports.api,email:owner.email,password:owner.password,tripId:nativeTripId}),{mode:0o600,flag:'wx'});
    try{
      const child=spawn(process.execPath,['tests/integration/intake/run-native-pdf-intake.mjs'],{
        env:{...process.env,VP_NATIVE_PDF_FIXTURE_FILE:fixture},stdio:'inherit'});
      const done=new Promise((resolve,reject)=>{child.once('error',()=>reject(Error('Owned Native PDF proof failed to launch')));child.once('exit',code=>resolve(code??1));});
      assert.equal(await done,0,'actual Native PDF→original confirm→same Trip proof');
    }finally{unlinkSync(fixture);}
    // Native used the real login/replacement protocol; acquire a fresh ordinary session for this HTTP continuation.
    const attemptId=uuid(),fresh=await call('/api/auth/native/v2/credentials',null,{email:owner.email,password:owner.password,attemptId});
    assert.equal(fresh.status,200);assert.equal((await call('/api/auth/native/v2/login',fresh.body.accessToken,{attemptId})).status,200);
    owner.token=fresh.body.accessToken;
  }
  const preview=await call(pdf+'/preview',owner.token,command);assert.equal(preview.status,200);assert.equal(preview.cache,'private, no-store');
  assert.equal(preview.body.relation,'new');assert.equal(preview.body.orderVerification,'unavailable');assert.deepEqual(preview.body.fields.map(f=>f.state),['duplicate','added']);
  assert.equal((await call(pdf+'/proposal',owner.token,{command,reviewedPreviewDigest:'f'.repeat(64)})).status,409,'stale/unreviewed preview rejected');
  const raw='\n'+JSON.stringify({command,reviewedPreviewDigest:preview.body.previewDigest},null,2)+'\n';
  const proposal=await call(pdf+'/proposal',owner.token,raw);assert.equal(proposal.status,201);assert.equal(proposal.body.requestDigest,createHash('sha256').update(raw).digest('hex'));
  const replay=await call(pdf+'/proposal',owner.token,raw);assert.equal(replay.status,200);assert.equal(replay.body.reused,true);assert.equal(replay.body.proposalId,proposal.body.proposalId);
  assert.equal((await call(pdf+'/proposal',owner.token,raw+' ')).status,409,'retained exact bytes required');
  const operation=()=>call(pdf+'/operation?operationId='+command.operationId,owner.token,undefined,'GET');
  const ack=await operation();assert.equal(ack.status,200);assert.equal(ack.body.state,'pending');assert.equal(ack.body.proposalId,proposal.body.proposalId);
  assert.equal(ack.body.requestDigest,proposal.body.requestDigest);assert.equal(ack.body.confirmationEventId,null);
  const review=await pending(proposal.body.proposalId);assert.deepEqual(review.patch,preview.body.patch);
  assert.equal((await call(base,owner.token,undefined,'GET')).body.trip.headVersion,1,'preview/proposal alone never write Trip');
  await confirm(proposal.body.proposalId);
  const restored=await operation();assert.equal(restored.status,200);assert.equal(restored.body.state,'confirmed');assert.equal(restored.body.resultingVersion,2);
  const savedAfter=await call(base,owner.token,undefined,'GET');assert.equal(savedAfter.status,200);assert.equal(savedAfter.body.trip.headVersion,2);
  sameItems(savedAfter.body.content.days[0].items.slice(0,2),originalItems);
  assert(savedAfter.body.versions.some(v=>v.id===restored.body.confirmationEventId&&v.proposalId===proposal.body.proposalId&&v.resultingVersion===2&&v.eventType==='proposal_applied'));
  const duplicate={...command,operationId:uuid(),expectedHeadVersion:2};
  const repeated=await call(pdf+'/preview',owner.token,duplicate);assert.equal(repeated.status,200);assert.equal(repeated.body.relation,'duplicate');assert.equal(repeated.body.patch,null);
  const changed={...duplicate,operationId:uuid(),fields:[command.fields[0],{...command.fields[1],value:'¥256 用户再次校正'}]};
  const conflict=await call(pdf+'/preview',owner.token,changed);assert.equal(conflict.status,200);assert.equal(conflict.body.relation,'conflict');assert.equal(conflict.body.fields[1].state,'conflict');
  const alternate=await call(pdf+'/proposal',owner.token,{command:changed,reviewedPreviewDigest:conflict.body.previewDigest});assert.equal(alternate.status,201);
  await confirm(alternate.body.proposalId);
  const updated=await call(base,owner.token,undefined,'GET');sameItems(updated.body.content.days[0].items.slice(0,3),savedAfter.body.content.days[0].items);assert.equal(updated.body.trip.headVersion,3);
  assert.equal((await operation()).body.confirmationEventId,restored.body.confirmationEventId,'original applied receipt survives later Trip changes');
  const cancelCommand={...changed,operationId:uuid(),expectedHeadVersion:3,fields:[command.fields[0],{...command.fields[1],value:'Synthetic correction cancelled'}]};
  const cancelPreview=await call(pdf+'/preview',owner.token,cancelCommand);assert.equal(cancelPreview.status,200);
  const cancelRaw=JSON.stringify({command:cancelCommand,reviewedPreviewDigest:cancelPreview.body.previewDigest});
  const cancelProposal=await call(pdf+'/proposal',owner.token,cancelRaw);assert.equal(cancelProposal.status,201);
  const cancelled=await call(pdf+'/cancel',owner.token,{operationId:cancelCommand.operationId});assert.equal(cancelled.status,200);assert.equal(cancelled.body.state,'cancelled');
  assert.equal(cancelled.body.requestDigest,createHash('sha256').update(cancelRaw).digest('hex'));
  assert.equal((await call(pdf+'/proposal',owner.token,cancelRaw)).status,499);
  assert.equal((await call(base,owner.token,undefined,'GET')).body.trip.headVersion,3,'cancel cannot Undo confirmed originals');
  const cancelledBefore={...cancelCommand,operationId:uuid()};
  assert.equal((await call(pdf+'/cancel',owner.token,{operationId:cancelledBefore.operationId})).body.state,'cancelled');
  assert.equal((await call(pdf+'/proposal',owner.token,{command:cancelledBefore,reviewedPreviewDigest:cancelPreview.body.previewDigest})).status,499);
  assert.equal((await call(pdf+'/preview',owner.token,{...cancelCommand,operationId:uuid(),expiresAt:'2020-01-01T00:00:00.000Z'})).status,409);
  const replacementId=uuid(),replacement=await call('/api/auth/native/v2/credentials',null,{email:owner.email,password:owner.password,attemptId:replacementId});assert.equal(replacement.status,200);
  assert.equal((await call('/api/auth/native/v2/login',replacement.body.accessToken,{attemptId:replacementId})).status,200);
  assert.equal((await operation()).status,401,'replaced mobile session cannot read old operation');
  const oldOperation=await call(pdf+'/operation?operationId='+command.operationId,replacement.body.accessToken,undefined,'GET');
  assert.equal(oldOperation.status,409,'new epoch cannot revive previous session operation');
  assert.equal(oldOperation.body.error.code,'IDEMPOTENCY_KEY_REUSE');
});
