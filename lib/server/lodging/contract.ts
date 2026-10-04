import {isUuid} from "../identity/request-guards.ts";
export type LodgingNeeds={
 city:string|null;checkIn:string|null;checkOut:string|null;adults:number|null;children:number|null;rooms:number|null;
 bedType:"double"|"twin"|"unspecified"|null;
 budget:{amountMinor:number;currency:"CNY"|"USD"|"EUR"|"GBP";basis:"per_room_per_night"|"total_stay"}|null;
 intent:"searching"|"booked"|"not_needed"|"deferred";userNote:string|null;
};
export type LodgingCandidateChoice={canonicalPoiId:string;provider:"amap"|"tencent";providerPoiId:string};
export type LodgingContextInput={
 expectedTripVersion:number;locale:"zh"|"en";needs:LodgingNeeds;
 profileChoice:{currentPace:"relaxed"|"balanced"|"packed"|null;useSaved:boolean;expectedSourceRevision:number|null};
 candidates:LodgingCandidateChoice[];
 comparisonReference:{artifactId:string;revision:number}|null;
 proposalReference:{proposalId:string;revision:number;digest:string}|null;
};
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const integer=(v:unknown,min:number,max:number):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=min&&v<=max;
export function lodgingDay(v:unknown):v is string{
 if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
 const time=Date.parse(v+"T00:00:00Z");return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===v;
}
export function parseLodgingContextInput(v:unknown):LodgingContextInput|null{
 if(!record(v)||!exact(v,["expectedTripVersion","locale","needs","profileChoice","candidates","comparisonReference","proposalReference"])
  ||!integer(v.expectedTripVersion,0,999999999)||!["zh","en"].includes(v.locale as string)||!record(v.needs)||!record(v.profileChoice))return null;
 const n=v.needs;
 if(!exact(n,["city","checkIn","checkOut","adults","children","rooms","bedType","budget","intent","userNote"])
  ||!(n.city===null||typeof n.city==="string"&&n.city.trim().length>0&&n.city.length<=80)
  ||![n.checkIn,n.checkOut].every(d=>d===null||lodgingDay(d))
  ||![n.adults,n.rooms].every(q=>q===null||integer(q,1,30))||!(n.children===null||integer(n.children,0,30))
  ||!(n.bedType===null||["double","twin","unspecified"].includes(n.bedType as string))
  ||!["searching","booked","not_needed","deferred"].includes(n.intent as string)
  ||!(n.userNote===null||typeof n.userNote==="string"&&n.userNote.length<=1000))return null;
 if(n.budget!==null&&(!record(n.budget)||!exact(n.budget,["amountMinor","currency","basis"])||!integer(n.budget.amountMinor,0,100000000)
  ||!["CNY","USD","EUR","GBP"].includes(n.budget.currency as string)||!["per_room_per_night","total_stay"].includes(n.budget.basis as string)))return null;
 const p=v.profileChoice;
 if(!exact(p,["currentPace","useSaved","expectedSourceRevision"])||typeof p.useSaved!=="boolean"
  ||!(p.currentPace===null||["relaxed","balanced","packed"].includes(p.currentPace as string))
  ||!(p.expectedSourceRevision===null||integer(p.expectedSourceRevision,1,9007199254740990)))return null;
 if((p.currentPace!==null&&p.useSaved)||(p.expectedSourceRevision!==null&&(!p.useSaved||p.currentPace!==null)))return null;
 if(!Array.isArray(v.candidates)||v.candidates.length>20||!v.candidates.every(c=>record(c)&&exact(c,["canonicalPoiId","provider","providerPoiId"])
  &&typeof c.canonicalPoiId==="string"&&isUuid(c.canonicalPoiId)&&["amap","tencent"].includes(c.provider as string)
  &&typeof c.providerPoiId==="string"&&/^[A-Za-z0-9_-]{1,128}$/.test(c.providerPoiId))
  ||new Set(v.candidates.map(c=>c.canonicalPoiId)).size!==v.candidates.length)return null;
 const r=v.comparisonReference,q=v.proposalReference;
 if(r!==null&&(!record(r)||!exact(r,["artifactId","revision"])||typeof r.artifactId!=="string"||!isUuid(r.artifactId)||!integer(r.revision,1,1000)))return null;
 if(q!==null&&(!record(q)||!exact(q,["proposalId","revision","digest"])||typeof q.proposalId!=="string"||!isUuid(q.proposalId)
  ||!integer(q.revision,1,999999999)||typeof q.digest!=="string"||!/^[0-9a-f]{64}$/.test(q.digest)))return null;
 return v as LodgingContextInput;
}
