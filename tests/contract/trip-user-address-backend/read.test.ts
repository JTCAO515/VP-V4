import test from 'node:test';import assert from 'node:assert/strict';
import {readOnlineItemAddress} from '../../../lib/server/trip/address/read.ts';
const id='00000000-0000-4000-8000-000000000001',hash='a'.repeat(64);
const context={tripId:id,tripVersion:2,dayId:'d',itemId:'i'};
const claim={claimType:'address',subjectId:'poi',value:{lines:['上海市 1 号'],countryCode:'CN'},asOf:'2026-10-15T00:00:00Z',evidence:[{kind:'fact',factId:'f',version:1,reviewedAt:'2026-10-15T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'}]};
const entry={supportId:id,receiptId:id,placeReferenceId:id,version:1,scope:'address_reference',applicability:'matched',status:'reference_current',claimRevision:1,payloadHash:hash,sourceDigest:hash,sourceRefs:[{sourceRevisionId:id,revisionLabel:'source',snippetHash:hash}],claim};
const support=(entries:unknown[])=>({kind:'support',tripId:id,tripVersion:2,dayId:'d',itemId:'i',entries});
test('manual and qualified references are independent same-version facts; Chinese observes actual lines',()=>{
 const manual={text:'用户自填',source:'user_provided',verification:'unverified'};
 const read=readOnlineItemAddress(context,manual,support([entry]));
 assert.equal(read.kind,'addresses');if(read.kind!=='addresses')return;
 assert.deepEqual(read.userProvided,{kind:'provided',address:manual});assert.equal(read.reference.kind,'qualified');
 if(read.reference.kind==='qualified')assert.equal(read.reference.entries[0].chineseText,'contains_chinese_text');
 const latin=readOnlineItemAddress(context,undefined,support([{...entry,claim:{...claim,value:{lines:['1 Road'],countryCode:'CN'}}}]));
 if(latin.kind==='addresses'&&latin.reference.kind==='qualified')assert.equal(latin.reference.entries[0].chineseText,'not_chinese');else assert.fail('valid original reference remains distinct');
});
test('errors and changed context are never missing; stale blocks both source facts',()=>{
 assert.deepEqual(readOnlineItemAddress(context,undefined,null),{kind:'unavailable'});
 assert.deepEqual(readOnlineItemAddress(context,undefined,{...support([]),tripVersion:1}),{kind:'unavailable'});
 assert.deepEqual(readOnlineItemAddress(context,undefined,{kind:'stale'}),{kind:'conflict'});
 const read=readOnlineItemAddress(context,undefined,support([]));
 assert.equal(read.kind,'addresses');if(read.kind==='addresses'){assert.equal(read.userProvided.kind,'missing');assert.equal(read.reference.kind,'missing');}
});
test('unmatched, revoked, expired, untraceable and forged verified never qualify',()=>{
 for(const row of [{...entry,applicability:'unverified'},{...entry,status:'revoked',claim:null},{...entry,sourceRefs:[]}]){
 const read=readOnlineItemAddress(context,undefined,support([row]));assert.equal(read.kind,'addresses');if(read.kind==='addresses')assert.equal(read.reference.kind,'not_qualified');}
 const read=readOnlineItemAddress(context,{text:'地址',source:'user_provided',verification:'verified'},support([]));
 if(read.kind==='addresses')assert.equal(read.userProvided.kind,'unsupported');else assert.fail();
 const expired=readOnlineItemAddress(context,undefined,support([entry]),Date.parse('2100-01-01'));
 if(expired.kind==='addresses')assert.equal(expired.reference.kind,'not_qualified');else assert.fail();
});
