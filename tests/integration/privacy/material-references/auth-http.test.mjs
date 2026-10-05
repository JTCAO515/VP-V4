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
import { materialDigest } from '../../../../lib/server/privacy/material-references/contract.ts';
import { decodeMaterialPreview, decodeMaterialBundle, decodeMaterialReceipt } from '../../../../lib/server/privacy/material-references/protocol.ts';
import { CATALOG_VERSION, moduleById } from '../../../../lib/server/privacy/coverage/catalog.ts';
import { matchesCoverageResult } from '../../../../lib/server/privacy/coverage/consumer.ts';

test('real signed owner Auth -> original reservation/PDF sources -> selected exit RPC -> independent HTTP consumption; fixture GRANT distinct from target', {
  skip: process.env.VP_MATERIAL_REFERENCE_HTTP !== 'true', timeout: 300000,
}, async t => {
  const ports = nativeHTTPEnvironmentPorts(process.env), local = identityLocalEnv();
  assert.equal(local?.API_URL, ports.supabaseAPI); assert.match(local.DB_CONTAINER, /^supabase_db_vp-native-ask-[a-f0-9]{8}$/);
  const literal = v => "'" + String(v).replaceAll("'", "''") + "'";
  const sql = q => execFileSync('docker', ['exec','-i',local.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1'], {
    input: "set statement_timeout='15s';" + q, encoding: 'utf8', stdio: ['pipe','pipe','pipe'],
  }).trim();
  const key = local.PUBLISHABLE_KEY || local.ANON_KEY, users = []; let next;
  t.after(async () => {
    if (next && next.exitCode === null) {
      const done = once(next,'exit'); next.kill('SIGTERM'); await Promise.race([done,new Promise(r => setTimeout(r,3000))]);
      if (next.exitCode === null) { next.kill('SIGKILL'); await done; }
    }
    for (const user of users) sql('delete from public.trip_events where owner_id='+literal(user.id)+';delete from public.trip_audit_events where owner_id='+literal(user.id)+';delete from auth.users where id='+literal(user.id)+';');
    if (users.length) assert.equal(sql('select count(*) from auth.users where id in('+users.map(u => literal(u.id)).join(',')+');'),'0');
  });
  const log = createWriteStream(join(process.env.VP_IDENTITY_SUPABASE_WORKDIR,'material-reference-next.log'), { mode: 0o600 });
  next = spawn(process.execPath, ['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(ports.apiPort)], {
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: local.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      VISEPANDA_NATIVE_LOCAL_SESSION: 'true', VISEPANDA_NATIVE_LOCAL_TRIP: 'true', VISEPANDA_NATIVE_LOCAL_SERVICE_KEY: local.SERVICE_ROLE_KEY,
      VISEPANDA_TRIP_PROTOCOL_V2: 'true', DATA_MATERIAL_REFERENCES_LOCAL: '1', DATA_COVERAGE_LOCAL: '1' }, stdio: ['ignore','pipe','pipe'],
  });
  next.stdout.pipe(log); next.stderr.pipe(log); next.once('exit', () => log.end()); await waitForNativeAPI(ports.api, next);
  const path = '/api/privacy/native/v1/material-references';
  const call = async (path, token, body, method = 'POST') => {
    const response = await fetch(ports.api + path, { method, headers: { ...(token ? { Authorization: 'Bearer '+token } : {}), 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }), signal: AbortSignal.timeout(60000) });
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
  };
  async function user() {
    const auth = createClient(local.API_URL,key,{ auth: { persistSession: false, autoRefreshToken: false } }), email = 'vpj58-material-'+uuid()+'@example.test', password = 'VPJ58-Disposable-'+uuid()+'!';
    const signup = await auth.auth.signUp({ email,password }); assert.equal(signup.error,null); assert.ok(signup.data.user && signup.data.session);
    const row = { id: signup.data.user.id }; users.push(row);
    const attemptId = uuid(), credential = await call('/api/auth/native/v2/credentials',null,{ email,password,attemptId }); assert.equal(credential.status,200);
    const login = await call('/api/auth/native/v2/login',credential.body.accessToken,{ attemptId }); assert.equal(login.status,200);
    const client = createClient(local.API_URL,key,{ global: { headers: { Authorization: 'Bearer '+credential.body.accessToken } }, auth: { persistSession: false, autoRefreshToken: false } });
    const session = await client.rpc('native_session_v2',{ p_action: 'session' }); assert.equal(session.error,null);
    return { ...row, token: credential.body.accessToken, client, actor: { ownerId: row.id, sessionId: session.data.sessionId, mobileEpoch: session.data.mobileEpoch } };
  }
  const owner = await user(), other = await user(), tripId = uuid(), base = '/api/trips/native/v2/'+tripId;
  assert.equal((await call('/api/trips/native/v2',owner.token,{ tripId,title: 'Synthetic selected owner material Trip' })).status,201);
  const orderScope = 'reservation-reference-data/1', pdfScope = 'pdf-intake-data/1', progressScope = 'material-exit-progress/1';
  const list = scope => ({ action: 'list',scope,tripId,cursor: null,limit: 20 });
  assert.equal((await call(path,null,list(orderScope))).status,401);
  assert.equal(sql("select has_function_privilege('authenticated','public.privacy_material_reference_v1(text,text,bigint)','execute');"),'f');
  assert.equal((await call(path,owner.token,list(orderScope))).status,503);
  sql('grant execute on function public.privacy_material_reference_v1(text,text,bigint),public.confirm_reservation_reference_v1(uuid,jsonb),public.read_reservation_references_v1(uuid,integer,uuid,uuid,integer),public.read_reservation_operation_v1(uuid,uuid),public.pdf_intake_v1(text,uuid,text,bigint) to authenticated;');
  t.diagnostic('Only this uniquely owned disposable fixture GRANTs the new RPC and existing reservation/PDF source RPCs; no target ACL/config/provider/Storage or real user data is activated.');
  const references = [];
  for (let i = 0; i < 6; i++) {
    const input = { operationId: uuid(),referenceId: uuid(),expectedTripVersion: 0,expectedRevision: 0,
      fields: { kind: 'lodging',supplier: 'other',externalReference: null,title: 'Synthetic corrected order 🐼 '+i,startsAt: null,endsAt: null,timeZone: null,address: null,terms: null,status: 'unknown' },
      source: { kind: 'user_reported',localMaterialId: null,localContentHash: null,locator: null },explicitlyConfirmed: true };
    const result = await call(base+'/reservations',owner.token,{ operation: 'confirm',input }); assert.equal(result.status,200,JSON.stringify(result.body)); references.push(input);
  }
  const pdfOperations = [];
  for (const confirmed of [true,false]) {
    const command = { operationId: uuid(),expectedHeadVersion: confirmed ? 0 : 1,contentHash: (confirmed ? 'a' : 'b').repeat(64),byteCount: 500,pageCount: 1,extraction: 'pdfkit_text',
      expiresAt: new Date(Date.now()+3600000).toISOString(), fields: [{ kind: 'date',value: '2026-10-06',locator: { page: 1,line: 1,sourceTextHash: 'c'.repeat(64) } },
        { kind: 'amount',value: confirmed ? 'Synthetic confirmed 8' : 'Synthetic candidate 9',locator: { page: 1,line: 2,sourceTextHash: 'd'.repeat(64) } }] };
    const preview = await call(base+'/pdf-intake/preview',owner.token,command); assert.equal(preview.status,200,JSON.stringify(preview.body));
    const proposal = await call(base+'/pdf-intake/proposal',owner.token,{ command,reviewedPreviewDigest: preview.body.previewDigest }); assert.equal(proposal.status,201,JSON.stringify(proposal.body));
    if (confirmed) {
      const review = await call(base+'/proposal?proposalId='+proposal.body.proposalId,owner.token,undefined,'GET'); assert.equal(review.status,200);
      assert.equal((await call(base+'/confirm',owner.token,{ proposalId: proposal.body.proposalId,idempotencyKey: uuid(),digest: review.body.proposal.digest })).status,200);
    }
    pdfOperations.push({ command,proposalId: proposal.body.proposalId,confirmed });
  }
  const tripBefore = (await call(base,owner.token,undefined,'GET')).body;
  const exitRequests = [];
  async function preview(scope, ids) {
    const command = { action: 'preview',scope,requestId: uuid(),tripId,objectIds: [...ids].sort() }, result = await call(path,owner.token,command);
    assert.equal(result.status,200,JSON.stringify(result.body)); assert.ok(decodeMaterialPreview(result.body.data,command,owner.actor)); return { command,preview: result.body.data };
  }
  async function exported(scope, ids) {
    const p = await preview(scope,ids), command = { ...p.command,action: 'export',previewDigest: p.preview.previewDigest,confirmed: true }, bytes = '\n'+JSON.stringify(command);
    const result = await call(path,owner.token,bytes); assert.equal(result.status,200,JSON.stringify(result.body));
    assert.ok(decodeMaterialBundle(result.body.data,command,owner.actor)); assert.equal(result.body.data.requestDigest,materialDigest(bytes));
    assert.match(result.cache,/private, no-store/); exitRequests.push(command.requestId); return result.body.data;
  }
  async function erased(scope, ids) {
    const p = await preview(scope,ids), command = { ...p.command,action: 'erase',previewDigest: p.preview.previewDigest,confirmed: true }, bytes = '\t'+JSON.stringify(command);
    const result = await call(path,owner.token,bytes); assert.equal(result.status,200,JSON.stringify(result.body));
    assert.ok(decodeMaterialReceipt(result.body.data,command,owner.actor,materialDigest(bytes)));
    const recover = { ...p.command,action: 'recover',mutationBytes: bytes }, recovered = await call(path,owner.token,recover);
    assert.equal(recovered.status,200,JSON.stringify(recovered.body)); assert.deepEqual(recovered.body,result.body);
    const foreign = await call(path,other.token,recover);
    assert.ok(foreign.status !== 200 || foreign.body.data?.kind === 'unknown' && foreign.body.data.ownerId === other.id,
      'foreign owner can receive only unavailable/unknown, never the retained erasure receipt');
    const changed = await call(path,owner.token,{ ...recover,mutationBytes: bytes.trim() }); assert.notEqual(changed.status,200,'changed exact original bytes cannot recover a decision');
    exitRequests.push(command.requestId); return result.body.data;
  }
  const listed = await call(path,owner.token,list(orderScope)); assert.equal(listed.status,200); assert.equal(listed.body.data.items.length,6);
  const discovered = await call(path,owner.token,{ action: 'trip_list',scope: orderScope,cursor: null,limit: 20 });
  assert.equal(discovered.status,200,JSON.stringify(discovered.body)); assert.equal(discovered.body.data.items[0].tripId,tripId);
  assert.notEqual((await call(path,other.token,list(orderScope))).status,200,'selected Trip remains owner only');
  const orders = await exported(orderScope,references.map(r => r.referenceId)); assert.equal(orders.proof.pages,2); assert.equal(orders.items.length,6);
  assert.equal(orders.items[0].current.evidenceTier,'user_reported'); assert.equal(orders.items[0].current.sourceQualification,'untrusted');
  const coveragePreview = await preview(orderScope,references.map(r => r.referenceId));
  const coverageCommand = { ...coveragePreview.command,action: 'export',previewDigest: coveragePreview.preview.previewDigest,confirmed: true };
  const module = moduleById('order_references'), selected = { schemaVersion: 'data-coverage/1',catalogVersion: CATALOG_VERSION,
    actorId: owner.id,sessionId: owner.actor.sessionId,mobileEpoch: owner.actor.mobileEpoch,moduleId: module.id,moduleVersion: module.version,
    operationId: coverageCommand.requestId,action: 'export',phase: 'execute',confirmed: true,tripId,commandBytes: '\n'+JSON.stringify(coverageCommand) };
  const covered = await call('/api/privacy/native/v1/coverage',owner.token,selected);
  assert.equal(covered.status,200,JSON.stringify(covered.body)); assert.ok(matchesCoverageResult(covered.body,JSON.stringify(selected)));
  assert.equal(covered.body.state,'scoped_complete'); assert.equal(covered.body.allUserDataCompleted,false);
  const pdf = await exported(pdfScope,pdfOperations.map(p => p.command.operationId));
  assert.equal(pdf.items.find(row => row.operationId === pdfOperations[0].command.operationId).operation.state,'confirmed');
  assert.equal(pdf.items.find(row => row.operationId === pdfOperations[1].command.operationId).operation.state,'pending');
  await erased(orderScope,references.map(r => r.referenceId));
  assert.equal(sql('select count(*) from reservation_private.current_v1 where owner_id='+literal(owner.id)+';'),'0');
  const replay = await owner.client.rpc('confirm_reservation_reference_v1',{ p_trip_id: tripId,p_input: references[0] });
  assert.equal(replay.error,null); assert.deepEqual(replay.data,{ kind: 'conflict' },'original stale-head replay is rejected by its unchanged typed conflict contract');
  assert.equal(sql('select count(*) from reservation_private.current_v1 where owner_id='+literal(owner.id)+';'),'0');
  const currentHead = tripBefore.trip.headVersion;
  const erasedReference = await owner.client.rpc('confirm_reservation_reference_v1',{ p_trip_id: tripId,
    p_input: { ...references[0],operationId: uuid(),expectedTripVersion: currentHead } });
  assert.ok(erasedReference.error,'fresh operation/current head still cannot recreate erased reference ID');
  const erasedOperation = await owner.client.rpc('confirm_reservation_reference_v1',{ p_trip_id: tripId,
    p_input: { ...references[0],referenceId: uuid(),expectedTripVersion: currentHead } });
  assert.ok(erasedOperation.error,'fresh reference/current head still cannot reuse erased original operation ID');
  const freshMaterial = await owner.client.rpc('confirm_reservation_reference_v1',{ p_trip_id: tripId,
    p_input: { ...references[0],operationId: uuid(),referenceId: uuid(),expectedTripVersion: currentHead } });
  assert.equal(freshMaterial.error,null,'new selected material remains governed by original explicit business rules');
  await erased(pdfScope,pdfOperations.map(p => p.command.operationId));
  assert.equal(sql('select count(*) from pdf_intake_private.operations_v1 where owner_id='+literal(owner.id)+' and (input_bytes is not null or command is not null);'),'0');
  assert.equal(sql('select patch from public.trip_proposals where id='+literal(pdfOperations[1].proposalId)+';'),'{}');
  assert.equal((await call(base,owner.token,undefined,'GET')).body.trip.headVersion,tripBefore.trip.headVersion);
  assert.deepEqual((await call(base,owner.token,undefined,'GET')).body.content,tripBefore.content,'owner material erasure never undoes confirmed Trip content');
  const progress = await exported(progressScope,exitRequests.slice(0,4)); assert.equal(progress.items.length,4);
  assert.equal(progress.items.find(row => row.state === 'erased' && row.originalScope === orderScope).referenceOperationIds.length,6,'retained original operation fence inventory is exported');
  const progressReceipt = await erased(progressScope,exitRequests.slice(0,4));
  assert.equal(progressReceipt.effects.temporaryRecords,2,'only the two export requests ever had transient page rows; erase requests retain only their minimum fence');
  const retained = await exported(progressScope,exitRequests.slice(0,4)); assert.ok(retained.items.every(row => row.pages === 0 && row.rows === 0));
  assert.equal(sql('select count(*) from material_exit_private.progress_v1 where request_id in('+exitRequests.slice(0,4).map(literal).join(',')+') and (last_cursor is not null or next_cursor is not null or pages<>0 or rows<>0 or bytes<>0 or not erased);'),'0');
  assert.equal(sql('select pages||\':\'||rows from material_exit_private.progress_v1 where request_id='+literal(coverageCommand.requestId)+';'),'2:6','unselected owned progress is preserved');
  assert.ok(retained.items.some(row => row.referenceOperationIds.length === 6),'progress erasure never removes the replay fences');
  sql('delete from public.trip_events where trip_id='+literal(tripId)+';delete from public.trip_audit_events where trip_id='+literal(tripId)+';delete from public.trips where id='+literal(tripId)+';');
  const historical = await call(path,owner.token,{ action: 'trip_list',scope: progressScope,cursor: null,limit: 20 });
  assert.equal(historical.status,200,JSON.stringify(historical.body)); assert.equal(historical.body.data.items[0].tripId,tripId);
  assert.equal(historical.body.data.items[0].state,'retained','no original deletion tombstone was submitted; historical metadata does not invent that semantic receipt');
  assert.equal(historical.body.data.items[0].label,null);
  assert.equal(sql('select count(*) from public.trips where id='+literal(tripId)+';'),'0','retained progress does not reconstruct the missing Trip');
  assert.equal((await exported(progressScope,exitRequests.slice(0,4))).items.length,4,'retained minimum metadata stays owner exportable after Trip deletion');
  await erased(progressScope,exitRequests.slice(0,4));
  assert.equal((await owner.client.rpc('native_session_v2',{ p_action: 'logout' })).error,null);
  assert.equal((await call(path,owner.token,list(pdfScope))).status,401);
});
