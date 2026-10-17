import {getNativeTextConfig} from '../../turn/native-http.ts';
import {verifyNativeCredentials} from '../../identity/native-credentials.ts';
import {nativeRequestScope} from '../../identity/native-request.ts';
import {object, exact, uuid, integer, parseGoalReturnScope, parseGoalReturn, qualifyGoalReturnArtifact} from './contract.ts';

const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const fail=(code:string,status:number)=>reply({error:{code}},status);
const unknown=()=>reply({version:5,kind:'unavailable',nextStep:{kind:'unknown'}});
/** The proposed read RPC is not installed by this source. Missing/catalog errors fail closed. */
export async function nativeGoalReturnHTTP(request:Request):Promise<Response> {
  const url=new URL(request.url), keys=['conversationId','goalId','goalVersion','parentMessageId','inputSequence'];
  if (request.method!=='GET' || url.pathname!=='/api/chat/native/v5/goal-return' || request.headers.has('cookie') || request.headers.has('origin')
    || [...url.searchParams.keys()].length!==keys.length || keys.some(k=>url.searchParams.getAll(k).length!==1)
    || ['goalVersion','inputSequence'].some(k=>!/^[1-9][0-9]{0,6}$/.test(url.searchParams.get(k)??''))) return fail('INVALID_INPUT',400);
  const input=parseGoalReturnScope({conversationId:url.searchParams.get('conversationId'),goalId:url.searchParams.get('goalId'),goalVersion:Number(url.searchParams.get('goalVersion')),
    parentMessageId:url.searchParams.get('parentMessageId'),inputSequence:Number(url.searchParams.get('inputSequence'))});
  if (!input) return fail('INVALID_INPUT',400);
  const config=getNativeTextConfig(request); if (!config) return fail('PROVIDER_UNAVAILABLE',503);
  const scope=nativeRequestScope(request.signal,15000);
  try {
    const actor=await scope.run(()=>verifyNativeCredentials(request,config,scope.fetch,scope.unavailable)); if (!actor) return fail('UNAUTHENTICATED',401);
    const rpc=(name:string,params:Record<string,unknown>)=>scope.run(()=>actor.client.rpc(name,params).abortSignal(scope.signal));
    let epoch:number|null=null;
    const session=async()=>{
      const s=await rpc('native_session_v2',{p_action:'session'});
      if (s.error) throw Error(s.error.message);
      if (!object(s.data) || !uuid(s.data.subject) || !uuid(s.data.sessionId) || !integer(s.data.mobileEpoch,Number.MAX_SAFE_INTEGER)) throw Error('PROVIDER_UNAVAILABLE');
      if (s.data.subject!==actor.subject || s.data.sessionId!==actor.sessionId || epoch!==null && epoch!==s.data.mobileEpoch) throw Error('SESSION_REPLACED');
      epoch=s.data.mobileEpoch;
    };
    await session();
    const params={p_policy_id:config.policyId,p_conversation_id:input.conversationId,p_goal_id:input.goalId,p_goal_version:input.goalVersion,
      p_parent_message_id:input.parentMessageId,p_input_sequence:input.inputSequence,p_mobile_epoch:epoch};
    const first=await rpc('read_goal_return_reference_v1',params);
    if (first.error) throw Error(first.error.message);
    if (object(first.data) && exact(first.data,['kind']) && first.data.kind==='unavailable') {await session(); return unknown();}
    const ref=parseGoalReturn(first.data,input); if (!ref) return fail('PROVIDER_UNAVAILABLE',503);
    const read=await rpc('read_result_artifact_v2',{p_artifact_id:ref.lastDecision.artifactId,p_revision:ref.lastDecision.revision});
    if (read.error) throw Error(read.error.message);
    if (!qualifyGoalReturnArtifact(read.data,ref,input)) {await session(); return unknown();}
    // Re-discover after exact read: replacement, withdrawal and a new decision cannot publish the old pointer.
    const final=await rpc('read_goal_return_reference_v1',params);
    if (final.error) throw Error(final.error.message);
    const fresh=parseGoalReturn(final.data,input);
    await session();
    if (!fresh || fresh.lastDecision.artifactId!==ref.lastDecision.artifactId || fresh.lastDecision.revision!==ref.lastDecision.revision || fresh.lastDecision.eventId!==ref.lastDecision.eventId) return unknown();
    scope.check(); return reply({version:5,...fresh});
  } catch (e) {return fail(e instanceof Error && /UNAUTHENTICATED|SESSION_REPLACED/.test(e.message)?'UNAUTHENTICATED':'PROVIDER_UNAVAILABLE',e instanceof Error && /UNAUTHENTICATED|SESSION_REPLACED/.test(e.message)?401:503);}
  finally {scope.dispose();}
}
