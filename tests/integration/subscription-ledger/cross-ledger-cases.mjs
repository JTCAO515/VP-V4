import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
import {createOwnedPg} from '../ios004-user-address/owned-pg.mjs';
import {assertLegacyPin,pins} from './legacy-pin.mjs';
import {journeyPassCatalog} from '../../../lib/server/entitlements/journey-pass-catalog.ts';
import {subscriptionDevelopmentCatalog} from '../../../lib/server/entitlements/subscription-development/index.ts';
const candidate=readFileSync(new URL('../../../lib/server/entitlements/subscription-ledger/development-schema.sql',import.meta.url),'utf8');
const legacy=readFileSync(new URL('../../../supabase/migrations/20260926113804_vpj34_storekit_grants.sql',import.meta.url),'utf8');
const digest=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
const owner=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function legacyInput(id,own,patch={}){return {environment:'Sandbox',transactionId:id,ownerId:own,appAccountToken:own,productId:'synthetic.legacy',purchaseAt:new Date(Date.now()-60000).toISOString(),catalogVersion:journeyPassCatalog.catalogVersion,policyVersion:journeyPassCatalog.policyVersion,capacitySnapshot:journeyPassCatalog.serviceTaskCapacity.journeyPass,...patch};}
function subscriptionInput(id,own,patch={}){
 const now=Date.now()-5;
 const p={schemaVersion:'subscription-verified-period/1',environment:'Sandbox',source:'apple_server_verified',ownerId:own,appAccountToken:own,transactionId:id,originalTransactionId:id,
  productId:'synthetic.monthly',subscriptionGroupId:'100',purchaseAt:new Date(now-60000).toISOString(),expiresAt:new Date(now+240000).toISOString(),signedAt:new Date(now-1000).toISOString(),checkedAt:new Date(now).toISOString(),revokedAt:null,transactionReason:'PURCHASE',catalogVersion:3,policyVersion:subscriptionDevelopmentCatalog.policyVersion,capacitySnapshot:subscriptionDevelopmentCatalog.serviceTaskCapacity.subscription,...patch};
 return {...p,receiptDigest:digest(p)};
}
const rpcOld=(c,p)=>c.query('select public.storekit_apply_verified_v1($1::jsonb) as r',[p]).then(v=>v.rows[0].r);
const rpcNew=(c,p,epoch=0)=>c.query('select subscription_development.apply_period_v1($1::jsonb,$2::bigint) as r',[p,epoch]).then(v=>v.rows[0].r);
async function old(db,p){
 await db.query("set request.jwt.claim.role='service_role';set role service_role");
 try{return await rpcOld(db,p);}finally{await db.query('reset role');}
}
const conflict=e=>{assert.equal(e.code,'P0001');assert.equal(e.message,'ENTITLEMENT_TRANSACTION_CONFLICT');return true;};
async function counts(db,id){return (await db.query("select (select count(*)::int from public.storekit_grants where environment='Sandbox' and transaction_id=$1) as legacy,(select count(*)::int from subscription_development.periods where environment='Sandbox' and transaction_id=$1) as subscription",[id])).rows[0];}
async function waiting(db,waiter,blocker){
 const deadline=performance.now()+3000;
 while(performance.now()<deadline){
  const r=await db.query("select $2::int=any(pg_blocking_pids($1)) and exists(select 1 from pg_locks where pid=$1 and locktype='advisory' and not granted) as waiting",[waiter,blocker]);
  if(r.rows[0].waiting)return;
  await delay(5);
 }
 assert.fail(`No exact advisory dependency ${waiter} -> ${blocker}`);
}
export async function runCrossLedger(t){
 const owned=createOwnedPg({bin:process.env.SUBSCRIPTION_PG_BIN,module:process.env.SUBSCRIPTION_PG_MODULE});let db;
 const {Client}=createRequire(import.meta.url)(process.env.SUBSCRIPTION_PG_MODULE);
 async function client(kind){
  const c=new Client({host:owned.descriptor.socket,user:'postgres',database:'postgres'});await c.connect();
  await c.query("set statement_timeout='6s';set lock_timeout='5s';set request.jwt.claim.role='service_role'");
  if(kind==='legacy')await c.query('set role service_role');
  c.pid=(await c.query('select pg_backend_pid() as pid')).rows[0].pid;return c;
 }
 try{
  owned.start();db=await owned.connect();
  await db.query("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create function auth.uid() returns uuid language sql as 'select null::uuid';create function auth.role() returns text language sql as 'select current_setting(''request.jwt.claim.role'',true)';");
  await db.query(legacy);
  await t.test('candidate refuses unknown legacy body/owner/ACL/flags before any schema change',async()=>{
   const drift=[
    pins.before.definition.replace('\ndeclare\n','\n-- synthetic unknown body\ndeclare\n'),
    'alter function public.storekit_apply_verified_v1(jsonb) cost 101',
    'alter function public.storekit_apply_verified_v1(jsonb) stable',
    'alter function public.storekit_apply_verified_v1(jsonb) security invoker',
    "alter function public.storekit_apply_verified_v1(jsonb) set search_path='public'",
    'revoke execute on function public.storekit_apply_verified_v1(jsonb) from service_role',
    'alter function public.storekit_apply_verified_v1(jsonb) owner to authenticated',
    'alter function public.storekit_apply_verified_v1(jsonb) rename to synthetic_unknown_writer',
   ];
   for(const fault of drift){
    await db.query('begin');
    try{await db.query(fault);await assert.rejects(db.query(candidate),/CROSS_LEDGER_BEFORE_MISMATCH/);}
    finally{await db.query('rollback');}
    await assertLegacyPin(db,'before');assert.equal((await db.query("select to_regnamespace('subscription_development') as n")).rows[0].n,null);
   }
  });
  await t.test('transactional candidate replacement rollback restores exact legacy definition owner ACL and flags',async()=>{
   const oid=(await db.query("select 'public.storekit_apply_verified_v1(jsonb)'::regprocedure::oid as oid")).rows[0].oid;
   await db.query('begin');await db.query(candidate);await assertLegacyPin(db,'after');await db.query('rollback');await assertLegacyPin(db,'before');
   assert.equal((await db.query("select to_regnamespace('subscription_development') as n")).rows[0].n,null);
   await db.query(candidate);await assertLegacyPin(db,'after');
   assert.equal((await db.query("select 'public.storekit_apply_verified_v1(jsonb)'::regprocedure::oid as oid")).rows[0].oid,oid);
  });
  await t.test('runtime definer with filtered FORCE-RLS visibility refuses the actual legacy RPC, rollback restores metadata',async()=>{
   const own=owner(19000);await rpcNew(db,subscriptionInput('19001',own));
   await db.query("set request.jwt.claim.role='service_role';begin");
   try{
    // Rollback-only metadata fault using an existing non-bypass role; no GRANT.
    // A view exercises SELECT under its owner while only the admin can reach it.
    await db.query(`create view subscription_development.visibility_fault as select transaction_id from subscription_development.periods;
     alter table subscription_development.periods owner to authenticated;
     alter view subscription_development.visibility_fault owner to authenticated;
     alter function public.storekit_apply_verified_v1(jsonb) owner to authenticated;`);
    assert.deepEqual((await db.query("select rolsuper,rolbypassrls from pg_roles where rolname='authenticated'")).rows[0],{rolsuper:false,rolbypassrls:false});
    assert.equal((await db.query("select count(*)::int as n from subscription_development.periods where transaction_id='19001'")).rows[0].n,1);
    assert.equal((await db.query("select count(*)::int as n from subscription_development.visibility_fault where transaction_id='19001'")).rows[0].n,0);
    await assert.rejects(rpcOld(db,legacyInput('19001',own)),e=>{assert.equal(e.message,'ENTITLEMENT_VISIBILITY_UNAVAILABLE');return true;});
   }finally{await db.query('rollback');}
   await assertLegacyPin(db,'after');assert.deepEqual(await counts(db,'19001'),{legacy:0,subscription:1});
   assert.equal((await db.query("select pg_get_userbyid(relowner) as owner from pg_class where oid='subscription_development.periods'::regclass")).rows[0].owner,'postgres');
  });
  await t.test('unsupported pinned transaction snapshots fail closed in both actual writers with no ledger row',async()=>{
   for(const isolation of ['repeatable read','serializable','read uncommitted'])for(const direction of ['legacy','subscription']){
    const c=await client(direction),id=direction==='legacy'?'19501':'19502';
    try{
     await c.query(`begin isolation level ${isolation}`);
     await c.query('select count(*) from pg_catalog.pg_class');
     const call=direction==='legacy'?rpcOld(c,legacyInput(id,owner(19500))):rpcNew(c,subscriptionInput(id,owner(19500)));
     await assert.rejects(call,e=>{assert.equal(e.message,'ENTITLEMENT_ISOLATION_UNAVAILABLE');return true;});
    }finally{await c.query('rollback');await c.end();}
    assert.deepEqual(await counts(db,id),{legacy:0,subscription:0});
   }
  });
  let serial=20000;
  for(const direction of ['legacy_first','subscription_first'])await t.test(`${direction}: same/foreign owner and active/revoked/erased retained identity all conflict`,async()=>{
   for(const same of [true,false])for(const state of ['active','revoked','erased']){
    const id=String(++serial),own=owner(serial),foreign=same?own:owner(serial+1000);
    if(direction==='legacy_first'){
     const p=legacyInput(id,own);const first=await old(db,p);assert.equal(first.state,'active');assert.equal((await old(db,p)).replayed,true);
     if(state==='revoked')await old(db,{...p,revokedAt:new Date().toISOString()});
     if(state==='erased'){
      await db.query("set request.jwt.claim.role='service_role';set role service_role");
      try{await db.query('select public.storekit_erase_owner_v1($1)',[own]);}finally{await db.query('reset role');}
     }
     await assert.rejects(rpcNew(db,subscriptionInput(id,foreign)),conflict);assert.deepEqual(await counts(db,id),{legacy:1,subscription:0});
    }else{
     const p=subscriptionInput(id,own);await rpcNew(db,p);assert.equal((await rpcNew(db,p,1)).replayed,true);
     if(state==='revoked')await rpcNew(db,subscriptionInput(id,own,{purchaseAt:p.purchaseAt,expiresAt:p.expiresAt,signedAt:new Date(Date.now()-50).toISOString(),checkedAt:new Date(Date.now()-5).toISOString(),revokedAt:new Date(Date.now()-100).toISOString()}),1);
     if(state==='erased')await db.query('select subscription_development.erase_owner_v1($1)',[own]);
     await assert.rejects(old(db,legacyInput(id,foreign)),conflict);assert.deepEqual(await counts(db,id),{legacy:0,subscription:1});
    }
   }
  });
  await t.test('legacy real RPC preserves 720h queue/snapshot/refund/replay while distinct new period remains independent',async()=>{
   const own=owner(30000),p=legacyInput('30001',own),q=legacyInput('30002',own,{purchaseAt:new Date(Date.parse(p.purchaseAt)+1000).toISOString()});
   const a=await old(db,p),b=await old(db,q);
   assert.equal(Date.parse(a.endsAt)-Date.parse(a.startsAt),720*3600000);assert.equal(b.startsAt,a.endsAt);assert.equal(Date.parse(b.endsAt)-Date.parse(b.startsAt),720*3600000);
   const replay=await old(db,{...q,catalogVersion:99,policyVersion:'synthetic_future',capacitySnapshot:{period:{quantity:1000}}});assert.equal(replay.replayed,true);assert.equal(replay.startsAt,b.startsAt);assert.equal(replay.endsAt,b.endsAt);
   await old(db,{...p,revokedAt:new Date().toISOString()});
   const retained=(await db.query("select * from public.storekit_grants where transaction_id='30002'")).rows[0];assert.deepEqual(retained.capacity_snapshot,q.capacitySnapshot);assert.equal(retained.catalog_version,q.catalogVersion);assert.equal(retained.policy_version,q.policyVersion);assert.equal(retained.starts_at.toISOString(),new Date(b.startsAt).toISOString());
   const n=subscriptionInput('30003',own);await rpcNew(db,n);const again=await rpcNew(db,n,1);assert.equal(again.replayed,true);assert.equal(again.epoch,1);
   const period=(await db.query("select * from subscription_development.periods where transaction_id='30003'")).rows[0];assert.equal(period.purchase_at.toISOString(),n.purchaseAt);assert.equal(period.expires_at.toISOString(),n.expiresAt);assert.deepEqual(period.capacity_snapshot,n.capacitySnapshot);
  });
  for(const winner of ['legacy','subscription'])for(const same of [true,false])await t.test(`actual concurrent ${winner} wins identity mutex (${same?'same':'foreign'} owner)`,async()=>{
   const id=String(++serial),own=owner(serial),loserOwner=same?own:owner(serial+1000);
   const win=await client(winner),lose=await client(winner==='legacy'?'subscription':'legacy');let open=false,pending;
   try{
    await win.query('begin');open=true;
    if(winner==='legacy')await rpcOld(win,legacyInput(id,own));else await rpcNew(win,subscriptionInput(id,own));
    pending=(winner==='legacy'?rpcNew(lose,subscriptionInput(id,loserOwner)):rpcOld(lose,legacyInput(id,loserOwner))).then(value=>({value}),error=>({error}));
    await waiting(db,lose.pid,win.pid);
    await win.query('commit');open=false;
    const result=await pending;assert.ok(result.error);conflict(result.error);
    assert.deepEqual(await counts(db,id),winner==='legacy'?{legacy:1,subscription:0}:{legacy:0,subscription:1});
   }finally{if(open)await win.query('rollback');if(pending)await pending;await Promise.all([win.end(),lose.end()]);}
  });
  for(const holder of ['legacy','subscription'])await t.test(`${holder} open writer does not block independent other-ledger transaction`,async()=>{
   const own=owner(++serial),id=String(++serial),otherId=String(++serial),a=await client(holder),b=await client(holder==='legacy'?'subscription':'legacy');let open=false;
   try{
    await a.query('begin');open=true;
    if(holder==='legacy')await rpcOld(a,legacyInput(id,own));else await rpcNew(a,subscriptionInput(id,own));
    // Must finish before the first transaction commits: catches the former SHARE/RowExclusive inversion.
    if(holder==='legacy')await rpcNew(b,subscriptionInput(otherId,own));else await rpcOld(b,legacyInput(otherId,own));
    await a.query('commit');open=false;assert.deepEqual(await counts(db,id),holder==='legacy'?{legacy:1,subscription:0}:{legacy:0,subscription:1});
   }finally{if(open)await a.query('rollback');await Promise.all([a.end(),b.end()]);}
  });
  await t.test('legacy owner lock chain remains acyclic: old A -> old B identity -> new B',async()=>{
   const own=owner(++serial),id=String(++serial),next=String(++serial),a=await client('legacy'),b=await client('legacy'),c=await client('subscription');let open=false,pb,pc;
   try{
    await a.query('begin');open=true;await rpcOld(a,legacyInput(id,own));
    pb=rpcOld(b,legacyInput(next,own)).then(value=>({value}),error=>({error}));await waiting(db,b.pid,a.pid);
    pc=rpcNew(c,subscriptionInput(next,own)).then(value=>({value}),error=>({error}));await waiting(db,c.pid,b.pid);
    await a.query('commit');open=false;assert.ok((await pb).value);conflict((await pc).error);assert.deepEqual(await counts(db,next),{legacy:1,subscription:0});
   }finally{if(open)await a.query('rollback');if(pb)await pb;if(pc)await pc;await Promise.all([a.end(),b.end(),c.end()]);}
  });
  await t.test('erase owner/family lock chain remains acyclic: erase -> new B identity -> old B',async()=>{
   const own=owner(++serial),id=String(++serial),next=String(++serial);await rpcNew(db,subscriptionInput(id,own));
   const a=await client('subscription'),b=await client('subscription'),c=await client('legacy');let open=false,pb,pc;
   try{
    await a.query('begin');open=true;await a.query('select subscription_development.erase_owner_v1($1)',[own]);
    pb=rpcNew(b,subscriptionInput(next,own)).then(value=>({value}),error=>({error}));await waiting(db,b.pid,a.pid);
    pc=rpcOld(c,legacyInput(next,own)).then(value=>({value}),error=>({error}));await waiting(db,c.pid,b.pid);
    await a.query('commit');open=false;assert.ok((await pb).value);conflict((await pc).error);assert.deepEqual(await counts(db,next),{legacy:0,subscription:1});
    await assert.rejects(old(db,legacyInput(id,own)),conflict);assert.equal((await db.query('select erased from subscription_development.families where original_transaction_id=$1',[id])).rows[0].erased,true);
   }finally{if(open)await a.query('rollback');if(pb)await pb;if(pc)await pc;await Promise.all([a.end(),b.end(),c.end()]);}
  });
  await t.test('legacy/service boundaries and candidate default-deny remain exact after fence behavior',async()=>{
   await assertLegacyPin(db,'after');
   for(const role of ['anon','authenticated','service_role']){
    const p=(await db.query("select has_function_privilege($1,'public.storekit_apply_verified_v1(jsonb)','EXECUTE') as old,(select bool_or(has_function_privilege($1,oid,'EXECUTE')) from pg_proc where pronamespace='subscription_development'::regnamespace) as new,has_schema_privilege($1,'subscription_development','USAGE') as usage",[role])).rows[0];
    assert.deepEqual(p,{old:role==='service_role',new:false,usage:false});
   }
   await db.query('reset request.jwt.claim.role');await assert.rejects(rpcOld(db,legacyInput('99999',owner(99999))),/FORBIDDEN/);
  });
 }finally{await owned.cleanup();}
}
