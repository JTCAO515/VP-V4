import { createProviderHttpTransport, type HttpProviderConfiguration, type HttpTransportDependencies } from "../model-gateway/adapters/http-transport.ts";
import { PROTOCOL_MODELS } from "../model-gateway/adapters/provider-protocol.ts";
import { createTextJobPrice, type TextJobPricing } from "./staging-text-job.ts";
import { createScopedPlanningWorker } from "../turn/scoped-planning-worker.ts";
import { readShanghaiStayAreaRoutes } from "../tools/planning-place-read.ts";
import type { RecordPlanningUsage } from "../model-gateway/budget/usage-receipt.ts";
import type { PlanningWorkerBinding } from "../turn/planning-comparison-worker.ts";

const DATABASE="https://dzqdzetcctkhbrhlxxgn.supabase.co";
export type StagingPlanningJobConfig=Readonly<{
  schemaVersion:"vpj80-staging-planning-job/1";ownerId:string;planningPolicyId:string;scopeId:string;
  priceVersion:string;reservedMicros:number;timeoutMs:number;maxOutputTokens:number;
  provider:HttpProviderConfiguration;pricing:TextJobPricing;
}>;

/** Explicit trusted-process composition. No scheduler, policy installer,
 * provider key discovery, synthetic fallback, or default enabled flag. */
export function createStagingPlanningJob(config:StagingPlanningJobConfig,deps:Readonly<{
  workerCredential:HttpTransportDependencies["credential"];
  providerCredential:HttpTransportDependencies["credential"];
  recordDestination:HttpTransportDependencies["recordDestination"];
  recordUsage:RecordPlanningUsage;
  authorizeExternalRead?:PlanningWorkerBinding["authorizeExternalRead"];
  qwenEndpoint?:HttpTransportDependencies["qwenEndpoint"];
  mapsEnv:Readonly<Record<string,string|undefined>>;
  /** Closed destination mapper for disposable tests only. */
  fetcher?:typeof fetch;
}>){
  if(config.schemaVersion!=="vpj80-staging-planning-job/1"||config.provider.provider!=="qwen"
    || config.provider.timeoutMs!==config.timeoutMs||PROTOCOL_MODELS.qwen!=="qwen3.7-plus-2026-05-26"
    || !Number.isSafeInteger(config.maxOutputTokens)||config.maxOutputTokens<1||config.maxOutputTokens>4096
    || !Number.isSafeInteger(config.reservedMicros)||config.reservedMicros<1
    || !/^[A-Za-z0-9._-]{1,100}$/.test(config.priceVersion)
    || deps.mapsEnv.AMAP_SEARCH_ENABLED!=="true"||deps.mapsEnv.AMAP_DETAIL_ENABLED!=="true"
    || deps.mapsEnv.AMAP_ROUTES_ENABLED!=="true"||!deps.mapsEnv.AMAP_WEB_SERVICE_KEY?.trim()
    || typeof deps.workerCredential!=="function"||typeof deps.providerCredential!=="function"
    || typeof deps.recordDestination!=="function"||typeof deps.recordUsage!=="function")throw Error("Planning job unavailable");
  const price=createTextJobPrice(config.pricing);
  const inputRate=Math.max(config.pricing.inputMicrosPerMillion,config.pricing.cachedInputMicrosPerMillion??0);
  const required=(BigInt(1_048_576)*BigInt(inputRate)+BigInt(config.maxOutputTokens)*BigInt(config.pricing.outputMicrosPerMillion)+BigInt(999999))/BigInt(1000000);
  if(!Number.isSafeInteger(config.reservedMicros)||BigInt(config.reservedMicros)<required)throw Error("Planning reservation unavailable");
  const transport=createProviderHttpTransport(config.provider,{credential:deps.providerCredential,recordDestination:deps.recordDestination,qwenEndpoint:deps.qwenEndpoint,
    ...(deps.fetcher?{fetch:deps.fetcher}:{})});
  return createScopedPlanningWorker({environment:"staging",databaseUrl:DATABASE,ownerId:config.ownerId,
    planningPolicyId:config.planningPolicyId,scopeId:config.scopeId,priceVersion:config.priceVersion,
    reservedMicros:config.reservedMicros,timeoutMs:config.timeoutMs,maxOutputTokens:config.maxOutputTokens},
  {credential:deps.workerCredential,binding:{provider:"qwen",endpoint:config.provider.endpoint,transport,price,
    recordUsage:deps.recordUsage,
    authorizeExternalRead:deps.authorizeExternalRead,
    evidenceLookup:async()=>({schemaVersion:"planning-evidence/1",coverage:"not_integrated"}),
    placeRead:signal=>readShanghaiStayAreaRoutes({env:deps.mapsEnv,signal,fetcher:deps.fetcher})},
    ...(deps.fetcher?{fetcher:deps.fetcher}:{})});
}
