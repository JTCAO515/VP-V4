// Original legacy RPC with owned network-none synthetic claims; no target/Auth acceptance.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_COMMUNITY_DB_TEST==='1';
const container='vpj64-frontier-'+uuid().slice(0,8);let created=false,beforeBody,beforeAcl,beforeMeta;
const migration='20261006011000_community_safety_frontier_lock.sql';
const lit=s=>"'"+s.replaceAll("'","''")+"'";
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const run=(name,fn)=>test(name,{skip:!enabled,timeout:60000},fn);
async function actor(reviewer=false){const a={id:uuid(),session:uuid()};await db(`insert into auth.users(id,is_anonymous) values('${a.id}',false);insert into auth.sessions(id,user_id) values('${a.session}','${a.id}');${reviewer?`insert into community_private.reviewers values('${a.id}',true);`:''}`);return a;}
const claims=a=>`set request.jwt.claim.sub='${a.id}';set request.jwt.claims=${lit(JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session}))};set role authenticated;`;
const query=(a,v)=>claims(a)+`select public.community_workspace(${lit(JSON.stringify(v))}::jsonb);`;
const call=async(a,v)=>JSON.parse(await db(query(a,v)));
const submit=()=>({action:'submit',operationId:uuid(),submissionId:uuid(),title:'Synthetic source',content:'PRIVATE-SYNTHETIC-BODY',consent:'internal-review-v1'});
const review=s=>({action:'review',operationId:uuid(),submissionId:s.submissionId,expectedVersion:1,decision:'approve',note:'Synthetic internal reviewer note'});
const withdraw=s=>({action:'withdraw',operationId:uuid(),submissionId:s.submissionId,expectedVersion:1});
const waitFor=async(q,why)=>{for(let i=0;i<200;i++){if(await db(q)==='t')return;await new Promise(r=>setTimeout(r,25));}throw Error('Barrier not reached: '+why);};
function gate(name,key){const child=spawn('docker',['exec','-i',container,'psql','-h','/tmp/vpj59-socket','-U','postgres','-X','-q','-At','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});let stderr='';child.stderr.setEncoding('utf8');child.stderr.on('data',x=>stderr+=x);child.stdout.resume();const done=new Promise(resolve=>child.on('close',code=>resolve({code,stderr})));child.stdin.write(`begin;set application_name=${lit(name)};select pg_advisory_xact_lock(64,${key});\n`);return {release:()=>{child.stdin.end('commit;\n');return done;}};}
const effect=async cid=>JSON.parse(await db(`select jsonb_build_object('status',c.status,'version',c.version,'bodyErased',c.title='' and c.content='','audits',(select count(*) from community_private.audit where submission_id=c.id),'receipts',(select count(*) from community_private.receipts where submission_id=c.id),'j1Status',s.j1_status,'submissionVersion',s.submission_version,'safetyVersion',s.safety_version,'fence',s.j1_operator_fence) from community_private.submissions c join community_safety_private.states s on s.submission_id=c.id where c.id='${cid}';`));
async function controlledRace(expectDeadlock,withdrawWins=false){
 const a=await actor(),r=await actor(true),s=submit();await call(a,s);const d=review(s),w=withdraw(s),key=Math.floor(Math.random()*1000000000),suffix=uuid().slice(0,8);const gn='frontier-gate-'+suffix,rn='frontier-review-'+suffix,wn='frontier-withdraw-'+suffix;
 // The first writer holds the original source at the BEFORE UPDATE barrier.
 // The second writer holds its ordinary actor root and waits for that source.
 await db(`create function community_safety_private.fixture_frontier_barrier() returns trigger language plpgsql as $$begin if new.id='${s.submissionId}' and ${withdrawWins?"new.status='withdrawn'":'new.reviewer_id is not null'} then perform pg_advisory_xact_lock(64,${key});end if;return new;end$$;create trigger fixture_frontier_barrier before update on community_private.submissions for each row execute function community_safety_private.fixture_frontier_barrier();`);
 const g=gate(gn,key);let released=false;let rp,wp;
 try{
 await waitFor(`select exists(select 1 from pg_stat_activity where application_name='${gn}' and state='idle in transaction');`,'gate held');
 const startReview=()=>sql(container,`set statement_timeout='15s';set lock_timeout='15s';set deadlock_timeout='100ms';set application_name='${rn}';`+query(r,d));
 const startWithdraw=()=>sql(container,`set statement_timeout='15s';set lock_timeout='15s';set deadlock_timeout='10s';set application_name='${wn}';`+query(a,w));
 const firstName=withdrawWins?wn:rn,secondName=withdrawWins?rn:wn;
 if(withdrawWins)wp=startWithdraw();else rp=startReview();
 await waitFor(`select exists(select 1 from pg_stat_activity x where application_name='${firstName}' and wait_event='advisory' and exists(select 1 from pg_stat_activity b where b.application_name='${gn}' and b.pid=any(pg_blocking_pids(x.pid))));`,'first original source acquired');
 if(withdrawWins)rp=startReview();else wp=startWithdraw();
 await waitFor(`select exists(select 1 from pg_stat_activity x where application_name='${secondName}' and wait_event_type='Lock' and exists(select 1 from pg_stat_activity b where b.application_name='${firstName}' and b.pid=any(pg_blocking_pids(x.pid))));`,'second actor root held and waits for source');
 const releasedGate=await g.release();released=true;assert.equal(releasedGate.code,0,releasedGate.stderr);
 const results=await Promise.all([rp,wp]);const state=await effect(s.submissionId);assert.equal(results.filter(x=>x.code===0).length,1);const loser=results.find(x=>x.code!==0);
 if(expectDeadlock){assert.match(loser.stderr,/deadlock detected/);assert.match(loser.stderr,/source_frontier/);assert.match(loser.stderr,/auth.*users|relation "users"/);assert.equal(state.status,'withdrawn');assert.equal(state.version,2);assert.equal(state.bodyErased,true);assert.equal(state.audits,2);assert.equal(state.receipts,2);}
 else {assert.match(loser.stderr,/COMMUNITY_CONFLICT/);assert.doesNotMatch(loser.stderr,/deadlock|could not obtain lock/);assert.equal(results[withdrawWins?1:0].code,0);assert.equal(state.status,withdrawWins?'withdrawn':'published');assert.equal(state.version,2);assert.equal(state.bodyErased,withdrawWins);assert.equal(state.audits,withdrawWins?2:3);assert.equal(state.receipts,2);assert.equal(state.fence,withdrawWins?null:await db(`select encode(sha256(convert_to('${r.id}','UTF8')),'hex');`));assert.equal(state.j1Status,state.status);assert.equal(state.submissionVersion,state.version);assert.equal(state.safetyVersion,0);}
 console.log(JSON.stringify({case:expectDeadlock?'original-deadlock':withdrawWins?'fixed-withdraw-winner':'fixed-review-winner',winner:state.status,version:state.version,bodyErased:state.bodyErased,audits:state.audits,receipts:state.receipts,loser:expectDeadlock?'40P01 deadlock detected':'COMMUNITY_CONFLICT'}));
 }finally{if(!released)await g.release();if(rp||wp)await Promise.allSettled([rp,wp].filter(Boolean));await db('drop trigger fixture_frontier_barrier on community_private.submissions;drop function community_safety_private.fixture_frontier_barrier();');}
}
before(async()=>{
 if(!enabled)return;
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(r.code,0,r.stderr);created=true;
 for(let i=0;i<100;i++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));await db("alter table auth.users add column is_anonymous boolean default false;create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;");
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql') && f!==migration).sort())await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
 beforeBody=await db("select prosrc from pg_proc where oid='community_safety_private.source_frontier()'::regprocedure;");beforeAcl=await db("select coalesce(proacl::text,'null') from pg_proc where oid='community_safety_private.source_frontier()'::regprocedure;");beforeMeta=await db("select jsonb_build_object('oid',oid,'signature',oid::regprocedure::text,'owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef) from pg_proc where oid='community_safety_private.source_frontier()'::regprocedure;");await db('update community_private.settings set enabled=true;');
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
run('controlled original legacy withdraw/review reproduces source-frontier auth FK deadlock and exact CI persisted effect',async()=>{await controlledRace(true);});
run('append-only migration rollback/ACL and original roots remain exact; same controlled race returns COMMUNITY_CONFLICT',async()=>{
 const source=readFileSync('supabase/migrations/'+migration,'utf8');
 const rootsQuery="select jsonb_agg(jsonb_build_object('signature',oid::regprocedure::text,'owner',proowner,'acl',proacl,'body',prosrc) order by oid) from pg_proc where oid in('community_private.actor_j1()'::regprocedure,'community_private.current_actor()'::regprocedure,'public.community_workspace(jsonb)'::regprocedure);";
 const roots=await db(rootsQuery);
 await db('begin;'+source+'rollback;');assert.equal(await db("select prosrc from pg_proc where oid='community_safety_private.source_frontier()'::regprocedure;"),beforeBody);
 await db(source);assert.equal(await db("select coalesce(proacl::text,'null') from pg_proc where oid='community_safety_private.source_frontier()'::regprocedure;"),beforeAcl);assert.equal(await db(rootsQuery),roots);assert.equal(await db("select jsonb_build_object('oid',oid,'signature',oid::regprocedure::text,'owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef) from pg_proc where oid='community_safety_private.source_frontier()'::regprocedure;"),beforeMeta);
 await controlledRace(false);assert.equal(await db('select deadlocks from pg_stat_database where datname=current_database();'),'1');
});
run('reverse original withdrawal-first schedule preserves erased winner, exact audit/receipt counts and COMMUNITY_CONFLICT',async()=>{
 await controlledRace(false,true);assert.equal(await db('select deadlocks from pg_stat_database where datname=current_database();'),'1');
});
run('anonymized original reviewer fence survives; independent appeal, source erasure/grant revocation and physical delete remain qualified',async()=>{
 const a=await actor(),r=await actor(true),s=submit();await call(a,s);
 const j1=(v)=>({protocol:'community-j1/1',command:v,mutationBytes:['review','delete','withdraw'].includes(v.action)?JSON.stringify(v):null});
 const d={...review(s),decision:'reject'};await call(r,j1(d));const fence=await db(`select j1_operator_fence from community_safety_private.states where submission_id='${s.submissionId}';`);assert.equal(fence,await db(`select encode(sha256(convert_to('${r.id}','UTF8')),'hex');`));
 await call(r,j1({action:'delete',operationId:uuid(),confirmed:true}));assert.equal(await db(`select j1_operator_fence from community_safety_private.states where submission_id='${s.submissionId}';`),fence);assert.equal(await db(`select review_anonymized and reviewer_id is null from community_private.submissions where id='${s.submissionId}';`),'t');
 await db(`insert into community_private.reviewers values('${r.id}',true);insert into community_safety_private.moderators values('${r.id}',true);update community_safety_private.settings set enabled=true;`);
 const p={action:'appeal',operationId:uuid(),appealId:uuid(),submissionId:s.submissionId,expectedSubmissionVersion:2,expectedSafetyVersion:0,basis:'j1_rejection',statement:'Synthetic author appeal',consent:'internal-safety-v1'};
 const safety=v=>({protocol:'community-safety-j2/1',command:v,mutationBytes:JSON.stringify(v)});await call(a,safety(p));
 const ar={action:'appealReview',operationId:uuid(),appealId:p.appealId,expectedAppealVersion:1,expectedSubmissionVersion:2,expectedSafetyVersion:0,decision:'restore',note:'Original operator must not self-review'};
 const denied=await sql(container,query(r,safety(ar)));assert.notEqual(denied.code,0);assert.match(denied.stderr,/SAFETY_FORBIDDEN/);assert.equal(await db(`select count(*) from community_safety_private.operations where operation_id='${ar.operationId}';`),'0');
 const independent=await actor(true);await db(`insert into community_safety_private.moderators values('${independent.id}',true);`);
 const auditBefore=await db(`select count(*) from community_private.audit where submission_id='${s.submissionId}';`);
 await call(independent,safety({...ar,operationId:uuid(),note:'Independent retained-source restoration'}));
 const restored=await effect(s.submissionId);assert.equal(restored.status,'published');assert.equal(restored.version,2);assert.equal(restored.safetyVersion,1);assert.equal(await db(`select count(*) from community_private.audit where submission_id='${s.submissionId}';`),auditBefore);
 const currentFence=await db(`select encode(sha256(convert_to('${independent.id}','UTF8')),'hex');`);assert.equal(restored.fence,currentFence);
 await db(`insert into community_safety_private.controlled_readers values('${r.id}','${s.submissionId}',2,clock_timestamp()+interval '1 hour',false);`);
 await call(a,j1({action:'delete',operationId:uuid(),confirmed:true}));assert.equal(await db(`select j1_status='deleted' and submission_version=3 and j1_operator_fence='${currentFence}' from community_safety_private.states where submission_id='${s.submissionId}';`),'t');assert.equal(await db(`select revoked from community_safety_private.controlled_readers where actor_id='${r.id}' and submission_id='${s.submissionId}';`),'t');
 await db(`delete from auth.users where id='${a.id}';`);assert.equal(await db(`select author_id is null and j1_status='deleted' and submission_version=3 and j1_operator_fence='${currentFence}' from community_safety_private.states where submission_id='${s.submissionId}';`),'t');assert.equal(await db(`select count(*) from community_private.submissions where id='${s.submissionId}';`),'0');
});
