import {spawn} from 'node:child_process';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
import {PROTOCOL_MODELS} from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';
import {waitUntil} from '../identity/database-barrier.mjs';
import {runTextWorker} from '../../../lib/server/turn/text-worker.ts';
import {journeyPassCatalog} from '../../../lib/server/entitlements/journey-pass-catalog.ts';
const enabled=process.env.VP_TURN_DB_TEST==='1',container='vpj07-text-'+uuid().slice(0,8);
let created=false;
const run=(name,fn)=>test(name,{skip:!enabled},fn);
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const lit=v=>v===null?'null':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const rpc=(role,actor)=>async(name,p={})=>{
 assert.match(name,/^[a-z_]+$/);assert.ok(Object.keys(p).every(k=>/^p_[a-z_]+$/.test(k)));
 const claims=actor?`set request.jwt.claim.sub='${actor.owner}'; set request.jwt.claims='${JSON.stringify({session_id:actor.session})}';`:'';
 const value=await db(claims+'set role '+role+';select public.'+name+'('+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');');
 return ['cancel_chat_turn','start_chat_turn'].includes(name)?value:JSON.parse(value);
};
const service=rpc('service_role');
const notice='a'.repeat(64);
async function fixture(policyLifetime='1 day',contextMode='current_input_v1'){
 const a={owner:uuid(),session:uuid(),thread:uuid(),policy:uuid(),turn:uuid(),idem:uuid(),scope:uuid()};
 await db(`insert into auth.users values('${a.owner}');insert into identity_private.mobile_accounts(owner_id) values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');insert into public.chat_threads(id,owner_id) values('${a.thread}','${a.owner}');
 insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at${contextMode==='task_history_v1'?',context_mode':''}) values('${a.policy}','qwen','synthetic-test-only','https://synthetic.invalid/inference','fixture-source','fixture-processing','fixture-storage','test-terms-v1','test-notice-v1','${notice}','合成测试告知','Synthetic test notice','retain_after_hide_v1',now()-interval '1 day',now()+interval '${policyLifetime}',now()+interval '1 day'${contextMode==='task_history_v1'?",'task_history_v1'":''});`);
 a.call=rpc('authenticated',a);
 a.start=()=>a.call('start_text_turn',{p_thread_id:a.thread,p_turn_id:a.turn,p_idempotency_key:a.idem,p_policy_id:a.policy,p_locale:'en',p_text:'Synthetic trip question'});
 a.accept=()=>a.call('accept_text_policy',{p_policy_id:a.policy,p_notice_hash:notice});
 return a;
}
const keys=l=>({p_turn_id:l.turnId,p_lease_token:l.leaseToken});
async function start(a){await a.accept();await a.start();return service('claim_turn_work');}
const authorize=(a,l)=>service('authorize_text_dispatch',{...keys(l),p_policy_id:a.policy,p_provider:'qwen'});
const complete=(l,kind='answered')=>service('complete_text_work',{...keys(l),p_kind:kind,p_text:'Synthetic result'});
const clean=()=>db("update turn_private.work set state='cancelled',lease_token=null,expires_at=null where state in ('queued','leased');");
before(async()=>{
 if(!enabled)return;
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
 assert.equal(r.code,0,r.stderr);created=true;
 let ready=false;for(let i=0;i<40;i++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0){ready=true;break;}await new Promise(r=>setTimeout(r,250));}assert.ok(ready);
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 const migrations=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
 const scopedIndex=migrations.findIndex(f=>f.endsWith('_vpj_07_scoped_text_claim.sql'));assert.ok(scopedIndex>0);
 const stagingIndex=migrations.findIndex(f=>f.endsWith('_vpj_37_ops_scope_read_model.sql'));assert.equal(stagingIndex,32);
 for(const f of migrations.slice(0,stagingIndex+1))await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
 assert.equal(await db('select count(*) from turn_private.text_policies;'),'0');
 const preserved=await fixture();await start(preserved);
 const snapshot=()=>db(`select row_to_json(x) from turn_private.text_content x where turn_id='${preserved.turn}';select row_to_json(x) from turn_private.work x where turn_id='${preserved.turn}';select row_to_json(x) from public.turns x where id='${preserved.turn}';select to_jsonb(x)-'context_mode' from turn_private.text_policies x where id='${preserved.policy}';`);
 const prior=await snapshot();
 for(const f of migrations.slice(stagingIndex+1,scopedIndex+1))await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
 assert.equal(await snapshot(),prior,'33 to 36 upgrade preserves existing policy, text, Turn and leased work');
 assert.equal(await db('select enabled from knowledge_review_private.settings;'),'f','new candidate workflow stays disabled');
 assert.equal(await db('select count(*) from knowledge_review_private.members;'),'0','upgrade grants no operator membership');
 assert.equal(await db('select count(*) from knowledge_review_private.source_revisions;'),'0','upgrade creates no source or reviewed facts');
 await clean();
 for(const f of migrations.slice(scopedIndex+1)){
  const migration=readFileSync('supabase/migrations/'+f,'utf8');
  if(f.endsWith('_vpj_07_service_task_records.sql')){
   const beforeRollback=await snapshot();await db('begin;'+migration+'rollback;');
   assert.equal(await snapshot(),beforeRollback,'transaction rollback preserves previously leased/retained data');
   assert.equal(await db("select to_regclass('turn_private.service_tasks') is null;"),'t');
   assert.equal(await db("select to_regprocedure('public.reserve_model_budget(uuid,uuid,uuid,uuid,text,text,text,bigint)') is not null;"),'t');
  }
  if(f.endsWith('_vpj_07_task_context.sql')){
   const preservedBefore=await snapshot();await db('begin;'+migration+'rollback;');
   assert.equal(await snapshot(),preservedBefore,'context migration rollback preserves old policy/input/work');
   assert.equal(await db("select to_regprocedure('public.claim_text_task_work(uuid,uuid)') is null;"),'t');
   assert.equal(await db("select count(*) from information_schema.columns where table_schema='turn_private' and table_name='text_policies' and column_name='context_mode';"),'0');
  }
  await db('begin;'+migration+'commit;');
 }
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
run('durable owner consent gates input; exact retries reuse and changed text rejects',async()=>{
 const a=await fixture();assert.equal((await a.start()).kind,'blocked');
 assert.equal((await a.call('accept_text_policy',{p_policy_id:a.policy,p_notice_hash:'b'.repeat(64)})).kind,'blocked');
 const accepted=await a.accept();assert.equal(accepted.kind,'accepted');assert.equal((await a.accept()).consentId,accepted.consentId);
 const results=await Promise.all([a.start(),a.start()]);assert.deepEqual(results.map(r=>r.reused).sort(),[false,true]);
 await assert.rejects(a.call('start_text_turn',{p_thread_id:a.thread,p_turn_id:uuid(),p_idempotency_key:a.idem,p_policy_id:a.policy,p_locale:'en',p_text:'Changed synthetic text'}),/IDEMPOTENCY_KEY_REUSE/);
 assert.equal(await db(`select count(*) from turn_private.text_content where owner_id='${a.owner}';`),'1');
 await clean();
});
run('cross-owner/session and ordinary roles cannot access private text or service dispatch',async()=>{
 const a=await fixture(),b=await fixture();const l=await start(a);
 assert.equal((await b.call('read_text_turn',{p_turn_id:a.turn})).kind,'unavailable');
 for(const role of ['anon','authenticated','service_role'])assert.notEqual((await sql(container,'set role '+role+';select * from turn_private.text_content;')).code,0);
 for(const role of ['anon','authenticated'])assert.notEqual((await sql(container,`set role ${role};select public.read_text_work('${a.turn}','${l.leaseToken}');`)).code,0);
 const stale=rpc('authenticated',{...a,session:uuid()});await assert.rejects(stale('read_text_turn',{p_turn_id:a.turn}),/SESSION_REPLACED/);
 await clean();
});
run('withdrawal persists across new clients and denies new attempts, late write and owner reads',async()=>{
 const a=await fixture(),l=await start(a);assert.equal((await authorize(a,l)).kind,'authorized');
 await a.call('withdraw_text_policy',{p_policy_id:a.policy});
 assert.equal((await rpc('authenticated',a)('accept_text_policy',{p_policy_id:a.policy,p_notice_hash:notice})).kind,'blocked');
 assert.equal((await service('read_text_work',keys(l))).kind,'blocked');assert.equal((await complete(l)).kind,'blocked');
 assert.equal((await a.call('read_text_turn',{p_turn_id:a.turn})).kind,'unavailable');await clean();
});
run('recipient substitution, replay and policy revocation fail closed',async()=>{
 const a=await fixture(),l=await start(a);
 assert.equal((await service('authorize_text_dispatch',{...keys(l),p_policy_id:a.policy,p_provider:'deepseek'})).kind,'blocked');
 assert.equal((await complete(l)).kind,'blocked');assert.equal((await authorize(a,l)).kind,'authorized');assert.equal((await authorize(a,l)).kind,'blocked');
 await db(`update turn_private.text_policies set revoked_at=clock_timestamp() where id='${a.policy}';`);
 assert.equal((await complete(l)).kind,'blocked');await assert.rejects(db(`update turn_private.text_policies set revoked_at=null where id='${a.policy}';`),/IMMUTABLE_POLICY/);await clean();
});
run('atomic output maps all five business outcomes to correct terminal, once',async()=>{
 for(const kind of ['answered','partial','clarification','blocked','technical_failure']){
  const a=await fixture(),l=await start(a);await authorize(a,l);
  assert.equal((await complete(l,kind)).kind,'finished');assert.equal((await complete(l,kind)).kind,'blocked');
  const result=await a.call('read_text_turn',{p_turn_id:a.turn});assert.equal(result.outcome,kind);
  assert.equal(await db(`select status from public.turns where id='${a.turn}';`),kind==='blocked'?'unavailable':kind==='technical_failure'?'failed':'completed');
  assert.equal(await db(`select count(*) from public.chat_turn_events where turn_id='${a.turn}' and event_type='terminal';`),'1');
 }
});
run('cancel and expired leases prevent late output; cancellation race has one terminal',async()=>{
 for(const mode of ['cancel','expire','race']){
  const a=await fixture(),l=await start(a);await authorize(a,l);
  if(mode==='expire')await db(`update turn_private.work set expires_at=clock_timestamp()-interval '1 second' where turn_id='${a.turn}';`);
  if(mode==='cancel')await a.call('cancel_chat_turn',{p_turn_id:a.turn});
  if(mode==='race')await Promise.allSettled([a.call('cancel_chat_turn',{p_turn_id:a.turn}),complete(l)]);
  else assert.equal((await complete(l)).kind,'blocked');
  assert.equal(await db(`select count(*) from public.chat_turn_events where turn_id='${a.turn}' and event_type='terminal';`),mode==='expire'?'0':'1');await clean();
 }
});
run('UTF-16 input/output limits and secret-bearing envelope alternatives are rejected',async()=>{
 assert.equal(await db(`select turn_private.valid_text(${lit('😀'.repeat(2000))},4000);`),'t');
 assert.equal(await db(`select turn_private.valid_text(${lit('😀'.repeat(2001))},4000);`),'f');
 const a=await fixture(),l=await start(a);await authorize(a,l);
 await assert.rejects(service('complete_text_work',{...keys(l),p_kind:'raw_reasoning',p_text:'hidden'}),/INVALID_INPUT/);
 await assert.rejects(service('complete_text_work',{...keys(l),p_kind:'answered',p_text:'😀'.repeat(4001)}),/INVALID_INPUT/);await clean();
});
run('deletion hides but retains consented content without resurrecting recreated IDs',async()=>{
 for(const entity of ['turns','chat_threads','users']){
  const a=await fixture();await start(a);
  await db(`delete from ${entity==='users'?'auth':'public'}.${entity} where id='${entity==='users'?a.owner:entity==='turns'?a.turn:a.thread}';`);
  assert.equal(await db(`select count(*) from turn_private.text_content where turn_id='${a.turn}' and hidden_at is not null and input_text='Synthetic trip question';`),'1');
 }
});
run('complete worker uses real SQL budget + controlled HTTP, persists validated outcomes and retains unknown charges',async()=>{
 let body=null,hits=0,responseKind='answered';
 const server=createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);body=JSON.parse(Buffer.concat(chunks).toString());hits++;
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify({model:PROTOCOL_MODELS.qwen,choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({outcome:responseKind,text:'Synthetic controlled answer'})}}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  for(const outcome of ['answered','partial','clarification','blocked','technical_failure']){
   responseKind=outcome;const a=await fixture();await a.accept();await a.start();
   // Version comes from the actual adapter registry, not a guessed provider model.
   await db(`insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at) values('${a.scope}','${a.owner}','CNY',100000,10000,3,1,true,now()+interval '1 day');insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled) values('${a.scope}','qwen','${PROTOCOL_MODELS.qwen}','synthetic-v1',100000,1000,true);`);
   const prior=hits;
   const binding={provider:'qwen',endpoint:'https://synthetic.invalid/inference',price:()=>null,transport:async request=>{
    const sent=JSON.parse(request.body);assert.equal(sent.model,PROTOCOL_MODELS.qwen);
    return fetch('http://127.0.0.1:'+server.address().port,{method:'POST',body:request.body,signal:request.signal});
   }};
   assert.equal(await runTextWorker(service,service,service,{scopeId:a.scope,priceVersion:'synthetic-v1',reservedMicros:1000,maxOutputTokens:100,timeoutMs:10000},binding,new AbortController().signal),'finished');
   assert.equal(hits,prior+1);assert.equal(body.messages.at(-1).content,'Synthetic trip question');
   const answer=await a.call('read_text_turn',{p_turn_id:a.turn});assert.equal(answer.outcome,outcome);assert.equal(answer.output,'Synthetic controlled answer');
   assert.equal(await db(`select status from public.model_budget_attempts where scope_id='${a.scope}';`),'pending');
   assert.equal(await runTextWorker(service,service,service,{scopeId:a.scope,priceVersion:'synthetic-v1',reservedMicros:1000,maxOutputTokens:100,timeoutMs:10000},binding,new AbortController().signal),'empty');assert.equal(hits,prior+1);
  }
 }finally{await new Promise(resolve=>server.close(resolve));}
});
async function transaction(q){
 const child=spawn('docker',['exec','-i',container,'psql','-h','/tmp/vpj59-socket','-U','postgres','-X','-q','-At','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});
 let output='',errors='';child.stderr.on('data',d=>errors+=d);
 const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('transaction barrier timeout: '+errors)),5000);child.stdout.on('data',d=>{output+=d;if(output.includes('barrier-ready')){clearTimeout(timer);resolve();}});child.once('exit',()=>{clearTimeout(timer);reject(Error('barrier exited: '+errors));});});
 child.stdin.write("begin;set statement_timeout='5s';"+q+";select 'barrier-ready';\n");await ready;
 return {async finish(q=''){const exited=once(child,'exit');child.stdin.end(q+';commit;\n');const [code]=await exited;assert.equal(code,0,errors);}};
}
run('thread/user deletion lock barriers roll back busy work without deadlock or false cancellation',async()=>{
 for(const entity of ['chat_threads','users']){
  const a=await fixture(),l=await start(a);await authorize(a,l);
  const schema=entity==='users'?'auth':'public',id=entity==='users'?a.owner:a.thread;
  const barrier=await transaction(`select id from ${schema}.${entity} where id='${id}' for update`);
  try{
   await assert.rejects(complete(l),/could not obtain lock/);
   assert.equal(await db(`select state from turn_private.work where turn_id='${a.turn}';`),'leased');
  }finally{await barrier.finish(`delete from ${schema}.${entity} where id='${id}'`);}
  assert.equal(await db(`select hidden_at is not null from turn_private.text_content where turn_id='${a.turn}';`),'t');
 }
});
async function funded(a){
 await a.accept();await a.start();
 await db(`insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at) values('${a.scope}','${a.owner}','CNY',100000,10000,3,1,true,now()+interval '1 day');insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled) values('${a.scope}','qwen','${PROTOCOL_MODELS.qwen}','synthetic-v1',100000,1000,true);`);
 return {scopeId:a.scope,priceVersion:'synthetic-v1',reservedMicros:1000,maxOutputTokens:100,timeoutMs:10000};
}
const response=value=>Response.json({model:PROTOCOL_MODELS.qwen,choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(value)}}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}});
run('withdrawal at the final egress gate prevents HTTP even after budget dispatch',async()=>{
 const a=await fixture(),config=await funded(a);let hits=0;
 const intercept=async(name,p)=>{
  if(name==='authorize_text_dispatch')await a.call('withdraw_text_policy',{p_policy_id:a.policy});
  return service(name,p);
 };
 const binding={provider:'qwen',endpoint:'https://synthetic.invalid/inference',price:()=>null,transport:async()=>{hits++;return response({outcome:'answered',text:'must not be used'});}};
 assert.equal(await runTextWorker(service,intercept,service,config,binding,new AbortController().signal),'unavailable');
 assert.equal(hits,0);assert.equal(await db(`select output_text is null from turn_private.text_content where turn_id='${a.turn}';`),'t');
 assert.equal(await db(`select status from public.model_budget_attempts where scope_id='${a.scope}';`),'pending');await clean();
});
run('cancel while provider is in flight rejects late answer; unknown extra fields never persist',async()=>{
 for(const invalid of [false,true]){
  const a=await fixture(),config=await funded(a);
  const binding={provider:'qwen',endpoint:'https://synthetic.invalid/inference',price:()=>null,transport:async()=>{
   if(!invalid)await a.call('cancel_chat_turn',{p_turn_id:a.turn});
   return response(invalid?{outcome:'answered',text:'unsafe raw body',reasoning:'must never persist'}:{outcome:'answered',text:'late answer'});
  }};
  assert.equal(await runTextWorker(service,service,service,config,binding,new AbortController().signal),invalid?'finished':'unavailable');
  if(invalid){const read=await a.call('read_text_turn',{p_turn_id:a.turn});assert.equal(read.outcome,'technical_failure');assert.doesNotMatch(JSON.stringify(read),/unsafe raw body|must never persist/);}
  else assert.equal(await db(`select output_text is null from turn_private.text_content where turn_id='${a.turn}';`),'t');
  assert.equal(await db(`select count(*) from public.chat_turn_events where turn_id='${a.turn}' and event_type='terminal';`),'1');await clean();
 }
});
run('unverified model usage retains the full budget hold instead of using the configured tariff',async()=>{
 const a=await fixture(),config=await funded(a);let priced=0,hits=0;
 const server=createServer(async(req,res)=>{
  for await(const _chunk of req){/* Read only this synthetic request. */}hits++;
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify({model:'unverified-model',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({outcome:'answered',text:'Synthetic response'})}}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const binding={provider:'qwen',endpoint:'https://synthetic.invalid/inference',price:()=>{priced++;return 20;},transport:request=>fetch('http://127.0.0.1:'+server.address().port,{method:'POST',body:request.body,signal:request.signal})};
  assert.equal(await runTextWorker(service,service,service,config,binding,new AbortController().signal),'finished');
  const ledger=JSON.parse(await db(`select json_build_object('status',status,'actual',actual_micros,'reserved',reserved_micros) from public.model_budget_attempts where scope_id='${a.scope}';`));
  assert.deepEqual(ledger,{status:'pending',actual:null,reserved:1000},'unverified model cannot use the configured model tariff');
  assert.equal(priced,0);assert.equal(hits,1);
  assert.equal((await service('reserve_model_budget',{p_scope_id:a.scope,p_owner_id:a.owner,p_task_id:uuid(),p_attempt_id:uuid(),p_provider:'qwen',p_model:PROTOCOL_MODELS.qwen,p_price_version:'synthetic-v1',p_reserved_micros:1})).kind,'exhausted','unknown charge retains its concurrency slot');
  const read=await a.call('read_text_turn',{p_turn_id:a.turn});assert.equal(read.outcome,'technical_failure');assert.notEqual(read.output,'Synthetic response');
  assert.equal(await db(`select status from public.turns where id='${a.turn}';`),'failed');
  assert.equal(await db(`select count(*) from public.chat_turn_events where turn_id='${a.turn}' and event_type='terminal';`),'1');
  assert.equal(await runTextWorker(service,service,service,config,binding,new AbortController().signal),'empty');assert.equal(hits,1);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
run('verified model charges survive business failures while unproved protocol failures remain pending',async()=>{
 const good={model:PROTOCOL_MODELS.qwen,choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({outcome:'answered',text:'Synthetic controlled answer'})}}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}};
 const choice=(finish_reason,content=good.choices[0].message.content)=>[{index:0,finish_reason,message:{role:'assistant',content}}];
 const cases=[
  {name:'normal answer',payload:good,priced:true,outcome:'answered'},
  {name:'business blocked',payload:{...good,choices:choice('stop',JSON.stringify({outcome:'blocked',text:'Synthetic blocked'}))},priced:true,outcome:'blocked'},
  {name:'business technical failure',payload:{...good,choices:choice('stop',JSON.stringify({outcome:'technical_failure',text:'Synthetic failure'}))},priced:true,outcome:'technical_failure'},
  {name:'provider safety refusal',payload:{...good,choices:choice('content_filter',null)},priced:true,outcome:'blocked'},
  {name:'invalid business JSON with verified protocol',payload:{...good,choices:choice('stop','not business JSON')},priced:true,outcome:'technical_failure'},
  {name:'missing model',payload:{...good,model:undefined},priced:false,outcome:'technical_failure'},
  {name:'mismatched safety model',payload:{...good,model:'different-model',choices:choice('content_filter',null)},priced:false,outcome:'technical_failure'},
  {name:'error envelope with usage',payload:{...good,error:{code:'SYNTHETIC_ERROR'}},priced:false,outcome:'technical_failure'},
  {name:'partial protocol output',payload:{...good,choices:choice('length')},priced:false,outcome:'technical_failure'},
  {name:'invalid choices with usage',payload:{...good,choices:[]},priced:false,outcome:'technical_failure'},
  {name:'invalid usage arithmetic',payload:{...good,usage:{prompt_tokens:10,completion_tokens:10,total_tokens:21}},priced:false,outcome:'technical_failure'},
 ];
 let payload=good,hits=0;
 const server=createServer(async(req,res)=>{for await(const _chunk of req){/* Synthetic test input only. */}hits++;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(payload));});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  for(const sample of cases){
   payload=sample.payload;const a=await fixture(),config=await funded(a);let priced=0;const prior=hits;
   const binding={provider:'qwen',endpoint:'https://synthetic.invalid/inference',price:usage=>{priced++;assert.equal(usage.totalTokens,20);return 20;},transport:request=>fetch('http://127.0.0.1:'+server.address().port,{method:'POST',body:request.body,signal:request.signal})};
   assert.equal(await runTextWorker(service,service,service,config,binding,new AbortController().signal),'finished',sample.name);
   assert.equal(priced,sample.priced?1:0,sample.name);assert.equal(hits,prior+1,sample.name);
   const ledger=JSON.parse(await db(`select json_build_object('status',status,'actual',actual_micros,'reserved',reserved_micros) from public.model_budget_attempts where scope_id='${a.scope}';`));
   assert.deepEqual(ledger,{status:sample.priced?'settled':'pending',actual:sample.priced?20:null,reserved:1000},sample.name);
   assert.equal(await db(`select count(*) from public.model_budget_attempts where scope_id='${a.scope}' and status in ('reserved','dispatched','pending');`),sample.priced?'0':'1',sample.name);
   const read=await a.call('read_text_turn',{p_turn_id:a.turn});assert.equal(read.outcome,sample.outcome,sample.name);
   assert.equal(await db(`select status from public.turns where id='${a.turn}';`),sample.outcome==='blocked'?'unavailable':sample.outcome==='technical_failure'?'failed':'completed',sample.name);
   assert.equal(await db(`select count(*) from public.chat_turn_events where turn_id='${a.turn}' and event_type='terminal';`),'1',sample.name);
  }
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

const scopedClaim=a=>service('claim_text_work',{p_owner_id:a.owner,p_policy_id:a.policy});
run('scoped claimer leaves other owners, other policies and metadata-only work untouched',async()=>{
 const a=await fixture(),b=await fixture();await b.accept();await b.start();await a.accept();await a.start();
 const second=uuid(),metadata=uuid();
 await a.call('accept_text_policy',{p_policy_id:b.policy,p_notice_hash:notice});
 await a.call('start_text_turn',{p_thread_id:a.thread,p_turn_id:second,p_idempotency_key:uuid(),p_policy_id:b.policy,p_locale:'en',p_text:'Other policy synthetic'});
 await db(`insert into public.turns(id,owner_id,thread_id,status) values('${metadata}','${a.owner}','${a.thread}','accepted');insert into public.chat_turn_events(owner_id,thread_id,turn_id,event_id,sequence,schema_version,event_type,state) values('${a.owner}','${a.thread}','${metadata}','accepted',1,'turn-sse-v1','accepted','accepted');`);
 await service('enqueue_turn_work',{p_turn_id:metadata,p_owner_id:a.owner,p_session_id:a.session,p_lease_ms:120000,p_max_attempts:3});
 const untouched=()=>db(`select jsonb_agg(to_jsonb(w) order by turn_id) from turn_private.work w where turn_id in ('${b.turn}','${second}','${metadata}');`);
 const before=await untouched(),lease=await scopedClaim(a);
 assert.equal(lease.kind,'leased');assert.equal(lease.turnId,a.turn);assert.equal(lease.ownerId,a.owner);
 assert.equal((await scopedClaim(a)).kind,'empty');assert.equal(await untouched(),before);
 await clean();
});
run('scoped and legacy claimers serialize; expired leases recover once and old tokens cannot dispatch',async()=>{
 const a=await fixture();await a.accept();await a.start();
 const simultaneous=await Promise.all([scopedClaim(a),service('claim_turn_work')]);
 assert.deepEqual(simultaneous.map(x=>x.kind).sort(),['empty','leased']);const old=simultaneous.find(x=>x.kind==='leased');
 await db(`update turn_private.work set expires_at=clock_timestamp()-interval '1 second' where turn_id='${a.turn}';`);
 const recovered=await Promise.all([scopedClaim(a),scopedClaim(a)]);
 assert.deepEqual(recovered.map(x=>x.kind).sort(),['empty','leased']);const fresh=recovered.find(x=>x.kind==='leased');
 assert.equal(fresh.attempt,2);assert.notEqual(fresh.leaseToken,old.leaseToken);
 assert.equal((await authorize(a,old)).kind,'blocked');assert.equal((await authorize(a,fresh)).kind,'authorized');
 assert.equal((await complete(fresh)).kind,'finished');assert.equal((await scopedClaim(a)).kind,'empty');
 assert.equal(await db(`select count(*) from public.chat_turn_events where turn_id='${a.turn}' and event_type='terminal';`),'1');
});
run('scoped claim refuses ordinary roles and leaves revoked or hidden content unleased',async()=>{
 for(const mode of ['withdraw','revoke','hide','expired']){
  const a=await fixture(mode==='expired'?'4 seconds':'1 day');await a.accept();await a.start();
  for(const role of ['anon','authenticated'])assert.notEqual((await sql(container,`set role ${role};select public.claim_text_work('${a.owner}','${a.policy}');`)).code,0);
  if(mode==='withdraw')await a.call('withdraw_text_policy',{p_policy_id:a.policy});
  if(mode==='revoke')await db(`update turn_private.text_policies set revoked_at=clock_timestamp() where id='${a.policy}';`);
  if(mode==='hide')await db(`update turn_private.text_content set hidden_at=clock_timestamp() where turn_id='${a.turn}';`);
  if(mode==='expired')await waitUntil(async()=>await db(`select expires_at<=clock_timestamp() from turn_private.text_policies where id='${a.policy}';`)==='t',6000,'actual policy expiry');
  const before=await db(`select row_to_json(w) from turn_private.work w where turn_id='${a.turn}';`);
  assert.equal((await scopedClaim(a)).kind,'empty');assert.equal(await db(`select row_to_json(w) from turn_private.work w where turn_id='${a.turn}';`),before);
  await clean();
 }
 await assert.rejects(service('claim_text_work',{p_owner_id:null,p_policy_id:uuid()}),/INVALID_INPUT/);
});
run('scoped claim rolls back on deletion lock contention and can be disabled without changing retained records',async()=>{
 const a=await fixture();await a.accept();await a.start();
 const barrier=await transaction(`select id from auth.users where id='${a.owner}' for update`);
 try{await assert.rejects(scopedClaim(a),/could not obtain lock/);assert.equal(await db(`select state from turn_private.work where turn_id='${a.turn}';`),'queued');}
 finally{await barrier.finish();}
 const snapshot=()=>db(`select row_to_json(x) from turn_private.text_content x where turn_id='${a.turn}';select row_to_json(x) from turn_private.work x where turn_id='${a.turn}';`),prior=await snapshot();
 await db('revoke execute on function public.claim_text_work(uuid,uuid) from service_role;');
 try{await assert.rejects(scopedClaim(a),/permission denied/);assert.equal(await snapshot(),prior);}
 finally{await db('grant execute on function public.claim_text_work(uuid,uuid) to service_role;');}
 assert.equal((await scopedClaim(a)).kind,'leased');await clean();
});

async function taskFixture(contextMode='current_input_v1'){
 const a=await fixture('1 day',contextMode);a.task=uuid();await a.accept();
 a.taskInput={p_thread_id:a.thread,p_turn_id:a.turn,p_idempotency_key:a.idem,p_policy_id:a.policy,p_locale:'en',p_text:'Synthetic scoped goal',p_task_id:a.task,p_scope_version:1,p_relationship:'new_goal',p_parent_turn_id:null};
 a.submit=(patch={})=>a.call('submit_service_task_turn',{...a.taskInput,...patch});
 a.next=(parent,relationship='clarification')=>({p_turn_id:uuid(),p_idempotency_key:uuid(),p_parent_turn_id:parent,p_relationship:relationship,p_text:'Synthetic continuation'});
 a.finish=async(kind)=>{const l=await service(contextMode==='task_history_v1'?'claim_text_task_work':'claim_text_work',{p_owner_id:a.owner,p_policy_id:a.policy});assert.equal(l.kind,'leased');
  if(contextMode==='task_history_v1'){const raw=await service('read_text_work',keys(l));assert.equal((await service('authorize_text_task_dispatch',{...keys(l),p_policy_id:a.policy,p_provider:'qwen',p_context_digest:raw.contextDigest})).kind,'authorized');}else await authorize(a,l);
  assert.equal((await complete(l,kind)).kind,'finished');};
 return a;
}
run('ServiceTask records exact request replay and a latest-parent clarification/repair chain',async()=>{
 const a=await taskFixture();const first=await a.submit();assert.equal(first.serviceTaskId,a.task);assert.equal(first.reused,false);
 for(const patch of [{p_text:'Changed goal'},{p_turn_id:uuid()},{p_locale:'zh'},{p_relationship:'repair',p_parent_turn_id:a.turn}])await assert.rejects(a.submit(patch),/IDEMPOTENCY_KEY_REUSE/);
 const second=a.next(a.turn);await assert.rejects(a.submit(second),/SERVICE_TASK_CONFLICT/);
 await a.finish('clarification');const responses=await Promise.all([a.submit(second),a.submit(second)]);assert.deepEqual(responses.map(r=>r.reused).sort(),[false,true]);
 assert.equal((await a.submit()).turnId,a.turn,'old exact request still replays after lastTurn advances');
 await assert.rejects(a.submit(a.next(a.turn)),/SERVICE_TASK_CONFLICT/);
 await a.finish('technical_failure');const third=a.next(second.p_turn_id,'repair');assert.equal((await a.submit(third)).reused,false);
 await a.finish('answered');await assert.rejects(a.submit(a.next(third.p_turn_id)),/SERVICE_TASK_CONFLICT/);
 const history=await a.call('list_service_task_turns',{p_policy_id:a.policy,p_limit:20});assert.equal(history.turns.length,3);assert.ok(history.turns.every(t=>t.serviceTaskId===a.task));
 assert.equal(await db(`select count(*) from public.chat_turn_events where turn_id='${a.turn}' and event_type='terminal';`),'1');
});
run('development capacity serializes the last text slot and settles only a readable answer',async()=>{
 await db("update turn_private.service_task_capacity_settings set enabled=true where singleton=true;");
 try{
  const a=await taskFixture();
  const first=await a.submit();assert.equal(first.capacityState,'reserved');
  await a.finish('answered');
  assert.equal((await a.call('read_text_turn',{p_turn_id:a.turn})).outcome,'answered');
  assert.equal(await db(`select state from turn_private.service_task_capacity where task_id='${a.task}';`),'settled');
  assert.equal((await a.submit()).reused,true);
  assert.equal(await db(`select count(*) from turn_private.service_task_capacity where task_id='${a.task}';`),'1');
  const goal=()=>({...a.taskInput,p_thread_id:uuid(),p_turn_id:uuid(),p_idempotency_key:uuid(),p_task_id:uuid()});
  const contenders=[goal(),goal()];
  const raced=await Promise.allSettled(contenders.map(input=>a.call('submit_service_task_turn',input)));
  assert.equal(raced.filter(x=>x.status==='fulfilled').length,1);
  assert.match(raced.find(x=>x.status==='rejected').reason.message,/SERVICE_TASK_CAPACITY_EXHAUSTED/);
  const accepted=contenders[raced.findIndex(x=>x.status==='fulfilled')];
  const rejected=contenders[raced.findIndex(x=>x.status==='rejected')];
  assert.equal(await db(`select count(*) from turn_private.service_task_capacity where owner_id='${a.owner}' and state in ('reserved','settled');`),'2');
  assert.equal(await db(`select count(*) from turn_private.service_tasks where id='${rejected.p_task_id}';`),'0','exhausted admission rolls back the task and Turn');
  await a.call('cancel_chat_turn',{p_turn_id:accepted.p_turn_id});
  assert.equal(await db(`select state from turn_private.service_task_capacity where task_id='${accepted.p_task_id}';`),'released');
  assert.equal((await a.call('submit_service_task_turn',rejected)).capacityState,'reserved');
 }finally{await db("update turn_private.service_task_capacity_settings set enabled=false where singleton=true;");await clean();}
});
run('clarification and failed repair retain one task identity and re-admit after release',async()=>{
 await db("update turn_private.service_task_capacity_settings set enabled=true where singleton=true;");
 try{
  const a=await taskFixture();await a.submit();await a.finish('clarification');
  assert.equal(await db(`select state from turn_private.service_task_capacity where task_id='${a.task}';`),'reserved');
  const next=a.next(a.turn);await a.submit(next);await a.finish('technical_failure');
  assert.equal(await db(`select state from turn_private.service_task_capacity where task_id='${a.task}';`),'released');
  const repair=a.next(next.p_turn_id,'repair');
  await db("update turn_private.service_task_capacity_settings set enabled=false where singleton=true;");
  await assert.rejects(a.submit(repair),/CAPACITY_POLICY_UNAVAILABLE/,'switching off admission cannot demote an enforced task');
  await db("update turn_private.service_task_capacity_settings set enabled=true where singleton=true;");
  assert.equal((await a.submit(repair)).capacityState,'reserved');
  await a.finish('answered');
  assert.equal(await db(`select count(*) from turn_private.service_task_capacity where task_id='${a.task}' and state='settled';`),'1');
  assert.equal(await db(`select count(*) from turn_private.service_task_turns where task_id='${a.task}';`),'3');
 }finally{await db("update turn_private.service_task_capacity_settings set enabled=false where singleton=true;");await clean();}
});
run('partial text keeps readable output but releases capacity without a later settlement path',async()=>{
 await db("update turn_private.service_task_capacity_settings set enabled=true where singleton=true;");
 try{
  const a=await taskFixture();await a.submit();
  const lease=await service('claim_text_work',{p_owner_id:a.owner,p_policy_id:a.policy});
  assert.equal(lease.kind,'leased');assert.equal((await authorize(a,lease)).kind,'authorized');
  assert.equal((await complete(lease,'partial')).kind,'finished');
  const saved=await a.call('read_text_turn',{p_turn_id:a.turn});
  assert.equal(saved.outcome,'partial');assert.equal(saved.output,'Synthetic result');
  assert.equal(await db(`select state||':'||(settled_turn_id is null)::text from turn_private.service_task_capacity where task_id='${a.task}';`),'released:true');
  assert.equal((await complete(lease,'answered')).kind,'blocked','the terminal Turn rejects a late old worker');
  for(const relationship of ['repair','clarification'])await assert.rejects(a.submit(a.next(a.turn,relationship)),/SERVICE_TASK_CONFLICT/);
  assert.equal((await a.submit()).reused,true,'exact replay cannot recreate a reservation');
  assert.equal(await db(`select count(*) from turn_private.service_task_capacity where task_id='${a.task}' and state='settled';`),'0');
  const fresh={...a.taskInput,p_thread_id:uuid(),p_turn_id:uuid(),p_idempotency_key:uuid(),p_task_id:uuid()};
  assert.equal((await a.call('submit_service_task_turn',fresh)).capacityState,'reserved','released partial capacity may serve a new goal');
 }finally{await db("update turn_private.service_task_capacity_settings set enabled=false where singleton=true;");await clean();}
});
run('missing development capacity settings fail closed without a task or Turn',async()=>{
 const a=await taskFixture();
 await db('delete from turn_private.service_task_capacity_settings where singleton=true;');
 try{
  await assert.rejects(a.submit(),/CAPACITY_POLICY_UNAVAILABLE/);
  assert.equal(await db(`select count(*) from turn_private.service_tasks where id='${a.task}';`),'0');
  assert.equal(await db(`select count(*) from public.turns where id='${a.turn}';`),'0');
 }finally{await db("insert into turn_private.service_task_capacity_settings(singleton,enabled) values(true,false);");}
 assert.equal((await a.submit()).capacityMode,'record_only','a valid disabled configuration restores legacy behavior');
 await clean();
});
run('future and revoked Sandbox grants never authorize text capacity or late settlement',async()=>{
 await db("update turn_private.service_task_capacity_settings set enabled=true where singleton=true;");
 try{
  const snapshot=lit(JSON.stringify(journeyPassCatalog.serviceTaskCapacity.journeyPass));
  const future=await taskFixture(),live=await taskFixture();
  await db(`insert into public.storekit_grants(environment,transaction_id,owner_id,app_account_token,product_id,purchase_at,starts_at,ends_at,catalog_version,policy_version,capacity_snapshot)
    values('Sandbox','future-test','${future.owner}','${future.owner}','synthetic',now(),now()+interval '1 hour',now()+interval '721 hours',2,'service-task-development/1',${snapshot}::jsonb),
    ('Sandbox','live-test','${live.owner}','${live.owner}','synthetic',now()-interval '1 minute',now()-interval '1 minute',now()+interval '719 hours 59 minutes',2,'service-task-development/1',${snapshot}::jsonb);`);
  await future.submit();
  assert.equal(await db(`select tier from turn_private.service_task_capacity where task_id='${future.task}';`),'free');
  await live.submit();
  assert.equal(await db(`select tier from turn_private.service_task_capacity where task_id='${live.task}';`),'journey_pass');
  const lease=await service('claim_text_work',{p_owner_id:live.owner,p_policy_id:live.policy});
  assert.equal(lease.kind,'leased');assert.equal((await authorize(live,lease)).kind,'authorized');
  await db("update public.storekit_grants set state='revoked',revoked_at=clock_timestamp() where transaction_id='live-test';");
  await assert.rejects(complete(lease),/SERVICE_TASK_GRANT_UNAVAILABLE/);
  assert.equal(await db(`select output_text is null from turn_private.text_content where turn_id='${live.turn}';`),'t');
  assert.equal(await db(`select state from turn_private.service_task_capacity where task_id='${live.task}';`),'reserved');
 }finally{await db("update turn_private.service_task_capacity_settings set enabled=false where singleton=true;");await clean();}
});
run('ServiceTask competing continuations and legacy v1/state admissions cannot split the task',async()=>{
 const a=await taskFixture();await a.submit();await a.finish('clarification');
 const results=await Promise.allSettled([a.submit(a.next(a.turn)),a.submit(a.next(a.turn))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/SERVICE_TASK_CONFLICT/);
 await assert.rejects(a.call('start_text_turn',{p_thread_id:a.thread,p_turn_id:uuid(),p_idempotency_key:uuid(),p_policy_id:a.policy,p_locale:'en',p_text:'Bypass'}),/SERVICE_TASK_CONFLICT/);
 await assert.rejects(a.call('submit_text_turn',{p_thread_id:a.thread,p_turn_id:uuid(),p_idempotency_key:uuid(),p_policy_id:a.policy,p_locale:'en',p_text:'Bypass'}),/SERVICE_TASK_CONFLICT/);
 await assert.rejects(a.call('start_chat_turn',{p_thread_id:a.thread,p_turn_id:uuid(),p_idempotency_key:uuid(),p_digest:'chat-state-control-v1'}),/SERVICE_TASK_CONFLICT/);
 assert.equal((await a.call('start_text_turn',{p_thread_id:a.thread,p_turn_id:a.turn,p_idempotency_key:a.idem,p_policy_id:a.policy,p_locale:'en',p_text:a.taskInput.p_text})).reused,true);
 const b=await taskFixture();await assert.rejects(b.submit({p_task_id:a.task,p_thread_id:a.thread}),/FORBIDDEN/);
 await clean();
});
run('ServiceTask shared cost is canonical for old Turn workers, pinned across scope changes and denied to ordinary roles',async()=>{
 const a=await taskFixture();await a.submit();await a.finish('clarification');const next=a.next(a.turn);await a.submit(next);
 const secondScope=uuid();
 for(const scope of [a.scope,secondScope])await db(`insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at) values('${scope}','${a.owner}','CNY',10000,1000,2,10,true,now()+interval '1 day');insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled) values('${scope}','qwen','${PROTOCOL_MODELS.qwen}','synthetic-v1',10000,1000,true);`);
 const params={p_scope_id:a.scope,p_owner_id:a.owner,p_task_id:a.turn,p_attempt_id:uuid(),p_provider:'qwen',p_model:PROTOCOL_MODELS.qwen,p_price_version:'synthetic-v1',p_reserved_micros:600};
 assert.equal((await service('reserve_model_budget',{...params,p_scope_id:uuid()})).kind,'unavailable');
 assert.equal(await db(`select budget_scope_id is null from turn_private.service_tasks where id='${a.task}';`),'t');
 assert.equal((await service('reserve_model_budget',params)).kind,'reserved');
 assert.equal((await service('reserve_model_budget',{...params,p_task_id:a.task})).kind,'duplicate');
 assert.equal((await service('reserve_model_budget',{...params,p_task_id:next.p_turn_id,p_attempt_id:uuid()})).kind,'exhausted','separate Turn shares money cap');
 assert.equal((await service('reserve_model_budget',{...params,p_scope_id:secondScope,p_task_id:next.p_turn_id,p_attempt_id:uuid()})).kind,'conflict');
 assert.equal((await service('finish_model_budget',{p_scope_id:a.scope,p_owner_id:a.owner,p_attempt_id:params.p_attempt_id,p_action:'release'})).kind,'released');
 assert.equal((await service('reserve_model_budget',{...params,p_scope_id:secondScope,p_attempt_id:uuid()})).kind,'conflict','release never clears task scope');
 assert.equal((await service('reserve_model_budget',{...params,p_task_id:next.p_turn_id,p_attempt_id:uuid(),p_reserved_micros:10})).kind,'reserved');
 assert.equal((await service('reserve_model_budget',{...params,p_task_id:a.task,p_attempt_id:uuid(),p_reserved_micros:10})).kind,'exhausted','all turns share attempt limit including released');
 assert.equal((await service('reserve_model_budget',{...params,p_owner_id:uuid(),p_attempt_id:uuid()})).kind,'unavailable');
 for(const role of ['anon','authenticated','service_role']){
  assert.notEqual((await sql(container,`set role ${role};select * from turn_private.service_tasks;`)).code,0);
  assert.notEqual((await sql(container,`set role ${role};select turn_private.reserve_model_budget_unbound(null,null,null,null,null,null,null,null);`)).code,0);
 }
 for(const role of ['anon','authenticated'])assert.notEqual((await sql(container,`set role ${role};select public.reserve_model_budget(null,null,null,null,null,null,null,null);`)).code,0);
 await clean();
});
run('ServiceTask withdrawal and physical deletion preserve hidden records but forbid continuation and dispatch',async()=>{
 for(const mode of ['withdraw','root','thread','owner']){
  const a=await taskFixture();await a.submit();await a.finish('clarification');const next=a.next(a.turn);await a.submit(next);
  const l=await service('claim_text_work',{p_owner_id:a.owner,p_policy_id:a.policy});assert.equal(l.kind,'leased');
  if(mode==='withdraw')await a.call('withdraw_text_policy',{p_policy_id:a.policy});
  else await db(`delete from ${mode==='owner'?'auth.users':mode==='thread'?'public.chat_threads':'public.turns'} where id='${mode==='owner'?a.owner:mode==='thread'?a.thread:a.turn}';`);
  assert.equal((await service('read_text_work',keys(l))).kind,'blocked');assert.equal((await authorize(a,l)).kind,'blocked');
  assert.equal(await db(`select count(*) from turn_private.service_tasks where id='${a.task}';`),'1');
  if(mode==='root'){
   await assert.rejects(a.submit(),/DATA_POLICY_BLOCKED/);
   assert.equal((await a.call('list_service_task_turns',{p_policy_id:a.policy,p_limit:20})).turns.length,0);
  }
  await clean();
 }
});
run('ServiceTask and legacy Turn IDs cannot collide in either direction or concurrent creation',async()=>{
 const a=await taskFixture(),legacy=await fixture();
 await legacy.call('start_chat_turn',{p_thread_id:legacy.thread,p_turn_id:legacy.turn,p_idempotency_key:legacy.idem,p_digest:'chat-state-control-v1'});
 await assert.rejects(a.submit({p_task_id:legacy.turn}),/SERVICE_TASK_CONFLICT/);
 await a.submit();
 await assert.rejects(legacy.call('start_chat_turn',{p_thread_id:legacy.thread,p_turn_id:a.task,p_idempotency_key:uuid(),p_digest:'chat-state-control-v1'}),/SERVICE_TASK_CONFLICT/);
 const b=await taskFixture(),other=await fixture(),collision=uuid();
 const results=await Promise.allSettled([b.submit({p_task_id:collision}),other.call('start_chat_turn',{p_thread_id:other.thread,p_turn_id:collision,p_idempotency_key:uuid(),p_digest:'chat-state-control-v1'})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/SERVICE_TASK_CONFLICT/);
 await clean();
});

run('task history requires a new immutable policy and consent; legacy claimers leave it recoverable',async()=>{
 const a=await taskFixture('task_history_v1');await a.submit();
 await assert.rejects(db(`update turn_private.text_policies set context_mode='current_input_v1' where id='${a.policy}';`),/IMMUTABLE_POLICY/);
 const before=await db(`select row_to_json(w) from turn_private.work w where turn_id='${a.turn}';`);
 assert.equal((await scopedClaim(a)).kind,'empty');assert.equal((await service('claim_turn_work')).kind,'empty');
 assert.equal(await db(`select row_to_json(w) from turn_private.work w where turn_id='${a.turn}';`),before);
 const l=await service('claim_text_task_work',{p_owner_id:a.owner,p_policy_id:a.policy});assert.equal(l.attempt,1);
 const raw=await service('read_text_work',keys(l));assert.equal(raw.kind,'task_input');assert.deepEqual(raw.history,[]);
 assert.equal((await authorize(a,l)).kind,'blocked');
 for(const role of ['anon','authenticated'])for(const name of ['claim_text_task_work','authorize_text_task_dispatch'])
  assert.notEqual((await sql(container,`set role ${role};select public.${name}(${name==='claim_text_task_work'?`'${a.owner}','${a.policy}'`:`'${a.turn}','${l.leaseToken}','${a.policy}','qwen','${raw.contextDigest}'`});`)).code,0);
 const legacy=await fixture();await legacy.accept();assert.equal((await legacy.call('read_text_task_policy',{p_policy_id:legacy.policy})).kind,'unavailable');
 await assert.rejects(a.call('submit_text_turn',{p_thread_id:uuid(),p_turn_id:uuid(),p_idempotency_key:uuid(),p_policy_id:a.policy,p_locale:'en',p_text:'unassociated'}),/DATA_POLICY_BLOCKED/);
 await clean();
});
run('task history is ordered and capped at four turns with exact replay at the bound',async()=>{
 const a=await taskFixture('task_history_v1');await a.submit();let parent=a.turn;const inputs=[a.taskInput];
 for(let index=0;index<3;index++){await a.finish('clarification');const next=a.next(parent);next.p_text='Synthetic followup '+index;inputs.push(next);await a.submit(next);parent=next.p_turn_id;}
 const l=await service('claim_text_task_work',{p_owner_id:a.owner,p_policy_id:a.policy});const raw=await service('read_text_work',keys(l));
 assert.equal(raw.history.length,6);assert.deepEqual(raw.history.map(x=>x.role),['user','assistant','user','assistant','user','assistant']);
 assert.deepEqual(raw.history.filter(x=>x.role==='user').map(x=>x.content),inputs.slice(0,3).map(x=>x.p_text));
 const auth={...keys(l),p_policy_id:a.policy,p_provider:'qwen',p_context_digest:raw.contextDigest};
 assert.equal((await service('authorize_text_task_dispatch',{...auth,p_context_digest:'0'.repeat(64)})).kind,'blocked');
 assert.equal((await service('authorize_text_task_dispatch',auth)).kind,'authorized');assert.equal((await complete(l,'clarification')).kind,'finished');
 const snapshot=()=>db(`select count(*) from turn_private.service_task_turns where task_id='${a.task}';select last_turn_id from turn_private.service_tasks where id='${a.task}';`),before=await snapshot();
 await assert.rejects(a.submit(a.next(parent)),/SERVICE_TASK_CONFLICT/);assert.equal(await snapshot(),before);
 assert.equal((await a.submit(inputs[3])).reused,true);assert.equal((await a.submit()).reused,true);
});
run('task dispatch rejects a deleted intermediate ancestor or withdrawn consent after reading',async()=>{
 for(const mode of ['delete','withdraw','mutated']){
  const a=await taskFixture('task_history_v1');await a.submit();await a.finish('clarification');const second=a.next(a.turn);await a.submit(second);await a.finish('clarification');const third=a.next(second.p_turn_id);await a.submit(third);
  const l=await service('claim_text_task_work',{p_owner_id:a.owner,p_policy_id:a.policy}),raw=await service('read_text_work',keys(l));assert.equal(raw.history.length,4);
  if(mode==='delete')await db(`delete from public.turns where id='${second.p_turn_id}';`);
  if(mode==='withdraw')await a.call('withdraw_text_policy',{p_policy_id:a.policy});
  if(mode==='mutated')await db(`update turn_private.text_content set output_text='Synthetic changed ancestor' where turn_id='${second.p_turn_id}';`);
  assert.equal((await service('authorize_text_task_dispatch',{...keys(l),p_policy_id:a.policy,p_provider:'qwen',p_context_digest:raw.contextDigest})).kind,'blocked');
  assert.equal(await db(`select count(*) from turn_private.text_dispatches where lease_token='${l.leaseToken}';`),'0');await clean();
 }
});
