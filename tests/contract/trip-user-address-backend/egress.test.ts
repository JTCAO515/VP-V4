import test from 'node:test';import assert from 'node:assert/strict';
import {promptInput} from '../../../lib/server/turn/scoped-edit/protocol.ts';
import {omitOnlineUserAddresses} from '../../../lib/server/trip/address/egress.ts';
import {isOfflinePayload,OFFLINE_FIELDS} from '../../../lib/server/today/offline-read.ts';
import {parseOfflineTextCommand} from '../../../lib/server/today/offline-text-command.ts';
const address={text:'私有用户地址 SENTINEL',source:'user_provided' as const,verification:'unverified' as const};
const legacy={version:3,title:'Trip',days:[{id:'d',date:'2026-10-16',timeZone:'Asia/Shanghai',items:[{id:'i',dayId:'d',title:'Visit',startsAt:'2026-10-16T09:00:00Z',endsAt:'2026-10-16T10:00:00Z',manualOrder:2}]}]};
test('model context omission preserves every old snapshot field and original source',()=>{
 const online={...legacy,days:[{...legacy.days[0],items:[{...legacy.days[0].items[0],chineseAddress:address}]}]};
 const original=JSON.stringify(online),actual=omitOnlineUserAddresses(online);
 assert.deepEqual(actual,legacy);assert.equal(JSON.stringify(actual).includes('SENTINEL'),false);assert.equal(JSON.stringify(online),original);
 assert.deepEqual(omitOnlineUserAddresses(legacy),legacy);
});
test('existing offline field permit rejects online address shape and address command fields',()=>{
 assert.deepEqual(OFFLINE_FIELDS,['days.date','days.items.title']);
 const payload={title:'Trip',days:[{id:'d',date:'2026-10-16',items:[{id:'i',title:'Visit',chineseAddress:address}]}]};
 assert.equal(isOfflinePayload(payload),false);
 assert.equal(parseOfflineTextCommand({operationId:'00000000-0000-4000-8000-000000000001',expectedHeadVersion:3,date:'2026-10-16',title:'Visit',saveOffline:true,chineseAddress:address}),null);
});

test('actual existing model prompt omits online address while preserving all old prompt data',()=>{
 const context={snapshot:{...legacy,days:[{...legacy.days[0],items:[{...legacy.days[0].items[0],chineseAddress:address}]}]},scope:{dayIds:['d'],itemIds:[]},lockedItemIds:[],fixedItemIds:[]};
 const input={text:'Move visit',locale:'en',context,profile:{pace:'relaxed'},memory:[]};
 const actual=promptInput(input as never);
 assert.equal(actual.includes('SENTINEL'),false);assert.equal(actual.includes('chineseAddress'),false);
 assert.deepEqual(JSON.parse(actual),{ask:input.text,locale:'en',trip:legacy,scope:context.scope,lockedItemIds:[],fixedItemIds:[],profile:input.profile,memory:[]});
});
