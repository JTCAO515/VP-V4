import { createHash, randomUUID } from "node:crypto";
import { CostGuard } from "../model-gateway/budget/index.ts";
import { runWithDurableBudget, type BudgetRpc } from "../model-gateway/budget/durable.ts";
import { validatedUsageReceipt, type RecordValidatedUsage } from "../model-gateway/budget/usage-receipt.ts";
import { invokePlanningComparisonProtocol, PROTOCOL_MODELS, type ProtocolTransport, type ProtocolUsage } from "../model-gateway/adapters/provider-protocol.ts";
import type { PlanningSelection } from "../model-gateway/prompt/planning-comparison.ts";
import { ToolRegistry, executeToolIntent, type ToolActionStore, type ToolDefinition } from "../tools/index.ts";
import { durablePlanningActionStore } from "../tools/durable-action-store.ts";
import { runDurableTurnWork, type DurableTurnLease, type TurnWorkRpc } from "./durable-worker.ts";
import { assembleGoalContext } from "../context/goal-context.ts";

type Rpc = (name: string, params: Readonly<Record<string, unknown>>) => Promise<unknown>;
type AreaId = "jingan" | "peoples_square";
type Evidence = Readonly<{ schemaVersion: "planning-evidence/1"; coverage: "not_integrated" }>;
type Area = Readonly<{ id: AreaId; label: string; railMinutes: number | null; transfers: number | null }>;
type Place = Readonly<{ schemaVersion: "planning-place/1"; source: "amap" | "synthetic_fixture"; observedAt: string; providerCalls: number; areas: readonly [Area, Area] }>;
type Constraints = Readonly<{ schemaVersion: "planning-constraints/1"; fasterAreaId: AreaId | null; hotelPrice: "unknown"; availability: "unknown" }>;
type PlanningMemory = Readonly<{ id: string; revision: number; constraintKind: "preference" | "hard_constraint"; summary: string;
  sourceReceiptId: string; consentId: string; consentStatus: "granted"; state: "explicit" | "confirmed"; updatedAt: string }>;
type PlanningInput = Readonly<{ kind: "planning_input"; turnId: string; ownerId: string; taskId: string; conversationId: string; goalId: string; goalVersion: number; messageId: string;
  messageSequence: number; policyId: string; provider: keyof typeof PROTOCOL_MODELS; endpoint: string; locale: "zh" | "en"; goalText: string;
  messageText: string; memories: readonly PlanningMemory[];
  memoryBasis: readonly Readonly<{ id: string; revision: number }>[]; artifactId: string; contextDigest: string }>;
export type PlanningWorkerConfig = Readonly<{ environment: "local_synthetic" | "staging"; ownerId: string; planningPolicyId: string; scopeId: string; priceVersion: string;
  reservedMicros: number; timeoutMs: number; maxOutputTokens: number }>;
export type PlanningWorkerBinding = Readonly<{ provider: keyof typeof PROTOCOL_MODELS; endpoint: string; transport: ProtocolTransport;
  price: (usage: ProtocolUsage) => number | null; evidenceLookup: (signal: AbortSignal) => Promise<Evidence>;
  placeRead: (signal: AbortSignal) => Promise<Place>; recordUsage?: RecordValidatedUsage }>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FLAG="planning-comparison-v1";
const definitions: readonly ToolDefinition<unknown, unknown>[] = [
  define("evidence.lookup",value=>validEvidence(value)),
  define("place.read",value=>validPlace(value)),
  define("constraints.evaluate",value=>validConstraints(value)),
];
function define(id: string, validateOutput: (value: unknown) => boolean): ToolDefinition<unknown, unknown> {
  return { id,version:"v1",description:"Bounded Shanghai stay-area comparison step",riskClass:id==="constraints.evaluate"?"D0_deterministic":"R1_read_only",
    allowedTaskProfiles:["trip_planning"],allowedDataClasses:["public_evidence"],requiredLicenseScopes:["public_evidence"],
    requiresApproval:false,idempotency:"required",timeoutMs:15000,retryPolicy:"never",maxModelOutputTokens:2048,featureFlag:FLAG,
    validateInput:(value):value is unknown=>record(value) && value.kind==="shanghai_stay_areas_v1",validateOutput:(value):value is unknown=>validateOutput(value) };
}

