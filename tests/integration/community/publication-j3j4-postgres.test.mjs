// Disposable network-none PostgreSQL / synthetic claims. GoTrue HTTP is sole TS-owned.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_COMMUNITY_PUBLICATION_DB_TEST==='1';
const wireRoot=process.env.VP_COMMUNITY_PUBLICATION_TS_WIRE_ROOT||process.cwd();
const reference=enabled?await import(pathToFileURL(resolve(wireRoot,'lib/server/community/publication/contract.ts')).href):null;
const container='vpj48-publication-'+uuid().slice(0,8);let created=false,priorBody,priorACL,priorOwner;
const migration='20261005092000_community_publication_j3j4.sql';
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
const lit=s=>"'"+s.replaceAll("'","''")+"'";
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const claims=(a,over={})=>`set request.jwt.claim.sub='${a.id}';set request.jwt.claim.role='authenticated';set request.jwt.claims=${lit(JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session,...over}))};`;
const mutations=['requestPublication','rightsReview','publish','withdraw','revoke','save','unsave','delete'];
const envelope=(v,bytes=mutations.includes(v.action)?JSON.stringify(v):null)=>({protocol:'community-publication-j3j4/1',command:v,mutationBytes:bytes});
const raw=(a,v,bytes,over={})=>sql(container,claims(a,over)+`set role authenticated;select public.community_workspace(${lit(JSON.stringify(envelope(v,bytes)))}::jsonb);`);
const call=async(a,v,bytes)=>{const r=await raw(a,v,bytes);assert.equal(r.code,0,r.stderr);const out=JSON.parse(r.stdout.trim());assert.ok(reference.decodePublicationOutcome(out),'canonical decoder rejected '+JSON.stringify(out));assert.ok(reference.matchesPublicationOutcome(out,v,a.id,a.session),'canonical correlation rejected '+JSON.stringify(out));return out;};
const denied=async(a,v,error,bytes,over)=>{const r=await raw(a,v,bytes,over);assert.notEqual(r.code,0);assert.match(r.stderr,error);};
const other=async(a,v,protocol)=>JSON.parse(await db(claims(a)+`set role authenticated;select public.community_workspace(${lit(JSON.stringify({protocol,command:v,mutationBytes:['submit','review','withdraw','delete','report','disposition','appeal','appealReview','block','unblock'].includes(v.action)?JSON.stringify(v):null}))}::jsonb);`));
const j1=(a,v)=>other(a,v,'community-j1/1');const j2=(a,v)=>other(a,v,'community-safety-j2/1');
const submit=()=>({action:'submit',operationId:uuid(),submissionId:uuid(),contentKind:'experience',title:'Controlled travel',content:'Retained experience body',benefitDisclosure:'No paid interest',place:null,consent:'internal-review-v1'});
const erase=()=>({action:'delete',operationId:uuid(),confirmed:true});
const operation=(v,action='operation',bytes=JSON.stringify(v))=>({action,operationId:v.operationId,mutationBytes:bytes});
const rights=(p,decision='approve')=>({action:'rightsReview',operationId:uuid(),publicationId:p.publicationId,expectedPublicationVersion:1,expectedSubmissionVersion:2,expectedSafetyVersion:0,decision,note:'Own text claim independently examined; no third-party asset authorization'});
const publish=p=>({action:'publish',operationId:uuid(),publicationId:p.publicationId,expectedPublicationVersion:2,expectedSubmissionVersion:2,expectedSafetyVersion:0});
const save=p=>({action:'save',operationId:uuid(),referenceId:uuid(),publicationId:p.publicationId,expectedPublicationVersion:3,expectedSubmissionVersion:2,expectedSafetyVersion:0});
const withdraw=p=>({action:'withdraw',operationId:uuid(),publicationId:p.publicationId,expectedPublicationVersion:3});
async function actor({reviewer=false,rightsReviewer=false,publisher=false,moderator=false,native=true}={}){
 const a={id:uuid(),session:uuid()};await db(`insert into auth.users(id,is_anonymous) values('${a.id}',false);insert into auth.sessions(id,user_id) values('${a.session}','${a.id}');${native?`insert into identity_private.mobile_accounts(owner_id,epoch,session_id) values('${a.id}',1,'${a.session}');insert into identity_private.mobile_attempts values('${a.id}','${uuid()}','${a.session}',1);`:''}${reviewer?`insert into community_private.reviewers values('${a.id}',true);`:''}${rightsReviewer||publisher?`insert into community_publication_private.qualifications values('${a.id}',${rightsReviewer},${publisher});`:''}${moderator?`insert into community_safety_private.moderators values('${a.id}',true);`:''}`);return a;
}
const grant=(a,s,version=2)=>db(`insert into community_safety_private.controlled_readers values('${a.id}','${s.submissionId}',${version},clock_timestamp()+interval '5 minutes',false) on conflict(actor_id,submission_id) do update set submission_version=excluded.submission_version,expires_at=excluded.expires_at,revoked=false;`);
async function fixture({requested=true,published=true}={}){
 await db('update community_private.settings set enabled=true;update community_safety_private.settings set enabled=true;update community_publication_private.settings set enabled=true;');
 const author=await actor(),reviewer=await actor({reviewer:true}),reader=await actor(),right=await actor({rightsReviewer:true}),publisher=await actor({publisher:true}),mod=await actor({reviewer:true,moderator:true}),second=await actor({reviewer:true,moderator:true}),s=submit();
 await j1(author,s);await j1(reviewer,{action:'review',operationId:uuid(),submissionId:s.submissionId,expectedVersion:1,decision:'approve',note:'Internal source review'});
 for(const a of [reader,right,publisher])await grant(a,s);
 const preview=(await call(author,{action:'preview',submissionId:s.submissionId})).preview;
 const p={action:'requestPublication',operationId:uuid(),publicationId:uuid(),submissionId:s.submissionId,expectedSubmissionVersion:2,expectedSafetyVersion:0,previewDigest:preview.previewDigest,consent:'controlled-preview-v1',rightsDeclaration:'own-text-v1'};
 let rr,pp;
 if(requested){await call(author,p);if(published){rr=rights(p);await call(right,rr);pp=publish(p);await call(publisher,pp);}}
 return {author,reviewer,reader,right,publisher,mod,second,s,p,preview,rr,pp};
}
const census=()=>db(`select jsonb_build_object('publications',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from community_publication_private.publications p),'references',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from community_publication_private.references r),'reviews',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from community_publication_private.rights_reviews x),'ops',(select coalesce(jsonb_agg(to_jsonb(x) order by owner_id,operation_id),'[]') from community_publication_private.operations x),'audit',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from community_publication_private.audit x));`);
const noEffects=async fn=>{const before=await census();await fn();assert.equal(await census(),before);};
before(async()=>{
 if(!enabled)return;
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
 assert.equal(r.code,0,r.stderr);created=true;assert.equal(JSON.parse((await command('docker',['inspect',container])).stdout)[0].HostConfig.NetworkMode,'none');
 for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 await db("alter table auth.users add column is_anonymous boolean default false;create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;grant usage on schema auth to authenticated;create schema extensions;create extension pgcrypto with schema extensions;");
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
 if(f===migration){
 priorBody=await db("select prosrc from pg_proc where oid='public.community_workspace(jsonb)'::regprocedure;");priorACL=await db("select proacl::text from pg_proc where oid='public.community_workspace(jsonb)'::regprocedure;");priorOwner=await db("select proowner from pg_proc where oid='public.community_workspace(jsonb)'::regprocedure;");
 await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'rollback;');
 assert.equal(await db("select prosrc from pg_proc where oid='public.community_workspace(jsonb)'::regprocedure;"),priorBody);assert.equal(await db("select to_regclass('community_publication_private.operations') is null;"),'t');
 }
 await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
 }
});
after(async()=>{if(created){const result=await command('docker',['rm','-f',container]);assert.equal(result.code,0,result.stderr);}});
run('full history replay rollback RPC exact prior body owner ACL and empty disabled defaults',async()=>{
 assert.equal(await db("select proacl::text from pg_proc where oid='public.community_workspace(jsonb)'::regprocedure;"),priorACL);
 assert.equal(await db("select proowner from pg_proc where oid='public.community_workspace(jsonb)'::regprocedure;"),priorOwner);
 const body=await db("select prosrc from pg_proc where oid='public.community_workspace(jsonb)'::regprocedure;");
 assert.equal(body.replace("if p_input->>'protocol'='community-publication-j3j4/1' then return community_publication_private.workspace(p_input);end if;\n  ",''),priorBody);
 assert.equal(await db('select enabled from community_publication_private.settings;'),'f');assert.equal(await db('select count(*) from community_publication_private.qualifications;'),'0');
 for(const role of ['anon','authenticated','service_role']){
 for(const table of ['settings','qualifications','publications','references','rights_reviews','operations','audit'])assert.notEqual((await sql(container,`set role ${role};select * from community_publication_private.${table};`)).code,0);
 assert.notEqual((await sql(container,`set role ${role};select community_publication_private.workspace('{}');`)).code,0);
 }
 assert.notEqual((await sql(container,"set role anon;select public.community_workspace('{}');")).code,0);
 const a=await actor();await denied(a,{action:'list',cursor:null,query:''},/PUBLICATION_DISABLED/);assert.equal((await call(a,{action:'export'})).coverage,'complete_for_community_publication');
});
run('complete preview consent independent rights publisher read search exact metadata save and unsave',async()=>{
 const f=await fixture();const detail=(await call(f.reader,{action:'detail',publicationId:f.p.publicationId})).experience;
 assert.equal(detail.content,f.s.content);assert.equal(detail.copyright,'author_declared_own_text_independently_reviewed');assert.equal(detail.authorDisclosure,'unknown');assert.equal(detail.publiclyVisible,false);assert.equal(detail.retrievalEligible,false);assert.equal(detail.place,null);
 assert.ok(Date.parse(detail.expiresAt)-Date.now()<=30000);
 const list=await call(f.reader,{action:'list',cursor:null,query:'Retained experience'});assert.ok(list.experiences.some(x=>x.id===f.p.publicationId));
 const saved=save(f.p);assert.equal((await call(f.reader,saved)).reference.availability,'current');
 assert.equal((await call(f.reader,{action:'reference',referenceId:saved.referenceId})).reference.experience.id,f.p.publicationId);
 assert.ok((await call(f.reader,{action:'saved',cursor:null})).references.some(x=>x.id===saved.referenceId));
 const stored=await db(`select row_to_json(r) from community_publication_private.references r where id='${saved.referenceId}';`);assert.equal(stored.includes(f.s.content),false);assert.equal(stored.includes('content'),false);
 await call(f.reader,{action:'unsave',operationId:uuid(),referenceId:saved.referenceId,expectedReferenceVersion:1});assert.equal((await call(f.reader,{action:'reference',referenceId:saved.referenceId})).reference.experience,null);
});
run('preview digest excludes TTL but binds exact body disclosures and reviewed revisions',async()=>{
 const f=await fixture({requested:false});const p2=(await call(f.author,{action:'preview',submissionId:f.s.submissionId})).preview;assert.equal(p2.previewDigest,f.preview.previewDigest);
 await denied(f.reader,{action:'preview',submissionId:f.s.submissionId},/PUBLICATION_NOT_FOUND/);
 await db(`update community_private.submissions set content='Changed approved text' where id='${f.s.submissionId}';`);
 await noEffects(()=>denied(f.author,f.p,/PUBLICATION_CONFLICT/));
 const fresh=(await call(f.author,{action:'preview',submissionId:f.s.submissionId})).preview;assert.notEqual(fresh.previewDigest,f.p.previewDigest);
 await call(f.author,{...f.p,previewDigest:fresh.previewDigest});
});
run('source reader authority is distinct from qualification and all independence fences survive J1 erasure',async()=>{
 const f=await fixture({published:false}),roleOnly=await actor({rightsReviewer:true,publisher:true});
 await noEffects(()=>denied(roleOnly,rights(f.p),/PUBLICATION_NOT_FOUND/));
 await db(`insert into community_publication_private.qualifications values('${f.author.id}',true,true),('${f.reviewer.id}',true,true);`);
 await noEffects(()=>denied(f.author,rights(f.p),/PUBLICATION_NOT_FOUND/));await noEffects(()=>denied(f.reviewer,rights(f.p),/PUBLICATION_NOT_FOUND/));
 assert.equal((await call(f.right,{action:'queue',cursor:null})).publications.some(x=>x.id===f.p.publicationId),true);
 await call(f.right,rights(f.p));await db(`update community_publication_private.qualifications set publisher=true where actor_id='${f.right.id}';`);
 await noEffects(()=>denied(f.right,publish(f.p),/PUBLICATION_NOT_FOUND/));
 await j1(f.reviewer,erase());assert.equal((await call(f.author,{action:'mine',cursor:null})).publications.find(x=>x.id===f.p.publicationId).state,'invalidated');
 await db(`insert into community_private.reviewers values('${f.reviewer.id}',true);`);
 await noEffects(()=>denied(f.reviewer,{...rights(f.p),expectedPublicationVersion:3},/PUBLICATION_NOT_FOUND/));
});
run('current registered-reader expiry revocation block and UUID probes deny before CAS with zero effects',async()=>{
 const f=await fixture(),outsider=await actor();const s=save(f.p);
 await noEffects(()=>denied(outsider,{...s,expectedPublicationVersion:999},/PUBLICATION_NOT_FOUND/));
 await noEffects(()=>denied(outsider,{...withdraw(f.p),expectedPublicationVersion:999},/PUBLICATION_NOT_FOUND/));
 await denied(outsider,{action:'detail',publicationId:f.p.publicationId},/PUBLICATION_NOT_FOUND/);
 await db(`update community_safety_private.controlled_readers set expires_at=clock_timestamp()-interval '1 second' where actor_id='${f.reader.id}';`);
 await noEffects(()=>denied(f.reader,s,/PUBLICATION_NOT_FOUND/));
 await grant(f.reader,f.s);await call(f.reader,s);
 await db(`update community_safety_private.controlled_readers set revoked=true where actor_id='${f.reader.id}';`);
 assert.equal((await call(f.reader,operation(s))).reference.experience,null);assert.deepEqual((await call(f.reader,{action:'list',cursor:null,query:''})).experiences,[]);
 await grant(f.reader,f.s);await j2(f.reader,{action:'block',operationId:uuid(),blockId:uuid(),submissionId:f.s.submissionId,expectedSubmissionVersion:2,expectedSafetyVersion:0});
 await denied(f.reader,{action:'detail',publicationId:f.p.publicationId},/PUBLICATION_NOT_FOUND/);assert.equal((await call(f.reader,{action:'reference',referenceId:s.referenceId})).reference.experience,null);
});
run('original auth session epoch anonymous and malformed NULL guards precede any cleanup or CAS',async()=>{
 const f=await fixture();const s=save(f.p);await call(f.reader,s);
 for(const v of [{action:'list',cursor:null,query:''},s,operation(s),operation({...s,operationId:uuid(),referenceId:uuid()},'abandon'),erase()])await noEffects(()=>denied(f.reader,v,/UNAUTHENTICATED/,undefined,{is_anonymous:true}));
 await db(`update identity_private.mobile_accounts set epoch=2,session_id=null where owner_id='${f.reader.id}';`);await noEffects(()=>denied(f.reader,erase(),/SESSION_REPLACED/));
 for(const [a,v] of [[f.author,{...f.p,consent:null}],[f.author,{...f.p,rightsDeclaration:null}],[f.right,{...rights(f.p),decision:null}],[f.right,{...rights(f.p),note:null}],[f.author,{...withdraw(f.p),expectedPublicationVersion:null}],[f.author,{action:'delete',operationId:uuid(),confirmed:null}]])await noEffects(()=>denied(a,v,/INVALID_INPUT/));
 const web=await actor({native:false});assert.equal((await call(web,{action:'session'})).kind,'session');
});
run('exact byte idempotency absent abandon replay session fence and unknown outcome resolution',async()=>{
 const f=await fixture({requested:false});const pretty=JSON.stringify(f.p,null,2);await call(f.author,f.p,pretty);
 assert.equal((await call(f.author,operation(f.p,'operation',pretty))).publication.state,'pending_rights');
 await noEffects(()=>denied(f.author,operation(f.p),/PUBLICATION_CONFLICT/));
 const p={...f.p,operationId:uuid(),publicationId:uuid()};assert.equal((await call(f.author,operation(p))).state,'absent');assert.equal((await call(f.author,operation(p,'abandon'))).state,'abandoned');
 await noEffects(()=>denied(f.author,p,/PUBLICATION_OPERATION_ABANDONED/));
 const second=uuid();await db(`insert into auth.sessions(id,user_id) values('${second}','${f.author.id}');update identity_private.mobile_accounts set session_id='${second}',epoch=2 where owner_id='${f.author.id}';insert into identity_private.mobile_attempts values('${f.author.id}','${uuid()}','${second}',2);`);
 await noEffects(()=>denied({...f.author,session:second},operation(f.p,'operation',pretty),/PUBLICATION_CONFLICT/));
});
run('withdraw revoke disabled rollback deny old detail search saved and committed body replay',async()=>{
 for(const action of ['withdraw','revoke']){
 const f=await fixture(),s=save(f.p);await call(f.reader,s);const v={...withdraw(f.p),action};await call(action==='withdraw'?f.author:f.publisher,v);
 await denied(f.reader,{action:'detail',publicationId:f.p.publicationId},/PUBLICATION_NOT_FOUND/);
 assert.equal((await call(f.reader,operation(s))).reference.experience,null);assert.equal((await call(f.reader,{action:'saved',cursor:null})).references.find(x=>x.id===s.referenceId).experience,null);
 assert.equal((await call(f.reader,{action:'list',cursor:null,query:f.s.content})).experiences.some(x=>x.id===f.p.publicationId),false);
 await noEffects(()=>denied(f.publisher,{...publish(f.p),operationId:uuid(),expectedPublicationVersion:4},/PUBLICATION_NOT_FOUND/));
 }
 const f=await fixture(),s=save(f.p);await call(f.reader,s);await db('update community_publication_private.settings set enabled=false;');
 assert.equal((await call(f.reader,{action:'reference',referenceId:s.referenceId})).reference.experience,null);await call(f.author,erase());assert.equal((await call(f.author,{action:'export'})).publications[0].state,'erased');
});
run('J1 withdrawal source physical deletion and reviewer account deletion preserve permanent denial tombstones',async()=>{
 for(const mode of ['withdraw','physical','reviewer']){
 const f=await fixture(),s=save(f.p);await call(f.reader,s);
 if(mode==='withdraw')await j1(f.author,{action:'withdraw',operationId:uuid(),submissionId:f.s.submissionId,expectedVersion:2});
 if(mode==='physical')await db(`delete from community_private.submissions where id='${f.s.submissionId}';`);
 if(mode==='reviewer')await db(`delete from auth.users where id='${f.reviewer.id}';`);
 const p=(await call(f.author,{action:'mine',cursor:null})).publications.find(x=>x.id===f.p.publicationId);assert.equal(p.state,'invalidated');
 await denied(f.reader,{action:'detail',publicationId:f.p.publicationId},/PUBLICATION_NOT_FOUND/);assert.equal((await call(f.reader,operation(s))).reference.experience,null);
 await db(`update community_safety_private.states set removed=false,j1_status='published' where submission_id='${f.s.submissionId}';`);assert.equal((await call(f.reader,{action:'reference',referenceId:s.referenceId})).reference.experience,null);
 }
});
run('J2 remove appeal restore cannot revive publication or silently rebind old reference',async()=>{
 const f=await fixture(),s=save(f.p);await call(f.reader,s);
 const report={action:'report',operationId:uuid(),reportId:uuid(),submissionId:f.s.submissionId,expectedSubmissionVersion:2,expectedSafetyVersion:0,category:'rights',details:'Own report note',consent:'internal-safety-v1'};await j2(f.reader,report);
 await j2(f.mod,{action:'disposition',operationId:uuid(),reportId:report.reportId,expectedReportVersion:1,expectedSubmissionVersion:2,expectedSafetyVersion:0,decision:'remove',note:'Source removed'});
 const appeal={action:'appeal',operationId:uuid(),appealId:uuid(),submissionId:f.s.submissionId,expectedSubmissionVersion:2,expectedSafetyVersion:1,basis:'safety_removal',statement:'Source appeal',consent:'internal-safety-v1'};await j2(f.author,appeal);
 await j2(f.second,{action:'appealReview',operationId:uuid(),appealId:appeal.appealId,expectedAppealVersion:1,expectedSubmissionVersion:2,expectedSafetyVersion:1,decision:'restore',note:'New independent restoration'});
 const preview=(await call(f.author,{action:'preview',submissionId:f.s.submissionId})).preview;const next={...f.p,operationId:uuid(),publicationId:uuid(),expectedSafetyVersion:2,previewDigest:preview.previewDigest};await call(f.author,next);
 await call(f.right,{...rights(next),expectedSafetyVersion:2});await call(f.publisher,{...publish(next),expectedSafetyVersion:2});
 assert.equal((await call(f.reader,{action:'detail',publicationId:next.publicationId})).experience.safetyVersion,2);
 await denied(f.reader,{action:'detail',publicationId:f.p.publicationId},/PUBLICATION_NOT_FOUND/);assert.equal((await call(f.reader,{action:'reference',referenceId:s.referenceId})).reference.experience,null);
});
run('rights/publisher revocation erasure and review deletion terminal forever under re-enrollment',async()=>{
 for(const mode of ['rights','publisher','rightsErase','publisherAccount','review']){
 const f=await fixture(),s=save(f.p);await call(f.reader,s);
 if(mode==='rights'||mode==='publisher'){const a=mode==='rights'?f.right:f.publisher;await db(`update community_publication_private.qualifications set ${mode==='rights'?'rights_reviewer':'publisher'}=false where actor_id='${a.id}';`);await db(`update community_publication_private.qualifications set ${mode==='rights'?'rights_reviewer':'publisher'}=true where actor_id='${a.id}';`);}
 if(mode==='rightsErase')await call(f.right,erase());
 if(mode==='publisherAccount')await db(`delete from auth.users where id='${f.publisher.id}';`);
 if(mode==='review')await db(`delete from community_publication_private.rights_reviews where id='${f.rr.operationId}';`);
 assert.equal((await call(f.author,{action:'mine',cursor:null})).publications[0].state,'invalidated');await denied(f.reader,{action:'detail',publicationId:f.p.publicationId},/PUBLICATION_NOT_FOUND/);assert.equal((await call(f.reader,operation(s))).reference.experience,null);
 }
});
run('scoped export includes authored foreign rights notes qualification receipts audits and metadata-only references',async()=>{
 const f=await fixture(),s=save(f.p);await call(f.reader,s);
 const author=await call(f.author,{action:'export'}),right=await call(f.right,{action:'export'}),reader=await call(f.reader,{action:'export'});
 assert.equal(author.publications.length,1);assert.equal(right.publications.length,0);assert.equal(right.authoredRightsReviews[0].note,f.rr.note);assert.deepEqual(right.qualification,{rightsReviewer:true,publisher:false});
 assert.equal(reader.references[0].experience,null);assert.equal(reader.references[0].availability,'unavailable');
 for(const x of [author,right,reader]){const value=JSON.stringify(x);assert.equal(value.includes(f.s.content),false);assert.equal(value.includes(f.s.title),false);assert.equal(value.includes(f.author.id)&&x.actorId!==f.author.id,false);}
 assert.equal(right.receipts[0].digest.length,64);assert.equal(right.audits.length,1);
});
run('scoped deletion erases declaration all authored notes qualifications links while exact receipts remain sanitized',async()=>{
 const f=await fixture(),s=save(f.p);await call(f.reader,s);
 await call(f.right,erase());const right=await call(f.right,{action:'export'});assert.deepEqual(right.authoredRightsReviews,[]);assert.equal(right.qualification,null);assert.equal(right.receipts.length,2);assert.equal(right.audits.length,1);
 assert.equal((await call(f.author,{action:'mine',cursor:null})).publications[0].rightsNote,null);
 await call(f.reader,erase());const reader=await call(f.reader,{action:'export'});assert.equal(reader.references[0].state,'erased');assert.equal(reader.references[0].publicationId,null);assert.equal((await call(f.reader,operation(s))).reference.experience,null);
 await call(f.author,erase());const own=(await call(f.author,{action:'export'})).publications[0];assert.equal(own.state,'erased');assert.equal(own.rightsDeclaration,null);assert.equal(own.rightsNote,null);
 const stored=await db(`select row_to_json(p) from community_publication_private.publications p where id='${f.p.publicationId}';`);assert.equal(stored.includes(f.rr.note),false);assert.equal(stored.includes(f.p.previewDigest),false);
});
run('100 plus sentinel on each retained export collection fails whole export without truncation',async()=>{
 for(const collection of ['publications','references','rights_reviews','operations','audit']){
 const a=await actor();let q;
 if(collection==='publications')q=`insert into community_publication_private.publications(id,owner_id,submission_id,submission_version,safety_version,j1_reviewer_fence,state,ended_at) select gen_random_uuid(),'${a.id}',gen_random_uuid(),2,0,'f','invalidated',clock_timestamp() from generate_series(1,101);`;
 if(collection==='references')q=`insert into community_publication_private.references(id,owner_id,submission_version,safety_version,publication_version) select gen_random_uuid(),'${a.id}',2,0,3 from generate_series(1,101);`;
 if(collection==='rights_reviews')q=`insert into community_publication_private.rights_reviews(id,actor_id,publication_id,decision,note) select gen_random_uuid(),'${a.id}',gen_random_uuid(),'approve','Owned note' from generate_series(1,101);`;
 if(collection==='operations')q=`insert into community_publication_private.operations(owner_id,operation_id,session_id,session_epoch,input_digest,action,state) select '${a.id}',gen_random_uuid(),'${a.session}',1,repeat('0',64),'delete','abandoned' from generate_series(1,101);`;
 if(collection==='audit')q=`insert into community_publication_private.audit(actor_id,action) select '${a.id}','delete' from generate_series(1,101);`;
 await db(q);await noEffects(()=>denied(a,{action:'export'},/PUBLICATION_CAPACITY/));
 }
});
run('ordered concurrent read publish withdraw erasure serialize or fail closed; retry cannot expose body',async()=>{
 const f=await fixture(),s=save(f.p);await call(f.reader,s);
 const outputs=await Promise.all([raw(f.reader,{action:'detail',publicationId:f.p.publicationId}),raw(f.author,withdraw(f.p))]);
 for(const output of outputs)if(output.code!==0)assert.match(output.stderr,/could not obtain lock|PUBLICATION_NOT_FOUND/);
 if(outputs[1].code!==0)await call(f.author,withdraw(f.p));
 await denied(f.reader,{action:'detail',publicationId:f.p.publicationId},/PUBLICATION_NOT_FOUND/);assert.equal((await call(f.reader,operation(s))).reference.experience,null);
 const g=await fixture({published:false});await call(g.right,rights(g.p));
 const result=await Promise.all([raw(g.publisher,publish(g.p)),raw(g.right,erase())]);
 for(const output of result)if(output.code!==0)assert.match(output.stderr,/could not obtain lock|PUBLICATION_NOT_FOUND|PUBLICATION_CONFLICT/);
 if(result[1].code!==0)await call(g.right,erase());
 await denied(g.reader,{action:'detail',publicationId:g.p.publicationId},/PUBLICATION_NOT_FOUND/);
});
run('rights rejection source J1 qualification revoke and owner inspection remain exact terminal metadata',async()=>{
 const f=await fixture({published:false});assert.equal((await call(f.author,{action:'inspect',publicationId:f.p.publicationId})).publication.state,'pending_rights');
 await call(f.right,rights(f.p,'reject'));await noEffects(()=>denied(f.publisher,publish(f.p),/PUBLICATION_NOT_FOUND/));
 assert.equal((await call(f.author,{action:'mine',cursor:null})).publications[0].state,'rights_rejected');
 const g=await fixture();await db(`update community_private.reviewers set active=false where actor_id='${g.reviewer.id}';`);await db(`update community_private.reviewers set active=true where actor_id='${g.reviewer.id}';`);
 await denied(g.reader,{action:'detail',publicationId:g.p.publicationId},/PUBLICATION_NOT_FOUND/);
});
run('ordinary 24k 10k original exactbytes supports escaped recovery outer above24k within49152',async()=>{
 const f=await fixture({requested:false});
 // Duplicate JSON action text is ignored by JSON.parse/jsonb but remains bound in exact bytes.
 // This exercises legal transport encoding rather than modifying mutation field limits.
 const bytes='{"action":"'+'界'.repeat(6800)+'",'+ '\t'.repeat(2500)+JSON.stringify(f.p).slice(1);
 assert.ok(bytes.length<=10000);assert.ok(Buffer.byteLength(bytes)<=24000);assert.deepEqual(JSON.parse(bytes),f.p);
 const recover=operation(f.p,'operation',bytes);const outer=JSON.stringify(recover);assert.ok(Buffer.byteLength(outer)>24000);assert.ok(Buffer.byteLength(outer)<=49152);
 assert.ok(reference.parsePublicationInput(recover));await call(f.author,f.p,bytes);assert.equal((await call(f.author,recover)).publication.id,f.p.publicationId);
 const another={...f.p,operationId:uuid(),publicationId:uuid()};const tooMany=' '.repeat(10001)+JSON.stringify(another);await noEffects(()=>denied(f.author,another,/INVALID_INPUT/,tooMany));
 await noEffects(()=>denied(f.author,operation(f.p,'operation',bytes+' '),/PUBLICATION_CONFLICT/));
});
run('pagination 51 sentinel uses sorted final returned cursor and complete pages for own metadata and saved refs',async()=>{
 const f=await fixture();
 await db(`insert into community_publication_private.references(id,owner_id,publication_id,submission_version,safety_version,publication_version) select gen_random_uuid(),'${f.reader.id}','${f.p.publicationId}',2,0,3 from generate_series(1,51);`);
 const page=await call(f.reader,{action:'saved',cursor:null});assert.equal(page.references.length,50);assert.equal(page.complete,false);assert.equal(page.nextCursor,page.references.at(-1).id);
 const last=await call(f.reader,{action:'saved',cursor:page.nextCursor});assert.equal(last.references.length,1);assert.equal(last.complete,true);
 assert.equal(new Set([...page.references,...last.references].map(x=>x.id)).size,51);
});
async function heldMutation(a,v,marker){
 const text=claims(a)+`begin;set role authenticated;select public.community_workspace(${lit(JSON.stringify(envelope(v)))}::jsonb);reset role;select pg_sleep(0.6),${lit(marker)};commit;`;
 const pending=sql(container,text);
 let held=false;for(let n=0;n<100;n++){if(await db(`select exists(select 1 from pg_stat_activity where wait_event='PgSleep' and position(${lit(marker)} in query)>0);`)==='t'){held=true;break;}await new Promise(r=>setTimeout(r,5));}
 assert.equal(held,true,'owned hold transaction never reached barrier');return {pending};
}
run('deterministic uncommitted withdrawal and J1 source erasure deny concurrent reads before commit then sanitized replay',async()=>{
 for(const mode of ['publication','source']){
 const f=await fixture(),s=save(f.p);await call(f.reader,s);let pending;
 if(mode==='publication')({pending}=await heldMutation(f.author,withdraw(f.p),'publication-owned-withdraw-hold'));
 else {
 const v={action:'delete',operationId:uuid(),confirmed:true};const bytes=JSON.stringify({protocol:'community-j1/1',command:v,mutationBytes:JSON.stringify(v)});
 pending=sql(container,claims(f.author)+`begin;set role authenticated;select public.community_workspace(${lit(bytes)}::jsonb);reset role;select pg_sleep(0.6),'publication-owned-source-hold';commit;`);
 let held=false;for(let n=0;n<100;n++){if(await db("select exists(select 1 from pg_stat_activity where wait_event='PgSleep' and position('publication-owned-source-hold' in query)>0);")==='t'){held=true;break;}await new Promise(r=>setTimeout(r,5));}assert.equal(held,true);
 }
 await denied(f.reader,{action:'detail',publicationId:f.p.publicationId},/could not obtain lock|PUBLICATION_NOT_FOUND/);
 const result=await pending;assert.equal(result.code,0,result.stderr);
 await denied(f.reader,{action:'detail',publicationId:f.p.publicationId},/PUBLICATION_NOT_FOUND/);assert.equal((await call(f.reader,operation(s))).reference.experience,null);
 }
});
run('legacy nullable benefit disclosure stays unknown and disclosure source changes invalidate consent permanently',async()=>{
 const f=await fixture({requested:false});await db(`update community_private.submissions set benefit_disclosure=null where id='${f.s.submissionId}';`);
 const preview=(await call(f.author,{action:'preview',submissionId:f.s.submissionId})).preview;assert.equal(preview.object.benefitDisclosure,null);
 const p={...f.p,previewDigest:preview.previewDigest};await call(f.author,p);await call(f.right,rights(p));await call(f.publisher,publish(p));
 assert.equal((await call(f.reader,{action:'detail',publicationId:p.publicationId})).experience.benefitDisclosure,null);
 await db(`insert into community_private.disclosures_j1(actor_id,disclosure) values('${f.author.id}','employee');`);
 await denied(f.reader,{action:'detail',publicationId:p.publicationId},/PUBLICATION_NOT_FOUND/);
 assert.equal((await call(f.author,{action:'mine',cursor:null})).publications[0].state,'invalidated');
});
run('canonical place projection uses original lawful mapping and never leaks private Trip reference or writes plan',async()=>{
 const f=await fixture({requested:false}),trip=uuid(),poi=uuid(),providerPoiId=uuid();
 await db(`insert into public.trips(id,owner_id,title) values('${trip}','${f.author.id}','Owned association');insert into public.canonical_pois(id,primary_name_en,primary_name_zh) values('${poi}','Fixture place','测试地点');insert into public.provider_poi_mappings(canonical_poi_id,provider,provider_poi_id,raw_name) values('${poi}','amap','${providerPoiId}','NO PROVIDER BODY');`);
 const selection={canonicalPoiId:poi,provider:'amap',providerPoiId},mapping=JSON.parse(await db(`select place_actions_private.mapping_v1(${lit(JSON.stringify(selection))}::jsonb);`));
 // Only this owned network-none fixture grants the accepted canonical Save RPC.
 await db('grant execute on function public.execute_place_action_v1(uuid,jsonb) to authenticated;');
 const cmd={action:'save',operationId:uuid(),expectedTripVersion:0,selection,expectedMappingDigest:mapping.digest,expectedSaveRevision:0};
 const saved=JSON.parse(await db(claims(f.author)+`set role authenticated;select public.execute_place_action_v1('${trip}',${lit(JSON.stringify(cmd))}::jsonb);`));
 const source={...submit(),place:{tripId:trip,placeReferenceId:saved.referenceId,expectedTripVersion:0,mappingDigest:mapping.digest}};
 await j1(f.author,source);await j1(f.reviewer,{action:'review',operationId:uuid(),submissionId:source.submissionId,expectedVersion:1,decision:'approve',note:'Saved-place source approved'});
 for(const a of [f.reader,f.right,f.publisher])await grant(a,source);
 const preview=(await call(f.author,{action:'preview',submissionId:source.submissionId})).preview,p={...f.p,submissionId:source.submissionId,previewDigest:preview.previewDigest};const before=await db(`select row_to_json(t) from public.trips t where id='${trip}';`);
 await call(f.author,p);await call(f.right,rights(p));await call(f.publisher,publish(p));const e=(await call(f.reader,{action:'detail',publicationId:p.publicationId})).experience;
 assert.deepEqual(e.place,{canonicalPoiId:poi,mappingDigest:mapping.digest,label:'Fixture place'});assert.equal(JSON.stringify(e).includes(trip),false);assert.equal(JSON.stringify(e).includes(saved.referenceId),false);
 assert.equal(await db(`select row_to_json(t) from public.trips t where id='${trip}';`),before);assert.equal(await db(`select count(*) from public.trip_proposals where trip_id='${trip}';`),'0');
 await db(`delete from public.provider_poi_mappings where canonical_poi_id='${poi}';`);assert.equal((await call(f.reader,{action:'detail',publicationId:p.publicationId})).experience.place,null);
});
run('owned auth account cascades erase author declaration reader links and foreign authored rights note without revival',async()=>{
 for(const mode of ['author','reader','rights']){
 const f=await fixture(),s=save(f.p);await call(f.reader,s);const a=mode==='author'?f.author:mode==='reader'?f.reader:f.right;
 await db(`delete from auth.users where id='${a.id}';`);
 assert.equal(await db(`select count(*) from community_publication_private.operations where owner_id='${a.id}';`),'0');
 assert.equal(await db(`select count(*) from community_publication_private.qualifications where actor_id='${a.id}';`),'0');
 if(mode==='reader'){
 assert.equal(await db(`select state||':'||(owner_id is null)::text||':'||(publication_id is null)::text from community_publication_private.references where id='${s.referenceId}';`),'erased:true:true');
 assert.equal((await call(f.author,{action:'mine',cursor:null})).publications[0].state,'published');
 }else{
 await denied(f.reader,{action:'detail',publicationId:f.p.publicationId},/PUBLICATION_NOT_FOUND/);assert.equal((await call(f.reader,operation(s))).reference.experience,null);
 if(mode==='author')assert.equal(await db(`select state||':'||(owner_id is null)::text||':'||(rights_declaration is null)::text||':'||(preview_digest is null)::text from community_publication_private.publications where id='${f.p.publicationId}';`),'erased:true:true:true');
 else {assert.equal(await db(`select count(*) from community_publication_private.rights_reviews where actor_id='${a.id}';`),'0');assert.equal((await call(f.author,{action:'mine',cursor:null})).publications[0].rightsNote,null);}
 }
 }
});
