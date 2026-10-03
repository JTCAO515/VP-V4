import {requestLifetime,type RequestLifetime} from '../review/request-lifetime.ts';
import {runSourceImpactConsumer,type SourceImpactRpc} from '../../jobs/source-impact-consumer.ts';
type OpsRpc=Readonly<{authenticate:()=>Promise<string|false>;call:(name:string,p:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message:string}|null}>}>;
const knowledge=new Set(['claim_source_impact_delivery_v1','apply_source_impact_projection_v1','read_source_impact_delivery_v1','fail_source_impact_delivery_v1']);
const support=new Set(['claim_trip_support_impact_delivery_v1','apply_reviewed_trip_support_delivery_v1','read_reviewed_trip_support_delivery_v1','fail_reviewed_trip_support_delivery_v1']);
/** Actual bounded operator operation; credentials/session from existing Web Ops
 * client only. SQL current_actor/review remains authority, never service_role. */
export async function handleSourceImpactConsumeOnce(request:Request,options:Readonly<{enabled:boolean;sameOrigin:boolean;createRpc:(lifetime:RequestLifetime)=>OpsRpc}>){
 const reply=(code:string,status:number)=>({status,body:{error:code}});
 if(!options.enabled)return reply('OPS_DISABLED',503);
 if(request.method!=='POST'||!options.sameOrigin||request.headers.has('authorization'))return reply('OPS_FORBIDDEN',403);
 if(new URL(request.url).search||request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return reply('INVALID_INPUT',400);
 const lifetime=requestLifetime(request.signal,15000);let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 try{
  reader=request.body?.getReader();if(!reader)return reply('INVALID_INPUT',400);const chunks:Uint8Array[]=[];let bytes=0;
  for(;;){const part=await lifetime.run(()=>reader!.read());if(part.done)break;bytes+=part.value.byteLength;if(bytes>512)return reply('INVALID_INPUT',413);chunks.push(part.value);}
  let input:unknown;try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{return reply('INVALID_INPUT',400);}
  if(input===null||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||!['knowledge_recheck_projection','trip_item_support'].includes(String((input as {consumer?:unknown}).consumer)))return reply('INVALID_INPUT',400);
  const consumer=(input as {consumer:'knowledge_recheck_projection'|'trip_item_support'}).consumer,client=options.createRpc(lifetime),actor=await lifetime.run(()=>client.authenticate());if(!actor)return reply('UNAUTHENTICATED',401);
  const expected=request.headers.get('x-ops-expected-actor');if(expected!==null&&expected!==actor)return reply('OPS_FORBIDDEN',403);
  const rpc:SourceImpactRpc=async(name,p,signal)=>{
   if(!(consumer==='trip_item_support'?support:knowledge).has(name)||signal.aborted)throw Error('OPS_UNAVAILABLE');
   const result=await lifetime.run(()=>client.call(name,{...p}));if(result.error||Buffer.byteLength(JSON.stringify(result.data)??'null')>262144)throw Error('OPS_UNAVAILABLE');return result.data;
  };
  const result=await runSourceImpactConsumer({enabled:true,consumer,rpc},lifetime.signal);return {status:result==='acked'||result==='idle'?200:503,body:{data:{kind:'source_impact_once',consumer,outcome:result}}};
 }catch{return reply('OPS_ACK_UNKNOWN',503);}finally{lifetime.dispose();try{void reader?.cancel().catch(()=>{});}catch{}}
}
