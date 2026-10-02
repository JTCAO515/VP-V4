/** Injected private test transport only. No API client, credential, grant or permit is created. */
export type CheckpointLease=Readonly<{ownerId:string;taskId:string;turnId:string;leaseToken:string;intakeContextDigest:string;planningContextDigest:string;environment:'local_synthetic'|'staging'}>;
type Row=Record<string,unknown>;
type Operation='read_planning_v2_checkpoints_v1'|'claim_planning_v2_place_v1'|'save_planning_v2_place_v1'|'unknown_planning_v2_place_v1';
export type PrivateCheckpointTestTransport=(operation:Operation,params:Readonly<Row>,signal?:AbortSignal)=>Promise<unknown>;
const obj=(v:unknown):v is Row=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Row,keys:readonly string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const digest=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const integer=(v:unknown,max:number)=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=max;
const text=(v:unknown,max:number)=>typeof v==='string'&&v.length>0&&v.length<=max&&v===v.trim();
const unavailable=()=>new Error('Private checkpoint unavailable');
function params(l:CheckpointLease):Row{
 if(!l||![l.ownerId,l.taskId,l.turnId,l.leaseToken].every(uuid)||l.taskId===l.turnId||!digest(l.intakeContextDigest)||!digest(l.planningContextDigest)||l.intakeContextDigest===l.planningContextDigest||!['local_synthetic','staging'].includes(l.environment))throw unavailable();
 return {p_owner:l.ownerId,p_task:l.taskId,p_turn:l.turnId,p_lease:l.leaseToken,p_intake_digest:l.intakeContextDigest,p_planning_digest:l.planningContextDigest};
}
function date(v:unknown):v is string{
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(v)||!Number.isFinite(Date.parse(v)))return false;
 return new Date(v).toISOString().slice(0,19)===v.slice(0,19);
}
function observation(v:unknown,l:CheckpointLease,now:number):boolean{
 if(!obj(v)||!exact(v,['schemaVersion','source','observedAt','providerCalls','areas'])||v.schemaVersion!=='planning-place/1'||v.source!==(l.environment==='staging'?'amap':'synthetic_fixture')||!text(v.observedAt,40)||!date(v.observedAt)||!Number.isSafeInteger(now)||now<=0||now-Date.parse(v.observedAt)>300000||Date.parse(v.observedAt)-now>5000||!integer(v.providerCalls,13)||!Array.isArray(v.areas)||v.areas.length!==2)return false;
 return new Set(v.areas.map(a=>obj(a)?a.id:null)).size===2&&v.areas.every(a=>obj(a)&&exact(a,['id','label','railMinutes','transfers'])&&typeof a.id==='string'&&['jingan','peoples_square'].includes(a.id)&&text(a.label,80)&&(a.railMinutes===null||integer(a.railMinutes,180))&&(a.transfers===null||integer(a.transfers,5)));
}
export function decodePlanningV2CheckpointSnapshot(v:unknown,l:CheckpointLease,now:number):Row|null{
 try{params(l);}catch{return null;}
 if(!Number.isSafeInteger(now)||now<=0)return null;
 if(!obj(v)||!exact(v,['schemaVersion','ownerId','taskId','turnId','intakeContextDigest','planningContextDigest','place','modelAttempt'])||v.schemaVersion!=='planning-v2-checkpoints/1'||['ownerId','taskId','turnId','intakeContextDigest','planningContextDigest'].some(k=>v[k]!==l[k as keyof CheckpointLease])||!obj(v.place)||typeof v.place.state!=='string'||typeof v.modelAttempt!=='string'||!['none','released','reserved','dispatched','pending','settled'].includes(v.modelAttempt))return null;
 if(v.place.state==='completed')return exact(v.place,['state','observation'])&&observation(v.place.observation,l,now)?v:null;
 return ['missing','started','unknown'].includes(String(v.place.state))&&exact(v.place,['state'])?v:null;
}
/** Structural subset of frozen c441e3b3 V2ProtocolPorts. The caller supplies its
 * independent read/permit/place/preparation ports; none are minted here. */
export function createPlanningV2CheckpointTestPorts(options:Readonly<{mode:'local_protocol_test';transport:PrivateCheckpointTestTransport;now:()=>number}>){
 if(options.mode!=='local_protocol_test')throw unavailable();
 const invoke=async(name:Operation,l:CheckpointLease,signal?:AbortSignal,extra:Row={})=>{if(signal?.aborted)throw unavailable();const result=await options.transport(name,{...params(l),...extra},signal);if(signal?.aborted)throw unavailable();return result;};
 return {
  checkpoints:async(l:CheckpointLease,signal:AbortSignal)=>{const result=decodePlanningV2CheckpointSnapshot(await invoke('read_planning_v2_checkpoints_v1',l,signal),l,options.now());if(!result)throw unavailable();return result;},
  claimPlace:async(l:CheckpointLease,signal:AbortSignal):Promise<'claimed'|'duplicate'|'unknown'>=>{const result=await invoke('claim_planning_v2_place_v1',l,signal);if(!obj(result)||!exact(result,['kind'])||typeof result.kind!=='string'||!['claimed','duplicate','unknown'].includes(result.kind))throw unavailable();return result.kind as 'claimed'|'duplicate'|'unknown';},
  savePlace:async(l:CheckpointLease,value:Row,signal:AbortSignal)=>{const result=await invoke('save_planning_v2_place_v1',l,signal,{p_observation:value});if(typeof result!=='boolean')throw unavailable();return result;},
  unknownPlace:async(l:CheckpointLease)=>{const result=await invoke('unknown_planning_v2_place_v1',l);if(result!==true)throw unavailable();},
 };
}
