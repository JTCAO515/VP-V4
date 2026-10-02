import {isQwenEndpoint} from '../model-gateway/adapters/provider-endpoints.ts';

type Row=Record<string,unknown>;
export type V2Source=Readonly<{conversationId:string;goalId:string;goalVersion:number;messageId:string;messageSequence:number;intakeRevision:number;memoryBasis:readonly Readonly<{id:string;revision:number}>[]}>;
export type V2Lease=Readonly<{ownerId:string;taskId:string;turnId:string;leaseToken:string;artifactId:string;planningPolicyId:string;intakeContextDigest:string;planningContextDigest:string;source:V2Source;environment:'local_synthetic'|'staging';locale:'en'|'zh'}>;
export type V2Read=Readonly<Row&{qualifiedIntake:Row;intakeContextDigest:string;planningContextDigest:string}>;
export type V2ProtocolOutcome=Readonly<{kind:'prepared';preparation:Row;readyForPublication:false;executionAvailable:false}>|Readonly<{kind:'blocked'|'unknown_effect'|'checkpoint_pending';readyForPublication:false;executionAvailable:false}>;
const obj=(v:unknown):v is Row=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Row,keys:readonly string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const id=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const member=(v:unknown,values:readonly string[]):v is string=>typeof v==='string'&&values.includes(v);
const int=(v:unknown,min:number,max:number)=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v===v.trim()&&v.length>0&&v.length<=max;
const same=(a:unknown,b:unknown):boolean=>Array.isArray(a)&&Array.isArray(b)?a.length===b.length&&a.every((x,i)=>same(x,b[i])):obj(a)&&obj(b)?Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&same(a[k],b[k])):Object.is(a,b);
const sourceKeys=['conversationId','goalId','goalVersion','messageId','messageSequence','intakeRevision','memoryBasis'];
const intakeKeys=['schemaVersion','city','comparisonTarget','durationDays','partySize','interests','pace','lodgingBudget','dates','mobilityConstraints'];
const readKeys=['kind','schemaVersion','ownerId','turnId','taskId','artifactId','planningPolicyId','provider','endpoint','goalText','delegation','planningActionBasis','qualifiedIntake','intakeContextDigest','executionAvailable','readyForProvider','planningContextDigest'];
function memories(v:unknown):boolean{return Array.isArray(v)&&v.length<=3&&v.every(x=>obj(x)&&exact(x,['id','revision'])&&id(x.id)&&int(x.revision,1,999999999999999))&&new Set(v.map(x=>x.id)).size===v.length&&v.every((x,i)=>i===0||v[i-1].id<x.id);}
function source(v:unknown):v is V2Source{return obj(v)&&exact(v,sourceKeys)&&[v.conversationId,v.goalId,v.messageId].every(id)&&int(v.goalVersion,1,10000)&&int(v.messageSequence,1,1000000)&&int(v.intakeRevision,1,1000)&&memories(v.memoryBasis);}
function intake(v:unknown):v is Row{
 if(!obj(v)||!exact(v,intakeKeys)||v.schemaVersion!=='stay-area-intake/1'||v.city!=='shanghai'||v.comparisonTarget!=='area_transport'
  ||v.durationDays!==null&&!int(v.durationDays,1,30)||v.partySize!==null&&!int(v.partySize,1,10)||v.pace!==null&&!member(v.pace,['relaxed','balanced','fast']))return false;
 for(const k of ['interests','mobilityConstraints']){const a=v[k];if(a!==null&&(!Array.isArray(a)||a.length>(k==='interests'?8:6)||new Set(a).size!==a.length||a.some(x=>!text(x,k==='interests'?40:120)||k==='interests'&&!['food','photography','culture','nature'].includes(x))))return false;}
 if(v.lodgingBudget!==null&&(!obj(v.lodgingBudget)||!exact(v.lodgingBudget,['currency','perNightMinorUnits'])||!member(v.lodgingBudget.currency,['CNY','USD','EUR','GBP'])||!int(v.lodgingBudget.perNightMinorUnits,1,10000000)))return false;
 const date=(x:unknown)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
 if(v.dates!==null&&(!obj(v.dates)||!exact(v.dates,['startDate','endDate'])||!date(v.dates.startDate)||!date(v.dates.endDate)||(v.dates.startDate as string)>(v.dates.endDate as string)||(Date.parse(v.dates.endDate as string)-Date.parse(v.dates.startDate as string))/86400000>30))return false;
 return true;
}
export function validPlanningV2Lease(v:unknown):v is V2Lease{return obj(v)&&exact(v,['ownerId','taskId','turnId','leaseToken','artifactId','planningPolicyId','intakeContextDigest','planningContextDigest','source','environment','locale'])&&[v.ownerId,v.taskId,v.turnId,v.leaseToken,v.artifactId,v.planningPolicyId].every(id)&&v.taskId!==v.turnId&&hash(v.intakeContextDigest)&&hash(v.planningContextDigest)&&v.intakeContextDigest!==v.planningContextDigest&&source(v.source)&&member(v.environment,['local_synthetic','staging'])&&member(v.locale,['en','zh']);}
/** Exact SQL qualification data only: false flags never grant dispatch. Lease
 * eligibility is freshly enforced by the trusted read port, not inferred here. */
