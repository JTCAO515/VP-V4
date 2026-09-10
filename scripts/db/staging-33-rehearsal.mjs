import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Local-only rehearsal: no URLs, credentials, existing container names or remote modes accepted.
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const evidenceDir = resolve(root, 'artifacts/VPJ-02/staging-33-preparation');
const manifest = JSON.parse(readFileSync(evidenceDir + '/migrations.json', 'utf8'));
const digest = value => createHash('sha256').update(value).digest('hex');
const args = process.argv.slice(2);
assert.ok(args.length === 1 && ['--verify', '--execute'].includes(args[0]), 'Use --verify or --execute; no target arguments are accepted');
assert.equal(manifest.schemaVersion, 'vpj02-staging-upgrade-manifest/v1');
assert.equal(manifest.lastVerifiedStagingCount, 26); assert.equal(manifest.targetCount, 33);
assert.equal(manifest.image, 'public.ecr.aws/supabase/postgres:17.6.1.159');
const files = readdirSync(root + '/supabase/migrations').filter(f => f.endsWith('.sql')).sort();
assert.ok(files.length >= 33, 'Frozen migration inventory is incomplete');
const migrationText = manifest.migrations.map((m, i) => {
  assert.equal(m.ordinal, i + 1); assert.equal(m.file, 'supabase/migrations/' + files[i]);
  const text = readFileSync(resolve(root, m.file), 'utf8'); assert.equal(digest(text), m.sha256, 'Migration digest mismatch');
  return text;
});
assert.equal(migrationText.length, 33);
for(const m of manifest.administrativePreparation)assert.equal(digest(readFileSync(root+'/'+m.file)),m.sha256,'Administrative SQL digest mismatch');
if (args[0] === '--verify') { console.log('PASS: frozen 26→33 inventory and all33 migration hashes'); process.exit(0); }
const runId = randomUUID();
const owned = new Set();
const evidence = { schemaVersion: 'vpj02-local-upgrade-rehearsal/v1', sourceBaseline: manifest.sourceBaseline,
  runnerSha256: digest(readFileSync(fileURLToPath(import.meta.url))),
  manifestSha256: digest(readFileSync(evidenceDir + '/migrations.json')), startedAt: new Date().toISOString(),
  environment: 'new synthetic PostgreSQL containers; network none; no published ports; SQL Auth fixtures, not GoTrue',
  laterMigrationsExcluded: files.slice(33), remoteActions: 0, providerCalls: 0, checks: [], cleanup: 'pending', result: 'running' };
