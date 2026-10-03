import { projectRetrievableMemory, type MemoryProfile } from "../memory/profile.ts";
import { assembleContext, ContextAssemblyError, type ContextCandidate, type ContextManifest } from "./context-assembler.ts";
import { createContextPlan, type ContextPlan, type ContextSourceKind } from "./context-plan.ts";

export const GOAL_CONTEXT_VERSION = "assistant-goal-context/1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SELECTED_MEMORY = 3;
const GOAL_MARKER = "Current goal (unconfirmed): ";
const SYSTEM_TEXT = "Use only the selected, current sources. Do not infer consent, confirmation, or external facts.";
const POLICY_TEXT = "A goal is intent, not a confirmed Trip. Never write a Trip, book, pay, or send a message from this context.";
const CONSTRAINT_TEXT = "Preserve explicit requirements; absent Trip, artifact, evidence, and task sources remain unknown.";

export type GoalContextMessage = Readonly<{
  id: string;
  sequence: number;
  goalId: string;
  scopeVersion: number;
  text: string;
  taskId: null;
}>;
export type GoalContextGoal = Readonly<{ id: string; scopeVersion: number; text: string }>;
export type GoalMemoryProfile = MemoryProfile & Readonly<{ revision: number; consentId?: string }>;
export type GoalContextInput = Readonly<{
  actorId: string;
  conversationId: string;
  goal: GoalContextGoal;
  message: GoalContextMessage;
  selectedMemoryIds: readonly string[];
  memories: readonly GoalMemoryProfile[];
}>;
export type GoalContextManifest = Readonly<{
  schemaVersion: typeof GOAL_CONTEXT_VERSION;
  conversationId: string;
  goalId: string;
  goalScopeVersion: number;
  messageId: string;
  messageSequence: number;
  selectedMemoryCount: number;
  readyForProvider: false;
  context: ContextManifest;
}>;

/** Builds a bounded preview only. Dispatch must later recheck sources and recipient consent. */
export function assembleGoalContext(input: GoalContextInput, budgetProfile: "default" | "planning_worker" = "default"): GoalContextManifest {
  if (budgetProfile !== "default" && budgetProfile !== "planning_worker") throw new ContextAssemblyError("Unknown goal context budget profile.");
  if (![input.actorId,input.conversationId,input.goal.id,input.message.id].every(id => typeof id === "string" && UUID.test(id))
    || input.goal.id !== input.message.goalId || input.message.taskId !== null
    || !Number.isSafeInteger(input.goal.scopeVersion) || input.goal.scopeVersion < 1
    || input.message.scopeVersion !== input.goal.scopeVersion
    || !Number.isSafeInteger(input.message.sequence) || input.message.sequence < 1
    || !validText(input.goal.text,4000) || !validText(input.message.text,4000)
    || input.selectedMemoryIds.length > MAX_SELECTED_MEMORY
    || new Set(input.selectedMemoryIds).size !== input.selectedMemoryIds.length
    || !input.selectedMemoryIds.every(id => UUID.test(id))) throw new ContextAssemblyError("Invalid goal context scope.");

  const eligibleIds = new Set(projectRetrievableMemory(input.memories).map(memory => memory.id));
  const selected = input.selectedMemoryIds.map(id => {
    const memory = input.memories.find(item => item.id === id && eligibleIds.has(item.id) && item.ownerId === input.actorId);
    if (!memory) throw new ContextAssemblyError("Selected memory is unavailable.");
    return memory;
  });
  const focus = input.goal.text + " " + input.message.text;
  const relevant = selected.filter(memory => memory.constraintKind === "hard_constraint" || overlaps(memory.summary ?? "",focus));
  const omitted = selected.length - relevant.length;
  const candidates: ContextCandidate[] = [
    { id:"goal-context-system",kind:"system",ownerId:null,state:"eligible",sourceVersion:GOAL_CONTEXT_VERSION,text:SYSTEM_TEXT },
    { id:"goal-context-policy",kind:"policy",ownerId:null,state:"eligible",sourceVersion:GOAL_CONTEXT_VERSION,text:POLICY_TEXT },
    { id:"goal-context-constraints",kind:"constraints",ownerId:input.actorId,state:"eligible",sourceVersion:GOAL_CONTEXT_VERSION,text:CONSTRAINT_TEXT },
    { id:`goal:${input.goal.id}`,kind:"thread",ownerId:input.actorId,state:"eligible",sourceVersion:`scope:${input.goal.scopeVersion}`,text:GOAL_MARKER + input.goal.text },
    { id:`message:${input.message.id}`,kind:"user_message",ownerId:input.actorId,state:"eligible",sourceVersion:`sequence:${input.message.sequence}:scope:${input.message.scopeVersion}`,text:input.message.text },
    ...relevant.map((memory): ContextCandidate => ({
      id:`memory:${memory.id}`,kind:memory.constraintKind === "hard_constraint" ? "constraints" : "memory",
      ownerId:input.actorId,state:"eligible",sourceVersion:`revision:${revision(memory)}:receipt:${memory.sourceReceiptId}`,
      text:`Explicit ${memory.constraintKind === "hard_constraint" ? "requirement" : "preference"}: ${memory.summary}`,
    })),
  ];
  const assembly = assembleContext({plan:budgetProfile === "default" ? createContextPlan({taskProfile:"trip_planning",riskClass:"elevated"}) : createPlanningGoalContextPlan(candidates.map(candidate=>candidate.kind)),actorId:input.actorId,candidates});
  if (!assembly.manifest.sourceRefs.some(source => source.id === `goal:${input.goal.id}`))
    throw new ContextAssemblyError("Current goal exceeds the bounded context budget.");
  const context: ContextManifest = Object.freeze({ ...assembly.manifest,
    omittedReasons: Object.freeze([...assembly.manifest.omittedReasons,
      ...Array.from({length:omitted},() => "not_relevant:memory"),
      "not_integrated:profile_recipient", "not_integrated:trip", "not_integrated:artifact", "not_integrated:evidence", "not_integrated:task"]),
  });
  return Object.freeze({schemaVersion:GOAL_CONTEXT_VERSION,conversationId:input.conversationId,
    goalId:input.goal.id,goalScopeVersion:input.goal.scopeVersion,messageId:input.message.id,
    messageSequence:input.message.sequence,selectedMemoryCount:context.sourceRefs.filter(source => source.id.startsWith("memory:")).length,
    readyForProvider:false,context});
}

