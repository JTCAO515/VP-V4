// Owned network-none disposable SQL claims only; not actual GoTrue/JWT acceptance.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_COMMUNITY_DB_TEST==='1';
const container='vpj48-j1-'+uuid().slice(0,8);let created=false,legacyBody,legacyACL;
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
const lit=s=>"'"+s.replaceAll("'","''")+"'";
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const claims=(a,over={})=>`set request.jwt.claim.sub='${a.id}';set request.jwt.claim.role='authenticated';set request.jwt.claims=${lit(JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session,...over}))};`;
const envelope=(v,bytes=['submit','review','withdraw','delete'].includes(v.action)?JSON.stringify(v):null)=>({protocol:'community-j1/1',command:v,mutationBytes:bytes});
const raw=(a,v,bytes,over={})=>sql(container,claims(a,over)+`set role authenticated;select public.community_workspace(${lit(JSON.stringify(envelope(v,bytes)))}::jsonb);`);
const call=async(a,v,bytes)=>{const r=await raw(a,v,bytes);assert.equal(r.code,0,r.stderr);return JSON.parse(r.stdout.trim());};
const denied=async(a,v,error,bytes,over)=>{const r=await raw(a,v,bytes,over);assert.notEqual(r.code,0);assert.match(r.stderr,error);};
const submit=(over={})=>({action:'submit',operationId:uuid(),submissionId:uuid(),contentKind:'experience',title:'Travel 😀',content:'Private body',benefitDisclosure:'Self-reported interest',place:null,consent:'internal-review-v1',...over});
const review=(s,decision='approve')=>({action:'review',operationId:uuid(),submissionId:s.submissionId,expectedVersion:1,decision,note:'Explicit author-visible note'});
const withdraw=(s,expectedVersion=2)=>({action:'withdraw',operationId:uuid(),submissionId:s.submissionId,expectedVersion});
const operation=(s,action='operation',mutationBytes=JSON.stringify(s))=>({action,operationId:s.operationId,mutationBytes});
const erase=()=>({action:'delete',operationId:uuid(),confirmed:true});
async function actor(reviewer=false,native=true){const a={id:uuid(),session:uuid()};await db(`insert into auth.users(id,is_anonymous) values('${a.id}',false);insert into auth.sessions(id,user_id) values('${a.session}','${a.id}');${native?`insert into identity_private.mobile_accounts(owner_id,epoch,session_id) values('${a.id}',1,'${a.session}');insert into identity_private.mobile_attempts values('${a.id}','${uuid()}','${a.session}',1);`:''}${reviewer?`insert into community_private.reviewers values('${a.id}',true);`:''}`);return a;}
before(async()=>{
 if(!enabled)return;
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
 assert.equal(r.code,0,r.stderr);created=true;
 assert.equal(JSON.parse((await command('docker',['inspect',container])).stdout)[0].HostConfig.NetworkMode,'none');
 for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 await db("alter table auth.users add column is_anonymous boolean default false;create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;grant usage on schema auth to authenticated;create schema extensions;create extension pgcrypto with schema extensions;");
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
 if(f==='20261005090000_community_submission_j1.sql'){
 legacyBody=await db("select prosrc from pg_proc where oid='public.community_workspace(jsonb)'::regprocedure;");legacyACL=await db("select proacl::text from pg_proc where oid='public.community_workspace(jsonb)'::regprocedure;");
 // Transaction rollback preserves exact pre-upgrade schema and source.
 await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'rollback;');
 assert.equal(await db("select prosrc from pg_proc where oid='public.community_workspace(jsonb)'::regprocedure;"),legacyBody);
 assert.equal(await db("select to_regclass('community_private.operations_j1') is null;"),'t');
 }
 await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
 }
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
run('full migration replay rollback and unchanged signature ACL; module defaults and direct deny',async()=>{
 assert.equal(await db("select proacl::text from pg_proc where oid='public.community_workspace(jsonb)'::regprocedure;"),legacyACL);
 const body=await db("select prosrc from pg_proc where oid='public.community_workspace(jsonb)'::regprocedure;");assert.ok(body.endsWith(legacyBody.slice(legacyBody.indexOf('u:=community_private.current_actor();'))));
 for(const role of ['anon','authenticated','service_role']){
 assert.notEqual((await sql(container,`set role ${role};select * from community_private.operations_j1;`)).code,0);
 assert.notEqual((await sql(container,`set role ${role};select community_private.workspace_j1('{}');`)).code,0);
 }
 assert.notEqual((await sql(container,"set role anon;select public.community_workspace('{}');")).code,0);
 const a=await actor();await denied(a,{action:'mine',cursor:null},/COMMUNITY_DISABLED/);
 assert.equal((await call(a,{action:'session'})).kind,'session');assert.equal((await call(a,{action:'export'})).coverage,'complete_for_community');assert.equal((await call(a,{action:'mine',cursor:null})).kind,'page');
 assert.equal(await db('select count(*) from community_private.disclosures_j1;'),'0');
 await db('update community_private.settings set enabled=true;');
});
run('registered current-session roots precede reads mutation replay abandon or cleanup',async()=>{
 const a=await actor(),s=submit();await call(a,s);
 for(const v of [{action:'read',submissionId:s.submissionId},s,operation(s),operation(submit(),'abandon'),erase()])await denied(a,v,/UNAUTHENTICATED/,undefined,{is_anonymous:true});
 const previous=await db(`select row_to_json(c)::text from community_private.submissions c where id='${s.submissionId}';`);
 await db(`update identity_private.mobile_accounts set epoch=2,session_id=null where owner_id='${a.id}';`);
 await denied(a,erase(),/SESSION_REPLACED/);assert.equal(await db(`select row_to_json(c)::text from community_private.submissions c where id='${s.submissionId}';`),previous);
 const web=await actor(false,false);assert.equal((await call(web,{action:'mine',cursor:null})).kind,'page');
});
run('independent qualification trusted unknown disclosure owner isolation review withdraw replay',async()=>{
 const a=await actor(),r=await actor(true),foreign=await actor();const s=submit();const first=await call(a,s);
 assert.equal(first.submission.authorDisclosure,'unknown');assert.equal(first.submission.reviewerDisclosure,null);assert.equal(first.submission.publiclyVisible,false);
 await denied(foreign,{action:'read',submissionId:s.submissionId},/COMMUNITY_NOT_FOUND/);await denied(a,review(s),/COMMUNITY_FORBIDDEN/);
 await db(`insert into community_private.reviewers values('${a.id}',true);`);await denied(a,review(s),/COMMUNITY_SELF_REVIEW/);
 const rev=review(s);await call(r,rev);const item=(await call(a,{action:'read',submissionId:s.submissionId})).submission;
 assert.equal(item.reviewNote,rev.note);assert.equal(item.reviewerDisclosure,'unknown');assert.equal(item.status,'published');assert.equal(item.retrievalEligible,false);
 await db(`insert into community_private.disclosures_j1 values('${r.id}','employee');`);assert.equal((await call(a,{action:'read',submissionId:s.submissionId})).submission.reviewerDisclosure,'employee');
 await call(a,withdraw(s));assert.equal((await call(a,s)).submission.content,'');assert.equal((await call(r,rev)).submission.content,'');
 await db(`update community_private.reviewers set active=false where actor_id='${r.id}';`);await denied(r,operation(rev),/COMMUNITY_FORBIDDEN/);
 await denied(a,{...s,content:'changed'},/COMMUNITY_CONFLICT/);await denied(a,s,/COMMUNITY_CONFLICT/,JSON.stringify(s,null,2));
});
run('legacy notes stay private and original receipts are current safe metadata',async()=>{
 const a=await actor(),r=await actor(true);const s=submit();const old={action:'submit',operationId:s.operationId,submissionId:s.submissionId,title:s.title,content:s.content,consent:s.consent};
 const legacy=async(actor,v)=>{const out=await sql(container,claims(actor)+`set role authenticated;select public.community_workspace(${lit(JSON.stringify(v))}::jsonb);`);assert.equal(out.code,0,out.stderr);return JSON.parse(out.stdout.trim());};
 await legacy(a,old);const rev={...review(s),note:'LEGACY-INTERNAL-SECRET'};await legacy(r,rev);
 const item=(await call(a,{action:'read',submissionId:s.submissionId})).submission;assert.equal(item.contentKind,'unknown');assert.equal(item.reviewNote,null);assert.ok(!JSON.stringify(item).includes(rev.note));
 const exported=await call(a,{action:'export'});assert.equal(exported.receipts[0].action,'unknown');
 await call(a,erase());assert.equal((await legacy(a,old)).content,'');await denied(a,s,/COMMUNITY_CONFLICT/);
});
run('original exact bytes absent/abandon/commit closure and concurrent same-op race',async()=>{
 const a=await actor(),s=submit();assert.equal((await call(a,operation(s))).state,'absent');assert.equal((await call(a,operation(s,'abandon'))).state,'abandoned');await denied(a,s,/COMMUNITY_OPERATION_ABANDONED/);
 const x=submit();const race=await Promise.all([raw(a,x),raw(a,operation(x,'abandon'))]);
 // Account NOWAIT may reject one contender; retry exact bytes resolves the durable result.
 const status=await call(a,operation(x));assert.ok(['committed','abandoned'].includes(status.state));assert.ok(race.some(r=>r.code===0));
 if(status.state==='committed'){assert.equal((await call(a,operation(x,'abandon'))).state,'committed');assert.equal((await call(a,x)).submission.id,x.submissionId);}
 else await denied(a,x,/COMMUNITY_OPERATION_ABANDONED/);
 assert.equal(await db(`select count(*) from community_private.operations_j1 where owner_id='${a.id}' and operation_id='${x.operationId}';`),'1');
});
run('reject pending withdrawal stale versions strict syntax UTF16 and place reject',async()=>{
 const a=await actor(),r=await actor(true),s=submit();await call(a,s);await call(r,review(s,'reject'));await call(a,withdraw(s));
 const p=submit();await call(a,p);await call(a,withdraw(p,1));await denied(r,review(p),/COMMUNITY_CONFLICT/);
 for(const over of [{title:'😀'.repeat(81)},{content:'😀'.repeat(2001)},{title:'\u00a0'},{staff:true},{place:{tripId:uuid(),placeReferenceId:uuid()}}])await denied(a,submit(over),/INVALID_INPUT|COMMUNITY_PLACE_UNAVAILABLE/);
 const ok=submit({title:'😀'.repeat(80),content:'😀'.repeat(2000)});await call(a,ok);
});
run('owner delete atomic rollback module-off revoked cleanup foreign attribution no revival',async()=>{
 const a=await actor(true),b=await actor(),own=submit(),foreign=submit();await call(a,own);await call(b,foreign);const rev=review(foreign,'reject');await call(a,rev);
 await db(`update community_private.reviewers set active=false where actor_id='${a.id}';update community_private.settings set enabled=false;`);
 const del=erase();const query=claims(a)+`set role authenticated;select public.community_workspace(${lit(JSON.stringify(envelope(del)))}::jsonb);`;
 await db('begin;'+query+'rollback;');assert.equal(await db(`select content from community_private.submissions where id='${own.submissionId}';`),own.content);
 assert.equal((await call(a,{action:'read',submissionId:own.submissionId})).submission.content,own.content);assert.equal((await call(a,del)).kind,'deleted');assert.equal((await call(a,operation(del))).submission,null);
 const exported=await call(a,{action:'export'});assert.equal(exported.submissions[0].status,'deleted');assert.deepEqual(exported.reviews,[]);
 assert.equal(await db(`select content from community_private.submissions where id='${foreign.submissionId}';`),foreign.content);
 assert.equal(await db(`select reviewer_id is null and review_note is null and author_visible_note is null and review_anonymized from community_private.submissions where id='${foreign.submissionId}';`),'t');
 await db('update community_private.settings set enabled=true;');assert.equal((await call(a,own)).submission.content,'');await denied(a,{...submit(),submissionId:own.submissionId},/COMMUNITY_CONFLICT/);
 const fresh=submit();await call(a,fresh);
 // Physical owned synthetic account deletion must erase its foreign note too.
 const r=await actor(true),p=submit();await call(b,p);await call(r,review(p));await db(`delete from auth.users where id='${r.id}';`);const after=(await call(b,{action:'read',submissionId:p.submissionId})).submission;assert.equal(after.reviewNote,null);assert.equal(after.reviewerDisclosure,null);
});
run('keyset sentinel prevents hidden pagination and export overflow fails closed',async()=>{
 const a=await actor();const ids=Array.from({length:51},uuid).sort();
 await db(ids.map(id=>`insert into community_private.submissions(id,author_id,title,content,consent,author_identity) values('${id}','${a.id}','t','c','internal-review-v1','registered_user');insert into community_private.audit(submission_id,actor_id,action,version) values('${id}','${a.id}','submitted',1);`).join(''));
 const first=await call(a,{action:'mine',cursor:null});assert.equal(first.submissions.length,50);assert.equal(first.complete,false);assert.equal(first.nextCursor,ids[49]);
 const second=await call(a,{action:'mine',cursor:first.nextCursor});assert.equal(second.submissions.length,1);assert.equal(second.complete,true);assert.equal(second.nextCursor,null);
 await db(Array.from({length:50},()=>{const id=uuid();return `insert into community_private.submissions(id,author_id,title,content,consent,author_identity) values('${id}','${a.id}','t','c','internal-review-v1','registered_user');`;}).join(''));
 await denied(a,{action:'export'},/COMMUNITY_CAPACITY/);
 assert.equal(await db('select deadlocks from pg_stat_database where datname=current_database();'),'0');
});

