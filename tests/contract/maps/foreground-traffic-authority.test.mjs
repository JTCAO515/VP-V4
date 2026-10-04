import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeTrafficPolicy,decodeTrafficReceipt,createTrafficAuthority,readQualifiedForegroundTrafficReceipt} from '../../../lib/server/maps/foreground-traffic/authority.ts';
const id=n=>`${n}14b8576-e9e7-49aa-aa66-94eac6ba6544`;
const scope={tripId:id(3),expectedHeadVersion:0,dayId:'DAY',itemId:'Item-1',originPlaceReferenceId:id(5),destinationPlaceReferenceId:id(6),mode:'driving',departure:'now'};
function policy(tmc=true){return {kind:'policy',policyId:id(7),policyRevision:1,sourceVersion:'fixture_v1',allowedEndpointModes:['walking','transit','driving'],accountScope:'synthetic',stopEpoch:0,stopped:false,endpoints:Object.fromEntries(['origin','destination'].map((name,i)=>[name,{referenceId:id(i+5),canonicalPoiId:id(i+1),mappingId:id(i+8),providerPoiId:i?'end':'start',canonicalFingerprint:'a'.repeat(64),mappingFingerprint:'b'.repeat(64)}])),policy:{policyId:'synthetic_foreground',sourceId:'synthetic_source',licenceVersion:'synthetic_v1',dataClass:'c0_public',grants:['duration','distance','derived_change','receipt_metadata',...(tmc?['tmc']:[])].flatMap(field=>[['display','explore'],['cache','explore'],['persist','trip_planning']].map(([action,purpose])=>({field,region:'cn',action,purpose}))),effectiveAt:'2026-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z',termsRecheckAt:'2099-01-01T00:00:00Z',trialEndsAt:null,derivative:'allowed',shareAlike:'not_required',combination:'denied',redistribution:'denied',training:'denied',retention:'durable'}};}
function receipt(){const now=Date.now();return {receiptId:id(8),dispatchId:id(9),scope,stopEpoch:0,policyId:id(7),policyRevision:1,sourceVersion:'fixture_v1',fetchedAt:new Date(now).toISOString(),providerObservedAt:null,expiresAt:new Date(now+300000).toISOString(),selected:{mode:'driving',durationSeconds:600,distanceMeters:1000,tmc:null},alternatives:[],previousReceiptId:null,changeKind:'route_estimate_changed',durationDeltaSeconds:200,routeChangeCaveat:true,r2Qualified:true};}
test('real evaluator requires each field purpose, current rights; missing TMC grant permits only null TMC',()=>{
  assert.equal(decodeTrafficPolicy(policy(),'driving').rights.tmcAllowed,true);
  assert.equal(decodeTrafficPolicy(policy(false),'driving').rights.tmcAllowed,false);
  for(const mutate of [p=>p.policy.grants.pop(),p=>p.policy.retention='ephemeral',p=>p.policy.derivative='denied',p=>p.policy.expiresAt='2020-01-01T00:00:00Z',p=>p.policy.dataClass='c2_trip_sensitive',p=>p.endpoints.origin.providerPoiId='bad/id']){
    const p=policy(false);mutate(p);assert.equal(decodeTrafficPolicy(p,'driving'),null);
  }
});
test('closed receipt decoder rejects caller extras, changed exact scope, dates, fabricated event or arrival',()=>{
  const r=receipt();assert.ok(decodeTrafficReceipt(r,scope));
  assert.ok(decodeTrafficReceipt({...r,scope:Object.fromEntries(Object.entries(scope).reverse())},scope));
  for(const bad of [{...r,providerJSON:{}},{...r,scope:{...scope,itemId:'other'}},{...r,fetchedAt:'invalid'},{...r,expiresAt:'invalid'},{...r,providerObservedAt:r.fetchedAt},{...r,changeKind:'closure'},{...r,selected:{...r.selected,realTimeArrival:true}},{...r,selected:{...r.selected,tmc:{status:'closed'}}}])assert.equal(decodeTrafficReceipt(bad,scope),null);
});
test('server-only actor envelope and ordered request transactions spend quota once; owner read is separate',async()=>{
  const actor={subject:id(1),sessionId:id(2),mobileEpoch:1},calls=[],reads=[];let stored=receipt();
  const producer=async(name,params)=>{calls.push({name,params});assert.deepEqual(params.p_actor,actor);
    if(name==='foreground_traffic_policy_v1')return {error:null,data:policy()};
    if(params.p_action==='begin')return {error:null,data:{kind:'dispatch',dispatchId:id(9),stopEpoch:0}};
    if(params.p_action==='request'){await new Promise(r=>setImmediate(r));return {error:null,data:{kind:'request',dispatchId:id(9),requestIndex:params.p_input.requestIndex}};}
    const p=params.p_input;stored={...receipt(),fetchedAt:p.fetchedAt.replace('Z','+00:00'),selected:Object.fromEntries(Object.entries(p.selected).reverse()),alternatives:p.alternatives,previousReceiptId:p.previousReceiptId};return {error:null,data:{kind:'receipt',receipt:stored}};
  };
  const owner=async(name,params)=>{reads.push({name,params});return {error:null,data:{kind:'receipt',receipt:stored}};};
  const a=createTrafficAuthority(scope,actor,producer,owner);assert.ok(await a.policy());assert.equal(await a.begin('check'),true);
  assert.deepEqual(await Promise.all([a.request('detail'),a.request('detail'),a.request('detail'),a.request('detail'),a.request('detail')]),[true,true,true,true,true]);assert.equal(await a.request('detail'),false);
  assert.deepEqual(calls.filter(c=>c.params.p_action==='request').map(c=>c.params.p_input.requestIndex),[1,2,3,4,5]);
  const r=receipt();assert.ok(await a.complete(r.fetchedAt,r.selected,[],null));
  assert.equal((await readQualifiedForegroundTrafficReceipt(owner,r.receiptId,scope)).kind,'qualified');
  assert.equal(reads[0].name,'read_foreground_traffic_v1');assert.ok(!Object.hasOwn(reads[0].params,'p_actor'));
});
test('missing producer/role/policy/source, no change and nonqualified owner receipt remain unavailable without dispatch',async()=>{
  const actor={subject:id(1),sessionId:id(2),mobileEpoch:null};let calls=0;
  const missing=createTrafficAuthority(scope,actor,null,async()=>{calls++;return {error:'missing',data:null};});
  assert.equal(await missing.policy(),null);assert.equal(await missing.begin('check'),false);assert.equal(await missing.request('detail'),false);assert.equal(calls,0);
  for(const change of [{r2Qualified:false},{changeKind:'unchanged'}, {expiresAt:'2020-01-01T00:00:00Z'}])assert.equal((await readQualifiedForegroundTrafficReceipt(async()=>({error:null,data:{kind:'receipt',receipt:{...receipt(),...change}}}),id(8),scope)).kind,'unavailable');
});
test('explicit stop reads actual ordinary scope epoch without policy/receipt and performs one CAS; unknown does not retry',async()=>{
  const seen=[],actor={subject:id(1),sessionId:id(2),mobileEpoch:1};
  const owner=async(name,params)=>{seen.push({name,params});return {error:null,data:name==='read_foreground_traffic_scope_v1'?{kind:'scope',stopEpoch:7,stopped:false}:{kind:'stopped'}};};
  const a=createTrafficAuthority(scope,actor,null,owner);
  assert.equal(await a.stop(null),true);assert.deepEqual(seen.map(s=>s.name),['read_foreground_traffic_scope_v1','stop_foreground_traffic_v1']);
  assert.equal(seen[1].params.p_expected_stop_epoch,7);assert.ok(!seen.some(s=>Object.hasOwn(s.params,'p_actor')));
  let attempts=0;const b=createTrafficAuthority(scope,actor,null,async()=>{attempts++;return {data:null,error:'unknown'};});
  assert.equal(await b.stop(null),false);assert.equal(attempts,1);
});

export {id,scope,policy,receipt};
