import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_TURN_DB_TEST==='1',container='vpj81-memory-'+uuid().slice(0,8);
const mine='20261003130000_vpj81_native_memory_commands.sql';
let created=false;
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const query=(a,input)=>`begin;set role authenticated;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session})}';select public.native_memory_command_v1('${JSON.stringify(input).replaceAll("'","''")}'::jsonb);commit;`;
const call=async(a,input)=>{const r=await sql(container,query(a,input));assert.equal(r.code,0,r.stderr);return JSON.parse(r.stdout.trim());};
const reject=async(a,input,code)=>{const r=await sql(container,query(a,input));assert.notEqual(r.code,0);assert.match(r.stderr,new RegExp(code));};
async function owner(){const a={owner:uuid(),session:uuid()};await db(`insert into auth.users(id) values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');insert into identity_private.mobile_accounts(owner_id,session_id) values('${a.owner}','${a.session}');`);return a;}
async function fixture(){const a=await owner();const c=await call(a,{action:'consentCreate',operationId:uuid()});const input={action:'create',operationId:uuid(),memoryId:uuid(),receiptId:uuid(),consentId:c.consentId,constraintKind:'preference',summary:'Relaxed pace',saveLongTerm:true};const r=await call(a,input);return {a,input,r};}
const change=(f,extra={})=>({action:'update',operationId:uuid(),memoryId:f.input.memoryId,sourceReceiptId:f.input.receiptId,expectedRevision:1,summary:'Balanced pace',saveLongTerm:true,...extra});
const row=f=>db(`select jsonb_build_object('revision',revision,'summary',summary,'state',state) from public.memory_profiles where id='${f.input.memoryId}';`);
before(async()=>{
 if(!enabled)return;
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(r.code,0,r.stderr);created=true;
 for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 const migrations=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
 for(const f of migrations.filter(f=>f<mine))await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
 const migration=readFileSync('supabase/migrations/'+mine,'utf8');await db('begin;'+migration+'rollback;');assert.equal(await db("select to_regclass('memory_private.native_command_receipts_v1') is null;"),'t');await db('begin;'+migration+'commit;');
 // Descendants depend on the committed130 tables; retain every current migration in order.
 for(const f of migrations.filter(f=>f>mine))await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);

run('same owner explicit save, same-profile update and bounded exact update Undo; immutable retries',async()=>{
 const f=await fixture(),u=change(f),r=await call(f.a,u);assert.equal(r.revision,2);assert.equal(r.undoAvailable,true);assert.equal(JSON.parse(await row(f)).summary,'Balanced pace');
 assert.equal((await call(f.a,u)).reused,true);await reject(f.a,{...u,summary:'Different'},'MEMORY_OPERATION_REUSE');
 const undo={action:'updateUndo',operationId:uuid(),memoryId:f.input.memoryId,sourceReceiptId:f.input.receiptId,expectedRevision:2,updateOperationId:u.operationId};assert.equal((await call(f.a,undo)).revision,3);assert.equal(JSON.parse(await row(f)).summary,'Relaxed pace');assert.equal((await call(f.a,undo)).reused,true);
 await reject(f.a,{action:'createUndo',operationId:uuid(),memoryId:f.input.memoryId,sourceReceiptId:f.input.receiptId,expectedRevision:1},'MEMORY_CONFLICT');
});
run('CAS one winner, wrong actor/operation/extra input and temporary override never write',async()=>{
 const f=await fixture(),u=change(f),rs=await Promise.all([u,change(f,{summary:'Other'})].map(v=>sql(container,query(f.a,v))));assert.deepEqual(rs.map(r=>r.code===0).sort(),[false,true]);
 const current=await row(f),b=await owner();await reject(b,u,'FORBIDDEN');await reject(f.a,change(f,{saveLongTerm:false}),'INVALID_INPUT');await reject(f.a,{...change(f),extra:true},'INVALID_INPUT');assert.equal(await row(f),current);
 await reject(f.a,{action:'updateUndo',operationId:uuid(),memoryId:f.input.memoryId,sourceReceiptId:f.input.receiptId,expectedRevision:2,updateOperationId:uuid()},'MEMORY_CONFLICT');
});
run('revocation/deletion scrubs preimages; pause and expiry cannot restore qualification; session replacement rejects',async()=>{
 for(const mode of ['revoke','deleted','paused','expired']){const f=await fixture(),u=change(f);await call(f.a,u);
 if(mode==='expired') await db(`update memory_private.native_update_preimages_v1 set expires_at=now()-interval '1 second' where operation_id='${u.operationId}';`);
 else await call(f.a,{action:mode==='revoke'?'revoke':'state',operationId:uuid(),memoryId:f.input.memoryId,sourceReceiptId:f.input.receiptId,expectedRevision:2,...(mode==='revoke'?{}:{state:mode})});
 const current=await row(f);await reject(f.a,{action:'updateUndo',operationId:uuid(),memoryId:f.input.memoryId,sourceReceiptId:f.input.receiptId,expectedRevision:mode==='deleted'||mode==='paused'?3:2,updateOperationId:u.operationId},mode==='revoke'?'CONSENT_REQUIRED':mode==='expired'?'MEMORY_UNDO_EXPIRED':'MEMORY_CONFLICT');assert.equal(await row(f),current);
 if(mode==='revoke'||mode==='deleted')assert.equal(await db(`select count(*) from memory_private.native_update_preimages_v1 where memory_id='${f.input.memoryId}';`),'0');
 }
 const f=await fixture();await db(`update identity_private.mobile_accounts set session_id=null where owner_id='${f.a.owner}';`);await reject(f.a,change(f),'SESSION_REPLACED');
});
run('existing create Undo operation relation and least privilege; receipts contain no summaries',async()=>{
 const f=await fixture();const undo={action:'createUndo',operationId:uuid(),memoryId:f.input.memoryId,sourceReceiptId:f.input.receiptId,expectedRevision:1};assert.equal((await call(f.a,undo)).revision,2);assert.equal((await call(f.a,undo)).reused,true);assert.equal(JSON.parse(await row(f)).summary,null);
 assert.equal(await db(`select has_function_privilege('anon','public.native_memory_command_v1(jsonb)','EXECUTE') or has_function_privilege('service_role','public.native_memory_command_v1(jsonb)','EXECUTE');`),'f');
 assert.equal(await db(`select has_table_privilege('authenticated','memory_private.native_update_preimages_v1','SELECT') or has_table_privilege('authenticated','public.memory_profiles','UPDATE');`),'f');
 assert.equal(await db(`select bool_or(receipt::text like '%Relaxed pace%') from memory_private.native_command_receipts_v1;`),'f');
});

run('two actual sessions: worker owner KEY SHARE/account wait and Memory account holder never upgrade owner lock',async()=>{
 const a=await owner(),input={action:'consentCreate',operationId:uuid()};
 const actor=`set role authenticated;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session})}';`;
 const one=sql(container,`set application_name='memory_lock_a';begin;select 1 from identity_private.mobile_accounts where owner_id='${a.owner}' for update;select pg_sleep(1.0);${actor}select public.native_memory_command_v1('${JSON.stringify(input)}'::jsonb);commit;`);
 // Private table ACL is intentionally not opened. The preload runs as administrator;
 // the actual Memory command then runs with the ordinary authenticated role.
 const ready=async name=>{for(let i=0;i<80;i++){if(await db(`select exists(select 1 from pg_stat_activity where application_name='${name}' and wait_event_type in ('Timeout','Lock'));`)==='t')return;await new Promise(r=>setTimeout(r,10));}assert.fail('bounded interleaving not observed');};
 await ready('memory_lock_a');
 const two=sql(container,`set application_name='memory_lock_b';begin;select 1 from auth.users where id='${a.owner}' for key share nowait;select 1 from identity_private.mobile_accounts where owner_id='${a.owner}' for update;commit;`);
 await ready('memory_lock_b');const results=await Promise.all([one,two]);for(const r of results){assert.equal(r.code,0,r.stderr);assert.doesNotMatch(r.stderr,/deadlock/i);}
 assert.equal(await db(`select count(*) from memory_private.native_command_receipts_v1 where owner_id='${a.owner}' and operation_id='${input.operationId}';`),'1');assert.equal((await call(a,input)).reused,true);
});
