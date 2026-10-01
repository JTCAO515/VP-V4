import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { catalog, compare, snapshot, digest, repo, normalizeSchemaDump } from './v5-staging-migration-set.mjs';

// No connection strings, resource names, remote context or target-write mode.
const image = 'public.ecr.aws/supabase/postgres:17.6.1.159';
const runId = randomUUID(), owned = [];
let context, stage = 'argument preflight';
const startedAt = new Date().toISOString();
const report = { startedAt, result:'FAIL_LOCAL_SYNTHETIC_REPLAY', targetAcceptance:'UNRUN', stages:[] };
function command(binary,args,input) {
  const r=spawnSync(binary,args,{input,encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024});
  if(r.error || r.status!==0) {
    // Only SQL diagnostics from this run-owned synthetic database may be reported.
    const diagnostic=binary==='docker' && args.includes('psql') ? r.stderr.split('\n').filter(l=>/ERROR:|DETAIL:|CONTEXT:/.test(l)).slice(0,5).join('\n') : 'raw output suppressed';
    throw Error(`${stage}: command failed (${r.status ?? 'unavailable'}): ${diagnostic}`);
  }
  return r.stdout.trim();
}
const docker=(args,input)=>command('docker',['--context',context,...args],input);
function sql(c,text) {
  assert.ok(owned.includes(c));
  return docker(['exec','-i',c,'psql','-h','/tmp/vpj59-socket','-U','postgres','-X','-q','-At','-v','ON_ERROR_STOP=1'],"set statement_timeout='30s';set lock_timeout='5s';\n"+text);
}
function mark(name) { report.stages.push({stage:name,result:'PASS'}); }
function cluster(suffix) {
  const c=`v5-migration-${runId.slice(0,12)}-${suffix}`;
  assert.notEqual(spawnSync('docker',['--context',context,'inspect',c],{stdio:'ignore'}).status,0,'refuse existing container');
  owned.push(c);
  docker(['run','--pull=never','--rm','-d','--network','none','--name',c,'--label',`v5-migration.owner=${runId}`,'--user','postgres','--entrypoint','/bin/sh',image,'-c',
    'umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
  const inspected=JSON.parse(docker(['inspect',c]))[0];
  assert.equal(inspected.HostConfig.NetworkMode,'none');assert.equal(inspected.Config.Labels['v5-migration.owner'],runId);
  let ready=false;
  for(let i=0;i<100;i++) {
    if(spawnSync('docker',['--context',context,'exec',c,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'],{stdio:'ignore'}).status===0){ready=true;break;}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,100);
  }
  assert.ok(ready,'disposable readiness timeout');
  sql(c,readFileSync(resolve(repo,'tests/integration/turn/fixtures/durable-work-schema.sql'),'utf8')+`
    alter table auth.users add column is_anonymous boolean default false;
    create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
    create schema extensions;create extension pgcrypto with schema extensions;
    -- Match the relevant Supabase migration-role default grants before ACL hardening.
    alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations(version text primary key,name text not null);
  `);
  return c;
}
function apply(c,m) {
  stage=`${c.endsWith('fresh')?'fresh':'forward'} migration ${m.file}`;
  sql(c,`begin;\n${m.sql}\ninsert into supabase_migrations.schema_migrations values('${m.version}','${m.file}');commit;`);
}
// pg_dump includes tables/columns/constraints/indexes/views/functions/triggers/RLS,
// object and default ACLs, sequences/types/extensions. Ignore only dump metadata,
// random restrict tokens and TOC ordering (creation OIDs differ on late replay).
function structure(c) {
  const dump=docker(['exec',c,'pg_dump','-h','/tmp/vpj59-socket','-U','postgres','--schema-only','--no-owner','--exclude-schema=supabase_migrations','postgres']);
  return normalizeSchemaDump(dump);
}
const fixture= name=>readFileSync(resolve(repo,'tests/fixtures/v5-staging-migration',name),'utf8');
const data=c=>sql(c,`select jsonb_build_object('trips',(select jsonb_agg(to_jsonb(t) order by id) from public.trips t),
  'scopes',(select jsonb_agg(to_jsonb(t) order by id) from public.model_budget_scopes t),
  'limits',(select jsonb_agg(to_jsonb(t) order by scope_id,provider) from public.model_budget_provider_limits t),
  'attempts',(select jsonb_agg(to_jsonb(t) order by scope_id,attempt_id) from public.model_budget_attempts t),
  'consents',(select jsonb_agg(to_jsonb(t) order by id) from public.memory_consents t))::text;`);
try {
  const args=process.argv.slice(2);
  if(args[0]!=='--execute' || !(args.length===1 || (args.length===3 && args[1]==='--snapshot'))) throw Error('USAGE: --execute [--snapshot local.json] (no DSN or target arguments)');
  if(process.env.DOCKER_HOST!==undefined || process.env.DOCKER_CONTEXT!==undefined) throw Error('DOCKER_OVERRIDE_REJECTED');
  const local=catalog(), input=snapshot(args[2] ?? resolve(repo,'tests/fixtures/v5-staging-migration/observed-20261001.json'));
  const difference=compare(local,input.applied);
  report.versionSet=difference;report.provenance=input.provenance;
  assert.ok(difference.replayable,'UNKNOWN_APPLIED_VERSION');
  report.toolSha256=Object.fromEntries(['scripts/acceptance/v5-staging-migration-replay.mjs','scripts/acceptance/v5-staging-migration-set.mjs','tests/fixtures/v5-staging-migration/baseline.sql','tests/fixtures/v5-staging-migration/probes.sql'].map(path=>[path,digest(readFileSync(resolve(repo,path)))]));
  stage='local Docker preflight';context=command('docker',['context','show']);
  assert.match(context,/^[a-zA-Z0-9_.-]+$/);
  assert.match(JSON.parse(command('docker',['context','inspect',context]))[0].Endpoints.docker.Host,/^unix:\/\//);
  report.imageId=docker(['image','inspect',image,'--format','{{.Id}}']);
  const forward=cluster('forward'),fresh=cluster('fresh');
  const applied=new Set(input.applied);
  for(const m of local.filter(m=>applied.has(m.version))) apply(forward,m);
  mark('reconstructed synthetic applied baseline');
  stage='seed pre-replay synthetic Trip, budget and revoked memory consent';sql(forward,fixture('baseline.sql'));
  const before=data(forward);
  for(const m of local.filter(m=>!applied.has(m.version))) apply(forward,m);
  mark('forward missing set replay');
  stage='preexisting data invariants';assert.equal(data(forward),before);mark(stage);
  for(const m of local) apply(fresh,m);
  mark('fresh catalog replay');
  stage='structure and permission comparison';
  const a=structure(forward),b=structure(fresh),am=new Map(a),bm=new Map(b);
  const keys=[...new Set([...am.keys(),...bm.keys()])].sort();
  report.schemaDifferences=keys.filter(k=>am.get(k)!==bm.get(k));
  report.forwardSchemaSha256=digest(JSON.stringify(a));report.freshSchemaSha256=digest(JSON.stringify(b));
  // Continue independent behavioral probes even when comparison differs.
  for(const c of [forward,fresh]) {
    if(c===fresh) sql(c,fixture('baseline.sql'));
    stage=`${c.endsWith('fresh')?'fresh':'forward'} actor and revocation invariants`;
    sql(c,fixture('probes.sql'));mark(stage);
    assert.equal(sql(c,'select count(*) from supabase_migrations.schema_migrations;'),String(local.length));
  }
  stage='structure and permission comparison';assert.deepEqual(report.schemaDifferences,[],'FORWARD_SCHEMA_OR_ACL_DIFFERS');mark(stage);
  report.result='PASS_LOCAL_SYNTHETIC_REPLAY_ONLY';
} catch(error) { report.failedStage=stage;report.reason=error.message;process.exitCode=1; }
finally {
  report.cleanup=[];
  for(const c of owned.reverse()) {
    const r=spawnSync('docker',['--context',context,'inspect',c,'--format','{{index .Config.Labels "v5-migration.owner"}}'],{encoding:'utf8',timeout:15000});
    if(r.status===0 && r.stdout.trim()===runId) {
      const removed=spawnSync('docker',['--context',context,'rm','-f',c],{stdio:'ignore',timeout:15000});
      report.cleanup.push({container:c,result:removed.status===0?'PASS':'FAIL'});
      if(removed.status!==0){process.exitCode=1;report.result='FAIL_LOCAL_SYNTHETIC_REPLAY';}
    } else if(r.status!==0 && !r.error && /No such object|No such container/.test(r.stderr)) {
      report.cleanup.push({container:c,result:'PASS_ABSENT'});
    } else { report.cleanup.push({container:c,result:r.status===0?'FAIL_OWNER_LABEL':'FAIL_INSPECTION'});process.exitCode=1;report.result='FAIL_LOCAL_SYNTHETIC_REPLAY'; }
  }
  report.completedAt=new Date().toISOString();
  (process.exitCode ? console.error : console.log)(JSON.stringify(report,null,2));
}
