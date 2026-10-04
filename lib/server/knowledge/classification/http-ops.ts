import {requestLifetime,type RequestLifetime} from '../review/request-lifetime.ts';
import {isClassificationOperation,decodeClassificationReply} from './contract.ts';
type OpsRpc={authenticate():Promise<string|false>;call(name:string,input:Record<string,unknown>):PromiseLike<{data:unknown;error:{message:string}|null}>};
export async function handleClassificationOps(request:Request,options:Readonly<{enabled:boolean;sameOrigin:boolean;createRpc:(lifetime:RequestLifetime)=>OpsRpc}>){
 const failure=(error:string,status:number)=>({status,body:{error}});
 if(!options.enabled)return failure('OPS_DISABLED',503);
 if(request.method!=='POST'||!options.sameOrigin||request.headers.has('authorization'))return failure('OPS_FORBIDDEN',403);
 if(new URL(request.url).search||request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return failure('INVALID_INPUT',400);
 const lifetime=requestLifetime(request.signal,15000);let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;let dispatched=false;
 try{
  reader=request.body?.getReader();if(!reader)return failure('INVALID_INPUT',400);const chunks:Uint8Array[]=[];let bytes=0;for(;;){const p=await lifetime.run(()=>reader!.read());if(p.done)break;if((bytes+=p.value.byteLength)>24000)return failure('INVALID_INPUT',413);chunks.push(p.value);}
  let input:unknown;try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{return failure('INVALID_INPUT',400);}if(!isClassificationOperation(input))return failure('INVALID_INPUT',400);
  const client=options.createRpc(lifetime),actor=await lifetime.run(()=>client.authenticate());if(!actor)return failure('UNAUTHENTICATED',401);const expected=request.headers.get('x-ops-expected-actor');if(expected!==actor)return failure('OPS_FORBIDDEN',403);
  dispatched=true;const r=await lifetime.run(()=>client.call('ops_lodging_classification_v1',{p_input:input}));
  if(r.error){const known:Record<string,number>={UNAUTHENTICATED:401,OPS_FORBIDDEN:403,OPS_DISABLED:503,OPS_SELF_REVIEW:403,INVALID_INPUT:400,OPS_CONFLICT:409,SESSION_REPLACED:401};return Object.hasOwn(known,r.error.message)?failure(r.error.message,known[r.error.message]):failure('OPS_ACK_UNKNOWN',503);}
  const currentActor=await lifetime.run(()=>client.authenticate());if(currentActor!==actor)return failure('OPS_ACK_UNKNOWN',503);
  const decoded=decodeClassificationReply(r.data,input);if(!decoded)return failure('OPS_ACK_UNKNOWN',503);return {status:200,body:{data:decoded}};
 }catch{return failure(dispatched?'OPS_ACK_UNKNOWN':'OPS_UNAVAILABLE',503);}finally{lifetime.dispose();try{void reader?.cancel().catch(()=>{});}catch{}}
}
