import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,chmodSync,readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
const {Client}=createRequire(import.meta.url)(process.env.CANONICAL_PLACE_PG_MODULE??process.env.AGENT005_PG_MODULE??process.env.VP_WIKI_PG_MODULE??'/Users/jtsm5p/Documents/Codex/2026-10-13/v10-main/agent008-pg-client-20261015/node_modules/pg/lib/index.js');
const bin=process.env.CANONICAL_PLACE_PG_BIN??process.env.VP_WIKI_PG_BIN??'/opt/homebrew/opt/postgresql@17/bin';
if(!/17\.[0-9]+/.test(execFileSync(join(bin,'postgres'),['--version'],{encoding:'utf8'})))throw Error('PostgreSQL 17 required by accepted catalog');
const root='artifacts/AGENT-005/canonical-place-sql-20261015';
const nonce=mkdtempSync((existsSync('/private/tmp')?'/private/tmp/':'/tmp/')+'a005sql-');chmodSync(nonce,0o700);const socket=join(nonce,'s');mkdirSync(socket,{mode:0o700});const data=join(nonce,'data');
execFileSync(join(bin,'initdb'),['-D',data,'-U','postgres','-A','trust','--no-locale','-E','UTF8'],{stdio:'pipe'});
execFileSync(join(bin,'pg_ctl'),['-D',data,'-l',join(nonce,'log'),'-o',`-c timezone=UTC -c listen_addresses='' -c unix_socket_directories='${socket}' -c unix_socket_permissions=0700`,'-w','start'],{stdio:'pipe'});
writeFileSync(join(root,'local-resource.json'),JSON.stringify({nonce,socket,data,bin,projectId:'4f2191db-3e04-4042-94b5-ec94ff67b427',permissions:'danger-full-access; approval never',effectiveModel:'UNKNOWN'}),{mode:0o600});
const c=new Client({host:socket,user:'postgres',database:'postgres'});await c.connect();
await c.query(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
await c.query("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$; create schema extensions; create extension pgcrypto with schema extensions;");
for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f!=='20261015083120_agent005_canonical_place_ask.sql').sort()){
 try{await c.query('begin');await c.query(readFileSync('supabase/migrations/'+f,'utf8'));await c.query('commit');}catch(e){console.error(f,e.message);await c.query('rollback');throw e;}
}
const functions=(await c.query(`select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('turn_private','public','turn_data_private','export_private','conversation_data_private') and (p.proname in ('submit_assistant_message_v1','submit_service_task_turn','submit_grounded_turn','read_grounded_work','read_grounded_turn','authorize_grounded_dispatch','complete_grounded_place_work','complete_selected_grounded_work','grounded_ai_assist_work_v1','lock_turn','text_owner','claim_text_mode','lock_text_work','core_turn_page_v1','export_source_v1','source_schema_v1','export_row_v1','guard_source_v1','schema_supported_v1','runtime_supported_v1','source_v1','source_registry_v1') or p.proname like '%admit%') order by 1`)).rows;
mkdirSync(join(root,'before'),{recursive:true});for(const f of functions)writeFileSync(join(root,'before',f.signature.replace(/\([^]*$/,'')+'.sql'),f.definition);
console.log(JSON.stringify({marker:'REAL_SQL_FULL_BASELINE',postgres:(await c.query('select version()')).rows[0].version,functions:functions.map(f=>f.signature),socket}));await c.end();