export function decodePlanningV2Read(v:unknown,lease:V2Lease):V2Read|null{
 if(!validPlanningV2Lease(lease)||!obj(v)||!exact(v,readKeys)||v.kind!=='planning_intake_input'||v.schemaVersion!=='planning-intake-context/2'
  ||v.ownerId!==lease.ownerId||v.taskId!==lease.taskId||v.turnId!==lease.turnId||v.artifactId!==lease.artifactId||v.planningPolicyId!==lease.planningPolicyId
  ||v.provider!=='qwen'||!isQwenEndpoint(v.endpoint)||!text(v.goalText,4000)||!text(v.delegation,4000)||!hash(v.planningActionBasis)
  ||v.intakeContextDigest!==lease.intakeContextDigest||v.planningContextDigest!==lease.planningContextDigest||v.executionAvailable!==false||v.readyForProvider!==false||!obj(v.qualifiedIntake))return null;
 const q=v.qualifiedIntake;
 if(!exact(q,['version','kind','schemaVersion',...sourceKeys.filter(k=>k!=='memoryBasis'),'sourceKind','intake','memoryBasis','contextDigest','readiness','readyForProvider'])
  ||q.version!==5||q.kind!=='travel_intake'||q.schemaVersion!=='assistant-travel-current-basis/1'||q.sourceKind!=='explicit_current_input'||q.readyForProvider!==false||q.contextDigest!==lease.intakeContextDigest||!intake(q.intake))return null;
 for(const k of sourceKeys)if(!same(q[k],(lease.source as unknown as Row)[k]))return null;
 const r=q.readiness;if(!obj(r)||!exact(r,['kind','scope','unknown'])||r.kind!=='ready'||r.scope!=='transport_screening'||!Array.isArray(r.unknown))return null;
 const currentIntake=q.intake;const unknown=intakeKeys.filter(k=>currentIntake[k]===null);if(new Set(r.unknown).size!==r.unknown.length||r.unknown.length!==unknown.length||r.unknown.some(k=>typeof k!=='string'||!unknown.includes(k)))return null;
 return v as V2Read;
}
function observation(v:unknown,l:V2Lease,now:number):v is Row{
 if(!Number.isFinite(now)||!obj(v)||!exact(v,['schemaVersion','source','observedAt','providerCalls','areas'])||v.schemaVersion!=='planning-place/1'||v.source!==(l.environment==='staging'?'amap':'synthetic_fixture')||!text(v.observedAt,40)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(v.observedAt)||!Number.isFinite(Date.parse(v.observedAt))||new Date(v.observedAt).toISOString().slice(0,19)!==v.observedAt.slice(0,19)||now-Date.parse(v.observedAt)>300000||Date.parse(v.observedAt)-now>5000||!int(v.providerCalls,0,13)||!Array.isArray(v.areas)||v.areas.length!==2)return false;
 return new Set(v.areas.map(a=>obj(a)?a.id:null)).size===2&&v.areas.every(a=>obj(a)&&exact(a,['id','label','railMinutes','transfers'])&&member(a.id,['jingan','peoples_square'])&&text(a.label,80)&&(a.railMinutes===null||int(a.railMinutes,0,180))&&(a.transfers===null||int(a.transfers,0,5)));
}
function prepared(v:unknown,r:V2Read,l:V2Lease,place:Row,now:number):v is Row{
 if(!obj(v)||!exact(v,['schemaVersion','request','binding','observation','coverage','content','readyForProvider','readyForPublication'])||v.schemaVersion!=='qualified-intake-comparison-projection/1'||v.readyForProvider!==false||v.readyForPublication!==false||!same(v.request,r.qualifiedIntake.intake)||!obj(v.binding)||!exact(v.binding,[...sourceKeys,'contextDigest'])||v.binding.contextDigest!==l.intakeContextDigest)return false;
 for(const k of sourceKeys)if(!same(v.binding[k],(l.source as unknown as Row)[k]))return false;
 if(!observation(v.observation,l,now)||!obj(v.coverage)||!exact(v.coverage,['scope','evidence','observedFields','unknown'])||v.coverage.scope!=='transport_screening'||v.coverage.evidence!=='not_integrated'||!Array.isArray(v.coverage.observedFields)||!Array.isArray(v.coverage.unknown))return false;
 const original=place.areas as Row[];
 const normalized={...place,areas:original.map(a=>({...a,label:a.id==='jingan'?"Jing'an Temple":"People's Square"}))};
 const observed=['railMinutes','transfers'].filter(k=>original.some(a=>a[k]!==null));
 const unknown=['food','photography','pace_suitability','safety','quietness','hotel_price','availability',...(original.some(a=>a.railMinutes===null)?['rail_minutes']:[]),...(original.some(a=>a.transfers===null)?['transfers']:[])];
 if(!same(v.observation,normalized)||!same(v.coverage.observedFields,observed)||!same(v.coverage.unknown,unknown))return false;
 const c=v.content;return obj(c)&&exact(c,['schemaVersion','title','summary','options','actions'])&&c.schemaVersion==='comparison/1'&&text(c.title,120)&&text(c.summary,1000)&&Array.isArray(c.actions)&&c.actions.length===0&&Array.isArray(c.options)&&c.options.length===2&&c.options.every(o=>obj(o)&&exact(o,['id','title','tradeoff'])&&text(o.title,120)&&text(o.tradeoff,500))&&c.options[0].id==='jingan'&&c.options[1].id==='peoples_square';
}
export type V2ProtocolPorts=Readonly<{
 mode:'local_protocol_test';
 read:(lease:V2Lease,signal:AbortSignal)=>Promise<unknown>;
 checkpoints:(lease:V2Lease,signal:AbortSignal)=>Promise<unknown>;
 /** Separate, explicit fake-protocol capability. Qualified data/false flags
  * cannot mint it. No live implementation or public RPC is supplied here. */
 permit:(lease:V2Lease,signal:AbortSignal)=>Promise<unknown>;
 claimPlace:(lease:V2Lease,signal:AbortSignal)=>Promise<'claimed'|'duplicate'|'unknown'>;
 place:(signal:AbortSignal,beforeRequest:()=>Promise<void>)=>Promise<unknown>;
 savePlace:(lease:V2Lease,observation:Row,signal:AbortSignal)=>Promise<boolean>;
 unknownPlace:(lease:V2Lease)=>Promise<void>;
 prepare:(lease:V2Lease,observation:Row,signal:AbortSignal)=>Promise<unknown>;
 verifyPreparation:(lease:V2Lease,observation:Row,content:unknown,signal:AbortSignal)=>Promise<boolean>;
 now:()=>number;
}>;
const outcome=(kind:'blocked'|'unknown_effect'|'checkpoint_pending'):V2ProtocolOutcome=>({kind,readyForPublication:false,executionAvailable:false});
/** One already-owned synthetic lease. No claimer, scheduler, model dispatch,
 * settlement, publication or assumption of real-provider authorization. */
