// RPC DTO mocks only. Persistent authority/effect evidence is in the PG test.
import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID as uuid} from 'node:crypto';
import {runSourceImpactConsumer} from '../../../lib/server/jobs/source-impact-consumer.ts';
const target={kind:'statement',id:uuid(),version:1,payloadHash:'b'.repeat(64),claimRefs:[]};
const lease={kind:'leased',deliveryId:uuid(),setId:uuid(),reviewVersion:2,sourceDigest:'a'.repeat(64),target,leaseToken:uuid(),attempt:1};
test('disabled consumer has zero RPC; malformed or over-cap lease cannot apply or fabricate ACK',async()=>{
 let calls=0;assert.equal(await runSourceImpactConsumer({enabled:false,rpc:async()=>{calls++;throw Error();}},new AbortController().signal),'disabled');assert.equal(calls,0);
 for(const bad of [{...lease,attempt:9},{...lease,extra:true},{...lease,target:{...target,version:0}},{...lease,target:{...target,claimRefs:[{factId:uuid(),assertionId:uuid(),revision:1,payloadHash:'bad'}]}},{kind:'idle',extra:true}]){
 const seen:string[]=[];assert.equal(await runSourceImpactConsumer({enabled:true,rpc:async name=>{seen.push(name);return bad;}},new AbortController().signal),'blocked');assert.deepEqual(seen,['claim_source_impact_delivery_v1']);}
});
test('unknown ACK requires exact original target/version/lease/generation receipt; foreign generation cannot be acknowledged',async()=>{
 for(const bad of [{attempt:2},{leaseToken:uuid()},{reviewVersion:3},{sourceDigest:'c'.repeat(64)},{target:{...target,payloadHash:'d'.repeat(64)}}]){
 let failParams:Record<string,unknown>|undefined;
 const result=await runSourceImpactConsumer({enabled:true,rpc:async(name,p)=>{if(name==='claim_source_impact_delivery_v1')return lease;if(name==='apply_source_impact_projection_v1')throw Error('Mock uncertain write');if(name==='read_source_impact_delivery_v1')return {...lease,kind:'delivery',state:'acked',receiptId:uuid(),...bad};failParams=p;return {kind:'blocked'};}},new AbortController().signal);
 assert.equal(result,'unknown');assert.equal(failParams!.p_expected_attempt,1);assert.equal(failParams!.p_lease,lease.leaseToken);assert.equal(failParams!.p_expected_digest,lease.sourceDigest);
 }
});
test('an intent-only or extra-key apply response is not a receipt; persisted matching receipt alone resolves ACK loss',async()=>{
 let reads=0;const result=await runSourceImpactConsumer({enabled:true,rpc:async name=>{if(name==='claim_source_impact_delivery_v1')return lease;if(name==='apply_source_impact_projection_v1')return {kind:'applied',deliveryId:lease.deliveryId,receiptId:uuid(),digest:lease.sourceDigest,intentOnly:true};if(name==='read_source_impact_delivery_v1'){reads++;return {...lease,kind:'delivery',state:'acked',receiptId:uuid()};}throw Error('No retry/fail after exact committed receipt');}},new AbortController().signal);assert.equal(result,'acked');assert.equal(reads,1);
});
