import { nativeRequestScope } from "../identity/native-request.ts";
import { isLocalNativeTarget } from "../identity/native-config.ts";
import { supabaseWorkerHeaders } from "../jobs/supabase-worker-headers.ts";
import { runPlanningComparisonWorker, type PlanningWorkerBinding, type PlanningWorkerConfig } from "./planning-comparison-worker.ts";

const RPCS=new Set([
  "claim_planning_comparison_work_v1","finish_turn_work","read_planning_comparison_work_v1","read_planning_observations_v1",
  "authorize_planning_read_v1","authorize_planning_dispatch_v1","pause_planning_comparison_v1",
  "claim_planning_action_v1","finish_planning_action_v1","complete_planning_observation_v1","complete_planning_comparison_v1",
  "reserve_model_budget","dispatch_model_budget","finish_model_budget",
]);
const STAGING="https://dzqdzetcctkhbrhlxxgn.supabase.co";

/** A single trusted poll of the existing work table. A host may call this
 * function on a schedule, but this module creates no second queue or timer. */
export function createScopedPlanningWorker(config:PlanningWorkerConfig&Readonly<{databaseUrl:string}>,dependencies:Readonly<{
  credential:(signal:AbortSignal)=>string|null|Promise<string|null>;
  binding:PlanningWorkerBinding;
  /** Only a closed disposable local integration test may provide a mapper. */
  fetcher?:typeof fetch;
}>){
  if(typeof window!=="undefined"||process.env.VERCEL_ENV||typeof dependencies.credential!=="function"
    || (config.environment==="staging"?config.databaseUrl!==STAGING
      :config.environment!=="local_synthetic"||!isLocalNativeTarget(config.databaseUrl))) throw Error("Planning worker unavailable");
  const fetcher=dependencies.fetcher??fetch;
  return async(signal:AbortSignal)=>{
    if(signal.aborted||process.env.VERCEL_ENV)return "unavailable" as const;
    const rpc=async(name:string,params:Readonly<Record<string,unknown>>):Promise<unknown>=>{
      if(!RPCS.has(name))throw Error("Planning RPC unavailable");
      const scope=nativeRequestScope(signal,15000);
      try{
        const key=await scope.run(()=>Promise.resolve(dependencies.credential(scope.signal)));
        if(typeof key!=="string"||!/^[\x21-\x7e]{1,8192}$/.test(key))throw Error("Planning credential unavailable");
        const response=await scope.run(()=>fetcher(config.databaseUrl+"/rest/v1/rpc/"+name,{
          method:"POST",headers:supabaseWorkerHeaders(key),body:JSON.stringify(params),redirect:"manual",credentials:"omit",cache:"no-store",signal:scope.signal,
        }));
        if(response.redirected||response.status!==200||response.headers.get("content-type")?.split(";")[0].trim()!=="application/json"||!response.body){
          await response.body?.cancel().catch(()=>{});throw Error("Planning RPC unavailable");
        }
        const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
        try{for(;;){const part=await scope.run(()=>reader.read());if(part.done)break;bytes+=part.value.byteLength;
          if(bytes>262144)throw Error("Planning RPC response too large");chunks.push(part.value);}
          scope.check();return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks))) as unknown;
        }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
      }finally{scope.dispose();}
    };
    return runPlanningComparisonWorker((name,params)=>rpc(name,params),rpc,(name,params)=>rpc(name,params),config,dependencies.binding,signal);
  };
}
