import {parseResultArtifactReadV2} from "../artifacts/result-v2-contract.ts";
import {validJourneysGoalIndexPage} from "../turn/native-journeys-goal-index-http.ts";
import {record} from "./contract.ts";
import {parseReadinessDeclarationRead} from "./declarations-contract.ts";
import type {ReadinessRPC} from "./actions-service.ts";
import {isUuid} from "../identity/request-guards.ts";
export type ReadinessTaskOption={taskId:string;tripVersion:number;goalId:string;goalVersion:number;conversationId:string;label:string};
export type ReadinessTaskSelection={kind:"readiness_task_reference/1";taskId:string;tripId:string;tripVersion:number;artifactId:string;artifactRevision:number}
 |{kind:"readiness_task_options/1";tripId:string;options:ReadinessTaskOption[]}|{kind:"unavailable"};
/** Discovery pointers are never current authority. Existing source readers plus
 * the declaration ledger recheck every candidate, including after a date change. */
export async function selectReadinessTasks(tripId:string,policyId:string|null,rpc:ReadinessRPC):Promise<ReadinessTaskSelection>{
 const call=async(name:string,params:Record<string,unknown>)=>{const value=await rpc(name,params);if(value.error)throw Error("READINESS_UNAVAILABLE");return value.data;};
 const current=async(taskId:string)=>parseReadinessDeclarationRead(await call("read_readiness_declarations_v1",{p_trip_id:tripId,p_task_id:taskId}));
 const ref=await call("read_trip_result_reference_v2",{p_trip_id:tripId});
 if(record(ref)&&ref.kind==="result_reference"){
  if(ref.tripId!==tripId||typeof ref.artifactId!=="string"||!isUuid(ref.artifactId)||!Number.isSafeInteger(ref.revision))return {kind:"unavailable"};
  const artifact=parseResultArtifactReadV2(await call("read_result_artifact_v2",{p_artifact_id:ref.artifactId,p_revision:ref.revision}));
  if(!artifact||artifact.source.tripId!==tripId||artifact.lifecycle!=="active")return {kind:"unavailable"};
  const verified=await current(artifact.source.taskId);
  if(!verified||verified.basis.tripId!==tripId||verified.basis.taskId!==artifact.source.taskId)return {kind:"unavailable"};
  return {kind:"readiness_task_reference/1",taskId:verified.basis.taskId,tripId,tripVersion:verified.basis.tripVersion,artifactId:artifact.artifactId,artifactRevision:artifact.revision};
 }
 if(!record(ref)||ref.kind!=="empty"||!policyId)return {kind:"unavailable"};
 const options:ReadinessTaskOption[]=[],seen=new Set<string>();let cursor:unknown=null,snapshot:string|null=null,complete=false;
 for(let page=0;page<5;page++){
  const goals=await call("read_journeys_goal_index_v1",{p_policy_id:policyId,p_cursor:cursor});
  if(!validJourneysGoalIndexPage(goals)||!record(goals)||!Array.isArray(goals.goals))return {kind:"unavailable"};
  if(snapshot!==null&&snapshot!==goals.snapshot)return {kind:"unavailable"};snapshot=goals.snapshot as string;
  for(const goal of goals.goals){
   if(!record(goal)||!record(goal.relation)||goal.relation.state!=="linked"||goal.relation.tripId!==tripId)continue;
   let taskCursor:unknown=null,sequence:unknown=null,taskComplete=false;const taskSeen=new Set<string>();
   for(let taskPage=0;taskPage<5;taskPage++){
    const tasks=await call("list_assistant_conversation_tasks_v1",{p_policy_id:policyId,p_conversation_id:goal.conversationId,p_cursor:taskCursor});
    if(!record(tasks)||tasks.kind!=="conversation_tasks"||tasks.conversationId!==goal.conversationId||!Array.isArray(tasks.messages)||tasks.messages.length>20
     ||!Array.isArray(tasks.turns)||tasks.turns.length!==tasks.messages.length)return {kind:"unavailable"};
    if(sequence!==null&&sequence!==tasks.conversationSequence)return {kind:"unavailable"};sequence=tasks.conversationSequence;
    for(const message of tasks.messages){
     if(!record(message)||typeof message.taskId!=="string"||!isUuid(message.taskId)||taskSeen.has(message.taskId))return {kind:"unavailable"};
     taskSeen.add(message.taskId);
     if(message.goalId!==goal.goalId||message.scopeVersion!==goal.scopeVersion||seen.has(message.taskId))continue;
     const source=tasks.turns.find(t=>record(t)&&t.serviceTaskId===message.taskId&&t.goalScopeVersion===goal.scopeVersion&&t.currentGoalScopeVersion===goal.scopeVersion);
     if(!source)continue;
     const verified=await current(message.taskId);
     if(!verified||verified.basis.tripId!==tripId||verified.basis.goalId!==goal.goalId||verified.basis.goalVersion!==goal.scopeVersion
      ||verified.basis.conversationId!==goal.conversationId)continue;
     seen.add(message.taskId);options.push({taskId:message.taskId,tripVersion:verified.basis.tripVersion,goalId:verified.basis.goalId,goalVersion:verified.basis.goalVersion,
      conversationId:verified.basis.conversationId,label:String(goal.text)});
     if(options.length>20)return {kind:"unavailable"};
    }
    if(tasks.nextCursor===null){taskComplete=true;break;}
    if(!record(tasks.nextCursor))return {kind:"unavailable"};taskCursor=tasks.nextCursor;
   }
   if(!taskComplete)return {kind:"unavailable"};
  }
  if(goals.nextCursor===null){complete=true;break;}cursor=goals.nextCursor;
 }
 if(!complete)return {kind:"unavailable"};
 const finalGoals=await call("read_journeys_goal_index_v1",{p_policy_id:policyId,p_cursor:null});
 if(!record(finalGoals)||finalGoals.snapshot!==snapshot)return {kind:"unavailable"};
 for(const option of options){
  const verified=await current(option.taskId);
  if(!verified||verified.basis.tripId!==tripId||verified.basis.tripVersion!==option.tripVersion||verified.basis.goalId!==option.goalId
   ||verified.basis.goalVersion!==option.goalVersion||verified.basis.conversationId!==option.conversationId)return {kind:"unavailable"};
 }
 return {kind:"readiness_task_options/1",tripId,options:options.sort((a,b)=>a.taskId.localeCompare(b.taskId))};
}
