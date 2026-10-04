import {assessPreparation} from "./assessment.ts";
import {readinessQuestion,type ReadinessAction} from "./actions-contract.ts";
import {parseReadinessDeclarationRead} from "./declarations-contract.ts";
import type {ReadinessActionsInput} from "./actions-input.ts";
import type {ReadinessActionResult} from "./assessment-contract.ts";
import {record} from "./contract.ts";
export type ReadinessRPC=(name:string,params:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
type Proposal={proposalId:string;proposalRevision:number;proposalDigest:string}|undefined;
function fail(message:string):never{throw Error(message);}
export async function readinessActionsService(input:ReadinessActionsInput,tripId:string,rpc:ReadinessRPC,readProposal:()=>Promise<Proposal>,clock=()=>new Date()){
 const load=async()=>{
  const response=await rpc("read_readiness_declarations_v1",{p_trip_id:tripId,p_task_id:input.taskId});
  if(response.error)return fail("READINESS_UNAVAILABLE");
  if(record(response.data)&&response.data.kind==="unavailable")return fail("FORBIDDEN");
  const value=parseReadinessDeclarationRead(response.data);
  if(!value||value.basis.tripId!==tripId||value.basis.taskId!==input.taskId)return fail("READINESS_UNAVAILABLE");
  if(value.basis.tripVersion!==input.expectedTripVersion)return fail("STALE_TRIP_VERSION");
  return value;
 };
 let saved=await load();
 if(input.operation==="execute"&&(input.expectedRevision!==saved.revision||Object.entries(saved.basis).some(([k,value])=>(input.expectedBasis as unknown as Record<string,unknown>)[k]!==value)))fail("STALE_READINESS_BASIS");
 if(input.operation==="save"){
  const changed=await rpc("save_readiness_declaration_v1",{p_trip_id:tripId,p_task_id:input.taskId,p_expected_basis:input.expectedBasis,
   p_expected_revision:input.expectedRevision,p_operation_id:input.operationId,p_declaration:input.declaration});
  if(changed.error)fail("READINESS_UNAVAILABLE");
  if(record(changed.data)&&changed.data.kind==="conflict")fail("STALE_READINESS_BASIS");
  if(record(changed.data)&&changed.data.kind==="unavailable")fail("FORBIDDEN");
  const verified=parseReadinessDeclarationRead(changed.data);
  if(!verified||verified.basis.tripId!==tripId||verified.basis.taskId!==input.taskId)fail("READINESS_UNAVAILABLE");
  saved=verified;
 }
 const selection={scenario:input.scenario,city:input.city,locale:input.locale,subjectId:input.subjectId};
 const evidence=async()=>{
  if(input.scenario==="admission"){
   if(input.subjectId===null)return null;
   const read=await rpc("knowledge_read_v1",{p_input:{city:input.city,scene:"attraction",locale:input.locale}});
   return read.error?null:read.data;
  }
  const question=readinessQuestion(input.scenario,input.subjectId);
  if(!question)return null;
  const read=await rpc("knowledge_answer_v1",{p_input:{questionId:question.questionId,questionVersion:1,city:input.city,locale:input.locale,
   ...(question.subjectId===null?{}:{subjectId:question.subjectId})}});
  return read.error?null:read.data;
 };
 const knowledge=await evidence(),proposal=await readProposal();
 const result=assessPreparation(saved,selection,knowledge,clock(),proposal);
 const current=await load();
 if(current.revision!==saved.revision||JSON.stringify(current.basis)!==JSON.stringify(saved.basis)||JSON.stringify(current.declarations)!==JSON.stringify(saved.declarations))fail("STALE_READINESS_BASIS");
 // Source refresh and selected proposal eligibility are repeated for action use,
 // including retries. No successful label or cached source grants a later action.
 if(input.operation==="execute"){
  const rechecked=assessPreparation(current,selection,await evidence(),clock(),await readProposal());
  if(rechecked.assessmentDigest!==input.assessmentDigest||result.assessmentDigest!==input.assessmentDigest)fail("STALE_READINESS_BASIS");
  const action=rechecked.actions.find(a=>a.actionId===input.actionId);
  if(!action)fail("STALE_READINESS_BASIS");
  const delivery=await load();
  if(delivery.revision!==current.revision||JSON.stringify(delivery.basis)!==JSON.stringify(current.basis)||JSON.stringify(delivery.declarations)!==JSON.stringify(current.declarations))fail("STALE_READINESS_BASIS");
  return {kind:"readiness_action/1",actionId:action.actionId,basis:action.basis,result:executeReadinessAction(action,rechecked.evidence)};
 }
 return result;
}
function executeReadinessAction(action:ReadinessAction,evidence:ReturnType<typeof assessPreparation>["evidence"]):ReadinessActionResult{
 if(action.kind==="trip_proposal")return {kind:"trip_proposal_reference",proposalId:action.proposalId,proposalRevision:action.proposalRevision,proposalDigest:action.proposalDigest};
 const fact=action.factId===null?undefined:evidence.find(e=>e.factId===action.factId&&e.publicationVersion===action.publicationVersion);
 if(action.kind==="verify_entry")return {kind:"verification_entry",target:action.target,sources:fact?.sources??[]};
 if(!fact)fail("STALE_READINESS_BASIS");
 if(action.kind==="conditional_candidate")return {kind:"conditional_candidate",subjectId:action.subjectId,evidence:fact};
 if(!fact.sources.some(s=>s.sourceRevisionId===action.sourceRevisionId))fail("STALE_READINESS_BASIS");
 return {kind:"material",evidence:fact};
}
