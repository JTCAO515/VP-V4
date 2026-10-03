import test from 'node:test';import assert from 'node:assert/strict';
import {nativeMemoryProfilesHTTP,validNativeMemoryCommand} from '../../../lib/server/memory/native-profiles-http.ts';
import {nativeFixture,subject,sessionId} from '../../contract/identity/native-fixture.ts';
const id='11111111-1111-4111-8111-111111111111',receiptId='22222222-2222-4222-8222-222222222222';
const command={action:'createUndo',operationId:id,memoryId:id,sourceReceiptId:receiptId,expectedRevision:1};
let port=59300;
async function setup(t,{lastSession,changed=false,rpcError=false,revoked=false}={}){
 const f=await nativeFixture(t,'http://127.0.0.1:'+port++);const old=globalThis.fetch;let sessions=0,reads=0,calls=0;
 const row={id,owner_id:subject,revision:2,state:'deleted',constraint_kind:'preference',summary:null,source_receipt_id:receiptId,consent_id:id,created_at:'2026-10-03T00:00:00Z',updated_at:'2026-10-03T00:00:00Z'};
 t.mock.method(globalThis,'fetch',async(i,init)=>{const r=new Request(i,init),name=new URL(r.url).pathname.split('/').at(-1);
 if(name==='native_session_v2'){sessions++;return Response.json(sessions>1&&lastSession?lastSession:{subject,sessionId});}
 if(name==='native_memory_command_v1'){calls++;return rpcError?Response.json({message:'MEMORY_CONFLICT',code:'P0001'},{status:400}):Response.json({version:1,ownerId:subject,action:'createUndo',operationId:id,memoryId:id,consentId:id,sourceReceiptId:receiptId,revision:2,state:'deleted',reused:false,undoAvailable:false});}
 if(name==='memory_profiles'){reads++;return Response.json([{...row,...(changed&&reads===2?{revision:3}:{})}]);}
 if(name==='memory_consents')return Response.json([{id,owner_id:subject,status:revoked?'revoked':'granted'}]);
 return old(i,init);});
 return {f,calls:()=>calls,request:(body=command,headers={})=>new Request('http://127.0.0.1/api/memory/native/v1/profiles',{method:'POST',headers:{Authorization:'Bearer '+f.token,'Content-Type':'application/json',...headers},body:JSON.stringify(body)})};
}
test('closed command forbids implicit save/extra fields/update createUndo confusion',()=>{
 assert.equal(validNativeMemoryCommand(command),true);for(const bad of [{...command,expectedRevision:2},{...command,ownerId:id},{action:'update',operationId:id,memoryId:id,sourceReceiptId:receiptId,expectedRevision:1,summary:'temporary',saveLongTerm:false}])assert.equal(validNativeMemoryCommand(bad),false);
});
for(const [name,options,status] of [['normal',{},200],['replaced',{lastSession:{subject:id,sessionId}},401],['malformed',{lastSession:{}},503],['rpc failure with replacement',{lastSession:{subject:id,sessionId},rpcError:true},401],['read race',{changed:true},409]])test('final session/read qualification '+name,async t=>{const e=await setup(t,options),r=await nativeMemoryProfilesHTTP(e.request(),e.f.config);assert.equal(r.status,status);if(status!==200)assert.equal(JSON.stringify(await r.json()).includes('sourceReceiptId'),false);});
test('ambiguous cookies/origin and extra command never call write RPC',async t=>{const e=await setup(t);for(const headers of [{Cookie:'x=1'},{Origin:'http://localhost'}])assert.equal((await nativeMemoryProfilesHTTP(e.request(command,headers),e.f.config)).status,400);assert.equal((await nativeMemoryProfilesHTTP(e.request({...command,extra:true}),e.f.config)).status,400);assert.equal(e.calls(),0);});
