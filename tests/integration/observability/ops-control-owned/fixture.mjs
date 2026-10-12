import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {command} from '../../cost/fixtures/postgres-rpc.mjs';
export const out='artifacts/VPJ-37/ops-control-server-20261011/owned-proof/';
const leasePath='tests/integration/observability/ops-control-owned/fixture-lease.json';
export const lease=JSON.parse(readFileSync(leasePath,'utf8'));
assert.equal(lease.marker,'W2-integrated-owned-proof-fixture-20261012-V8');assert.equal(lease.state,'GRANTED');
export const name='vpj37-w2-integration-20261012-54bf86c1';
const owner='01a126a8-7cb5-7a70-aca6-0ba38c99efe2',image='public.ecr.aws/supabase/postgres@sha256:86a2e078779e5bdccda1f6f6c5063aa9779a322d1fface5fb408d051909b230f';
assert.equal(lease.socket,'/tmp/vpj37-54bf86c1-socket');assert.equal(lease.data,'/tmp/vpj37-54bf86c1-db');assert.deepEqual(lease.labels,{'vpj37.owner':owner,'vpj37.nonce':name});
assert.equal(lease.container,name);assert.equal(lease.soleOwner,owner);assert.equal(lease.image,image);assert.equal(lease.network,'none');assert.deepEqual(lease.ports,[]);assert.deepEqual(lease.mounts,[]);assert.equal(lease.pull,'never');
export const sha=x=>createHash('sha256').update(x).digest('hex');
export const lit=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
export async function owned(){
 const r=await command('docker',['inspect',name]);assert.equal(r.code,0,r.stderr);const v=JSON.parse(r.stdout)[0];
 assert.equal(v.Config.Labels['vpj37.owner'],owner);assert.equal(v.Config.Labels['vpj37.nonce'],name);assert.equal(v.Config.Image,image);assert.equal(v.Image,image.split('@')[1]);assert.equal(v.Config.User,'postgres');assert.equal(v.HostConfig.NetworkMode,'none');assert.equal(v.Mounts.length,0);assert.equal(Object.keys(v.HostConfig.PortBindings??{}).length,0);return v;
}
export async function db(text){await owned();const r=await command('docker',['exec','-i',name,'psql','-h',lease.socket,'-U','postgres','-X','-q','-At','-v','ON_ERROR_STOP=1'],"set statement_timeout='30s';set lock_timeout='3s';set search_path=public;\n"+text);assert.equal(r.code,0,r.stderr);return r.stdout.trim();}
export const auth=a=>`set request.jwt.claim.sub='${a.owner}';set request.jwt.claim.role='authenticated';set request.jwt.claims='${JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session})}';set role authenticated;`;
export const service="set request.jwt.claim.sub='';set request.jwt.claim.role='service_role';set request.jwt.claims='{\"role\":\"service_role\"}';set role service_role;";
export async function rpc(name,p,actor=null,admin=false){assert.match(name,/^[a-z_0-9]+$/);return JSON.parse(await db((admin?'':actor?auth(actor):service)+`select to_jsonb(public.${name}(${Object.entries(p).map(([k,v])=>{assert.match(k,/^p_[a-z_]+$/);return k+'=>'+lit(v);}).join(',')}));`));}
export async function cleanup(){await owned();const r=await command('docker',['rm','-f',name]);assert.equal(r.code,0,r.stderr);const absent=await command('docker',['ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}']);assert.equal(absent.code,0,absent.stderr);assert.equal(absent.stdout.trim(),'');writeFileSync(out+'cleanup.json',JSON.stringify({name,owner,result:'ABSENT',otherResources:'UNTOUCHED'},null,2)+'\n');}
async function prepare(){
 assert.ok(!process.env.DOCKER_HOST&&!process.env.DOCKER_CONTEXT);const ctx=await command('docker',['context','inspect']);assert.equal(ctx.code,0,ctx.stderr);assert.ok(JSON.parse(ctx.stdout)[0].Endpoints.docker.Host.startsWith('unix:///'));
 const collision=await command('docker',['ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}']);assert.equal(collision.code,0,collision.stderr);assert.equal(collision.stdout.trim(),'','Fresh name must be absent; do not reuse');
 const cached=await command('docker',['image','inspect',image]);assert.equal(cached.code,0,cached.stderr);assert.equal(JSON.parse(cached.stdout)[0].Id,image.split('@')[1]);
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',name,'--label','vpj37.owner='+owner,'--label','vpj37.nonce='+name,'--user','postgres','--entrypoint','/bin/sh',image,'-c',`umask 077; mkdir ${lease.socket}; initdb -D ${lease.data} -A trust --no-locale -E UTF8 >/tmp/vpj37-54bf86c1-init.log 2>&1 && exec postgres -D ${lease.data} -c listen_addresses= -c unix_socket_directories=${lease.socket} -c unix_socket_permissions=0700`]);assert.equal(r.code,0,r.stderr);
 let ready=false;for(let i=0;i<100;i++){if((await command('docker',['exec',name,'pg_isready','-h',lease.socket,'-U','postgres'])).code===0){ready=true;break;}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,'Owned readiness timeout');await owned();assert.match(await db('show server_version;'),/^17\.6(?:\.|$)/);assert.equal(await db('show listen_addresses;show unix_socket_permissions;'),'0700');
 writeFileSync(out+'preflight.json',JSON.stringify({lease:leasePath,name,owner,image,result:'PASS',network:'none',ports:0,mounts:0,socket:'0700',version:await db('show server_version;')},null,2)+'\n');console.log('Own exact PG17.6 preflight PASS');
}
async function replay(){
 const append='supabase/migrations/20261012103151_vpj37_ops_control_w2.sql';
 assert.ok(existsSync(append),'Integrated exact migration is required; no external owner checkout fallback');
 const source=append;
 const bytes=readFileSync(source),footer=Buffer.from("\nnotify pgrst,'reload schema';\n");
 if(source===append){assert.equal(sha(bytes),'87f24b4714bb7538f50de85392541b2ac96d12ab59137762e0370dd45722b553');assert.ok(bytes.subarray(-footer.length).equals(footer));}
 const full=source===append?bytes.subarray(0,-footer.length):bytes;assert.equal(sha(full),lease.source.fullbodySha256,'Full SQL body changed: stop; no unknown hash acceptance');
 assert.equal(await db("select to_regnamespace('auth') is null;"),'t');await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 const files=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f!=='20261012103151_vpj37_ops_control_w2.sql').sort();assert.equal(files.length,154);const manifest=[];
 for(const file of files){const bytes=readFileSync('supabase/migrations/'+file);try{await db('begin;'+bytes+'\ncommit;');}catch(error){writeFileSync(out+'replay-fail.json',JSON.stringify({file,manifest,error:String(error)},null,2)+'\n');throw error;}manifest.push({file,sha256:sha(bytes)});}
 assert.equal(sha(readFileSync(source)),sha(bytes));await db(full.toString());
 writeFileSync(out+'replay.json',JSON.stringify({source,bodySha256:sha(full),base:lease.source.base,migrations:manifest,result:'PASS',productAppend:false,auth:'SQL claims fixture only'},null,2)+'\n');console.log('Ordered154 plus pinned W2 body fixture replay PASS');
}
if(process.argv[1]?.endsWith('/fixture.mjs')){const mode=process.argv[2];try{if(mode==='prepare')await prepare();else if(mode==='replay')await replay();else if(mode==='cleanup')await cleanup();else throw Error('Unknown fixture mode');}catch(error){writeFileSync(out+'fixture-'+mode+'-fail.log',String(error)+'\n');throw error;}}
