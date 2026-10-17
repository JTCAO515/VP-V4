import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,chmodSync,readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
if(!process.env.VP_WIKI_PG_BIN||!process.env.VP_WIKI_PG_MODULE)throw Error('Explicit native17 bin/module required');
const {Client}=createRequire(import.meta.url)(process.env.VP_WIKI_PG_MODULE);
const bin=process.env.VP_WIKI_PG_BIN;
if(!/17\.[0-9]+/.test(execFileSync(join(bin,'postgres'),['--version'],{encoding:'utf8'})))throw Error('PostgreSQL 17 required by accepted catalog');
const root='artifacts/AGENT-005/canonical-place-sql-20261015';
const nonce=mkdtempSync((existsSync('/private/tmp')?'/private/tmp/':'/tmp/')+'a005sql-');chmodSync(nonce,0o700);const socket=join(nonce,'s');mkdirSync(socket,{mode:0o700});const data=join(nonce,'data');
execFileSync(join(bin,'initdb'),['-D',data,'-U','postgres','-A','trust','--no-locale','-E','UTF8'],{stdio:'pipe'});
execFileSync(join(bin,'pg_ctl'),['-D',data,'-l',join(nonce,'log'),'-o',`-c timezone=UTC -c listen_addresses='' -c unix_socket_directories='${socket}' -c unix_socket_permissions=0700`,'-w','start'],{stdio:'pipe'});
writeFileSync(join(root,'local-resource.json'),JSON.stringify({nonce,socket,data,bin,projectId:'4f2191db-3e04-4042-94b5-ec94ff67b427',permissions:'danger-full-access; approval never',effectiveModel:'UNKNOWN'}),{mode:0o600});
const c=new Client({host:socket,user:'postgres',database:'postgres'});await c.connect();
await c.query(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
await c.query("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$; create schema extensions; create extension pgcrypto with schema extensions;");
for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f<'20261015083120_agent005_canonical_place_ask.sql').sort()){
 try{await c.query('begin');await c.query(readFileSync('supabase/migrations/'+f,'utf8'));await c.query('commit');}catch(e){console.error(f,e.message);await c.query('rollback');throw e;}
}
const requested=[...JSON.parse(readFileSync(join(root,'function-pins.json'),'utf8')),...JSON.parse(readFileSync(join(root,'dependency-pins.json'),'utf8'))].map(p=>p.signature);
const functions=(await c.query('select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition from pg_proc p where p.oid=any($1::regprocedure[]) order by 1',[requested])).rows;
mkdirSync(join(root,'before'),{recursive:true});for(const f of functions){const name=f.signature.replace(/\([^]*$/,'');const qualified=name.includes('.')?name:'public.'+name;const filename=existsSync(join(root,'before',qualified+'.sql'))?qualified:name;writeFileSync(join(root,'before',filename+'.sql'),f.definition);}
console.log(JSON.stringify({marker:'REAL_SQL_FULL_BASELINE',postgres:(await c.query('select version()')).rows[0].version,functions:functions.map(f=>f.signature),socket}));await c.end();
