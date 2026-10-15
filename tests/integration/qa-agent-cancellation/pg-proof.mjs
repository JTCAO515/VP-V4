import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,chmod,readFile,readdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join,resolve} from 'node:path';
const pg=process.env.QA_CANCEL_PG_BIN??'/opt/homebrew/opt/postgresql@17/bin';
const nonce=randomUUID().slice(0,8),root=await mkdtemp('/private/tmp/a1c-'+nonce+'-'),data=join(root,'data'),socket=join(root,'s');
await chmod(root,0o700);await mkdir(socket,{mode:0o700});let started=false;
const base='22559396eec5cd47d3a4d3d2a2bd5e49d52c6c7c';
const result={base,nonce,root,server:'PG17.11 isolated native Unix socket; synthetic Auth claims, not GoTrue',cases:[],cleanup:false};
async function command(bin,args,input='',env={}){return new Promise((resolve,reject)=>{const child=spawn(bin,args,{env:{...process.env,...env},stdio:['pipe','pipe','pipe']});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('close',code=>resolve({code,out,err}));child.stdin.on('error',()=>{});child.stdin.end(input);});}
const db=async(sql,app='qa-cancel-proof')=>{const r=await command(join(pg,'psql'),['-X','-q','-At','-v','ON_ERROR_STOP=1','-h',socket,'-U','postgres','-d','postgres'],"set statement_timeout='8s';set lock_timeout='5s';\n"+sql,{PGAPPNAME:app});assert.equal(r.code,0,r.err.slice(-1600));return r.out.trim();};
const lit=v=>v===null?'null':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const actorSQL=a=>`set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({session_id:a.session})}';set request.headers='{"origin":"https://synthetic.invalid","cookie":"fixture"}';set role authenticated;`;
const expr=(fn,p)=>'public.'+fn+'('+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+')';
const rpc=async(fn,p={},a)=>JSON.parse(await db((a?actorSQL(a):'set role service_role;')+'select '+expr(fn,p)+';'));
const pass=label=>{result.cases.push({label,status:'PASS'});console.log('PASS '+label);};
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
const stop=(a,action='read',request=a.request,thread=a.thread)=>rpc('qa_cancellation_v1',{p_action:action,p_thread_id:thread,p_request_id:request},a);
const keys=l=>({p_turn_id:l.turnId,p_lease_token:l.leaseToken});
async function dispatched(a){const lease=await rpc('qa_claim_work_v1',{p_owner_id:a.owner,p_policy_id:a.policy});assert.equal(lease.kind,'leased');const context=await rpc('qa_read_work_v1',keys(lease));
 await rpc('reserve_model_budget',{p_scope_id:a.scope,p_owner_id:a.owner,p_task_id:a.turn,p_attempt_id:lease.leaseToken,p_provider:'qwen',p_model:'fixture-model',p_price_version:'fixture-v1',p_reserved_micros:100});
 assert.equal((await rpc('qa_authorize_dispatch_v1',{...keys(lease),p_scope_id:a.scope,p_policy_id:a.policy,p_provider:'qwen',p_context_digest:context.contextDigest})).kind,'authorized');return lease;}
