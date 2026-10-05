import {requestLifetime,type RequestLifetime} from '../../knowledge/review/request-lifetime.ts';
import {SAFETY_SCHEMA,parseSafetyInput,isSafetyMutation,safetySideEffect,decodeSafetyOutcome,matchesSafetyOutcome,type SafetyInput} from './contract.ts';
export type SafetyRPC={authenticate():Promise<string|false>;sessionId():string|null;current():Promise<boolean>;call(name:string,input:Record<string,unknown>):PromiseLike<{data:unknown;error:{message:string}|null}>};
const statuses:Record<string,number>={INVALID_INPUT:400,UNAUTHENTICATED:401,SESSION_REPLACED:401,SAFETY_FORBIDDEN:403,SAFETY_CONFLICT:409,SAFETY_NOT_FOUND:404,SAFETY_DISABLED:503,SAFETY_CAPACITY:503,SAFETY_OPERATION_ABANDONED:409};
export function moderatorCommand(input:SafetyInput):boolean {
  if (['queue','inspect','disposition','appealReview'].includes(input.action)) return true;
  if (input.action==='operation' || input.action==='abandon') {const original=parseSafetyInput(JSON.parse(input.mutationBytes));return !!original && moderatorCommand(original);}
  return false;
}
/** Credentials never authorize an object by themselves: the SQL operation must
 * requalify object access, actor independence and both source revisions. */
export async function handleSafetyRequest(request:Request,options:{enabled:boolean;cleanupEnabled:boolean;surface:'native'|'ops';sameOrigin?:boolean;createRpc(lifetime:RequestLifetime):SafetyRPC;milliseconds?:number}) {
  const fail=(error:string,status=503)=>({body:{error},status});
  if (!options.enabled && !options.cleanupEnabled) return fail('SAFETY_DISABLED');
  if (request.method!=='POST') return fail('INVALID_INPUT',405);
  if (options.surface==='native'?request.headers.has('cookie') || request.headers.has('origin'):request.headers.has('authorization') || !options.sameOrigin) return fail('SAFETY_FORBIDDEN',403);
  if (new URL(request.url).search || request.headers.get('content-type')?.split(';')[0].trim()!=='application/json') return fail('INVALID_INPUT',400);
  const lifetime=requestLifetime(request.signal,options.milliseconds);
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;let dispatched=false;let sideEffect=false;
  try {
    const rpc=options.createRpc(lifetime);const actor=await lifetime.run(()=>rpc.authenticate());const session=rpc.sessionId();
    if (!actor || !session) return fail('UNAUTHENTICATED',401);
    if (request.headers.get('x-community-safety-expected-actor')!==actor || request.headers.get('x-community-safety-expected-session')!==session) return fail('SAFETY_FORBIDDEN',403);
    reader=request.body?.getReader();if (!reader) return fail('INVALID_INPUT',400);
    const chunks:Uint8Array[]=[];let length=0;
    for (;;) {const next=await lifetime.run(()=>reader!.read());if (next.done) break;length+=next.value.byteLength;if (length>49152) return fail('INVALID_INPUT',413);chunks.push(next.value);}
    let raw:string;let input:SafetyInput|null;
    try {raw=new TextDecoder('utf8',{fatal:true,ignoreBOM:true}).decode(Buffer.concat(chunks));input=parseSafetyInput(JSON.parse(raw));} catch {return fail('INVALID_INPUT',400);}
    if (!input) return fail('INVALID_INPUT',400);
    const recovery=input.action==='operation' || input.action==='abandon';
    if (!recovery && (length>24000 || raw.length>10000)) return fail('INVALID_INPUT',413);
    sideEffect=safetySideEffect(input);
    if ((!options.enabled && (!['session','mine','read','unblock','operation','abandon','export','delete','appeal'].includes(input.action) || moderatorCommand(input))) || options.surface==='native' && moderatorCommand(input)) return fail(options.surface==='native' && moderatorCommand(input)?'SAFETY_FORBIDDEN':'SAFETY_DISABLED',options.surface==='native' && moderatorCommand(input)?403:503);
    if (!await lifetime.run(()=>rpc.current())) return fail('SESSION_REPLACED',401);
    lifetime.check();dispatched=true;
    const {data,error}=await lifetime.run(()=>rpc.call('community_workspace',{p_input:{protocol:SAFETY_SCHEMA,command:input,mutationBytes:isSafetyMutation(input)?raw:null}}));
    if (error) return Object.hasOwn(statuses,error.message)?fail(error.message,statuses[error.message]):fail(sideEffect?'SAFETY_ACK_UNKNOWN':'SAFETY_UNAVAILABLE');
    const outcome=decodeSafetyOutcome(data);
    if (!outcome || !matchesSafetyOutcome(outcome,input,actor,session)) return fail(sideEffect?'SAFETY_ACK_UNKNOWN':'SAFETY_UNAVAILABLE');
    const objects=outcome.kind==='object'?[outcome.object]:outcome.kind==='objects'?outcome.objects:[];
    if (objects.some(x=>Date.parse(x.expiresAt)<=Date.now() || Date.parse(x.expiresAt)>Date.now()+30000)) return fail('SAFETY_UNAVAILABLE');
    if (Buffer.byteLength(JSON.stringify({data:outcome}),'utf8')>1_000_000) return fail(sideEffect?'SAFETY_ACK_UNKNOWN':'SAFETY_CAPACITY');
    if (!await lifetime.run(()=>rpc.current())) return fail(sideEffect?'SAFETY_ACK_UNKNOWN':'SESSION_REPLACED',sideEffect?503:401);
    lifetime.check();if (objects.some(x=>Date.parse(x.expiresAt)<=Date.now())) return fail('SAFETY_UNAVAILABLE');
    return {body:{data:outcome},status:200};
  } catch {return fail(sideEffect && dispatched?'SAFETY_ACK_UNKNOWN':'SAFETY_UNAVAILABLE');}
  finally {lifetime.dispose();try {void reader?.cancel().catch(()=>{});} catch { /* cancellation may race body close */ }}
}
