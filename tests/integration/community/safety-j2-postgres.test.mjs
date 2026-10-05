// Disposable network-none PG with synthetic claims; actual Auth HTTP is sole TS evidence.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
const reference=process.env.VP_COMMUNITY_SAFETY_TS_WIRE_ROOT?await import(pathToFileURL(resolve(process.env.VP_COMMUNITY_SAFETY_TS_WIRE_ROOT,'lib/server/community/safety/contract.ts')).href):null;
const enabled=process.env.VP_COMMUNITY_SAFETY_DB_TEST==='1';
const container='vpj64-j2-'+uuid().slice(0,8);let created=false,legacyBody,legacyACL;
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
const lit=s=>"'"+s.replaceAll("'","''")+"'";
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const claims=(a,over={})=>`set request.jwt.claim.sub='${a.id}';set request.jwt.claim.role='authenticated';set request.jwt.claims=${lit(JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session,...over}))};`;
const mutations=['report','disposition','appeal','appealReview','block','unblock','delete'];
const envelope=(v,bytes=mutations.includes(v.action)?JSON.stringify(v):null)=>({protocol:'community-safety-j2/1',command:v,mutationBytes:bytes});
const raw=(a,v,bytes,over={})=>sql(container,claims(a,over)+`set role authenticated;select public.community_workspace(${lit(JSON.stringify(envelope(v,bytes)))}::jsonb);`);
const call=async(a,v,bytes)=>{const r=await raw(a,v,bytes);assert.equal(r.code,0,r.stderr);const out=JSON.parse(r.stdout.trim());if(reference){assert.ok(reference.decodeSafetyOutcome(out),'canonical TS rejected '+out.kind+' '+JSON.stringify(out));assert.ok(reference.matchesSafetyOutcome(out,v,a.id,a.session),'canonical TS correlation rejected '+JSON.stringify(out));}return out;};
const denied=async(a,v,error,bytes,over)=>{const r=await raw(a,v,bytes,over);assert.notEqual(r.code,0);assert.match(r.stderr,error);};
const j1=async(a,v)=>JSON.parse(await db(claims(a)+`set role authenticated;select public.community_workspace(${lit(JSON.stringify({protocol:'community-j1/1',command:v,mutationBytes:['submit','review','withdraw','delete'].includes(v.action)?JSON.stringify(v):null}))}::jsonb);`));
const submit=()=>({action:'submit',operationId:uuid(),submissionId:uuid(),contentKind:'experience',title:'Private travel',content:'Original retained source',benefitDisclosure:'',place:null,consent:'internal-review-v1'});
const report=(s,sv=0)=>({action:'report',operationId:uuid(),reportId:uuid(),submissionId:s.submissionId,expectedSubmissionVersion:1,expectedSafetyVersion:sv,category:'rights',details:'Reporter private sensitive reason',consent:'internal-safety-v1'});
const disposition=(r,decision='remove',sv=0,version=1)=>({action:'disposition',operationId:uuid(),reportId:r.reportId,expectedReportVersion:1,expectedSubmissionVersion:version,expectedSafetyVersion:sv,decision,note:'My explicit safe decision note'});
const appeal=(s,sv=1,basis='safety_removal',version=1)=>({action:'appeal',operationId:uuid(),appealId:uuid(),submissionId:s.submissionId,expectedSubmissionVersion:version,expectedSafetyVersion:sv,basis,statement:'Author private appeal statement',consent:'internal-safety-v1'});
const reviewAppeal=(p,decision='restore')=>({action:'appealReview',operationId:uuid(),appealId:p.appealId,expectedAppealVersion:1,expectedSubmissionVersion:p.expectedSubmissionVersion,expectedSafetyVersion:p.expectedSafetyVersion,decision,note:'Independent retained-source review'});
const block=s=>({action:'block',operationId:uuid(),blockId:uuid(),submissionId:s.submissionId,expectedSubmissionVersion:1,expectedSafetyVersion:0});
const operation=(s,action='operation',bytes=JSON.stringify(s))=>({action,operationId:s.operationId,mutationBytes:bytes});
const erase=()=>({action:'delete',operationId:uuid(),confirmed:true});
async function actor({j1Reviewer=false,moderator=false,native=true}={}){const a={id:uuid(),session:uuid()};await db(`insert into auth.users(id,is_anonymous) values('${a.id}',false);insert into auth.sessions(id,user_id) values('${a.session}','${a.id}');${native?`insert into identity_private.mobile_accounts(owner_id,epoch,session_id) values('${a.id}',1,'${a.session}');insert into identity_private.mobile_attempts values('${a.id}','${uuid()}','${a.session}',1);`:''}${j1Reviewer?`insert into community_private.reviewers values('${a.id}',true);`:''}${moderator?`insert into community_safety_private.moderators values('${a.id}',true);`:''}`);return a;}
const grant=async(a,s,version=1)=>db(`insert into community_safety_private.controlled_readers values('${a.id}','${s.submissionId}',${version},clock_timestamp()+interval '1 minute',false);`);
const fixture=async()=>{await db('update community_private.settings set enabled=true;update community_safety_private.settings set enabled=true;');const author=await actor(),reader=await actor(),mod=await actor({j1Reviewer:true,moderator:true}),second=await actor({j1Reviewer:true,moderator:true}),s=submit();await j1(author,s);await grant(reader,s);return {author,reader,mod,second,s};};
before(async()=>{
 if(!enabled)return;
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
 assert.equal(r.code,0,r.stderr);created=true;
 assert.equal(JSON.parse((await command('docker',['inspect',container])).stdout)[0].HostConfig.NetworkMode,'none');
 for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 await db("alter table auth.users add column is_anonymous boolean default false;create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;grant usage on schema auth to authenticated;create schema extensions;create extension pgcrypto with schema extensions;");
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
 if(f==='20261005091000_community_safety_j2.sql'){
 legacyBody=await db("select prosrc from pg_proc where oid='public.community_workspace(jsonb)'::regprocedure;");legacyACL=await db("select proacl::text from pg_proc where oid='public.community_workspace(jsonb)'::regprocedure;");
 // Transaction rollback preserves exact pre-upgrade schema and source.
 await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'rollback;');
 assert.equal(await db("select prosrc from pg_proc where oid='public.community_workspace(jsonb)'::regprocedure;"),legacyBody);
 assert.equal(await db("select to_regclass('community_safety_private.operations') is null;"),'t');
 // Compatibility with the independently fixed J1 migration: its validation
 // guard is already IS NOT TRUE. Apply J2 without weakening or duplicating it.
 const j1GuardFix=`do $$declare body text;begin select prosrc into body from pg_proc where oid='community_private.workspace_j1(jsonb)'::regprocedure;body:=replace(body,'not community_private.valid_j1(envelope->''command'')','community_private.valid_j1(envelope->''command'') is not true');execute format('create or replace function community_private.workspace_j1(envelope jsonb) returns jsonb language plpgsql security definer set search_path=%L set timezone=%L as %L','','UTC',body);end $$;`;
 assert.equal(await db('begin;'+j1GuardFix+readFileSync('supabase/migrations/'+f,'utf8')+"select position('community_private.valid_j1(envelope->''command'') is not true' in prosrc)>0 from pg_proc where oid='community_private.workspace_j1(jsonb)'::regprocedure;rollback;"),'t');
 assert.equal(await db("select prosrc from pg_proc where oid='public.community_workspace(jsonb)'::regprocedure;"),legacyBody);
 }
 await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
 }
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
run('full migration rollback preserves original RPC owner ACL; defaults empty with no private grants',async()=>{
 assert.equal(await db("select proacl::text from pg_proc where oid='public.community_workspace(jsonb)'::regprocedure;"),legacyACL);
 for(const role of ['anon','authenticated','service_role']){
 for(const table of ['settings','moderators','controlled_readers','states','reports','appeals','blocks','decisions','operations','audit'])assert.notEqual((await sql(container,`set role ${role};select * from community_safety_private.${table};`)).code,0);
 assert.notEqual((await sql(container,`set role ${role};select community_safety_private.workspace('{}');`)).code,0);
 }
 assert.equal(await db('select enabled from community_safety_private.settings;'),'f');assert.equal(await db('select count(*) from community_safety_private.moderators;'),'0');assert.equal(await db('select count(*) from community_safety_private.controlled_readers;'),'0');
 const a=await actor();await denied(a,{action:'objects',cursor:null},/SAFETY_DISABLED/);assert.equal((await call(a,{action:'export'})).coverage,'complete_for_community_safety');
 await db('update community_private.settings set enabled=true;update community_safety_private.settings set enabled=true;');
});
run('authority before all reads mutation replay abandonment erasure has zero writes',async()=>{
 const f=await fixture(),r=report(f.s);await call(f.reader,r);const before=await db(`select row_to_json(x)::text from community_safety_private.reports x where id='${r.reportId}';`);
 for(const v of [{action:'read',collection:'reports',id:r.reportId},r,operation(r),operation(report(f.s),'abandon'),erase()])await denied(f.reader,v,/UNAUTHENTICATED/,undefined,{is_anonymous:true});
 await db(`update identity_private.mobile_accounts set epoch=2,session_id=null where owner_id='${f.reader.id}';`);await denied(f.reader,erase(),/SESSION_REPLACED/);assert.equal(await db(`select row_to_json(x)::text from community_safety_private.reports x where id='${r.reportId}';`),before);
 const web=await actor({native:false});assert.equal((await call(web,{action:'session'})).kind,'session');
});
run('legitimate independent reader vs moderator; guesses expiry revocation and block metadata deny uniformly',async()=>{
 const f=await fixture(),outsider=await actor(),modOnly=await actor({moderator:true});
 const o=(await call(f.reader,{action:'object',submissionId:f.s.submissionId})).object;assert.equal(o.authorDisclosure,'unknown');assert.equal(o.copyright,'unknown');assert.equal(Object.hasOwn(o,'authorId'),false);
 await denied(outsider,{action:'object',submissionId:f.s.submissionId},/SAFETY_NOT_FOUND/);await denied(modOnly,{action:'object',submissionId:f.s.submissionId},/SAFETY_NOT_FOUND/);
 await db(`update community_safety_private.controlled_readers set expires_at=clock_timestamp()-interval '1 second' where actor_id='${f.reader.id}';`);await denied(f.reader,report(f.s),/SAFETY_NOT_FOUND/);
 await db(`update community_safety_private.controlled_readers set expires_at=clock_timestamp()+interval '1 minute',revoked=true where actor_id='${f.reader.id}';`);await denied(f.reader,block(f.s),/SAFETY_NOT_FOUND/);
 await db(`update community_safety_private.controlled_readers set revoked=false where actor_id='${f.reader.id}';`);const b=block(f.s);await call(f.reader,b);
 await denied(f.reader,{action:'object',submissionId:f.s.submissionId},/SAFETY_NOT_FOUND/);assert.equal((await call(f.reader,{action:'objects',cursor:null})).objects.length,0);
 const own=(await call(f.reader,{action:'read',collection:'blocks',id:b.blockId})).record;assert.equal(Object.hasOwn(own,'targetId'),false);assert.equal(Object.hasOwn(own,'authorId'),false);
 await call(f.reader,{action:'unblock',operationId:uuid(),blockId:b.blockId,expectedVersion:1});assert.equal((await call(f.reader,{action:'object',submissionId:f.s.submissionId})).object.id,f.s.submissionId);
 await denied(f.author,block(f.s),/SAFETY_FORBIDDEN/);
});
run('report sensitive body isolation author minimal disposition and independent conflict operators',async()=>{
 const f=await fixture(),r=report(f.s);await call(f.reader,r);
 await denied(f.author,{action:'read',collection:'reports',id:r.reportId},/SAFETY_NOT_FOUND/);assert.deepEqual((await call(f.author,{action:'export'})).reports,[]);
 await db(`insert into community_safety_private.moderators values('${f.author.id}',true),('${f.reader.id}',true);`);
 await denied(f.author,disposition(r),/SAFETY_FORBIDDEN/);await denied(f.reader,disposition(r),/SAFETY_FORBIDDEN/);
 assert.deepEqual((await call(f.author,{action:'queue',collection:'reports',cursor:null})).records.filter(x=>x.id===r.reportId),[]);await denied(f.reader,{action:'inspect',collection:'reports',id:r.reportId},/SAFETY_NOT_FOUND/);
 await call(f.mod,disposition(r));const d=(await call(f.author,{action:'read',collection:'dispositions',id:f.s.submissionId})).record;
 assert.equal(d.state,'removed');assert.equal(d.safetyVersion,1);assert.equal(JSON.stringify(d).includes('Reporter private'),false);assert.equal(Object.hasOwn(d,'reportId'),false);
 assert.equal((await call(f.reader,{action:'read',collection:'reports',id:r.reportId})).record.state,'removed');
 await denied(f.mod,{action:'object',submissionId:f.s.submissionId},/SAFETY_NOT_FOUND/);
});
run('removal invalidates old J1 live read mine queue and committed exact-byte acknowledgements',async()=>{
 const f=await fixture(),r=report(f.s);await call(f.reader,r);await call(f.mod,disposition(r));
 for(const a of [f.author,f.mod])for(const v of [{action:'read',submissionId:f.s.submissionId},{action:'inspect',submissionId:f.s.submissionId},...(a===f.author?[operation(f.s)]:[])]){
 const res=await sql(container,claims(a)+`set role authenticated;select public.community_workspace(${lit(JSON.stringify({protocol:'community-j1/1',command:v,mutationBytes:null}))}::jsonb);`);assert.notEqual(res.code,0);assert.match(res.stderr,/COMMUNITY_NOT_FOUND|COMMUNITY_FORBIDDEN/);
 }
 assert.equal((await j1(f.author,{action:'mine',cursor:null})).submissions.some(x=>x.id===f.s.submissionId),false);
 assert.equal((await j1(f.mod,{action:'queue',cursor:null})).submissions.some(x=>x.id===f.s.submissionId),false);
 // Owner data exit remains complete and isolated despite live visibility denial.
 assert.equal((await j1(f.author,{action:'export'})).submissions.find(x=>x.id===f.s.submissionId).content,'Original retained source');
});
run('author recourse independent restore rechecks current retained source; withdrawal cannot resurrect',async()=>{
 const f=await fixture(),r=report(f.s);await call(f.reader,r);await call(f.mod,disposition(r));const p=appeal(f.s);await call(f.author,p);
 await denied(f.mod,reviewAppeal(p),/SAFETY_FORBIDDEN/);await db(`insert into community_safety_private.moderators values('${f.reader.id}',true);`);await denied(f.reader,reviewAppeal(p),/SAFETY_FORBIDDEN/);
 await call(f.second,reviewAppeal(p));const o=(await call(f.author,{action:'object',submissionId:f.s.submissionId})).object;assert.equal(o.safetyVersion,2);assert.equal(o.content,'Original retained source');assert.equal(o.publiclyVisible,false);
 const r2=report(f.s,2);await call(f.reader,r2);await call(f.mod,disposition(r2,'remove',2));const p2=appeal(f.s,3);await call(f.author,p2);
 await j1(f.author,{action:'withdraw',operationId:uuid(),submissionId:f.s.submissionId,expectedVersion:1});await denied(f.second,reviewAppeal(p2),/SAFETY_NOT_FOUND/);
 assert.equal((await call(f.author,{action:'read',collection:'dispositions',id:f.s.submissionId})).record.appealable,false);assert.equal((await j1(f.author,operation(f.s))).submission.content,'');
});
run('J1 rejected version2 restore requires both qualifications and distinct original reviewer; no old unique audit clash',async()=>{
 const f=await fixture();await j1(f.mod,{action:'review',operationId:uuid(),submissionId:f.s.submissionId,expectedVersion:1,decision:'reject',note:'J1 rejection'});
 const p=appeal(f.s,0,'j1_rejection',2);await call(f.author,p);await denied(f.mod,reviewAppeal(p),/SAFETY_FORBIDDEN/);
 const one=await actor({moderator:true});await grant(one,f.s,2);await denied(one,reviewAppeal(p),/SAFETY_FORBIDDEN/);
 const before=await db(`select count(*) from community_private.audit where submission_id='${f.s.submissionId}';`);
 await call(f.second,reviewAppeal(p));const c=(await j1(f.author,{action:'read',submissionId:f.s.submissionId})).submission;assert.equal(c.status,'published');assert.equal(c.version,2);
 assert.equal(await db(`select count(*) from community_private.audit where submission_id='${f.s.submissionId}';`),before);assert.equal((await call(f.author,{action:'read',collection:'dispositions',id:f.s.submissionId})).record.safetyVersion,1);
});
run('authored decisions/grants export complete with no foreign details; erasure retains foreign source state and independence fence',async()=>{
 const f=await fixture(),r=report(f.s),d=disposition(r);await call(f.reader,r);await call(f.mod,d);
 const exp=await call(f.mod,{action:'export'});assert.equal(exp.authoredDecisions.find(x=>x.recordId===r.reportId).note,d.note);assert.equal(exp.authoredDecisions[0].kind,'report');assert.equal(exp.reports.length,0);assert.equal(JSON.stringify(exp).includes('Reporter private'),false);
 const re=await call(f.reader,{action:'export'});assert.equal(re.readerGrants[0].submissionId,f.s.submissionId);assert.equal(re.readerGrants[0].submissionVersion,1);
 const before=await db(`select title||content from community_private.submissions where id='${f.s.submissionId}';`);await call(f.mod,erase());assert.equal((await call(f.mod,{action:'export'})).authoredDecisions.length,0);
 assert.equal(await db(`select title||content from community_private.submissions where id='${f.s.submissionId}';`),before);assert.equal((await call(f.reader,{action:'read',collection:'reports',id:r.reportId})).record.note,null);
 const p=appeal(f.s);await call(f.author,p);await db(`insert into community_safety_private.moderators values('${f.mod.id}',true);`);await denied(f.mod,reviewAppeal(p),/SAFETY_FORBIDDEN/);
 await call(f.reader,erase());assert.equal((await call(f.reader,{action:'export'})).readerGrants.length,0);assert.equal((await call(f.reader,operation(r))).record.details,null);
});
run('exact original bytes immutable session epoch operation fences abandoned replay and module-off erasure',async()=>{
 const f=await fixture(),r=report(f.s),bytes=JSON.stringify(r);await call(f.reader,r,bytes);
 await denied(f.reader,operation(r,'operation',bytes+' '),/SAFETY_CONFLICT/);assert.equal((await call(f.reader,operation(r))).state,'committed');
 const pending=report(f.s),unknown=operation(pending,'abandon');await call(f.reader,unknown);await denied(f.reader,pending,/SAFETY_OPERATION_ABANDONED/);
 await db('update community_safety_private.settings set enabled=false;');assert.equal((await call(f.reader,{action:'export'})).readerGrants.length,1);await call(f.reader,erase());assert.equal((await call(f.reader,operation(r))).record.state,'erased');
 await denied(f.reader,report(f.s),/SAFETY_DISABLED/);await db('update community_safety_private.settings set enabled=true;');
 await db(`update auth.sessions set user_id='${f.author.id}' where id='${f.reader.session}';`);await denied(f.reader,operation(r),/SESSION_REPLACED/);
});
run('physical source/account deletion invalidates content while retaining independent sensitive records and removing own authored notes',async()=>{
 const f=await fixture(),r=report(f.s);await call(f.reader,r);await call(f.mod,disposition(r));
 await db(`delete from auth.users where id='${f.mod.id}';`);assert.equal((await call(f.reader,{action:'read',collection:'reports',id:r.reportId})).record.note,null);
 await db(`delete from auth.users where id='${f.author.id}';`);assert.equal((await call(f.reader,{action:'read',collection:'reports',id:r.reportId})).record.details,r.details);await denied(f.second,{action:'object',submissionId:f.s.submissionId},/SAFETY_NOT_FOUND/);
 assert.equal(await db(`select j1_status from community_safety_private.states where submission_id='${f.s.submissionId}';`),'deleted');
});
run('CAS competing independent dispositions, original withdrawal and erasure races produce no deadlock or resurrection',async()=>{
 const f=await fixture(),r=report(f.s);await call(f.reader,r);
 const race=await Promise.all([raw(f.mod,disposition(r)),raw(f.second,disposition(r,'dismiss'))]);assert.equal(race.filter(x=>x.code===0).length,1);for(const x of race.filter(x=>x.code!==0))assert.match(x.stderr,/SAFETY_CONFLICT|could not obtain lock/);
 const g=await fixture(),rr=report(g.s);await call(g.reader,rr);
 const w={action:'withdraw',operationId:uuid(),submissionId:g.s.submissionId,expectedVersion:1};
 const results=await Promise.all([raw(g.mod,disposition(rr)),sql(container,claims(g.author)+`set role authenticated;select public.community_workspace(${lit(JSON.stringify({protocol:'community-j1/1',command:w,mutationBytes:JSON.stringify(w)}))}::jsonb);`)]);
 assert.ok(results.some(x=>x.code===0));for(const x of results.filter(x=>x.code!==0))assert.match(x.stderr,/SAFETY_NOT_FOUND|could not obtain lock/);
 await j1(g.author,w);assert.equal((await j1(g.author,operation(g.s))).submission.content,'');
 const er=erase(),contend=await Promise.all([raw(g.reader,er),raw(g.mod,erase())]);assert.ok(contend.some(x=>x.code===0));for(const x of contend.filter(x=>x.code!==0))assert.match(x.stderr,/could not obtain lock/);
 assert.equal(await db('select deadlocks from pg_stat_database where datname=current_database();'),'0');
});
run('bounded keyset51 sentinel and each100+sentinel export fails closed without false completeness',async()=>{
 const a=await actor(),s=submit();await j1(a,s);const other=await actor();
 await db(`insert into community_safety_private.blocks(id,owner_id,target_id,submission_id,state,version,ended_at) select gen_random_uuid(),'${a.id}','${other.id}','${s.submissionId}','unblocked',2,clock_timestamp() from generate_series(1,101);`);
 const page=await call(a,{action:'mine',collection:'blocks',cursor:null});assert.equal(page.records.length,50);assert.equal(page.complete,false);assert.equal(page.nextCursor,page.records.at(-1).id);
 const page2=await call(a,{action:'mine',collection:'blocks',cursor:page.nextCursor});assert.equal(page2.records.length,50);const page3=await call(a,{action:'mine',collection:'blocks',cursor:page2.nextCursor});assert.equal(page3.records.length,1);assert.equal(page3.complete,true);
 await denied(a,{action:'export'},/SAFETY_CAPACITY/);
 const b=await actor();await db(`insert into community_safety_private.decisions(id,actor_id,record_id,action,decision,note) select gen_random_uuid(),'${b.id}',gen_random_uuid(),'disposition','dismiss','Own retained note' from generate_series(1,101);`);await denied(b,{action:'export'},/SAFETY_CAPACITY/);
 const c=await actor();await db(`insert into community_safety_private.controlled_readers(actor_id,submission_id,submission_version,expires_at,revoked) select '${c.id}',gen_random_uuid(),1,clock_timestamp()-interval '1 second',true from generate_series(1,101);`);await denied(c,{action:'export'},/SAFETY_CAPACITY/);
});
run('erasure rollback is atomic and source/operator deletion never unlocks an original-reviewer appeal',async()=>{
 const f=await fixture(),r=report(f.s);await call(f.reader,r);
 const before=await db(`select row_to_json(x)::text from community_safety_private.reports x where id='${r.reportId}';`);
 await db(`create function community_safety_private.fixture_reject_erase() returns trigger language plpgsql as $$begin if new.state='erased' then raise exception 'FIXTURE_ROLLBACK';end if;return new;end$$;create trigger fixture_reject_erase before update on community_safety_private.reports for each row execute function community_safety_private.fixture_reject_erase();`);
 const e=erase();await denied(f.reader,e,/FIXTURE_ROLLBACK/);assert.equal(await db(`select row_to_json(x)::text from community_safety_private.reports x where id='${r.reportId}';`),before);assert.equal(await db(`select count(*) from community_safety_private.operations where operation_id='${e.operationId}';`),'0');await db('drop trigger fixture_reject_erase on community_safety_private.reports;drop function community_safety_private.fixture_reject_erase();');
 await j1(f.mod,{action:'review',operationId:uuid(),submissionId:f.s.submissionId,expectedVersion:1,decision:'reject',note:'Prior J1 operator note'});
 await j1(f.mod,{action:'delete',operationId:uuid(),confirmed:true});await db(`insert into community_private.reviewers values('${f.mod.id}',true);`);
 const p=appeal(f.s,0,'j1_rejection',2);await call(f.author,p);await denied(f.mod,reviewAppeal(p),/SAFETY_FORBIDDEN/);await call(f.second,reviewAppeal(p));
 // A later J2 decision replaces latest state note; it must not hide retained
 // earlier J1-restoration attribution from its actual author's scoped erasure.
 await call(f.mod,disposition(r,'dismiss',1,2));
 await call(f.second,erase());assert.equal((await j1(f.author,{action:'read',submissionId:f.s.submissionId})).submission.reviewNote,null);assert.equal(await db(`select review_anonymized from community_private.submissions where id='${f.s.submissionId}';`),'t');
});
run('strict closed JSON raw UTF8 and UTF16 limits cannot write receipts; expired own grant export remains complete',async()=>{
 const f=await fixture(),r=report(f.s),before=await db(`select count(*) from community_safety_private.operations where owner_id='${f.reader.id}';`);
 await denied(f.reader,{...r,details:'😀'.repeat(501)},/INVALID_INPUT/);await denied(f.reader,{...r,expectedSafetyVersion:-1},/INVALID_INPUT/);await denied(f.reader,{...r,extra:true},/INVALID_INPUT/);await denied(f.reader,r, /INVALID_INPUT/,JSON.stringify({...r,details:'Different bytes'}));
 await denied(f.reader,operation(r,'abandon',' '.repeat(10001)+JSON.stringify(r)),/INVALID_INPUT/);assert.equal(await db(`select count(*) from community_safety_private.operations where owner_id='${f.reader.id}';`),before);
 await db(`update community_safety_private.controlled_readers set expires_at=clock_timestamp()-interval '1 minute',revoked=true where actor_id='${f.reader.id}';`);const exp=await call(f.reader,{action:'export'});assert.equal(exp.readerGrants[0].revoked,true);assert.ok(Date.parse(exp.readerGrants[0].expiresAt)<Date.now());
});
run('each report appeal disposition receipt audit array independently enforces complete bounded export',async()=>{
 for(const col of ['reports','appeals','dispositions','operations','audit']){
 const a=await actor();
 const q={reports:`insert into community_safety_private.reports(id,owner_id,submission_id,submission_version,safety_version,category,details) select gen_random_uuid(),'${a.id}',gen_random_uuid(),1,0,'other','Own reason' from generate_series(1,101);`,
 appeals:`insert into community_safety_private.appeals(id,owner_id,submission_id,submission_version,safety_version,basis,statement) select gen_random_uuid(),'${a.id}',gen_random_uuid(),1,0,'j1_rejection','Own appeal' from generate_series(1,101);`,
 dispositions:`insert into community_safety_private.states(submission_id,author_id,submission_version,j1_status) select gen_random_uuid(),'${a.id}',1,'pending' from generate_series(1,101);`,
 operations:`insert into community_safety_private.operations(owner_id,operation_id,session_id,session_epoch,input_digest,action,state) select '${a.id}',gen_random_uuid(),'${a.session}',1,repeat('a',64),'delete','abandoned' from generate_series(1,101);`,
 audit:`insert into community_safety_private.audit(actor_id,action) select '${a.id}','delete' from generate_series(1,101);`}[col];await db(q);await denied(a,{action:'export'},/SAFETY_CAPACITY/);
 }
});
run('legacy original RPC source and current controlled-reader qualification cannot resurrect blocked or revoked content',async()=>{
 const f=await fixture(),r=report(f.s);await call(f.reader,r);await call(f.mod,disposition(r));
 const legacy=await sql(container,claims(f.author)+`set role authenticated;select public.community_workspace('{"action":"mine"}');`);assert.equal(legacy.code,0,legacy.stderr);assert.equal(JSON.parse(legacy.stdout).submissions.some(x=>x.id===f.s.submissionId),false);
 const g=await fixture();await j1(g.mod,{action:'review',operationId:uuid(),submissionId:g.s.submissionId,expectedVersion:1,decision:'approve',note:'Visible original note'});const b={...block(g.s),expectedSubmissionVersion:2};await call(g.mod,b);
 const old={protocol:'community-j1/1',command:{action:'inspect',submissionId:g.s.submissionId},mutationBytes:null};const blocked=await sql(container,claims(g.mod)+`set role authenticated;select public.community_workspace(${lit(JSON.stringify(old))}::jsonb);`);assert.notEqual(blocked.code,0);assert.match(blocked.stderr,/COMMUNITY_NOT_FOUND/);
 await call(g.mod,{action:'unblock',operationId:uuid(),blockId:b.blockId,expectedVersion:1});await db(`update community_private.reviewers set active=false where actor_id='${g.mod.id}';`);
 await denied(g.mod,{action:'object',submissionId:g.s.submissionId},/SAFETY_NOT_FOUND/);const revoked=await sql(container,claims(g.mod)+`set role authenticated;select public.community_workspace(${lit(JSON.stringify(old))}::jsonb);`);assert.notEqual(revoked.code,0);assert.match(revoked.stderr,/COMMUNITY_FORBIDDEN/);
});
run('unavailable selected block target and exact receipt return only own null metadata, never cached source UUID',async()=>{
 const f=await fixture(),b=block(f.s);await call(f.reader,b);const r=report(f.s);await call(f.second,r);await call(f.mod,disposition(r));
 const removed=await call(f.reader,operation(b));assert.equal(removed.record.submissionId,null);assert.equal(removed.record.state,'blocked');await denied(f.reader,{action:'object',submissionId:f.s.submissionId},/SAFETY_NOT_FOUND/);
 await j1(f.author,{action:'withdraw',operationId:uuid(),submissionId:f.s.submissionId,expectedVersion:1});assert.equal((await call(f.reader,operation(b))).record.submissionId,null);
 await db(`delete from auth.users where id='${f.author.id}';`);assert.equal((await call(f.reader,operation(b))).record.submissionId,null);
 await call(f.reader,{action:'unblock',operationId:uuid(),blockId:b.blockId,expectedVersion:1});assert.equal((await call(f.reader,operation(b))).record.state,'unblocked');
});
run('SQL NULL validation fails closed before direct RPC writes for nullable discriminators or enum decisions',async()=>{
 const f=await fixture(),r=report(f.s),before=await db(`select count(*) from community_safety_private.operations where owner_id='${f.reader.id}';`);
 for(const v of [{...r,category:null},{...r,consent:null},{...r,action:null}])await denied(f.reader,v,/INVALID_INPUT/);
 assert.equal(await db(`select count(*) from community_safety_private.operations where owner_id='${f.reader.id}';`),before);
 await call(f.reader,r);await denied(f.mod,{...disposition(r),decision:null},/INVALID_INPUT/);assert.equal((await call(f.reader,{action:'read',collection:'reports',id:r.reportId})).record.state,'pending');
 const review={action:'review',operationId:uuid(),submissionId:f.s.submissionId,expectedVersion:1,decision:null,note:'Must never reject through SQL NULL'};
 const res=await sql(container,claims(f.mod)+`set role authenticated;select public.community_workspace(${lit(JSON.stringify({protocol:'community-j1/1',command:review,mutationBytes:JSON.stringify(review)}))}::jsonb);`);assert.notEqual(res.code,0);assert.match(res.stderr,/INVALID_INPUT/);
 assert.equal(await db(`select status from community_private.submissions where id='${f.s.submissionId}';`),'pending');assert.equal(await db(`select count(*) from community_private.operations_j1 where operation_id='${review.operationId}';`),'0');
});
run('unauthorized guessed source and stale versions yield uniform not-found before CAS without metadata oracle',async()=>{
 const f=await fixture(),outsider=await actor();
 for(const sv of [0,999])for(const version of [1,2]){
 for(const v of [{...report(f.s,sv),expectedSubmissionVersion:version},{...block(f.s),expectedSubmissionVersion:version,expectedSafetyVersion:sv},{...appeal(f.s,sv,'j1_rejection',version)}])await denied(outsider,v,/SAFETY_NOT_FOUND/);
 }
 await db(`update community_safety_private.controlled_readers set revoked=true where actor_id='${f.reader.id}';`);await denied(f.reader,{...report(f.s,999),expectedSubmissionVersion:2},/SAFETY_NOT_FOUND/);
 assert.equal(await db(`select count(*) from community_safety_private.operations where owner_id='${outsider.id}';`),'0');
});
