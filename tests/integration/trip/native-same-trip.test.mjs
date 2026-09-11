import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { NextRequest } from 'next/server.js';
import { createNativeTripDataAdapter } from '../../../lib/server/identity/user-data-adapter.ts';
import { identityLocalEnv } from '../identity/local-supabase.mjs';
import { waitForNativeAPI } from '../identity/native-api-readiness.mjs';

test('local native/Web share one immutable Trip with confirmed intent, CAS and ordinary-owner isolation', {skip:process.env.VP_LOCAL_SAME_TRIP!=='true',timeout:180000},async t=>{
 const e=identityLocalEnv();assert.ok(e?.API_URL && e.DB_CONTAINER,'explicit disposable target required');
 const port=process.env.VP_NATIVE_API_PORT ?? '59931';assert.match(port,/^[1-9][0-9]{3,4}$/);
 const api='http://127.0.0.1:'+port,key=e.PUBLISHABLE_KEY||e.ANON_KEY,users=[];
 await waitForNativeAPI(api,null);
 const sql=input=>execFileSync('docker',['exec','-i',e.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 t.after(()=>{if(users.length){const ids=users.map(u=>"'"+u.id+"'").join(',');assert.equal(sql(`delete from public.trip_events where owner_id in (${ids}); delete from public.trip_audit_events where owner_id in (${ids}); delete from auth.users where id in (${ids}); select count(*) from auth.users where id in (${ids});`),'0','exact synthetic cleanup');}});
 const client=token=>createClient(e.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:'Bearer '+token}}}:{})});
 for(let i=0;i<2;i++){
  const sdk=client(),email='vpj05-http-'+randomUUID()+'@example.test',password='Local-only-'+randomUUID();
  const r=await sdk.auth.signUp({email,password});if(r.data.user)users.push({id:r.data.user.id,email,password,sdk,session:r.data.session});assert.ok(r.data.session&&!r.error,'ordinary account');
 }
 const call=async(path,{token,cookie,body,origin}={})=>{
  const r=await fetch(api+path,{method:body===undefined?'GET':'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...(origin?{Origin:origin}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  assert.ok(r.headers.get('content-type')?.includes('application/json'),'JSON response '+path+' '+r.status);return {status:r.status,data:await r.json()};
 };
 const login=async u=>{
  const attemptId=randomUUID();const c=await call('/api/auth/native/v2/credentials',{body:{email:u.email,password:u.password,attemptId}});assert.equal(c.status,200);
  const committed=await call('/api/auth/native/v2/login',{token:c.data.accessToken,body:{attemptId}});assert.equal(committed.status,200);return c.data.accessToken;
 };
 const jar=new Map();const ssr=createServerClient(e.API_URL,key,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});
 assert.equal((await ssr.auth.setSession({access_token:users[0].session.access_token,refresh_token:users[0].session.refresh_token})).error,null);const cookie=[...jar].map(([n,v])=>n+'='+v).join('; ');
 const token=await login(users[0]),n=(path,body)=>call('/api/trips/native/v2'+path,{token,body}),w=(path,body)=>call('/api/trips'+path,{cookie,body,origin:body===undefined?undefined:api});
 const tripId=randomUUID();let created=await n('',{tripId,title:'Native start'});assert.equal(created.status,201);assert.equal(created.data.trip.id,tripId);assert.equal((await n('',{tripId,title:'Native start'})).data.reused,true);
 assert.ok((await w('')).data.trips.some(trip=>trip.id===tripId));
 let native=await n('/'+tripId),web=await w('/'+tripId);assert.equal(native.data.confirmationState,'initial');assert.deepEqual(native.data.content,web.data.content);assert.equal(web.data.trip.headVersion,0);
 const dayId=randomUUID(),itemId=randomUUID();const patch={expectedVersion:0,operations:[{kind:'upsert_day',dayId,date:'2026-10-01',timeZone:'Asia/Shanghai'},{kind:'upsert_item',dayId,itemId,title:'Native item',startsAt:'2026-10-01T10:00:00+08:00'}]};
 const first=await n('/'+tripId+'/proposal',{patch});assert.equal(first.status,201);
 const original=await n('/'+tripId+'/proposal?proposalId='+first.data.proposalId);assert.equal(original.status,200);assert.match(original.data.proposal.digest,/^trip-v2:[0-9a-f]{64}$/);assert.equal(original.data.proposal.before.version,0);assert.equal(original.data.proposal.after.days[0].items[0].title,'Native item');
 assert.equal((await n('/'+tripId)).data.content.days.length,0,'proposal is not a confirmed write');
 const revisedPatch={...patch,operations:patch.operations.map(op=>op.kind==='upsert_item'?{...op,title:'Web revision'}:op)};
 const revised=await w('/'+tripId+'/proposal/revision',{proposalId:first.data.proposalId,patch:revisedPatch});assert.equal(revised.status,201);
 const deniedOld=await n('/'+tripId+'/confirm',{proposalId:first.data.proposalId,idempotencyKey:randomUUID(),digest:original.data.proposal.digest});assert.equal(deniedOld.status,409);assert.equal((await n('/'+tripId)).data.trip.headVersion,0,'old revision cannot apply');
 const pending=await n('/'+tripId+'/proposal?proposalId='+revised.data.proposalId);assert.equal(pending.data.proposal.after.days[0].items[0].title,'Web revision');
 const confirm={proposalId:revised.data.proposalId,idempotencyKey:randomUUID(),digest:pending.data.proposal.digest};
 const concurrent=await Promise.all([n('/'+tripId+'/confirm',confirm),n('/'+tripId+'/confirm',confirm)]);assert.deepEqual(concurrent.map(r=>r.status),[200,200]);assert.deepEqual(concurrent.map(r=>r.data.outcome).sort(),['already_applied','applied']);
 assert.equal((await n('/'+tripId+'/confirm',confirm)).data.outcome,'already_applied','lost response retry');
 native=await n('/'+tripId);web=await w('/'+tripId);assert.deepEqual(native.data.content,web.data.content);assert.equal(native.data.trip.headVersion,1);assert.equal(native.data.confirmationState,'confirmed');assert.equal(native.data.hardLocks,'unknown');assert.equal(native.data.externalOrderStatus,'unknown');
 const owner=client(token);for(const table of ['trip_events','trip_audit_events']){const rows=await owner.from(table).select('id').eq('trip_id',tripId);assert.equal(rows.error,null);assert.equal(rows.data.length,1,'one atomic '+table);}
 assert.equal((await owner.from('trip_idempotency').select('proposal_id').eq('idempotency_key',confirm.idempotencyKey)).data[0].proposal_id,confirm.proposalId);
 assert.equal((await owner.from('trip_version_snapshots').select('version').eq('trip_id',tripId)).data.length,2);
 assert.equal((await n('/'+tripId+'/proposal',{patch})).data.error.code,'STALE_TRIP_VERSION');
 const second=await w('/'+tripId+'/proposal',{patch:{expectedVersion:1,operations:[{kind:'set_title',title:'Web title'},{kind:'upsert_item',dayId,itemId,title:'Web second',startsAt:'2026-10-01T10:00:00+08:00'}]}});assert.equal(second.status,201);
 const secondRead=await n('/'+tripId+'/proposal?proposalId='+second.data.proposalId);assert.equal(secondRead.data.proposal.before.days[0].items[0].title,'Web revision');
 assert.equal((await n('/'+tripId+'/confirm',{proposalId:second.data.proposalId,idempotencyKey:randomUUID(),digest:secondRead.data.proposal.digest})).data.resultingVersion,2);
 const replayCreation=await n('',{tripId,title:'Native start'});assert.equal(replayCreation.status,200);assert.equal(replayCreation.data.reused,true);assert.equal(replayCreation.data.trip.title,'Web title','create replay is bound to immutable v0 but returns current Trip');assert.equal((await n('',{tripId,title:'Web title'})).data.error.code,'IDEMPOTENCY_KEY_REUSE','current renamed title is not the original create intent');
 const third=await n('/'+tripId+'/proposal',{patch:{expectedVersion:2,operations:[{kind:'upsert_day',dayId,date:'2026-10-02',timeZone:'Asia/Shanghai'},{kind:'upsert_item',dayId,itemId,title:'Native final'}]}});assert.equal(third.status,201);
 const thirdRead=await w('/'+tripId+'/proposal?proposalId='+third.data.proposalId);assert.equal(thirdRead.data.proposal.after.days[0].date,'2026-10-02');
 // Deliver an actual v2 metadata response only after another real transaction confirms v3.
 const transport=globalThis.fetch;let interleaved=false;
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const result=await transport(input,init);const url=new URL(typeof input==='string'?input:input instanceof URL?input:input.url);
  if(!interleaved && url.origin===e.API_URL && url.pathname==='/rest/v1/trips' && url.searchParams.get('id')==='eq.'+tripId){
    interleaved=true;
    assert.equal((await w('/'+tripId+'/confirm',{proposalId:third.data.proposalId,idempotencyKey:randomUUID(),digest:thirdRead.data.proposal.digest})).data.resultingVersion,3);
  }
  return result;
 });
 try {
  const adapter=await createNativeTripDataAdapter(new NextRequest(api+'/api/trips/native/v2/'+tripId,{headers:{Authorization:'Bearer '+token}}),{url:e.API_URL,publishableKey:key});
  const consistent=await adapter.getTrip(tripId);assert.ok(interleaved);assert.equal(consistent.data.trip.headVersion,2);assert.equal(consistent.data.content.days[0].items[0].title,'Web second');assert.ok(consistent.data.versions.every(row=>row.resultingVersion<=2));assert.equal(consistent.data.audits.length,2,'newer audit must not leak into captured v2 read');
 } finally {t.mock.restoreAll();}
 native=await n('/'+tripId);web=await w('/'+tripId);assert.equal(native.data.trip.id,web.data.trip.id);assert.equal(native.data.trip.headVersion,3);assert.deepEqual(native.data.content,web.data.content);
 // A legacy pending row can coexist during migration; CAS must still reject its stale confirmation.
 const staleProposal=await n('/'+tripId+'/proposal',{patch:{expectedVersion:3,operations:[{kind:'set_title',title:'Must not apply'}]}});const staleRead=await n('/'+tripId+'/proposal?proposalId='+staleProposal.data.proposalId);
 const otherPending=await owner.from('trip_proposals').insert({owner_id:users[0].id,trip_id:tripId,revision:100,base_trip_version:3,status:'pending',patch:{title:'Legacy title'},expires_at:'2099-01-01T00:00:00Z'}).select('id').single();assert.equal(otherPending.error,null);
 const legacyRead=await w('/'+tripId+'/proposal?proposalId='+otherPending.data.id);assert.equal(legacyRead.status,200);assert.equal((await w('/'+tripId+'/confirm',{proposalId:otherPending.data.id,idempotencyKey:randomUUID(),digest:legacyRead.data.proposal.digest})).data.resultingVersion,4,'legacy title via server digest');
 const staleAfter=await n('/'+tripId+'/proposal?proposalId='+staleProposal.data.proposalId);assert.equal(staleAfter.status,200);assert.equal(staleAfter.data.proposal.stale,true);assert.equal(staleAfter.data.proposal.before.version,3);assert.equal(staleAfter.data.proposal.titleDiff.before,'Web title','stale diff uses immutable proposal base, not newer head');
 assert.equal((await n('/'+tripId+'/confirm',{proposalId:staleProposal.data.proposalId,idempotencyKey:randomUUID(),digest:staleRead.data.proposal.digest})).data.error.code,'STALE_TRIP_VERSION');assert.equal((await n('/'+tripId)).data.trip.title,'Legacy title');
 // Cross-proposal idempotency cannot return another Trip's success receipt.
 const otherTrip=randomUUID();assert.equal((await n('',{tripId:otherTrip,title:'Other owned'})).status,201);const otherProposal=await n('/'+otherTrip+'/proposal',{patch:{expectedVersion:0,operations:[{kind:'set_title',title:'Still pending'}]}});const otherRead=await n('/'+otherTrip+'/proposal?proposalId='+otherProposal.data.proposalId);
 for(const digest of [confirm.digest,otherRead.data.proposal.digest]){const result=await owner.rpc('confirm_and_apply_trip_proposal',{p_proposal_id:otherProposal.data.proposalId,p_idempotency_key:confirm.idempotencyKey,p_digest:digest});assert.ok(result.error,'raw cross-proposal receipt rejected');assert.equal(result.data,null);}
 assert.equal((await n('/'+otherTrip)).data.trip.headVersion,0);
 for(const table of ['trip_idempotency','trip_events','trip_audit_events']){const input=table==='trip_idempotency'?{owner_id:users[0].id,idempotency_key:randomUUID(),digest:'fake',outcome:'applied',resulting_version:999}:table==='trip_events'?{owner_id:users[0].id,trip_id:otherTrip,proposal_id:otherProposal.data.proposalId,resulting_version:999,event_type:'proposal_applied'}:{owner_id:users[0].id,trip_id:otherTrip,proposal_id:otherProposal.data.proposalId,action:'proposal_applied'};assert.ok((await owner.from(table).insert(input)).error,'server-owned '+table+' cannot be forged');}
 assert.ok((await owner.from('trip_proposals').update({status:'applied'}).eq('id',otherProposal.data.proposalId)).error,'status cannot bypass confirmation');
 assert.equal((await n('/'+otherTrip+'/proposal/reject',{proposalId:otherProposal.data.proposalId})).status,200,'guarded reject remains available');
 const forgedId=randomUUID();assert.ok((await owner.from('trips').insert({id:forgedId,owner_id:users[0].id,title:'forged',head_version:999})).error);assert.deepEqual((await owner.from('trip_version_snapshots').select('version').eq('trip_id',forgedId)).data,[]);
 // A service-side fixture mutation simulates the read/apply race; ordinary UPDATE is already denied.
 const race=await n('/'+otherTrip+'/proposal',{patch:{expectedVersion:0,operations:[{kind:'set_title',title:'Read intent'}]}});const raceRead=await n('/'+otherTrip+'/proposal?proposalId='+race.data.proposalId);
 sql(`update public.trip_proposals set revision=revision+1,patch=jsonb_build_object('expectedVersion',0,'operations',jsonb_build_array(jsonb_build_object('kind','set_title','title','Changed intent'))) where id='${race.data.proposalId}' and owner_id='${users[0].id}';`);
 const mismatch=await owner.rpc('confirm_and_apply_trip_proposal',{p_proposal_id:race.data.proposalId,p_idempotency_key:randomUUID(),p_digest:raceRead.data.proposal.digest});assert.ok(mismatch.error?.message.includes('CONFIRMATION_DIGEST_MISMATCH'));assert.equal((await n('/'+otherTrip)).data.trip.headVersion,0);
 await n('/'+otherTrip+'/proposal/reject',{proposalId:race.data.proposalId});
 const rollback=await w('/'+tripId+'/rollback',{targetVersion:0});assert.equal(rollback.status,201);assert.match(rollback.data.digest,/^trip-v2:/);const rollbackRead=await w('/'+tripId+'/proposal?proposalId='+rollback.data.proposalId);assert.equal(rollbackRead.data.proposal.after.days.length,0,'rollback displays actual full snapshot effect');
 const rollbackConfirm={proposalId:rollback.data.proposalId,idempotencyKey:randomUUID(),digest:rollback.data.digest};assert.equal((await w('/'+tripId+'/confirm',rollbackConfirm)).data.resultingVersion,5);assert.equal((await w('/'+tripId+'/confirm',rollbackConfirm)).data.outcome,'already_applied');assert.deepEqual((await n('/'+tripId)).data.content.days,[]);
 if(process.env.VP_S1_BROWSER==='true') {
  const {exerciseSameTripBrowser}=await import('./same-trip-browser.mjs');
  await exerciseSameTripBrowser({api,jar,n,t});
 }
 const otherToken=await login(users[1]);assert.equal((await call('/api/trips/native/v2/'+tripId,{token:otherToken})).status,403);assert.equal((await call('/api/trips/native/v2/'+tripId+'/proposal?proposalId='+third.data.proposalId,{token:otherToken})).status,403);
 assert.ok((await users[1].sdk.from('trip_proposals').insert({owner_id:users[1].id,trip_id:tripId,revision:200,base_trip_version:5,status:'pending',patch:{title:'foreign'},expires_at:'2099-01-01T00:00:00Z'})).error,'foreign Trip pending insert denied');
 await login(users[0]);assert.equal((await n('/'+tripId)).status,401,'replaced mobile read denied');const oldReplay=await owner.rpc('confirm_and_apply_trip_proposal',{p_proposal_id:confirm.proposalId,p_idempotency_key:confirm.idempotencyKey,p_digest:confirm.digest});assert.ok(oldReplay.error,'replaced mobile raw replay denied');assert.equal((await w('/'+tripId)).status,200,'Web Cookie survives');
 t.diagnostic('Native/Web same UUID and five atomic confirmed versions; raw authority attacks rejected; all exact synthetic users removed.');
});