/** One existing Turn lease. No timer, default provider, policy, credential or
 * automatic second paid attempt is created by this module. */
export async function runPlanningComparisonWorker(workRpc: TurnWorkRpc, rpc: Rpc, budgetRpc: BudgetRpc,
  config: PlanningWorkerConfig, binding: PlanningWorkerBinding, signal: AbortSignal) {
  if (![config.ownerId,config.planningPolicyId,config.scopeId].every(id=>typeof id==="string"&&UUID.test(id))
    || binding.provider!=="qwen" || typeof binding.endpoint!=="string" || !binding.endpoint.startsWith("https://")
    || !["local_synthetic","staging"].includes(config.environment)
    || !Number.isSafeInteger(config.reservedMicros) || config.reservedMicros<1
    || !Number.isSafeInteger(config.timeoutMs) || config.timeoutMs<1 || config.timeoutMs>60000
    || !Number.isSafeInteger(config.maxOutputTokens) || config.maxOutputTokens<1 || config.maxOutputTokens>4096) return "unavailable";
  return runDurableTurnWork(async(name,params)=>name==="claim_turn_work"
    ? rpc("claim_planning_comparison_work_v1",{p_owner_id:config.ownerId,p_planning_policy_id:config.planningPolicyId})
    : workRpc(name,params),async(lease,leaseSignal)=>{
    if(lease.ownerId!==config.ownerId) return "validation_failure";
    const keys={p_turn_id:lease.turnId,p_lease_token:lease.leaseToken};
    const raw=await rpc("read_planning_comparison_work_v1",keys);
    if(!validInput(raw) || raw.ownerId!==config.ownerId || raw.turnId!==lease.turnId || raw.policyId!==config.planningPolicyId
      || raw.provider!==binding.provider || raw.endpoint!==binding.endpoint) return await pause(rpc,lease);
    const input=raw;
    // #559's goal manifest remains read-only and non-dispatchable. Its source
    // selection is reused only after SQL verified this task-linked message and
    // current revisions; provider authorization is a separate fresh SQL RPC.
    let selectedMemories:readonly PlanningMemory[];
    try{
      const preview=assembleGoalContext({actorId:input.ownerId,conversationId:input.conversationId,
        goal:{id:input.goalId,scopeVersion:input.goalVersion,text:input.goalText},
        message:{id:input.messageId,sequence:input.messageSequence,goalId:input.goalId,
          scopeVersion:input.goalVersion,text:input.messageText,taskId:null},
        selectedMemoryIds:input.memoryBasis.map(m=>m.id),memories:input.memories.map(m=>({...m,ownerId:input.ownerId}))});
      if(preview.readyForProvider!==false || !preview.context.sourceRefs.some(ref=>ref.id===`goal:${input.goalId}`)
        || !preview.context.sourceRefs.some(ref=>ref.id===`message:${input.messageId}`)) throw Error("Goal sources omitted");
      const selected=new Set(preview.context.sourceRefs.filter(ref=>ref.id.startsWith("memory:")).map(ref=>ref.id.slice(7)));
      selectedMemories=input.memories.filter(m=>selected.has(m.id));
    }catch{return await pause(rpc,lease);}
    const saved=await rpc("read_planning_observations_v1",keys);
    if(!record(saved) || saved.kind!=="observations" || saved.contextDigest!==input.contextDigest || !Array.isArray(saved.items)) return await pause(rpc,lease);
    const observations=new Map<string,unknown>();
    for(const item of saved.items){if(!record(item)||typeof item.toolId!=="string"||observations.has(item.toolId)) return await pause(rpc,lease);observations.set(item.toolId,item.observation);}
    const guard=new CostGuard({windowMs:120000,perUserAttempts:8,perTaskAttempts:8,turnDeadlineMs:120000,maxModelSteps:1,maxToolSteps:4})
      .startTurn({userId:lease.ownerId,taskId:input.taskId});
    if(guard.kind!=="turn") return await pause(rpc,lease);
    const actionBase=durablePlanningActionStore(async(name,params)=>rpc(name,params),{
      turnId:lease.turnId,ownerId:lease.ownerId,leaseToken:lease.leaseToken,messageId:input.messageId,memoryBasis:input.memoryBasis,
    });
    const actionStore:ToolActionStore={...actionBase,async complete(key,_receiptDigest,output){
      const value=await rpc("complete_planning_observation_v1",{...keys,p_owner_id:lease.ownerId,p_action_key:key,p_observation:output});
      return record(value) && (value.kind==="completed"||value.kind==="duplicate");
    }};
    const actor={id:lease.ownerId,taskProfile:"trip_planning" as const,dataClasses:["public_evidence"] as const,
      licensedScopes:["public_evidence"] as const,enabledFeatureFlags:[FLAG] as const,approvals:[] as const};
    const registry=new ToolRegistry(definitions);
    const step=async<T>(toolId:string,validate:(value:unknown)=>value is T,run:()=>Promise<T>):Promise<T>=>{
      const previous=observations.get(toolId);
      if(previous!==undefined){if(!validate(previous))throw Error("Invalid checkpoint");return previous;}
      if(guard.admitToolStep().kind!=="admitted")throw Error("Tool bound exceeded");
      const authorization=await rpc("authorize_planning_read_v1",{...keys,p_context_digest:input.contextDigest});
      if(!record(authorization)||authorization.kind!=="authorized"||leaseSignal.aborted)throw Error("Tool authorization lost");
      let output:T|undefined;
      await executeToolIntent({registry,actor,actionStore,
        intent:{source:"ui",callId:toolId.replaceAll(".","-"),toolId,dataClasses:["public_evidence"],input:{kind:"shanghai_stay_areas_v1",contextDigest:input.contextDigest}},
        execute:async()=>{output=await run();return output;},now:()=>new Date().toISOString()});
      if(!validate(output))throw Error("Tool output rejected");
      observations.set(toolId,output);
      return output;
    };
    let evidence:Evidence,place:Place,constraints:Constraints;
    try{
      evidence=await step("evidence.lookup",validEvidence,()=>binding.evidenceLookup(leaseSignal));
      place=await step("place.read",validPlace,()=>binding.placeRead(leaseSignal));
      constraints=await step("constraints.evaluate",validConstraints,async()=>evaluateConstraints(place));
    }catch{return await pause(rpc,lease);}
    if(evidence.coverage!=="not_integrated"||leaseSignal.aborted
      || !Number.isFinite(Date.parse(place.observedAt)) || Date.parse(place.observedAt)>Date.now()+5000
      || Date.now()-Date.parse(place.observedAt)>300000
      || place.source!==(config.environment==="staging"?"amap":"synthetic_fixture")) return await pause(rpc,lease);
    const attemptId=randomUUID();
    const attempt={scopeId:config.scopeId,ownerId:lease.ownerId,taskId:input.taskId,attemptId,
      provider:binding.provider,model:PROTOCOL_MODELS[binding.provider],priceVersion:config.priceVersion,
      reservedMicros:config.reservedMicros,timeoutMs:config.timeoutMs} as const;
    const result=await runWithDurableBudget(attempt,budgetRpc,async budgetSignal=>{
      const prompt=planningPrompt(input,selectedMemories,place,constraints);
      const value=await invokePlanningComparisonProtocol({requestId:lease.leaseToken,text:prompt},
        {provider:binding.provider,endpoint:binding.endpoint,maxOutputTokens:config.maxOutputTokens,timeoutMs:config.timeoutMs},
        async()=>{const decision=await rpc("authorize_planning_dispatch_v1",{...keys,p_context_digest:input.contextDigest,
          p_scope_id:config.scopeId,p_attempt_id:attemptId});return record(decision)&&decision.kind==="authorized";},guard,binding.transport,budgetSignal);
      const actualMicros=value.kind==="protocol_validated"?binding.price(value.usage):null;
      if(actualMicros!==null&&value.kind==="protocol_validated"&&binding.recordUsage){
        await binding.recordUsage(validatedUsageReceipt({schemaVersion:"validated-model-usage/1",attempt,
          turnId:lease.turnId,policyId:input.policyId,usage:value.usage,actualMicros,observedAt:new Date().toISOString()}),budgetSignal);
      }
      return {value,actualMicros};
    },leaseSignal);
    if(result.kind!=="completed"||result.accounting!=="settled") return await pause(rpc,lease);
    const selection=result.value.kind==="protocol_validated"?result.value.output:null;
    if(!validSelection(selection))return await pause(rpc,lease);
    const content=buildComparison(input,place,constraints,selection);
    const resultKey=hash({ownerId:lease.ownerId,taskId:input.taskId,toolId:"result.prepare",contextDigest:input.contextDigest});
    const resultClaim=await actionBase.claim(resultKey,"result.prepare",hash(content));
    if(resultClaim!=="claimed") return await pause(rpc,lease);
    const text=input.locale==="zh"?"住宿区域比较已准备；酒店价格和空房仍未知。":"Stay-area comparison is ready; hotel price and availability remain unknown.";
    const finished=await rpc("complete_planning_comparison_v1",{...keys,p_owner_id:lease.ownerId,p_result_action_key:resultKey,
      p_model_attempt_id:attemptId,p_text:text,p_content:content});
    return record(finished)&&finished.kind==="published"?"persisted":await pause(rpc,lease);
  },signal);
}

