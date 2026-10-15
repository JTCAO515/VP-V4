import {randomUUID as uuid} from 'node:crypto';
export async function produceTripCandidate(f,db,{cancel=true,proposal=false,grant}={}){
 const a=await f.workerFixture(),goal=await f.canonical(a),c=await f.prepare(a,goal),input={action:'ask',operationId:uuid(),basis:{contextId:c.contextId,contextDigest:c.contextDigest,baseVersion:0},text:'Move B to d2'};
 if(grant)await grant(a);
 const task=await f.call(a,'submit_trip_service_task_v1',[a.trip,input,goal]);const l=await f.service('claim_scoped_trip_edit_work_v1',{p_owner_id:a.owner,p_policy_id:a.policy,p_scope_id:a.scope});const read=await f.service('read_scoped_trip_edit_work_v1',{p_turn_id:l.turnId,p_lease_token:l.leaseToken});const p={p_binding:read.binding};
 await f.service('scoped_trip_edit_budget_v1',{...p,p_effect:'reserve',p_reserved_micros:100,p_actual_micros:null,p_outcome:null});await f.service('scoped_trip_edit_budget_v1',{...p,p_effect:'dispatch',p_reserved_micros:null,p_actual_micros:null,p_outcome:null});
 const usage={inputTokens:10,outputTokens:5,totalTokens:15,cachedInputTokens:null,uncachedInputTokens:null,reasoningTokens:null,cost:'unknown'},edits=[{kind:'move_item',itemId:'b',toDayId:'d2'}];
 await f.service('record_scoped_trip_edit_output_v1',{...p,p_output:{kind:'candidate',edits},p_usage:usage,p_actual_micros:15});await f.service('scoped_trip_edit_budget_v1',{...p,p_effect:'finish',p_reserved_micros:null,p_actual_micros:15,p_outcome:'settle'});
 const patch=(await db(`select scoped_edit_private.candidate_patch_v1(c,'${input.operationId}','${read.binding.attemptId}','${JSON.stringify(edits)}') v from scoped_edit_private.contexts_v1 c where id='${c.contextId}'`))[0].v;
 await f.service('complete_scoped_trip_edit_work_v1',{...p,p_patch:patch});let selected=null;
 if(proposal)selected=await f.call(a,'submit_scoped_trip_edit_v1',[a.trip,{action:'select_candidate',operationId:uuid(),basis:input.basis,askOperationId:input.operationId,candidateId:read.binding.attemptId}]);
 if(cancel)await f.call(a,'cancel_trip_service_task_v1',[task.taskId]);return {a,goal,c,input,task,read,proposal:selected};
}
