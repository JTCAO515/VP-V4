import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,chmod,readFile,readdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {join,isAbsolute} from 'node:path';
test('Native QA original epoch/RLS and QA operations are atomic on isolated PG17',
 {skip:process.env.QA_NATIVE_PG!=='1'},async t=>{
const pg=process.env.QA_NATIVE_PG_BIN??process.env.VP_WIKI_PG_BIN??(process.platform==='darwin'?'/opt/homebrew/opt/postgresql@17/bin':'/usr/lib/postgresql/17/bin');assert.ok(isAbsolute(pg));
const root=await mkdtemp((process.platform==='darwin'?'/private/tmp':'/tmp')+'/qan-'),data=join(root,'d'),socket=join(root,'s');await chmod(root,0o700);await mkdir(socket,{mode:0o700});let started=false;
t.after(async()=>{if(started){const r=await command(join(pg,'pg_ctl'),['-D',data,'-m','fast','-w','stop']);assert.equal(r.code,0,r.err);started=false;}console.log('owned PG cleaned '+root);});
async function command(bin,args,input='',env={}){return new Promise((resolve,reject)=>{const child=spawn(bin,args,{env:{...process.env,PGOPTIONS:undefined,PGHOSTADDR:undefined,PGSERVICE:undefined,PGSERVICEFILE:undefined,PGPASSFILE:'/dev/null',PGPASSWORD:undefined,...env},stdio:['pipe','pipe','pipe']});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('close',code=>resolve({code,out,err}));child.stdin.on('error',()=>{});child.stdin.end(input);});}
const db=async(sql,app='qa-runtime-binding-proof')=>{const r=await command(join(pg,'psql'),['-X','-q','-At','-v','ON_ERROR_STOP=1','-h',socket,'-p','5432','-U','postgres','-d','postgres'],"set statement_timeout='8s';set lock_timeout='5s';\n"+sql,{PGAPPNAME:app});assert.equal(r.code,0,r.err.slice(-1600));return r.out.trim();};
const lit=v=>v===null?'null':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const actorSQL=a=>`set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({session_id:a.session,role:"authenticated",is_anonymous:false})}';set request.headers='{"origin":"https://synthetic.invalid","cookie":"fixture"}';set role authenticated;`;
const expr=(fn,p)=>'public.'+fn+'('+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+')';
const rpc=async(fn,p={},a)=>{const raw=await db((a?actorSQL(a):'set role service_role;set request.jwt.claims=\'{"role":"service_role"}\';')+'select '+expr(fn,p)+';');return raw?JSON.parse(raw):null;};
const pass=label=>{console.log('PASS '+label);};
async function fixture(mode='qa_session_history_v1',originalRequest){
 const a={owner:randomUUID(),session:randomUUID(),thread:randomUUID(),turn:randomUUID(),task:randomUUID(),policy:randomUUID(),scope:randomUUID()};
 a.request=originalRequest??a.turn;
 await db(`insert into auth.users values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');
 insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at,context_mode) values('${a.policy}','qwen','synthetic','https://synthetic.invalid/inference','fixture','fixture','fixture','fixture','fixture','${'a'.repeat(64)}','合成许可','Synthetic notice','retain_after_hide_v1',now()-interval '1 day',now()+interval '1 day',now()+interval '1 day','${mode}');
 insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at) values('${a.scope}','${a.owner}','CNY',10000,10000,20,1,true,now()+interval '1 day');
 insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled) values('${a.scope}','qwen','fixture-model','fixture-v1',10000,1000,true);`);
 return a;
}
const v=await command(join(pg,'postgres'),['--version']);assert.equal(v.code,0);assert.match(v.out,/PostgreSQL\) 17\./);
const initialized=await command(join(pg,'initdb'),['-D',data,'-U','postgres','-A','trust','--no-locale','-E','UTF8']);assert.equal(initialized.code,0,initialized.err);
const boot=await command(join(pg,'pg_ctl'),['-D',data,'-l',join(root,'server.log'),'-o',`-c listen_addresses= -c unix_socket_directories=${socket} -c unix_socket_permissions=0700 -p 5432`,'-w','start']);assert.equal(boot.code,0,boot.err);started=true;
assert.equal(await db('show listen_addresses;'),'');
let sql=await readFile('tests/integration/turn/fixtures/durable-work-schema.sql','utf8');sql+="\ncreate function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;\n";
const candidate='20261016060000_qa_native_session.sql';
const paths=(await readdir('supabase/migrations')).filter(p=>p.endsWith('.sql')&&p!==candidate).sort();
const manifest=[];
for(const p of paths){const s=await readFile('supabase/migrations/'+p,'utf8');manifest.push([p,createHash('sha256').update(s).digest('hex')]);sql+='\nbegin;\n'+s+'\ncommit;\n';}
await db(sql);
const catalog=()=>db("select jsonb_build_object('functions',(select jsonb_agg(v order by v::text) from (select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,p.proacl,p.proconfig,p.prosecdef,md5(p.prosrc) hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in('pg_catalog','information_schema') and p.proname<>'qa_native_session_v1') v),'relations',(select jsonb_agg(v order by v::text) from (select n.nspname,c.relname,c.relacl,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in('pg_catalog','information_schema')) v));");
const before=await catalog();const patch=await readFile('supabase/migrations/'+candidate,'utf8');await db(patch);assert.equal(await catalog(),before);pass('all old function source/ACL/config and relation RLS/ACL unchanged');
console.log('source migrations '+paths.length+'; manifest sha256 '+createHash('sha256').update(JSON.stringify(manifest)).digest('hex'));

const attrs=JSON.parse(await db("select jsonb_build_object('owner',pg_get_userbyid(proowner),'definer',prosecdef,'path',proconfig,'auth',has_function_privilege('authenticated',oid,'EXECUTE'),'anon',has_function_privilege('anon',oid,'EXECUTE'),'service',has_function_privilege('service_role',oid,'EXECUTE')) from pg_proc where oid='public.qa_native_session_v1(text,bigint,jsonb)'::regprocedure;"));assert.deepEqual(attrs,{owner:'postgres',definer:false,path:['search_path=""'],auth:true,anon:false,service:false});
const native=(a,action,payload={},epoch=a.epoch)=>rpc('qa_native_session_v1',{p_action:action,p_mobile_epoch:epoch,p_payload:JSON.stringify(payload)},a);
const login=async a=>{const attempt=randomUUID();await rpc('native_prepare_v2',{p_owner:a.owner,p_session:a.session,p_attempt:attempt});const receipt=await rpc('native_session_v2',{p_action:'login',p_attempt:attempt},a);a.epoch=receipt.mobileEpoch;assert.equal(receipt.subject,a.owner);assert.equal(receipt.sessionId,a.session);return a;};
const a=await fixture(),b=await fixture();
await assert.rejects(native(a,'create',{},1),/UNAUTHENTICATED|SESSION_REPLACED/);await login(a);await login(b);
for(const role of ['anon','service_role'])await assert.rejects(db(`set role ${role};select public.qa_native_session_v1('create',1,'{}');`),/permission denied/);
assert.equal((await native(a,'qa_read_policy_v1',{p_policy_id:a.policy})).policy.consentState,'not_accepted');
assert.equal((await native(a,'qa_accept_policy_v1',{p_policy_id:a.policy,p_notice_hash:'a'.repeat(64)})).kind,'accepted');
const made=await native(a,'create');assert.equal(made.kind,'thread');a.thread=made.thread.id;assert.ok((await native(a,'list')).threads.some(r=>r.id===a.thread));
assert.equal((await native(b,'list')).threads.some(r=>r.id===a.thread),false);await assert.rejects(native(b,'read',{p_thread_id:a.thread}),/FORBIDDEN/);
const admission={p_thread_id:a.thread,p_turn_id:a.turn,p_idempotency_key:a.turn,p_policy_id:a.policy,p_locale:'en',p_text:'Original native QA text',p_task_id:a.task,p_relationship:'qa_followup'};
assert.equal((await native(a,'qa_submit_message_v1',admission)).reused,false);assert.equal((await native(a,'qa_submit_message_v1',admission)).reused,true);await assert.rejects(native(a,'qa_submit_message_v1',{...admission,p_text:'different bytes'}),/IDEMPOTENCY_KEY_REUSE/);
assert.equal((await native(a,'read',{p_thread_id:a.thread})).turns[0].id,a.turn);assert.equal((await native(a,'qa_read_session_v1',{p_thread_id:a.thread})).messages[0].input,admission.p_text);pass('ordinary JWT/native epoch + original create/list/consent/admission/reopen and original UUID idempotency');
// Original worker SQL ports persist a synthetic result; no provider is invoked.
const lease=await rpc('qa_claim_work_v1',{p_owner_id:a.owner,p_policy_id:a.policy});assert.equal(lease.kind,'leased');
assert.equal((await rpc('reserve_model_budget',{p_scope_id:a.scope,p_owner_id:a.owner,p_task_id:a.turn,p_attempt_id:lease.leaseToken,p_provider:'qwen',p_model:'fixture-model',p_price_version:'fixture-v1',p_reserved_micros:100})).kind,'reserved');
const work=await rpc('qa_read_work_v1',{p_turn_id:a.turn,p_lease_token:lease.leaseToken});assert.equal(work.kind,'qa_input');
assert.equal((await rpc('qa_authorize_dispatch_v2',{p_turn_id:a.turn,p_lease_token:lease.leaseToken,p_scope_id:a.scope,p_policy_id:a.policy,p_provider:'qwen',p_context_digest:work.contextDigest,p_owner_id:a.owner,p_notice_hash:'a'.repeat(64)})).kind,'authorized');
assert.equal((await rpc('finish_model_budget',{p_scope_id:a.scope,p_owner_id:a.owner,p_attempt_id:lease.leaseToken,p_action:'settle',p_actual_micros:1})).kind,'settled');
assert.equal((await rpc('qa_complete_work_v1',{p_turn_id:a.turn,p_lease_token:lease.leaseToken,p_kind:'answered',p_text:'Synthetic SQL persisted answer'})).kind,'finished');
assert.equal((await native(a,'qa_read_session_v1',{p_thread_id:a.thread})).messages[0].output,'Synthetic SQL persisted answer');
a.follow=randomUUID();assert.equal((await native(a,'qa_submit_message_v1',{...admission,p_turn_id:a.follow,p_idempotency_key:a.follow,p_text:'Why? simplify'})).kind,'accepted');
const chain=await native(a,'qa_read_session_v1',{p_thread_id:a.thread});assert.equal(chain.serviceTaskId,a.task);assert.equal(chain.messages.length,2);assert.equal(chain.lastTurnId,a.follow);pass('original worker SQL persists an answer; Native reopen and bounded followup retain the same original Task');
await assert.rejects(native(a,'reserve_model_budget',{}),/INVALID_INPUT/);await assert.rejects(native(a,'create',{ownerId:b.owner}),/INVALID_INPUT/);await assert.rejects(native(a,'create',{},a.epoch+1),/SESSION_REPLACED/);
const oldCount=await db(`select count(*) from public.chat_threads where owner_id='${a.owner}';`),oldEpoch=a.epoch,oldSession=a.session;
assert.equal((await rpc('native_session_v2',{p_action:'session'},a)).mobileEpoch,oldEpoch,'the precheck was valid before replacement');
const next={...a,session:randomUUID()};await db(`insert into auth.sessions(id,user_id) values('${next.session}','${a.owner}');`);await login(next);
await assert.rejects(native({...a,session:oldSession},'create',{},oldEpoch),/UNAUTHENTICATED|SESSION_REPLACED/);assert.equal(await db(`select count(*) from public.chat_threads where owner_id='${a.owner}';`),oldCount);pass('epoch replacement after a valid precheck cannot create a session or mutate QA with the old epoch');
const waitFor=async sql=>{const deadline=Date.now()+5000;while(Date.now()<deadline){if(await db(sql)==='t')return;await new Promise(r=>setTimeout(r,10));}throw Error('Owned PG lock barrier not observed');};
const replacementActor={...next,session:randomUUID()},attempt=randomUUID();await db(`insert into auth.sessions(id,user_id) values('${replacementActor.session}','${replacementActor.owner}');`);await rpc('native_prepare_v2',{p_owner:replacementActor.owner,p_session:replacementActor.session,p_attempt:attempt});
const holding=db('begin;'+actorSQL(next)+'select '+expr('qa_native_session_v1',{p_action:'create',p_mobile_epoch:next.epoch,p_payload:'{}'})+";select pg_sleep(1);commit;",'qa-native-hold');
await waitFor("select exists(select 1 from pg_stat_activity where application_name='qa-native-hold' and wait_event='PgSleep');");
const replacing=db(actorSQL(replacementActor)+'select '+expr('native_session_v2',{p_action:'login',p_attempt:attempt})+';','qa-native-replace');
await waitFor("select exists(select 1 from pg_stat_activity where application_name='qa-native-replace' and cardinality(pg_blocking_pids(pid))>0);");
await holding;const renewed=JSON.parse(await replacing);assert.equal(renewed.mobileEpoch,next.epoch+1);Object.assign(next,{session:replacementActor.session,epoch:renewed.mobileEpoch});pass('real replacement login waits for the Native QA operation transaction account lock');
// Re-read from the new valid native session retains the original persistent Session.
assert.equal((await native(next,'read',{p_thread_id:a.thread})).thread.id,a.thread);
await rpc('withdraw_text_policy',{p_policy_id:a.policy},next);
await assert.rejects(native(next,'qa_submit_message_v1',{...admission,p_turn_id:randomUUID(),p_idempotency_key:randomUUID()}),/DATA_POLICY_BLOCKED/);
const capacity=db(`begin;select pg_advisory_xact_lock(hashtextextended('${next.owner}',34));select pg_sleep(1);commit;`,'qa-native-capacity');
await waitFor("select exists(select 1 from pg_stat_activity where application_name='qa-native-capacity' and wait_event='PgSleep');");
const stopParams={p_action:'qa_cancellation_v1',p_mobile_epoch:next.epoch,p_payload:JSON.stringify({p_action:'cancel',p_thread_id:a.thread,p_request_id:a.follow})};
const stopPending=db(actorSQL(next)+'select '+expr('qa_native_session_v1',stopParams)+';','qa-native-cancel');
await waitFor("select exists(select 1 from pg_stat_activity where application_name='qa-native-cancel' and cardinality(pg_blocking_pids(pid))>0);");
await db(`begin;select owner_id from identity_private.mobile_accounts where owner_id='${next.owner}' for update nowait;rollback;`);
await capacity;const stopped=JSON.parse(await stopPending);pass('native cancellation waits on original capacity lock before taking account lock');assert.equal(stopped.state,'cancelled');assert.equal(stopped.ack,'observed');assert.deepEqual(await native(next,'qa_cancellation_v1',{p_action:'read',p_thread_id:a.thread,p_request_id:a.follow}),stopped);pass('withdrawal blocks fresh admission but original canonical cancellation and receipt read remain available');
// Unknown/late native RPC outcome never makes a second original request: one Turn remains.
assert.equal(await db(`select count(*) from public.chat_turn_idempotency where owner_id='${a.owner}' and thread_id='${a.thread}' and idempotency_key='${a.turn}';`),'1');
});
