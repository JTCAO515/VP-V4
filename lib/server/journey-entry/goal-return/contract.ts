import {parseResultArtifactReadV2, type ResultArtifactReadV2} from '../../artifacts/result-v2-contract.ts';

export type GoalReturnScope = Readonly<{conversationId:string; goalId:string; goalVersion:number; parentMessageId:string; inputSequence:number}>;
export type GoalReturnReference = Readonly<{artifactId:string; revision:number; eventId:string}>;
export type GoalReturn = Readonly<{kind:'goal_return'; schemaVersion:'goal-return/1'; scope:GoalReturnScope; lastDecision:GoalReturnReference; nextStep:Readonly<{kind:'unknown'}>}>;
export const object = (v:unknown):v is Record<string,unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
export const exact = (v:Record<string,unknown>, keys:readonly string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k));
export const uuid = (v:unknown):v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
export const integer = (v:unknown, max=2147483647):v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 1 && v <= max;
export function parseGoalReturnScope(v:unknown):GoalReturnScope|null {
  return object(v) && exact(v,['conversationId','goalId','goalVersion','parentMessageId','inputSequence'])
    && uuid(v.conversationId) && uuid(v.goalId) && uuid(v.parentMessageId) && integer(v.goalVersion,10000) && integer(v.inputSequence,1000000) ? v as GoalReturnScope : null;
}
export function sameScope(a:GoalReturnScope,b:GoalReturnScope):boolean {
  return a.conversationId===b.conversationId && a.goalId===b.goalId && a.goalVersion===b.goalVersion && a.parentMessageId===b.parentMessageId && a.inputSequence===b.inputSequence;
}
export function parseGoalReturn(v:unknown, scope:GoalReturnScope):GoalReturn|null {
  if (!object(v) || !exact(v,['kind','schemaVersion','scope','lastDecision','nextStep']) || v.kind!=='goal_return' || v.schemaVersion!=='goal-return/1') return null;
  const parsed=parseGoalReturnScope(v.scope), r=v.lastDecision;
  if (!parsed || !sameScope(parsed,scope) || !object(r) || !exact(r,['artifactId','revision','eventId']) || !uuid(r.artifactId) || !integer(r.revision,1000)
    || typeof r.eventId!=='string' || !/^[1-9][0-9]{0,18}$/.test(r.eventId) || BigInt(r.eventId)>BigInt('9223372036854775807')
    || !object(v.nextStep) || !exact(v.nextStep,['kind']) || v.nextStep.kind!=='unknown') return null;
  return v as GoalReturn;
}
export function qualifyGoalReturnArtifact(v:unknown, ref:GoalReturn, scope:GoalReturnScope):ResultArtifactReadV2|null {
  const a=parseResultArtifactReadV2(v);
  return a && a.artifactId===ref.lastDecision.artifactId && a.revision===ref.lastDecision.revision && a.current && a.lifecycle==='active'
    && a.source.goalId===scope.goalId && a.source.goalVersion===scope.goalVersion && a.source.inputMessageId===scope.parentMessageId && a.source.inputSequence===scope.inputSequence
    && a.content.schemaVersion==='decision/1' && a.content.state==='chosen' ? a : null;
}