async function pause(rpc:Rpc,lease:DurableTurnLease):Promise<"persisted">{
  const result=await rpc("pause_planning_comparison_v1",{p_turn_id:lease.turnId,p_lease_token:lease.leaseToken});
  if(!record(result)||result.kind!=="paused_unknown")throw Error("Planning pause acknowledgement unknown");
  return "persisted";
}
function record(v:unknown):v is Record<string,unknown>{return typeof v==="object"&&v!==null&&!Array.isArray(v);}
function str(v:unknown,max:number):v is string{return typeof v==="string"&&v.trim().length>0&&v.length<=max;}
function validInput(v:unknown):v is PlanningInput{return record(v)&&v.kind==="planning_input"&&[v.turnId,v.ownerId,v.taskId,v.conversationId,v.goalId,v.messageId,v.policyId,v.artifactId].every(x=>typeof x==="string"&&UUID.test(x))
  && Number.isSafeInteger(v.goalVersion)&&Number(v.goalVersion)>0&&Number.isSafeInteger(v.messageSequence)&&Number(v.messageSequence)>0
  && (v.provider==="qwen"||v.provider==="glm"||v.provider==="deepseek")&&str(v.endpoint,300)&&["zh","en"].includes(String(v.locale))
  && str(v.goalText,4000)&&str(v.messageText,4000)&&Array.isArray(v.memories)&&v.memories.length<=3
  && v.memories.every(x=>record(x)&&typeof x.id==="string"&&UUID.test(x.id)&&Number.isSafeInteger(x.revision)&&str(x.summary,500)
    &&typeof x.sourceReceiptId==="string"&&UUID.test(x.sourceReceiptId)&&typeof x.consentId==="string"&&UUID.test(x.consentId)
    &&x.consentStatus==="granted"&&["explicit","confirmed"].includes(String(x.state))&&str(x.updatedAt,64))
  && Array.isArray(v.memoryBasis)&&v.memoryBasis.length<=3&&v.memoryBasis.every(x=>record(x)&&typeof x.id==="string"&&UUID.test(x.id)&&Number.isSafeInteger(x.revision))
  && typeof v.contextDigest==="string"&&/^[a-f0-9]{64}$/.test(v.contextDigest);}
