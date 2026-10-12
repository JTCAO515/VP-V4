/** Closed W2 inputs. Registration never grants execution or city qualification. */
export const CONTROL_SCHEMA = 'ops-control/1' as const;
export const CAPABILITIES = ['text', 'planning_comparison_v1', 'planning_intake_comparison_v2', 'scoped_trip_edit_v1'] as const;
export const PROVIDERS = ['qwen', 'glm', 'deepseek', 'amap'] as const;
export const CITIES = ['shanghai', 'beijing', 'guangzhou', 'chongqing'] as const;
export type ControlScope = Readonly<
  {kind:'capability';key:typeof CAPABILITIES[number]} |
  {kind:'provider';key:typeof PROVIDERS[number]} |
  {kind:'city';key:typeof CITIES[number]}
>;
export type ControlInput = Readonly<{schemaVersion:typeof CONTROL_SCHEMA}> & (
  Readonly<{action:'workspace'}> |
  Readonly<{action:'receipt';operationId:string}> |
  Readonly<{action:'set';operationId:string;expectedRevision:number;scope:ControlScope;state:'disabled'|'enabled'}> |
  Readonly<{action:'budget_read';scopeId:string}> |
  Readonly<{action:'budget_resume';operationId:string;scopeId:string;expectedRevision:number}>
);
export const record = (v:unknown):v is Record<string,unknown> => v!==null && typeof v==='object' && !Array.isArray(v);
export const exact = (v:Record<string,unknown>,keys:readonly string[]) => Object.keys(v).length===keys.length && keys.every(k=>Object.hasOwn(v,k));
export const uuid = (v:unknown):v is string => typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
export const revision = (v:unknown):v is number => Number.isSafeInteger(v) && Number(v)>=0 && Number(v)<=9007199254740990;
const member=(v:unknown,list:readonly string[]):v is string=>typeof v==='string'&&list.includes(v);
export function parseControlScope(v:unknown):ControlScope|null {
  if(!record(v)||!exact(v,['kind','key']))return null;
  if(v.kind==='capability'&&member(v.key,CAPABILITIES))return {kind:v.kind,key:v.key as typeof CAPABILITIES[number]};
  if(v.kind==='provider'&&member(v.key,PROVIDERS))return {kind:v.kind,key:v.key as typeof PROVIDERS[number]};
  if(v.kind==='city'&&member(v.key,CITIES))return {kind:v.kind,key:v.key as typeof CITIES[number]};
  return null;
}
export function parseControlInput(v:unknown):ControlInput|null {
  if(!record(v)||v.schemaVersion!==CONTROL_SCHEMA)return null;
  const schemaVersion=CONTROL_SCHEMA;
  if(v.action==='workspace'&&exact(v,['schemaVersion','action']))return {schemaVersion,action:v.action};
  if(v.action==='receipt'&&exact(v,['schemaVersion','action','operationId'])&&uuid(v.operationId))return {schemaVersion,action:v.action,operationId:v.operationId};
  if(v.action==='budget_read'&&exact(v,['schemaVersion','action','scopeId'])&&uuid(v.scopeId))return {schemaVersion,action:v.action,scopeId:v.scopeId};
  if(v.action==='budget_resume'&&exact(v,['schemaVersion','action','operationId','scopeId','expectedRevision'])&&uuid(v.operationId)&&uuid(v.scopeId)&&revision(v.expectedRevision))return {schemaVersion,action:v.action,operationId:v.operationId,scopeId:v.scopeId,expectedRevision:v.expectedRevision};
  if(v.action==='set'&&exact(v,['schemaVersion','action','operationId','expectedRevision','scope','state'])&&uuid(v.operationId)&&revision(v.expectedRevision)&&(v.state==='enabled'||v.state==='disabled')) {
    const scope=parseControlScope(v.scope);
    if(scope)return {schemaVersion,action:v.action,operationId:v.operationId,expectedRevision:v.expectedRevision,scope,state:v.state};
  }
  return null;
}
export function mutationId(input:ControlInput):string|null {
  return input.action==='set'||input.action==='budget_resume'?input.operationId:null;
}
