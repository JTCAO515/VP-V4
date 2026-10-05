import { requestLifetime, type RequestLifetime } from '../knowledge/review/request-lifetime.ts';
import { COMMUNITY_SCHEMA, parseCommunityInput, hasSideEffect, isMutation, decodeCommunityOutcome, matchesCommunityOutcome } from './contract.ts';
export type CommunityRPC = {
  authenticate():Promise<string|false>; sessionId():string|null; current():Promise<boolean>;
  call(name:string,input:Record<string,unknown>):PromiseLike<{data:unknown;error:{message:string}|null}>;
};
const statuses:Record<string,number> = {UNAUTHENTICATED:401,SESSION_REPLACED:401,COMMUNITY_FORBIDDEN:403,COMMUNITY_SELF_REVIEW:403,COMMUNITY_DISABLED:503,COMMUNITY_CONFLICT:409,COMMUNITY_NOT_FOUND:404,INVALID_INPUT:400,COMMUNITY_PLACE_UNAVAILABLE:409,COMMUNITY_CAPACITY:503,COMMUNITY_OPERATION_ABANDONED:409};
export async function handleCommunityJ1(request:Request, options:{enabled:boolean;cleanupEnabled?:boolean;surface:'native'|'ops';sameOrigin?:boolean;createRpc(lifetime:RequestLifetime):CommunityRPC;milliseconds?:number}) {
  const failure = (error:string,status=503) => ({body:{error},status});
  if (!options.enabled && !options.cleanupEnabled) return failure('COMMUNITY_DISABLED');
  if (request.method !== 'POST') return failure('INVALID_INPUT',405);
  if (options.surface === 'native' ? request.headers.has('cookie') || request.headers.has('origin') : request.headers.has('authorization') || !options.sameOrigin) return failure('COMMUNITY_FORBIDDEN',403);
  if (new URL(request.url).search || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return failure('INVALID_INPUT',400);
  const lifetime = requestLifetime(request.signal,options.milliseconds);
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined; let dispatched = false; let mutation = false;
  try {
    const rpc = options.createRpc(lifetime);
    const actor = await lifetime.run(() => rpc.authenticate()); const session = rpc.sessionId();
    if (!actor || !session) return failure('UNAUTHENTICATED',401);
    if (request.headers.get('x-community-expected-actor') !== actor || request.headers.get('x-community-expected-session') !== session) return failure('COMMUNITY_FORBIDDEN',403);
    reader = request.body?.getReader(); if (!reader) return failure('INVALID_INPUT',400);
    const chunks:Uint8Array[] = []; let length=0;
    for (;;) { const next = await lifetime.run(() => reader!.read()); if (next.done) break; length+=next.value.byteLength; if (length>24000) return failure('INVALID_INPUT',413); chunks.push(next.value); }
    let raw:string; let input;
    try { raw=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)); if (raw.length>10000) return failure('INVALID_INPUT',413); input=parseCommunityInput(JSON.parse(raw)); } catch { return failure('INVALID_INPUT',400); }
    if (!input) return failure('INVALID_INPUT',400);
    mutation=hasSideEffect(input);
    if (!options.enabled && !['session','mine','read','withdraw','operation','abandon','export','delete'].includes(input.action)) return failure('COMMUNITY_DISABLED');
    const nestedReview=(input.action === 'operation' || input.action === 'abandon') && parseCommunityInput(JSON.parse(input.mutationBytes))?.action === 'review';
    if (options.surface === 'native' && (input.action === 'queue' || input.action === 'inspect' || input.action === 'review' || nestedReview)) return failure('COMMUNITY_FORBIDDEN',403);
    if (!await lifetime.run(() => rpc.current())) return failure('SESSION_REPLACED',401);
    lifetime.check(); dispatched=true;
    const {data,error}=await lifetime.run(() => rpc.call('community_workspace',{p_input:{protocol:COMMUNITY_SCHEMA,command:input,mutationBytes:isMutation(input)?raw:null}}));
    if (error) return Object.hasOwn(statuses,error.message) ? failure(error.message,statuses[error.message]) : failure(mutation?'COMMUNITY_ACK_UNKNOWN':'COMMUNITY_UNAVAILABLE');
    const outcome=decodeCommunityOutcome(data);
    if (!outcome || !matchesCommunityOutcome(outcome,input,actor,session)) return failure(mutation?'COMMUNITY_ACK_UNKNOWN':'COMMUNITY_UNAVAILABLE');
    if (Buffer.byteLength(JSON.stringify({data:outcome}),'utf8')>1_000_000) return failure(mutation?'COMMUNITY_ACK_UNKNOWN':'COMMUNITY_CAPACITY');
    if (!await lifetime.run(() => rpc.current())) return failure(mutation?'COMMUNITY_ACK_UNKNOWN':'SESSION_REPLACED',mutation?503:401);
    lifetime.check();
    return {body:{data:outcome},status:200};
  } catch { return failure(mutation && dispatched?'COMMUNITY_ACK_UNKNOWN':'COMMUNITY_UNAVAILABLE'); }
  finally { lifetime.dispose(); try { void reader?.cancel().catch(()=>{}); } catch { /* no hanging cancel */ } }
}
