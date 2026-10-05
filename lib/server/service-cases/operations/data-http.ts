import {isDeepStrictEqual} from 'node:util';
import type {NextRequest} from 'next/server.js';
import {getNativeRuntimeConfig} from '../../identity/native-config.ts';
import {verifyNativeCredentials} from '../../identity/native-credentials.ts';
import {nativeFetch} from '../../identity/native-fetch.ts';
import {requestLifetime,type RequestLifetime} from '../../knowledge/review/request-lifetime.ts';
import {exact,record} from './contract.ts';
import {serviceRequestDigest} from './http.ts';
import {decodeServiceDataBundle,decodeServiceDataReceipt,parseServiceDataInput,type ServiceDataInput} from './data-contract.ts';
export type ServiceDataRPC=Readonly<{
 authenticate():Promise<string|false>;sessionId():string|null;
 call(name:'service_case_data_v1',params:Record<string,unknown>):PromiseLike<{data:unknown;error:{message:string}|null}>;
}>;
/** Independent explicitly confirmed service scope. The old core export package
 * and its exact-lease enrollment are neither extended nor marked complete. */
export async function handleServiceData(request:Request,options:Readonly<{enabled:boolean;createRpc:(lifetime:RequestLifetime)=>ServiceDataRPC}>){
 let operationId:string|null=null;
 const failure=(code:string,status=503)=>({status,body:{error:{code},...(operationId?{operationId,acknowledgement:'unknown',recoveryAction:'read_original_operation'}:{})}});
 if(!options.enabled)return failure('CASE_DATA_DISABLED');
 if(request.method!=='POST'||new URL(request.url).search||request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return failure('INVALID_INPUT',400);
 if(request.headers.has('cookie')||request.headers.has('origin'))return failure('CASE_FORBIDDEN',403);
 const lifetime=requestLifetime(request.signal,15000);let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 try{
  reader=request.body?.getReader();if(!reader)return failure('INVALID_INPUT',400);
  const chunks:Uint8Array[]=[];let length=0;
  for(;;){const chunk=await lifetime.run(()=>reader!.read());if(chunk.done)break;length+=chunk.value.byteLength;if(length>48000)return failure('INVALID_INPUT',413);chunks.push(chunk.value);}
  let bytes:string,input:ServiceDataInput|null;
  try{bytes=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(Buffer.concat(chunks));input=parseServiceDataInput(JSON.parse(bytes));}catch{return failure('INVALID_INPUT',400);}
  if(!input||input.action!=='abandon'&&length>24000)return failure('INVALID_INPUT',400);
  const rpc=options.createRpc(lifetime),actor=await lifetime.run(()=>rpc.authenticate()),session=rpc.sessionId();
  if(!actor||!session)return failure('UNAUTHENTICATED',401);
  if(input.action==='delete'||input.action==='abandon')operationId=input.operationId;
  const call=(command:ServiceDataInput,raw:string)=>lifetime.run(()=>rpc.call('service_case_data_v1',{p_input:command,p_request_bytes:raw}));
  const initial=await call(input,bytes);
  if(initial.error){const statuses:Record<string,number>={INVALID_INPUT:400,CASE_FORBIDDEN:403,CASE_CONFLICT:409,CASE_BUSY:409,IDEMPOTENCY_KEY_REUSE:409,CASE_OPERATION_ERASED:410,CASE_WORKSPACE_LIMIT:503,UNAUTHENTICATED:401,SESSION_REPLACED:401};return Object.hasOwn(statuses,initial.error.message)?failure(initial.error.message,statuses[initial.error.message]):failure(operationId?'CASE_DATA_ACK_UNKNOWN':'CASE_DATA_UNAVAILABLE');}
  let data:unknown;
  if(input.action==='export'){
   const bundle=decodeServiceDataBundle(initial.data);
   if(!bundle||bundle.requestId!==input.requestId||bundle.ownerId!==actor||bundle.sessionId!==session||bundle.expiresAt<=Date.now()||Buffer.byteLength(JSON.stringify({data:bundle}),'utf8')>524288)return failure('CASE_DATA_UNAVAILABLE');
   const recheck=await call(input,bytes),current=decodeServiceDataBundle(recheck.data);
   if(recheck.error||!current||current.requestId!==bundle.requestId||current.ownerId!==actor||current.sessionId!==session||current.sourceDigest!==bundle.sourceDigest||!isDeepStrictEqual(current.rows,bundle.rows)||!isDeepStrictEqual(current.coverage,bundle.coverage)||bundle.expiresAt<=Date.now())return failure('CASE_DATA_UNAVAILABLE');
   data=bundle;
  }else if(input.action==='read_operation'){
   if(!record(initial.data)||!exact(initial.data,['receipt']))return failure('CASE_DATA_UNAVAILABLE');
   const receipt=initial.data.receipt===null?null:decodeServiceDataReceipt(initial.data.receipt);
   if(initial.data.receipt!==null&&(!receipt||receipt.operationId!==input.operationId))return failure('CASE_DATA_UNAVAILABLE');
   data={receipt};const final=await call(input,bytes);if(final.error||!isDeepStrictEqual(data,final.data))return failure('CASE_DATA_UNAVAILABLE');
  }else{
   const original=input.action==='abandon'?parseServiceDataInput(JSON.parse(input.mutationBytes)):input;
   const raw=input.action==='abandon'?input.mutationBytes:bytes;
   const receipt=decodeServiceDataReceipt(initial.data);
   if(original?.action!=='delete'||!receipt||receipt.operationId!==original.operationId||receipt.requestDigest!==serviceRequestDigest(raw))return failure('CASE_DATA_ACK_UNKNOWN');
   const read:ServiceDataInput={action:'read_operation',operationId:original.operationId},final=await call(read,JSON.stringify(read));
   if(final.error||!record(final.data)||!exact(final.data,['receipt'])||!isDeepStrictEqual(receipt,final.data.receipt))return failure('CASE_DATA_ACK_UNKNOWN');
   data=receipt;
  }
  if(await lifetime.run(()=>rpc.authenticate())!==actor||rpc.sessionId()!==session)return failure(operationId?'CASE_DATA_ACK_UNKNOWN':'UNAUTHENTICATED',operationId?503:401);
  lifetime.check();if(input.action==='export'&&decodeServiceDataBundle(data)!.expiresAt<=Date.now())return failure('CASE_DATA_UNAVAILABLE');
  return {status:200,body:{data}};
 }catch{return failure(operationId?'CASE_DATA_ACK_UNKNOWN':'CASE_DATA_UNAVAILABLE');}
 finally{lifetime.dispose();try{void reader?.cancel().catch(()=>{});}catch{/* already closed */}}
}
export async function serviceDataNativeHTTP(request:NextRequest){
 const config=getNativeRuntimeConfig(request,'session');
 const enabled=!!config&&!config.environment&&!process.env.VERCEL_ENV&&process.env.SERVICE_CASE_DATA_LOCAL==='1';
 const result=await handleServiceData(request,{enabled,createRpc:lifetime=>{
  const transport:typeof fetch=(url,init)=>lifetime.run(()=>nativeFetch(url,{...init,signal:init?.signal?AbortSignal.any([lifetime.signal,init.signal]):lifetime.signal}));
  let credentials:Awaited<ReturnType<typeof verifyNativeCredentials>>;
  return{
   sessionId(){return credentials?.sessionId??null;},
   async authenticate(){
    let unavailable=false;
    credentials=await verifyNativeCredentials(request,config!,transport,()=>{unavailable=true;});if(unavailable)throw Error('CASE_DATA_UNAVAILABLE');if(!credentials)return false;
    const session=await credentials.client.rpc('native_session_v2',{p_action:'session'}).abortSignal(lifetime.signal);
    if(session.error){if(!['UNAUTHENTICATED','SESSION_REPLACED'].includes(session.error.message))throw Error('CASE_DATA_UNAVAILABLE');return false;}
    return session.data?.subject===credentials.subject&&session.data?.sessionId===credentials.sessionId?credentials.subject:false;
   },
   async call(name,params){if(!credentials)return{data:null,error:{message:'UNAUTHENTICATED'}};return credentials.client.rpc(name,params).abortSignal(lifetime.signal);},
  };
 }});
 const input=record(result.body)&&'data'in result.body?decodeServiceDataBundle(result.body.data):null;
 return Response.json(result.body,{status:result.status,headers:{'Cache-Control':'private, no-store',Vary:'Authorization','X-Content-Type-Options':'nosniff',...(input?{'Content-Disposition':`attachment; filename="visepanda-service-${input.requestId}.json"`}:{})}});
}
