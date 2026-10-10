import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {collectCoreExport,exportCanonical} from '../../../lib/server/privacy/export-dispatcher.ts';
import {existingExportHandlers,existingExportRPC} from '../../../lib/server/privacy/export-modules.ts';
import {parseExportKey,encryptExportArtifact,decryptExportArtifact} from '../../../lib/server/privacy/export-artifact.ts';
function setup(){const lease={requestId:randomUUID(),ownerId:randomUUID(),leaseId:randomUUID(),generation:1,expiresAt:new Date(Date.now()+60000).toISOString()};return {lease,limits:{enabled:true,maxPages:100,maxBytes:50000,pageSize:100},signal:new AbortController().signal};}
const envelope=(schemaVersion,section,items=[],nextCursor=null)=>({schemaVersion,section,items,nextCursor,hasMore:nextCursor!==null,sectionComplete:nextCursor===null});
test('existing module adapters collect every section and report live/absent modules explicitly partial',async()=>{
  const f=setup(),seen=[];
  const rpc=async(name,input)=>{seen.push({name,input});if(name==='assistant_message_source_export_owner_v2'||name==='assistant_travel_intake_export_owner_v1'){const v=envelope(name.includes('message_source')?'assistant-message-sources-export/2':'assistant-travel-intake-export/1',undefined);delete v.section;return v;}return envelope(name.startsWith('assistant')?'assistant-conversation-export/1':'result-artifact-export/1',input.p_section);};
  const bundle=await collectCoreExport(f.lease,existingExportHandlers(f.lease,rpc),f.limits,async()=>true,f.signal);
  assert.equal(seen.length,13);assert.ok(seen.every(s=>s.input.p_owner===f.lease.ownerId));
  assert.equal(bundle.coverage,'partial');assert.equal(bundle.allUserDataCompleted,false);
  assert.equal(bundle.modules.find(m=>m.module==='conversations').reason,'LIVE_TRAVERSAL');
  assert.equal(bundle.modules.find(m=>m.module==='trip').reason,'HANDLER_MISSING');
});
test('terminal page alone cannot substitute for earlier pages; repeated/foreign cursor fails module',async()=>{
  const f=setup(),id=randomUUID();let calls=0;
  const handler={sections:['one'],consistency:'snapshot',page:async()=>++calls===1?{items:[{id}],hasMore:true,nextCursor:id,sectionComplete:false}:{items:[{id:'last'}],hasMore:false,nextCursor:null,sectionComplete:true}};
  const bundle=await collectCoreExport(f.lease,{trip:handler},f.limits,async()=>true,f.signal);
  assert.equal(bundle.modules[0].pages,2);assert.equal(bundle.modules[0].rows,2);
  calls=0;handler.page=async()=>({items:[{id}],hasMore:true,nextCursor:id,sectionComplete:false});
  assert.equal((await collectCoreExport(f.lease,{trip:handler},f.limits,async()=>true,f.signal)).modules[0].reason,'SOURCE_UNAVAILABLE');
});
test('disabled execution does not invoke handlers or lease RPC',async()=>{
  const f=setup();let calls=0;
  assert.equal(await collectCoreExport(f.lease,{},{...f.limits,enabled:false},async()=>{calls++;return true;},f.signal),null);assert.equal(calls,0);
});
test('lease revoke and bounded deadline prevent a terminal bundle, even when page ignores cancel',async()=>{
  const f=setup();let current=true;
  const handler={sections:['one'],consistency:'snapshot',page:async()=>{current=false;return {items:[],hasMore:false,nextCursor:null,sectionComplete:true};}};
  assert.equal(await collectCoreExport(f.lease,{trip:handler},f.limits,async()=>current,f.signal),null);
  const short={...f.lease,expiresAt:new Date(Date.now()+20).toISOString()};
  handler.page=()=>new Promise(()=>{});
  const keepAlive=setTimeout(()=>{},200);
  try{assert.equal(await collectCoreExport(short,{trip:handler},f.limits,async()=>true,f.signal),null);}finally{clearTimeout(keepAlive);}
});
test('page/byte caps produce partial receipt instead of silent truncation',async()=>{
  const f=setup(),handler={sections:['one'],consistency:'snapshot',page:async()=>({items:[{text:'x'.repeat(50000)}],hasMore:false,nextCursor:null,sectionComplete:true})};
  const bundle=await collectCoreExport(f.lease,{trip:handler},f.limits,async()=>true,f.signal);
  assert.equal(bundle.modules[0].reason,'BOUNDED_LIMIT');assert.equal(bundle.modules[0].rows,0);
});
test('AESGCM protects owner/request/generation and rejects tamper, wrong key, expiry and invalid byte metadata',async()=>{
  const f=setup(),bundle=await collectCoreExport(f.lease,{},f.limits,async()=>true,f.signal);
  const key=parseExportKey({algorithm:'AES-256-GCM',keyId:'test-only',key:randomBytes(32).toString('base64url')});
  const artifact=encryptExportArtifact(bundle,f.lease,key,new Date(Date.now()+60000).toISOString());
  const bytes=decryptExportArtifact(artifact,f.lease,key);assert.equal(bytes.toString(),exportCanonical(bundle));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),artifact.plaintextDigest);
  for(const lease of [{...f.lease,ownerId:randomUUID()},{...f.lease,requestId:randomUUID()},{...f.lease,generation:2}])assert.equal(decryptExportArtifact(artifact,lease,key),null);
  for(const changed of [{...artifact,tag:randomBytes(16).toString('base64url')},{...artifact,plaintextDigest:'a'.repeat(64)},{...artifact,plaintextBytes:artifact.plaintextBytes+1},{...artifact,expiresAt:'2026-99-01T00:00:00.000Z'},{...artifact,expiresAt:new Date(Date.now()-1000).toISOString()},{...artifact,unknown:'secret'}])assert.equal(decryptExportArtifact(changed,f.lease,key),null);
  assert.equal(decryptExportArtifact(artifact,f.lease,{...key,key:randomBytes(32)}),null);
  assert.equal(parseExportKey({algorithm:'AES-256-GCM',keyId:'bad',key:randomBytes(31).toString('base64url')}),null);
});
test('actual HTTP transport is exact POST/no redirect/no retries and bounds streamed upstream bytes',async()=>{
  let calls=0;
  const rpc=existingExportRPC({url:'http://127.0.0.1:54321',serviceKey:'synthetic-test-service-key'},async(url,init)=>{calls++;assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.equal(init.method,'POST');return Response.json(envelope('assistant-conversation-export/1','goals'));});
  await rpc('assistant_conversation_export_owner_v1',{p_owner:randomUUID(),p_section:'goals',p_after_id:null,p_limit:100},new AbortController().signal);assert.equal(calls,1);
  await assert.rejects(()=>rpc('unknown_rpc',{},new AbortController().signal));assert.equal(calls,1);
  const huge=existingExportRPC({url:'http://127.0.0.1:54321',serviceKey:'synthetic-test-service-key'},async()=>new Response('x'.repeat(1048577),{headers:{'content-type':'application/json'}}));
  await assert.rejects(()=>huge('result_artifact_export_owner_v1',{},new AbortController().signal));
});

