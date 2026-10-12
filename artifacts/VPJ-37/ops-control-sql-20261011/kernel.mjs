import assert from 'node:assert/strict';
import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {command} from '../../../tests/integration/cost/fixtures/postgres-rpc.mjs';

export const name='vpj37-w2sql-20261011-6c527b9d';
const image='public.ecr.aws/supabase/postgres@sha256:86a2e078779e5bdccda1f6f6c5063aa9779a322d1fface5fb408d051909b230f';
const owner='01a126aa-2822-75d1-800b-ccd4fefcdc64';
const socket='/tmp/vpj37-6c527b9d-socket';
const out=fileURLToPath(new URL('.',import.meta.url));
const root=fileURLToPath(new URL('../../../',import.meta.url));
export async function db(text){
 const r=await command('docker',['exec','-i',name,'psql','-h',socket,'-U','postgres','-X','-q','-At','-v','ON_ERROR_STOP=1'],"set statement_timeout='30s';set lock_timeout='3s';set search_path=public;\n"+text);
 assert.equal(r.code,0,r.stderr);return r.stdout.trim();
}
export async function owned(){
 const r=await command('docker',['inspect',name]);assert.equal(r.code,0,r.stderr);
 const v=JSON.parse(r.stdout)[0];assert.equal(v.Config.Labels['vpj37.owner'],owner);
 assert.equal(v.Config.Labels['vpj37.nonce'],name);assert.equal(v.HostConfig.NetworkMode,'none');
 assert.equal(v.Config.User,'postgres');assert.equal(v.Mounts.length,0);
 assert.equal(Object.keys(v.HostConfig.PortBindings??{}).length,0);
 assert.equal(v.Config.Image,image);return v;
}
async function prepare(){
 assert.ok(!process.env.DOCKER_HOST&&!process.env.DOCKER_CONTEXT,'No remote Docker override');
 const context=await command('docker',['context','inspect']);assert.equal(context.code,0,context.stderr);
 assert.ok(JSON.parse(context.stdout)[0].Endpoints.docker.Host.startsWith('unix:///'));
 const collision=await command('docker',['ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}']);
 assert.equal(collision.code,0,collision.stderr);assert.equal(collision.stdout.trim(),'','Owned nonce collision: do not reuse');
 const check=await command('docker',['image','inspect',image]);assert.equal(check.code,0,check.stderr);
 assert.equal(JSON.parse(check.stdout)[0].Id,image.split('@')[1]);
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',name,
  '--label','vpj37.owner='+owner,'--label','vpj37.nonce='+name,'--user','postgres','--entrypoint','/bin/sh',image,
  '-c','umask 077; mkdir /tmp/vpj37-6c527b9d-socket; initdb -D /tmp/vpj37-6c527b9d-db -A trust --no-locale -E UTF8 >/tmp/vpj37-6c527b9d-init.log 2>&1 && exec postgres -D /tmp/vpj37-6c527b9d-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj37-6c527b9d-socket -c unix_socket_permissions=0700']);
 assert.equal(r.code,0,r.stderr);
 let ready=false;for(let n=0;n<100;n++){
  const probe=await command('docker',['exec',name,'pg_isready','-h',socket,'-U','postgres']);
  if(probe.code===0){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.ok(ready,'Own kernel readiness timeout');await owned();
 const version=await db('show server_version;');assert.match(version,/^17\.6(?:\.|$)/);
 const network=await db("show listen_addresses;show unix_socket_permissions;");assert.equal(network,'0700');
 writeFileSync(out+'kernel-preflight.json',JSON.stringify({nonce:name,owner,image,version,
  network:'none',publishedPorts:0,mounts:0,socketMode:'0700',actualPreflight:'PASS'},null,2)+'\n');
 console.log('Owned PG17.6 kernel preflight PASS');
}
async function replay(){
 await owned();assert.match(await db('show server_version;'),/^17\.6(?:\.|$)/);
 assert.equal(await db("select to_regnamespace('auth') is null;"),'t','Do not replay into nonempty own DB');
 await db(readFileSync(root+'tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 const files=readdirSync(root+'supabase/migrations').filter(f=>f.endsWith('.sql')).sort();assert.equal(files.length,154);
 const manifest=[];
 for(const file of files){const source=readFileSync(root+'supabase/migrations/'+file,'utf8');
  try{await db('begin;'+source+'\ncommit;');}catch(error){
   writeFileSync(out+'kernel-replay-fail.json',JSON.stringify({failedMigration:file,applied:manifest,
    error:String(error),actualReplay:'FAIL'},null,2)+'\n');throw error;
  }manifest.push({file,sha256:createHash('sha256').update(source).digest('hex')});
 }
 writeFileSync(out+'kernel-replay.json',JSON.stringify({head:'4f3c7b322316f3c6be3d505bdeb86b300a1596f4',
  migrations:manifest,actualReplay:'PASS',auth:'SQL fixture only, not GoTrue/JWT'},null,2)+'\n');
 await catalog();console.log('Actual ordered154 migration replay/catalog PASS');
}
async function catalog(label='before'){
 await owned();
 const source=await db(`set search_path='';select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
 'definition',pg_get_functiondef(p.oid),'prosrc',p.prosrc,'identity',pg_get_function_identity_arguments(p.oid),
 'arguments',pg_get_function_arguments(p.oid),'result',pg_get_function_result(p.oid),'config',p.proconfig,
 'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'securityDefiner',p.prosecdef,'volatility',p.provolatile,
 'strict',p.proisstrict,'parallel',p.proparallel,'kind',p.prokind,'language',l.lanname,
 'md5',md5(pg_get_functiondef(p.oid))) order by p.oid::regprocedure::text),'[]')
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
 where n.nspname not in('pg_catalog','information_schema','extensions','auth') and p.prokind='f';`);
 writeFileSync(out+'catalog-'+label+'.json',source+'\n');
 const schema=await db(`set search_path='';select coalesce(jsonb_agg(jsonb_build_object('relation',n.nspname||'.'||c.relname,
 'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,
 'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select jsonb_agg(jsonb_build_array(k.conname,pg_get_constraintdef(k.oid)) order by k.conname) from pg_constraint k where k.conrelid=c.oid),
 'triggers',(select jsonb_agg(jsonb_build_array(t.tgname,pg_get_triggerdef(t.oid)) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)) order by n.nspname,c.relname),'[]')
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r'
 and n.nspname not in('pg_catalog','information_schema','extensions');`);
 writeFileSync(out+'catalog-relations-'+label+'.json',schema+'\n');
}
async function diagnose(){
 await owned();
 const actual=await db(`select jsonb_build_object('acl',c.relacl::text,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
 'owner',pg_get_userbyid(c.relowner),'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid),'validated',k.convalidated) order by k.conname),'[]') from pg_constraint k where k.conrelid=c.oid),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled,'function',t.tgfoid::regprocedure::text) order by t.tgname),'[]') from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal))
 from pg_class c where c.oid='turn_private.work'::regclass;`);
 writeFileSync(out+'work-prefix-diagnostic.json',actual+'\n');
 const text=readFileSync(root+'supabase/migrations/20261010030000_vpj09_travel_directions.sql','utf8');
 const maps=[...text.matchAll(/jsonb_each\('((?:[^']|'')*)'::jsonb\)/g)].map(m=>JSON.parse(m[1].replaceAll("''","'")));
 const expected=maps.find(m=>m['turn_private.work'])['turn_private.work'];
 const live=JSON.parse(actual);const delta=[];
 function diff(a,b,path=''){if(JSON.stringify(a)===JSON.stringify(b))return;
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){
   for(const k of new Set([...Object.keys(a),...Object.keys(b)]))diff(a[k],b[k],path+'/'+k);
  }else delta.push({path,expected:a,actual:b});
 }diff(expected,live);writeFileSync(out+'work-prefix-delta.json',JSON.stringify(delta,null,2)+'\n');
 console.log(JSON.stringify(delta));
 console.log('Owned prefix schema diagnostic saved;154 replay remains FAIL');
}
async function candidateCore(){
 await owned();
 const source=readFileSync(out+'new-kernel.candidate.sql','utf8');
 assert.equal(await db("select to_regnamespace('ops_control_private') is null;"),'t','Candidate already installed');
 await db('begin;'+source+'\nrollback;');
 assert.equal(await db("select to_regnamespace('ops_control_private') is null;"),'t');
 await db('begin;'+source+'\ncommit;');
 console.log('Private candidate core SQL apply/rollback PASS; runtime/coverage not yet proven');
}
async function candidatePackage(){
 await owned();assert.equal(await db("select to_regnamespace('ops_control_private') is null;"),'t');
 const source=['new-kernel.candidate.sql','lifecycle.candidate.sql','shared-functions.candidate.sql']
  .map(f=>readFileSync(out+f,'utf8')).join('\n');
 const unchanged=()=>db("set search_path='';select md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,''),'|' order by p.oid::regprocedure::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f' and n.nspname not in('pg_catalog','information_schema','extensions','auth')");
 const original=await unchanged();
 try{await db('begin;'+source+'\nrollback;');}catch(error){writeFileSync(out+'candidate-package-fail.log',String(error)+'\n');throw error;}
 assert.equal(await unchanged(),original);assert.equal(await db("select to_regnamespace('ops_control_private') is null;"),'t');
 await db('begin;'+source+'\ncommit;');await catalog('after-unpinned');
 const live=JSON.parse(readFileSync(out+'catalog-after-unpinned.json','utf8'));
 const plan=JSON.parse(readFileSync(out+'shared-candidates/manifest.json','utf8'));
 for(const row of plan){assert.deepEqual(live.find(x=>x.signature===row.signature),row.after,'Actual after metadata mismatch: '+row.signature);row.afterCatalogVerified=true;}
 writeFileSync(out+'shared-candidates/actual-after-validation.json',JSON.stringify({functions:plan.map(x=>({signature:x.signature,beforeSha256:x.beforeSha256,afterSha256:x.afterSha256,
  sourceAndMetadata:'PASS',securityDefinerBefore:x.before.securityDefiner,securityDefinerAfter:x.after.securityDefiner})),
  rollbackSourceAndACL:'PASS',privacyRuntimePins:'NOT YET APPLIED',behavior:'UNRUN'},null,2)+'\n');
 console.log('Private core+lifecycle+14 shared actual source/meta/rollback PASS; privacy/runtime/behavior still unproven');
}
async function guardValues(){
 await owned();const queries=JSON.parse(readFileSync(out+'guard-queries.json','utf8'));const values={};
 for(const [key,q] of Object.entries(queries)){
  assert.ok(key.startsWith('global-')||key==='profile-triggers'||key==='conversation-fk');
  assert.ok(q.startsWith("set search_path='';select "));values[key]=await db(q);
 }
 writeFileSync(out+'guard-values-after.json',JSON.stringify(values,null,2)+'\n');
 console.log('Actual own candidate catalog guard values captured; not an automatic compatibility acceptance');
}
async function guardPackage(fix=false){
 await owned();const source=readFileSync(out+(fix?'guard-fix.candidate.sql':'guard-functions.candidate.sql'),'utf8');
 await db('begin;'+source+'\nrollback;');
 await db('begin;'+source+'\ncommit;');await catalog('after-guards');
 const live=JSON.parse(readFileSync(out+'catalog-after-guards.json','utf8'));
 const plan=JSON.parse(readFileSync(out+'guard-candidates/manifest.json','utf8'));
 for(const row of plan)assert.deepEqual(live.find(x=>x.signature===row.signature),row.after,'Actual metadata guard mismatch '+row.signature);
 const names=['profile_data_private.schema_v1()','conversation_data_private.schema_supported_v1()',
  'result_data_private.schema_supported_v1()','turn_data_private.schema_supported_v1()',
  'turn_data_private.runtime_supported_v1()','turn_data_private.write_hooks_valid_v1()',
  'turn_data_private.hooks_valid_v1()','export_private.profile_hooks_valid_v1()'];
 const values={};for(const fn of names)values[fn]=await db('select '+fn+';');
 writeFileSync(out+'guard-runtime-validation.json',JSON.stringify({exactAfterMetadata:'PASS',values},null,2)+'\n');
 assert.ok(Object.values(values).every(v=>v==='t'),'Original runtime metadata predicate remains false; inspect actual deltas');
 console.log('5 exact metadata guard source/ACL/config/rollback/runtime predicates PASS');
}
async function profileDiagnostic(){
 await owned();const source=readFileSync(out+'profile-guard-diagnostic.sql','utf8');
 const r=await command('docker',['exec','-i',name,'psql','-h',socket,'-U','postgres','-X','-q','-At','-v','ON_ERROR_STOP=1'],source);
 writeFileSync(out+'profile-guard-diagnostic.log',r.stderr+'\n');console.log(r.stderr.trim());
 assert.notEqual(r.code,0,'Diagnostic is not a replacement passing guard');
}
async function installedGuard(){
 await owned();const source=readFileSync(out+'installed-guard.candidate.sql','utf8');
 await db('begin;'+source+'\nrollback;');await db('begin;'+source+'\ncommit;');
 assert.equal(await db('select ops_control_private.installed_supported_v1();'),'t');
 assert.equal(await db('select ops_control_private.recovery_ready_v1();'),'f');
 console.log('Exact installed source guard PASS; recovery stays denied');
}
async function lifecycleFix(){
 await owned();const before=JSON.parse(readFileSync(out+'catalog-after-guards.json','utf8'))
  .find(x=>x.signature==='ops_control_private.reconcile_restore_v1(jsonb,text)');
 assert.equal(await db("set search_path='';select md5(pg_get_functiondef('ops_control_private.reconcile_restore_v1(jsonb,text)'::regprocedure));"),before.md5);
 const text=readFileSync(out+'lifecycle.candidate.sql','utf8');
 const start=text.indexOf('create function ops_control_private.reconcile_restore_v1(');
 const end=text.indexOf('end $$;',start)+7;assert.ok(start>=0&&end>start);
 await db(text.slice(start,end).replace('create function','create or replace function'));
 await catalog('after-guards');console.log('Exact own lifecycle query alias correction applied; source guard must be regenerated');
}
async function refreshInstalledGuard(){
 await owned();await db(readFileSync(out+'installed-guard.candidate.sql','utf8').replace('create function ops_control_private.installed_supported_v1()',
  'create or replace function ops_control_private.installed_supported_v1()'));
 assert.equal(await db('select ops_control_private.installed_supported_v1();'),'t');
 console.log('Static installed source guard refreshed to exact corrected own source PASS');
}
async function sourceFix(){
 await owned();const text=readFileSync(out+'new-kernel.candidate.sql','utf8');
 const known=JSON.parse(readFileSync(out+'catalog-after-guards.json','utf8'));
 for(const sig of ['ops_control_private.budget_source_changed_v1()','ops_control_private.admission_guard_v1()']){
  const row=known.find(x=>x.signature===sig);assert.ok(row);
  assert.equal(await db("set search_path='';select md5(pg_get_functiondef('"+sig+"'::regprocedure));"),row.md5);
  const start=text.indexOf('create function '+sig.split('(')[0]+'(');
  const end=text.indexOf('end $$;',start)+7;assert.ok(start>=0&&end>start);
  await db(text.slice(start,end).replace('create function','create or replace function'));
 }
 // This own fixture has no provider requests or real data. Close its root before
 // replaying the failed behavior cases; preserve revision/stop floors and receipts.
 await db('update ops_control_private.root_v1 set recovery_boot=null,recovery_manifest=null where singleton;');
 await catalog('after-guards');console.log('Exact own generic trigger/admission drain corrections applied; root denied, floors preserved');
}
async function installedTables(){
 await owned();const text=await db(`set search_path='';select jsonb_agg(jsonb_build_object('relation',n.nspname||'.'||c.relname,
 'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
 'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select jsonb_agg(jsonb_build_array(k.conname,pg_get_constraintdef(k.oid)) order by k.conname) from pg_constraint k where k.conrelid=c.oid),
 'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',p.polroles::text,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname),'[]') from pg_policy p where p.polrelid=c.oid),
 'triggers',(select jsonb_agg(jsonb_build_array(t.tgname,pg_get_triggerdef(t.oid),t.tgenabled::text,t.tgfoid::regprocedure::text) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)) order by n.nspname,c.relname)
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and(n.nspname='ops_control_private'
 or c.oid in('public.model_budget_scopes'::regclass,'public.model_budget_provider_limits'::regclass,'public.model_budget_attempts'::regclass,'turn_private.work'::regclass));`);
 writeFileSync(out+'installed-table-pins.json',text+'\n');console.log('Exact table ACL/RLS/forceRLS/policy/new trigger enabled pins captured');
}
async function triggerNegative(){
 await owned();assert.equal(await db('select ops_control_private.installed_supported_v1();'),'t');
 const disabled=await db(`begin;alter table public.model_budget_scopes disable trigger ops_control_scope_version_v1;
 select ops_control_private.installed_supported_v1();select ops_control_private.recovery_ready_v1();rollback;`);
 assert.equal(disabled,'f\nf');assert.equal(await db('select ops_control_private.installed_supported_v1();'),'t');
 writeFileSync(out+'trigger-disabled-negative.json',JSON.stringify({installedBefore:true,
  disabledOwnNewHook:{installed:false,recovery:false},rollbackInstalled:true,result:'PASS'},null,2)+'\n');
 console.log('New hook DISABLE -> installed/recovery denied; exact rollback restored PASS');
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const mode=process.argv[2];
 if(mode==='prepare')await prepare();else if(mode==='replay')await replay();
 else if(mode==='catalog')await catalog();else if(mode==='diagnose')await diagnose();
 else if(mode==='candidate-core')await candidateCore();else if(mode==='cleanup'){
  await owned();const r=await command('docker',['rm','-f',name]);assert.equal(r.code,0,r.stderr);
  console.log('Verified own kernel cleanup PASS');
 }else if(mode==='candidate-package')await candidatePackage();else if(mode==='guard-values')await guardValues();
 else if(mode==='guard-package')await guardPackage();else if(mode==='guard-fix')await guardPackage(true);
 else if(mode==='profile-diagnostic')await profileDiagnostic();else if(mode==='installed-guard')await installedGuard();
 else if(mode==='lifecycle-fix')await lifecycleFix();else if(mode==='refresh-installed-guard')await refreshInstalledGuard();
 else if(mode==='source-fix')await sourceFix();else if(mode==='installed-tables')await installedTables();
 else if(mode==='trigger-negative')await triggerNegative();else throw Error('Unsupported owned kernel action');
}
