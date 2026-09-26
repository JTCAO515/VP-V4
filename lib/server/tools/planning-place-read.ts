import { searchPlaces } from "../maps/provider-search-adapter.ts";
import { compareRoutes } from "../maps/route-comparison.ts";

type Area = Readonly<{ id: "jingan" | "peoples_square"; label: string; railMinutes: number | null; transfers: number | null }>;
export type PlanningPlaceObservation = Readonly<{ schemaVersion: "planning-place/1"; source: "amap"; observedAt: string; providerCalls: number; areas: readonly [Area,Area] }>;
const ANCHORS = [
  { id:"jingan" as const, query:"静安寺", label:"Jing'an Temple anchor" },
  { id:"peoples_square" as const, query:"人民广场", label:"People's Square anchor" },
  { id:"station" as const, query:"上海站", label:"Shanghai Railway Station" },
] as const;

/** Three exact place identities and two current transit comparisons. No hotel
 * inventory, geocoding guess, route fallback, retry, or background location.
 * Every request is fixed, bounded, abortable and counted in the checkpoint. */
export async function readShanghaiStayAreaRoutes(input: Readonly<{
  env: Readonly<Record<string,string|undefined>>; signal: AbortSignal; fetcher?: typeof fetch;
}>): Promise<PlanningPlaceObservation> {
  if (input.signal.aborted || input.env.AMAP_SEARCH_ENABLED!=="true" || input.env.AMAP_DETAIL_ENABLED!=="true"
    || input.env.AMAP_ROUTES_ENABLED!=="true" || !input.env.AMAP_WEB_SERVICE_KEY?.trim()) throw Error("AMap route read unavailable");
  let calls=0;
  const underlying=input.fetcher??fetch;
  const guarded:typeof fetch=async(request,init)=>{
    if(input.signal.aborted || ++calls>13) throw Error("Provider request bound exceeded");
    const signals=[input.signal,init?.signal].filter((v):v is AbortSignal=>v instanceof AbortSignal);
    return underlying(request,{...init,signal:AbortSignal.any(signals)});
  };
  const ids:string[]=[];
  for(const anchor of ANCHORS){
    const result=await searchPlaces({provider:"amap",query:anchor.query,city:"上海",env:input.env,lookupMapping:()=>null,fetcher:guarded});
    if(result.status!=="observed") throw Error("Area anchor unavailable");
    const matches=result.candidates.filter(candidate=>candidate.rawName.trim()===anchor.query);
    if(matches.length!==1) throw Error("Area anchor ambiguous");
    ids.push(matches[0].providerPoiId);
  }
  if(new Set(ids).size!==3) throw Error("Area anchors conflict");
  const areas:Area[]=[];
  for(let index=0;index<2;index++){
    if(input.signal.aborted) throw Error("Area read interrupted");
    const result=await compareRoutes(new URLSearchParams({provider:"amap",originId:ids[index],destinationId:ids[2],departure:"now"}),
      {env:input.env,fetcher:guarded});
    if(result.status!==200 || !result.body || !("options" in result.body) || !Array.isArray(result.body.options))
      throw Error("Route read unavailable");
    const transit=result.body.options.find(option=>option.mode==="transit");
    const observed=transit?.status==="observed" && typeof transit.durationSeconds==="number";
    areas.push({id:ANCHORS[index].id as Area["id"],label:ANCHORS[index].label,
      railMinutes:observed?Math.ceil(transit.durationSeconds!/60):null,
      transfers:observed&&typeof transit.transfers==="number"?transit.transfers:null});
  }
  if(areas.every(area=>area.railMinutes===null)) throw Error("No observed rail comparison");
  return {schemaVersion:"planning-place/1",source:"amap",observedAt:new Date().toISOString(),providerCalls:calls,areas:areas as unknown as [Area,Area]};
}
