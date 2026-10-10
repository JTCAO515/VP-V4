import { TRAVEL_PACES, type TravelPace } from '../../memory/travel-pace.ts';
import { type Direction, type DirectionsInput, type RelativePlan, relativePlan } from './domain.ts';
export type DirectionsIntake = Readonly<{
 schemaVersion:'travel-directions-intake/1'; destinations:readonly string[]; durationDays:number|null;
 interests:readonly string[]; currentPace:TravelPace|null;
 budget:Readonly<{currency:'CNY'|'USD'|'EUR'|'GBP';totalMinorUnits:number}>|null;
 dates:Readonly<{startDate:string;endDate:string}>|null; intent:'explore'|'specific';
}>;
/** Proposed new content variant; canonical producer/source eligibility remains SQL-owned. */
export type TravelDirectionsContent = Readonly<{
 schemaVersion:'travel-directions/1';title:string;summary:string;intake:DirectionsIntake;
 directions:readonly Direction[];selectedDirectionId:Direction['id']|null;draft:RelativePlan|null;actions:readonly [];
}>;
const obj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,ks:readonly string[])=>Object.keys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k));
const int=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v===v.trim()&&v.length>0&&v.length<=max&&!/[\u0000-\u001f]/.test(v);
const member=<T extends string>(v:unknown,values:readonly T[]):v is T=>typeof v==='string'&&values.includes(v as T);
const strings=(v:unknown,maxItems:number,maxText:number):v is readonly string[]=>Array.isArray(v)&&v.length<=maxItems&&v.every(s=>text(s,maxText))&&new Set(v).size===v.length;
const date=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export function parseDirectionsIntake(v:unknown):DirectionsIntake|null{
 if(!obj(v)||!exact(v,['schemaVersion','destinations','durationDays','interests','currentPace','budget','dates','intent'])||v.schemaVersion!=='travel-directions-intake/1'
  ||!strings(v.destinations,30,80)||!strings(v.interests,8,40)||v.durationDays!==null&&!int(v.durationDays,1,30)||v.currentPace!==null&&!member(v.currentPace,TRAVEL_PACES)||!member(v.intent,['explore','specific']))return null;
 if(v.budget!==null&&(!obj(v.budget)||!exact(v.budget,['currency','totalMinorUnits'])||!member(v.budget.currency,['CNY','USD','EUR','GBP'])||!int(v.budget.totalMinorUnits,1,10000000)))return null;
 if(v.dates!==null){
  if(!obj(v.dates)||!exact(v.dates,['startDate','endDate'])||!date(v.dates.startDate)||!date(v.dates.endDate))return null;
  const length=(Date.parse(v.dates.endDate)-Date.parse(v.dates.startDate))/86400000+1;
  if(!int(length,1,30)||v.durationDays!==length)return null;
 }
 return v as DirectionsIntake;
}
export function domainInput(intake:DirectionsIntake,locale:'zh'|'en'):DirectionsInput{
 if(!parseDirectionsIntake(intake)||!member(locale,['zh','en']))throw Error('INVALID_INPUT');
 return {destinations:intake.destinations,durationDays:intake.durationDays,interests:intake.interests,currentPace:intake.currentPace,budgetMinorUnits:intake.budget?.totalMinorUnits??null,intent:intake.intent,locale};
}
export function parseRelativePlan(v:unknown,intake:DirectionsIntake):RelativePlan|null{
 if(!obj(v)||!exact(v,['directionId','requestedDays','days','coverage','limitations','pace','paceSource'])||!member(v.directionId,['depth','breadth'])||v.requestedDays!==intake.durationDays
  ||!Array.isArray(v.days)||v.days.length>30||!member(v.coverage,['complete_relative','partial_relative'])||!strings(v.limitations,10,3000)||v.limitations.length===0
  ||!member(v.paceSource,['current_input','profile','none'])||v.pace!==null&&!member(v.pace,TRAVEL_PACES)||v.pace===null&&v.paceSource!=='none'||v.pace!==null&&v.paceSource==='none')return null;
 if(intake.currentPace!==null&&(v.pace!==intake.currentPace||v.paceSource!=='current_input')||intake.currentPace===null&&v.paceSource==='current_input')return null;
 const expectedDays=intake.durationDays!==null&&intake.destinations.length>0?intake.durationDays:0;
 if(v.days.length!==expectedDays||v.coverage!==(expectedDays>0&&intake.destinations.length<=expectedDays?'complete_relative':'partial_relative'))return null;
 for(const [i,d] of v.days.entries())if(!obj(d)||!exact(d,['ordinal','destination','activities'])||d.ordinal!==i+1||!text(d.destination,80)||!strings(d.activities,8,160)||d.activities.length===0)return null;
 return v as RelativePlan;
}
export function parseTravelDirectionsContent(v:unknown):TravelDirectionsContent|null{
 if(!obj(v)||!exact(v,['schemaVersion','title','summary','intake','directions','selectedDirectionId','draft','actions'])||v.schemaVersion!=='travel-directions/1'||!text(v.title,120)||!text(v.summary,1000)
  ||!Array.isArray(v.actions)||v.actions.length!==0||!Array.isArray(v.directions)||v.directions.length<1||v.directions.length>2)return null;
 const intake=parseDirectionsIntake(v.intake);if(!intake)return null;
 const ids=new Set<string>();for(const d of v.directions){if(!obj(d)||!exact(d,['id','title','tradeoff'])||!member(d.id,['depth','breadth'])||ids.has(d.id)||!text(d.title,120)||!text(d.tradeoff,500))return null;ids.add(d.id);}
 if(intake.intent==='specific'&&v.directions.length!==1||intake.intent==='explore'&&v.directions.length!==2||v.selectedDirectionId!==null&&(!member(v.selectedDirectionId,['depth','breadth'])||!ids.has(v.selectedDirectionId)))return null;
 if(v.draft!==null){const draft=parseRelativePlan(v.draft,intake);if(!draft||v.selectedDirectionId===null||draft.directionId!==v.selectedDirectionId)return null;}
 try{if(new TextEncoder().encode(JSON.stringify(v)).byteLength>65536)return null;}catch{return null;}
 return v as TravelDirectionsContent;
}
/** Unknown durations save a real empty relative object; no invented dates. */
export function relativePlanForIntake(intake:DirectionsIntake,locale:'zh'|'en',directionId:Direction['id']):RelativePlan{
 return relativePlan(domainInput(intake,locale),directionId);
}
