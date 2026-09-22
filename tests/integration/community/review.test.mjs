import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_COMMUNITY_DB_TEST==='1';
const container='vpj48-community-'+uuid().slice(0,8);
let created=false;
const run=(name,fn)=>test(name,{skip:!enabled},fn);
const db=async text=>{const r=await sql(container,text);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const literal=s=>"'"+s.replaceAll("'","''")+"'";
async function actor(reviewer=false){const a={id:uuid(),session:uuid()};await db(`insert into auth.users(id) values('${a.id}');insert into auth.sessions(id,user_id) values('${a.session}','${a.id}');${reviewer?`insert into community_private.reviewers values('${a.id}',true);`:''}`);return a;}
const raw=(a,input,claims={})=>sql(container,`set request.jwt.claim.sub='${a.id}';set request.jwt.claims=${literal(JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session,...claims}))};set role authenticated;select public.community_workspace(${literal(JSON.stringify(input))}::jsonb);`);
async function call(a,input){const r=await raw(a,input);assert.equal(r.code,0,r.stderr);return JSON.parse(r.stdout.trim());}
async function denied(a,input,error,claims){const r=await raw(a,input,claims);assert.notEqual(r.code,0);assert.ok(r.stderr.includes(error),r.stderr);}
const submit=()=>({action:'submit',operationId:uuid(),submissionId:uuid(),title:'Synthetic travel experience',content:'DO-NOT-EXPOSE-private-body',consent:'internal-review-v1'});
const review=(s,decision='approve')=>({action:'review',operationId:uuid(),submissionId:s.submissionId,expectedVersion:1,decision,note:'INTERNAL-ONLY review note'});
const withdraw=(s,version=2)=>({action:'withdraw',operationId:uuid(),submissionId:s.submissionId,expectedVersion:version});
before(async()=>{
 if(!enabled)return;
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
 assert.equal(r.code,0,r.stderr);created=true;
 assert.equal(JSON.parse((await command('docker',['inspect',container])).stdout)[0].HostConfig.NetworkMode,'none');
 let ready=false;for(let i=0;i<60;i++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0){ready=true;break;}await new Promise(r=>setTimeout(r,250));}assert.ok(ready);
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 // Real GoTrue has this column; the reused SQL-only identity fixture intentionally has just id.
 await db('alter table auth.users add column is_anonymous boolean default false;');
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
run('default closed, explicit reviewer qualification, live registered session and private ACL',async()=>{
 const author=await actor(),ops=await actor();
 await denied(author,{action:'mine'},'COMMUNITY_DISABLED');
 await db('update community_private.settings set enabled=true;');
 await db(`insert into knowledge_review_private.members(actor_id,active) values('${ops.id}',true);`);
 await denied(ops,{action:'queue'},'COMMUNITY_FORBIDDEN');
 await denied(author,{action:'mine'},'UNAUTHENTICATED',{is_anonymous:true});
 await denied(author,{action:'mine'},'UNAUTHENTICATED',{session_id:uuid()});
 assert.deepEqual(await call(author,{action:'mine'}),{submissions:[]});
 for(const role of ['anon','authenticated','service_role']) {
  assert.notEqual((await sql(container,`set role ${role};select * from community_private.submissions;`)).code,0);
  assert.notEqual((await sql(container,`set role ${role};select community_private.submission_json('${uuid()}',true);`)).code,0);
 }
 assert.notEqual((await sql(container,"set role anon;select public.community_workspace('{\"action\":\"mine\"}');")).code,0);
 assert.equal(await db("select count(*) from pg_tables where schemaname='community_private' and rowsecurity;"),'5');
});
run('author pending → independent internal publication → withdraw; projections and replay cannot resurrect body',async()=>{
 const a=await actor(),r=await actor(true),other=await actor();const s=submit();
 const first=await call(a,s);assert.equal(first.status,'pending');assert.equal(first.authorIdentity,'registered_user');
 for(const key of ['authorId','reviewerId','reviewNote','audit','reviewedAt']) assert.equal(Object.hasOwn(first,key),false);
 assert.equal(first.publiclyVisible,false);assert.equal(first.retrievalEligible,false);
 assert.deepEqual(await call(a,s),first);await denied(a,{...s,content:'changed'},'COMMUNITY_CONFLICT');
 assert.deepEqual((await call(other,{action:'mine'})).submissions,[]);
 await denied(other,withdraw(s,1),'COMMUNITY_NOT_FOUND');
 await denied(a,review(s),'COMMUNITY_FORBIDDEN');
 await db(`insert into community_private.reviewers values('${a.id}',true);`);await denied(a,review(s),'COMMUNITY_SELF_REVIEW');
 assert.ok((await call(r,{action:'queue'})).submissions.some(x=>x.id===s.submissionId));
 const decision=review(s);const published=await call(r,decision);assert.equal(published.status,'published');assert.equal(published.visibility,'internal');assert.equal(published.publiclyVisible,false);
 assert.deepEqual(published.audit.map(x=>x.action),['submitted','reviewed','published']);
 const mine=(await call(a,{action:'mine'})).submissions[0];assert.equal(mine.status,'published');assert.ok(!JSON.stringify(mine).includes('INTERNAL-ONLY'));assert.ok(!JSON.stringify(mine).includes(r.id));
 const w=withdraw(s);const gone=await call(a,w);assert.equal(gone.status,'withdrawn');assert.equal(gone.content,'');assert.equal(gone.title,'');assert.deepEqual(await call(a,w),gone);
 assert.equal((await call(a,s)).content,'');assert.equal((await call(r,decision)).content,'');
 assert.equal(await db(`select count(*) from community_private.receipts where submission_id='${s.submissionId}' and input_digest like '%DO-NOT-EXPOSE%';`),'0');
 await db(`update community_private.reviewers set active=false where actor_id='${r.id}';`);await denied(r,decision,'COMMUNITY_FORBIDDEN');
 await db(`delete from auth.sessions where id='${a.session}';`);await denied(a,s,'UNAUTHENTICATED');
});
run('rejection and pending withdrawal are terminal; forged body fields fail in direct RPC',async()=>{
 const a=await actor(),r=await actor(true);const s=submit();await call(a,s);
 assert.equal((await call(r,review(s,'reject'))).status,'rejected');assert.equal((await call(a,withdraw(s))).status,'withdrawn');
 const p=submit();await call(a,p);assert.equal((await call(a,withdraw(p,1))).status,'withdrawn');await denied(r,review(p),'COMMUNITY_CONFLICT');
 for(const change of [{authorId:r.id},{status:'published'},{consent:null},{title:' '},{content:'x'.repeat(4001)}])await denied(a,{...submit(),...change},'INVALID_INPUT');
 await denied(a,{action:'mine',authorId:r.id},'INVALID_INPUT');
});
run('opposing reviews and withdrawal/review race commit exactly one transition',async()=>{
 const a=await actor(),r=await actor(true),r2=await actor(true);const s=submit();await call(a,s);
 const results=await Promise.all([raw(r,review(s)),raw(r2,review(s,'reject'))]);assert.equal(results.filter(x=>x.code===0).length,1);assert.ok(results.find(x=>x.code!==0).stderr.includes('COMMUNITY_CONFLICT'));
 assert.equal(await db(`select count(*) from community_private.audit where submission_id='${s.submissionId}';`),'3');
 const p=submit();await call(a,p);const race=await Promise.all([raw(a,withdraw(p,1)),raw(r,review(p))]);assert.equal(race.filter(x=>x.code===0).length,1);
 assert.ok(race.find(x=>x.code!==0).stderr.includes('COMMUNITY_CONFLICT'));
});
run('audit fault rolls back content, transition and receipt; gate rollback denies saved data',async()=>{
 const a=await actor(),r=await actor(true);const s=submit();await call(a,s);const d=review(s);
 await db("create function community_private.fail_audit() returns trigger language plpgsql as $$begin raise exception 'synthetic audit failure';end$$;create trigger fail_audit before insert on community_private.audit for each row execute function community_private.fail_audit();");
 try {
  await denied(r,d,'synthetic audit failure');assert.equal(await db(`select status from community_private.submissions where id='${s.submissionId}';`),'pending');
  assert.equal(await db(`select count(*) from community_private.receipts where operation_id='${d.operationId}';`),'0');
  const failed=submit();await denied(a,failed,'synthetic audit failure');assert.equal(await db(`select count(*) from community_private.submissions where id='${failed.submissionId}';`),'0');
 }finally{await db('drop trigger fail_audit on community_private.audit;drop function community_private.fail_audit();');}
 await call(r,d);await db('update community_private.settings set enabled=false;');await denied(a,s,'COMMUNITY_DISABLED');await denied(r,d,'COMMUNITY_DISABLED');
 await db('update community_private.settings set enabled=true;');assert.equal((await call(a,s)).status,'published');
});
