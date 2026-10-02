import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeResultHTTP,nativeChangeProposalReferenceHTTP} from '../../../lib/server/artifacts/native-result-http.ts';
import {nativeFixture,subject,sessionId} from '../../contract/identity/native-fixture.ts';

const id='11111111-1111-4111-8111-111111111111';
let port=63480;
for(const [name,reader,rpc] of [['comparison',nativeResultHTTP,'read_result_artifacts_v1'],
 ['proposal-reference',nativeChangeProposalReferenceHTTP,'read_change_proposal_reference_v1']]) {
 test(name+' session reply distinguishes malformed/unavailable from actual authority loss before private read',async t=>{
  const fixture=await nativeFixture(t,'http://127.0.0.1:'+port++);
  const patch={NEXT_PUBLIC_SUPABASE_URL:fixture.config.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:fixture.config.publishableKey,
   VISEPANDA_NATIVE_LOCAL_SESSION:'true'};
  const prior=new Map(Object.keys(patch).map(key=>[key,process.env[key]]));Object.assign(process.env,patch);
  t.after(()=>{for(const[key,value]of prior)value===undefined?delete process.env[key]:process.env[key]=value;});
  const transport=globalThis.fetch,reads=[];
  let data={version:2,subject,sessionId,mobileEpoch:1},error=null;
  t.mock.method(globalThis,'fetch',async(input,init)=>{
   const request=new Request(input,init),path=new URL(request.url).pathname;
   if(path.endsWith('/native_session_v2'))return error?Response.json({message:error},{status:400}):Response.json(data);
   if(path.endsWith('/'+rpc)){reads.push(await request.json());return Response.json({kind:'empty'});}
   return transport(input,init);
  });
  const call=()=>reader(new Request('http://127.0.0.1/api/results/native/v1'+(name==='proposal-reference'?'/change-proposal-reference':'')+'?artifactId='+id+'&revision=1',
   {headers:{Authorization:'Bearer '+fixture.token}}));
  for(const malformed of [null,{},[],1,'invalid',{sessionId},{subject},{subject:null,sessionId},
   {subject:'invalid',sessionId},{subject,sessionId:'invalid'},{subject,sessionId:[]},{subject:[],sessionId}]){
   data=malformed;const response=await call();
   assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'private, no-store');
   assert.deepEqual(await response.json(),{error:{code:'RESULT_UNAVAILABLE'}});
   assert.deepEqual(reads,[],'malformed session never triggers the private result RPC');
  }
  for(const mismatch of [{subject:id,sessionId},{subject,sessionId:id}]){
   data=mismatch;const response=await call();assert.equal(response.status,401);
   assert.equal(response.headers.get('cache-control'),'private, no-store');
   assert.deepEqual(await response.json(),{error:{code:'UNAUTHENTICATED'}});assert.deepEqual(reads,[]);
  }
  for(const [message,status]of [['Temporary storage failure',503],['UNAUTHENTICATED',401],['SESSION_REPLACED',401]]){
   error=message;const response=await call();assert.equal(response.status,status);
   assert.equal(response.headers.get('cache-control'),'private, no-store');
   assert.deepEqual(await response.json(),{error:{code:status===401?'UNAUTHENTICATED':'RESULT_UNAVAILABLE'}});assert.deepEqual(reads,[]);
  }
  error=null;data={version:2,subject,sessionId,mobileEpoch:1};
  const valid=await call();assert.equal(valid.status,200);assert.equal(valid.headers.get('cache-control'),'private, no-store');
  assert.deepEqual(await valid.json(),{version:1,data:{kind:'empty'}});
  assert.deepEqual(reads,[{p_artifact_id:id,p_revision:1}],'valid session invokes only the selected exact result reader');
 });
}
