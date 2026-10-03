export type LibrarySource='materials'|'orders'|'translations'|'results';
export type LibraryReference=Readonly<{source:'translations'|'results';id:string;revision:number|null}>;
export type LibraryMetadata=LibraryReference&Readonly<{title:string;summary:string;createdAt:string|null;tripId:string|null}>;
export type LibraryPage=Readonly<{version:1;kind:'library_page';source:LibrarySource;status:'available'|'unavailable';reason:null|'DOMAIN_READER_MISSING'|'DOMAIN_UNAVAILABLE';items:readonly LibraryMetadata[]|null;nextCursor:string|null}>;
export const missingSource=(source:LibrarySource):LibraryPage=>({version:1,kind:'library_page',source,status:'unavailable',reason:'DOMAIN_READER_MISSING',items:null,nextCursor:null});
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
export function projectLibraryMetadata(source:'translations'|'results',value:unknown):LibraryPage|null{
 if(!object(value))return null;
 if(source==='results'){
  if(value.version!==2||!object(value.data))return null;const data=value.data;
  if(data.kind==='unavailable')return {version:1,kind:'library_page',source,status:'unavailable',reason:'DOMAIN_UNAVAILABLE',items:null,nextCursor:null};
  if(data.kind!=='result_search'||!Array.isArray(data.results)||data.results.length>20||data.nextCursor!==null&&typeof data.nextCursor!=='string')return null;
  const items:LibraryMetadata[]=[];
  for(const row of data.results){if(!object(row)||!uuid(row.artifactId)||!Number.isSafeInteger(row.revision)||Number(row.revision)<1||typeof row.title!=='string'||!row.title.trim()||row.title.length>120||typeof row.summary!=='string'||row.summary.length>1000||(row.tripId!==null&&!uuid(row.tripId)))return null;items.push({source,id:row.artifactId,revision:Number(row.revision),title:row.title,summary:row.summary.slice(0,240),createdAt:null,tripId:row.tripId as string|null});}
  if(new Set(items.map(r=>r.id)).size!==items.length||data.nextCursor!==null&&(!uuid(data.nextCursor)||items.length!==20||items.at(-1)?.id!==data.nextCursor))return null;
  return {version:1,kind:'library_page',source,status:'available',reason:null,items,nextCursor:data.nextCursor as string|null};
 }
 if(value.version!==2)return null;if(value.kind==='unavailable')return {version:1,kind:'library_page',source,status:'unavailable',reason:'DOMAIN_UNAVAILABLE',items:null,nextCursor:null};
 if(value.kind!=='translations'||!Array.isArray(value.phrases)||value.phrases.length>20||(value.nextCursor!==null&&typeof value.nextCursor!=='string'))return null;
 const items:LibraryMetadata[]=[];
 for(const row of value.phrases){if(!object(row)||row.state!=='translated'||!uuid(row.turnId)||typeof row.translation!=='string'||!row.translation.trim()||row.translation.length>2400)return null;items.push({source,id:row.turnId,revision:null,title:row.translation.slice(0,120),summary:row.translation.slice(0,240),createdAt:null,tripId:null});}
 if(new Set(items.map(r=>r.id)).size!==items.length)return null;
 return {version:1,kind:'library_page',source,status:'available',reason:null,items,nextCursor:value.nextCursor as string|null};
}

/** Opaque source/query-bound cursor; domain RPC still rechecks owner and current anchor. */
export function librarySourceCursor(source:'translations'|'results',query:string|null,domainCursor:string):string{return 'l1.'+Buffer.from(JSON.stringify({source,query,domainCursor}),'utf8').toString('base64url');}
export function parseLibrarySourceCursor(v:string,source:'translations'|'results',query:string|null):string|null{
 if(v.length>4000||!/^l1\.[A-Za-z0-9_-]+$/.test(v))return null;
 try{const x:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(v.slice(3),'base64url')));if(!object(x)||Object.keys(x).length!==3||!['source','query','domainCursor'].every(k=>Object.hasOwn(x,k))||x.source!==source||x.query!==query||typeof x.domainCursor!=='string'||x.domainCursor.length>1200||librarySourceCursor(source,query,x.domainCursor)!==v)return null;return x.domainCursor;}catch{return null;}
}
