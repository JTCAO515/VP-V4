import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,statSync,existsSync,mkdirSync} from 'node:fs';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
const exec=promisify(execFile);
export const root=fileURLToPath(new URL('../../../../',import.meta.url));
const out=process.env.VP_GOAL_RETURN_OUTPUT??root+'artifacts/IOS-001/goal-return-sql-20261015/';
const container=process.env.VP_GOAL_RETURN_CONTAINER;
const socket='/tmp/ios001-e3-socket';
const image='public.ecr.aws/supabase/postgres:17.6.1.159';
export const output=name=>out+name;
const manifest=output('resource.json');
const bin='/opt/homebrew/opt/postgresql@17/bin/';
export function resource(){const r=JSON.parse(readFileSync(manifest));assert.equal(r.owner,'01a13d76-2e7e-7db3-968e-d151f3b44b3d');assert.match(r.runtime,/^\/private\/tmp\/ios001-e3-sql-[a-f0-9-]+$/);return r;}
export async function owned(){if(container){assert.match(container,/^ios001-goal-return-[a-f0-9-]+$/);const {stdout}=await exec('docker',['inspect',container]);const v=JSON.parse(stdout)[0];assert.equal(v.Config.Labels['ios001.owner'],'goal-return-current');assert.equal(v.Config.Labels['ios001.nonce'],container);assert.equal(v.Config.Image,image);assert.equal(v.HostConfig.NetworkMode,'none');assert.equal(v.Mounts.length,0);assert.equal(v.Config.User,'postgres');assert.equal(Object.keys(v.HostConfig.PortBindings??{}).length,0);return {container};}const r=resource();for(const p of [r.runtime,r.runtime+'/data',r.runtime+'/socket'])assert.equal(statSync(p).mode&0o777,0o700);assert.deepEqual(JSON.parse(readFileSync(r.runtime+'/owner.json','utf8')),r);assert.equal(readFileSync(r.runtime+'/data/postmaster.pid','utf8').split('\n')[1],r.runtime+'/data');return r;}
export async function rawSql(sql){const r=await owned();return new Promise((resolve,reject)=>{const args=['-h',r.container?socket:r.runtime+'/socket','-U','postgres','-d',r.database??'postgres','-X','-q','-At','-v','ON_ERROR_STOP=1'];const child=r.container?spawn('docker',['exec','-i',r.container,'psql',...args]):spawn(bin+'psql',args,{cwd:r.runtime+'/data'});let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));child.stdin.end(sql);});}
export async function db(sql){const got=await rawSql("set statement_timeout='30s';set lock_timeout='3s';set search_path=public;"+sql);assert.equal(got.code,0,got.stderr);return got.stdout.trim();}
export async function catalog(){return JSON.parse(await db(`set search_path=''; select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'prosrc',p.prosrc,'config',p.proconfig,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'securityDefiner',p.prosecdef,'volatility',p.provolatile,'strict',p.proisstrict,'parallel',p.proparallel,'language',l.lanname) order by p.oid::regprocedure::text),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where n.nspname not in('pg_catalog','information_schema','extensions','auth') and p.prokind='f';`));}
export async function relations(){return JSON.parse(await db(`select jsonb_agg(jsonb_build_object('relation',n.nspname||'.'||c.relname,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'columns',(select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),'constraints',(select jsonb_agg(jsonb_build_array(k.conname,pg_get_constraintdef(k.oid)) order by k.conname) from pg_constraint k where k.conrelid=c.oid),'triggers',(select jsonb_agg(jsonb_build_array(t.tgname,pg_get_triggerdef(t.oid)) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname not in('pg_catalog','information_schema');`));}
export const gates='select profile_data_private.schema_v1(),conversation_data_private.schema_supported_v1(),result_data_private.schema_supported_v1(),turn_data_private.schema_supported_v1(),turn_data_private.runtime_supported_v1();';
if(process.argv[2]==='prepare'){
 if(existsSync(manifest)){const previous=resource();assert.ok(!existsSync(previous.runtime+'/data/postmaster.pid'),'Prior owned fixture is still active');}
 const parent='/private/tmp/';
 mkdirSync(parent,{recursive:true});const runtime=parent+'ios001-e3-sql-'+randomUUID();assert.ok(!existsSync(runtime));mkdirSync(runtime,{mode:0o700});mkdirSync(runtime+'/socket',{mode:0o700});
 const r={owner:'01a13d76-2e7e-7db3-968e-d151f3b44b3d',runtime,nonce:runtime.split('/').at(-1),version:'17.11',tcp:false,auth:'synthetic SQL stub only'};
 writeFileSync(runtime+'/owner.json',JSON.stringify(r),{mode:0o600});writeFileSync(manifest,JSON.stringify(r,null,2)+'\n');
 await exec(bin+'initdb',['-D',runtime+'/data','-U','postgres','-A','trust','--no-locale','-E','UTF8']);
 // Short owned socket path stays within Darwin's sockaddr_un length limit.
 await exec(bin+'pg_ctl',['-D',runtime+'/data','-l',runtime+'/postgres.log','-o',"-c listen_addresses='' -c unix_socket_directories='"+runtime+"/socket' -c unix_socket_permissions=0700",'-w','start'],{cwd:runtime+'/data'});
 assert.equal(await db('show server_version;show listen_addresses;show unix_socket_permissions;'),'17.11 (Homebrew)\n\n0700');
 console.log('Owned PG17.11 Unix socket only PASS');
}
if(process.argv[2]==='replay'){
 const isolation=await db('show listen_addresses;show unix_socket_permissions;');assert.equal(isolation,'0700');
 assert.match(await db('show server_version;'),/^17\./);
 assert.equal(await db("select to_regnamespace('auth') is null"),'t');
 let bootstrap=readFileSync(root+'tests/integration/turn/fixtures/durable-work-schema.sql','utf8');
 const roles=await db("select count(*) from pg_roles where rolname in('anon','authenticated','service_role')");
 if(roles==='3'){assert.equal(await db("select string_agg(rolname||':'||rolcanlogin||':'||rolbypassrls,',' order by rolname) from pg_roles where rolname in('anon','authenticated','service_role')"),'anon:false:false,authenticated:false:false,service_role:false:true');bootstrap=bootstrap.replaceAll(/create role (anon|authenticated|service_role) nologin(?: bypassrls)?;/g,'');}else assert.equal(roles,'0');
 await db(bootstrap);
 await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 const files=readdirSync(root+'supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
 const target='20261015024450_ios001_goal_return_current.sql';const prior=files.filter(f=>f<target);const applied=[];
 for(const file of prior){try{const source=readFileSync(root+'supabase/migrations/'+file,'utf8');await db('begin;'+source+'\ncommit;');applied.push({file,sha256:createHash('sha256').update(source).digest('hex')});}catch(error){writeFileSync(output('replay-fail.json'),JSON.stringify({file,applied,error:String(error)},null,2));throw error;}}
 const before=await catalog(),rBefore=await relations();writeFileSync(output('catalog-before.json'),JSON.stringify(before));
 assert.equal(await db(gates),'t|t|t|t|t');
 const source=readFileSync(root+'supabase/migrations/'+target,'utf8');await db('begin;'+source+'\nrollback;');assert.deepEqual(await catalog(),before);await db('begin;'+source+'\ncommit;');
 const after=await catalog();for(const f of before)assert.deepEqual(after.find(x=>x.signature===f.signature),f,f.signature);assert.equal(after.length,before.length+2);assert.deepEqual(await relations(),rBefore);assert.equal(await db(gates),'t|t|t|t|t');
 writeFileSync(output('catalog-after.json'),JSON.stringify(after));writeFileSync(output('replay.json'),JSON.stringify({base:'22559396eec5cd47d3a4d3d2a2bd5e49d52c6c7c',applied,append:target,oldFunctionsUnchanged:before.length,newFunctions:2,tablesUnchanged:rBefore.length,rollback:'PASS',guards:'t|t|t|t|t',auth:'SQL stub only'},null,2)+'\n');console.log('Full current QA replay, append, rollback and unchanged old catalog PASS');
}
if(process.argv[2]==='stop'){const r=await owned();await exec(bin+'pg_ctl',['-D',r.runtime+'/data','-w','stop','-m','fast']);assert.ok(!existsSync(r.runtime+'/data/postmaster.pid'));writeFileSync(output('cleanup.json'),JSON.stringify({nonce:r.nonce,stopped:true,dataRetainedPrivately:true,otherResourcesTouched:false},null,2)+'\n');}
