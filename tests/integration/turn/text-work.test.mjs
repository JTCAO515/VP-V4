import {spawn} from 'node:child_process';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
import {PROTOCOL_MODELS} from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';
import {runTextWorker} from '../../../lib/server/turn/text-worker.ts';
const enabled=process.env.VP_TURN_DB_TEST==='1',container='vpj07-text-'+uuid().slice(0,8);
let created=false;
const run=(name,fn)=>test(name,{skip:!enabled},fn);
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const lit=v=>v===null?'null':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const rpc=(role,actor)=>async(name,p={})=>{
 assert.match(name,/^[a-z_]+$/);assert.ok(Object.keys(p).every(k=>/^p_[a-z_]+$/.test(k)));
 const claims=actor?`set request.jwt.claim.sub='${actor.owner}'; set request.jwt.claims='${JSON.stringify({session_id:actor.session})}';`:'';
 const value=await db(claims+'set role '+role+';select public.'+name+'('+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');');
 return name==='cancel_chat_turn'?value:JSON.parse(value);
};
const service=rpc('service_role');
const notice='a'.repeat(64);
async function fixture(){
 const a={owner:uuid(),session:uuid(),thread:uuid(),policy:uuid(),turn:uuid(),idem:uuid(),scope:uuid()};
 await db(`insert into auth.users values('${a.owner}');insert into identity_private.mobile_accounts(owner_id) values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');insert into public.chat_threads(id,owner_id) values('${a.thread}','${a.owner}');
 insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at) values('${a.policy}','qwen','synthetic-test-only','https://synthetic.invalid/inference','fixture-source','fixture-processing','fixture-storage','test-terms-v1','test-notice-v1','${notice}','合成测试告知','Synthetic test notice','retain_after_hide_v1',now()-interval '1 day',now()+interval '1 day',now()+interval '1 day');`);
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
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
 assert.equal(await db('select count(*) from turn_private.text_policies;'),'0');
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
