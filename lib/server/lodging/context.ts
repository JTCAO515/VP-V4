import {createHash} from "node:crypto";
import type {LodgingContextInput} from "./contract.ts";
import {lodgingDay} from "./contract.ts";
import type {TripSnapshot} from "../trip/patch/contract.ts";
import type {TaskTravelPace} from "../memory/travel-pace.ts";
export type LodgingIdentity={canonicalPoiId:string;provider:"amap"|"tencent";providerPoiId:string;mappingId:string;matchedAt:string;label:string};
export type LodgingComparison={artifactId:string;revision:number;taskId:string;goalId:string;goalVersion:number;content:{title:string;summary:string;options:readonly {id:string;title:string;tradeoff:string}[]}}|null;
export function buildLodgingContext(tripId:string,trip:TripSnapshot,confirmationState:string,input:LodgingContextInput,
 identities:readonly LodgingIdentity[],profile:TaskTravelPace|null,comparison:LodgingComparison,proposal:LodgingContextInput["proposalReference"],now:Date){
 const dateBasis=createHash("sha256").update(JSON.stringify(trip.days.map(d=>({id:d.id,date:d.date,timeZone:d.timeZone??null})))).digest("hex");
 const n=input.needs,nights=n.checkIn&&n.checkOut&&lodgingDay(n.checkIn)&&lodgingDay(n.checkOut)
  ?(Date.parse(n.checkOut+"T00:00:00Z")-Date.parse(n.checkIn+"T00:00:00Z"))/86400000:null;
 const dateStatus=nights===null?"unknown":nights>0&&nights<=90?"explicit":"invalid";
 const missing=["city","checkIn","checkOut","adults","children","rooms","bedType"].filter(key=>(n as unknown as Record<string,unknown>)[key]===null);
 const issues:string[]=[];
 if(n.city!==null&&(n.city.includes("://")||/[\u0000-\u001f\u007f]/u.test(n.city)))issues.push("INVALID_SEARCH_LOCATION");
 if(dateStatus==="invalid")issues.push("INVALID_STAY_WINDOW");
 if(n.rooms!==null&&n.adults!==null&&n.rooms>n.adults)issues.push("ROOMS_EXCEED_ADULTS");
 const dates=trip.days.map(day=>day.date).filter(lodgingDay).sort();
 const suggestedWindow=confirmationState==="confirmed"&&dates.length===trip.days.length&&dates.length>0
  ?{checkIn:dates[0],checkOut:new Date(Date.parse(dates[dates.length-1]+"T00:00:00Z")+86400000).toISOString().slice(0,10),scope:"date_suggestion_not_one_hotel_commitment"}:null;
 const totalRoomsNights=dateStatus==="explicit"&&n.rooms!==null?nights!*n.rooms:null;
 const budget=n.budget===null?{status:"unknown",currency:null,basis:null,amountMinor:null,totalStayBudgetMinor:null,perRoomPerNightBudgetMinor:null,rounding:"unknown",allocationRemainderMinor:null}
  :{status:"explicit_budget_not_quote",...n.budget,
   totalStayBudgetMinor:n.budget.basis==="total_stay"?n.budget.amountMinor:totalRoomsNights===null?null:n.budget.amountMinor*totalRoomsNights,
   perRoomPerNightBudgetMinor:n.budget.basis==="per_room_per_night"?n.budget.amountMinor:totalRoomsNights===null?null:Math.floor(n.budget.amountMinor/totalRoomsNights),
   rounding:n.budget.basis==="per_room_per_night"?"none":totalRoomsNights===null?"unknown":"floor_allocation_only",
   allocationRemainderMinor:n.budget.basis==="total_stay"&&totalRoomsNights!==null?n.budget.amountMinor-Math.floor(n.budget.amountMinor/totalRoomsNights)*totalRoomsNights:null};
 // Identity mapping is not hotel classification, room availability, a quote or
 // admission authority. User notes never influence evidence or objective rank.
 const candidates=input.candidates.map(choice=>{
  const identity=identities.find(i=>i.canonicalPoiId===choice.canonicalPoiId&&i.provider===choice.provider&&i.providerPoiId===choice.providerPoiId);
  return {choice,identity:identity??null,identityStatus:identity?"canonical_mapping_current":"unqualified",
   hotelClassification:"unknown",availability:"unknown",quote:"unknown",checkInEligibility:"unknown",bedMatch:"unknown",
   routeTiming:"future_pending",rankingBasis:identity?"identity_reference_only":"unqualified_reference"};
 }).sort((a,b)=>Number(b.identity!==null)-Number(a.identity!==null)||a.choice.canonicalPoiId.localeCompare(b.choice.canonicalPoiId));
 return {schemaVersion:"lodging-context/1",basis:{tripId,tripVersion:trip.version,dateBasis},evaluatedAt:now.toISOString(),
  expiresAt:new Date(now.getTime()+30000).toISOString(),tripDates:trip.days.map(d=>({dayId:d.id,date:d.date,timeZone:d.timeZone??null})),
  confirmationState,suggestedWindow,validation:{status:issues.length?"invalid":missing.length?"missing":"explicit_fields_require_existing_handoff_validation",missing,issues},needs:n,needsBasis:"current_explicit_input",dateStatus,nights:dateStatus==="explicit"?nights:null,
  budget,profilePreview:profile&&profile.source!=="none"?{status:profile.source==="profile"?"available":"current_input",value:profile,usage:"local_preview_only",appliedToRanking:false}:{status:"unknown",value:null,usage:"local_preview_only",appliedToRanking:false},
  candidates,areaComparison:comparison?{status:"exact_current_reference",reference:comparison,transportQualification:"unqualified_prose_reference",futureRoute:"pending"}
   :{status:"unknown",reference:null,transportQualification:"unknown",futureRoute:"pending"},
  proposalReference:proposal,affectedTripDays:dateStatus==="explicit"?trip.days.filter(day=>day.date>=n.checkIn!&&day.date<=n.checkOut!).map(day=>({dayId:day.id,date:day.date,timeZone:day.timeZone??null})):[],ranking:{commissionUsed:false,userNoteUsed:false,scope:"identity_only_stable_order"},
  intent:{value:n.intent,basis:"explicit_user_report",shouldOfferBooking:n.intent==="searching",supplierConfirmed:false},
  userNote:{text:n.userNote,basis:"unverified_user_note",usedAsEvidence:false},tripMutation:"none"};
}
