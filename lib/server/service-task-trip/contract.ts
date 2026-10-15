import { exact, integer, record, uuid, validBasis, type EditBasis } from '../trip/scoped-edit/contract.ts';
export type TripGoalSource = Readonly<{conversationId:string;goalId:string;goalVersion:number;messageId:string;messageSequence:number;linkVersion:number;linkOperationId:string}>;
export type TripTaskRequest = Readonly<{schemaVersion:'trip-service-task/1';action:'trip_task';operationId:string;basis:EditBasis;text:string;goal:TripGoalSource}>;
export type TripTaskAdmission = Readonly<{kind:'trip_service_task/1';taskId:string;turnId:string;operationId:string;capacityMode:'record_only'|'development';reused:boolean}>;
/** Explicit new goal intent. Existing ask/manual bytes keep their original meaning. */

export function validTripGoalSource(g:unknown):g is TripGoalSource {
 return record(g)&&exact(g,['conversationId','goalId','goalVersion','messageId','messageSequence','linkVersion','linkOperationId'])
 &&uuid(g.conversationId)&&uuid(g.goalId)&&uuid(g.messageId)&&uuid(g.linkOperationId)&&integer(g.goalVersion,1)&&g.goalVersion<=10000
 &&integer(g.linkVersion,1)&&g.linkVersion<=10000&&integer(g.messageSequence,1)&&g.messageSequence<=1000000;
}
export function parseTripTaskRequest(v:unknown):TripTaskRequest|null {
 if(!record(v)||!exact(v,['schemaVersion','action','operationId','basis','text','goal'])||v.schemaVersion!=='trip-service-task/1'||v.action!=='trip_task'
 ||!uuid(v.operationId)||!validBasis(v.basis)||typeof v.text!=='string'||!v.text.trim()||v.text.length>4000||v.text.includes('\0'))return null;
 if(!validTripGoalSource(v.goal))return null;
 return v as TripTaskRequest;
}
export function parseTripTaskAdmission(v:unknown,operationId:string):TripTaskAdmission|null {
 return record(v)&&exact(v,['kind','taskId','turnId','operationId','capacityMode','reused'])&&v.kind==='trip_service_task/1'&&uuid(v.taskId)&&uuid(v.turnId)&&v.taskId!==v.turnId
 &&v.operationId===operationId&&['record_only','development'].includes(String(v.capacityMode))&&typeof v.reused==='boolean'?v as TripTaskAdmission:null;
}

export type TripTaskControl =
 | Readonly<{schemaVersion:'trip-service-task/1';action:'trip_context';goal:TripGoalSource;context:Extract<import('../trip/scoped-edit/contract.ts').ScopedEditRequest,{action:'context'}>}>
 | Readonly<{schemaVersion:'trip-service-task/1';action:'trip_select';selection:Extract<import('../trip/scoped-edit/contract.ts').ScopedEditRequest,{action:'select_candidate'}>}>
 | Readonly<{schemaVersion:'trip-service-task/1';action:'trip_read';operationId:string}>;
export function parseTripTaskControl(v:unknown):TripTaskControl|null {
 if(!record(v)||v.schemaVersion!=='trip-service-task/1')return null;
 if(v.action==='trip_read')return exact(v,['schemaVersion','action','operationId'])&&uuid(v.operationId)?v as TripTaskControl:null;
 if(v.action==='trip_select')return exact(v,['schemaVersion','action','selection'])&&parseScopedControl(v.selection,'select_candidate')?v as TripTaskControl:null;
 if(v.action==='trip_context'){
  if(!exact(v,['schemaVersion','action','goal','context'])||!parseScopedControl(v.context,'context'))return null;
  return validTripGoalSource(v.goal)?v as TripTaskControl:null;
 }
 return null;
}
import {parseScopedEditRequest} from '../trip/scoped-edit/contract.ts';
function parseScopedControl(v:unknown,action:string){const p=parseScopedEditRequest(v);return p?.action===action;}
