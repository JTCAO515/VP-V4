import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {command,sql} from '../../../tests/integration/cost/fixtures/postgres-rpc.mjs';
export const container='vpj08-events-sql-20261010';
if(process.env.DOCKER_HOST||process.env.DOCKER_CONTEXT)throw Error('local fixture Docker context required');
const context=JSON.parse((await command('docker',['context','inspect'])).stdout)[0];if(!context.Endpoints.docker.Host.startsWith('unix:///'))throw Error('local Unix fixture required');
const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
if(r.code)throw Error(r.stderr);
for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
async function db(q){const r=await sql(container,q);if(r.code)throw Error(r.stderr);return r.stdout.trim();}
await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
const sourceHead='930b66d6fd7425c63e2ddbe1c6bd0970b489d564';
const listed=await command('git',['ls-tree','-r','--name-only',sourceHead,'supabase/migrations']);if(listed.code)throw Error(listed.stderr);
const paths=listed.stdout.trim().split('\n').filter(f=>f.endsWith('.sql')).sort();const manifest=[];
for(const file of paths){const source=await command('git',['show',sourceHead+':'+file]);if(source.code)throw Error(source.stderr);
 manifest.push({path:file,sha256:createHash('sha256').update(source.stdout).digest('hex')});
 await db('begin;'+source.stdout+'commit;').catch(e=>{throw Error(file+': '+e.message)});
}
writeFileSync('artifacts/VPJ-08/assistant-events-sql-20261010/final-source-manifest.json',JSON.stringify({sourceHead,migrations:manifest},null,2)+'\n');
console.log('complete exact main930b66d6 sorted Git source migration replay PASS',paths.length,'migrations');
