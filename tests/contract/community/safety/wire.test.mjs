import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {SAFETY_SCHEMA,safetyRetained,parseSafetyInput,decodeSafetyObject,decodeSafetyOutcome,matchesSafetyOutcome} from '../../../../lib/server/community/safety/contract.ts';
import {handleSafetyRequest} from '../../../../lib/server/community/safety/http.ts';
const actor=uuid(),session=uuid(),id=uuid(),op=uuid(),rid=uuid();
const command=()=>({action:'report',operationId:op,reportId:rid,submissionId:id,expectedSubmissionVersion:1,expectedSafetyVersion:0,category:'abuse',details:'Synthetic private reason',consent:'internal-safety-v1'});
const report=()=>({kind:'report',id:rid,submissionId:id,submissionVersion:1,safetyVersion:0,category:'abuse',details:'Synthetic private reason',state:'pending',version:1,createdAt:'2026-10-05T12:00:00Z',resolvedAt:null,note:null});
const base=()=>({schemaVersion:SAFETY_SCHEMA,actorId:actor,sessionId:session});
const outcome=()=>({...base(),kind:'operation',operationId:op,state:'committed',record:report()});
const object=()=>({id,submissionVersion:1,safetyVersion:0,title:'Synthetic internal content',content:'Synthetic user content',contentKind:'experience',benefitDisclosure:'',authorDisclosure:'unknown',reviewerDisclosure:null,source:'user_experience',copyright:'unknown',visibility:'internal',publiclyVisible:false,retrievalEligible:false,canReport:true,canBlock:true,expiresAt:new Date(Date.now()+29000).toISOString()});
const request=(input=command(),headers={})=>new Request('http://localhost/api/community/safety/native/v1',{method:'POST',headers:{'Content-Type':'application/json','x-community-safety-expected-actor':actor,'x-community-safety-expected-session':session,...headers},body:typeof input==='string'?input:JSON.stringify(input)});
const options=(rpc={},opts={})=>({enabled:true,cleanupEnabled:true,surface:'native',createRpc:()=>({authenticate:async()=>actor,sessionId:()=>session,current:async()=>true,call:async()=>({data:outcome(),error:null}),...rpc}),...opts});
test('closed commands forbid actor targeting, publication, forged authority and nested recovery',()=>{
 assert.ok(parseSafetyInput(command()));
 for (const extra of [{reporterId:actor},{authorId:actor},{moderator:true},{publicationEnabled:true},{category:'fact'},{expectedSafetyVersion:-1},{expectedSubmissionVersion:0},{details:'x'.repeat(1001)},{details:'😀'.repeat(501)},{consent:'public'}]) assert.equal(parseSafetyInput({...command(),...extra}),null);
 const block={action:'block',operationId:op,blockId:rid,submissionId:id,expectedSubmissionVersion:1,expectedSafetyVersion:0};assert.ok(parseSafetyInput(block));assert.equal(parseSafetyInput({...block,targetActorId:actor}),null);
 const raw=JSON.stringify(command());const recovery={action:'operation',operationId:op,mutationBytes:raw};assert.ok(parseSafetyInput(recovery));assert.equal(parseSafetyInput({...recovery,operationId:uuid()}),null);assert.equal(parseSafetyInput({...recovery,mutationBytes:JSON.stringify(recovery)}),null);
 assert.equal(parseSafetyInput({action:'inspect',collection:'blocks',id:rid}),null);assert.equal(parseSafetyInput({action:'delete',operationId:op,confirmed:false}),null);
});
test('strict projections exclude foreign identity/report details and retain internal unknown provenance',()=>{
 assert.ok(decodeSafetyObject(object()));
 for (const extra of [{authorId:actor},{copyright:'owned'},{authorDisclosure:'staff'},{publiclyVisible:true},{retrievalEligible:true},{source:'verified'},{expiresAt:'2026-02-30T12:00:00Z'}]) assert.equal(decodeSafetyObject({...object(),...extra}),null);
 assert.ok(decodeSafetyOutcome(outcome()));
 for (const extra of [{reporterId:actor},{foreignDetails:'PRIVATE'},{moderatorId:actor}]) assert.equal(decodeSafetyOutcome({...outcome(),record:{...report(),...extra}}),null);
 const disposition={kind:'disposition',id,submissionId:id,submissionVersion:2,safetyVersion:1,state:'removed',j1Status:'published',note:'Visible explanation',appealable:true};assert.ok(decodeSafetyOutcome({...base(),kind:'record',record:disposition}));
 assert.equal(decodeSafetyOutcome({...base(),kind:'record',record:{...disposition,reportId:rid}}),null);assert.equal(decodeSafetyOutcome({...base(),kind:'record',record:{...disposition,j1Status:'deleted'}}),null);
 const eligibility={...base(),kind:'eligibility',submissionId:id,publicationEnabled:false,publiclyVisible:false,retrievalEligible:false,reason:'public_disabled'};assert.ok(decodeSafetyOutcome(eligibility));assert.equal(decodeSafetyOutcome({...eligibility,publicationEnabled:true}),null);
});
test('response bound to operation, current session, record kind, honest cursor and own scope',()=>{
 const o=decodeSafetyOutcome(outcome());assert.ok(matchesSafetyOutcome(o,command(),actor,session));assert.equal(matchesSafetyOutcome(o,command(),actor,uuid()),false);assert.equal(matchesSafetyOutcome({...o,record:{...report(),id:uuid()}},command(),actor,session),false);
 const page={...base(),kind:'page',collection:'reports',records:[report()],nextCursor:rid,complete:false};assert.ok(decodeSafetyOutcome(page));assert.equal(decodeSafetyOutcome({...page,complete:true}),null);assert.equal(decodeSafetyOutcome({...page,records:[report(),report()]}),null);assert.equal(decodeSafetyOutcome({...page,collection:'appeals'}),null);
 const exported={...base(),kind:'export',scope:'community_safety_module',coverage:'complete_for_community_safety',reports:[report()],dispositions:[],appeals:[],blocks:[],receipts:[],audits:[],qualification:null,retained:safetyRetained};assert.ok(decodeSafetyOutcome(exported));assert.equal(decodeSafetyOutcome({...exported,scope:'account'}),null);assert.equal(decodeSafetyOutcome({...exported,reports:Array(101).fill(report())}),null);assert.equal(decodeSafetyOutcome({...exported,foreignBodies:[]}),null);
});
test('ingress denies wrong surface/actor/session and native operator commands before RPC',async()=>{
 let calls=0;const rpc={call:async()=>{calls++;return {data:outcome(),error:null};}};
 for (const headers of [{cookie:'untrusted'},{origin:'http://localhost'},{'x-community-safety-expected-actor':uuid()},{'x-community-safety-expected-session':uuid()}]) assert.equal((await handleSafetyRequest(request(command(),headers),options(rpc))).status,403);
 const moderator={action:'disposition',operationId:op,reportId:rid,expectedReportVersion:1,expectedSubmissionVersion:1,expectedSafetyVersion:0,decision:'remove',note:'Visible reason'};
 for (const c of [moderator,{action:'operation',operationId:op,mutationBytes:JSON.stringify(moderator)},{action:'abandon',operationId:op,mutationBytes:JSON.stringify(moderator)}]) assert.equal((await handleSafetyRequest(request(c),options(rpc))).status,403);
 assert.equal((await handleSafetyRequest(request(),options(rpc,{surface:'ops',sameOrigin:false}))).status,403);assert.equal(calls,0);
});
test('exact original bytes survive dispatch/recovery; ordinary versus recovery bounds, malformed UTF8 and BOM fail closed',async()=>{
 const original=JSON.stringify({...command(),details:'\\'.repeat(1000)});const raw='\n'.repeat(10000-original.length)+original;
 const c={action:'operation',operationId:op,mutationBytes:raw};assert.ok(JSON.stringify(c).length>10000);
 const r=await handleSafetyRequest(request(c),options({call:async(_name,args)=>{assert.deepEqual(args.p_input,{protocol:SAFETY_SCHEMA,command:c,mutationBytes:null});return {data:outcome(),error:null};}}));assert.equal(r.status,200);
 const plain=JSON.stringify(command());const once=await handleSafetyRequest(request(plain),options({call:async(_name,args)=>{assert.equal(args.p_input.mutationBytes,plain);return {data:outcome(),error:null};}}));assert.equal(once.status,200);
 assert.equal((await handleSafetyRequest(request(plain+' '.repeat(10001-plain.length)),options())).status,413);assert.equal((await handleSafetyRequest(request(JSON.stringify(c)+' '.repeat(49153-Buffer.byteLength(JSON.stringify(c)))),options())).status,413);
 for (const body of [new Uint8Array([0xff]),Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(plain)])]) assert.equal((await handleSafetyRequest(new Request(request(),{body,duplex:'half'}),options())).status,400);
});
test('postdispatch timeout, wrong record/session and revoked final authority preserve unknown acknowledgement',async()=>{
 for (const data of [{}, {...outcome(),sessionId:uuid()}, {...outcome(),operationId:uuid()}, {...outcome(),record:{...report(),id:uuid()}}]) assert.equal((await handleSafetyRequest(request(),options({call:async()=>({data,error:null})}))).body.error,'SAFETY_ACK_UNKNOWN');
 let checks=0;assert.equal((await handleSafetyRequest(request(),options({current:async()=>++checks===1}))).body.error,'SAFETY_ACK_UNKNOWN');
 assert.equal((await handleSafetyRequest(request(),options({current:async()=>false}))).status,401);
 assert.equal((await handleSafetyRequest(request(),options({call:()=>new Promise(()=>{})},{milliseconds:15}))).body.error,'SAFETY_ACK_UNKNOWN');
 assert.equal((await handleSafetyRequest(request(),options({authenticate:()=>new Promise(()=>{})},{milliseconds:15}))).body.error,'SAFETY_UNAVAILABLE');
});
test('disabled business still allows owner cleanup and rejects moderator recovery; SQL text never leaked',async()=>{
 const deleted={...base(),kind:'deleted',operationId:op,scope:'community_safety_module',retained:safetyRetained};assert.equal((await handleSafetyRequest(request({action:'delete',operationId:op,confirmed:true}),options({call:async()=>({data:deleted,error:null})},{enabled:false}))).status,200);
 assert.equal((await handleSafetyRequest(request(),options({},{enabled:false}))).body.error,'SAFETY_DISABLED');
 assert.equal((await handleSafetyRequest(request(),options({call:async()=>({data:null,error:{message:'sensitive SQL statement or reporter details'}})}))).body.error,'SAFETY_ACK_UNKNOWN');
 assert.equal((await handleSafetyRequest(request(),options({call:async()=>({data:null,error:{message:'SAFETY_CONFLICT'}})}))).status,409);
});
test('object lifetime rejects expired and extended cached content at HTTP boundary',async()=>{
 for (const expiry of [Date.now()-1,Date.now()+60000]) {const data={...base(),kind:'object',object:{...object(),expiresAt:new Date(expiry).toISOString()}};assert.equal((await handleSafetyRequest(request({action:'object',submissionId:id}),options({call:async()=>({data,error:null})}))).body.error,'SAFETY_UNAVAILABLE');}
 const data={...base(),kind:'object',object:object()};assert.equal((await handleSafetyRequest(request({action:'object',submissionId:id}),options({call:async()=>({data,error:null})}))).status,200);
});