run('actual saved canonical association freezes Trip head and exact original provider mapping without writes',async()=>{
 const a=await actor(),trip=uuid(),poi=uuid(),providerPoiId=uuid();
 await db(`insert into public.trips(id,owner_id,title) values('${trip}','${a.id}','Synthetic saved association');insert into public.canonical_pois(id,primary_name_en,primary_name_zh) values('${poi}','Fixture place','测试地点');insert into public.provider_poi_mappings(canonical_poi_id,provider,provider_poi_id,raw_name) values('${poi}','amap','${providerPoiId}','NO PROVIDER BODY');`);
 const selection={canonicalPoiId:poi,provider:'amap',providerPoiId};
 const mapping=JSON.parse(await db(`select place_actions_private.mapping_v1(${lit(JSON.stringify(selection))}::jsonb);`));
 const ref=uuid(),place={tripId:trip,placeReferenceId:ref,expectedTripVersion:0,mappingDigest:mapping.digest};
 await denied(a,submit({place}),/COMMUNITY_PLACE_UNAVAILABLE/);
 // Existing Save producer only, fixture-only permission after default ACL assertion.
 await db('grant execute on function public.execute_place_action_v1(uuid,jsonb) to authenticated;');
 const cmd={action:'save',operationId:uuid(),expectedTripVersion:0,selection,expectedMappingDigest:mapping.digest,expectedSaveRevision:0};
 const saved=JSON.parse(await db(claims(a)+`set role authenticated;select public.execute_place_action_v1('${trip}',${lit(JSON.stringify(cmd))}::jsonb);`));place.placeReferenceId=saved.referenceId;
 const s=submit({place}),before=await db(`select row_to_json(t)::text from public.trips t where id='${trip}';`);
 const out=await call(a,s);assert.equal(out.submission.place.canonicalPoiId,poi);assert.equal(out.submission.place.label,'Fixture place');assert.equal(out.submission.place.mappingDigest,mapping.digest);
 assert.equal(await db(`select row_to_json(t)::text from public.trips t where id='${trip}';`),before);assert.equal(await db(`select count(*) from public.trip_proposals where trip_id='${trip}';`),'0');
 const other=await actor();await denied(other,submit({place}),/COMMUNITY_PLACE_UNAVAILABLE/);
 await db(`update public.trips set head_version=1 where id='${trip}';`);await denied(a,submit({place}),/COMMUNITY_PLACE_UNAVAILABLE/);
 await db(`update public.provider_poi_mappings set matched_at=clock_timestamp() where canonical_poi_id='${poi}';`);
 assert.equal((await call(a,{action:'read',submissionId:s.submissionId})).submission.place.label,null);await denied(a,submit({place:{...place,expectedTripVersion:1}}),/COMMUNITY_PLACE_UNAVAILABLE/);
});