test('message source/intake sections use exact existing RPCs, keysets and fail partially when a later source denies',async()=>{
 const f=setup(),id='10000000-0000-0000-0000-000000000001',seen=[];
 let wrong=false;
 const rpc=async(name,input)=>{
  seen.push({name,input});
  const source=name==='assistant_message_source_export_owner_v2';
  const items=source?[{messageId:id,inputReferences:[],capturedReferences:[],createdAt:'2026-10-03T00:00:00Z'}]:[{message_id:id,intake_revision:1,goal_id:id,conversation_id:id,message_sequence:1,goal_version:1,intake:{},memory_basis:[],created_at:'2026-10-03T00:00:00Z'}];
  return {schemaVersion:source?'assistant-message-sources-export/2':'assistant-travel-intake-export/1',items,hasMore:true,nextCursor:wrong?'20000000-0000-0000-0000-000000000001':id,sectionComplete:false};
 };
 const handler=existingExportHandlers(f.lease,rpc).conversations;
 await handler.page('messageSources',null,100,f.signal);await handler.page('travelIntakes',null,100,f.signal);
 assert.deepEqual(seen.map(s=>s.input),[{p_owner:f.lease.ownerId,p_after_message:null,p_limit:100},{p_owner:f.lease.ownerId,p_after_id:null,p_limit:100}]);
 wrong=true;await assert.rejects(()=>handler.page('messageSources',null,100,f.signal));
 const partialRPC=async(name,input)=>{
  if(name==='assistant_message_source_export_owner_v2')throw Error('synthetic permission denied');
  return envelope('assistant-conversation-export/1',input.p_section);
 };
 const bundle=await collectCoreExport(f.lease,existingExportHandlers(f.lease,partialRPC),f.limits,async()=>true,f.signal);
 assert.equal(bundle.modules.find(m=>m.module==='conversations').status,'partial');assert.equal(bundle.modules.find(m=>m.module==='conversations').reason,'SOURCE_UNAVAILABLE');
});
