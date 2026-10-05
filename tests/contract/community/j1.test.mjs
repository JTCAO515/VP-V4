import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {parseCommunityInput,decodeCommunityItem,decodeCommunityOutcome,matchesCommunityOutcome,COMMUNITY_SCHEMA} from '../../../lib/server/community/contract.ts';
import {handleCommunityJ1} from '../../../lib/server/community/j1-http.ts';
const actor=randomUUID(),session=randomUUID(),id=randomUUID(),op=randomUUID();
const submit=()=>({action:'submit',operationId:op,submissionId:id,contentKind:'experience',title:'体验',content:'Synthetic content',benefitDisclosure:'',place:null,consent:'internal-review-v1'});
const item=()=>({id,title:'体验',content:'Synthetic content',contentKind:'experience',benefitDisclosure:'',authorDisclosure:'unknown',reviewerDisclosure:null,status:'pending',version:1,createdAt:'2026-10-05T12:00:00Z',reviewedAt:null,withdrawnAt:null,reviewNote:null,place:null,history:[{action:'submitted',version:1,createdAt:'2026-10-05T12:00:00Z'}],visibility:'internal',publiclyVisible:false,retrievalEligible:false});
const outcome=(extra={})=>({schemaVersion:COMMUNITY_SCHEMA,kind:'operation',actorId:actor,sessionId:session,operationId:op,state:'committed',submission:item(),...extra});
const request=(body=submit(),headers={})=>new Request('http://localhost/api/community/native/v1',{method:'POST',headers:{'Content-Type':'application/json','x-community-expected-actor':actor,'x-community-expected-session':session,...headers},body:typeof body==='string'?body:JSON.stringify(body)});
const options=(rpc={},extra={})=>({enabled:true,surface:'native',createRpc:()=>({authenticate:async()=>actor,sessionId:()=>session,current:async()=>true,call:async()=>({data:outcome(),error:null}),...rpc}),...extra});
test('J1 closed commands bind consent, purpose, version, owner-safe place and raw mutation lookup',()=>{
 assert.ok(parseCommunityInput(submit()));
 for (const name of ['native-submit','native-operation','native-abandon']) {
  const raw=readFileSync(new URL(`../../../ios/VisePanda/VisePandaTests/Fixtures/CommunitySubmission/${name}.json`,import.meta.url),'utf8');
  assert.ok(parseCommunityInput(JSON.parse(raw)),`actual Native DTO builder fixture ${name}`);
 }
 const place={tripId:id,placeReferenceId:id,expectedTripVersion:0,mappingDigest:'a'.repeat(64)};assert.ok(parseCommunityInput({...submit(),place}));assert.equal(parseCommunityInput({...submit(),place:{...place,expectedTripVersion:-1}}),null);assert.equal(parseCommunityInput({...submit(),place:{...place,mappingDigest:'unknown'}}),null);
 for (const change of [{authorId:actor},{reviewerDisclosure:'employee'},{contentKind:'fact'},{place:{tripId:id,placeReferenceId:id,label:'invented'}},{benefitDisclosure:'x'.repeat(401)},{consent:'public'},{content:'\0'},{title:' '},{content:'😀'.repeat(2001)}]) assert.equal(parseCommunityInput({...submit(),...change}),null);
 const raw=JSON.stringify(submit());assert.ok(parseCommunityInput({action:'operation',operationId:op,mutationBytes:raw}));
 for (const original of [{action:'export'},{action:'operation',operationId:op,mutationBytes:'{}'},{...submit(),operationId:randomUUID()}]) assert.equal(parseCommunityInput({action:'operation',operationId:op,mutationBytes:JSON.stringify(original)}),null);
 assert.ok(parseCommunityInput({action:'delete',operationId:op,confirmed:true}));assert.equal(parseCommunityInput({action:'delete',operationId:op,confirmed:false}),null);
});
test('author result decodes internal approved, safe legacy unknown fields, strict erasure and history',()=>{
 assert.ok(decodeCommunityItem(item()));
 const reviewed={...item(),status:'published',version:2,reviewedAt:'2026-10-05T12:01:00Z',reviewNote:'Author-visible explanation',reviewerDisclosure:'employee'};
 assert.ok(decodeCommunityItem(reviewed));
 for (const change of [{publiclyVisible:true},{retrievalEligible:true},{visibility:'public'},{reviewerId:actor},{reviewerDisclosure:['employee']},{authorDisclosure:['official']},{createdAt:'2026-02-30T12:00:00Z'},{status:'published'},{history:[{action:'withdrawn',version:3,createdAt:'2026-10-05T12:01:00Z'}]}]) assert.equal(decodeCommunityItem({...item(),...change}),null);
 const withdrawn={...reviewed,status:'withdrawn',version:3,title:'',content:'',benefitDisclosure:null,place:null,withdrawnAt:'2026-10-05T12:02:00Z'};assert.ok(decodeCommunityItem(withdrawn));assert.equal(decodeCommunityItem({...withdrawn,content:'resurrect'}),null);
 assert.ok(decodeCommunityItem({...reviewed,contentKind:'unknown',benefitDisclosure:null,reviewNote:null,reviewerDisclosure:'unknown'}));
});
test('outcome is exact operation/current-session and honest pagination, not generic success',()=>{
 const o=decodeCommunityOutcome(outcome());assert.ok(o);assert.ok(matchesCommunityOutcome(o,submit(),actor,session));assert.equal(matchesCommunityOutcome(o,submit(),actor,randomUUID()),false);
 const page={schemaVersion:COMMUNITY_SCHEMA,kind:'page',actorId:actor,sessionId:session,submissions:[item()],nextCursor:id,complete:false};assert.ok(decodeCommunityOutcome(page));
 assert.equal(decodeCommunityOutcome({...page,complete:true}),null);assert.equal(decodeCommunityOutcome({...page,submissions:[item(),item()]}),null);
 assert.equal(decodeCommunityOutcome({...outcome(),untrusted:'extra'}),null);
 assert.equal(matchesCommunityOutcome({...o,submission:null},submit(),actor,session),false);
});
test('disabled, ambiguous credentials, missing expected actor/session and native review never dispatch',async()=>{
 let calls=0;const rpc={call:async()=>{calls++;throw Error('unexpected');}};
 for (const [req,opts,status] of [[request(),{enabled:false},503],[request(submit(),{Cookie:'session=bad'}),{},403],[request(submit(),{Origin:'http://localhost'}),{},403],[request(submit(),{'x-community-expected-actor':randomUUID()}),{},403],[request(submit(),{'x-community-expected-session':''}),{},403],[request({action:'queue',cursor:null}),{},403],[request({...submit(),status:'published'}),{},400]]) assert.equal((await handleCommunityJ1(req,options(rpc,opts))).status,status);
 assert.equal(calls,0);
 assert.equal((await handleCommunityJ1(request(),options())).status,200);
});
test('actual ingress preserves frozen original bytes; SQL envelope contains no client auth grants',async()=>{
 const raw=' '+JSON.stringify(submit(),null,1)+'\n';let seen;
 const result=await handleCommunityJ1(request(raw),options({call:async(name,params)=>{seen={name,params};return {data:outcome(),error:null};}}));assert.equal(result.status,200);assert.equal(seen.name,'community_workspace');assert.deepEqual(seen.params.p_input,{protocol:COMMUNITY_SCHEMA,command:submit(),mutationBytes:raw});
});
test('current-session final check and strict wrong-op/schema are unknown after mutation dispatch',async()=>{
 for (const data of [{},outcome({operationId:randomUUID()}),outcome({sessionId:randomUUID()}),outcome({submission:{...item(),publiclyVisible:true}})]) assert.equal((await handleCommunityJ1(request(),options({call:async()=>({data,error:null})}))).body.error,'COMMUNITY_ACK_UNKNOWN');
 let checks=0;const final=await handleCommunityJ1(request(),options({current:async()=>++checks===1}));assert.deepEqual(final,{body:{error:'COMMUNITY_ACK_UNKNOWN'},status:503});
 const before=await handleCommunityJ1(request(),options({current:async()=>false,call:async()=>{throw Error('should not dispatch');}}));assert.equal(before.status,401);
});
test('stalled auth/body/RPC/cancel bounded; timeout never claims mutation rollback',async()=>{
 const stalled=()=>new Promise(()=>{});
 const result=await handleCommunityJ1(request(),options({call:stalled},{milliseconds:20}));assert.equal(result.body.error,'COMMUNITY_ACK_UNKNOWN');
 const noAuth=await handleCommunityJ1(request(),options({authenticate:stalled},{milliseconds:20}));assert.equal(noAuth.body.error,'COMMUNITY_UNAVAILABLE');
 const body=new ReadableStream({pull:stalled,cancel:stalled});const hostile=new Request(request(),{body,duplex:'half'});
 assert.equal((await handleCommunityJ1(hostile,options({},{milliseconds:20}))).body.error,'COMMUNITY_UNAVAILABLE');
});
test('unknown SQL errors hide content, known denials remain exact, invalid UTF8 fails before SQL',async()=>{
 assert.equal((await handleCommunityJ1(request(),options({call:async()=>({data:null,error:{message:'private SQL or body'}})}))).body.error,'COMMUNITY_ACK_UNKNOWN');
 assert.equal((await handleCommunityJ1(request(),options({call:async()=>({data:null,error:{message:'COMMUNITY_CONFLICT'}})}))).status,409);
 const invalid=new Request(request(),{body:new Uint8Array([0xff]),duplex:'half'});assert.equal((await handleCommunityJ1(invalid,options())).status,400);
});
test('disabled business gate retains current-author export/cleanup, never submit/review authority',async()=>{
 const data={schemaVersion:COMMUNITY_SCHEMA,kind:'export',actorId:actor,sessionId:session,scope:'community_module',coverage:'complete_for_community',submissions:[],reviews:[],receipts:[],audits:[],reviewerQualification:{active:false},trustedDisclosure:null,retained:['operation_fences','submission_tombstones','audit_metadata']};
 assert.ok(decodeCommunityOutcome(data));const omitted={...data};delete omitted.reviewerQualification;assert.equal(decodeCommunityOutcome(omitted),null);
 assert.equal((await handleCommunityJ1(request({action:'export'}),options({call:async()=>({data,error:null})},{enabled:false,cleanupEnabled:true}))).status,200);
 assert.equal((await handleCommunityJ1(request(),options({},{enabled:false,cleanupEnabled:true}))).body.error,'COMMUNITY_DISABLED');
});
test('bounded export allows honest legacy action unknown but refuses an unrenderable oversized package',async()=>{
 const data={schemaVersion:COMMUNITY_SCHEMA,kind:'export',actorId:actor,sessionId:session,scope:'community_module',coverage:'complete_for_community',submissions:[],reviews:[],receipts:[{operationId:op,submissionId:id,action:'unknown',state:'committed',digest:'a'.repeat(64)}],audits:[],reviewerQualification:null,trustedDisclosure:null,retained:['operation_fences','submission_tombstones','audit_metadata']};
 assert.ok(decodeCommunityOutcome(data));
 const huge={...data,submissions:Array.from({length:100},()=>({...item(),id:randomUUID(),content:'中'.repeat(4000)}))};
 const response=await handleCommunityJ1(request({action:'export'}),options({call:async()=>({data:huge,error:null})}));assert.equal(response.body.error,'COMMUNITY_CAPACITY');assert.ok(!('data'in response.body));
});
