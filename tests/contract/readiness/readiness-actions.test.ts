import test from "node:test";
import assert from "node:assert/strict";
import {assessPreparation} from "../../../lib/server/readiness/assessment.ts";
import {readinessActionsService} from "../../../lib/server/readiness/actions-service.ts";
import {parseReadinessActionsInput} from "../../../lib/server/readiness/actions-input.ts";
import {questionDefinition} from "../../../lib/server/knowledge/claim/questions.ts";
import {readinessQuestion} from "../../../lib/server/readiness/actions-contract.ts";
import type {ReadinessDeclarationRead,ReadinessDeclaration} from "../../../lib/server/readiness/declarations-contract.ts";
const uuid=(n:number)=>`314b8576-e9e7-49aa-aa66-${String(n).padStart(12,"0")}`;
const now=new Date("2026-10-04T09:00:00Z"),trip=uuid(1),task=uuid(2);
const basis={taskId:task,taskTurnId:uuid(3),conversationId:uuid(4),goalId:uuid(5),goalVersion:1,tripId:trip,tripVersion:1,dateBasis:"a".repeat(64),taskBasisDigest:"b".repeat(64)};
const declaration=(scenario:ReadinessDeclaration["scenario"],locale:"zh"|"en"="en"):ReadinessDeclaration=>({scenario,city:"shanghai",locale,subjectId:["address","admission"].includes(scenario)?"selected_place":null,applies:"yes",resourcesReady:"yes",conditionsChecked:"yes",checkAt:"now"});
function state(d:ReadinessDeclaration):ReadinessDeclarationRead{return {kind:"readiness_declarations",basis,revision:1,declarations:[d],state:"current",ruleVersion:"readiness-actions/1",declarationBasis:"explicit_user_report"};}
function knowledge(d:ReadinessDeclaration){
 const q=readinessQuestion(d.scenario==="admission"?"address":d.scenario,d.subjectId)!;
 const definition=questionDefinition(q.questionId,q.subjectId)!;
 const claims=d.scenario==="admission"?[{subjectId:d.subjectId,predicate:"permits_admission",objectId:"entry_scope"}]:definition.claims;
 const rows=claims.map((claim,i)=>({factId:uuid(20+i),version:1,assertionId:uuid(30+i),assertionRevision:2,assertion:{...claim,conditions:[],exclusions:[]},text:d.locale==="zh"?"已审核适用指引":"Reviewed applicable guidance",conditions:[],exclusions:[],reviewedAt:"2026-10-03T00:00:00Z",publishedAt:"2026-10-03T01:00:00Z",expiresAt:"2026-10-05T00:00:00Z",sources:[{sourceRevisionId:uuid(40+i),publisher:"Official publisher",uri:"https://example.invalid/official",locator:"Section"}]}));
 return {schemaVersion:d.scenario==="admission"?"knowledge-read/1":"knowledge-answer/1",purpose:"trip_planning",recipient:"first_party",territory:"CN-mainland",status:"available",scope:{city:d.city,locale:d.locale,scene:d.scenario==="admission"?"attraction":definition.scene},evaluatedAt:now.toISOString(),statements:rows,answer:{questionId:q.questionId,questionVersion:1,outcome:"answered",claims:claims.map((c,i)=>({id:c.objectId,status:"covered",reasons:[],factIds:[rows[i].factId]}))}};
}
test("all five existing ontology scenarios preserve readiness axes in both languages; absence is unknown",()=>{
 for(const scenario of ["connectivity","payment","admission","address","transport"] as const)for(const locale of ["zh","en"] as const){
  const d=declaration(scenario,locale),k=knowledge(d),s=state(d);
  assert.equal(assessPreparation(s,d,k,now).userReadiness,"satisfied");
  const unknown={...d,resourcesReady:"unknown" as const};assert.equal(assessPreparation(state(unknown),unknown,k,now).userReadiness,"unknown");
  const missing={...d,resourcesReady:"no" as const};assert.equal(assessPreparation(state(missing),missing,k,now).userReadiness,"not_satisfied");
  const later={...missing,checkAt:"2026-10-06T00:00:00Z"};assert.equal(assessPreparation(state(later),later,k,now).actionTiming,"not_yet");
  const irrelevant={...d,applies:"no" as const};const r=assessPreparation(state(irrelevant),irrelevant,k,now);assert.equal(r.userReadiness,"not_applicable");assert.equal(r.actions.length,0);
  const absent=assessPreparation(s,d,null,now);assert.equal(absent.knowledgeAvailability,"unknown");assert.equal(absent.userReadiness,"unknown");
 }
});
test("opening, incomplete coverage, expired and wrong scope never grant readiness; stale basis clears old yes",()=>{
 const d=declaration("admission"),k=knowledge(d);k.statements[0].assertion.predicate="opens_during";
 assert.equal(assessPreparation(state(d),d,k,now).knowledgeAvailability,"unknown");
 const rail=declaration("transport"),partial=knowledge(rail);partial.statements.pop();assert.equal(assessPreparation(state(rail),rail,partial,now).userReadiness,"unknown");
 const expired=knowledge(rail);expired.statements[0].expiresAt="2020-01-01T00:00:00Z";assert.equal(assessPreparation(state(rail),rail,expired,now).knowledgeAvailability,"unknown");
 const wrong=knowledge(rail);wrong.scope.city="beijing";assert.equal(assessPreparation(state(rail),rail,wrong,now).knowledgeAvailability,"unknown");
 const stale={...state(rail),state:"stale" as const,declarations:[],basis:{...basis,tripVersion:2,dateBasis:"c".repeat(64)}};
 const r=assessPreparation(stale,rail,knowledge(rail),now);assert.equal(r.declarationState,"stale");assert.equal(r.declaration.resourcesReady,"unknown");assert.equal(r.userReadiness,"unknown");
});
test("actions deliver exact current material/entry/candidate/proposal; revocation and CAS change reject old action",async()=>{
 const d={...declaration("address"),resourcesReady:"no" as const};let saved=state(d),k:unknown=knowledge(d);
 const rpc=async(name:string)=>({data:name==="read_readiness_declarations_v1"?saved:k,error:null});
 const input={schemaVersion:"readiness-request/2" as const,operation:"read" as const,taskId:task,expectedTripVersion:1,scenario:d.scenario,city:d.city,locale:d.locale,subjectId:d.subjectId};
 const proposal={proposalId:uuid(50),proposalRevision:1,proposalDigest:"d".repeat(64)},readProposal=async()=>proposal;
 const read=await readinessActionsService(input,trip,rpc,readProposal,()=>now);
 assert.ok("actions"in read);assert.deepEqual(read.actions.map(a=>a.kind),["verify_entry","read_material","conditional_candidate","trip_proposal"]);
 for(const a of read.actions){
  const executed=await readinessActionsService({...input,operation:"execute",actionId:a.actionId,assessmentDigest:read.assessmentDigest,expectedRevision:1,expectedBasis:{...basis}},trip,rpc,readProposal,()=>now);
  assert.ok("result"in executed);assert.equal(executed.actionId,a.actionId);
 }
 const a=read.actions[1],execute={...input,operation:"execute" as const,actionId:a.actionId,assessmentDigest:read.assessmentDigest,expectedRevision:1,expectedBasis:basis};
 k=null;await assert.rejects(readinessActionsService(execute,trip,rpc,readProposal,()=>now),/STALE_READINESS_BASIS/);
 k=knowledge(d);saved={...saved,revision:2};await assert.rejects(readinessActionsService(execute,trip,rpc,readProposal,()=>now),/STALE_READINESS_BASIS/);
});
test("lost save ACK retry reaches authoritative operation receipt despite incremented revision; caller authority and enum arrays rejected",async()=>{
 const d=declaration("payment");let saved:ReadinessDeclarationRead={...state(d),revision:0,state:"empty",declarations:[]},savedOnce=false;
 const rpc=async(name:string)=>{
  if(name==="read_readiness_declarations_v1")return {data:saved,error:null};
  if(name==="save_readiness_declaration_v1"){if(!savedOnce){savedOnce=true;saved={...state(d),revision:1};return {data:null,error:{message:"lost ACK"}};}return {data:saved,error:null};}
  return {data:knowledge(d),error:null};
 };
 const input={schemaVersion:"readiness-request/2" as const,operation:"save" as const,taskId:task,expectedTripVersion:1,scenario:d.scenario,city:d.city,locale:d.locale,subjectId:d.subjectId,expectedBasis:basis,expectedRevision:0,operationId:uuid(60),declaration:d};
 await assert.rejects(readinessActionsService(input,trip,rpc,async()=>undefined,()=>now),/READINESS_UNAVAILABLE/);
 const retried=await readinessActionsService(input,trip,rpc,async()=>undefined,()=>now);assert.ok("declarationRevision"in retried);assert.equal(retried.declarationRevision,1);
 assert.ok(parseReadinessActionsInput(input));assert.equal(parseReadinessActionsInput({...input,ownerId:uuid(90)}),null);
 assert.equal(parseReadinessActionsInput({...input,scenario:["payment"]}),null);
});
