import {isUuid} from "../identity/request-guards.ts";
import {createMapsServiceRoleClient} from "../maps/service-role-client.ts";
import type {LodgingCandidateChoice} from "./contract.ts";
import type {LodgingIdentity} from "./context.ts";
/** Same nonprivate mapping table as the existing Maps identity repository.
 * This client is never used for Trip/Profile/user data, no provider request occurs. */
export async function readLodgingIdentities(choices:readonly LodgingCandidateChoice[],env:Readonly<Record<string,string|undefined>>=process.env):Promise<LodgingIdentity[]>{
 if(!choices.length)return [];
 const client=createMapsServiceRoleClient(env);if(!client)return [];
 const result:LodgingIdentity[]=[];
 for(const provider of ["amap","tencent"] as const){
  const requested=choices.filter(c=>c.provider===provider);if(!requested.length)continue;
  const {data,error}=await client.from("provider_poi_mappings").select("id,canonical_poi_id,provider,provider_poi_id,raw_name,matched_at")
   .eq("provider",provider).in("provider_poi_id",requested.map(c=>c.providerPoiId)).limit(21);
  if(error||!Array.isArray(data)||data.length>20)continue;
  for(const choice of requested){
   const matches=data.filter(r=>r.provider_poi_id===choice.providerPoiId&&r.canonical_poi_id===choice.canonicalPoiId);
   if(matches.length!==1)continue;
   const row=matches[0];
   if(typeof row.id!=="string"||!isUuid(row.id)||row.provider!==provider||typeof row.raw_name!=="string"||!row.raw_name.trim()||row.raw_name.length>200
    ||typeof row.matched_at!=="string"||!Number.isFinite(Date.parse(row.matched_at)))continue;
   result.push({canonicalPoiId:choice.canonicalPoiId,provider,providerPoiId:choice.providerPoiId,mappingId:row.id,matchedAt:row.matched_at,label:row.raw_name});
  }
 }
 return result;
}
