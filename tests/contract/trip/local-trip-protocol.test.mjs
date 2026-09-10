import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';
import { nativeFixture } from '../identity/native-fixture.ts';
import { createUserDataAdapter } from '../../../lib/server/identity/user-data-adapter.ts';
import { draftTripPatch } from '../../../lib/server/trip/patch/draft.ts';
import { applyPatch } from '../../../lib/server/trip/patch/contract.ts';
import { readStoredSnapshot } from '../../../lib/server/trip/snapshot/read.ts';

test('default Web protocol does not call unavailable v2 database seams',async t=>{
 const saved={a:process.env.VISEPANDA_TRIP_PROTOCOL_V2,b:process.env.VISEPANDA_NATIVE_LOCAL_TRIP};delete process.env.VISEPANDA_TRIP_PROTOCOL_V2;delete process.env.VISEPANDA_NATIVE_LOCAL_TRIP;
 t.after(()=>{for(const [key,value]of [['VISEPANDA_TRIP_PROTOCOL_V2',saved.a],['VISEPANDA_NATIVE_LOCAL_TRIP',saved.b]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
 const f=await nativeFixture(t),previous=globalThis.fetch,seen=[];
 const trip={id:'314b8576-e9e7-49aa-aa66-94eac6ba6544',title:'Before',head_version:1,updated_at:'2026-09-01T00:00:00Z'};
 const proposal={id:'fb2c981e-7e5f-4b07-9f79-af7b907e4f4a',trip_id:trip.id,revision:1,base_trip_version:1,status:'pending',patch:{title:'After'},created_at:'2026-09-01T00:00:00Z',expires_at:'2099-01-01T00:00:00Z',rollback_snapshot_version:null};
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url);if(url.pathname.startsWith('/auth/'))return previous(input,init);
  seen.push(url.pathname+' '+request.method+' '+url.searchParams.get('select'));
  assert.ok(!url.pathname.includes('_v2'),'legacy default cannot require a 28 RPC');
  assert.notEqual(url.pathname,'/rest/v1/trip_idempotency','legacy default cannot query the new receipt column');
  if(url.pathname==='/rest/v1/trips')return Response.json([trip]);
  if(url.pathname==='/rest/v1/trip_proposals')return Response.json(request.method==='PATCH'?[{id:proposal.id,status:'rejected'}]:[proposal]);
  if(url.pathname==='/rest/v1/trip_version_snapshots')return Response.json([{version:1,title:'Before',content:{title:'Before',days:[]},created_at:trip.updated_at}]);
  if(url.pathname==='/rest/v1/trip_events')return Response.json([{id:'event',proposal_id:proposal.id,resulting_version:1,event_type:'proposal_applied',created_at:trip.updated_at}]);
  if(url.pathname==='/rest/v1/rpc/confirm_and_apply_trip_proposal')return Response.json([{outcome:'applied',resulting_version:2}]);
  if(url.pathname==='/rest/v1/rpc/create_trip_rollback_proposal')return Response.json([{proposal_id:proposal.id,base_trip_version:1,target_version:0}]);
  return Response.json([]);
 });
 const adapter=createUserDataAdapter(new NextRequest('https://web.invalid/api/trips',{headers:{Cookie:f.cookie()}}),f.config);
 assert.ok((await adapter.getTrip(trip.id)).data);
 assert.equal((await adapter.getPendingProposal(trip.id)).data.proposal.digest,undefined);
 assert.equal((await adapter.confirm(trip.id,{proposalId:proposal.id,idempotencyKey:'legacy-key',digest:'legacy-digest'})).data.resultingVersion,2);
 assert.equal((await adapter.rejectPendingProposal(trip.id,{proposalId:proposal.id})).data.status,'rejected');
 assert.equal((await adapter.createRollbackProposal(trip.id,0)).data.digest,undefined);
 assert.ok(seen.some(value=>value.startsWith('/rest/v1/trip_proposals PATCH')));
});

test('a local draft retains its base and uses only TripPatch operations',()=>{
 const base={version:4,title:'Trip',days:[{id:'a',date:'2026-10-01',items:[{id:'item',dayId:'a',title:'Before',startsAt:'2026-10-01T09:00:00Z'}]}]};
 const edited={...base,title:'Edited',days:[{...base.days[0],date:'2026-10-02',items:[{...base.days[0].items[0],title:'After'}]}]};
 const patch=draftTripPatch(base,edited);assert.equal(patch.expectedVersion,4);
 const applied=applyPatch(base,patch);assert.equal(applied.days[0].date,'2026-10-02');assert.equal(applied.days[0].items[0].title,'After');assert.equal(applied.days[0].items[0].startsAt,'2026-10-01T09:00:00Z');
 assert.equal(base.days[0].items[0].title,'Before');
 assert.throws(()=>applyPatch({...base,version:5},patch));assert.equal(edited.days[0].items[0].title,'After','conflict cannot overwrite the draft');
});
test('stored snapshot title/version must remain internally coherent',()=>{
 assert.equal(readStoredSnapshot({version:2,title:'New',content:{title:'Old',days:[]}}),null);
 assert.deepEqual(readStoredSnapshot({version:2,title:'New',content:{title:'New',days:[]}}),{version:2,title:'New',days:[]});
});
