import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTrafficInput, POLICY} from '../../../lib/server/maps/foreground-traffic/contract.ts';
import {createForegroundTrafficService} from '../../../lib/server/maps/foreground-traffic/service.ts';
import {readTrafficCondition} from '../../../lib/server/maps/foreground-traffic/provider.ts';

const origin='514b8576-e9e7-49aa-aa66-94eac6ba6544',destination='614b8576-e9e7-49aa-aa66-94eac6ba6544';
const binding={actor:'owner',session:'session:1',tripId:'714b8576-e9e7-49aa-aa66-94eac6ba6544',headVersion:0,dayId:'DAY',itemId:'Item-1',originPlaceReferenceId:origin,destinationPlaceReferenceId:destination,mode:'driving',departure:'now'};
const input={operation:'check',expectedHeadVersion:0,dayId:'DAY',itemId:'Item-1',originPlaceReferenceId:origin,destinationPlaceReferenceId:destination,mode:'driving',departure:'now',mapConsent:true,foreground:true,previousReceiptId:null,movementMeters:0,expectedStopEpoch:null};
const env={VISEPANDA_FOREGROUND_TRAFFIC_ENABLED:'true',AMAP_ROUTES_ENABLED:'true',AMAP_DETAIL_ENABLED:'true',AMAP_WEB_SERVICE_KEY:'synthetic-only'};
function fixture() {
  let duration=600,tmc='畅通',offline=false,allowed=true,granted=true;
  const calls=[],guards=[],rights={policyId:'policy',version:1,sourceId:'source',licenceVersion:'v1',expiresAt:'2099-01-01T00:00:00Z',tmcAllowed:true};
  const deps={env,signal:new AbortController().signal,authorize:async()=>{guards.push('scope');return allowed;},quota:async()=>{guards.push('quota');return true;},rights:async()=>granted?rights:null,resolve:async()=>({originId:'start',destinationId:'end'}),fetcher:async(input)=>{
    const url=new URL(input);calls.push(url);
    assert.equal(url.hostname,'restapi.amap.com');
    if(offline)throw Error('synthetic network loss');
    if(url.pathname.includes('place/detail')){const id=url.searchParams.get('id');return Response.json({status:'1',infocode:'10000',pois:[{id,name:'地点-'+id,address:'中文地址',citycode:'021',location:id==='start'?'121.4,31.2':'121.5,31.3'}]});}
    const transit=url.pathname.includes('transit');
    return Response.json({status:'1',infocode:'10000',route:{origin:'121.4,31.2',destination:'121.5,31.3',[transit?'transits':'paths']:[{distance:'1000',cost:{duration:String(duration)},steps:[{instruction:'沿路前行',tmcs:[{tmc_status:tmc,tmc_distance:'1000',tmc_polyline:'never retained'}]}],segments:[{walking:{distance:'100',steps:[{instruction:'步行'}]},bus:{buslines:[{name:'线路',departure_stop:{name:'起点'},arrival_stop:{name:'终点'}}]}}]}]}});
  }};
  return {deps,calls,guards,rights,duration:v=>duration=v,condition:v=>tmc=v,offline:()=>offline=true,deny:()=>allowed=false,revoke:()=>granted=false};
}
test('closed input rejects caller evidence, forecasts, location and identity claims',()=>{
  assert.ok(parseTrafficInput(input));
  for(const extra of [{actor:'other'},{providerJSON:{}},{hash:'a'.repeat(64)},{latitude:31},{mode:'taxi'},{departure:'tomorrow'},{movementMeters:NaN},{previousReceiptId:'latest'}])assert.equal(parseTrafficInput({...input,...extra}),null);
});
test('actual Maps fetch chain yields bounded TMC and whole alternatives without origin or rights upgrade',async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-04T06:00:00Z')});
  const s=createForegroundTrafficService(),f=fixture();
  const first=await s.run(binding,input,f.deps);
  assert.equal(first.status,'observed');assert.equal(first.comparison.kind,'first_observation');assert.equal(f.calls.length,5);
  assert.equal(f.calls.find(u=>u.pathname.endsWith('/driving')).searchParams.get('show_fields'),'cost,tmcs');
  assert.equal(f.guards.filter(g=>g==='quota').length,5);
  assert.equal(first.traffic.meters.clear,1000);assert.equal(first.providerObservedAt,null);assert.equal(first.currentness,'fetch_time_only');
  assert.equal(first.closure,'uncovered');assert.equal(first.realtimeTransit,'uncovered');assert.equal(first.qualification.status,'unavailable');
  assert.ok(!JSON.stringify(first).includes('never retained'));assert.ok(!JSON.stringify(first).includes('synthetic-only'));
  t.mock.timers.tick(120000);f.condition('拥堵');
  const second=await s.run(binding,{...input,operation:'refresh',previousReceiptId:first.receiptId},f.deps);
  assert.equal(second.comparison.kind,'route_condition_changed');assert.match(second.comparison.caveat,/not_incident/);
  assert.equal(second.alternatives.length,2);for(const a of second.alternatives)assert.ok(['walking','transit'].includes(a.option.mode));
});
test('duration-only change is a route estimate, missing closure data stays uncovered',async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-04T06:00:00Z')});
  const s=createForegroundTrafficService(),f=fixture();f.condition('未知');const first=await s.run(binding,input,f.deps);
  t.mock.timers.tick(120000);f.duration(1000);
  const second=await s.run(binding,{...input,previousReceiptId:first.receiptId},f.deps);
  assert.equal(second.comparison.kind,'route_estimate_changed');assert.equal(second.traffic.status,'uncovered');assert.equal(second.closure,'uncovered');
});
test('no material change, time/movement thresholds, throttling, local budget and cold-start global quota',async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-04T06:00:00Z')});
  const s=createForegroundTrafficService(),f=fixture(),first=await s.run(binding,input,f.deps);
  assert.equal((await s.run(binding,input,f.deps)).reason,'THROTTLED');
  t.mock.timers.tick(60000);
  assert.equal((await s.run(binding,{...input,operation:'refresh',previousReceiptId:first.receiptId,movementMeters:249},f.deps)).reason,'REFRESH_THRESHOLD_NOT_MET');
  const second=await s.run(binding,{...input,operation:'refresh',previousReceiptId:first.receiptId,movementMeters:250},f.deps);
  assert.equal(second.comparison.kind,'no_change');t.mock.timers.tick(120000);
  const third=await s.run(binding,{...input,operation:'refresh',previousReceiptId:second.receiptId},f.deps);
  assert.equal(third.status,'observed');t.mock.timers.tick(60000);
  assert.equal((await s.run(binding,input,f.deps)).reason,'WINDOW_BUDGET_EXHAUSTED');assert.equal(f.calls.length,15);
  const cold=createForegroundTrafficService(),g=fixture();g.deps.quota=async()=>false;
  assert.equal((await cold.run(binding,input,g.deps)).status,'unavailable');assert.equal(g.calls.length,0);
});
test('expiry and exact opaque instance/scope/previous receipt reject invented or cross-owner baseline',async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-04T06:00:00Z')});
  const s=createForegroundTrafficService(),f=fixture(),r=await s.run(binding,input,f.deps);
  for(const b of [{...binding,actor:'other'},{...binding,headVersion:1},{...binding,itemId:'different'},{...binding,mode:'walking'}])assert.equal((await s.run(b,{...input,operation:'refresh',previousReceiptId:r.receiptId},f.deps)).reason,'RECEIPT_UNAVAILABLE');
  assert.equal((await createForegroundTrafficService().run(binding,{...input,operation:'refresh',previousReceiptId:r.receiptId},f.deps)).reason,'RECEIPT_UNAVAILABLE');
  t.mock.timers.tick(POLICY.ttlMs);assert.equal((await s.run(binding,{...input,operation:'refresh',previousReceiptId:r.receiptId},f.deps)).reason,'RECEIPT_UNAVAILABLE');
});
test('stop/background/consent/policy withdrawal have zero new calls and no reusable receipt',async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-04T06:00:00Z')});
  for(const change of [{operation:'stop'},{foreground:false},{mapConsent:false}]){
    const s=createForegroundTrafficService(),f=fixture(),r=await s.run(binding,input,f.deps);
    assert.equal((await s.run(binding,{...input,...change},f.deps)).status,'stopped');t.mock.timers.tick(120000);
    assert.equal((await s.run(binding,{...input,operation:'refresh',previousReceiptId:r.receiptId},f.deps)).reason,'RECEIPT_UNAVAILABLE');assert.equal(f.calls.length,5);
  }
  const s=createForegroundTrafficService(),f=fixture();f.revoke();assert.equal((await s.run(binding,input,f.deps)).reason,'FIELD_RIGHTS_UNAVAILABLE');assert.equal(f.calls.length,0);
});
test('network uncertainty stops retries through local budget window; explicit recheck after window recovers',async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-04T06:00:00Z')});
  const s=createForegroundTrafficService(),f=fixture();f.offline();
  assert.equal((await s.run(binding,input,f.deps)).reason,'PROVIDER_COST_UNKNOWN');t.mock.timers.tick(120000);
  assert.equal((await s.run(binding,input,f.deps)).reason,'WINDOW_BUDGET_EXHAUSTED');t.mock.timers.tick(180000);
  const g=fixture();assert.equal((await s.run(binding,input,g.deps)).status,'observed');
});
test('concurrent explicit checks spend only one comparison and stop cancels in-flight output',async()=>{
  const s=createForegroundTrafficService(),f=fixture();
  const results=await Promise.all([s.run(binding,input,f.deps),s.run(binding,input,f.deps)]);
  assert.deepEqual(results.map(r=>r.status).sort(),['observed','unavailable']);assert.equal(f.calls.length,5);
  const g=fixture(),other=createForegroundTrafficService();let release;const gate=new Promise(r=>release=r);
  const original=g.deps.fetcher;g.deps.fetcher=async(...args)=>{await gate;return original(...args);};
  const pending=other.run(binding,input,g.deps);await new Promise(r=>setImmediate(r));
  await other.run(binding,{...input,operation:'stop'},g.deps);release();assert.equal((await pending).status,'unavailable');
});
test('TMC incomplete, unknown, malformed, oversized and legacy fields are uncovered',()=>{
  const raw=tmcs=>({status:'1',infocode:'10000',route:{paths:[{distance:'1000',steps:[{tmcs}]}]}});
  for(const tmcs of [[],[{status:'拥堵',distance:'1000'}],[{tmc_status:'封路',tmc_distance:'1000'}],[{tmc_status:'畅通',tmc_distance:'100'}],[{tmc_status:'未知',tmc_distance:'1000'}],Array(1001).fill({tmc_status:'畅通',tmc_distance:'1'})])assert.equal(readTrafficCondition(raw(tmcs)).status,'uncovered');
});
test('single-mode endpoint rights dispatch only two detail calls and its whole authorized plan',async()=>{
  const s=createForegroundTrafficService(),f=fixture(),kinds=[];
  f.rights.allowedEndpointModes=['walking'];f.rights.tmcAllowed=false;
  f.deps.quota=async kind=>{kinds.push(kind);return true;};
  const r=await s.run({...binding,mode:'walking'},{...input,mode:'walking'},f.deps);
  assert.equal(r.status,'observed');assert.equal(r.selected.mode,'walking');assert.equal(r.selected.tmc,null);
  assert.deepEqual(kinds,['detail','detail','walking']);assert.equal(f.calls.length,3);
  assert.ok(!f.calls.some(u=>/driving|transit/.test(u.pathname)));assert.deepEqual(r.alternatives,[]);
});
