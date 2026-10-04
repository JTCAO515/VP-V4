// Real disposable PostgreSQL; synthetic Auth claims, no target/provider acceptance.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_TURN_DB_TEST==='1',container='vpj29-recovery-'+uuid().slice(0,8);let created=false;
const lit=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const claims=a=>`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.id}';set request.jwt.claims='${JSON.stringify({role:'authenticated',session_id:a.session,is_anonymous:false})}';`;
const tableNames=new Set(['create_trip_proposal_patch','confirm_and_apply_trip_proposal','revise_trip_proposal_patch','revise_trip_proposal']);
const stmt=(name,p)=>tableNames.has(name)?`select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.${name}(${Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')}) r;`:`select public.${name}(${Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')});`;
const rpc=async(a,name,p)=>JSON.parse(await db(`begin;${claims(a)}${stmt(name,p)}commit;`));
const failure=async(a,name,p,pattern)=>{const r=await sql(container,`begin;${claims(a)}${stmt(name,p)}commit;`);assert.notEqual(r.code,0);assert.match(r.stderr,pattern);};
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
before(async()=>{
 if(!enabled)return;
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(r.code,0,r.stderr);created=true;
 for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
  const source=readFileSync('supabase/migrations/'+f,'utf8');
  if(f==='20261004030000_local_recovery_guard.sql'){
   await db('begin;'+source+'rollback;');
   assert.equal(await db("select to_regclass('recovery_private.contexts_v1') is null and not exists(select 1 from information_schema.columns where table_schema='public' and table_name='trip_proposals' and column_name='local_recovery');"),'t');
  }
  await db('begin;'+source+'commit;');
 }
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
async function actor(){const a={id:uuid(),session:uuid()};await db(`insert into auth.users(id) values('${a.id}');insert into auth.sessions(id,user_id) values('${a.session}','${a.id}');insert into identity_private.mobile_accounts(owner_id) values('${a.id}');`);return a;}
async function fixture(){
 const a=await actor(),trip=uuid();await db(`insert into public.trips(id,owner_id,title,head_version) values('${trip}','${a.id}','Recovery fixture',0);`);
 const created=await rpc(a,'create_trip_proposal_patch',{p_trip_id:trip,p_patch:{expectedVersion:0,operations:[{kind:'upsert_day',dayId:'DayA',date:'2026-10-04',timeZone:'Asia/Shanghai'},...['OptionalA','OptionalB','FixedDinner'].map(itemId=>({kind:'upsert_item',dayId:'DayA',itemId,title:itemId,startsAt:'2026-10-04T09:00:00Z',endsAt:'2026-10-04T10:00:00Z'}))]}});
 const proposal=created[0].proposal_id,read=JSON.parse(await db(`${claims(a)}select to_jsonb(r) from public.read_trip_proposal_v2('${proposal}')r;`));
 assert.equal((await rpc(a,'confirm_and_apply_trip_proposal',{p_proposal_id:proposal,p_idempotency_key:uuid(),p_digest:read.digest}))[0].outcome,'applied');
 return {a,trip,input:{operationId:uuid(),expectedHeadVersion:1,dayId:'DayA',selectedItemIds:['OptionalA','OptionalB'],fixedItemIds:['FixedDinner'],reservationBindings:[],report:{source:'user_report',kind:'fatigue',observedAt:new Date().toISOString()},locale:'zh'}};
}
async function prepared(f){const c=await rpc(f.a,'prepare_local_recovery_v1',{p_trip_id:f.trip,p_input:f.input});assert.equal(c.kind,'local_recovery_context/1',JSON.stringify(c));return c;}
async function selected(f,choice='omit_one'){
 const c=await prepared(f),input={operationId:uuid(),contextId:c.contextId,contextDigest:c.contextDigest,candidateId:choice};
 const receipt=await rpc(f.a,'submit_local_recovery_v1',{p_trip_id:f.trip,p_input:input});assert.equal(receipt.kind,'local_recovery_proposal/1',JSON.stringify(receipt));
 const read=JSON.parse(await db(`${claims(f.a)}select to_jsonb(r) from public.read_trip_proposal_v2('${receipt.proposalId}')r;`));
 return {...f,c,selection:input,receipt,read,confirm:{p_proposal_id:receipt.proposalId,p_idempotency_key:uuid(),p_digest:read.digest}};
}
async function fingerprint(f){return db(`select jsonb_build_array(t.head_version,public.trip_content_snapshot(t.id,t.title),(select count(*) from public.trip_events where trip_id=t.id),(select count(*) from public.trip_version_snapshots where trip_id=t.id),(select count(*) from public.trip_idempotency where owner_id=t.owner_id),(select count(*) from public.trip_audit_events where trip_id=t.id)) from public.trips t where t.id='${f.trip}';`);}
async function reservation(f,status='reserved'){
 const ref=uuid(),input={operationId:uuid(),referenceId:ref,expectedTripVersion:1,expectedRevision:0,fields:{kind:'activity',supplier:'official',externalReference:null,title:'Fixed reservation',startsAt:'2026-10-04T09:00:00Z',endsAt:'2026-10-04T10:00:00Z',timeZone:'Asia/Shanghai',address:null,terms:null,status},source:{kind:'user_reported',localMaterialId:null,localContentHash:null,locator:null},explicitlyConfirmed:true};
 const r=await rpc(f.a,'confirm_reservation_reference_v1',{p_trip_id:f.trip,p_input:input});assert.equal(r.kind,'reservation_confirmation/1',JSON.stringify(r));return {ref,input,r};
}
// Lifecycle/export fixture only: direct admin seed is deliberately unqualified.
// It is never evidence that missing reservation authority admitted a recovery RPC.
async function lifecycleSeed(){
 const f=await fixture(),context=uuid(),operation=uuid(),patch={expectedVersion:1,operations:[{kind:'delete_item',dayId:'DayA',itemId:'OptionalA'}]},p=(await rpc(f.a,'create_trip_proposal_patch',{p_trip_id:f.trip,p_patch:patch}))[0].proposal_id;
 await db(`${claims(f.a)}update public.trip_proposals set expires_at=date_trunc('milliseconds',clock_timestamp()+interval '30 seconds'),local_recovery=true where id='${p}';`);
 const selection={operationId:operation,contextId:context,contextDigest:'a'.repeat(64),candidateId:'omit_one'},receipt={kind:'local_recovery_proposal/1',operationId:operation,contextId:context,contextDigest:'a'.repeat(64),candidateId:'omit_one',proposalId:p,proposalRevision:2,baseVersion:1,expiresAt:new Date(Date.now()+30000).toISOString(),reused:false};
 await db(`${claims(f.a)}insert into recovery_private.contexts_v1(id,owner_id,trip_id,operation_id,input,base_version,snapshot,profile_basis,reservation_basis,digest,expires_at) select '${context}','${f.a.id}','${f.trip}','${f.input.operationId}',${lit(f.input)}::jsonb,1,public.trip_content_snapshot(t.id,t.title),recovery_private.profile_v1('${f.a.id}'),'[]','${'a'.repeat(64)}',clock_timestamp()+interval '5 minutes' from public.trips t where id='${f.trip}';insert into recovery_private.operations_v1 values('${f.a.id}','${operation}','${f.trip}','${context}',${lit(selection)}::jsonb,${lit(receipt)}::jsonb,'${p}');insert into recovery_private.lineage_v1 select '${p}','${f.a.id}','${f.trip}','${context}','${operation}',${lit(patch)}::jsonb,digest from public.read_trip_proposal_v2('${p}');`);
 for(const table of ['contexts_v1','operations_v1','lineage_v1'])assert.equal(await db(`select count(*) from recovery_private.${table} where owner_id='${f.a.id}';`),'1');
 return {...f,context,operation,proposal:p};
}
run('full migration compile and default revoked ACL/RLS; ordinary original writer unchanged',async()=>{
 const acl=await db("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='recovery_private' or p.proname in('prepare_local_recovery_v1','submit_local_recovery_v1','read_local_recovery_operation_v1')) and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE'));" );assert.equal(acl,'0');
 assert.equal(await db("select bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='recovery_private' and relkind='r';"),'t');
 const f=await fixture();assert.equal(await db(`select head_version from public.trips where id='${f.trip}';`),'1');
});
run('missing actual reservation authority fails closed, no context/proposal or Trip write',async()=>{
 const f=await fixture(),before=await fingerprint(f),exists=await db("select to_regprocedure('public.read_reservation_references_v1(uuid,integer,uuid,uuid,integer)') is not null;");
 if(exists==='t')await db('alter function public.read_reservation_references_v1(uuid,integer,uuid,uuid,integer) rename to recovery_test_hidden_reader;');
 try{assert.deepEqual(await rpc(f.a,'prepare_local_recovery_v1',{p_trip_id:f.trip,p_input:f.input}),{kind:'pending',reason:'RESERVATION_READER_UNAVAILABLE'});assert.equal(await db(`select count(*) from recovery_private.contexts_v1 where trip_id='${f.trip}';`),'0');assert.equal(await fingerprint(f),before);}finally{if(exists==='t')await db('alter function public.recovery_test_hidden_reader(uuid,integer,uuid,uuid,integer) rename to read_reservation_references_v1;');}
});
run('closed typed input future/stale/highrisk/fixed/foreign scope rejects without writes',async()=>{
 const f=await fixture(),before=await fingerprint(f);
 for(const extra of [{extra:true},{expectedHeadVersion:'1'},{selectedItemIds:['OptionalA','OptionalA']},{selectedItemIds:[]},{report:{...f.input.report,rawHealth:'private'}},{reservationBindings:[{referenceId:uuid(),revision:null,dayId:'DayA',itemId:'FixedDinner'}]}])await failure(f.a,'prepare_local_recovery_v1',{p_trip_id:f.trip,p_input:{...f.input,...extra}},/INVALID_INPUT/);
 for(const observedAt of [new Date(Date.now()+60000).toISOString(),new Date(Date.now()-360000).toISOString()])assert.equal((await rpc(f.a,'prepare_local_recovery_v1',{p_trip_id:f.trip,p_input:{...f.input,report:{...f.input.report,observedAt}}})).kind,'stale');
 assert.equal((await rpc(f.a,'prepare_local_recovery_v1',{p_trip_id:f.trip,p_input:{...f.input,report:{...f.input.report,kind:'high_risk_unwell'}}})).reason,'HIGH_RISK_UNWELL');
 for(const extra of [{fixedItemIds:['OptionalA']},{selectedItemIds:['ForeignItem']},{dayId:'WrongDay'}])assert.equal((await rpc(f.a,'prepare_local_recovery_v1',{p_trip_id:f.trip,p_input:{...f.input,...extra}})).kind,'conflict');
 const other=await actor();assert.equal((await rpc(other,'prepare_local_recovery_v1',{p_trip_id:f.trip,p_input:f.input})).kind,'unavailable');assert.equal(await fingerprint(f),before);
});
run('permanent recovery marker without association rejects direct original confirm and revision; full rollback',async()=>{
 const f=await fixture(),r=(await rpc(f.a,'create_trip_proposal_patch',{p_trip_id:f.trip,p_patch:{expectedVersion:1,operations:[{kind:'delete_item',dayId:'DayA',itemId:'OptionalA'}]}}))[0];
 await db(`${claims(f.a)}update public.trip_proposals set local_recovery=true where id='${r.proposal_id}';`);
 const read=JSON.parse(await db(`${claims(f.a)}select to_jsonb(r) from public.read_trip_proposal_v2('${r.proposal_id}')r;`)),before=await fingerprint(f);
 await failure(f.a,'confirm_and_apply_trip_proposal',{p_proposal_id:r.proposal_id,p_idempotency_key:uuid(),p_digest:read.digest},/RECOVERY_CONFIRM_GUARD/);
 await failure(f.a,'revise_trip_proposal_patch',{p_proposal_id:r.proposal_id,p_patch:read.proposal.patch},/RECOVERY_REVISION_SCOPE/);
 assert.equal(await fingerprint(f),before);assert.equal(await db(`select status from public.trip_proposals where id='${r.proposal_id}';`),'pending');
});
run('server context exact replay/current Profile; same operation changed body conflicts',async()=>{
 const f=await fixture(),c=await prepared(f);assert.deepEqual(await prepared(f),c);
 assert.equal((await rpc(f.a,'prepare_local_recovery_v1',{p_trip_id:f.trip,p_input:{...f.input,locale:'en'}})).kind,'conflict');
 await db(`insert into public.user_profiles(owner_id) values('${f.a.id}');`);
 assert.equal((await rpc(f.a,'prepare_local_recovery_v1',{p_trip_id:f.trip,p_input:f.input})).kind,'conflict');
});
run('single original confirm preserves all fixed/unselected/date/window scope; exact historical retry/read',async()=>{
 const f=await selected(await fixture()),before=JSON.parse(await db(`select public.trip_content_snapshot(id,title) from public.trips where id='${f.trip}';`));
 assert.ok(Date.parse(f.receipt.expiresAt)-Date.now()<=30000);
 assert.equal((await rpc(f.a,'confirm_and_apply_trip_proposal',f.confirm))[0].outcome,'applied');
 const current=JSON.parse(await db(`select public.trip_content_snapshot(id,title) from public.trips where id='${f.trip}';`));before.days[0].items=before.days[0].items.filter(i=>i.id!=='OptionalA');assert.deepEqual(current,before);
 const op=await rpc(f.a,'read_local_recovery_operation_v1',{p_trip_id:f.trip,p_operation_id:f.selection.operationId});assert.equal(op.state,'applied');assert.equal(op.resultingVersion,2);assert.deepEqual(op.input,f.selection);
 await db(`insert into public.user_profiles(owner_id) values('${f.a.id}');`);
 assert.equal((await rpc(f.a,'confirm_and_apply_trip_proposal',f.confirm))[0].outcome,'already_applied');
 assert.equal((await rpc(f.a,'submit_local_recovery_v1',{p_trip_id:f.trip,p_input:f.selection})).proposalId,f.receipt.proposalId);
 assert.equal(await db(`select count(*) from public.trip_events where proposal_id='${f.receipt.proposalId}';`),'1');
});
run('lost ACK exact submit/read concurrent replay creates one proposal/operation; changed choice conflicts',async()=>{
 const f=await fixture(),c=await prepared(f),input={operationId:uuid(),contextId:c.contextId,contextDigest:c.contextDigest,candidateId:'omit_selected'};
 const replies=await Promise.all(Array.from({length:2},()=>rpc(f.a,'submit_local_recovery_v1',{p_trip_id:f.trip,p_input:input})));const success=replies.filter(x=>x.kind==='local_recovery_proposal/1');assert.ok(success.length>0);const r=await rpc(f.a,'submit_local_recovery_v1',{p_trip_id:f.trip,p_input:input});assert.equal(r.proposalId,success[0].proposalId);
 assert.equal((await rpc(f.a,'read_local_recovery_operation_v1',{p_trip_id:f.trip,p_operation_id:input.operationId})).state,'pending');
 assert.equal((await rpc(f.a,'submit_local_recovery_v1',{p_trip_id:f.trip,p_input:{...input,candidateId:'omit_one'}})).kind,'conflict');
 assert.equal((await rpc(f.a,'submit_local_recovery_v1',{p_trip_id:f.trip,p_input:{...input,operationId:uuid()}})).kind,'conflict');
 assert.equal(await db(`select count(*) from recovery_private.operations_v1 where trip_id='${f.trip}';`),'1');
 assert.equal((await rpc(f.a,'read_local_recovery_operation_v1',{p_trip_id:f.trip,p_operation_id:uuid()})).kind,'unavailable');
});
run('Profile change direct legacy and alternate supported confirm reject with full rollback',async()=>{
 for(const supported of [false,true]){const f=await selected(await fixture()),before=await fingerprint(f);await db(`insert into public.user_profiles(owner_id) values('${f.a.id}');`);
 await failure(f.a,supported?'confirm_and_apply_supported_trip_proposal_v1':'confirm_and_apply_trip_proposal',supported?{...f.confirm,p_support_selection:[]}:f.confirm,/RECOVERY_CONFIRM_GUARD/);
 assert.equal(await fingerprint(f),before);assert.equal((await rpc(f.a,'read_local_recovery_operation_v1',{p_trip_id:f.trip,p_operation_id:f.selection.operationId})).state,'stale');}
});
run('all recovery revisions including same patch are rejected; title/rollback/expiry cannot bypass',async()=>{
 const f=await selected(await fixture()),before=await fingerprint(f);
 await failure(f.a,'revise_trip_proposal',{p_proposal_id:f.receipt.proposalId,p_title:'Bypass'},/RECOVERY_REVISION_SCOPE|permission denied/);
 for(const patch of [{expectedVersion:1,operations:[{kind:'delete_item',dayId:'DayA',itemId:'FixedDinner'}]},{expectedVersion:1,operations:[{kind:'set_title',title:'Unscoped'}]}])await failure(f.a,'revise_trip_proposal_patch',{p_proposal_id:f.receipt.proposalId,p_patch:patch},/RECOVERY_REVISION_SCOPE/);
 const mutate=await sql(container,`${claims(f.a)}update public.trip_proposals set local_recovery=false,expires_at=clock_timestamp()+interval '24 hours' where id='${f.receipt.proposalId}';`);assert.notEqual(mutate.code,0);assert.match(mutate.stderr,/RECOVERY_PROPOSAL_IMMUTABLE/);
 const rollback=await sql(container,`${claims(f.a)}insert into public.trip_proposals(owner_id,trip_id,revision,base_trip_version,status,patch,expires_at,parent_proposal_id,rollback_snapshot_version) select owner_id,trip_id,revision+1,base_trip_version,'pending',patch,expires_at,id,0 from public.trip_proposals where id='${f.receipt.proposalId}';`);assert.notEqual(rollback.code,0);assert.match(rollback.stderr,/RECOVERY_REVISION_SCOPE/);
 await failure(f.a,'revise_trip_proposal_patch',{p_proposal_id:f.receipt.proposalId,p_patch:f.read.proposal.patch},/RECOVERY_REVISION_SCOPE/);
 assert.equal(await fingerprint(f),before);
});
run('expiry clock at commit rejects original writer even if legacy now() allowed the patch',async()=>{
 const original=await fixture();original.input.report.observedAt=new Date(Date.now()-298500).toISOString();
 const f=await selected(original),before=await fingerprint(f);
 assert.ok(Date.parse(f.receipt.expiresAt)-Date.now()<1600);
 const r=await sql(container,`begin;${claims(f.a)}${stmt('confirm_and_apply_trip_proposal',f.confirm)}select pg_sleep(1.6);commit;`);
 assert.notEqual(r.code,0);assert.match(r.stderr,/RECOVERY_CONFIRM_GUARD/);assert.equal(await fingerprint(f),before);
 assert.equal((await rpc(f.a,'read_local_recovery_operation_v1',{p_trip_id:f.trip,p_operation_id:f.selection.operationId})).state,'expired');
});
run('new source reservation / reference correction invalidates actual confirmation atomically',async()=>{
 const f=await selected(await fixture()),before=await fingerprint(f);await reservation(f,'reserved');await failure(f.a,'confirm_and_apply_trip_proposal',f.confirm,/RECOVERY_CONFIRM_GUARD/);assert.equal(await fingerprint(f),before);
});
run('user-confirmed preservation binds exact current real order without qualification upgrade; unknown/missing/date/duplicate blocked',async()=>{
 const f=await fixture(),order=await reservation(f),prepare=x=>rpc(f.a,'prepare_local_recovery_v1',{p_trip_id:f.trip,p_input:{...f.input,...x}});
 assert.equal((await prepare({})).reason,'RESERVATION_SCOPE_UNMAPPED');
 const binding={referenceId:order.ref,revision:1,dayId:'DayA',itemId:'FixedDinner'};
 for(const b of [{...binding,revision:2},{...binding,itemId:'Wrong'},{...binding,itemId:'OptionalA'}])assert.equal((await prepare({reservationBindings:[b]})).kind,'pending');
 const c=await prepare({reservationBindings:[binding],fixedItemIds:[]});assert.equal(c.kind,'local_recovery_context/1');assert.equal(c.reservationBasis[0].evidenceTier,'user_reported');
 const choose={operationId:uuid(),contextId:c.contextId,contextDigest:c.contextDigest,candidateId:'omit_selected'},r=await rpc(f.a,'submit_local_recovery_v1',{p_trip_id:f.trip,p_input:choose});assert.equal(r.kind,'local_recovery_proposal/1');
 const read=JSON.parse(await db(`${claims(f.a)}select to_jsonb(r) from public.read_trip_proposal_v2('${r.proposalId}')r;`));assert.equal((await rpc(f.a,'confirm_and_apply_trip_proposal',{p_proposal_id:r.proposalId,p_idempotency_key:uuid(),p_digest:read.digest}))[0].outcome,'applied');
 assert.equal(await db(`select count(*) from public.trip_items where trip_id='${f.trip}' and item_id='FixedDinner';`),'1');
 const g=await fixture();await reservation(g,'unknown');assert.equal((await rpc(g.a,'prepare_local_recovery_v1',{p_trip_id:g.trip,p_input:g.input})).reason,'RESERVATION_STATUS_UNKNOWN');
});
run('late source drift in same original writer transaction rejects all writes at deferred guard',async()=>{
 const f=await selected(await fixture()),before=await fingerprint(f);
 const r=await sql(container,`begin;${claims(f.a)}${stmt('confirm_and_apply_trip_proposal',f.confirm)}insert into public.user_profiles(owner_id) values('${f.a.id}');commit;`);assert.notEqual(r.code,0);assert.match(r.stderr,/RECOVERY_CONFIRM_GUARD/);assert.equal(await fingerprint(f),before);assert.equal(await db(`select count(*) from public.user_profiles where owner_id='${f.a.id}';`),'0');
});
run('account/Trip deletion cascades personal rows; clearing association keeps permanent rejection marker',async()=>{
 const f=await selected(await fixture()),before=await fingerprint(f);await db(`delete from recovery_private.contexts_v1 where trip_id='${f.trip}';`);await failure(f.a,'confirm_and_apply_trip_proposal',f.confirm,/RECOVERY_CONFIRM_GUARD/);assert.equal(await fingerprint(f),before);
 const g=await selected(await fixture());await db(`delete from public.trips where id='${g.trip}';`);assert.equal(await db(`select count(*) from recovery_private.contexts_v1 where owner_id='${g.a.id}';`),'0');assert.equal(await db(`select count(*) from recovery_private.operations_v1 where owner_id='${g.a.id}';`),'0');assert.equal(await db(`select count(*) from recovery_private.lineage_v1 where owner_id='${g.a.id}';`),'0');
 const h=await selected(await fixture());await db(`delete from auth.users where id='${h.a.id}';`);assert.equal(await db(`select count(*) from recovery_private.contexts_v1 where owner_id='${h.a.id}';`),'0');
});
run('lifecycle-only unqualified records cascade on real archive/deletion request/account/Trip paths',async()=>{
 for(const mode of ['archive','request','account','trip']){
  const f=await lifecycleSeed();
  if(mode==='archive')await db(`${claims(f.a)}select * from public.archive_trip_v1('${f.trip}',1,'${uuid()}',true);`);
  if(mode==='request')await rpc(f.a,'request_trip_deletion_v1',{p_request_id:uuid(),p_trip_id:f.trip,p_expected_version:1,p_confirmed:true});
  if(mode==='account')await db(`delete from auth.users where id='${f.a.id}';`);
  if(mode==='trip')await db(`delete from public.trips where id='${f.trip}';`);
  for(const table of ['contexts_v1','operations_v1','lineage_v1'])assert.equal(await db(`select count(*) from recovery_private.${table} where owner_id='${f.a.id}';`),'0');
  if(mode==='archive'||mode==='request'){
   assert.equal(await db(`select local_recovery from public.trip_proposals where id='${f.proposal}';`),'t');
   assert.equal((await rpc(f.a,'read_local_recovery_operation_v1',{p_trip_id:f.trip,p_operation_id:f.operation})).kind,'unavailable');
  }
 }
});
run('private exact real export lease reads only owned metadata, is partial/unenrolled and rejects wrong lease/cursor',async()=>{
 const f=await lifecycleSeed(),foreign=await lifecycleSeed(),request=uuid();
 await db(`update identity_private.mobile_accounts set epoch=1,session_id='${f.a.session}' where owner_id='${f.a.id}';insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch) values('${f.a.id}','${uuid()}','${f.a.session}',1);insert into export_private.core_policies_v1(id,revision,enabled,environment,key_id,max_run_ms,artifact_ttl_ms,ticket_ttl_ms,max_pages,page_size,max_bytes,valid_until) values('${uuid()}',1,true,'local','synthetic-recovery-key',90000,600000,300000,1000,100,8388608,clock_timestamp()+interval '1 day');`);
 assert.equal((await rpc(f.a,'privacy_core_export_v1',{p_action:'request',p_input:{requestId:request,confirmed:true}})).state,'queued');
 const lease=JSON.parse(await db(`set request.jwt.claim.role='service_role';select public.privacy_core_export_v1('claim',${lit({requestId:request,operationId:uuid(),maxRunMs:90000,expectedEnvironment:'local',expectedKeyId:'synthetic-recovery-key'})}::jsonb);`));assert.equal(lease.kind,'privacy_export_lease/1');
 const call=(id,cursor=null)=>db(`set request.jwt.claim.role='service_role';select recovery_private.export_metadata_v1('${request}','${id}',${lease.generation},${lit(cursor)}::uuid,100);`);
 const wire=JSON.parse(await call(lease.leaseId));assert.equal(wire.items.length,1);assert.equal(wire.items[0].contextId,f.context);assert.equal(wire.items[0].operations[0].operationId,f.operation);assert.equal(wire.enrolled,false);assert.equal(wire.inventoryStatus,'partial');assert.equal(wire.sectionComplete,true);assert.ok(!JSON.stringify(wire).includes('snapshot'));assert.ok(!JSON.stringify(wire).includes(foreign.context));
 assert.deepEqual(JSON.parse(await call(uuid())),{kind:'unavailable'});
 const bad=await sql(container,`set request.jwt.claim.role='service_role';select recovery_private.export_metadata_v1('${request}','${lease.leaseId}',${lease.generation},'${foreign.context}',100);`);assert.notEqual(bad.code,0);assert.match(bad.stderr,/INVALID_EXPORT_CURSOR/);
});
run('private export stays partial unenrolled and requires exact live original lease; no ordinary ACL',async()=>{
 const r=await sql(container,`set request.jwt.claim.role='authenticated';select recovery_private.export_metadata_v1('${uuid()}','${uuid()}',1);`);assert.notEqual(r.code,0);assert.match(r.stderr,/FORBIDDEN/);
 assert.deepEqual(JSON.parse(await db(`set request.jwt.claim.role='service_role';select recovery_private.export_metadata_v1('${uuid()}','${uuid()}',1);`)),{kind:'unavailable'});
});
