import { isDeepStrictEqual } from 'node:util';
import { requestLifetime, type RequestLifetime } from '../../knowledge/review/request-lifetime.ts';
import { CONTROL_SCHEMA, mutationId, parseControlInput, type ControlInput } from './contract.ts';
import { permitsControlEnvelope, readControlBody } from './envelope.ts';
import { decodeBudget, decodeReceipt, decodeWorkspace, receiptMatches, sameFence, type ControlWorkspace } from './projection.ts';

export type ControlRPC=Readonly<{
 authenticate():Promise<string|false>;
 /** Bound by the adapter to the reviewed caller-cookie operations wrapper. */
 operations(input:ControlInput):PromiseLike<{data:unknown;error:{message:string}|null}>;
}>;
const errors:Readonly<Record<string,number>>={OPS_FORBIDDEN:403,OPS_CONFLICT:409,OPS_UNAVAILABLE:503,OPS_INVALID_INPUT:400};
/** A fresh workspace on both sides of an operation fences identity, session and
 * live Ops authority. Neither a cached workspace nor its registry grants dispatch. */
export async function handleControlOperations(request:Request,options:Readonly<{
 enabled:boolean;createRpc(lifetime:RequestLifetime):ControlRPC;
}>){
 let operationId:string|null=null;
 const fail=(code:string,status=503)=>({status,body:{error:{code},...(operationId?{operationId,acknowledgement:'unknown' as const,recoveryAction:'read_original_operation' as const}:{})}});
 if(!options.enabled)return fail('OPS_UNAVAILABLE');
 if(!permitsControlEnvelope(request))return fail('OPS_FORBIDDEN',403);
 const life=requestLifetime(request.signal);let input:ControlInput|null=null;
 try{
  try{input=parseControlInput(await readControlBody(request,life));}catch{return fail('OPS_INVALID_INPUT',400);}
  if(!input)return fail('OPS_INVALID_INPUT',400);
  const rpc=options.createRpc(life);const actor=await life.run(()=>rpc.authenticate());
  if(!actor)return fail('UNAUTHENTICATED',401);
  const read=async():Promise<ControlWorkspace|null>=>{
   const result=await life.run(()=>rpc.operations({schemaVersion:CONTROL_SCHEMA,action:'workspace'}));
   if(result.error)return null;return decodeWorkspace(result.data);
  };
  const initial=await life.run(()=>rpc.operations({schemaVersion:CONTROL_SCHEMA,action:'workspace'}));
  if(initial.error)return fail(Object.hasOwn(errors,initial.error.message)?initial.error.message:'OPS_UNAVAILABLE',errors[initial.error.message]??503);
  const before=decodeWorkspace(initial.data);if(!before)return fail('OPS_UNAVAILABLE');
  if(input.action==='workspace'){
   const fresh=await read();
   if(!fresh||!sameFence(before,fresh)||await life.run(()=>rpc.authenticate())!==actor)return fail('OPS_UNAVAILABLE');
   life.check();return {status:200,body:{data:fresh}};
  }
  if(input.action==='set'){
   const scope=input.scope;
   const registered=before.controls.some(c=>c.scope.kind===scope.kind&&c.scope.key===scope.key);
   if(!registered||!before.recoveryReady)return fail('OPS_UNAVAILABLE');
  }
  if(input.action==='budget_resume'&&!before.recoveryReady)return fail('OPS_UNAVAILABLE');
  // Mark dispatch before calling transport: loss cannot prove the mutation failed.
  operationId=mutationId(input);
  const result=await life.run(()=>rpc.operations(input!));
  if(result.error){
   // Only known SQL rejection proves that this dispatch did not apply.
   const status=errors[result.error.message];
   if(status){operationId=null;return fail(result.error.message,status);}
   return fail(operationId?'OPS_ACK_UNKNOWN':'OPS_UNAVAILABLE');
  }
  let data= input.action==='budget_read'?decodeBudget(result.data):decodeReceipt(result.data);
  if(!data||!sameFence(before,data))return fail(operationId?'OPS_ACK_UNKNOWN':'OPS_UNAVAILABLE');
  if(input.action==='budget_read'){
   if(!('scopeId' in data)||data.scopeId!==input.scopeId)return fail('OPS_UNAVAILABLE');
  }else{
   const receipt=decodeReceipt(data);if(!receipt||!receiptMatches(input,receipt))return fail(operationId?'OPS_ACK_UNKNOWN':'OPS_UNAVAILABLE');
   const checked=await life.run(()=>rpc.operations({schemaVersion:CONTROL_SCHEMA,action:'receipt',operationId:receipt.operationId}));
   const fresh=checked.error?null:decodeReceipt(checked.data);
   if(!fresh||!isDeepStrictEqual(receipt,fresh))return fail(operationId?'OPS_ACK_UNKNOWN':'OPS_UNAVAILABLE');
   data=fresh;
  }
  const after=await read();
  if(!after||!sameFence(before,after)||await life.run(()=>rpc.authenticate())!==actor)return fail(operationId?'OPS_ACK_UNKNOWN':'OPS_UNAVAILABLE');
  life.check();return {status:200,body:{data}};
 }catch{return fail(operationId?'OPS_ACK_UNKNOWN':'OPS_UNAVAILABLE');}
 finally{life.dispose();}
}