let stage = 'local Docker preflight';
let dockerContext;
const dockerArgs=args=>dockerContext?['--context',dockerContext,...args]:args;
function exec(binary, argv, input = '') {
  const r = spawnSync(binary, binary==='docker'?dockerArgs(argv):argv, { input, encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024, stdio: ['pipe','pipe','pipe'] });
  if (r.error || r.status !== 0) {
    evidence.processFailure={exitCode:r.status,permission:(/permission denied for (?:schema|function|table|sequence) [a-zA-Z_][a-zA-Z0-9_]*/.exec(r.stderr||'')||[])[0]||null};
    throw new Error(`${stage}: process failed; raw output suppressed`);
  }
  return r.stdout.trim();
}
function sql(c, text, expectError) {
  assert.ok(owned.has(c), 'Only this process owned containers are addressable');
  const argv = ['exec','-i',c,'psql','-h','/tmp/vpj59-socket','-U','postgres','-X','-q','-At','-v','ON_ERROR_STOP=1'];
  const input = "set statement_timeout='10s'; set lock_timeout='5s';\n" + text;
  if (!expectError) return exec('docker', [...argv,'-v','SHOW_CONTEXT=never'], input);
  const r = spawnSync('docker', dockerArgs(argv), { input, encoding:'utf8', timeout:30000, stdio:['pipe','pipe','pipe'] });
  if(r.error || r.status === 0 || !r.stderr.includes(expectError)) {
    evidence.rejectionMismatch={expected:expectError,exitCode:r.status,knownCodes:['IDEMPOTENCY_KEY_REUSE','CONFIRMATION_DIGEST_MISMATCH','FORBIDDEN','SESSION_REPLACED','UNAUTHENTICATED','permission denied'].filter(code=>r.stderr?.includes(code))};
    throw new Error('Expected rejection not observed');
  }
}
function check(name, fn) { stage = name; fn(); evidence.checks.push({ name, result:'PASS' }); console.log('PASS: ' + name); }
function newDatabase(suffix, authFixture) {
  const c = 'vpj02-upgrade-' + runId.slice(0,12) + '-' + suffix;
  // A pre-existing name, however unlikely, is never adopted or removed.
  const inspect = spawnSync('docker', dockerArgs(['inspect',c]), { encoding:'utf8', stdio:['ignore','pipe','pipe'] });
  assert.notEqual(inspect.status, 0, 'Refuse a pre-existing container name');
  exec('docker', ['run','--pull=never','--rm','-d','--network','none','--label','vpj02.owner='+runId,'--name',c,'--user','postgres','--entrypoint','/bin/sh',manifest.image,'-c',
    'umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
  owned.add(c);
  const info = JSON.parse(exec('docker',['inspect',c]))[0];
  assert.equal(info.Config.Labels['vpj02.owner'],runId); assert.equal(info.HostConfig.NetworkMode,'none');
  assert.ok(!info.HostConfig.PortBindings || Object.keys(info.HostConfig.PortBindings).length===0);
  let ready=false;
  for(let i=0;i<80;i++) {
    if(spawnSync('docker',dockerArgs(['exec',c,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres']),{stdio:'ignore'}).status===0){ready=true;break;}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,100);
  }
  assert.ok(ready,'Disposable PostgreSQL readiness timeout');
  if(authFixture) sql(c,readFileSync(root+'/tests/integration/turn/fixtures/durable-work-schema.sql','utf8')+'\ngrant usage on schema auth to authenticated, service_role; create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);');
  else sql(c,'create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;');
  return c;
}
const id = Object.fromEntries(['owner','other','web','mobile','otherSession','trip','applied','pendingProposal','scope','pendingAttempt','reservedAttempt','mobileAttempt'].map(k=>[k,randomUUID()]));
const asOwner = text => `set request.jwt.claim.sub='${id.owner}'; set request.jwt.claims='{"role":"authenticated","is_anonymous":false,"session_id":"${id.web}"}'; set role authenticated; ${text}`;
const asService = text => `set request.jwt.claims='{"role":"service_role"}'; set role service_role; ${text}`;
let baselineTables=[];
function snapshot(c,tables=baselineTables) {
  const parts=tables.map(t=>{
    assert.match(t,/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/);
    const projection=t==='public.trip_idempotency'?"to_jsonb(t)-'proposal_id'":'to_jsonb(t)';
    // One statement hashes all selected tables; neither rows nor synthetic identities are emitted.
    return `select '${t}' as name,md5(coalesce(string_agg(x::text,E'\\n' order by x::text),'')) as digest from (select ${projection} x from ${t} t) x`;
  });
  return JSON.parse(sql(c,`select jsonb_object_agg(name,digest) from (${parts.join(' union all ')}) snapshots;`));
}
function apply(c,index) {
  const m=manifest.migrations[index],name=m.file.split('/').at(-1).slice(15,-4);
  sql(c,'begin;'+migrationText[index]+`insert into supabase_migrations.schema_migrations(version,name) values('${m.version}','${name}');commit;`);
}
try {
  assert.ok(!process.env.DOCKER_HOST&&!process.env.DOCKER_CONTEXT,'Explicit Docker overrides are not accepted by the local-only rehearsal');
  const context=exec('docker',['context','show']);assert.match(context,/^[a-zA-Z0-9_.-]+$/);
  const info=JSON.parse(exec('docker',['context','inspect',context]))[0];
  assert.ok(typeof info.Endpoints?.docker?.Host==='string'&&info.Endpoints.docker.Host.startsWith('unix:///'),'Only a local Unix-socket Docker context is allowed');
  dockerContext=context;evidence.dockerTransport='pinned-local-unix-socket-context';
  evidence.imageId=exec('docker',['image','inspect',manifest.image,'--format','{{.Id}}']);
  const source=newDatabase('source',true);
  check('apply frozen baseline26',()=>{for(let i=0;i<26;i++)apply(source,i);});
  check('seed old identity Trip snapshots receipt and unresolved budget through existing RPCs',()=>{
    sql(source,`insert into auth.users values('${id.owner}'),('${id.other}');
      insert into auth.sessions(id,user_id) values('${id.web}','${id.owner}'),('${id.mobile}','${id.owner}'),('${id.otherSession}','${id.other}');`);
    sql(source,asOwner(`insert into public.trips(id,owner_id,title) values('${id.trip}','${id.owner}','Synthetic before');
      select public.save_user_profile('Synthetic profile','balanced','en','CNY','kilometre','celsius','09:00');
      insert into public.trip_proposals(id,owner_id,trip_id,revision,base_trip_version,status,patch,expires_at)
      values('${id.applied}','${id.owner}','${id.trip}',1,0,'pending','{"title":"Synthetic after"}',now()+interval '1 day');
      select * from public.confirm_and_apply_trip_proposal('${id.applied}','legacy-receipt','legacy-digest');
      insert into public.trip_proposals(id,owner_id,trip_id,revision,base_trip_version,status,patch,expires_at)
      values('${id.pendingProposal}','${id.owner}','${id.trip}',2,1,'pending','{"title":"Synthetic v2"}',now()+interval '1 day');`));
    sql(source,`insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at)
      values('${id.scope}','${id.owner}','CNY',1000000,100000,100,100,true,now()+interval '1 day');
      insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled)
      values('${id.scope}','qwen','synthetic-model','synthetic-price',1000000,10000,true);`);
    for (const attempt of [id.pendingAttempt,id.reservedAttempt]) sql(source,asService(`select public.reserve_model_budget('${id.scope}','${id.owner}','${id.trip}','${attempt}','qwen','synthetic-model','synthetic-price',700);`));
    sql(source,asService(`select public.dispatch_model_budget('${id.scope}','${id.owner}','${id.pendingAttempt}'); select public.finish_model_budget('${id.scope}','${id.owner}','${id.pendingAttempt}','pending',null);`));
    assert.equal(sql(source,"select status from public.model_budget_attempts where status='pending';"),'pending');
    assert.equal(sql(source,'select head_version from public.trips;'),'1');
  });
  stage='baseline table digest inventory';
  baselineTables=JSON.parse(sql(source,"select json_agg(schemaname||'.'||tablename order by schemaname,tablename) from pg_tables where schemaname in ('auth','public','private');"));
  const initial=snapshot(source); evidence.baselineTableCount=baselineTables.length;
  check('simulate observed platform function and three exact effective execution grants',()=>{
    sql(source,readFileSync(root+'/scripts/db/staging-33-platform-fixture.sql','utf8'));
    assert.equal(sql(source,"select md5(prosrc) from pg_proc where oid='public.rls_auto_enable()'::regprocedure;"),'99be20677b456ea8d3be47bdd44fb369');
    assert.deepEqual(snapshot(source),initial);
  });
  let backup;
  check('synthetic baseline26 logical dump kept only in process memory',()=>{
    backup=exec('docker',['exec',source,'pg_dump','-h','/tmp/vpj59-socket','-U','postgres','--no-owner','--dbname','postgres']);
    evidence.syntheticDumpSha256=digest(backup);
  });
  const restored=newDatabase('restore',false);
  check('restore baseline26 into second new container preserves all old table digests',()=>{
    sql(restored,backup); assert.deepEqual(snapshot(restored),initial); backup=null;
  });
  for (const [c,label] of [[source,'source'],[restored,'restore']]) {
    const normal=readFileSync(root+'/scripts/db/staging-33-pre27-normalize.sql','utf8');
    const restoreAcl=readFileSync(root+'/scripts/db/staging-33-pre27-restore-acl.sql','utf8');
    check(`${label}: unchanged27 rejects observed extra grants and rolls back its entire transaction`,()=>{
      sql(c,'begin;'+migrationText[26]+'commit;','Unreviewed definer RPC inventory');
      assert.equal(sql(c,"select to_regnamespace('identity_private') is null;"),'t');
      assert.equal(sql(c,'select count(*) from supabase_migrations.schema_migrations;'),'26');
      assert.deepEqual(snapshot(c),initial);
    });
    check(`${label}: unknown source ACL and extra function drift reject normalization without partial revocation`,()=>{
      sql(c,"grant execute on function public.append_chat_turn_event(uuid,text,text,text) to public;");
      sql(c,normal,'VPJ02_EXTRA_RPC_DRIFT');
      assert.equal(sql(c,"select has_function_privilege('anon','public.capture_initial_trip_version()','EXECUTE');"),'t');
      sql(c,"revoke execute on function public.append_chat_turn_event(uuid,text,text,text) from public;");
      sql(c,"create function public.vpj02_unknown_definer() returns boolean language sql security definer as 'select true';");
      sql(c,normal,'VPJ02_UNREVIEWED_DEFINER_INVENTORY');
      sql(c,"drop function public.vpj02_unknown_definer();");
      const platformDefinition=readFileSync(root+'/scripts/db/staging-33-platform-fixture.sql','utf8').split('grant execute')[0];
      sql(c,platformDefinition.replace('DECLARE','DECLARE\n  -- synthetic source drift'));
      sql(c,normal,'VPJ02_EXTRA_RPC_DRIFT');
      sql(c,platformDefinition);
      assert.deepEqual(snapshot(c),initial);
    });
    check(`${label}: exact pre27 normalization and explicit pre27 ACL restoration preserve data`,()=>{
      sql(c,normal);sql(c,restoreAcl);sql(c,normal);
      assert.deepEqual(snapshot(c),initial);
      // Revoking direct EXECUTE does not disable the owner-driven platform event trigger.
      assert.equal(sql(c,"begin;create table public.vpj02_rls_probe(id integer);select relrowsecurity from pg_class where oid='public.vpj02_rls_probe'::regclass;rollback;"),'t');
      const probe=randomUUID();
      assert.equal(sql(c,asOwner(`begin;insert into public.trips(id,owner_id,title) values('${probe}','${id.owner}','Synthetic trigger check');select count(*) from public.trip_version_snapshots where trip_id='${probe}' and version=0;rollback;`)),'1');
    });
    let identityAfter27;
    for(let i=26;i<33;i++) {
      check(`${label}: migration${i+1} preserves old table projections`,()=>{apply(c,i);assert.deepEqual(snapshot(c),initial);});
      if(i===26) check(`${label}: existing Web session reads; new mobile authority established without replacing Web`,()=>{
        assert.equal(sql(c,asOwner('select count(*) from public.trips;')),'1');
        sql(c,asService(`select public.native_prepare_v2('${id.owner}','${id.mobile}','${id.mobileAttempt}');`));
        sql(c,`set request.jwt.claim.sub='${id.owner}';set request.jwt.claims='{"role":"authenticated","is_anonymous":false,"session_id":"${id.mobile}"}';set role authenticated;select public.native_session_v2('login','${id.mobileAttempt}');`);
        assert.deepEqual(snapshot(c),initial);
        identityAfter27=snapshot(c,['identity_private.mobile_accounts','identity_private.mobile_attempts','identity_private.mobile_login_proofs']);
      });
    }
    check(`${label}: migration27 mobile records survive through33`,()=>{
      assert.equal(sql(c,'select count(*) from supabase_migrations.schema_migrations;'),'33');
      sql(c,restoreAcl,'VPJ02_ALREADY_UPGRADED');
      assert.deepEqual(snapshot(c,['identity_private.mobile_accounts','identity_private.mobile_attempts','identity_private.mobile_login_proofs']),identityAfter27);
    });
    check(`${label}: old confirmation/reject/receipt-writing callers fail closed on33`,()=>{
      sql(c,asOwner(`select * from public.confirm_and_apply_trip_proposal('${id.pendingProposal}','legacy-new-key','legacy-digest2');`),'CONFIRMATION_DIGEST_MISMATCH');
      sql(c,asOwner(`update public.trip_proposals set status='rejected' where id='${id.pendingProposal}';`),'permission denied');
      sql(c,asOwner(`insert into public.trip_idempotency(owner_id,idempotency_key,digest,outcome,resulting_version) values('${id.owner}','forged','legacy','applied',2);`),'permission denied');
      assert.deepEqual(snapshot(c),initial);
    });
    check(`${label}: old receipt retained unbound and cannot masquerade as v2 replay`,()=>{
      assert.equal(sql(c,"select count(*) from public.trip_idempotency where idempotency_key='legacy-receipt' and proposal_id is null;"),'1');
      const d=sql(c,asOwner(`select digest from public.read_trip_proposal_v2('${id.applied}');`));
      sql(c,asOwner(`select * from public.confirm_and_apply_trip_proposal('${id.applied}','legacy-receipt','${d}');`),'IDEMPOTENCY_KEY_REUSE');
    });
    check(`${label}: v2 exact digest confirms old pending proposal and appends history`,()=>{
      const d=sql(c,asOwner(`select digest from public.read_trip_proposal_v2('${id.pendingProposal}');`));
      assert.match(d,/^trip-v2:[0-9a-f]{64}$/);
      assert.equal(sql(c,asOwner(`select outcome from public.confirm_and_apply_trip_proposal('${id.pendingProposal}','v2-key','${d}');`)),'applied');
      assert.equal(sql(c,asOwner(`select outcome from public.confirm_and_apply_trip_proposal('${id.pendingProposal}','v2-key','${d}');`)),'already_applied');
      assert.equal(sql(c,'select count(*) from public.trip_version_snapshots;'),'3');
    });
    check(`${label}: new policy consent content and work remain empty without activation`,()=>{
      for(const t of ['turn_private.text_policies','turn_private.text_consents','turn_private.text_content','turn_private.work'])
        assert.equal(sql(c,`select count(*) from ${t};`),'0');
      const denied=JSON.parse(sql(c,asOwner(`select public.accept_text_policy('${randomUUID()}',repeat('a',64));`)));
      assert.equal(denied.kind,'blocked');
    });
    check(`${label}: owner other and anonymous preserve isolation`,()=>{
      assert.equal(sql(c,asOwner('select count(*) from public.trips;')),'1');
      assert.equal(sql(c,`set request.jwt.claim.sub='${id.other}';set request.jwt.claims='{"role":"authenticated","is_anonymous":false,"session_id":"${id.otherSession}"}';set role authenticated;select count(*) from public.trips;`),'0');
      sql(c,'set role anon;select * from public.trips;','permission denied');
      sql(c,asOwner(`update public.trips set title='forbidden';`),'permission denied');
    });
    check(`${label}: stop disables admission while preserving pending hold and identity Trip data`,()=>{
      const before=snapshot(c,['auth.users','auth.sessions','public.trips','public.trip_version_snapshots']);
      const stopped=JSON.parse(sql(c,asService(`select public.stop_model_budget('${id.scope}','${id.owner}');`)));
      assert.equal(stopped.kind,'stopped');assert.equal(stopped.released,1);
      const denied=JSON.parse(sql(c,asService(`select public.reserve_model_budget('${id.scope}','${id.owner}','${id.trip}','${randomUUID()}','qwen','synthetic-model','synthetic-price',700);`)));
      assert.equal(denied.kind,'disabled');
      const ops=JSON.parse(sql(c,asService(`select public.read_ops_budget_scope_v1('${id.scope}');`)));
      assert.equal(ops.money.holdMicros,'700');assert.equal(ops.attempts.pending,1);assert.equal(ops.scope.enabled,false);
      assert.deepEqual(snapshot(c,['auth.users','auth.sessions','public.trips','public.trip_version_snapshots']),before);
    });
  }
  evidence.result='PASS';
} catch(error) {
  evidence.result='FAIL'; evidence.failedStage=stage; evidence.errorType=error.name;
  // Stage labels and assertion text are authored above; no upstream errors or synthetic rows are persisted.
  console.error('FAIL: '+stage+'; diagnostic output suppressed'); process.exitCode=1;
} finally {
  const outcomes=[];
  for(const c of owned) {
    try {
      const info=JSON.parse(exec('docker',['inspect',c]))[0];assert.equal(info.Config.Labels['vpj02.owner'],runId);
      exec('docker',['rm','-f',c]);outcomes.push(true);
    } catch {outcomes.push(false);process.exitCode=1;}
  }
  evidence.cleanup=outcomes.every(Boolean)?'PASS':'FAIL';
  if(evidence.cleanup==='FAIL')evidence.result='FAIL';
  evidence.finishedAt=new Date().toISOString();
  writeFileSync(evidenceDir+'/local-rehearsal.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({result:evidence.result,checks:evidence.checks.length,cleanup:evidence.cleanup,remoteActions:0,providerCalls:0}));
}
