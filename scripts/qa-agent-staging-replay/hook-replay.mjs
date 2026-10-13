import { catalog } from './reviewed-catalog.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compare, snapshot, digest, repo, normalizeSchemaDump } from '../acceptance/v5-staging-migration-set.mjs';

// No connection strings, resource names, remote context or target-write mode.
const image = 'public.ecr.aws/supabase/postgres:17.6.1.155';
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
  const c=`qaw-hook-${runId.slice(0,12)}-${suffix}`;
  assert.notEqual(spawnSync('docker',['--context',context,'inspect',c],{stdio:'ignore'}).status,0,'refuse existing container');
  owned.push(c);
  docker(['run','--pull=never','--rm','-d','--network','none','--name',c,'--label',`v5-migration.owner=${runId}`,'--user','postgres','--entrypoint','/bin/sh',image,'-c',
    'umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
  const inspected=JSON.parse(docker(['inspect',c]))[0];
  assert.equal(inspected.HostConfig.NetworkMode,'none');assert.deepEqual(inspected.Mounts,[]);assert.ok(!inspected.HostConfig.PortBindings || Object.keys(inspected.HostConfig.PortBindings).length===0);assert.equal(inspected.Config.Labels['v5-migration.owner'],runId);
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
  report.lastAttemptedVersion=m.version;
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
try {
  const args=process.argv.slice(2);
  if(args[0]!=='--execute' || !(args.length===1 || (args.length===3 && args[1]==='--snapshot'))) throw Error('USAGE: --execute [--snapshot local.json] (no DSN or target arguments)');
  if(process.env.DOCKER_HOST!==undefined || process.env.DOCKER_CONTEXT!==undefined) throw Error('DOCKER_OVERRIDE_REJECTED');
  const local=catalog(), input=snapshot(args[2] ?? resolve(repo,'artifacts/QAWEB/staging-replay/observed.json'));
  const difference=compare(local,input.applied);
  report.versionSet=difference;report.provenance=input.provenance;
  assert.ok(difference.replayable,'UNKNOWN_APPLIED_VERSION');
  report.toolSha256=Object.fromEntries(['scripts/qa-agent-staging-replay/hook-replay.mjs','scripts/qa-agent-staging-replay/fingerprint.sql','scripts/qa-agent-staging-replay/reviewed-catalog.mjs','scripts/acceptance/v5-staging-migration-set.mjs','tests/fixtures/v5-staging-migration/baseline.sql','tests/fixtures/v5-staging-migration/probes.sql'].map(path=>[path,digest(readFileSync(resolve(repo,path)))]));
  stage='local Docker preflight';context=command('docker',['context','show']);
  assert.match(context,/^[a-zA-Z0-9_.-]+$/);
  assert.match(JSON.parse(command('docker',['context','inspect',context]))[0].Endpoints.docker.Host,/^unix:\/\//);
  report.imageId=docker(['image','inspect',image,'--format','{{.Id}}']);
  const hook=JSON.parse(readFileSync(0,'utf8'));
  assert.equal(hook.md5,'6998ea6b4c2480f5d2e34b5dcf3f8d36');assert.equal(createHash('md5').update(hook.definition).digest('hex'),hook.md5);assert.equal(hook.owner,'postgres');assert.equal(hook.prosecdef,true);assert.deepEqual(hook.proconfig,['search_path=pg_catalog']);assert.equal(hook.evtenabled,'O');assert.equal(hook.evtname,'ensure_rls');assert.equal(hook.evtevent,'ddl_command_end');assert.deepEqual(hook.evttags,['CREATE TABLE','CREATE TABLE AS','SELECT INTO']);
  const forward=cluster('forward');
  const applied=new Set(input.applied);
  for(const m of local.filter(m=>applied.has(m.version))) apply(forward,m);
  mark('reconstructed synthetic applied baseline');
  stage='exact target hook installation';
  sql(forward,hook.definition+";create event trigger ensure_rls on ddl_command_end when tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO') execute function public.rls_auto_enable();");
  assert.equal(sql(forward,"select md5(pg_get_functiondef('public.rls_auto_enable()'::regprocedure));"),hook.md5);
  report.hook={md5:hook.md5,sha256:digest(hook.definition),owner:hook.owner,prosecdef:hook.prosecdef,proconfig:hook.proconfig,event:hook.evtname,tags:hook.evttags,enabled:hook.evtenabled};mark(stage);
  stage='public-only event hook counterexample';
  assert.equal(sql(forward,`begin;create table public.qaw_hook_probe(id int);create table private.qaw_hook_probe(id int);select string_agg(n.nspname||':'||c.relrowsecurity::text,',' order by n.nspname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relname='qaw_hook_probe';rollback;`),'private:false,public:true');mark(stage);
  const baselineMetadata=JSON.parse(sql(forward,readFileSync(resolve(repo,'scripts/qa-agent-staging-replay/fingerprint.sql'),'utf8')));
  const target=JSON.parse(readFileSync(resolve(repo,'artifacts/QAWEB/staging-replay/target-metadata.json'),'utf8'));
  assert.deepEqual(baselineMetadata,target);mark('all target business schema names and 140 function definition hashes match at75 with hook');
  for(const m of local.filter(m=>!applied.has(m.version))) apply(forward,m);
  mark('forward missing set replay');

  const gateNames=Object.keys(JSON.parse(readFileSync(resolve(repo,'artifacts/QAWEB/sql-20261013/all-gates-before.json'),'utf8')));
  report.gates=JSON.parse(sql(forward,'select jsonb_build_object('+gateNames.flatMap(n=>["'"+n+"'",n+'()']).join(',')+');'));
  assert.ok(Object.values(report.gates).every(v=>v===true));mark('all ten lifecycle gates');
  report.nonParity=['Six other platform event triggers not installed','Auth/session fixture, not GoTrue','No actual target data or full catalog owner/ACL/role comparison'];
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
