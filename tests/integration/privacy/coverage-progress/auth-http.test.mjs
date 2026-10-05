import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as uuid } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { identityLocalEnv } from '../../identity/local-supabase.mjs';
import { nativeHTTPEnvironmentPorts } from '../../turn/native-http-ports.mjs';
import { waitForNativeAPI } from '../../identity/native-api-readiness.mjs';
import { coverageProgressDigest } from '../../../../lib/server/privacy/coverage-progress/contract.ts';
import { decodeCoverageProgressPreview, decodeCoverageProgressBundle, decodeCoverageProgressReceipt, decodeCoverageProgressList } from '../../../../lib/server/privacy/coverage-progress/protocol.ts';
import { CATALOG_VERSION, moduleById } from '../../../../lib/server/privacy/coverage/catalog.ts';
import { matchesCoverageResult } from '../../../../lib/server/privacy/coverage/consumer.ts';

test('signed ordinary Auth -> actual collector inventory -> selected metadata export/erase -> old fences and own inventory -> registered consumer; isolated fixture only', {
  skip: process.env.VP_COVERAGE_PROGRESS_HTTP !== 'true', timeout: 300000,
}, async t => {
  const ports = nativeHTTPEnvironmentPorts(process.env), local = identityLocalEnv();
  assert.equal(local?.API_URL, ports.supabaseAPI); assert.match(local.DB_CONTAINER, /^supabase_db_vp-native-ask-[a-f0-9]{8}$/);
  const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
  const sql = query => execFileSync('docker', ['exec','-i',local.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1'], {
    input: "set statement_timeout='15s';" + query, encoding: 'utf8', stdio: ['pipe','pipe','pipe'],
  }).trim();
  const key = local.PUBLISHABLE_KEY || local.ANON_KEY, users = []; let next;
  t.after(async () => {
    if (next && next.exitCode === null) {
      const stopped = once(next, 'exit'); next.kill('SIGTERM'); await Promise.race([stopped, new Promise(resolve => setTimeout(resolve, 3000))]);
      if (next.exitCode === null) { next.kill('SIGKILL'); await stopped; }
    }
    for (const user of users) sql('delete from public.trip_events where owner_id='+literal(user.id)+';delete from public.trip_audit_events where owner_id='+literal(user.id)+';delete from auth.users where id='+literal(user.id)+';');
    if (users.length) assert.equal(sql('select count(*) from auth.users where id in('+users.map(user => literal(user.id)).join(',')+');'), '0');
  });
  const log = createWriteStream(join(process.env.VP_IDENTITY_SUPABASE_WORKDIR, 'coverage-progress-next.log'), { mode: 0o600 });
  next = spawn(process.execPath, ['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(ports.apiPort)], {
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: local.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      VISEPANDA_NATIVE_LOCAL_SESSION: 'true', VISEPANDA_NATIVE_LOCAL_TRIP: 'true', VISEPANDA_NATIVE_LOCAL_SERVICE_KEY: local.SERVICE_ROLE_KEY,
      VISEPANDA_TRIP_PROTOCOL_V2: 'true', DATA_COVERAGE_PROGRESS_LOCAL: '1', DATA_COVERAGE_LOCAL: '1',
      VISEPANDA_NATIVE_STAGING: 'false', VISEPANDA_NATIVE_PRODUCTION: 'false', VERCEL_ENV: '' }, stdio: ['ignore','pipe','pipe'],
  });
  next.stdout.pipe(log); next.stderr.pipe(log); next.once('exit', () => log.end()); await waitForNativeAPI(ports.api, next);
  const path = '/api/privacy/native/v1/coverage-progress';
  const call = async (route, token, body, method = 'POST') => {
    const response = await fetch(ports.api + route, { method, headers: { ...(token ? { Authorization: 'Bearer '+token } : {}), 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }), signal: AbortSignal.timeout(60000) });
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
  };
  async function user() {
    const auth = createClient(local.API_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const email = 'vpj58-progress-'+uuid()+'@example.test', password = 'VPJ58-Disposable-'+uuid()+'!';
    const signup = await auth.auth.signUp({ email, password }); assert.equal(signup.error, null); assert.ok(signup.data.user && signup.data.session);
    const row = { id: signup.data.user.id }; users.push(row);
    const attemptId = uuid(), credentials = await call('/api/auth/native/v2/credentials', null, { email, password, attemptId });
    assert.equal(credentials.status, 200); assert.equal((await call('/api/auth/native/v2/login', credentials.body.accessToken, { attemptId })).status, 200);
    const client = createClient(local.API_URL, key, { global: { headers: { Authorization: 'Bearer '+credentials.body.accessToken } }, auth: { persistSession: false, autoRefreshToken: false } });
    const session = await client.rpc('native_session_v2', { p_action: 'session' }); assert.equal(session.error, null);
    return { ...row, token: credentials.body.accessToken, client, actor: { ownerId: row.id, sessionId: session.data.sessionId, mobileEpoch: session.data.mobileEpoch } };
  }
  const owner = await user(), foreign = await user(), tripId = uuid();
  assert.equal((await call('/api/trips/native/v2', owner.token, { tripId, title: 'Synthetic coverage progress Trip' })).status, 201);
  const scope='coverage-progress-data/1', list={action:'list',scope,cursor:null,limit:20};
  assert.equal((await call(path,null,list)).status,401);
  for(const role of ['anon','authenticated','service_role']) assert.equal(sql("select has_function_privilege("+literal(role)+",'public.privacy_coverage_progress_v1(text,text,bigint)','execute');"),'f');
  assert.equal((await call(path,owner.token,list)).status,503);
  sql('grant execute on function public.privacy_coverage_progress_v1(text,text,bigint),public.privacy_coverage_module_export_v1(jsonb) to authenticated;');
  t.diagnostic('RPC grants are only in this uniquely owned disposable fixture; target/default privileges unchanged. No provider/Storage/business deletion.');
  const oldRequest=uuid(), untouched=uuid();
  for(const requestId of [oldRequest,untouched]) {
    const result=await owner.client.rpc('privacy_coverage_module_export_v1',{p_input:{action:'start',requestId,scope:'trip-lifecycle-metadata/1',confirmed:true}});
    assert.equal(result.error,null,result.error?.message);
  }
  const page=await owner.client.rpc('privacy_coverage_module_export_v1',{p_input:{action:'page',requestId:oldRequest,scope:'trip-lifecycle-metadata/1',section:'trips',cursor:null,limit:50}});assert.equal(page.error,null);
  const oldBefore=sql('select jsonb_build_object(\'requests\',(select to_jsonb(r) from coverage_export_private.requests_v1 r where request_id='+literal(oldRequest)+'),\'sections\',(select jsonb_agg(to_jsonb(s) order by section) from coverage_export_private.sections_v1 s where request_id='+literal(oldRequest)+'),\'fence\',(select to_jsonb(f) from coverage_export_private.request_fences_v1 f where request_id='+literal(oldRequest)+'));');
  const originalTrip=(await call('/api/trips/native/v2/'+tripId,owner.token,undefined,'GET')).body;
  async function inventory(who=owner) {
    const result=await call(path,who.token,list);assert.equal(result.status,200,JSON.stringify(result.body));
    assert.ok(decodeCoverageProgressList(result.body.data,list,who.actor,Date.now()));return result.body.data;
  }
  assert.deepEqual((await inventory()).items.map(r=>r.objectId),[oldRequest,untouched].sort());
  assert.equal((await inventory(foreign)).items.length,0);
  async function preview(ids) {
    const command={action:'preview',scope,requestId:uuid(),objectIds:[...ids].sort()}, result=await call(path,owner.token,command);
    assert.equal(result.status,200,JSON.stringify(result.body));assert.ok(decodeCoverageProgressPreview(result.body.data,command,owner.actor));return {command,value:result.body.data};
  }
  const exp=await preview([oldRequest]);assert.equal(exp.value.items[0].domain,'collector');
  assert.equal(exp.value.items[0].request.ownerId,owner.id);assert.equal(exp.value.items[0].sections.length,2);
  const expCommand={...exp.command,action:'export',previewDigest:exp.value.previewDigest,confirmed:true}, expBytes='\n'+JSON.stringify(expCommand);
  const exported=await call(path,owner.token,expBytes);assert.equal(exported.status,200,JSON.stringify(exported.body));
  assert.ok(decodeCoverageProgressBundle(exported.body.data,expCommand,owner.actor));assert.equal(exported.body.data.requestDigest,coverageProgressDigest(expBytes));
  assert.deepEqual(exported.body.data.items,exp.value.items);assert.match(exported.cache,/private, no-store/);
  assert.equal(sql('select jsonb_build_object(\'requests\',(select to_jsonb(r) from coverage_export_private.requests_v1 r where request_id='+literal(oldRequest)+'),\'sections\',(select jsonb_agg(to_jsonb(s) order by section) from coverage_export_private.sections_v1 s where request_id='+literal(oldRequest)+'),\'fence\',(select to_jsonb(f) from coverage_export_private.request_fences_v1 f where request_id='+literal(oldRequest)+'));'),oldBefore);
  const selfExport=await preview([exp.command.requestId]);assert.equal(selfExport.value.items[0].domain,'exit');
  assert.equal(selfExport.value.items[0].request.decision,'export');assert.equal(selfExport.value.items[0].progress.terminal,true);
  const foreignAttempt={action:'preview',scope,requestId:uuid(),objectIds:[oldRequest]};
  assert.equal((await call(path,foreign.token,foreignAttempt)).status,503);
  const badEpoch=await owner.client.rpc('privacy_coverage_progress_v1',{p_action:'list',p_input_bytes:JSON.stringify(list),p_expected_epoch:owner.actor.mobileEpoch+1});assert.ok(badEpoch.error);
  const stale=await preview([untouched]);
  const advanced=await owner.client.rpc('privacy_coverage_module_export_v1',{p_input:{action:'page',requestId:untouched,scope:'trip-lifecycle-metadata/1',section:'trips',cursor:null,limit:50}});assert.equal(advanced.error,null);
  const staleReply=await call(path,owner.token,{...stale.command,action:'export',previewDigest:stale.value.previewDigest,confirmed:true});assert.equal(staleReply.status,503);
  const p=await preview([oldRequest,exp.command.requestId]), erase={...p.command,action:'erase',previewDigest:p.value.previewDigest,confirmed:true}, bytes='\t'+JSON.stringify(erase);
  const terminal=await call(path,owner.token,bytes);assert.equal(terminal.status,200,JSON.stringify(terminal.body));
  const receipt=decodeCoverageProgressReceipt(terminal.body.data,erase,owner.actor,coverageProgressDigest(bytes));assert.ok(receipt);
  assert.equal(receipt.effects.collectorRequests,1);assert.equal(receipt.effects.collectorSections,2);assert.equal(receipt.effects.exitPages,1);assert.equal(receipt.effects.retainedFences,2);
  for(const table of ['requests_v1','sections_v1']) assert.equal(sql('select count(*) from coverage_export_private.'+table+' where request_id='+literal(oldRequest)+';'),'0');
  assert.equal(sql('select count(*) from coverage_export_private.request_fences_v1 where request_id='+literal(oldRequest)+';'),'1');
  assert.equal(sql('select count(*) from coverage_export_private.requests_v1 where request_id='+literal(untouched)+';'),'1');
  const recovered=await call(path,owner.token,{...p.command,action:'recover',mutationBytes:bytes});assert.deepEqual(recovered.body,terminal.body);
  const foreignRecovery=await call(path,foreign.token,{...p.command,action:'recover',mutationBytes:bytes});assert.equal(foreignRecovery.status,200);assert.equal(foreignRecovery.body.data.kind,'unknown');
  const absentId=uuid(), absentErase={...erase,requestId:absentId}, absentRecovery=await call(path,foreign.token,{...p.command,requestId:absentId,action:'recover',mutationBytes:'\t'+JSON.stringify(absentErase)});
  const normalize=v=>({...v,requestId:null,requestDigest:null});assert.deepEqual(normalize(foreignRecovery.body.data),normalize(absentRecovery.body.data));
  const bytesChanged=await call(path,owner.token,{...p.command,action:'recover',mutationBytes:JSON.stringify(erase)});assert.equal(bytesChanged.status,503);
  const oldStart=await owner.client.rpc('privacy_coverage_module_export_v1',{p_input:{action:'start',requestId:oldRequest,scope:'trip-lifecycle-metadata/1',confirmed:true}});assert.ok(oldStart.error);
  assert.equal(sql('select count(*) from coverage_export_private.requests_v1 where request_id='+literal(oldRequest)+';'),'0');
  const retainedList=await inventory();assert.ok(retainedList.items.some(r=>r.objectId===oldRequest&&r.state==='retained'));assert.ok(retainedList.items.some(r=>r.objectId===p.command.requestId&&r.domain==='exit'));
  const after=await preview([oldRequest,exp.command.requestId,p.command.requestId]);assert.equal(after.value.items.find(r=>r.objectId===oldRequest).request,null);assert.equal(after.value.items.find(r=>r.objectId===exp.command.requestId).progress,null);
  const exitReceipt=after.value.items.find(r=>r.objectId===p.command.requestId).request;assert.equal(exitReceipt.requestDigest,receipt.requestDigest);assert.deepEqual(exitReceipt.effects,receipt.effects);
  const catalog=await call('/api/privacy/native/v1/coverage',owner.token,undefined,'GET');assert.equal(catalog.status,200);assert.equal(catalog.body.catalogVersion,CATALOG_VERSION);assert.equal(catalog.body.modules.length,34);assert.equal(moduleById('coverage_progress').deleteHandler,'coverage_progress');
  const coverage={schemaVersion:'data-coverage/1',catalogVersion:CATALOG_VERSION,actorId:owner.id,sessionId:owner.actor.sessionId,mobileEpoch:owner.actor.mobileEpoch,moduleId:'coverage_progress',moduleVersion:scope,operationId:erase.requestId,action:'delete',phase:'recover',confirmed:true,tripId:null,commandBytes:bytes};
  const outer=JSON.stringify(coverage), covered=await call('/api/privacy/native/v1/coverage',owner.token,outer);assert.equal(covered.status,200);assert.equal(covered.body.state,'scoped_complete');assert.equal(covered.body.allUserDataCompleted,false);assert.ok(matchesCoverageResult(covered.body,outer));
  assert.deepEqual((await call('/api/trips/native/v2/'+tripId,owner.token,undefined,'GET')).body,originalTrip);
  // Original session/account cascade is tested with disposable identities only.
  sql('delete from auth.sessions where id='+literal(owner.actor.sessionId)+';');
  assert.equal((await call(path,owner.token,list)).status,401);
  for(const table of ['requests_v1','sections_v1','request_fences_v1']) assert.equal(sql('select count(*) from coverage_export_private.'+table+(table==='sections_v1'?' where request_id in('+[oldRequest,untouched].map(literal).join(',')+')':' where owner_id='+literal(owner.id))+';'),'0');
  assert.equal(sql('select count(*) from coverage_progress_private.requests_v1 where owner_id='+literal(owner.id)+';'),'0');
});
