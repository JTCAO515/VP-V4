import {parseScopedReceipt,sameValue} from '../trip/scoped-edit/wire.ts';
import { parseTripTaskAdmission, type TripTaskAdmission, type TripTaskRequest } from './contract.ts';
import { mappedError, ScopedEditServiceError, type ScopedEditRPC } from '../trip/scoped-edit/service.ts';
/** Uses the caller's authenticated transport; no provider, retries or confirmation. */
export async function admitTripTask(tripId:string,input:TripTaskRequest,rpc:ScopedEditRPC):Promise<TripTaskAdmission>{
 const r=await rpc('submit_trip_service_task_v1',{p_trip_id:tripId,p_input:{action:'ask',operationId:input.operationId,basis:input.basis,text:input.text},p_goal:input.goal});
 if(r.error)throw new ScopedEditServiceError(mappedError(r.error.message));
 const receipt=parseTripTaskAdmission(r.data,input.operationId);
 if(!receipt)throw new ScopedEditServiceError('SCOPED_EDIT_RECEIPT_UNKNOWN');
 return receipt;
}

import {runScopedEdit} from '../trip/scoped-edit/service.ts';
import type {TripTaskControl} from './contract.ts';
import type {TripSnapshot} from '../trip/patch/contract.ts';
/** Exact existing result decoders/diff checks through the Trip-only SQL capability. */
export async function runTripTaskControl(tripId:string,input:TripTaskControl,rpc:ScopedEditRPC,snapshot:TripSnapshot,now:number){
 const bridged:ScopedEditRPC=async(name,p)=>{
  if(name==='prepare_scoped_trip_edit_v1'&&input.action==='trip_context')return rpc('trip_service_task_owner_v1',{p_trip_id:tripId,p_action:'context',p_input:{goal:input.goal,context:p.p_input}});
  if(name==='submit_scoped_trip_edit_v1'&&input.action==='trip_select')return rpc('trip_service_task_owner_v1',{p_trip_id:tripId,p_action:'select',p_input:p.p_input});
  if(name==='read_scoped_trip_edit_operation_v1')return rpc('trip_service_task_owner_v1',{p_trip_id:tripId,p_action:'read',p_input:{operationId:p.p_operation_id}});
  throw new ScopedEditServiceError('INVALID_INPUT');
 };
 const original=input.action==='trip_context'?input.context:input.action==='trip_select'?input.selection:{action:'read_operation' as const,operationId:input.operationId};
 return runScopedEdit(tripId,original,bridged,snapshot,now,true);
}
/** Compose with the existing executor's injected RPC port; the bridge can lease
 * only admitted Trip work. No credentials, default transport or provider added. */
export function tripTaskWorkerRPC(rpc:(name:string,p:Readonly<Record<string,unknown>>)=>Promise<unknown>){
 return (name:string,p:Readonly<Record<string,unknown>>)=>rpc('trip_service_task_worker_v1',{p_method:name==='claim_scoped_trip_edit_work_v1'?'claim':name,p_input:p});
}

import {exact,record} from '../trip/scoped-edit/contract.ts';
import type {ScopedBinding} from '../turn/scoped-edit/protocol.ts';
export async function persistTripClarification(binding:ScopedBinding,question:string,rpc:(n:string,p:Readonly<Record<string,unknown>>,s:AbortSignal)=>Promise<unknown>,signal:AbortSignal):Promise<boolean>{
 const p={p_binding:binding};
 const valid=(v:unknown)=>record(v)&&exact(v,['kind','binding','receipt'])&&v.kind==='clarification_saved'&&sameValue(v.binding,binding)&&!!parseScopedReceipt(v.receipt,binding.tripId,binding.operationId,true)&&record(v.receipt)
 &&v.receipt.kind==='trip_service_clarification/1'&&v.receipt.operationId===binding.operationId&&v.receipt.tripId===binding.tripId&&v.receipt.question===question;
 try{if(valid(await rpc('complete_trip_service_clarification_v1',p,signal))&&!signal.aborted)return true;}catch{/* original exact receipt only */}
 return !signal.aborted&&valid(await rpc('read_scoped_trip_edit_completion_v1',p,signal));
}

import type {TripTaskContinuation} from './contract.ts';
export async function continueTripTask(tripId:string,input:TripTaskContinuation,rpc:ScopedEditRPC){
 const r=await rpc('continue_trip_service_task_v1',{p_trip_id:tripId,p_task_id:input.taskId,p_parent_turn_id:input.parentTurnId,p_operation_id:input.operationId,p_relationship:input.relationship,p_text:input.text});
 if(r.error)throw new ScopedEditServiceError(mappedError(r.error.message));
 const receipt=parseTripTaskAdmission(r.data,input.operationId);
 if(!receipt||receipt.taskId!==input.taskId)throw new ScopedEditServiceError('SCOPED_EDIT_RECEIPT_UNKNOWN');return receipt;
}

export async function persistTripTechnicalFailure(binding:ScopedBinding,rpc:(n:string,p:Readonly<Record<string,unknown>>,s:AbortSignal)=>Promise<unknown>,signal:AbortSignal){
 const valid=(v:unknown)=>record(v)&&exact(v,['kind','binding','receipt'])&&v.kind==='technical_failure_saved'&&sameValue(v.binding,binding)&&record(v.receipt)&&v.receipt.kind==='trip_service_failure/1'&&!!parseScopedReceipt(v.receipt,binding.tripId,binding.operationId,true);
 try{if(valid(await rpc('complete_trip_service_failure_v1',{p_binding:binding},signal))&&!signal.aborted)return true;}catch{/* read original only */}
 return !signal.aborted&&valid(await rpc('read_scoped_trip_edit_completion_v1',{p_binding:binding},signal));
}
