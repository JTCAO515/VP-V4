// Own leased fixture kernel. Adapted read-only from stable154 replay tooling; no foreign resource names.
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {command} from '../../../tests/integration/cost/fixtures/postgres-rpc.mjs';

export const name='vpj13-goal-return-sql-20261012-51fb6d9a';
const image='public.ecr.aws/supabase/postgres@sha256:86a2e078779e5bdccda1f6f6c5063aa9779a322d1fface5fb408d051909b230f';
const owner='01a12e1c-6772-7e82-a89a-9111f5488a3a';
const socket='/tmp/vpj13-51fb6d9a-socket';
const out=fileURLToPath(new URL('.',import.meta.url));
const root=fileURLToPath(new URL('../../../',import.meta.url));
export async function db(text){
 const r=await command('docker',['exec','-i',name,'psql','-h',socket,'-U','postgres','-X','-q','-At','-v','ON_ERROR_STOP=1'],"set statement_timeout='30s';set lock_timeout='3s';set search_path=public;\n"+text);
 assert.equal(r.code,0,r.stderr);return r.stdout.trim();
}
export async function owned(){
 const r=await command('docker',['inspect',name]);assert.equal(r.code,0,r.stderr);
 const v=JSON.parse(r.stdout)[0];assert.equal(v.Config.Labels['vpj13.owner'],owner);
 assert.equal(v.Config.Labels['vpj13.nonce'],name);assert.equal(v.HostConfig.NetworkMode,'none');
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
  '--label','vpj13.owner='+owner,'--label','vpj13.nonce='+name,'--user','postgres','--entrypoint','/bin/sh',image,
  '-c','umask 077; mkdir /tmp/vpj13-51fb6d9a-socket; initdb -D /tmp/vpj13-51fb6d9a-db -A trust --no-locale -E UTF8 >/tmp/vpj13-51fb6d9a-init.log 2>&1 && exec postgres -D /tmp/vpj13-51fb6d9a-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj13-51fb6d9a-socket -c unix_socket_permissions=0700']);
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
 writeFileSync(out+'kernel-replay.json',JSON.stringify({head:'daa7bae44a660381fb3295d0d2afc327ea98d3ba',
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

if(process.argv[2]==='prepare')await prepare();else if(process.argv[2]==='replay')await replay();else if(process.argv[2]==='catalog')await catalog(process.argv[3]??'before');

if(process.argv[2]==='candidate'){
 await owned();
 const candidate=readFileSync(out+'goal-return.candidate.sql','utf8');
 assert.equal(await db("select to_regprocedure('public.read_goal_return_reference_v1(uuid,uuid,uuid,integer,uuid,bigint,bigint)') is null"),'t');
 await db('begin;'+candidate+'\nrollback;');
 await db('begin;'+candidate+'\ncommit;');await catalog('after');
 const before=JSON.parse(readFileSync(out+'catalog-before.json','utf8'));
 const after=JSON.parse(readFileSync(out+'catalog-after.json','utf8'));
 for(const old of before)assert.deepEqual(after.find(f=>f.signature===old.signature),old,old.signature);
 assert.equal(after.length,before.length+2);
 writeFileSync(out+'candidate-catalog-proof.json',JSON.stringify({oldFunctionsUnchanged:before.length,newFunctions:2,oldDefinitionAndMetadata:'PASS',runtime:'UNRUN'},null,2)+'\n');
 console.log('Candidate compile/rollback/old catalog unchanged PASS');
}

if(process.argv[2]==='candidate-reset'){
 await owned();await db('drop function public.read_goal_return_reference_v1(uuid,uuid,uuid,integer,uuid,bigint,bigint);drop function turn_private.goal_return_reference_v1(uuid,uuid,uuid,integer,uuid,bigint,bigint);');
 console.log('Own candidate reset only PASS');
}

if(process.argv[2]==='cleanup'){
 const before=await owned();
 const clean=await command('docker',['rm','-f',name]);assert.equal(clean.code,0,clean.stderr);
 const absent=await command('docker',['ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}']);assert.equal(absent.code,0,absent.stderr);assert.equal(absent.stdout.trim(),'');
 writeFileSync(out+'resource-cleanup.json',JSON.stringify({observedAt:new Date().toISOString(),nonce:name,owner,image,verifiedLabels:before.Config.Labels,network:before.HostConfig.NetworkMode,mountCount:before.Mounts.length,publishedPorts:before.HostConfig.PortBindings??{},cleanup:'PASS',exactNonceAbsentAfter:true,otherResources:'not accessed or changed',persistentDataOrVolumes:'none'},null,2)+'\n');
 console.log('Verified own fixture removed; exact nonce absent PASS');
}
