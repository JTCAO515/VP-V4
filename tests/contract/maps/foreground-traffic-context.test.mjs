import test from 'node:test';import assert from 'node:assert/strict';
import {parseContextInput,readForegroundContext} from '../../../lib/server/maps/foreground-traffic/context.ts';
const id=n=>`${n}14b8576-e9e7-49aa-aa66-94eac6ba6544`,trip=id(3),ref=id(5);
const input={expectedHeadVersion:0,dayId:'DAY',itemId:'Item',scope:null};
const content={days:[{id:'DAY',date:'2026-10-04',items:[{id:'Item',dayId:'DAY',title:'用户选定地点'}]}]};
function entry(){return {supportId:id(7),receiptId:id(8),placeReferenceId:ref,version:1,scope:'address_reference',applicability:'matched',status:'reference_current',claimRevision:1,payloadHash:'a'.repeat(64),sourceDigest:'b'.repeat(64),sourceRefs:[{sourceRevisionId:id(9),revisionLabel:'Synthetic reference',snippetHash:'c'.repeat(64)}],claim:{claimType:'address',subjectId:id(1),value:{lines:['中文地址'],countryCode:'CN',locality:'Shanghai'},asOf:'2020-01-01T00:00:00Z',evidence:[{kind:'fact',factId:id(9),version:1,reviewedAt:'2020-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'}]}};}
test('confirmed owner context gives readable labels from existing current support; stale/absent source never becomes ID display',async()=>{
  let current=true;const calls=[];
  const owner=async(name,p)=>{calls.push({name,p});return {error:null,data:{kind:'support',tripId:trip,tripVersion:0,dayId:'DAY',itemId:'Item',entries:current?[entry()]:[]}};};
  const refs=[{id:ref,canonicalPoiId:id(1)}];
  const first=await readForegroundContext(trip,input,content,refs,owner);
  assert.deepEqual(first.data.references[0].display,{zh:'用户选定地点',en:'用户选定地点',addressLines:['中文地址'],source:'current_item_support'});
  assert.equal(first.data.qualification,'not_granted_by_context');assert.equal(first.data.providerCalls,0);
  assert.ok(calls.every(c=>c.name==='read_trip_item_support_v1'&&!Object.hasOwn(c.p,'p_proposal')));
  current=false;const missing=await readForegroundContext(trip,input,content,refs,owner);
  assert.equal(missing.data.references[0].display,null);assert.equal(missing.data.references[0].displayStatus,'unavailable');assert.equal(missing.data.completeness.labels,'partial');
});
test('closed context rejects inferred scope/owner; cap is partial and stop epoch requires an actual selected exact scope read',async()=>{
  assert.ok(parseContextInput(input,trip));assert.equal(parseContextInput({...input,owner:id(1)},trip),null);
  const fullscope={tripId:trip,expectedHeadVersion:0,dayId:'DAY',itemId:'Item',originPlaceReferenceId:ref,destinationPlaceReferenceId:id(6),mode:'walking',departure:'now'};
  assert.equal(parseContextInput({...input,scope:{...fullscope,itemId:'Other'}},trip),null);
  const many=structuredClone(content);for(let i=0;i<30;i++)many.days[0].items.push({id:`i${i}`,dayId:'DAY',title:'Extra'});
  let reads=0;const owner=async(name,p)=>{if(name==='read_foreground_traffic_scope_v1')return {error:null,data:{kind:'scope',stopEpoch:4,stopped:true}};reads++;return {error:null,data:{kind:'support',tripId:trip,tripVersion:0,dayId:p.p_day,itemId:p.p_item,entries:[]}};};
  const r=await readForegroundContext(trip,{...input,scope:fullscope},many,[{id:ref,canonicalPoiId:id(1)},{id:id(6),canonicalPoiId:id(2)}],owner);
  assert.equal(reads,24);assert.equal(r.data.completeness.totalItems,31);assert.equal(r.data.completeness.labels,'partial');assert.deepEqual(r.data.stop,{status:'current',epoch:4,stopped:true});
});