function validEvidence(v:unknown):v is Evidence{return record(v)&&Object.keys(v).length===2&&v.schemaVersion==="planning-evidence/1"&&v.coverage==="not_integrated";}
function validArea(v:unknown):v is Area{return record(v)&&Object.keys(v).length===4&&(v.id==="jingan"||v.id==="peoples_square")&&str(v.label,80)
  &&(v.railMinutes===null||Number.isSafeInteger(v.railMinutes)&&Number(v.railMinutes)>=0&&Number(v.railMinutes)<=180)
  &&(v.transfers===null||Number.isSafeInteger(v.transfers)&&Number(v.transfers)>=0&&Number(v.transfers)<=5);}
function validPlace(v:unknown):v is Place{return record(v)&&Object.keys(v).length===5&&v.schemaVersion==="planning-place/1"
  &&["amap","synthetic_fixture"].includes(String(v.source))&&str(v.observedAt,40)&&Number.isFinite(Date.parse(String(v.observedAt)))
  &&Number.isSafeInteger(v.providerCalls)&&Number(v.providerCalls)>=0&&Number(v.providerCalls)<=13
  &&Array.isArray(v.areas)&&v.areas.length===2&&v.areas.every(validArea)&&new Set(v.areas.map(x=>x.id)).size===2;}