/** v2 preview sources are projected by authenticated domain readers, never client facts.
 * The legacy v1 assembler and its wire remain unchanged. */
export type SelectedGoalContextSource = Readonly<{
  id:string;kind:"trip"|"proposal"|"evidence"|"tool"|"thread";
  ownerId:string|null;sourceVersion:string;text:string;purpose?:"current_context"|"previous_result_reference";artifactId?:string;revision?:number;originGoalVersion?:number;current?:boolean;recipient?:"first_party";
}>;
export function assembleSelectedSourceGoalContext(input:GoalContextInput,sources:readonly SelectedGoalContextSource[],omissions:readonly string[]=[]){
 if(![input.actorId,input.conversationId,input.goal.id,input.message.id].every(id=>typeof id==="string"&&UUID.test(id))||input.message.goalId!==input.goal.id||input.message.scopeVersion!==input.goal.scopeVersion||!Number.isSafeInteger(input.goal.scopeVersion)||input.goal.scopeVersion<1||!Number.isSafeInteger(input.message.sequence)||input.message.sequence<1||!validText(input.goal.text,4000)||!validText(input.message.text,4000)||input.selectedMemoryIds.length>3||!input.selectedMemoryIds.every(id=>typeof id==="string"&&UUID.test(id))||new Set(input.selectedMemoryIds).size!==input.selectedMemoryIds.length)throw new ContextAssemblyError("Invalid v2 goal scope.");
 const eligible=new Set(projectRetrievableMemory(input.memories).map(x=>x.id)),focus=input.goal.text+" "+input.message.text,known=new Set<string>();
 const relevant=input.selectedMemoryIds.map(id=>{const m=input.memories.find(x=>x.id===id&&x.ownerId===input.actorId&&eligible.has(id));if(!m)throw new ContextAssemblyError("Selected memory unavailable.");revision(m);return m;}).filter(m=>m.constraintKind==="hard_constraint"||overlaps(m.summary??"",focus));
 const additional:ContextCandidate[]=sources.map(source=>{
  if(!source.id||!source.sourceVersion||source.sourceVersion.length>240||!source.text.trim()||source.text.length>8000
   ||source.purpose==="previous_result_reference"&&source.kind!=="thread"||known.has(source.id)||source.ownerId!==null&&source.ownerId!==input.actorId||source.ownerId===null&&source.kind!=="evidence")throw new ContextAssemblyError("Invalid selected domain source.");
  known.add(source.id);return {...source,state:"eligible",...(source.kind==="tool"?{payloadKind:"model_safe_projection"}: {})} as ContextCandidate;
 });
 const candidates:ContextCandidate[]=[
  {id:"goal-context-system",kind:"system",ownerId:null,state:"eligible",sourceVersion:"assistant-goal-context/2",text:SYSTEM_TEXT},
  {id:"goal-context-policy",kind:"policy",ownerId:null,state:"eligible",sourceVersion:"assistant-goal-context/2",text:POLICY_TEXT},
  {id:"goal-context-constraints",kind:"constraints",ownerId:input.actorId,state:"eligible",sourceVersion:"assistant-goal-context/2",text:CONSTRAINT_TEXT},
  {id:`goal:${input.goal.id}`,kind:"thread",ownerId:input.actorId,state:"eligible",sourceVersion:`scope:${input.goal.scopeVersion}`,text:GOAL_MARKER+input.goal.text},
  {id:`message:${input.message.id}`,kind:"user_message",ownerId:input.actorId,state:"eligible",sourceVersion:`sequence:${input.message.sequence}:scope:${input.message.scopeVersion}`,text:input.message.text},
  ...relevant.map(m=>({id:`memory:${m.id}`,kind:m.constraintKind==="hard_constraint"?"constraints":"memory",ownerId:input.actorId,state:"eligible",sourceVersion:`revision:${m.revision}:receipt:${m.sourceReceiptId}`,text:`Explicit ${m.constraintKind==="hard_constraint"?"requirement":"preference"}: ${m.summary}`} as ContextCandidate)),...additional,
 ];
 const fixed=createContextPlan({taskProfile:"trip_planning",riskClass:"elevated"});
 // New preview-only policy accommodates a complete bounded current goal/message
 // plus safe task metadata. It does not change any v1 or model spend budget.
 const plan:ContextPlan={...fixed,policy:{...fixed.policy,tokenBudgets:{...fixed.policy.tokenBudgets,thread:4128,user_message:4000,tool:512}}};
 const {manifest:assembled}=assembleContext({plan,actorId:input.actorId,candidates});const manifest={...assembled,contextVersion:"assistant-selected-source-context-plan/2"};
 return {schemaVersion:"assistant-goal-context/2" as const,conversationId:input.conversationId,goalId:input.goal.id,goalScopeVersion:input.goal.scopeVersion,messageId:input.message.id,messageSequence:input.message.sequence,selectedMemoryCount:manifest.sourceRefs.filter(x=>x.id.startsWith("memory:")).length,readyForProvider:false as const,context:{...manifest,sourceRefs:manifest.sourceRefs.map(ref=>{const source=sources.find(x=>x.id===ref.id);return source?{...ref,...(source.purpose?{purpose:source.purpose}:{}),...(source.recipient?{recipient:source.recipient}:{}),...(source.artifactId?{artifactId:source.artifactId,revision:source.revision,originGoalVersion:source.originGoalVersion,current:source.current,recipient:"first_party"}: {})}:ref;}),omittedReasons:[...manifest.omittedReasons,...omissions]}};
}

