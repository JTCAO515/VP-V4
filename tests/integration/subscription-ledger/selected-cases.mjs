import assert from 'node:assert/strict';
import {readFileSync,lstatSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createOwnedPg} from '../ios004-user-address/owned-pg.mjs';
import {developmentLedger} from '../../../lib/server/entitlements/subscription-ledger/persistence.ts';
import {createDevelopmentVerifier} from '../../../lib/server/entitlements/subscription-ledger/verification.ts';
import {parseSnapshot} from '../../../lib/server/entitlements/subscription-ledger/contract.ts';
import {owner,other,jws,payload,options} from '../../contract/subscription-ledger/fixtures.mjs';
const sql=readFileSync(new URL('../../../supabase/migrations/20261016051000_subscription_development_ledger.sql',import.meta.url),'utf8');
const legacy=readFileSync(new URL('../../../supabase/migrations/20260926113804_vpj34_storekit_grants.sql',import.meta.url),'utf8');
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function raw(tx,family=tx,who=owner,changes={}){
 const now=Date.now()-10;
 const p={schemaVersion:'subscription-verified-period/1',environment:'Sandbox',source:'apple_server_verified',ownerId:who,appAccountToken:who,
 transactionId:tx,originalTransactionId:family,productId:'synthetic.monthly',subscriptionGroupId:'100',purchaseAt:new Date(now-60000).toISOString(),expiresAt:new Date(now+240000).toISOString(),signedAt:new Date(now-1000).toISOString(),checkedAt:new Date(now).toISOString(),revokedAt:null,transactionReason:tx===family?'PURCHASE':'RENEWAL',catalogVersion:3,policyVersion:'subscription-development-policy/1',capacitySnapshot:{period:{kind:'per_verified_period',quantity:80},burst:{kind:'account_rolling',hours:24,quantity:12}},...changes};
 p.receiptDigest=digest(p);return p;
}
export async function run(t){
 const resource=createOwnedPg({bin:process.env.SUBSCRIPTION_PG_BIN,module:process.env.SUBSCRIPTION_PG_MODULE});
 resource.start();
 let db=await resource.connect();let replacement;
 const fixture={cleanup:async()=>{if(replacement)await replacement.end();await resource.cleanup();}};
 const query=(sql,values)=>db.query(sql,values);
 const apply=async(p,epoch)=>(await db.query('select subscription_development.apply_period_v1($1,$2) as r',[p,epoch])).rows[0].r;
 const read=async who=>(await db.query('select subscription_development.read_owner_v1($1) as r',[who])).rows[0].r;
 const fingerprint=async()=>digest((await db.query(`select jsonb_build_object('functions',(select jsonb_agg(pg_get_functiondef(oid) order by oid::regprocedure::text) from pg_proc where proname like 'storekit_%'), 'relations',(select jsonb_agg(row_to_json(c)) from (select relname,relacl,relrowsecurity,relforcerowsecurity from pg_class where oid='public.storekit_grants'::regclass)c),'constraints',(select jsonb_agg(pg_get_constraintdef(oid) order by conname) from pg_constraint where conrelid='public.storekit_grants'::regclass),'columns',(select jsonb_agg(row_to_json(a)) from (select attname,atttypid,attnotnull from pg_attribute where attrelid='public.storekit_grants'::regclass and attnum>0 order by attnum)a),'policies',(select jsonb_agg(row_to_json(p)) from (select * from pg_policies where tablename='storekit_grants')p),'rows',(select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from public.storekit_grants s)) as value`)).rows[0].value);
 try{
  await db.query("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create function auth.uid() returns uuid language sql as 'select null::uuid'; create function auth.role() returns text language sql as 'select current_setting(''request.jwt.claim.role'',true)';");
  await db.query(legacy);const before=await fingerprint();
  await t.test('migration apply rollback leaves no schema, old table/functions/policy/data unchanged',async()=>{
   await db.query('begin');await db.query(sql);await db.query('rollback');
   assert.equal((await db.query("select to_regnamespace('subscription_development') as n")).rows[0].n,null);assert.equal(await fingerprint(),before);
   await db.query(sql);assert.equal(await fingerprint(),before);
  });
  const original=raw('2001');
  await t.test('durable original period, exact replay, restart adapter and owner projection',async()=>{
   const first=await apply(original,0);assert.equal(first.epoch,1);assert.equal(first.replayed,false);
   assert.equal((await apply(original,1)).replayed,true);
   assert.equal((await read(owner)).state,'active');assert.ok(parseSnapshot(await read(owner)));
   const nextAdapter=developmentLedger(query);assert.equal((await nextAdapter.read(owner)).period.descriptorId,'Sandbox:2001');
   assert.equal((await read(other)).state,'none');
  });
  await t.test('injected verified source actually persists through branded adapter and reads same period',async()=>{
   const p={...payload,transactionId:'3001',originalTransactionId:'3001',appAccountToken:other};
   const candidate=await createDevelopmentVerifier(options(p,p))(jws,other);
   const receipt=await developmentLedger(query).apply(candidate,0);assert.equal(receipt.descriptorId,'Sandbox:3001');
   const snapshot=await developmentLedger(query).read(other);assert.equal(snapshot.state,'active');assert.equal(snapshot.period.purchaseAt,candidate.purchaseAt);
  });
  await t.test('same id changed period, cross owner/family and overlapping period reject without row mutation',async()=>{
   for(const p of [{...original,expiresAt:new Date(Date.parse(original.expiresAt)+1).toISOString()},{...original,ownerId:other,appAccountToken:other},{...original,originalTransactionId:'999'},{...original,transactionId:'2002',transactionReason:'RENEWAL'}]) await assert.rejects(apply(p,1),/CONFLICT/);
   assert.equal((await read(owner)).period.expiresAt,original.expiresAt);
  });
  await t.test('revocation before initial purchase persists tombstone, clean replay never resurrects',async()=>{
   const p=raw('4001','4001',owner);p.revokedAt=p.signedAt;p.receiptDigest=digest(p);
   assert.equal((await apply(p,0)).state,'revoked');
   await assert.rejects(apply({...p,revokedAt:null,receiptDigest:'f'.repeat(64)},1),/CONFLICT/);
   assert.equal((await db.query("select count(*)::int as n from subscription_development.periods where transaction_id='4001'")).rows[0].n,1);
  });
  await t.test('refund only matching period, newer observation monotonic, no extra capacity descriptor',async()=>{
   const revoked={...original,signedAt:new Date(Date.now()-100).toISOString(),checkedAt:new Date(Date.now()-5).toISOString(),revokedAt:new Date(Date.now()-200).toISOString()};revoked.receiptDigest=digest(revoked);
   assert.equal((await apply(revoked,1)).epoch,2);
   await assert.rejects(apply(original,2),/STALE_OBSERVATION|CONFLICT/);
   const p=(await db.query("select * from subscription_development.periods where transaction_id='2001'")).rows[0];assert.equal(p.expires_at.toISOString(),original.expiresAt);assert.equal(p.capacity_snapshot.period.quantity,80);
  });
  await t.test('renewal uses Apple next period; late historical arrival does not move any interval',async()=>{
   const epoch=2, end=Date.parse(original.purchaseAt);
   const late=raw('2000','2001',owner,{purchaseAt:new Date(end-300000).toISOString(),expiresAt:new Date(end).toISOString()});
   assert.equal((await apply(late,epoch)).epoch,3);
   assert.equal((await db.query("select purchase_at from subscription_development.periods where transaction_id='2001'")).rows[0].purchase_at.toISOString(),original.purchaseAt);
   assert.equal((await db.query("select count(*)::int as n from subscription_development.periods where original_transaction_id='2001'")).rows[0].n,2);
  });
  await t.test('expiry is server time and unknown/future state never active',async()=>{
   const p=raw('5001','5001','11111111-1111-4111-8111-111111111111',{purchaseAt:new Date(Date.now()-600000).toISOString(),expiresAt:new Date(Date.now()-1000).toISOString()});
   await apply(p,0);assert.equal((await read(p.ownerId)).state,'expired');
   await assert.rejects(apply(raw('5002','5002',owner,{purchaseAt:new Date(Date.now()+10000).toISOString()}),0),/INVALID/);
  });
  await t.test('invalid schema/source/types/size/null/baseline and expected epoch fail closed',async()=>{
   for(const patch of [{schemaVersion:'unknown'},{environment:'Production'},{source:'localTest'},{catalogVersion:2},{catalogVersion:'3'},{capacitySnapshot:{}},{transactionId:'x'},{appAccountToken:other},{extra:true},{ownerId:null},{productId:'dev.local'},{productId:'x'.repeat(20000)},{revokedAt:3}]) await assert.rejects(apply({...raw('6001'),...patch},0));
   await assert.rejects(apply(original,999),/EPOCH_CONFLICT/);
  });
  await t.test('same receipt digest with another signed payload rejects even if otherwise current',async()=>{
   const p=raw('6002');await apply(p,0);
   await assert.rejects(apply({...p,signedAt:new Date(Date.now()-50).toISOString(),checkedAt:new Date(Date.now()-5).toISOString()},1),/RECEIPT_CONFLICT/);
  });
  await t.test('concurrent same transaction has one committed receipt/period and CAS conflict',async()=>{
   const {Client}=createRequire(import.meta.url)(process.env.SUBSCRIPTION_PG_MODULE);
   const config={host:db.host,user:'postgres',database:'postgres'};const c= new Client(config);await c.connect();
   try{
    const p=raw('7001');const [a,b]=await Promise.allSettled([apply(p,0),c.query('select subscription_development.apply_period_v1($1,0)',[p])]);
    assert.equal([a,b].filter(v=>v.status==='fulfilled').length,1);
    assert.equal((await db.query("select count(*)::int as n from subscription_development.periods where transaction_id='7001'")).rows[0].n,1);
    assert.equal((await apply(p,1)).replayed,true);
   }finally{await c.end();}
  });
  await t.test('transaction rollback and lost-ACK recovery do not issue extra identities',async()=>{
   const p=raw('8001');await db.query('begin');await apply(p,0);await db.query('rollback');
   assert.equal((await db.query("select count(*)::int as n from subscription_development.periods where transaction_id='8001'")).rows[0].n,0);
   await apply(p,0);const recovered=await apply(p,1);assert.equal(recovered.replayed,true);assert.equal(recovered.descriptorId,'Sandbox:8001');
  });
  await t.test('read-only legacy collision check denies an existing synthetic old identity',async()=>{
   await db.query("insert into public.storekit_grants values('Sandbox','9001',$1,$1,'synthetic.legacy',now(),now(),now()+interval '720 hours',2,'old', '{}'::jsonb,'active',now(),null)",[owner]);
   await assert.rejects(apply(raw('9001'),0),/LEGACY_TRANSACTION_CONFLICT/);
   await db.query("delete from public.storekit_grants where transaction_id='9001'"); // synthetic fixture cleanup only
  });
  await t.test('anon/authenticated/service_role actual table/function access all default denied',async()=>{
   for(const role of ['anon','authenticated','service_role']){
    await db.query(`set role ${role}`);
    try{
     for(const table of ['families','periods','receipts'])await assert.rejects(db.query(`select * from subscription_development.${table}`),/permission denied/);
     for(const call of ["read_owner_v1(null)","apply_period_v1('{}',0)","export_owner_v1(null,null)","erase_owner_v1(null)"]) await assert.rejects(db.query(`select subscription_development.${call}`),/permission denied/);
    }finally{await db.query('reset role');}
   }
   const functions=await db.query("select proname,prosecdef,has_function_privilege('service_role',oid,'EXECUTE') as executable from pg_proc where pronamespace='subscription_development'::regnamespace");
   assert.equal(functions.rows.length,4);assert.ok(functions.rows.every(r=>!r.prosecdef&&!r.executable));
  });
  await t.test('bounded private export/erasure preserves receipts and denies future family restores',async()=>{
   const exported=(await db.query('select subscription_development.export_owner_v1($1,null) as e',[other])).rows[0].e;
   assert.equal(exported.items.length,1);assert.equal(exported.registeredWithPrivacy,false);
   assert.equal((await db.query('select subscription_development.erase_owner_v1($1) as n',[other])).rows[0].n,1);
   assert.equal((await read(other)).state,'none');
   const p=raw('3002','3001',other,{purchaseAt:new Date(Date.now()-50000).toISOString()});await assert.rejects(apply(p,2),/FAMILY_CONFLICT/);
   const f=(await db.query("select * from subscription_development.families where original_transaction_id='3001'")).rows[0];assert.equal(f.owner_id,null);assert.equal(f.app_account_token,null);assert.equal(f.erased,true);
   assert.equal((await db.query("select count(*)::int as n from subscription_development.receipts where transaction_id='3001'")).rows[0].n,1);
  });
  await t.test('freshness expiration and ambiguous active families conceal private period',async()=>{
   const own='22222222-2222-4222-8222-222222222222';const p=raw('10001','10001',own,{purchaseAt:new Date(Date.now()-1200000).toISOString(),signedAt:new Date(Date.now()-900000).toISOString()});await apply(p,0);
   await db.query("update subscription_development.periods set checked_at=clock_timestamp()-interval '10 minutes' where transaction_id='10001'");
   const stale=await read(own);assert.equal(stale.state,'reconciliation_required');assert.equal(stale.period,null);assert.equal(stale.ownerId,null);
   await apply(raw('10002','10002',own),0);const ambiguous=await read(own);assert.equal(ambiguous.state,'reconciliation_required');assert.equal(ambiguous.period,null);
  });
  await t.test('private dump/restore retains erased family, revocation and epochs without adding role grants',async()=>{
   const {socket}=resource.descriptor;
   let dump=execFileSync(join(process.env.SUBSCRIPTION_PG_BIN,'pg_dump'),['-h',socket,'-U','postgres','-d','postgres','--schema=subscription_development','--no-comments','--inserts'],{encoding:'utf8',maxBuffer:1024*1024});
   dump=dump.replace(/^\\(?:un)?restrict .*$/gm,'');
   await db.query('create database subscription_restore');
   const {Client}=createRequire(import.meta.url)(process.env.SUBSCRIPTION_PG_MODULE);const restored=new Client({host:socket,user:'postgres',database:'subscription_restore'});await restored.connect();
   try{
    await restored.query(dump);
    const erased=(await restored.query("select * from subscription_development.families where original_transaction_id='3001'")).rows[0];assert.equal(erased.erased,true);assert.equal(erased.owner_id,null);assert.equal(erased.epoch,'2');
    assert.equal((await restored.query("select revoked_at is not null as revoked from subscription_development.periods where transaction_id='2001'")).rows[0].revoked,true);
    assert.equal((await restored.query("select has_schema_privilege('service_role','subscription_development','USAGE') as allowed")).rows[0].allowed,false);
    assert.equal((await restored.query("select subscription_development.read_owner_v1($1) as r",[other])).rows[0].r.state,'none');
   }finally{await restored.end();}
  });
  await t.test('owned PG restart preserves committed receipts and period identities',async()=>{
   const {socket,data,root}=resource.descriptor;
   for(const path of [root,socket,data]){const stat=lstatSync(path);assert.equal(stat.isSymbolicLink(),false);assert.equal(stat.mode&0o777,0o700);}
   assert.equal(readFileSync(join(data,'postmaster.pid'),'utf8').split('\n')[1],data);
   await db.end();
   execFileSync(join(process.env.SUBSCRIPTION_PG_BIN,'pg_ctl'),['-D',data,'-l',join(root,'log'),'-m','fast','-w','restart'],{stdio:'pipe'});
   const {Client}=createRequire(import.meta.url)(process.env.SUBSCRIPTION_PG_MODULE);replacement=new Client({host:socket,user:'postgres',database:'postgres'});await replacement.connect();db=replacement;
   assert.equal((await db.query("select count(*)::int as n from subscription_development.receipts where transaction_id='7001'")).rows[0].n,1);
   const tombstone=(await db.query("select erased from subscription_development.families where original_transaction_id='3001'")).rows[0];assert.equal(tombstone.erased,true);
  });
  await t.test('legacy catalog/functions/constraints/ACL/policies/data remain byte equivalent',async()=>assert.equal(await fingerprint(),before));
 }finally{await fixture.cleanup();}
}