const budgetSnapshot=a=>db(`select coalesce(jsonb_agg(to_jsonb(x) order by attempt_id),'[]') from public.model_budget_attempts x where scope_id='${a.scope}';`);
async function waitSleeping(app){for(let i=0;i<80;i++){if(await db(`select exists(select 1 from pg_stat_activity where application_name='${app}' and wait_event='PgSleep');`)==='t')return;await new Promise(r=>setTimeout(r,10));}throw Error('Owned race did not reach its locked sleep');}
try{
 const init=await command(join(pg,'initdb'),['-D',data,'-U','postgres','-A','trust','--no-locale','-E','UTF8']);assert.equal(init.code,0,init.err);
 const boot=await command(join(pg,'pg_ctl'),['-D',data,'-l',join(root,'server.log'),'-o',`-c listen_addresses= -c unix_socket_directories=${socket} -c unix_socket_permissions=0700`,'-w','start']);assert.equal(boot.code,0,boot.err);started=true;
 assert.equal(await db('show listen_addresses;'),'');assert.equal(await db('show unix_socket_permissions;'),'0700');
 let sql=await readFile('tests/integration/turn/fixtures/durable-work-schema.sql','utf8');sql+="\ncreate function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;\n";
 const names=await command('git',['ls-tree','-r','--name-only',base,'supabase/migrations']);assert.equal(names.code,0,names.err);
 for(const name of names.out.trim().split('\n').filter(n=>n.endsWith('.sql')).sort()){
  const original=await command('git',['show',base+':'+name]);assert.equal(original.code,0,original.err);sql+='\nbegin;\n'+original.out+'\ncommit;\n';
 }
 await db(sql);
 const acl=()=>db("select coalesce(jsonb_agg(x order by x.name),'[]') from (select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' name,p.proacl,p.prosecdef,p.proconfig,md5(p.prosrc) source from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in ('pg_catalog','information_schema') and p.proname<>'qa_cancellation_v1') x;");
 const tableAcl=()=>db("select coalesce(jsonb_agg(x order by x.name),'[]') from (select n.nspname||'.'||c.relname name,c.relacl,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema') and c.relkind in ('r','p','v','m','S')) x;");
 const beforeTables=await tableAcl();
 assert.equal(await db("select to_regprocedure('public.qa_cancellation_v1(text,uuid,uuid)') is null;"),'t');
 const beforeAcl=await acl();
 await db(await readFile('supabase/migrations/20261015043710_agent001_qa_cancellation.sql','utf8'));assert.equal(await acl(),beforeAcl,'all existing function ACL/config/source unchanged');assert.equal(await tableAcl(),beforeTables,'all existing table/view/sequence ACL and RLS unchanged');
 const attrs=JSON.parse(await db("select jsonb_build_object('owner',pg_get_userbyid(proowner),'securityDefiner',prosecdef,'searchPath',proconfig,'auth',has_function_privilege('authenticated',oid,'EXECUTE'),'anon',has_function_privilege('anon',oid,'EXECUTE'),'service',has_function_privilege('service_role',oid,'EXECUTE')) from pg_proc where oid='public.qa_cancellation_v1(text,uuid,uuid)'::regprocedure;"));
 assert.equal(attrs.owner,'postgres');assert.equal(attrs.securityDefiner,true);assert.deepEqual(attrs.searchPath,['search_path=""']);assert.equal(attrs.auth,true);assert.equal(attrs.anon,false);assert.equal(attrs.service,false);result.function=attrs;
 pass('full source replay and candidate on isolated original roles, no fixture grants');
 const blank={owner:randomUUID(),session:randomUUID(),thread:randomUUID(),request:randomUUID()};await db(`insert into auth.users values('${blank.owner}');insert into auth.sessions(id,user_id) values('${blank.session}','${blank.owner}');insert into public.chat_threads(id,owner_id) values('${blank.thread}','${blank.owner}');`);
 assert.equal(await db(`select count(*) from identity_private.mobile_accounts where owner_id='${blank.owner}';`),'0');assert.equal((await stop(blank)).state,'not_observed');assert.equal(await db(`select count(*) from identity_private.mobile_accounts where owner_id='${blank.owner}';`),'0');pass('not-observed GET never registers an account or creates request state');
 const a=await fixture(),b=await fixture();assert.equal((await stop(a)).state,'pending');
 const notObserved=await stop(a,'read',randomUUID());assert.equal(notObserved.state,'not_observed');assert.equal(notObserved.ack,'unknown');
 await assert.rejects(stop(b,'cancel',a.turn,a.thread),/FORBIDDEN/);assert.equal((await stop(b,'read',a.turn)).state,'not_observed');
 const legacy=await fixture('current_input_v1');await assert.rejects(stop(legacy,'cancel'),/FORBIDDEN/);pass('exact actor/session/request and QA lineage isolation');
 for(const role of ['anon','service_role'])await assert.rejects(db(`set role ${role};select public.qa_cancellation_v1('read','${a.thread}','${a.turn}');`),/permission denied/);
 pass('anonymous and service roles cannot execute owner cancellation bridge');
 const originalRequest=randomUUID(),mapped=await fixture('qa_session_history_v1',originalRequest);
 assert.equal((await stop(mapped,'read',mapped.turn)).state,'not_observed');assert.equal((await stop(mapped,'cancel',originalRequest)).state,'cancelled');pass('request mapping resolves canonical Turn rather than trusting client turn identity');
 const trip=randomUUID();await db(`insert into public.trips(id,owner_id,title) values('${trip}','${a.owner}','Preserve synthetic Trip');`);
 const tripBefore=await db(`select to_jsonb(t) from public.trips t where id='${trip}';`);
 const stopped=await stop(a,'cancel');assert.equal(stopped.state,'cancelled');assert.equal(stopped.ack,'observed');assert.deepEqual(await stop(a,'cancel'),stopped);assert.deepEqual(await stop(a),stopped);
 assert.equal(await db(`select count(*) from public.chat_turn_events where turn_id='${a.turn}' and state='cancelled';`),'1');assert.equal(await db(`select to_jsonb(t) from public.trips t where id='${trip}';`),tripBefore);pass('queued cancellation and duplicates preserve one original event, Trip and readback');
 const consent=await fixture();await rpc('withdraw_text_policy',{p_policy_id:consent.policy},consent);await db(`update turn_private.text_policies set revoked_at=clock_timestamp() where id='${consent.policy}';`);assert.equal((await stop(consent,'cancel')).state,'cancelled');pass('withdrawn consent and disabled policy do not require generation reenrollment');
 const disabled=await fixture();await db(`update public.model_budget_scopes set enabled=false where id='${disabled.scope}';`);assert.equal((await stop(disabled,'cancel')).state,'cancelled');pass('disabled budget scope cannot prevent stopping an owned QA request');
 const leased=await fixture();const l=await rpc('qa_claim_work_v1',{p_owner_id:leased.owner,p_policy_id:leased.policy});assert.equal((await stop(leased,'cancel')).state,'cancelled');assert.equal((await rpc('qa_complete_work_v1',{...keys(l),p_kind:'answered',p_text:'Late'})).kind,'blocked');pass('leased stop fences late publication');
 const dispatchedCase=await fixture(),dl=await dispatched(dispatchedCase);await rpc('finish_model_budget',{p_scope_id:dispatchedCase.scope,p_owner_id:dispatchedCase.owner,p_attempt_id:dl.leaseToken,p_action:'pending',p_actual_micros:null});const ledger=await budgetSnapshot(dispatchedCase);
 assert.equal((await stop(dispatchedCase,'cancel')).state,'cancelled');assert.equal(await budgetSnapshot(dispatchedCase),ledger);assert.equal((await rpc('qa_complete_work_v1',{...keys(dl),p_kind:'answered',p_text:'Late'})).kind,'blocked');pass('dispatched unknown cost remains untouched and cannot resurrect output');
 const finished=await fixture(),fl=await dispatched(finished);await rpc('finish_model_budget',{p_scope_id:finished.scope,p_owner_id:finished.owner,p_attempt_id:fl.leaseToken,p_action:'settle',p_actual_micros:20});await rpc('qa_complete_work_v1',{...keys(fl),p_kind:'answered',p_text:'Preserved answer'});
 const before=await db(`select to_jsonb(c) from turn_private.text_content c where turn_id='${finished.turn}';`);assert.equal((await stop(finished,'cancel')).state,'terminal');assert.equal(await db(`select to_jsonb(c) from turn_private.text_content c where turn_id='${finished.turn}';`),before);pass('already terminal answer is preserved, not cancelled or rewritten');
 const race=await fixture(),rl=await dispatched(race);await rpc('finish_model_budget',{p_scope_id:race.scope,p_owner_id:race.owner,p_attempt_id:rl.leaseToken,p_action:'settle',p_actual_micros:20});
 const publishing=db(`set role service_role;begin;select ${expr('qa_complete_work_v1',{...keys(rl),p_kind:'answered',p_text:'Race answer'})};select pg_sleep(0.35);commit;`,'qa-cancel-publish-first');await waitSleeping('qa-cancel-publish-first');const cancelling=stop(race,'cancel');await publishing;assert.equal((await cancelling).state,'terminal');pass('publish-first race reports canonical terminal');
 const race2=await fixture(),r2l=await dispatched(race2);await rpc('finish_model_budget',{p_scope_id:race2.scope,p_owner_id:race2.owner,p_attempt_id:r2l.leaseToken,p_action:'settle',p_actual_micros:20});
 const stopping=db(actorSQL(race2)+`begin;select ${expr('qa_cancellation_v1',{p_action:'cancel',p_thread_id:race2.thread,p_request_id:race2.turn})};select pg_sleep(0.35);commit;`,'qa-cancel-stop-first');await waitSleeping('qa-cancel-stop-first');const late=rpc('qa_complete_work_v1',{...keys(r2l),p_kind:'answered',p_text:'Must not appear'});await stopping;assert.equal((await late).kind,'blocked');assert.equal((await stop(race2)).state,'cancelled');pass('cancel-first race rejects late completion without fee rollback');
 await db(`delete from auth.sessions where id='${b.session}';`);await assert.rejects(stop(b),/UNAUTHENTICATED|SESSION_REPLACED/);pass('revoked actor session cannot read or stop');
 result.status='PASS';
}catch(error){result.status='FAIL';result.error=String(error.stack);console.error(error);process.exitCode=1;}
finally{if(started){const stop=await command(join(pg,'pg_ctl'),['-D',data,'-m','fast','-w','stop']);result.cleanup=stop.code===0;assert.equal(stop.code,0,stop.err);}await writeFile('artifacts/AGENT-001/qa-cancel-20261015/pg-result-'+nonce+'.json',JSON.stringify(result,null,2)+'\n');console.log('OWN PG STOP '+result.cleanup);}
