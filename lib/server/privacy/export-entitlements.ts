import type { ExportHandler,ExportLease,ExportPage } from './export-dispatcher.ts';
import type { ExportDomainRPC } from './export-worker.ts';
const keys=['environment','transactionId','productId','purchaseAt','startsAt','endsAt','catalogVersion','policyVersion','capacitySnapshot','state','revokedAt'];
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,k:string[])=>Object.keys(v).length===k.length&&k.every(x=>Object.hasOwn(v,x));
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v);
const instant=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));
type Cursor={environment:'Sandbox';transactionId:string};
function cursor(v:unknown):v is Cursor{return record(v)&&exact(v,['environment','transactionId'])&&v.environment==='Sandbox'&&text(v.transactionId,128);}
function row(v:unknown):v is Record<string,unknown>{return record(v)&&exact(v,keys)&&v.environment==='Sandbox'&&text(v.transactionId,128)&&text(v.productId,200)&&instant(v.purchaseAt)&&instant(v.startsAt)&&instant(v.endsAt)&&typeof v.catalogVersion==='number'&&Number.isSafeInteger(v.catalogVersion)&&v.catalogVersion>0&&text(v.policyVersion,200)&&record(v.capacitySnapshot)&&['active','revoked','erased'].includes(String(v.state))&&(v.revokedAt===null||instant(v.revokedAt));}
/** Existing ledger metadata only. Never grants access/renewal or alters financial/source records. */
export function entitlementExportHandler(lease:ExportLease,domain:ExportDomainRPC):ExportHandler&{progress:()=>{pages:number;rows:number;terminal:boolean}} {
 let revision:number|null=null,pages=0,rows=0,terminal=false;const seen=new Set<string>();
 return {sections:['grants'],consistency:'live_bounded',progress:()=>({pages,rows,terminal}),page:async(section,after,limit,signal):Promise<ExportPage>=>{
  if(section!=='grants'||after!==null&&!cursor(after)||!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('Entitlement export unavailable');
  const v=await domain('entitlement_page',{requestId:lease.requestId,leaseId:lease.leaseId,generation:lease.generation,cursor:after,limit},signal);
  if(!record(v)||!exact(v,['schemaVersion','section','sourceRevision','items','hasMore','nextCursor','sectionComplete'])||v.schemaVersion!=='entitlements-core-export/1'||v.section!=='grants'||typeof v.sourceRevision!=='number'||!Number.isSafeInteger(v.sourceRevision)||v.sourceRevision<1||revision!==null&&revision!==v.sourceRevision||!Array.isArray(v.items)||v.items.length>limit||!v.items.every(row)||typeof v.hasMore!=='boolean'||v.sectionComplete!==!v.hasMore||(v.hasMore?v.items.length===0||!cursor(v.nextCursor):v.nextCursor!==null))throw Error('Entitlement export unavailable');
  const items=v.items as Record<string,unknown>[];let previous=after as Cursor|null;
  for(const item of items){const next={environment:'Sandbox' as const,transactionId:item.transactionId as string};if(previous&&Buffer.compare(Buffer.from(next.transactionId,'utf8'),Buffer.from(previous.transactionId,'utf8'))<=0)throw Error('Entitlement cursor invalid');previous=next;}
  if(v.hasMore&&JSON.stringify(v.nextCursor)!==JSON.stringify(previous))throw Error('Entitlement cursor invalid');
  revision=v.sourceRevision;const id=JSON.stringify([after,limit]);if(!seen.has(id)){seen.add(id);pages++;rows+=items.length;terminal=!v.hasMore;}
  return {items:structuredClone(items),hasMore:v.hasMore,nextCursor:structuredClone(v.nextCursor),sectionComplete:!v.hasMore};
 }};
}