export async function runPlanningV2LocalProtocol(lease:V2Lease,ports:V2ProtocolPorts,signal:AbortSignal):Promise<V2ProtocolOutcome>{
 if(!validPlanningV2Lease(lease)||ports.mode!=='local_protocol_test'||signal.aborted||!Number.isFinite(ports.now()))return outcome('blocked');
 const fresh=async()=>{if(signal.aborted||!Number.isFinite(ports.now()))throw Error('aborted or invalid clock');const r=decodePlanningV2Read(await ports.read(lease,signal),lease);if(!r||signal.aborted)throw Error('stale qualification');return r;};
 const permit=async()=>{await fresh();const p=await ports.permit(lease,signal);if(!obj(p)||!exact(p,['kind','ownerId','taskId','turnId','leaseToken','intakeContextDigest','planningContextDigest'])||p.kind!=='local_protocol_permit'||['ownerId','taskId','turnId','leaseToken','intakeContextDigest','planningContextDigest'].some(k=>p[k]!== (lease as unknown as Row)[k])||signal.aborted)throw Error('protocol permit unavailable');};
 let read:V2Read;try{read=await fresh();}catch{return outcome('blocked');}
 let snapshot:unknown;try{snapshot=await ports.checkpoints(lease,signal);}catch{return outcome('blocked');}
 if(!obj(snapshot)||!exact(snapshot,['schemaVersion','ownerId','taskId','turnId','intakeContextDigest','planningContextDigest','place','modelAttempt'])||snapshot.schemaVersion!=='planning-v2-checkpoints/1'||['ownerId','taskId','turnId','intakeContextDigest','planningContextDigest'].some(k=>snapshot[k] !== (lease as unknown as Row)[k])||!obj(snapshot.place)||!member(snapshot.modelAttempt,['none','released','reserved','dispatched','pending','settled'])||!member(snapshot.place.state,['missing','started','unknown','completed']))return outcome('blocked');
 if(member(snapshot.place.state,['missing','started','unknown'])&&!exact(snapshot.place,['state']))return outcome('blocked');
 if(member(snapshot.modelAttempt,['dispatched','pending'])||member(snapshot.place.state,['started','unknown']))return outcome('unknown_effect');
 if(member(snapshot.modelAttempt,['reserved','settled']))return outcome('blocked');
 let place:Row;
 if(snapshot.place.state==='completed'){
  if(!exact(snapshot.place,['state','observation'])||!observation(snapshot.place.observation,lease,ports.now()))return outcome('blocked');place=snapshot.place.observation;
 }else if(snapshot.place.state==='missing'&&exact(snapshot.place,['state'])){
  try{await permit();if(await ports.claimPlace(lease,signal)!=='claimed')return outcome('unknown_effect');}catch{return outcome('blocked');}
  try{const value=await ports.place(signal,permit);await fresh();if(!observation(value,lease,ports.now()))throw Error('invalid observation');place=value;if(!await ports.savePlace(lease,place,signal))return outcome('checkpoint_pending');}
  catch{try{await ports.unknownPlace(lease);}catch{}return outcome('unknown_effect');}
 }else return outcome('blocked');
 try{read=await fresh();const value=await ports.prepare(lease,place,signal);if(!prepared(value,read,lease,place,ports.now())||!await ports.verifyPreparation(lease,place,value.content,signal))return outcome('blocked');await fresh();return {kind:'prepared',preparation:value,readyForPublication:false,executionAvailable:false};}
 catch{return outcome('blocked');}
}