function validConstraints(v:unknown):v is Constraints{return record(v)&&Object.keys(v).length===4&&v.schemaVersion==="planning-constraints/1"
  &&(v.fasterAreaId===null||v.fasterAreaId==="jingan"||v.fasterAreaId==="peoples_square")&&v.hotelPrice==="unknown"&&v.availability==="unknown";}
function evaluateConstraints(place:Place):Constraints{const [a,b]=place.areas;const fasterAreaId=a.railMinutes!==null&&b.railMinutes!==null&&a.railMinutes!==b.railMinutes
  ?a.railMinutes<b.railMinutes?a.id:b.id:null;return {schemaVersion:"planning-constraints/1",fasterAreaId,hotelPrice:"unknown",availability:"unknown"};}
function validSelection(v:unknown):v is PlanningSelection{return record(v)&&Object.keys(v).length===1&&["jingan","peoples_square","none"].includes(String(v.highlight));}
function planningPrompt(input:PlanningInput,memories:readonly PlanningMemory[],place:Place,constraints:Constraints):string{
  return JSON.stringify({goal:input.goalText,delegation:input.messageText,explicitMemories:memories.map(m=>({kind:m.constraintKind,text:m.summary})),
    qualifiedAreaEvidence:"not_integrated",railAccess:place.areas.map(a=>({area:a.id,minutes:a.railMinutes,transfers:a.transfers})),
    fasterAreaId:constraints.fasterAreaId,unknown:["hotel_price","availability"]});
}
function buildComparison(input:PlanningInput,place:Place,constraints:Constraints,selection:PlanningSelection){
  const selected=selection.highlight!=="none"&&place.areas.some(a=>a.id===selection.highlight&&a.railMinutes!==null)?selection.highlight:null;
  const ordered=[...place.areas].sort((a,b)=>a.id===selected?-1:b.id===selected?1:0);
  const zh=input.locale==="zh",fixture=place.source==="synthetic_fixture";
  const options=ordered.map(a=>({id:a.id,title:a.label,tradeoff:zh
    ?a.railMinutes===null?"到上海站的交通时间未知；酒店价格和空房未知。":`到上海站约 ${a.railMinutes} 分钟、${a.transfers??"未知"} 次换乘；酒店价格和空房未知。`
    :a.railMinutes===null?"Travel time to Shanghai Railway Station is unknown; hotel price and availability are unknown.":`About ${a.railMinutes} minutes and ${a.transfers??"unknown"} ${a.transfers===1?"transfer":"transfers"} to Shanghai Railway Station; hotel price and availability are unknown.`}));
  return {schemaVersion:"comparison/1" as const,title:zh?`${fixture?"合成样例：":""}上海住宿区域比较`:`${fixture?"Synthetic fixture: ":""}Shanghai stay-area comparison`,
    summary:zh?"仅比较到上海站的当前交通观察；酒店库存、价格与区域适住性尚未核实。":"This compares current rail access to Shanghai Railway Station only. Hotel inventory, price and area suitability are unverified.",
    options,actions:[] as const};
}
function hash(value:unknown):string{return createHash("sha256").update(JSON.stringify(value)).digest("hex");}
