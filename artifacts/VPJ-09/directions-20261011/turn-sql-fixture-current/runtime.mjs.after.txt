import { fixturePath } from './fixture-path.mjs';
import { readFileSync,readdirSync,writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { command,sql } from '../../cost/fixtures/postgres-rpc.mjs';
const container='vpj58-turn-'+randomUUID().slice(0,8);
const check=r=>{if(r.code!==0)throw Error(r.stderr);return r.stdout.trim();};
try{
 check(await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']));
 for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
 check(await sql(container,readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8')));
 check(await sql(container,"create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;"));
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f<'20261007050000').sort()){check(await sql(container,'begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;'));}
 console.log('BASELINE',container);writeFileSync(fixturePath('vpj58-turn-sql-container'),container);
 check(await sql(container,'begin;'+readFileSync('supabase/migrations/20261007050000_turn_data.sql','utf8')+'commit;'));
 console.log('OWN_MIGRATION_APPLIED',check(await sql(container,'select turn_data_private.schema_supported_v1();')));
 // Current TS/export consumers require the complete append chain. Apply later
 // migrations before any fixture enrollment/data mutates reviewed ACL/body pins.
 const later=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f>'20261007050000_turn_data.sql').sort();
 for(const f of later)check(await sql(container,'begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;'));
 console.log('CURRENT_APPEND_CHAIN_APPLIED',later.length,later.at(-1));
 if(check(await sql(container,'select turn_data_private.runtime_supported_v1() and turn_data_private.schema_supported_v1();'))!=='t')throw Error('Current Turn runtime/schema unavailable after complete migration chain');
}catch(e){console.error(e.message);process.exitCode=1;}
