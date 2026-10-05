import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PUBLICATION_SCHEMA,publicationRetained,parsePublicationInput,decodePublication,decodeExperience,decodeExperienceReference,decodePublicationOutcome,matchesPublicationOutcome} from '../../../../lib/server/community/publication/contract.ts';
import {handlePublicationRequest} from '../../../../lib/server/community/publication/http.ts';
import {safeReturnTo} from '../../../../lib/navigation/safe-return-to.ts';
const actor=uuid(),session=uuid(),id=uuid(),source=uuid(),op=uuid(),ref=uuid();
const base=()=>({schemaVersion:PUBLICATION_SCHEMA,actorId:actor,sessionId:session});
const pub=()=>({id,submissionId:source,submissionVersion:2,safetyVersion:0,version:3,state:'published',rightsDeclaration:'own-text-v1',rightsNote:'Verified owned synthetic text against source',createdAt:'2026-10-06T00:00:00Z',publishedAt:'2026-10-06T00:01:00Z',endedAt:null,audience:'controlled_registered',publiclyVisible:false,retrievalEligible:false});
const experience=()=>({id,submissionId:source,submissionVersion:2,safetyVersion:0,publicationVersion:3,title:'Synthetic owned text',content:'A synthetic travel experience.',contentKind:'experience',benefitDisclosure:'',authorDisclosure:'unknown',reviewerDisclosure:'registered_user',source:'user_experience',copyright:'author_declared_own_text_independently_reviewed',rightsPurpose:'controlled_experience_display',audience:'controlled_registered',publiclyVisible:false,retrievalEligible:false,canReport:true,canBlock:true,place:null,expiresAt:new Date(Date.now()+29000).toISOString()});
const reference=()=>({id:ref,publicationId:id,submissionVersion:2,safetyVersion:0,publicationVersion:3,version:1,state:'saved',availability:'current',experience:experience(),createdAt:'2026-10-06T00:02:00Z',endedAt:null});
const command=()=>({action:'requestPublication',operationId:op,publicationId:id,submissionId:source,expectedSubmissionVersion:2,expectedSafetyVersion:0,previewDigest:'a'.repeat(64),consent:'controlled-preview-v1',rightsDeclaration:'own-text-v1'});
const outcome=()=>({...base(),kind:'operation',operationId:op,state:'committed',publication:pub(),reference:null});
const request=(input=command(),headers={},surface='native')=>new Request(`http://localhost/api/${surface==='native'?'community/publication/native/v1':'ops/community/publication'}`,{method:'POST',headers:{'Content-Type':'application/json','x-community-publication-expected-actor':actor,'x-community-publication-expected-session':session,...headers},body:typeof input==='string'?input:JSON.stringify(input)});
const options=(rpc={},opts={})=>({enabled:true,cleanupEnabled:true,surface:'native',createRpc:()=>({authenticate:async()=>actor,sessionId:()=>session,current:async()=>true,call:async()=>({data:outcome(),error:null}),...rpc}),...opts});
test('login returns only to the leased publication literal and rejects query or URL variants',()=>{
 assert.equal(safeReturnTo('/ops/community/publication'),'/ops/community/publication');
 for(const path of ['/ops/community/publication?public=1','/ops/community/publication/','/ops/community/publication#source','//example.test/ops/community/publication','https://example.test/ops/community/publication','/ops/community/publication/anything',' /ops/community/publication','/ops/community/publication\\outside']) assert.equal(safeReturnTo(path),'/visepanda');
});
test('actual owned Swift command fixtures and ordinary Auth producer samples match canonical wire',()=>{
 for(const name of ['request','save','unsave','delete','operation','abandon']) {const bytes=readFileSync(`ios/VisePanda/VisePandaTests/Fixtures/CommunityExperience/native-${name}.json`,'utf8');assert.ok(parsePublicationInput(JSON.parse(bytes)),name);}
 const fixture=JSON.parse(readFileSync('tests/fixtures/community/publication/producer.json','utf8'));assert.equal(fixture.fixtureSchema,'community-publication-j3j4-fixture/1');
 for(const [name,value] of Object.entries(fixture.samples)) assert.ok(name==='unavailable'?decodeExperienceReference(value):decodePublicationOutcome(value),name+' is only offline shape proof, not current display authority');
});
test('closed input never accepts user-defined recipients, copyright permissions or authority',()=>{
 assert.ok(parsePublicationInput(command()));
 for(const delta of [{actorId:actor},{authorId:actor},{publisher:true},{audience:'public'},{copyright:'licensed'},{rightsDeclaration:'third-party'},{consent:true},{previewDigest:null},{expectedSafetyVersion:null},{expectedSubmissionVersion:null},{expectedSubmissionVersion:0},{expectedSafetyVersion:-1},{previewDigest:'x'.repeat(64)}]) assert.equal(parsePublicationInput({...command(),...delta}),null);
 const rights={action:'rightsReview',operationId:op,publicationId:id,expectedPublicationVersion:1,expectedSubmissionVersion:2,expectedSafetyVersion:0,decision:'approve',note:'Bounded synthetic rights review'};
 assert.ok(parsePublicationInput(rights));for(const d of [{decision:null},{note:null},{note:'😀'.repeat(201)},{expectedPublicationVersion:0},{decision:'publish'}]) assert.equal(parsePublicationInput({...rights,...d}),null);
 assert.equal(parsePublicationInput({...command(),consent:'internal-review-v1'}),null);
});
test('exact recovery retains original bytes and forbids operation substitution and nesting',()=>{
 const bytes=JSON.stringify(command());assert.ok(parsePublicationInput({action:'operation',operationId:op,mutationBytes:bytes}));
 for(const d of [{operationId:uuid()},{mutationBytes:'null'},{mutationBytes:JSON.stringify({action:'session'})},{mutationBytes:bytes+' '.repeat(10000)},{mutationBytes:JSON.stringify({action:'operation',operationId:op,mutationBytes:bytes})}]) assert.equal(parsePublicationInput({action:'abandon',operationId:op,mutationBytes:bytes,...d}),null);
});
test('experience output cannot promote internal approved content or unknown rights into reading entitlement',()=>{
 assert.ok(decodeExperience(experience()));assert.ok(decodePublication(pub()));
 assert.ok(decodeExperience({...experience(),benefitDisclosure:null}),'retain honestly absent J1/J2 disclosure instead of inventing empty text');
 for(const d of [{copyright:'unknown'},{copyright:'licensed'},{source:'fact'},{retrievalEligible:true},{publiclyVisible:true},{audience:'public'},{authorId:actor},{place:{canonicalPoiId:uuid(),mappingDigest:'a'.repeat(64),label:null,tripId:uuid()}},{publicationVersion:null},{contentKind:'unknown'},{rightsPurpose:'training'}]) assert.equal(decodeExperience({...experience(),...d}),null);
 for(const d of [{state:'withdrawn'},{state:'erased',endedAt:'2026-10-06T00:03:00Z'},{rightsDeclaration:null},{state:'published',publishedAt:null}]) assert.equal(decodePublication({...pub(),...d}),null);
 assert.ok(decodePublication({...pub(),state:'erased',rightsDeclaration:null,rightsNote:null,endedAt:'2026-10-06T00:03:00Z'}));
});
test('saved references require all exact current versions and deny reconstructed unavailable body',()=>{
 assert.ok(decodeExperienceReference(reference()));
 for(const d of [{availability:'unavailable'},{submissionVersion:3},{safetyVersion:1},{publicationVersion:4},{state:'unsaved',version:2,endedAt:'2026-10-06T00:03:00Z'},{publicationId:uuid()},{state:'erased',version:2,endedAt:'2026-10-06T00:03:00Z'}]) assert.equal(decodeExperienceReference({...reference(),...d}),null);
 assert.ok(decodeExperienceReference({...reference(),availability:'unavailable',experience:null}));
 assert.ok(decodeExperienceReference({...reference(),state:'erased',version:2,endedAt:'2026-10-06T00:03:00Z',publicationId:null,availability:'unavailable',experience:null}));
});
test('list and operation correlation rejects duplicates, stale cursors, foreign sessions and record swaps',()=>{
 const e=experience();const list={...base(),kind:'list',experiences:[e],nextCursor:null,complete:true};assert.ok(decodePublicationOutcome(list));
 for(const d of [{experiences:[e,e]},{nextCursor:uuid(),complete:false},{nextCursor:null,complete:false},{experiences:Array(51).fill(e)}]) assert.equal(decodePublicationOutcome({...list,...d}),null);
 assert.ok(matchesPublicationOutcome(outcome(),command(),actor,session));assert.equal(matchesPublicationOutcome(outcome(),command(),actor,uuid()),false);
 assert.equal(matchesPublicationOutcome({...outcome(),publication:{...pub(),id:uuid()}},command(),actor,session),false);
 assert.equal(matchesPublicationOutcome({...outcome(),publication:{...pub(),submissionId:uuid()}},command(),actor,session),false);
 assert.equal(decodePublicationOutcome({...outcome(),reference:reference()}),null);
});
test('complete scoped export includes authored reviews and qualifications without foreign body',()=>{
 const data={...base(),kind:'export',scope:'community_publication_module',coverage:'complete_for_community_publication',publications:[pub()],references:[{...reference(),availability:'unavailable',experience:null}],authoredRightsReviews:[{publicationId:id,decision:'approve',note:'Own retained review note',createdAt:'2026-10-06T00:01:00Z'}],receipts:[{operationId:op,recordId:id,action:'requestPublication',state:'committed',digest:'a'.repeat(64)}],audits:[{recordId:id,action:'rightsReview',createdAt:'2026-10-06T00:01:00Z'}],qualification:{rightsReviewer:true,publisher:false},retained:publicationRetained};
 assert.ok(decodePublicationOutcome(data));
 for(const d of [{authoredRightsReviews:undefined},{references:[reference()]},{publications:Array(101).fill(pub())},{qualification:{rightsReviewer:true}},{retained:[...publicationRetained,'body_snapshots']},{coverage:'complete_for_account'},{authoredRightsReviews:[{...data.authoredRightsReviews[0],authorId:actor}]}]) assert.equal(decodePublicationOutcome({...data,...d}),null);
});
test('HTTP enforces registered current actor and credential surface before SQL dispatch',async()=>{
 let calls=0;const rpc={call:async()=>{calls++;return {data:outcome(),error:null};}};
 const successful=await handlePublicationRequest(request(),options(rpc));assert.equal(successful.status,200);assert.deepEqual(Object.keys(successful.body),['data']);assert.ok(decodePublicationOutcome(successful.body.data));assert.equal(decodePublicationOutcome(successful.body),null,'flat SQL outcome is not the HTTP envelope');assert.equal(calls,1);
 for(const headers of [{'x-community-publication-expected-actor':uuid()},{'x-community-publication-expected-session':uuid()},{cookie:'x=y'},{origin:'http://localhost'}]) assert.equal((await handlePublicationRequest(request(command(),headers),options(rpc))).status,403);
 assert.equal((await handlePublicationRequest(request(),options({...rpc,current:async()=>false}))).body.error,'SESSION_REPLACED');assert.equal(calls,1);
 assert.equal((await handlePublicationRequest(request(command(),{authorization:'Bearer opaque'},'ops'),options(rpc,{surface:'ops',sameOrigin:true}))).status,403);
 assert.equal((await handlePublicationRequest(request(command(),{},'ops'),options(rpc,{surface:'ops',sameOrigin:false}))).status,403);
});
test('Native cannot issue or replay qualified Ops actions',async()=>{
 const publish={action:'publish',operationId:op,publicationId:id,expectedPublicationVersion:2,expectedSubmissionVersion:2,expectedSafetyVersion:0};
 let calls=0;const rpc={call:async()=>{calls++;return {data:outcome(),error:null};}};
 for(const input of [publish,{action:'queue',cursor:null},{action:'inspect',publicationId:id},{action:'operation',operationId:op,mutationBytes:JSON.stringify(publish)},{action:'abandon',operationId:op,mutationBytes:JSON.stringify(publish)}]) assert.equal((await handlePublicationRequest(request(input),options(rpc))).body.error,'PUBLICATION_FORBIDDEN');assert.equal(calls,0);
});
test('disabled publication retains owner cleanup and never exposes list/detail',async()=>{
 const deleted={...base(),kind:'deleted',operationId:op,scope:'community_publication_module',retained:publicationRetained};
 assert.equal((await handlePublicationRequest(request({action:'delete',operationId:op,confirmed:true}),options({call:async()=>({data:deleted,error:null})},{enabled:false}))).status,200);
 for(const input of [{action:'list',cursor:null,query:''},{action:'detail',publicationId:id},command()]) assert.equal((await handlePublicationRequest(request(input),options({},{enabled:false}))).body.error,'PUBLICATION_DISABLED');
});
test('ambiguous mutation dispatch never grants success or automatic fresh operation',async()=>{
 for(const call of [async()=>({data:null,error:{message:'SQL sensitive foreign content'}}),async()=>({data:{...outcome(),actorId:uuid()},error:null}),async()=>{throw Error('Connection lost after commit');}]) assert.equal((await handlePublicationRequest(request(),options({call}))).body.error,'PUBLICATION_ACK_UNKNOWN');
 assert.equal((await handlePublicationRequest(request(),options({call:async()=>({data:null,error:{message:'PUBLICATION_CONFLICT'}})}))).status,409);
 let checks=0;assert.equal((await handlePublicationRequest(request(),options({current:async()=>++checks===1}))).body.error,'PUBLICATION_ACK_UNKNOWN');
});
test('current display expires at the HTTP boundary, including saved reference operations',async()=>{
 for(const expiresAt of [new Date(Date.now()-1).toISOString(),new Date(Date.now()+60000).toISOString()]) {
  const data={...base(),kind:'detail',experience:{...experience(),expiresAt}};
  assert.equal((await handlePublicationRequest(request({action:'detail',publicationId:id}),options({call:async()=>({data,error:null})}))).body.error,'PUBLICATION_UNAVAILABLE');
 }
 const e=experience();const data={...base(),kind:'detail',experience:e};assert.equal((await handlePublicationRequest(request({action:'detail',publicationId:id}),options({call:async()=>({data,error:null})}))).status,200);
 const save={action:'save',operationId:op,referenceId:ref,publicationId:id,expectedPublicationVersion:3,expectedSubmissionVersion:2,expectedSafetyVersion:0};
 const expired={...base(),kind:'operation',operationId:op,state:'committed',publication:null,reference:{...reference(),experience:{...experience(),expiresAt:new Date(Date.now()-1).toISOString()}}};
 assert.equal((await handlePublicationRequest(request(save),options({call:async()=>({data:expired,error:null})}))).body.error,'PUBLICATION_ACK_UNKNOWN','expired returned body does not prove the dispatched save failed');
});
test('recovery transport caps remain layered with UTF16/UTF8 original exact bytes',async()=>{
 const raw=JSON.stringify(command());const large=JSON.stringify(command())+' '.repeat(10001-raw.length);
 assert.equal((await handlePublicationRequest(request(large),options())).status,413);
 assert.equal((await handlePublicationRequest(request(' '.repeat(49153)),options())).status,413);
 const original={action:'rightsReview',operationId:op,publicationId:id,expectedPublicationVersion:1,expectedSubmissionVersion:2,expectedSafetyVersion:0,decision:'approve',note:'Synthetic'};
 const originalBytes=JSON.stringify(original)+'\t'.repeat(10000-JSON.stringify(original).length);
 const recovery={action:'operation',operationId:op,mutationBytes:originalBytes};assert.ok(Buffer.byteLength(JSON.stringify(recovery))>10000);
 assert.equal((await handlePublicationRequest(request(recovery,{},'ops'),options({},{surface:'ops',sameOrigin:true}))).status,200);
 assert.equal((await handlePublicationRequest(request({...recovery,mutationBytes:originalBytes+'\t'}, {},'ops'),options({},{surface:'ops',sameOrigin:true}))).status,400);
});
