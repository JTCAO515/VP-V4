import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {NextRequest} from 'next/server.js';
import {nativeTripInventoryHTTP} from '../../../lib/server/trip/inventory/http.ts';
import {createNativeTripDataAdapter} from '../../../lib/server/identity/user-data-adapter.ts';
import {nativeIdentityHTTP} from '../../../lib/server/identity/native-http.ts';
import {getNativeRuntimeConfig} from '../../../lib/server/identity/native-config.ts';
import {acquireH04TripInventory} from '../../../evals/harness/runtime-trip-inventory/index.ts';
import {createNativeInventoryTransport} from '../../../evals/harness/runtime-trip-inventory/transport.ts';
import {boundary,plan} from '../../contract/trip-inventory/fixtures.ts';
import {parseInventory} from '../../../lib/server/trip/inventory/contract.ts';
import {database} from '../canonical-place-ask-http/database.mjs';
import {fixedSource} from '../canonical-place-ask-http/fixed-source.mjs';
import {productionServer} from '../canonical-place-ask-http/adapter.mjs';
import {inventoryWire} from './wire.mjs';
if(process.env.TRIP_INVENTORY_NATIVE_PG!=='1')test('trip inventory PG requires explicit activation',{skip:true},()=>{});
else test('inventory actual HTTP / original SDK / PG17 RLS two-owner canonical read',async t=>{
 const cleanup=[],owned={after:fn=>cleanup.push(fn)};t.after(async()=>{for(const fn of cleanup.reverse())await fn();});
 const source=await fixedSource(),db=await database(owned,{bin:process.env.VP_WIKI_PG_BIN,module:process.env.VP_WIKI_PG_MODULE,...source});
 const ports=source.canonicalFixturePorts(db.connect);owned.after(()=>ports.close());
 const wire=await inventoryWire(owned,db,ports),app=await productionServer(owned,{handler:req=>new URL(req.url).pathname==='/api/auth/native/v2/session'?nativeIdentityHTTP(req,'session',getNativeRuntimeConfig(req,'session','identity')):nativeTripInventoryHTTP(req),NextRequest});
 const env={VISEPANDA_NATIVE_LOCAL_TRIP:'true',VISEPANDA_NATIVE_LOCAL_SESSION:'true',NEXT_PUBLIC_SUPABASE_URL:wire.origin,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:wire.key,VERCEL_ENV:undefined,VISEPANDA_NATIVE_STAGING:undefined,VISEPANDA_NATIVE_PRODUCTION:undefined};
 const saved=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));for(const[k,v]of Object.entries(env))v===undefined?delete process.env[k]:process.env[k]=v;
 owned.after(()=>{for(const[k,v]of Object.entries(saved))v===undefined?delete process.env[k]:process.env[k]=v;});
 const acl=async()=>(await ports.query("select md5(string_agg(v,E'\\n' order by v)) value from (select oid::text||coalesce(relacl::text,'') v from pg_class union all select oid::text||coalesce(proacl::text,'') from pg_proc) x")).rows[0].value;
 const beforeACL=await acl();
 const seed=async(withTrip=true)=>{
  const actor={id:randomUUID(),session:randomUUID()},trip=randomUUID();
  await ports.query('insert into auth.users(id) values($1);',[actor.id]);await ports.query('insert into auth.sessions(id,user_id) values($1,$2)',[actor.session,actor.id]);
  await ports.query('insert into identity_private.mobile_accounts(owner_id,session_id,epoch) values($1,$2,1)',[actor.id,actor.session]);
  await ports.query('insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch) values($1,$2,$3,1)',[actor.id,randomUUID(),actor.session]);
  if(withTrip)await ports.query("insert into public.trips(id,owner_id,title,head_version) values($1,$2,'PRIVATE canonical title',0)",[trip,actor.id]);
  return {actor,trip,token:wire.register(actor)};
 };
 const a=await seed(),b=await seed();
 const get=(f,init={})=>fetch(app+'/api/trips/native/v2/inventory',{...init,headers:{authorization:'Bearer '+f.token,...init.headers}});
 await t.test('ordinary SDK sees only owned RLS-visible canonical zero',async()=>{
  for(const f of [a,b]){const response=await get(f),dto=await response.json();assert.equal(response.status,200,JSON.stringify(dto));assert.ok(parseInventory(dto));assert.equal(dto.ownerId,f.actor.id);assert.equal(dto.count,1);assert.equal(dto.trips[0].id,f.trip);assert.equal(dto.trips[0].headVersion,0);assert.equal(dto.trips[0].confirmationState,'initial');assert.deepEqual(dto.trips[0].content.days,[]);assert.equal(response.headers.get('cache-control'),'private, no-store');}
  const adapter=await createNativeTripDataAdapter(new NextRequest(app,{headers:{authorization:'Bearer '+a.token}}),{url:wire.origin,publishableKey:wire.key});
  assert.ok(adapter);assert.deepEqual(await adapter.getTrip(b.trip),{error:'FORBIDDEN'});
  assert.ok(wire.events.filter(e=>e.port==='trips'&&e.query.includes('count')).length===0); // count is Prefer, never a caller query authority
  assert.ok(wire.events.filter(e=>e.port==='trips'&&e.query.includes('owner_id')).every(e=>e.query.includes('owner_id=eq.'+e.owner)));
 });
 await t.test('exact zero comes from actual RLS/count/identity reads',async()=>{
  const empty=await seed(false),r=await get(empty);assert.equal(r.status,200);const dto=await r.json();assert.equal(dto.count,0);assert.deepEqual(dto.trips,[]);assert.ok(parseInventory(dto));
 });
 await t.test('consumer acquires actual HTTP snapshots and original Native session around controlled Ask',async()=>{
  const input=plan();Object.assign(input,{context:{...input.context,ownerId:b.actor.id,sessionId:b.actor.session}});
  const controlled=boundary(input),native=createNativeInventoryTransport({allowedOrigin:'https://synthetic.invalid',authorizedFetch:async(url,init)=>{
   const u=new URL(String(url));assert.equal(u.origin,'https://synthetic.invalid');assert.ok(['/api/trips/native/v2/inventory','/api/auth/native/v2/session'].includes(u.pathname));
   const reply=await fetch(app+u.pathname,{...init,headers:{authorization:'Bearer '+b.token}});
   // Explicit synthetic HTTPS-name/loopback-wire bridge; blank URL is not origin attestation.
   return new Response(await reply.arrayBuffer(),{status:reply.status,headers:reply.headers});
  }});
  const tasksBefore=(await ports.query('select count(*) n from turn_private.service_tasks')).rows[0].n;
  const report=await acquireH04TripInventory(input,(q,s)=>['session','inventory'].includes(q.port)?native(q,s):controlled.transport(q,s));
  assert.equal(report.tripCollectionUnchanged,true);assert.equal(report.before.count,1);assert.equal(report.after.count,1);assert.equal(report.submitDispatches,1);assert.equal(report.ask.outcome,'clarification');
  assert.equal(report.finalAcceptance,'NOT_RUN');assert.equal(report.originAuthentication,'unknown');assert.ok(!JSON.stringify(report).includes('PRIVATE canonical title'));
  assert.equal((await ports.query('select count(*) n from turn_private.service_tasks')).rows[0].n,tasksBefore,'Ask part is controlled transport, not a real admission/model run');
 });
 await t.test('Cookie/Origin/query/POST/forged role fail without disclosure',async()=>{
  for(const init of [{headers:{cookie:'x=y'}},{headers:{origin:'https://foreign.invalid'}},{method:'POST'}]){const r=await get(a,init);assert.equal(r.status,400);assert.deepEqual(Object.keys(await r.json()),['error']);}
  const query=await fetch(app+'/api/trips/native/v2/inventory?limit=1',{headers:{authorization:'Bearer '+a.token}});assert.equal(query.status,400);
  const role=await get({...a,token:wire.register({...a.actor,role:'service_role'})});assert.equal(role.status,401);
  const parts=a.token.split('.');const claims=JSON.parse(Buffer.from(parts[1],'base64url'));claims.sub=b.actor.id;parts[1]=Buffer.from(JSON.stringify(claims)).toString('base64url');
  const forged=await get({...a,token:parts.join('.')});assert.equal(forged.status,401);
 });
 await t.test('missing exact count and truncated rows never return empty complete',async()=>{
  for(const fault of [{nullCount:true},{empty:true}]){wire.faults.push({table:'trips',match:u=>u.searchParams.has('owner_id'),...fault});const r=await get(a);assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:{code:'PROVIDER_UNAVAILABLE'}});}
 });
 await t.test('set race and session replacement fail closed',async()=>{
  wire.faults.push({table:'trips',match:u=>u.searchParams.has('owner_id'),action:()=>ports.query("insert into public.trips(id,owner_id,title,head_version) values($1,$2,'Concurrent',0)",[randomUUID(),a.actor.id])});
  const race=await get(a);assert.equal(race.status,503);
  wire.faults.push({table:'trips',match:u=>u.searchParams.has('owner_id'),action:()=>ports.query('update identity_private.mobile_accounts set session_id=null where owner_id=$1',[a.actor.id])});
  const revoked=await get(a);assert.notEqual(revoked.status,200);assert.deepEqual(Object.keys(await revoked.json()),['error']);
 });
 await t.test('original three-draft capacity and RLS remain enforced without fixture grants',async()=>{
  for(let i=0;i<2;i++)await ports.query("insert into public.trips(id,owner_id,title,head_version) values($1,$2,'Cap fixture',0)",[randomUUID(),b.actor.id]);
  await assert.rejects(ports.query("insert into public.trips(id,owner_id,title,head_version) values($1,$2,'Over existing capacity',0)",[randomUUID(),b.actor.id]),/TRIP_CAPACITY/);
  const r=await get(b);assert.equal(r.status,200);const data=await r.json();assert.equal(data.count,3);assert.ok(parseInventory(data));
  assert.equal((await ports.query("select relrowsecurity value from pg_class where oid='public.trips'::regclass")).rows[0].value,true);
 });
 assert.equal(await acl(),beforeACL,'all table/function ACLs unchanged');
 console.log(JSON.stringify({marker:'TRIP_INVENTORY_HTTP_SDK_PG17_RLS',migrations:source.migrations.length,checkpoint:source.checkpoint,database:db.settings,identity:'synthetic registered-token Auth/REST adapter; NOT managed Auth/PostgREST/target/provider',newGrants:0}));
});
