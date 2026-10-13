import { catalog } from './reviewed-catalog.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compare, snapshot, digest, repo, normalizeSchemaDump } from '../acceptance/v5-staging-migration-set.mjs';

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
  const local=catalog(), input=snapshot(args[2] ?? resolve(repo,'artifacts/QAWEB/staging-replay/observed.json'));
  const difference=compare(local,input.applied);
  report.versionSet=difference;report.provenance=input.provenance;
  assert.ok(difference.replayable,'UNKNOWN_APPLIED_VERSION');
  report.toolSha256=Object.fromEntries(['scripts/qa-agent-staging-replay/replay.mjs','scripts/qa-agent-staging-replay/fingerprint.sql','scripts/qa-agent-staging-replay/reviewed-catalog.mjs','scripts/acceptance/v5-staging-migration-set.mjs','tests/fixtures/v5-staging-migration/baseline.sql','tests/fixtures/v5-staging-migration/probes.sql'].map(path=>[path,digest(readFileSync(resolve(repo,path)))]));
  stage='local Docker preflight';context=command('docker',['context','show']);
  assert.match(context,/^[a-zA-Z0-9_.-]+$/);
  assert.match(JSON.parse(command('docker',['context','inspect',context]))[0].Endpoints.docker.Host,/^unix:\/\//);
  report.imageId=docker(['image','inspect',image,'--format','{{.Id}}']);
  const forward=cluster('forward');
  const applied=new Set(input.applied);
  for(const m of local.filter(m=>applied.has(m.version))) apply(forward,m);
  mark('reconstructed synthetic applied baseline');
  const baselineMetadata=JSON.parse(sql(forward,readFileSync(resolve(repo,'scripts/qa-agent-staging-replay/fingerprint.sql'),'utf8')));
  writeFileSync(resolve(repo,'artifacts/QAWEB/staging-replay/local-75-metadata.json'),JSON.stringify(baselineMetadata,null,2)+'\n');
  const target=JSON.parse(readFileSync(resolve(repo,'artifacts/QAWEB/staging-replay/target-metadata.json'),'utf8'));
  const key=f=>f.schema+'.'+f.name+'('+f.args+')';
  const targetMap=new Map(target.functions.map(f=>[key(f),f.md5])), localMap=new Map(baselineMetadata.functions.map(f=>[key(f),f.md5]));
  report.targetComparison={schemasTarget:target.schemas,schemasLocal:baselineMetadata.schemas,functionDifferences:[...new Set([...targetMap.keys(),...localMap.keys()])].sort().filter(k=>targetMap.get(k)!==localMap.get(k)).map(k=>({signature:k,target:targetMap.get(k)??null,local:localMap.get(k)??null}))};
  stage='seed pre-replay synthetic Trip, budget and revoked memory consent';sql(forward,fixture('baseline.sql'));
  const before=data(forward);
  for(const m of local.filter(m=>!applied.has(m.version))) {
    if(m.version==='20261013050429') {
      stage='QA transaction rollback';const before=JSON.stringify(structure(forward));
      assert.match(m.sql,/commit;\s*$/i);
      sql(forward,m.sql.replace(/commit;\s*$/i,'rollback;'));
      assert.equal(JSON.stringify(structure(forward)),before);mark(stage);
      for(const [signature,expected] of [['public.claim_turn_work()','QA_SHARED_SOURCE_CONFLICT'],['turn_data_private.runtime_supported_v1()','QA_LIFECYCLE_SOURCE_CONFLICT']]) {
        stage='QA source guard '+signature;
        const original=sql(forward,"select pg_get_functiondef('"+signature+"'::regprocedure);");
        const pos=original.lastIndexOf('$function$');assert.ok(pos>0);
        sql(forward,original.slice(0,pos)+'-- synthetic unknown source\n'+original.slice(pos));
        const altered=JSON.stringify(structure(forward));
        let reason='';try {sql(forward,m.sql);}catch(e){reason=e.message;}
        assert.ok(reason.includes(expected),reason);assert.equal(JSON.stringify(structure(forward)),altered);
        report.stages.push({stage,result:'PASS',expectedRefusal:expected});sql(forward,original);
      }
    }
    apply(forward,m);
  }
  mark('forward missing set replay');
  stage='preexisting data invariants';assert.equal(data(forward),before);mark(stage);
  const gateNames=Object.keys(JSON.parse(readFileSync(resolve(repo,'artifacts/QAWEB/sql-20261013/all-gates-before.json'),'utf8')));
  report.gates=JSON.parse(sql(forward,'select jsonb_build_object('+gateNames.flatMap(n=>["'"+n+"'",n+'()']).join(',')+');'));
  assert.ok(Object.values(report.gates).every(v=>v===true));mark('all ten lifecycle gates');
  stage='QA execute role vectors';
  const roles=JSON.parse(sql(forward,`select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_role',has_function_privilege('service_role',p.oid,'EXECUTE')) order by n.nspname,p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','turn_private') and p.proname like 'qa_%';`));
  const serviceNames=new Set(['qa_read_reconciliation_v1','qa_claim_work_v1','qa_read_work_v1','qa_authorize_dispatch_v1','qa_complete_work_v1']);
  assert.equal(roles.length,16);assert.deepEqual(roles.find(r=>r.schema==='turn_private'&&r.name==='qa_consumer_window_v1'),{schema:'turn_private',name:'qa_consumer_window_v1',anon:false,authenticated:false,service_role:false});
  for(const r of roles){assert.equal(r.anon,false);assert.equal(r.authenticated,r.schema==='public'&&!serviceNames.has(r.name));assert.equal(r.service_role,r.schema==='public'&&serviceNames.has(r.name));}
  report.qaRoleVectors=roles;mark(stage);
  stage='actor and revocation invariants';sql(forward,fixture('probes.sql'));mark(stage);
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
