import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {NextRequest} from 'next/server.js';
import {nativeFixture,subject,sessionId} from '../identity/native-fixture.ts';
import {runCoreExportJob} from '../../../lib/server/privacy/export-worker.ts';
import {runConfiguredCoreExport} from '../../../lib/server/privacy/export-runner.mjs';
import {coreExportHTTP} from '../../../lib/server/privacy/export-http.ts';
import {collectCoreExport,exportCanonical} from '../../../lib/server/privacy/export-dispatcher.ts';
import {parseExportKey,encryptExportArtifact} from '../../../lib/server/privacy/export-artifact.ts';
const policy={enabled:true,environment:'local',maxRunMs:60000,artifactTtlMs:60000,downloadTicketTtlMs:30000,maxPages:100,pageSize:100,maxBytes:50000};
const empty=(schemaVersion,section)=>({schemaVersion,section,items:[],hasMore:false,nextCursor:null,sectionComplete:true});
function workerFixture(){
 const requestId=randomUUID(),lease={requestId,ownerId:randomUUID(),leaseId:randomUUID(),generation:1,expiresAt:new Date(Date.now()+60000).toISOString()},key={keyId:'in-memory-test-key',key:randomBytes(32)};
 const actions=[];let stored=null,loseAck=false;
 const domain=async(action,input)=>{
  actions.push({action,input});
  if(action==='claim')return {kind:'privacy_export_lease/1',...lease,reused:false};
  if(action==='validate')return {kind:'privacy_export_lease_state/1',current:true};
  if(action==='trip_page')return empty('trip-core-export/1','trips');
  if(action==='commit'){
   stored={kind:'privacy_export_job/1',requestId,scope:'core-export-d2/1',state:'ready_partial',generation:1,createdAt:new Date(Date.now()-1000).toISOString(),completedAt:new Date().toISOString(),artifactDigest:input.artifact.plaintextDigest,artifactBytes:input.artifact.plaintextBytes,artifactExpiresAt:new Date(Date.parse(input.artifact.expiresAt)-1000).toISOString(),modules:input.modules,allUserDataCompleted:false};
   if(loseAck)throw Error('synthetic lost acknowledgement');return stored;
  }
  if(action==='execution_receipt')return {kind:'privacy_export_execution_receipt/1',outcome:'terminal',receipt:stored};
  throw Error('unexpected action');
 };
 const modules=async(name,input)=>{if(name==='assistant_message_source_export_owner_v2'||name==='assistant_travel_intake_export_owner_v1'){const v=empty(name.includes('message_source')?'assistant-message-sources-export/2':'assistant-travel-intake-export/1',undefined);delete v.section;return v;}return empty(name.startsWith('assistant')?'assistant-conversation-export/1':'result-artifact-export/1',input.p_section);};
 return {requestId,lease,key,actions,domain,modules,set loseAck(v){loseAck=v;}};
}
test('production worker composition uses durable scope/actual modules/encryption and clamped SQL expiry',async()=>{
 const f=workerFixture(),receipt=await runCoreExportJob(f.requestId,randomUUID(),policy,f.key,f.domain,f.modules,new AbortController().signal);
 assert.equal(receipt.state,'ready_partial');
 assert.equal(f.actions[0].input.expectedEnvironment,'local');assert.equal(f.actions[0].input.expectedKeyId,f.key.keyId);
 const commit=f.actions.find(a=>a.action==='commit');assert.ok(commit.input.artifact.ciphertext);assert.equal(commit.input.coverage,'partial');
 assert.ok(Date.parse(receipt.artifactExpiresAt)<Date.parse(commit.input.artifact.expiresAt));
});
test('lost commit ACK recovers only matching original service execution receipt without reread/export or renewal',async()=>{
 const f=workerFixture();f.loseAck=true;
 const receipt=await runCoreExportJob(f.requestId,randomUUID(),policy,f.key,f.domain,f.modules,new AbortController().signal);
 assert.equal(receipt.state,'ready_partial');assert.equal(f.actions.filter(a=>a.action==='claim').length,1);assert.equal(f.actions.filter(a=>a.action==='commit').length,1);
 const recovery=f.actions.at(-1);assert.equal(recovery.action,'execution_receipt');assert.equal(recovery.input.expectedArtifactDigest,receipt.artifactDigest);
});
test('defaultdisabled configured runner performs no key/file/network work',async()=>{
 const configuration=new Proxy({}, {get(_target,key){if(key!=='VP_PRIVACY_EXPORT_WORKER')throw Error('should not read further config');return undefined;}});
 assert.deepEqual(await runConfiguredCoreExport(randomUUID(),{configuration,fetcher:()=>{throw Error('no network');}}),{kind:'unavailable'});
});
const database='https://dzqdzetcctkhbrhlxxgn.supabase.co',host='vp-v4-exportsfixture-jtcao515s-projects.vercel.app';
async function httpFixture(t){
 const f=await nativeFixture(t,database),env={VERCEL_ENV:'preview',VERCEL_URL:host,VISEPANDA_NATIVE_STAGING:'true',VISEPANDA_TRIP_PROTOCOL_V2:'true',NEXT_PUBLIC_SUPABASE_URL:database,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:f.config.publishableKey};
 const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));t.after(()=>{for(const[k,v]of Object.entries(old))v===undefined?delete process.env[k]:process.env[k]=v;});Object.assign(process.env,env);
 return {...f,request:(path,headers={})=>new NextRequest(`https://${host}/api/privacy/native/v1/exports/${path}`,{headers:{authorization:'Bearer '+f.token,...headers}})};
}
test('protected HTTP validates/decrypts bytes then requires exact one-use consume ACK; lost ACK sends no payload',async t=>{
 const f=await httpFixture(t),lease={requestId:randomUUID(),ownerId:subject,leaseId:randomUUID(),generation:1,expiresAt:new Date(Date.now()+60000).toISOString()};
 const keyConfig={algorithm:'AES-256-GCM',keyId:'in-memory-http-test-key',key:randomBytes(32).toString('base64url')},key=parseExportKey(keyConfig),bundle=await collectCoreExport(lease,{},policy,async()=>true,new AbortController().signal);
 const artifact=encryptExportArtifact(bundle,lease,key,new Date(Date.now()+60000).toISOString());
 const configuration={policy:()=>JSON.stringify({...policy,environment:'staging'}),key:()=>JSON.stringify(keyConfig)};
 const token=randomBytes(32).toString('base64url'),operationId=randomUUID(),prior=globalThis.fetch,actions=[];let lost=false,tamper=false,foreign=false,expired=false;
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const r=new Request(input,init),path=new URL(r.url).pathname;
  if(path.endsWith('/privacy_core_export_v1')){
   const call=await r.json();actions.push(call.p_action);
   if(call.p_action==='download_prepare')return Response.json({kind:'privacy_export_download/1',requestId:lease.requestId,operationId,generation:1,ownerId:foreign?randomUUID():subject,artifactDigest:artifact.plaintextDigest,artifact:tamper?{...artifact,tag:randomBytes(16).toString('base64url')}:artifact,ticketExpiresAt:new Date(Date.now()+(expired?-1000:20000)).toISOString()});
   if(call.p_action==='download_consume'){if(lost==='network')throw new TypeError('synthetic consume ACK loss');if(lost)return Response.json({kind:'privacy_export_download_consumed/1',requestId:randomUUID(),operationId,generation:1,artifactDigest:artifact.plaintextDigest});return Response.json({kind:'privacy_export_download_consumed/1',requestId:lease.requestId,operationId,generation:1,artifactDigest:artifact.plaintextDigest});}
   throw Error('unexpected owner RPC');
  }
  return prior(input,init);
 });
 const request=()=>f.request(lease.requestId+'/download',{'X-Export-Download-Token':token,'X-Export-Operation-ID':operationId});
 const ok=await coreExportHTTP(request(),'download',lease.requestId,configuration);assert.equal(ok.status,200);assert.equal(await ok.text(),exportCanonical(bundle));assert.deepEqual(actions,['download_prepare','download_consume']);
 lost=true;const unknown=await coreExportHTTP(request(),'download',lease.requestId,configuration);assert.equal(unknown.status,503);assert.deepEqual(await unknown.json(),{error:{code:'UNAVAILABLE'}});
 lost='network';const lostResponse=await coreExportHTTP(request(),'download',lease.requestId,configuration);assert.equal(lostResponse.status,503);assert.deepEqual(await lostResponse.json(),{error:{code:'UNAVAILABLE'}});
 foreign=true;actions.length=0;assert.equal((await coreExportHTTP(request(),'download',lease.requestId,configuration)).status,503);assert.deepEqual(actions,['download_prepare']);
 foreign=false;expired=true;actions.length=0;assert.equal((await coreExportHTTP(request(),'download',lease.requestId,configuration)).status,503);assert.deepEqual(actions,['download_prepare']);
 expired=false;const duplicate=f.request(lease.requestId+'/download',{'X-Export-Download-Token':token+','+token,'X-Export-Operation-ID':operationId+','+operationId});actions.length=0;assert.equal((await coreExportHTTP(duplicate,'download',lease.requestId,configuration)).status,400);assert.deepEqual(actions,[]);
 tamper=true;actions.length=0;const bad=await coreExportHTTP(request(),'download',lease.requestId,configuration);assert.equal(bad.status,503);assert.deepEqual(actions,['download_prepare']);
});
test('disabled HTTP does not parse private key or verify/network credentials',async()=>{
 let keys=0;
 const r=await coreExportHTTP(new Request('https://example.com/exports'),'read',undefined,{policy:()=>undefined,key:()=>{keys++;throw Error('secret getter');}});
 assert.equal(r.status,503);assert.equal(keys,0);
});
test('old privacy202 intent and malformed expired metadata cannot become export completion',async()=>{
 const {parseExportJob}=await import('../../../lib/server/privacy/export-contract.ts');
 const requestId=randomUUID();
 assert.equal(parseExportJob({requestId,action:'export',status:'requested',execution:'not_started'},requestId),null);
 const expired={kind:'privacy_export_job/1',requestId,scope:'core-export-d2/1',state:'expired',generation:1,createdAt:new Date().toISOString(),completedAt:null,artifactDigest:null,artifactBytes:null,artifactExpiresAt:null,modules:[],allUserDataCompleted:false};
 assert.deepEqual(parseExportJob(expired,requestId),expired);
 for(const v of [{...expired,artifactBytes:'8388608'},{...expired,artifactDigest:'not-hash'},{...expired,allUserDataCompleted:true},{...expired,modules:[{module:'trip',payload:'secret source text'}]}])assert.equal(parseExportJob(v,requestId),null);
});
