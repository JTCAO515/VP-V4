import { evaluateFeasibility, type Constraint, type TravelStop, type TravelTransfer } from "../../constraints/index.ts";
import type { TripSnapshot } from "../patch/contract.ts";

export type ExplicitPlanNeeds = { partySize: number; currency: string; maxBudgetMinor: number | null; minTransferMinutes: number; baggageBufferMinutes: number; appointmentBufferMinutes: number; maxWalkingMinutes: number | null };
export type PlanEvidence = {
  itemId: string; canonicalPoiId?: string; current: boolean; entityBound: boolean; opening: "open" | "closed" | "unknown";
  reservation: "available" | "not_required" | "unknown"; reservationCurrent: boolean;
};
export type TransferEvidence = { fromItemId: string; toItemId: string; current: boolean; actualDeparture: string; minutes: number; walkingMinutes: number | null; lastConnectionCurrent: boolean };
export type FeasibilityBasis = { tripId: string; proposalId: string; proposalRevision: number; baseVersion: number; proposalDigest: string; after: TripSnapshot };
export type FeasibilityLine = { itemId: string | null; constraint: string; status: "supported" | "pending" | "violated"; reason: string };

/** Evidence is supplied only by server-qualified readers. No title matching, provider dispatch or Trip mutation. */
export function assemblePlanFeasibility(basis: FeasibilityBasis, needs: ExplicitPlanNeeds, evidence: readonly PlanEvidence[], routes: readonly TransferEvidence[], evidenceBasis: readonly unknown[] = []) {
  const lines: FeasibilityLine[] = [], stops: TravelStop[] = [], transfers: TravelTransfer[] = [];
  const itemIds = new Set<string>();
  for (const day of basis.after.days) for (const item of day.items ?? []) {
    itemIds.add(item.id);
    const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(day.date) && Number.isFinite(Date.parse(day.date));
    let zone = false;try { if (day.timeZone) { new Intl.DateTimeFormat("en",{timeZone:day.timeZone});zone=true; } } catch { /* Unknown zone stays pending. */ }
    let dateMatches=false;
    if(zone&&item.startsAt&&Number.isFinite(Date.parse(item.startsAt))){const parts=new Intl.DateTimeFormat("en",{timeZone:day.timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(item.startsAt));const take=(k:string)=>parts.find(p=>p.type===k)?.value;dateMatches=[take("year"),take("month"),take("day")].join("-")===day.date;}
    const timed = dateValid && zone && dateMatches && item.startsAt !== undefined && item.endsAt !== undefined && Number.isFinite(Date.parse(item.startsAt)) && Date.parse(item.endsAt)>Date.parse(item.startsAt);
    lines.push({itemId:item.id,constraint:"calendar_timezone",status:timed?"supported":"pending",reason:timed?"EXPLICIT_DATED_WINDOW":"DATE_TIMEZONE_OR_WINDOW_MISSING"});
    const qualified = evidence.find(e=>e.itemId===item.id && e.current && e.entityBound);
    lines.push({itemId:item.id,constraint:"actual_place",status:qualified?"supported":"pending",reason:qualified?"CURRENT_EXACT_ENTITY":"EXACT_PLACE_EVIDENCE_MISSING"});
    if (!timed) continue;
    stops.push({id:item.id,startsAt:item.startsAt!,endsAt:item.endsAt!,opening:qualified?.opening??"unknown",openingEvidence:qualified?.opening && qualified.opening!=="unknown"?"current":"unknown",reservation:qualified?.reservation??"unknown",reservationEvidence:qualified?.reservationCurrent?"current":"unknown"});
  }
  stops.sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt));
  let overlaps = false;
  for (let i=1;i<stops.length;i++) {
    const from=stops[i-1],to=stops[i],route=routes.find(r=>r.fromItemId===from.id&&r.toItemId===to.id&&r.current&&r.actualDeparture===from.endsAt);
    if (Date.parse(from.endsAt) > Date.parse(to.startsAt)) {
      overlaps = true;
      lines.push({itemId:to.id,constraint:"fixed_schedule",status:"violated",reason:"FIXED_WINDOWS_OVERLAP"});
    }
    if (route) transfers.push({fromStopId:from.id,toStopId:to.id,minutes:route.minutes,evidence:"current"});
    lines.push({itemId:to.id,constraint:"door_to_door_route",status:route?"supported":"pending",reason:route?"CURRENT_EXACT_DEPARTURE_ROUTE":"QUALIFIED_ROUTE_MISSING"});
    const bufferMinutes=needs.minTransferMinutes+needs.baggageBufferMinutes+needs.appointmentBufferMinutes;
    const gap=(Date.parse(to.startsAt)-Date.parse(from.endsAt))/60000;
    lines.push({itemId:to.id,constraint:"baggage_appointment_buffers",status:!route?"pending":gap<route.minutes+bufferMinutes?"violated":"supported",reason:!route?"ROUTE_REQUIRED_FOR_BUFFER_CHECK":gap<route.minutes+bufferMinutes?"FIXED_WINDOW_BUFFER_CONFLICT":"EXPLICIT_BUFFER_WITH_CURRENT_ROUTE"});
    lines.push({itemId:to.id,constraint:"last_connection",status:route?.lastConnectionCurrent?"supported":"pending",reason:route?.lastConnectionCurrent?"CURRENT_CONNECTION":"TIMETABLE_EVIDENCE_MISSING"});
    if (needs.maxWalkingMinutes!==null) lines.push({itemId:to.id,constraint:"walking_limit",status:route?.walkingMinutes===null||route?.walkingMinutes===undefined?"pending":route.walkingMinutes>needs.maxWalkingMinutes?"violated":"supported",reason:"EXACT_WALKING_EVIDENCE_REQUIRED"});
  }
  if (itemIds.size===0) lines.push({itemId:null,constraint:"plan_items",status:"pending",reason:"NO_PLAN_ITEMS"});
  const constraints: Constraint[] = [
    {id:"opening",kind:"hard",type:"opening_required"}, {id:"reservation",kind:"hard",type:"reservation_required"},
    {id:"route",kind:"hard",type:"transfer_evidence_required"},
  ];
  if (needs.maxBudgetMinor!==null) constraints.push({id:"budget",kind:"hard",type:"max_budget",amountMinor:needs.maxBudgetMinor,currency:needs.currency});
  // Trip IDs are opaque; engine IDs are internal and never replace user-visible item IDs.
  const engineIds = new Map(stops.map((stop,index)=>[stop.id,`stop_${index}`]));
  const engineStops = stops.map(stop=>({...stop,id:engineIds.get(stop.id)!,startsAt:new Date(stop.startsAt).toISOString(),endsAt:new Date(stop.endsAt).toISOString()}));
  const engineTransfers = transfers.map(transfer=>({...transfer,fromStopId:engineIds.get(transfer.fromStopId)!,toStopId:engineIds.get(transfer.toStopId)!}));
  // The engine rejects overlapping input. Evaluate each stop in that case while the
  // explicit fixed-window violation above retains the complete conflict.
  const plans = overlaps ? engineStops.map(stop=>({stops:[stop],transfers:[]})) : [{stops:engineStops,transfers:engineTransfers}];
  for (const plan of plans) {
    const result=evaluateFeasibility({constraints:{revision:basis.proposalRevision,partySize:needs.partySize,constraints},plan:{currency:needs.currency,totalCostMinor:0,priceEvidence:"unknown",...plan}});
    for (const missing of result.missingEvidence) if (!lines.some(l=>l.constraint===missing.constraintId&&l.reason===missing.code)) lines.push({itemId:null,constraint:missing.constraintId,status:"pending",reason:missing.code});
    for (const violation of result.violations) if (!lines.some(l=>l.constraint===violation.constraintId&&l.reason===violation.code)) lines.push({itemId:null,constraint:violation.constraintId,status:"violated",reason:violation.code});
  }
  const status=lines.some(l=>l.status==="violated")?"infeasible":lines.some(l=>l.status==="pending")?"pending":"feasible";
  return {kind:"plan_feasibility/1",basis:{tripId:basis.tripId,proposalId:basis.proposalId,proposalRevision:basis.proposalRevision,baseVersion:basis.baseVersion,proposalDigest:basis.proposalDigest},status,lines,evidenceBasis,missingEvidence:lines.filter(line=>line.status==="pending").map(line=>({itemId:line.itemId,constraint:line.constraint,reason:line.reason})),userDecisions:basis.after.days.flatMap(day=>(day.items??[]).map(item=>({dayId:day.id,itemId:item.id,startsAt:item.startsAt??null,endsAt:item.endsAt??null,disposition:"preserved"}))),scheduleChanges:"none",proposalMutation:"none",needsBasis:"current_explicit_input"};
}
