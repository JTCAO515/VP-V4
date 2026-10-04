import {isUuid} from "../identity/request-guards.ts";
import type {LodgingContextInput} from "./contract.ts";
export type LodgingClassification={
 canonicalPoiId:string;classification:"hotel";mappingId:string;mappingVersion:2;mappingDigest:string;statementId:string;statementRevision:1;
 payloadHash:string;factId:string;publicationVersion:1;sourceDigest:string;
 sourceRefs:{sourceRevisionId:string;revisionLabel:string;snippetHash:string;publisher:string;uri:string;locator:string}[];
 rightsDigest:string;reviewedAt:string;expiresAt:string;
};
type RPC=(name:string,params:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const uuid=(v:unknown):v is string=>typeof v==="string"&&isUuid(v);
const hash=(v:unknown):v is string=>typeof v==="string"&&/^[0-9a-f]{64}$/.test(v);
const text=(v:unknown,max:number):v is string=>typeof v==="string"&&v.length>0&&v.length<=max;
export function parseLodgingClassifications(raw:unknown,tripId:string,input:LodgingContextInput,now=Date.now()):LodgingClassification[]|null{
 if(!object(raw)||!exact(raw,["kind","schemaVersion","tripId","tripVersion","city","locale","evaluatedAt","items"])
  ||raw.kind!=="lodging_classifications"||raw.schemaVersion!=="reviewed-lodging-classification/1"||raw.tripId!==tripId
  ||raw.tripVersion!==input.expectedTripVersion||raw.city!==input.needs.city||raw.locale!==input.locale
  ||typeof raw.evaluatedAt!=="string"||!Number.isFinite(Date.parse(raw.evaluatedAt))||Date.parse(raw.evaluatedAt)>now||now-Date.parse(raw.evaluatedAt)>=30000
  ||!Array.isArray(raw.items)||raw.items.length>20)return null;
 const ids=new Set(input.candidates.map(c=>c.canonicalPoiId)),seen=new Set<string>();
 for(const row of raw.items){
  if(!object(row)||!exact(row,["canonicalPoiId","classification","mappingId","mappingVersion","mappingDigest","statementId","statementRevision","payloadHash","factId","publicationVersion","sourceDigest","sourceRefs","rightsDigest","reviewedAt","expiresAt"])
   ||![row.canonicalPoiId,row.mappingId,row.statementId,row.factId].every(uuid)||!ids.has(row.canonicalPoiId as string)||seen.has(row.canonicalPoiId as string)
   ||row.classification!=="hotel"||row.mappingVersion!==2||row.statementRevision!==1||row.publicationVersion!==1
   ||![row.mappingDigest,row.payloadHash,row.sourceDigest,row.rightsDigest].every(hash)
   ||typeof row.reviewedAt!=="string"||!Number.isFinite(Date.parse(row.reviewedAt))||Date.parse(row.reviewedAt)>Date.parse(raw.evaluatedAt)
   ||typeof row.expiresAt!=="string"||!Number.isFinite(Date.parse(row.expiresAt))||Date.parse(row.expiresAt)<=now||Date.parse(row.expiresAt)-Date.parse(raw.evaluatedAt)>30000
   ||!Array.isArray(row.sourceRefs)||row.sourceRefs.length<1||row.sourceRefs.length>3)return null;
  const sources=new Set<string>();
  for(const source of row.sourceRefs){
   if(!object(source)||!exact(source,["sourceRevisionId","revisionLabel","snippetHash","publisher","uri","locator"])
    ||!uuid(source.sourceRevisionId)||sources.has(source.sourceRevisionId)||!hash(source.snippetHash)
    ||!text(source.revisionLabel,120)||!text(source.publisher,160)||!text(source.uri,2000)||!text(source.locator,240))return null;
   try{const url=new URL(source.uri);if(!["https:","http:"].includes(url.protocol)||!url.hostname||url.username||url.password)return null;}catch{return null;}
   sources.add(source.sourceRevisionId);
  }
  seen.add(row.canonicalPoiId as string);
 }
 return raw.items as LodgingClassification[];
}
/** Requests never grant classification. Only the separately reviewed owner RPC
 * supplies a current typed receipt; name/category/note/current booleans cannot. */
export async function readLodgingClassifications(tripId:string,input:LodgingContextInput,rpc:RPC):Promise<LodgingClassification[]>{
 if(!input.candidates.length||!["shanghai","beijing","guangzhou","chongqing"].includes(input.needs.city??""))return [];
 const result=await rpc("read_reviewed_lodging_classifications_v1",{p_trip_id:tripId,p_expected_trip_version:input.expectedTripVersion,
  p_city:input.needs.city,p_locale:input.locale,p_canonical_poi_ids:input.candidates.map(c=>c.canonicalPoiId)});
 if(result.error)return [];
 if(object(result.data)&&result.data.kind==="conflict")throw Error("STALE_TRIP_VERSION");
 return parseLodgingClassifications(result.data,tripId,input)??[];
}

/** The response window is not source identity. Its moving30s expiresAt is checked
 * on every read, while qualification compares immutable/versioned provenance. */
export function lodgingClassificationBasis(rows:readonly LodgingClassification[]){
 return rows.map(({expiresAt:_window,...basis})=>basis).sort((a,b)=>a.canonicalPoiId.localeCompare(b.canonicalPoiId));
}
