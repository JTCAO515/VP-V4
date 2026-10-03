import { compareRoutes, type RouteMode } from "../../maps/route-comparison.ts";
import { createMapsServiceRoleClient } from "../../maps/service-role-client.ts";
import { loadCanonicalMappingLookup } from "../../maps/canonical-mapping-repository.ts";
import type { FeasibilityBasis, PlanEvidence, TransferEvidence } from "./assembly.ts";

export type ExplicitRouteRequest = {
  fromItemId: string; toItemId: string; originProviderPoiId: string;
  destinationProviderPoiId: string; mode: RouteMode; departure: "now"; mapConsent: true;
};
type Dependencies = {
  env: Readonly<Record<string,string|undefined>>; signal: AbortSignal;
  fetcher: typeof fetch; beforeRequest: () => Promise<boolean>;
  canonicalMapping?: (ids: readonly string[]) => Promise<(provider: "amap", id: string) => string|null>;
};
const enabled = (env: Dependencies["env"]) => env.VISEPANDA_FEASIBILITY_ROUTES_ENABLED==="true"
  && env.AMAP_ROUTES_ENABLED==="true" && env.AMAP_DETAIL_ENABLED==="true" && !!env.AMAP_WEB_SERVICE_KEY?.trim();
const record = (v: unknown): v is Record<string,unknown> => !!v && typeof v==="object" && !Array.isArray(v);

/** Explicit foreground-only current departure. No future route extrapolation, fallback,
 * cache, source acquisition, or Trip write. Default disabled; original Maps flags,
 * ordinary actor quota/session checks and request cancellation all remain required. */
export async function readPlanRouteEvidence(
  basis: FeasibilityBasis, places: readonly PlanEvidence[], requests: readonly ExplicitRouteRequest[], deps: Dependencies,
): Promise<{routes: TransferEvidence[]; bindings: unknown[]}> {
  const routes: TransferEvidence[]=[], bindings: unknown[]=[];
  if (!enabled(deps.env) || deps.signal.aborted) return {routes,bindings};
  const stops=basis.after.days.flatMap(day=>day.items??[]).filter(item=>item.startsAt&&item.endsAt)
    .sort((a,b)=>Date.parse(a.startsAt!)-Date.parse(b.startsAt!));
  // At most one explicit leg per foreground operation: the existing reader makes
  // two detail + three mode calls. No automatic route loop across the itinerary.
  for (const selected of requests.slice(0,1)) {
    const index=stops.findIndex(item=>item.id===selected.fromItemId);
    const from=stops[index], to=stops[index+1];
    if (!from || !to || to.id!==selected.toItemId || selected.departure!=="now" || selected.mapConsent!==true
      || Date.parse(from.endsAt!)>Date.now() || Date.now()-Date.parse(from.endsAt!)>300000) continue;
    const origin=places.find(p=>p.itemId===from.id&&p.current&&p.entityBound)?.canonicalPoiId;
    const destination=places.find(p=>p.itemId===to.id&&p.current&&p.entityBound)?.canonicalPoiId;
    if (!origin || !destination || origin===destination) continue;
    let lookup: (provider:"amap",id:string)=>string|null;
    if (deps.canonicalMapping) lookup=await deps.canonicalMapping([selected.originProviderPoiId,selected.destinationProviderPoiId]);
    else {
      const client=createMapsServiceRoleClient(deps.env);
      if (!client) continue;
      const checked=await loadCanonicalMappingLookup(client,"amap",[selected.originProviderPoiId,selected.destinationProviderPoiId]);
      if (checked.dbError) continue;
      lookup=checked.lookupMapping;
    }
    if (lookup("amap",selected.originProviderPoiId)!==origin || lookup("amap",selected.destinationProviderPoiId)!==destination) continue;
    let calls=0, stopped=false;
    const fetcher: typeof fetch=async(input,init)=>{
      if(stopped || deps.signal.aborted || !enabled(deps.env) || calls>=5 || !await deps.beforeRequest()) {
        stopped=true; throw Error("Current route authorization unavailable");
      }
      calls++;
      return deps.fetcher(input,{...init,redirect:"error",signal:AbortSignal.any([deps.signal,...(init?.signal?[init.signal]:[])])});
    };
    const response=await compareRoutes(new URLSearchParams({provider:"amap",originId:selected.originProviderPoiId,
      destinationId:selected.destinationProviderPoiId,departure:"now"}),{env:deps.env,fetcher});
    const body: unknown=response.body;
    if(stopped || deps.signal.aborted || response.status!==200 || !record(body)
      || body.provider!=="amap" || body.evidenceKind!=="provider_observation" || body.departure!=="now"
      || typeof body.observedAt!=="string" || typeof body.expiresAt!=="string"
      || Date.parse(body.expiresAt)<=Date.now() || Date.parse(body.observedAt)>Date.now()
      || Date.now()-Date.parse(body.observedAt)>300000
      || !Array.isArray(body.options)) continue;
    const option=body.options.find(o=>record(o)&&o.mode===selected.mode&&o.status==="observed");
    if (!record(option) || typeof option.durationSeconds!=="number" || !Number.isFinite(option.durationSeconds)
      || option.durationSeconds<0 || option.departureAt!==body.observedAt) continue;
    // Total walking duration is known only for the walking mode. Transit walking
    // distance is never converted into invented walking minutes.
    if (body.observedAt===from.endsAt) routes.push({fromItemId:from.id,toItemId:to.id,current:true,actualDeparture:from.endsAt!,
      minutes:Math.ceil(option.durationSeconds/60),walkingMinutes:selected.mode==="walking"?Math.ceil(option.durationSeconds/60):null,
      lastConnectionCurrent:false});
    bindings.push({kind:"route_observation",fromItemId:from.id,toItemId:to.id,originCanonicalPoiId:origin,
      destinationCanonicalPoiId:destination,provider:"amap",mode:selected.mode,departure:"now",
      actualDeparture:from.endsAt,timeBinding:body.observedAt===from.endsAt?"exact":"reference_only",observedAt:body.observedAt,expiresAt:body.expiresAt});
  }
  return {routes,bindings};
}
