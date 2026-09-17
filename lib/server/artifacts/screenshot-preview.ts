export type ScreenshotFieldKind = "date" | "amount" | "address" | "status";
type Field = Readonly<{ kind: ScreenshotFieldKind; value: string; locator: Readonly<{ line: number; start: number; end: number }> }>;
type Preview = Readonly<{ kind: "preview"; fields: readonly (Field & Readonly<{ state: "added" | "duplicate" | "conflict" }>)[] }> | Readonly<{ kind: "invalid" }>;
type Corrected = Readonly<{ kind: "pending_screenshot_proposal"; importId: string; tripId: string; baseTripVersion: number; expiresAt: string; fields: readonly Field[] }> | Readonly<{ kind: "invalid" }>;
const kinds = ["date", "amount", "address", "status"] as const;
export function previewSyntheticScreenshot(value: unknown): Preview {
  if (!record(value,["synthetic","fields","currentValues"]) || value.synthetic!==true || !Array.isArray(value.fields) || !Array.isArray(value.currentValues)) return freeze({kind:"invalid"});
  const fields = value.fields.map(parse); if (fields.some(x=>x===null) || new Set(fields.map(x=>x!.kind)).size!==fields.length) return freeze({kind:"invalid"});
  const current = new Map<string,string>(); for (const item of value.currentValues) { if (!record(item,["kind","value"]) || !kind(item.kind) || !text(item.value,160) || current.has(item.kind)) return freeze({kind:"invalid"}); current.set(item.kind,item.value); }
  return freeze({kind:"preview",fields:fields.map(field=>freeze({...field!,state:current.get(field!.kind)===undefined?"added":current.get(field!.kind)===field!.value?"duplicate":"conflict"}))});
}
export function correctSyntheticScreenshot(value: unknown): Corrected {
  if (!record(value,["synthetic","importId","tripId","baseTripVersion","now","expiresAt","fields"]) || value.synthetic!==true || !id(value.importId) || !id(value.tripId) || !Number.isSafeInteger(value.baseTripVersion) || value.baseTripVersion<0 || !instant(value.now) || !instant(value.expiresAt) || Date.parse(value.expiresAt)<=Date.parse(value.now) || !Array.isArray(value.fields)) return freeze({kind:"invalid"});
  const fields=value.fields.map(parse); if(!fields.length || fields.some(x=>x===null) || new Set(fields.map(x=>x!.kind)).size!==fields.length) return freeze({kind:"invalid"});
  return freeze({kind:"pending_screenshot_proposal",importId:value.importId,tripId:value.tripId,baseTripVersion:value.baseTripVersion,expiresAt:value.expiresAt,fields:fields as Field[]});
}
export class SyntheticScreenshotImportStore {
 #imports=new Map<string,{ownerId:string;digest:string;result:Corrected}>();
 #cancelled=new Set<string>();
 cancel(value:unknown):Readonly<{kind:"cancelled"|"invalid"}>{
  if(!record(value,["ownerId","importId"])||!id(value.ownerId)||!id(value.importId))return freeze({kind:"invalid"});
  const key=`${value.ownerId}:${value.importId}`;if(this.#imports.has(value.importId))return freeze({kind:"invalid"});this.#cancelled.add(key);return freeze({kind:"cancelled"});
 }
 confirm(value:unknown):Corrected {
  if(!record(value,["ownerId","screenshot"])||!id(value.ownerId)||!record(value.screenshot,["synthetic","importId","tripId","baseTripVersion","now","expiresAt","fields"]))return freeze({kind:"invalid"});
  if(this.#cancelled.has(`${value.ownerId}:${value.screenshot.importId}`))return freeze({kind:"invalid"});const result=correctSyntheticScreenshot(value.screenshot);if(result.kind!=="pending_screenshot_proposal")return result;
  const digest=JSON.stringify([value.ownerId,result.tripId,result.baseTripVersion,result.expiresAt,result.fields]);const prior=this.#imports.get(result.importId);
  if(prior)return prior.ownerId===value.ownerId&&prior.digest===digest?prior.result:freeze({kind:"invalid"});
  this.#imports.set(result.importId,{ownerId:value.ownerId,digest,result});return result;
 }
}
function parse(value: unknown): Field|null { if(!record(value,["kind","value","locator"])||!kind(value.kind)||!text(value.value,160)||!record(value.locator,["line","start","end"])||![value.locator.line,value.locator.start,value.locator.end].every(Number.isSafeInteger)||value.locator.line<1||value.locator.start<0||value.locator.end<=value.locator.start) return null; return freeze({kind:value.kind,value:value.value,locator:freeze({line:value.locator.line,start:value.locator.start,end:value.locator.end})}); }
function record(v:unknown,keys:readonly string[]):v is Record<string,any>{return !!v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));}
function kind(v:unknown):v is ScreenshotFieldKind{return typeof v==="string"&&(kinds as readonly string[]).includes(v)}
function id(v:unknown):v is string{return typeof v==="string"&&/^[a-z][a-z0-9_-]{0,127}$/.test(v)}
function text(v:unknown,max:number):v is string{return typeof v==="string"&&v.trim().length>0&&v.length<=max}
function instant(v:unknown):v is string{return typeof v==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v)&&Number.isFinite(Date.parse(v))}
function freeze<T>(v:T):Readonly<T>{if(v&&typeof v==="object")Object.values(v as object).forEach(freeze);return Object.freeze(v)}