function validText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

function revision(memory: GoalMemoryProfile): number {
  const value = memory.revision;
  if (!Number.isSafeInteger(value) || value! < 1) throw new ContextAssemblyError("Memory revision is required.");
  return value!;
}

function overlaps(left: string, right: string): boolean {
  const tokens = (text: string) => {
    const normalized = text.toLocaleLowerCase("en");
    const latin = normalized.match(/[a-z0-9]{3,}/g) ?? [];
    const cjkRuns = normalized.match(/[\p{Script=Han}]{2,}/gu) ?? [];
    const cjk = cjkRuns.flatMap(run => Array.from({length:run.length-1},(_,i) => run.slice(i,i+2)));
    return new Set([...latin,...cjk]);
  };
  const terms = tokens(left), focus = tokens(right);
  return [...terms].some(term => focus.has(term));
}

/** Trusted planning composition only. This assembler has no Trip candidate;
 * move only its fixed marker overhead from that unused section. All default
 * v1 allocations, hard constraints, message/Memory caps and total stay intact. */
export function createPlanningGoalContextPlan(candidateKinds: readonly ContextSourceKind[]): Readonly<ContextPlan> {
  if (candidateKinds.some(kind=>!["system","policy","constraints","memory","thread","user_message"].includes(kind)))
    throw new ContextAssemblyError("Planning goal format profile cannot integrate additional sources.");
  const base = createContextPlan({taskProfile:"trip_planning",riskClass:"elevated"});
  const overhead = Array.from(GOAL_MARKER).length;
  return Object.freeze({...base,contextVersion:"planning-goal-context-plan-v1" as const,
    policy:Object.freeze({...base.policy,tokenBudgets:Object.freeze({...base.policy.tokenBudgets,
      trip:base.policy.tokenBudgets.trip-overhead,thread:base.policy.tokenBudgets.thread+overhead})})});
}
