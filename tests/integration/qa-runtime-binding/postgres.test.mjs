import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,chmod,readFile,readdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {join,isAbsolute} from 'node:path';
test('original SQL + exact runtime tuple: isolation, before-LIMIT, dispatch rollback and unchanged old catalog',
  {skip:process.env.QA_RUNTIME_BINDING_PG!=='1'},async t=>{
const pg=process.env.QA_BINDING_PG_BIN??process.env.VP_WIKI_PG_BIN??(process.platform==='darwin'?'/opt/homebrew/opt/postgresql@17/bin':'/usr/lib/postgresql/17/bin');
assert.ok(isAbsolute(pg));
const root=await mkdtemp((process.platform==='darwin'?'/private/tmp':'/tmp')+'/qrb-'),data=join(root,'d'),socket=join(root,'s');
await chmod(root,0o700);await mkdir(socket,{mode:0o700});let started=false;
t.after(async()=>{if(started){const r=await command(join(pg,'pg_ctl'),['-D',data,'-m','fast','-w','stop']);assert.equal(r.code,0,r.err);started=false;}console.log('own PG stopped; private logs '+root);});
async function command(bin,args,input='',env={}){return new Promise((resolve,reject)=>{const child=spawn(bin,args,{env:{...process.env,PGOPTIONS:undefined,PGHOSTADDR:undefined,PGSERVICE:undefined,PGSERVICEFILE:undefined,PGPASSFILE:'/dev/null',PGPASSWORD:undefined,...env},stdio:['pipe','pipe','pipe']});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('close',code=>resolve({code,out,err}));child.stdin.on('error',()=>{});child.stdin.end(input);});}
const db=async(sql,app='qa-runtime-binding-proof')=>{const r=await command(join(pg,'psql'),['-X','-q','-At','-v','ON_ERROR_STOP=1','-h',socket,'-p','5432','-U','postgres','-d','postgres'],"set statement_timeout='8s';set lock_timeout='5s';\n"+sql,{PGAPPNAME:app});assert.equal(r.code,0,r.err.slice(-1600));return r.out.trim();};
const lit=v=>v===null?'null':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const actorSQL=a=>`set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({session_id:a.session})}';set request.headers='{"origin":"https://synthetic.invalid","cookie":"fixture"}';set role authenticated;`;
const expr=(fn,p)=>'public.'+fn+'('+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+')';
const rpc=async(fn,p={},a)=>JSON.parse(await db((a?actorSQL(a):'set role service_role;')+'select '+expr(fn,p)+';'));
const pass=label=>{console.log('PASS '+label);};
async function fixture(mode='qa_session_history_v1',originalRequest){
 const a={owner:randomUUID(),session:randomUUID(),thread:randomUUID(),turn:randomUUID(),task:randomUUID(),policy:randomUUID(),scope:randomUUID()};
 a.request=originalRequest??a.turn;
 await db(`insert into auth.users values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');
 insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at,context_mode) values('${a.policy}','qwen','synthetic','https://synthetic.invalid/inference','fixture','fixture','fixture','fixture','fixture','${'a'.repeat(64)}','合成许可','Synthetic notice','retain_after_hide_v1',now()-interval '1 day',now()+interval '1 day',now()+interval '1 day','${mode}');
 insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at) values('${a.scope}','${a.owner}','CNY',10000,10000,20,1,true,now()+interval '1 day');
 insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled) values('${a.scope}','qwen','fixture-model','fixture-v1',10000,1000,true);`);
 await rpc('accept_text_policy',{p_policy_id:a.policy,p_notice_hash:'a'.repeat(64)},a);
 const p={p_thread_id:a.thread,p_turn_id:a.turn,p_idempotency_key:a.request,p_policy_id:a.policy,p_locale:'en',p_text:'Synthetic input'};
 if(mode==='qa_session_history_v1')await rpc('qa_submit_message_v1',{...p,p_task_id:a.task,p_relationship:'qa_followup'},a);else await rpc('submit_text_turn',p,a);
 return a;
}

const v=await command(join(pg,'postgres'),['--version']);assert.equal(v.code,0);assert.match(v.out,/PostgreSQL\) 17\./);
const initialized=await command(join(pg,'initdb'),['-D',data,'-U','postgres','-A','trust','--no-locale','-E','UTF8']);assert.equal(initialized.code,0,initialized.err);
const boot=await command(join(pg,'pg_ctl'),['-D',data,'-l',join(root,'server.log'),'-o',`-c listen_addresses= -c unix_socket_directories=${socket} -c unix_socket_permissions=0700 -p 5432`,'-w','start']);assert.equal(boot.code,0,boot.err);started=true;
assert.equal(await db('show listen_addresses;'),'');
let sql=await readFile('tests/integration/turn/fixtures/durable-work-schema.sql','utf8');sql+="\ncreate function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;\n";
const candidate='20261016040522_qa_runtime_binding.sql';
const paths=(await readdir('supabase/migrations')).filter(p=>p.endsWith('.sql')&&p!==candidate).sort();
const manifest=[];
for(const p of paths){const s=await readFile('supabase/migrations/'+p,'utf8');manifest.push([p,createHash('sha256').update(s).digest('hex')]);sql+='\nbegin;\n'+s+'\ncommit;\n';}
await db(sql);
const catalog=()=>db("select jsonb_build_object('functions',(select jsonb_agg(v order by v::text) from (select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,p.proacl,p.proconfig,p.prosecdef,md5(p.prosrc) hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in('pg_catalog','information_schema') and p.proname not in('qa_ready_groups_v3','qa_authorize_dispatch_v2')) v),'relations',(select jsonb_agg(v order by v::text) from (select n.nspname,c.relname,c.relacl,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in('pg_catalog','information_schema')) v));");
const before=await catalog();const patch=await readFile('supabase/migrations/'+candidate,'utf8');await db(patch);assert.equal(await catalog(),before);pass('all old function source/ACL/config and relation RLS/ACL unchanged');
console.log('source migrations '+paths.length+'; manifest sha256 '+createHash('sha256').update(JSON.stringify(manifest)).digest('hex'));
const ports=['qa_ready_groups_v3(integer,text,text,text,uuid,uuid,uuid,text)','qa_authorize_dispatch_v2(uuid,uuid,uuid,uuid,text,text,uuid,text)'];
for(const port of ports){const attrs=JSON.parse(await db(`select jsonb_build_object('owner',pg_get_userbyid(proowner),'definer',prosecdef,'path',proconfig,'auth',has_function_privilege('authenticated',oid,'EXECUTE'),'anon',has_function_privilege('anon',oid,'EXECUTE'),'service',has_function_privilege('service_role',oid,'EXECUTE')) from pg_proc where oid='public.${port}'::regprocedure;`));assert.deepEqual(attrs,{owner:'postgres',definer:true,path:['search_path=""'],auth:false,anon:false,service:true});}
const b=await fixture(),a=await fixture();
const params={p_limit:1,p_model:'fixture-model',p_price_version:'fixture-v1',p_endpoint:'https://synthetic.invalid/inference',p_owner_id:a.owner,p_policy_id:a.policy,p_scope_id:a.scope,p_notice_hash:'a'.repeat(64)};
for(const role of ['anon','authenticated'])await assert.rejects(db(`set role ${role};select ${expr('qa_ready_groups_v3',params)};`),/permission denied/);
assert.equal((await rpc('qa_ready_groups_v3',params)).kind,'disabled');
await rpc('set_hosted_worker_enabled',{p_enabled:true,p_reason:'synthetic runtime binding proof'});
const all=await rpc('qa_ready_groups_v2',{p_limit:1,p_model:params.p_model,p_price_version:params.p_price_version,p_endpoint:params.p_endpoint});assert.equal(all.groups[0].ownerId,b.owner,'earlier independently qualified foreign actor occupies old limit1');
const found=await rpc('qa_ready_groups_v3',params);assert.equal(found.groups.length,1);assert.equal(found.groups[0].ownerId,a.owner);assert.equal(found.groups[0].noticeHash,params.p_notice_hash);pass('exact actor filter occurs before LIMIT and original older foreign actor is never selected');
for(const [k,value]of [['p_owner_id',b.owner],['p_policy_id',b.policy],['p_scope_id',b.scope],['p_notice_hash','b'.repeat(64)]])assert.deepEqual((await rpc('qa_ready_groups_v3',{...params,[k]:value})).groups,[]);
await assert.rejects(rpc('qa_ready_groups_v3',{...params,p_notice_hash:null}),/INVALID_INPUT/);
const second=randomUUID();await db(`insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at) values('${second}','${a.owner}','CNY',10000,10000,20,1,true,now()+interval '1 day');insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled) values('${second}','qwen','fixture-model','fixture-v1',10000,1000,true);`);
assert.deepEqual((await rpc('qa_ready_groups_v3',params)).groups,[]);await db(`update public.model_budget_scopes set enabled=false where id='${second}';`);pass('every foreign tuple, malformed notice and original scope ambiguity rejected');
const lease=await rpc('qa_claim_work_v1',{p_owner_id:a.owner,p_policy_id:a.policy});assert.equal(lease.kind,'leased');
const keys={p_turn_id:a.turn,p_lease_token:lease.leaseToken};
const reserved=await rpc('reserve_model_budget',{p_scope_id:a.scope,p_owner_id:a.owner,p_attempt_id:lease.leaseToken,p_task_id:a.turn,p_provider:'qwen',p_model:'fixture-model',p_price_version:'fixture-v1',p_reserved_micros:100});assert.equal(reserved.kind,'reserved');
const raw=await rpc('qa_read_work_v1',keys);assert.equal(raw.kind,'qa_input');
const auth={...keys,p_scope_id:a.scope,p_policy_id:a.policy,p_provider:'qwen',p_context_digest:raw.contextDigest,p_owner_id:a.owner,p_notice_hash:params.p_notice_hash};
for(const role of ['anon','authenticated'])await assert.rejects(db(`set role ${role};select ${expr('qa_authorize_dispatch_v2',auth)};`),/permission denied/);
for(const [k,value]of [['p_owner_id',b.owner],['p_policy_id',b.policy],['p_scope_id',b.scope],['p_notice_hash','b'.repeat(64)]])assert.equal((await rpc('qa_authorize_dispatch_v2',{...auth,[k]:value})).kind,'blocked');
assert.equal(await db(`select status from public.model_budget_attempts where attempt_id='${lease.leaseToken}';`),'reserved');assert.equal(await db(`select count(*) from turn_private.text_dispatches where turn_id='${a.turn}';`),'0');pass('dispatch-time tuple mismatches leave original reservation and dispatch receipt unchanged');
const rolled=await db('begin;set local role service_role;select '+expr('qa_authorize_dispatch_v2',auth)+';rollback;');assert.equal(JSON.parse(rolled).kind,'authorized');
assert.equal(await db(`select status from public.model_budget_attempts where attempt_id='${lease.leaseToken}';`),'reserved');assert.equal(await db(`select count(*) from turn_private.text_dispatches where turn_id='${a.turn}';`),'0');
assert.equal((await rpc('qa_authorize_dispatch_v2',auth)).kind,'authorized');assert.equal((await rpc('qa_authorize_dispatch_v2',auth)).kind,'blocked');assert.equal(await db(`select count(*) from turn_private.text_dispatches where turn_id='${a.turn}';`),'1');pass('original v1 dispatch succeeds once and caller rollback restores original budget/receipt');
});
