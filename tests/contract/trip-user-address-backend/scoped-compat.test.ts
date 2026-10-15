import test from 'node:test';import assert from 'node:assert/strict';
import {manualScopedPatch,previewScopedPatch,candidateScopedEditsPatch} from '../../../lib/server/trip/scoped-edit/candidate-guard.ts';
import {draftTripPatch} from '../../../lib/server/trip/patch/draft.ts';
import {applyPatch,type TripSnapshot} from '../../../lib/server/trip/patch/contract.ts';
const address={text:' 原始\n用户地址 ',source:'user_provided' as const,verification:'unverified' as const};
const base:TripSnapshot={version:1,title:'Trip',days:[{id:'d',date:'2026-10-16',items:[{id:'i',dayId:'d',title:'Visit',chineseAddress:address},{id:'source',dayId:'d',title:'Other',chineseAddress:{...address,text:'Source only'}}]},{id:'e',date:'2026-10-17',items:[]}]};
const constraints={scope:{dayIds:['d','e'],itemIds:[]},lockedItemIds:[],fixedItemIds:[]};
const identity={contextId:'00000000-0000-4000-8000-000000000001',askOperationId:'00000000-0000-4000-8000-000000000002',candidateId:'00000000-0000-4000-8000-000000000003'};
test('same-item scoped and explicit draft cross-day moves preserve original address bytes',()=>{
 const patch=manualScopedPatch(base,{kind:'move_item',itemId:'i',toDayId:'e'},constraints);
 const moved=previewScopedPatch(base,patch,constraints);assert.deepEqual(moved.days[1].items![0].chineseAddress,address);
 const draft={...base,days:[{...base.days[0],items:[base.days[0].items![1]]},{...base.days[1],items:[{id:'i',dayId:'e',title:'Visit'}]}]};
 assert.deepEqual(applyPatch(base,draftTripPatch(base,draft)).days[1].items![0].chineseAddress,address);
});
test('explicit delete removes value; new item does not copy source address; replace preserves own value',()=>{
 assert.equal(applyPatch(base,{expectedVersion:1,operations:[{kind:'delete_item',dayId:'d',itemId:'i'}]}).days[0].items!.some(item=>item.id==='i'),false);
 const added=applyPatch(base,candidateScopedEditsPatch(base,[{kind:'add_item',sourceItemId:'source',toDayId:'e'}],constraints,identity));
 assert.equal(added.days[1].items![0].chineseAddress,undefined);
 const replaced=applyPatch(base,candidateScopedEditsPatch(base,[{kind:'replace_item',itemId:'i',sourceItemId:'source'}],constraints,identity));
 assert.deepEqual(replaced.days[0].items!.find(item=>item.id==='i')!.chineseAddress,address);
});
