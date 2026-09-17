import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { startIntakeDatabase } from './environment.mjs';
import { handleIntake } from '../../../lib/server/intake/http.ts';
import { INTAKE_POLICY } from '../../../lib/server/intake/contract.ts';
const input = (overrides = {}) => ({ action: 'apply', email: randomBytes(5).toString('hex') + '@example.test', locale: 'en', researchConsent: true, marketingConsent: false, policyVersion: INTAKE_POLICY, token: randomBytes(32).toString('hex'), website: '', ...overrides });
test('research intake: real PostgreSQL/PostgREST lifecycle and adversarial cases', { skip: process.env.VP_INTAKE_POSTGRES !== '1', timeout: 120000 }, async t => {
 const db = await startIntakeDatabase({port:56964}); t.after(db.stop);
 const a = input();
 assert.deepEqual(await db.rpc(a), {kind:'unavailable'});
 db.sql('update research_intake_private.settings set enabled=true');
 await t.test('direct public RPC validates consent, schema, email, honeypot and locale', async () => {
   for (const invalid of [{researchConsent:false},{marketingConsent:'yes'},{locale:'es'},{email:'bad'},{policyVersion:'old'},{token:'short'},{extra:1}]) assert.equal((await db.rpc(input(invalid))).kind,'invalid_input');
   assert.equal((await db.rpc(input({website:'bot.example'}))).kind,'request_not_accepted');
   assert.equal(db.sql('select count(*) from research_intake_private.applications'),'0');
 });
 await t.test('real HTTP handler → REST → PostgreSQL returns persisted receipt; retries are idempotent', async () => {
   const response=await handleIntake(new Request('https://research.example/api/intake',{method:'POST',headers:{origin:'https://research.example','content-type':'application/json'},body:JSON.stringify(a)}), db.rpc);
   assert.equal(response.status,201); assert.equal(response.headers.get('cache-control'),'no-store');
   assert.equal(db.sql('select count(*) from research_intake_private.applications'),'1');
   assert.deepEqual(await Promise.all(Array.from({length:8},()=>db.rpc(a))),Array(8).fill({kind:'received'}));
   assert.equal(db.sql('select count(*) from research_intake_private.events'),'2');
   assert.equal((await db.rpc({...a,email:'other@example.test'})).kind,'receipt_conflict');
   assert.equal((await db.rpc({...a,token:randomBytes(32).toString('hex')})).kind,'received');
   assert.equal(db.sql('select count(*) from research_intake_private.applications'),'1');
   assert.notEqual(db.sql('select token_hash from research_intake_private.applications'),a.token);
 });
 await t.test('direct table and staff RPC access denied for anon and signed-in users', async () => {
   for(const role of ['anon','authenticated']) {
     assert.throws(()=>db.sql('select * from research_intake_private.applications',role),/permission denied/);
     assert.throws(()=>db.sql("select public.research_intake_record_event_v1(gen_random_uuid(),'enrollment')",role),/permission denied/);
   }
 });
 await t.test('independent consent and ordered, idempotent staff events; no invented first value', async () => {
   const b=input({marketingConsent:true}); assert.equal((await db.rpc(b)).kind,'received');
   const id=db.sql("select id from research_intake_private.applications where marketing_consent");
   const event = name => JSON.parse(db.sql(`select public.research_intake_record_event_v1('${id}','${name}')`,'service_role'));
   assert.equal(event('first_value').kind,'invalid_transition'); assert.equal(event('enrollment').kind,'recorded'); assert.equal(event('enrollment').kind,'recorded'); assert.equal(event('first_value').kind,'recorded'); assert.equal(event('rejection').kind,'invalid_transition');
   assert.equal(db.sql(`select count(*) from research_intake_private.events where application_id='${id}'`),'5');
   const c=input(); await db.rpc(c);
   const rejectedId=db.sql(`select id from research_intake_private.applications where email='${c.email}'`);
   assert.equal(JSON.parse(db.sql(`select public.research_intake_record_event_v1('${rejectedId}','rejection')`,'service_role')).kind,'recorded');
   assert.equal(JSON.parse(db.sql(`select public.research_intake_record_event_v1('${rejectedId}','enrollment')`,'service_role')).kind,'invalid_transition');
 });
 await t.test('withdraw-before-submit fences a delayed submission and duplicate receipt cannot withdraw original', async () => {
   const pending=input(); await db.rpc({action:'withdraw',token:pending.token});
   assert.equal((await db.rpc(pending)).kind,'receipt_conflict');
   const duplicate={...a,token:randomBytes(32).toString('hex')};
   assert.equal((await db.rpc(duplicate)).kind,'received');
   assert.equal((await db.rpc({...duplicate,email:'changed@example.test'})).kind,'receipt_conflict');
   await db.rpc({action:'withdraw',token:duplicate.token});
   assert.equal(db.sql(`select count(*) from research_intake_private.applications where email='${a.email}'`),'1');
 });
 await t.test('process restart retains records, receipts and revocations', async () => {
   const before=db.sql('select count(*) from research_intake_private.applications');
   db.restart();
   let ready=false;for(let i=0;i<30;i++){try{if((await db.rpc(a)).kind==='received'){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
   assert.equal(ready,true);assert.equal(db.sql('select count(*) from research_intake_private.applications'),before);
 });
 await t.test('rate limit is durable, races cannot exceed capacity, withdrawal remains usable', async () => {
   db.sql('update research_intake_private.settings set attempts=99');
   const results=await Promise.all([db.rpc(input()),db.rpc(input())]);
   assert.deepEqual(results.map(r=>r.kind).sort(),['rate_limited','received']);
   assert.equal((await db.rpc(a)).kind,'received');
   const count=db.sql("select count(*) from research_intake_private.applications where email is not null");
   assert.equal((await db.rpc({action:'withdraw',token:randomBytes(32).toString('hex')})).kind,'withdrawn');
   assert.equal(db.sql("select count(*) from research_intake_private.applications where email is not null"),count);
   db.sql('update research_intake_private.settings set enabled=false');
   assert.equal((await db.rpc({action:'withdraw',token:a.token})).kind,'withdrawn');
   assert.equal((await db.rpc({action:'withdraw',token:a.token})).kind,'withdrawn');
   assert.equal(db.sql("select count(*) from research_intake_private.applications where status='withdrawn' and email is null and not research_consent and not marketing_consent"),'1');
   assert.equal(db.sql("select count(*) from research_intake_private.events where event='withdrawal'"),'1');
   db.sql("update research_intake_private.settings set enabled=true,window_start=clock_timestamp()-interval '2 hours'");
   assert.equal((await db.rpc(a)).kind,'receipt_conflict');
   assert.equal((await db.rpc(input({email:a.email}))).kind,'received');
 });
});
