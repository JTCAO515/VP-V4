// Actual owned network-none PostgreSQL; synthetic SQL claims are not signed Auth.
import test from 'node:test';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { randomUUID as uuid, randomBytes, createHash } from 'node:crypto';
import { db, setContainer } from '../profile-data-sql/replay.mjs';
import { exportCanonical } from '../../../../lib/server/privacy/export-dispatcher.ts';
import { decodeProfileExportPage } from '../../../../lib/server/privacy/profile-export/contract.ts';
import { encryptExportArtifact, decryptExportArtifact } from '../../../../lib/server/privacy/export-artifact.ts';
import { sql } from '../../cost/fixtures/postgres-rpc.mjs';
import { ensureFixture } from './fixture.mjs';
import { verifyTimeBoundary } from './time-boundary.mjs';
setContainer(process.env.VP_PROFILE_EXPORT_TEST_CONTAINER || 'vpj58-profile-export-sql-20261007');
const lit = x => "'" + String(x).replaceAll("'", "''") + "'";
const json = x => lit(JSON.stringify(x)) + '::jsonb';
const sha = x => createHash('sha256').update(x).digest('hex');
const claims = a => a ? `set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims=${lit(JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session}))};`
  : `set request.jwt.claim.role='service_role';set request.jwt.claim.sub='';set request.jwt.claims='{"role":"service_role"}';`;
const call = (a, action, input) => db(`begin;${claims(a)}set role ${a ? 'authenticated' : 'service_role'};select public.privacy_core_export_v1(${lit(action)},${json(input)});commit;`).then(JSON.parse);
const profileCall = (a, input) => db(`begin;${claims(a)}set role authenticated;select public.privacy_profile_data_v1(${lit(input.action)},${lit(JSON.stringify(input))},1);commit;`).then(JSON.parse);
async function actor() {
  const a={owner:uuid(),session:uuid(),request:uuid()};
  await db(`insert into auth.users values('${a.owner}');insert into auth.sessions(id,user_id)values('${a.session}','${a.owner}');insert into identity_private.mobile_accounts(owner_id,session_id,epoch)values('${a.owner}','${a.session}',1);insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch)values('${a.owner}','${uuid()}','${a.session}',1);`);
  return a;
}
const name = '旅途😀é\b\t\n\f\r"\\/';
const save = (a,rev=null,statementMarker='') => db(`begin;${claims(a)}set role authenticated;select ${statementMarker?`/*${statementMarker}*/ `:''}* from public.${rev===null?'save_user_profile':'save_user_profile_v2'}(${lit(name)},'packed','en','USD','mile','fahrenheit','17:32:11.123456'${rev===null?'':','+rev});commit;`);
const pace = (a,input) => db(`begin;${claims(a)}set role authenticated;select public.native_travel_pace_v1(${json(input)});commit;`).then(JSON.parse);
const selection = a => ({scope:'profile-sensitive-data/1',requestId:uuid(),profileId:a.owner,objectIds:[]});
async function clear(a) {
  const s=selection(a),preview=await profileCall(a,{action:'preview',...s});
  assert.ok(!preview.conflicts.includes('CORE_EXPORT_COPY'));
  const result=await profileCall(a,{action:'erase',...s,sourceDigest:preview.sourceDigest,previewDigest:preview.previewDigest,confirmed:true});
  assert.equal(result.decision.sourceProfile,'cleared');return result;
}
const binding = f => ({requestId:f.a.request,leaseId:f.lease.leaseId,generation:f.lease.generation});
async function job(a=undefined) {
  a ||= await actor();
  await call(a,'request',{requestId:a.request,confirmed:true});
  const lease=await call(null,'claim',{requestId:a.request,operationId:uuid(),maxRunMs:90000,expectedEnvironment:'local',expectedKeyId:'profile-export-fixture-key'});
  assert.equal(lease.kind,'privacy_export_lease/1');return {a,lease};
}
async function page(f) {
  const result=await call(null,'profile_page',{...binding(f),section:'snapshot',cursor:null,limit:100});
  assert.ok(decodeProfileExportPage(result,100,f.a.owner,Date.now()),JSON.stringify(result));
  assert.equal(result.sourceDigest,sha(exportCanonical({snapshot:result.items})));
  return result;
}
function commitInput(f,p) {
  const modules=['trip','conversations','results','profile','memory','turn','user_artifact','brief','entitlements'].map(module=>module==='profile'
    ? {module,status:'complete',reason:'NONE',pages:1,rows:1,digest:p.sourceDigest}
    : {module,status:'unavailable',reason:'HANDLER_MISSING',pages:0,rows:0,digest:null});
  const key={keyId:'profile-export-fixture-key',key:randomBytes(32)};
  const bundle={schemaVersion:'privacy-core-export/1',requestId:f.a.request,coverage:'partial',allUserDataCompleted:false,data:{profile:{snapshot:p.items}},modules};
  const artifact=encryptExportArtifact(bundle,f.lease,key,new Date(Date.now()+300000).toISOString());assert.ok(artifact);
  return {input:{...binding(f),artifact,modules,coverage:'partial'},key,bundle};
}
const counts = f => db(`select jsonb_build_object('artifacts',(select count(*) from export_private.core_artifacts_v1 where request_id='${f.a.request}'),'proofs',(select count(*) from export_private.profile_snapshot_provenance_v1 where request_id='${f.a.request}'),'job',(select to_jsonb(j) from export_private.core_jobs_v1 j where request_id='${f.a.request}'));`).then(JSON.parse);
const fail = (p,code) => assert.rejects(p,new RegExp(code));

