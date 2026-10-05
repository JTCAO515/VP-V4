import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID as uuid} from 'node:crypto';
import {collectOwnerModule,decodeModuleExportBundle} from '../../../../lib/server/privacy/coverage/module-export.ts';
const actor={ownerId:uuid(),sessionId:uuid(),mobileEpoch:1};
const requestId=uuid(),now=Date.now();
const binding=scope=>({schemaVersion:'coverage-module-export/1',requestId,scope,...actor,sourceDigest:'a'.repeat(64),capturedAt:now,expiresAt:now+30000,allUserDataCompleted:false});
const devices=Array.from({length:101},()=>uuid()).sort().map(id=>({key:'device:'+id,domain:'device',deviceId:id,revision:1,permission:'denied',active:false,environment:'sandbox',timeZone:'Asia/Shanghai'}));
function fixture(scope,change=()=>{},empty=false){
 const rows=scope==='notification-metadata/1'?{notifications:empty?[]:devices}:{trips:[{tripId:uuid(),title:'Synthetic metadata only',headVersion:1,state:'active',archivedVersion:null,archivedAt:null}],operations:[{operationId:uuid(),sessionId:null,receipt:null,erasedReason:'FORBIDDEN'}]};
 const sections=Object.keys(rows),pageSize=scope==='notification-metadata/1'?100:50,maxPages=scope==='notification-metadata/1'?100:400,maxRows=scope==='notification-metadata/1'?10000:20000;
 let pages=0,delivered=0,calls=0;
 return async(input,signal)=>{
  assert.equal(signal.aborted,false);assert.equal(input.requestId,requestId);assert.equal(input.scope,scope);calls++;let result;
  if(input.action==='start')result={...binding(scope),kind:'started',sections,limits:{pageSize,maxPages,maxRows,maxBytes:1000000}};
  else if(input.action==='page'){
   const field=input.section==='notifications'?'key':input.section==='trips'?'tripId':'operationId',cursorField=input.section==='notifications'?'afterKey':'afterId';
   const offset=input.cursor===null?0:rows[input.section].findIndex(r=>r[field]===input.cursor[cursorField])+1;
   const items=rows[input.section].slice(offset,offset+input.limit),hasMore=offset+items.length<rows[input.section].length;
   delivered+=items.length;pages++;
   result={...binding(scope),kind:'page',section:input.section,items,hasMore,nextCursor:hasMore?{sourceDigest:'a'.repeat(64),[cursorField]:items.at(-1)[field]}:null,sectionComplete:!hasMore,pageNumber:Math.ceil((offset+items.length)/pageSize)||1};
  }else {assert.equal(input.action,'proof');result={...binding(scope),kind:'proof',coverage:'complete',pages,rows:delivered};}
  change(result,input,calls);return result;
 };
}
for(const scope of ['notification-metadata/1','trip-lifecycle-metadata/1'])test(`${scope}: from-null traversal, closed original rows, bounded exact proof and 30s same source binding`,async()=>{
 const bundle=await collectOwnerModule(scope,requestId,actor,fixture(scope),new AbortController().signal,async()=>true,()=>now+1);
 assert.ok(decodeModuleExportBundle(bundle,now+1));assert.equal(bundle.proof.pages,2);assert.equal(bundle.proof.rows,scope==='notification-metadata/1'?101:2);
 assert.equal(bundle.allUserDataCompleted,false);assert.equal(decodeModuleExportBundle(bundle,now+30000),null);
 assert.equal(decodeModuleExportBundle({...bundle,allUserDataCompleted:true},now+1),null);
 assert.equal(decodeModuleExportBundle({...bundle,proof:{...bundle.proof,rows:0}},now+1),null);
 assert.equal(decodeModuleExportBundle({...bundle,scope:'core-export-d2/1'},now+1),null);
});

test('partial/forged proof, changed source/owner/epoch, pagination reorder, hidden fields and capacity fail closed',async()=>{
 const changes=[
  (out,input)=>{if(input.action==='proof')out.coverage='partial';},
  (out,input)=>{if(input.action==='proof')out.pages++;},
  (out,input)=>{if(input.action==='page')out.sourceDigest='b'.repeat(64);},
  (out,input)=>{if(input.action==='page')out.ownerId=uuid();},
  (out,input)=>{if(input.action==='page')out.mobileEpoch=2;},
  (out,input)=>{if(input.action==='page'&&input.cursor!==null)out.items=[devices[0]];},
  (out,input)=>{if(input.action==='page')out.items=[{...devices[0],pushToken:'must-never-egress'}];},
  (out,input)=>{if(input.action==='start')out.limits.pageSize=1000;},
  (out,input)=>{if(input.action==='page')out.pageNumber=0;},
  (out,input)=>{if(input.action==='page'&&out.hasMore)out.nextCursor.sourceDigest='c'.repeat(64);},
 ];
 for(const change of changes)await assert.rejects(collectOwnerModule('notification-metadata/1',requestId,actor,fixture('notification-metadata/1',change),new AbortController().signal,async()=>true,()=>now+1),/COVERAGE_MODULE_UNAVAILABLE/);
});

test('empty scope still requires terminal page/current proof, and cancellation never creates fresh identity',async()=>{
 const bundle=await collectOwnerModule('notification-metadata/1',requestId,actor,fixture('notification-metadata/1',()=>{},true),new AbortController().signal,async()=>true,()=>now+1);
 assert.equal(bundle.proof.pages,1);assert.equal(bundle.proof.rows,0);
 const controller=new AbortController();let called=0;
 const rpc=fixture('notification-metadata/1',()=>{called++;controller.abort();});
 await assert.rejects(collectOwnerModule('notification-metadata/1',requestId,actor,rpc,controller.signal,async()=>true,()=>now+1),/COVERAGE_MODULE_UNAVAILABLE/);assert.equal(called,1);
 await assert.rejects(collectOwnerModule('notification-metadata/1',requestId,actor,fixture('notification-metadata/1'),new AbortController().signal,async()=>false,()=>now+1),/COVERAGE_MODULE_UNAVAILABLE/);
});
