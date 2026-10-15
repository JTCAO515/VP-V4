import test from 'node:test';
import assert from 'node:assert/strict';
import {applyPatch,assertTripPatch,type TripSnapshot} from '../../../lib/server/trip/patch/contract.ts';
const base:TripSnapshot={version:3,title:'Trip',days:[{id:'d',date:'2026-10-16',items:[{id:'i',dayId:'d',title:'Visit'}]}]};
const address='  上海市\n中山东一路 1 号  ';
const set=(text:string|null,expectedVersion=3)=>({expectedVersion,operations:[{kind:'set_item_chinese_address' as const,dayId:'d',itemId:'i',text}]});
test('new manual address keeps exact bytes and fixed unverified tags; base remains unmodified',()=>{
 const result=applyPatch(base,set(address));
 assert.deepEqual(result.days[0].items![0].chineseAddress,{text:address,source:'user_provided',verification:'unverified'});
 assert.equal(result.version,4);assert.equal(base.days[0].items![0].chineseAddress,undefined);
});
test('legacy upsert preserves manual address and clear is explicit',()=>{
 const saved=applyPatch(base,set(address));
 const changed=applyPatch(saved,{expectedVersion:4,operations:[{kind:'upsert_item',dayId:'d',itemId:'i',title:'Updated'}]});
 assert.equal(changed.days[0].items![0].chineseAddress?.text,address);
 assert.equal(applyPatch(changed,set(null,5)).days[0].items![0].chineseAddress,undefined);
});
test('closed input rejects forged verification, blank/control/overlimit and stale or missing item',()=>{
 for(const text of ['', '　\n ', '\u0001上海', '\ud800', '中'.repeat(501), '😀'.repeat(376)]) assert.throws(()=>applyPatch(base,set(text)));
 assert.throws(()=>assertTripPatch({...set(address),operations:[{...set(address).operations[0],verification:'verified'}]} as never));
 assert.throws(()=>applyPatch(base,set(address,2)));
 assert.throws(()=>applyPatch(base,{expectedVersion:3,operations:[{...set(address).operations[0],itemId:'missing'}]}));
});
test('legacy absent values stay absent; deletion removes address',()=>{
 assert.equal(applyPatch(base,{expectedVersion:3,operations:[{kind:'set_title',title:'Other'}]}).days[0].items![0].chineseAddress,undefined);
 const saved=applyPatch(base,set(address));
 assert.deepEqual(applyPatch(saved,{expectedVersion:4,operations:[{kind:'delete_item',dayId:'d',itemId:'i'}]}).days[0].items,[]);
});