test('bounded Profile source through current original D2 and permanent clear fences',{skip:process.env.VP_PROFILE_EXPORT_SQL!=='1'},async t=>{
  await ensureFixture(t);
  await t.test('exact catalog, default denied private entity/functions and RLS',async()=>{
    assert.equal(await db('select profile_data_private.schema_v1() and result_data_private.schema_supported_v1() and export_private.profile_hooks_valid_v1()'),'t');
    assert.equal(await db("select relrowsecurity from pg_class where oid='export_private.profile_snapshot_provenance_v1'::regclass"),'t');
    for(const role of ['anon','authenticated','service_role']) {
      assert.equal(await db(`select has_table_privilege('${role}','export_private.profile_snapshot_provenance_v1','SELECT,INSERT,UPDATE,DELETE')`),'f');
      assert.equal(await db(`select has_function_privilege('${role}','export_private.record_profile_provenance_v1(export_private.core_jobs_v1,timestamp with time zone)','EXECUTE')`),'f');
    }
    assert.equal(await db("select has_function_privilege('authenticated','public.privacy_core_export_v1(text,jsonb)','EXECUTE')"),'f');
    // These grants are isolated fixture authority, never target activation.
    await db('grant execute on function public.privacy_core_export_v1(text,jsonb) to authenticated,service_role;grant execute on function public.privacy_profile_data_v1(text,text,bigint) to authenticated;');
    await db(`insert into export_private.core_policies_v1(id,revision,enabled,environment,key_id,max_run_ms,artifact_ttl_ms,ticket_ttl_ms,max_pages,page_size,max_bytes,valid_until)values('${uuid()}',1,true,'local','profile-export-fixture-key',90000,600000,300000,1000,100,8388608,clock_timestamp()+interval '1 hour');`);
  });
  await t.test('actual null sources, real Unicode/time fraction, every pace action and finite original operations match TS digest/decoder',async()=>{
    const empty=await job();let p=await page(empty);assert.equal(p.items[0].profile,null);assert.equal(p.items[0].watermark,null);assert.deepEqual(p.items[0].operations,[]);
    assert.deepEqual(p.items[0].sourceRows,{profiles:0,watermarks:0,operations:0});
    const a=await actor();await save(a);const f=await job(a);p=await page(f);assert.equal(p.items[0].profile.profile.displayName,name);assert.equal(p.items[0].profile.profile.defaultDepartureTime,'17:32:11.123456');
    let revision=0;
    for(const action of ['save','pause','revoke','save','undo']) {
      await pace(a,{action,operationId:uuid(),expectedRevision:revision,...(action==='save'?{travelPace:'relaxed',noticeVersion:'local-planning-cross-trip-v1'}:{})});
      p=await page(f);revision=p.items[0].watermark.paceRevision;
    }
    let s=selection(a);await profileCall(a,{action:'preview',...s});p=await page(f);assert.equal(p.items[0].operations.length,1);
    await clear(a);p=await page(f);assert.equal(p.items[0].profile.summary.paceState,'revoked');assert.equal(p.items[0].operations.at(-1).ownerId,a.owner);
    s={scope:'profile-delete-progress/1',requestId:uuid(),profileId:null,objectIds:[p.items[0].operations[0].requestId]};let prev=await profileCall(a,{action:'preview',...s});
    await profileCall(a,{action:'erase',...s,sourceDigest:prev.sourceDigest,previewDigest:prev.previewDigest,confirmed:true});p=await page(f);
    assert.equal(p.items[0].operations.some(r=>r.scope==='profile-delete-progress/1'&&r.state==='erased'),true);
    assert.deepEqual(p.items[0].sourceRows,{profiles:1,watermarks:1,operations:p.items[0].operations.length});
  });
  await t.test('lawful original TIME 24-hour endpoint preserves source bytes and rejects non-endpoint values',verifyTimeBoundary);
  await t.test('original atomic commit/proof/exact-byte execution recovery/download and same-owner fresh-session download',async()=>{
    const a=await actor();await save(a);const f=await job(a),p=await page(f),c=commitInput(f,p);
    const receipt=await call(null,'commit',c.input);assert.equal(receipt.state,'ready_partial');assert.deepEqual(receipt.modules[3],c.input.modules[3]);
    const before=await counts(f);assert.equal(before.proofs,1);assert.equal(before.artifacts,1);
    assert.equal(await db(`select export_private.profile_managed_copy_v1('${a.request}','${a.owner}')`),'t');
    assert.equal((await call(null,'commit',c.input)).state,'ready_partial');assert.deepEqual(await counts(f),before);
    assert.equal((await call(null,'execution_receipt',{...binding(f),expectedArtifactDigest:c.input.artifact.plaintextDigest})).outcome,'terminal');
    await fail(db(`update export_private.profile_snapshot_provenance_v1 set source_digest='${'a'.repeat(64)}' where request_id='${a.request}'`),'IMMUTABLE_PROFILE_EXPORT_PROVENANCE');
    await fail(db(`delete from export_private.profile_snapshot_provenance_v1 where request_id='${a.request}'`),'IMMUTABLE_PROFILE_EXPORT_PROVENANCE');
    const next={...a,session:uuid()};await db(`insert into auth.sessions(id,user_id)values('${next.session}','${a.owner}');update identity_private.mobile_accounts set session_id='${next.session}',epoch=2 where owner_id='${a.owner}';insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch)values('${a.owner}','${uuid()}','${next.session}',2);`);
    const op=uuid(),tokenHash=sha(randomBytes(32));const ticket=await call(next,'ticket',{requestId:a.request,operationId:op,tokenHash,ticketTtlMs:300000});assert.equal(ticket.kind,'privacy_export_ticket/1');
    const dl=await call(next,'download_prepare',{requestId:a.request,operationId:op,tokenHash});assert.equal(dl.kind,'privacy_export_download/1');
    const bytes=decryptExportArtifact(dl.artifact,f.lease,c.key);assert.equal(bytes.toString(),exportCanonical(c.bundle));
    assert.equal((await call(next,'download_consume',{requestId:a.request,operationId:op,tokenHash,artifactDigest:dl.artifactDigest,generation:dl.generation})).kind,'privacy_export_download_consumed/1');
    assert.equal((await call(null,'execution_receipt',{...binding(f),expectedArtifactDigest:c.input.artifact.plaintextDigest})).outcome,'unknown');
    const other=await actor();await fail(call(other,'read',{requestId:a.request}),'FORBIDDEN');
    await db(`delete from auth.users where id='${a.owner}'`);assert.equal((await counts(f)).proofs,0);assert.equal((await counts(f)).artifacts,0);
  });
  await t.test('clear/edit before commit refuses stale full snapshot; running empty modules has no managed proof',async()=>{
    const a=await actor();await save(a);const f=await job(a),old=await page(f),c=commitInput(f,old);
    assert.equal(await db(`select export_private.profile_managed_copy_v1('${a.request}','${a.owner}')`),'f');
    await clear(a);await fail(call(null,'commit',c.input),'INVALID_OUTPUT');assert.equal((await counts(f)).artifacts,0);assert.equal((await counts(f)).proofs,0);
    const newer=await page(f);await save(a,newer.items[0].watermark.profileRevision);await fail(call(null,'commit',commitInput(f,newer).input),'INVALID_OUTPUT');
  });
  await t.test('actual two-connection missing Profile/watermark capture versus original first Web save uses owner locks and refuses stale commit',async()=>{
    const f=await job(),p=await page(f),c=commitInput(f,p),marker='PROFILE_SOURCE_HOLD_'+uuid(),saveMarker='PROFILE_FIRST_SAVE_'+uuid();
    // Keep the original source/account transaction alive until the actual
    // first-save wait and zero-write assertions finish; no timed sleep window.
    const holder=spawn('docker',['exec','-i',process.env.VP_PROFILE_EXPORT_TEST_CONTAINER,'psql','-h','/tmp/vpj59-socket','-U','postgres','-X','-q','-At','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});
    let stdout='',stderr='',firstSave,saveState='not_started',saveError=null;
    holder.stdout.setEncoding('utf8');holder.stderr.setEncoding('utf8');
    holder.stdout.on('data',b=>{stdout+=b;});holder.stderr.on('data',b=>{stderr+=b;});holder.stdin.on('error',()=>{});
    const held=new Promise((resolve,reject)=>{holder.once('error',reject);holder.once('close',code=>resolve({code,stdout,stderr}));});held.catch(()=>{});
    holder.stdin.write(`set statement_timeout='5s';set lock_timeout='5s';begin;select export_private.lock_job_v1('${f.a.request}',true) is not null;select export_private.profile_source_v1('${f.a.owner}') is not null;select '${marker}';\n`);
    let holderPID=null;
    try {
      for(let n=0;n<20;n++) {
        const found=await db(`select pid from pg_stat_activity where state='idle in transaction' and position(${lit(marker)} in query)>0`);
        if(found){holderPID=Number(found);break;}await new Promise(r=>setTimeout(r,10));
      }
      assert.ok(Number.isSafeInteger(holderPID)&&holderPID>0,'Original source transaction remains held on this connection');
      assert.equal(await db(`select pg_try_advisory_xact_lock(hashtextextended('${f.a.owner}',34))`),'t');
      firstSave=save(f.a,null,saveMarker).then(v=>{saveState='fulfilled';return v;},error=>{saveState='rejected';saveError=error.message.match(/(?:PROFILE_[A-Z_]+|lock timeout|statement timeout)/)?.[0]||'UNCLASSIFIED';throw error;});saveState='pending';firstSave.catch(()=>{});
      let waiting=false;
      for(let n=0;n<10;n++) {
        waiting=await db(`select exists(select 1 from pg_stat_activity where wait_event_type='Lock' and query like '%save_user_profile(%' and position(${lit(saveMarker)} in query)>0 and ${holderPID}=any(pg_blocking_pids(pid)))`)==='t';
        if(waiting)break;await new Promise(r=>setTimeout(r,10));
      }
      assert.equal(waiting,true,JSON.stringify({assertion:'Original Web RPC account gate blocks the first save before watermark/Profile writes',saveState,saveError}));
      assert.equal(await db(`select count(*) from profile_data_private.watermarks_v1 where owner_id='${f.a.owner}'`),'0');
    } finally {holder.stdin.end('commit;\n');assert.equal((await held).code,0,stderr);}
    await firstSave;
    console.log('Source has no extra owner34 lock; actual original Web first save blocked on original RPC account gate, then committed after source transaction released');
    await fail(call(null,'commit',c.input),'INVALID_OUTPUT');assert.equal((await counts(f)).proofs,0);assert.equal((await counts(f)).artifacts,0);
  });
  await t.test('commit-before-clear proof remains managed; stale read/ticket/prepare-before-consume fail and repeated clear retains honest copies',async()=>{
    const a=await actor();await save(a);const f=await job(a),c=commitInput(f,await page(f));await call(null,'commit',c.input);
    const op=uuid(),tokenHash=sha(randomBytes(32));await call(a,'ticket',{requestId:a.request,operationId:op,tokenHash,ticketTtlMs:300000});const dl=await call(a,'download_prepare',{requestId:a.request,operationId:op,tokenHash});assert.equal(dl.kind,'privacy_export_download/1');
    const first=await clear(a);assert.deepEqual(first.decision.retainedCopies.coreExports,[a.request]);
    assert.equal(await db(`select export_private.profile_managed_copy_v1('${a.request}','${a.owner}')`),'t');
    assert.equal((await call(a,'read',{requestId:a.request})).kind,'unavailable');assert.equal((await call(null,'validate',binding(f))).current,false);
    assert.equal((await call(a,'download_consume',{requestId:a.request,operationId:op,tokenHash,artifactDigest:dl.artifactDigest,generation:dl.generation})).kind,'unavailable');
    assert.equal((await call(a,'download_prepare',{requestId:a.request,operationId:op,tokenHash})).kind,'unavailable');
    assert.equal((await call(a,'ticket',{requestId:a.request,operationId:uuid(),tokenHash:sha(randomBytes(32)),ticketTtlMs:300000})).kind,'unavailable');
    assert.equal((await call(null,'execution_receipt',{...binding(f),expectedArtifactDigest:c.input.artifact.plaintextDigest})).outcome,'unknown');
    const second=await clear(a);assert.deepEqual(second.decision.retainedCopies.coreExports,[a.request]);assert.equal((await counts(f)).proofs,1);
  });
  await t.test('old opaque/custom Profile without proof and mixed Result source blockers remain fail closed',async()=>{
    const a=await actor();await save(a);const f=await job(a),p=await page(f),c=commitInput(f,p);
    // Administrator fixture seeds an actual historical opaque job, never a new proof.
    await db(`update export_private.core_jobs_v1 set modules=${json(c.input.modules)},state='ready_partial',committed_lease=lease_id,lease_id=null,lease_expires_at=null,completed_at=clock_timestamp(),commit_digest='${'b'.repeat(64)}' where request_id='${a.request}'`);
    const prev=await profileCall(a,{action:'preview',...selection(a)});assert.ok(prev.conflicts.includes('CORE_EXPORT_COPY'));assert.equal(prev.eligible,false);
    assert.equal(await db(`select export_private.profile_managed_copy_v1('${a.request}','${a.owner}')`),'f');
    assert.equal((await call(a,'read',{requestId:a.request})).kind,'unavailable');
    assert.equal(await db("select md5(prosrc) from pg_proc where oid='result_data_private.guard_core_copy_v1()'::regprocedure"),process.env.VP_PROFILE_EXPORT_RESULT_GUARD_HASH);
  });
  await t.test('source UTF8 overflow refuses publication before aggregation; partial claimed Profile is rejected',async()=>{
    const a=await actor();await save(a);const f=await job(a),p=await page(f),c=commitInput(f,p);
    const before=await counts(f);const bad=structuredClone(c.input);bad.modules[3].status='partial';bad.modules[3].reason='BOUNDED_LIMIT';
    await fail(call(null,'commit',bad),'INVALID_OUTPUT');assert.deepEqual(await counts(f),before);
    await fail(db(`begin;insert into profile_data_private.proofs_v1 values(pg_current_xact_id(),'${a.owner}','executor',null,null);
      insert into profile_data_private.operations_v1(request_id,owner_id,session_id,mobile_epoch,scope,profile_id,object_ids,source_digest,preview_digest,captured_at,expires_at,state,preview_erased)
      select gen_random_uuid(),'${a.owner}','${a.session}',1,'profile-sensitive-data/1','${a.owner}','[]','${'a'.repeat(64)}','${'b'.repeat(64)}',n,n+30000,'previewed',true
      from generate_series(1,2000),lateral(select profile_data_private.now_v1() n) clock_n;
      delete from profile_data_private.proofs_v1 where transaction_id=pg_current_xact_id();
      select export_private.profile_source_v1('${a.owner}');commit;`),'PROFILE_SCOPE_TOO_LARGE');
    assert.equal(await db(`select count(*) from profile_data_private.operations_v1 where owner_id='${a.owner}'`),'0');assert.deepEqual(await counts(f),before);
  });
  await t.test('original locked running lease deadline rejects provenance after staged original artifact/job effects and rolls all effects back',async()=>{
    const a=await actor();await save(a);const f=await job(a),c=commitInput(f,await page(f));const before=await counts(f);
    // Direct private-gate adversarial fixture, distinct from the real original
    // public commit/replay path verified above. No product function is replaced.
    await fail(db(`begin;do $fixture$declare j export_private.core_jobs_v1;deadline timestamptz;begin
      update export_private.core_jobs_v1 set lease_expires_at=clock_timestamp()+interval '200 milliseconds' where request_id='${a.request}';
      j:=export_private.lock_job_v1('${a.request}',true);deadline:=j.lease_expires_at;
      if export_private.profile_commit_qualifies_v1(j,${json(c.input.modules)},'${f.lease.leaseId}',1) is not true then raise exception 'FIXTURE_SOURCE_NOT_QUALIFIED';end if;
      insert into export_private.core_artifacts_v1(request_id,owner_id,generation,lease_id,key_id,nonce,tag,ciphertext,plaintext_digest,plaintext_bytes,ciphertext_digest,aad,expires_at)
      values('${a.request}','${a.owner}',1,'${f.lease.leaseId}','profile-export-fixture-key',export_private.unb64_v1(${lit(c.input.artifact.nonce)},12),export_private.unb64_v1(${lit(c.input.artifact.tag)},16),export_private.unb64_v1(${lit(c.input.artifact.ciphertext)},8388608),${lit(c.input.artifact.plaintextDigest)},${c.input.artifact.plaintextBytes},${lit(sha(Buffer.from(c.input.artifact.ciphertext,'base64url')))},${lit(exportCanonical(['privacy-core-export/1',a.request,a.owner,1]))},${lit(c.input.artifact.expiresAt)}::timestamptz);
      update export_private.core_jobs_v1 set state='ready_partial',modules=${json(c.input.modules)},committed_lease=lease_id,lease_id=null,lease_expires_at=null,commit_digest='${'c'.repeat(64)}',completed_at=clock_timestamp(),artifact_digest=${lit(c.input.artifact.plaintextDigest)},artifact_bytes=${c.input.artifact.plaintextBytes},artifact_expires_at=${lit(c.input.artifact.expiresAt)}::timestamptz where request_id='${a.request}' returning * into j;
      if not exists(select 1 from export_private.core_artifacts_v1 where request_id=j.request_id) or j.state<>'ready_partial' then raise exception 'FIXTURE_EFFECTS_NOT_STAGED';end if;
      perform pg_sleep(0.22);
      perform export_private.record_profile_provenance_v1(j,deadline);
      raise exception 'LATE_PROVENANCE_ACCEPTED';
    end$fixture$;commit;`),'INVALID_OUTPUT');
    assert.deepEqual(await counts(f),before);
  });
  await t.test('typed integer normalization rejects fraction/unsafe values and dependency drift rejects clear/source',async()=>{
    assert.equal(await db(`select export_private.profile_normalize_integers_v1('{"expectedRevision":4.0,"summary":{"profileRevision":-0.0},"decision":{"retainedFences":4e0}}')`),'{"summary": {"profileRevision": 0}, "decision": {"retainedFences": 4}, "expectedRevision": 4}');
    await fail(db(`select export_private.profile_normalize_integers_v1('{"expectedRevision":4.5}')`),'PROFILE_SOURCE_UNAVAILABLE');
    await fail(db(`select export_private.profile_normalize_integers_v1('{"expectedRevision":9007199254740991}')`),'PROFILE_SOURCE_UNAVAILABLE');
    await fail(db(`select export_private.profile_normalize_integers_v1('{"futureNumber":1}')`),'PROFILE_SOURCE_UNAVAILABLE');
    await db(`begin;alter function export_private.record_profile_provenance_v1(export_private.core_jobs_v1,timestamp with time zone) set search_path='public';do $$begin if export_private.profile_hooks_valid_v1() or profile_data_private.schema_v1() or result_data_private.schema_supported_v1() then raise exception 'DRIFT_ACCEPTED';end if;end$$;rollback;`);
    await db(`begin;create table public.unreviewed_profile_export_source(id uuid);do $$begin if profile_data_private.schema_v1() or result_data_private.schema_supported_v1() then raise exception 'UNKNOWN_APP_ACCEPTED';end if;end$$;rollback;`);
    await db(`begin;create table result_data_private.unreviewed_profile_export_edge(request_id uuid,generation integer,foreign key(request_id,generation) references export_private.profile_snapshot_provenance_v1);do $$begin if profile_data_private.schema_v1() then raise exception 'UNKNOWN_FK_ACCEPTED';end if;end$$;rollback;`);
  });
});
