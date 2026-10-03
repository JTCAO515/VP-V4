import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server.js';
import {nativeFixture,subject,sessionId} from '../identity/native-fixture.ts';
import {nativeSupportInput,nativeTripSupportHTTP} from '../../../lib/server/trip/support/native-http.ts';
const trip='314b8576-e9e7-49aa-aa66-94eac6ba6544',proposal='414b8576-e9e7-49aa-aa66-94eac6ba6544',receipt='514b8576-e9e7-49aa-aa66-94eac6ba6544',support='614b8576-e9e7-49aa-aa66-94eac6ba6544',hash='a'.repeat(64);
const prepare={operationId:receipt,placeReferenceId:support,dayId:'Day_UPPER-1',itemId:'Item_1',proposalId:proposal,expectedProposalRevision:1,expectedBaseVersion:2,expectedProposalDigest:hash,expectedItemDigest:hash,mappingId:receipt,expectedMappingVersion:1,expectedMappingDigest:hash,city:'shanghai',scene:'attraction',locale:'zh',scope:'address_reference',expectedClaimRevision:1,expectedPayloadHash:hash,expectedSourceDigest:hash};
const confirm={proposalId:proposal,idempotencyKey:receipt,digest:hash,expectedProposalRevision:1,expectedBaseVersion:2,supportSelection:[{receiptId:receipt,version:1,sourceDigest:hash}]};
const database='https://dzqdzetcctkhbrhlxxgn.supabase.co',host='vp-v4-supportfixture-jtcao515s-projects.vercel.app';
async function fixture(t){
 const f=await nativeFixture(t,database),env={VERCEL_ENV:'preview',VERCEL_URL:host,VISEPANDA_NATIVE_STAGING:'true',VISEPANDA_TRIP_PROTOCOL_V2:'true',NEXT_PUBLIC_SUPABASE_URL:database,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:f.config.publishableKey};
 const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));t.after(()=>{for(const[k,v]of Object.entries(old))v===undefined?delete process.env[k]:process.env[k]=v;});Object.assign(process.env,env);
 const prior=globalThis.fetch,seen=[];let replaced=false,denied=false,wrongTrip=false,badClaim=false;
 const entry={supportId:support,receiptId:receipt,version:1,scope:'address_reference',applicability:'unverified',status:'recheck_required',claimRevision:1,payloadHash:hash,sourceDigest:hash,claim:null};
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const r=new Request(input,init),path=new URL(r.url).pathname;
  if(path.endsWith('/native_session_v2'))return Response.json({subject,sessionId:replaced?trip:sessionId,mobileEpoch:1});
  if(path==='/rest/v1/trip_proposals')return Response.json([{trip_id:wrongTrip?receipt:trip,revision:1,base_trip_version:2}]);
  if(path.startsWith('/rest/v1/rpc/')&&path.includes('support')){
   const params=await r.json();seen.push({path,params,authorization:r.headers.get('authorization')});
   if(denied)return Response.json({message:'permission denied for function',code:'42501'},{status:403});
   if(path.endsWith('/prepare_trip_item_support_v1'))return Response.json({kind:'blocked'});
   if(path.endsWith('/revoke_trip_item_support_preparation_v1'))return Response.json({kind:'revoked',receiptId:receipt,version:2});
   if(path.endsWith('/read_trip_item_support_v1'))return Response.json({kind:'support',tripId:trip,tripVersion:3,dayId:'Day_UPPER-1',itemId:'Item_1',entries:[badClaim?{...entry,claim:{claimType:'address',value:'withdrawn'}}:entry]});
   if(path.endsWith('/renew_trip_item_support_v1'))return Response.json({kind:'renewed',supportId:support,version:2,receiptId:receipt});
   if(path.endsWith('/confirm_and_apply_supported_trip_proposal_v1'))return Response.json({kind:'confirmed',outcome:'applied',tripId:trip,proposalId:proposal,resultingVersion:3,supports:[{supportId:support,receiptId:receipt,version:1,status:'recheck_required'}]});
  }
  return prior(input,init);
 });
 return {seen,request:(body,query='')=>new NextRequest(`https://${host}/api/trips/native/v2/${trip}/support${query}`,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+f.token},...(body===undefined?{}:{body:JSON.stringify(body)})}),set replaced(v){replaced=v;},set denied(v){denied=v;},set wrongTrip(v){wrongTrip=v;},set badClaim(v){badClaim=v;}};
}
test('closed request rejects caller ownership/claim, missing explicit selection, duplicates and excess receipts',()=>{
 assert.ok(nativeSupportInput('prepare',prepare));assert.equal(nativeSupportInput('prepare',{...prepare,ownerId:subject}),null);assert.equal(nativeSupportInput('prepare',{...prepare,claim:{eligible:true}}),null);
 for(const selection of [[],Array(9).fill(confirm.supportSelection[0]),[...confirm.supportSelection,...confirm.supportSelection]])assert.equal(nativeSupportInput('confirm',{...confirm,supportSelection:selection}),null);
});
test('ordinary Native actor passes exact immutable input; missing mapping stays blocked, denied RPC unavailable',async t=>{
 const f=await fixture(t),r=await nativeTripSupportHTTP(f.request(prepare),'prepare',trip);assert.deepEqual(await r.json(),{kind:'blocked'});
 assert.deepEqual(f.seen[0].params,{p_input:{...prepare,tripId:trip}});assert.ok(f.seen[0].authorization.startsWith('Bearer '));
 f.denied=true;assert.equal((await nativeTripSupportHTTP(f.request(prepare),'prepare',trip)).status,503);
});
test('current actor replacement blocks before support call and browser/ambiguous query fails',async t=>{
 const f=await fixture(t);f.replaced=true;assert.equal((await nativeTripSupportHTTP(f.request(prepare),'prepare',trip)).status,401);assert.equal(f.seen.length,0);
 assert.equal((await nativeTripSupportHTTP(new NextRequest('https://example.com/support',{headers:{cookie:'synthetic'},method:'POST'}),'prepare',trip)).status,400);
 assert.equal((await nativeTripSupportHTTP(f.request(undefined,'?expectedTripVersion=3&expectedTripVersion=3&dayId=Day_UPPER-1&itemId=Item_1'),'read',trip)).status,400);
});
test('item support read preserves opaque case and withheld values; malformed revoked value is never exposed',async t=>{
 const f=await fixture(t),query='?expectedTripVersion=3&dayId=Day_UPPER-1&itemId=Item_1';
 const r=await nativeTripSupportHTTP(f.request(undefined,query),'read',trip);assert.equal(r.status,200);assert.equal((await r.json()).entries[0].claim,null);
 assert.deepEqual(f.seen[0].params,{p_trip:trip,p_expected_trip_version:3,p_day:'Day_UPPER-1',p_item:'Item_1'});
 f.badClaim=true;assert.equal((await nativeTripSupportHTTP(f.request(undefined,query),'read',trip)).status,503);
});
test('renew checks exact current item support selection; revoke remains owner preparation scope',async t=>{
 const f=await fixture(t),body={operationId:receipt,supportId:support,expectedVersion:1,tripVersion:3,dayId:'Day_UPPER-1',itemId:'Item_1',mappingId:receipt,expectedMappingVersion:1,expectedMappingDigest:hash,expectedClaimRevision:1,expectedPayloadHash:hash,expectedSourceDigest:hash};
 assert.equal((await nativeTripSupportHTTP(f.request(body),'renew',trip)).status,200);
 const before=f.seen.length;assert.deepEqual(await (await nativeTripSupportHTTP(f.request({...body,supportId:proposal}),'renew',trip)).json(),{kind:'blocked'});assert.equal(f.seen.length,before+1);
 assert.deepEqual(await (await nativeTripSupportHTTP(f.request({receiptId:receipt,expectedVersion:1}),'revoke')).json(),{kind:'revoked',receiptId:receipt,version:2});
});
test('supported confirm uses explicit selected receipts and true own proposal path; wrong Trip cannot mutate',async t=>{
 const f=await fixture(t);f.wrongTrip=true;assert.deepEqual(await (await nativeTripSupportHTTP(f.request(confirm),'confirm',trip)).json(),{kind:'blocked'});assert.equal(f.seen.length,0);
 f.wrongTrip=false;const r=await nativeTripSupportHTTP(f.request(confirm),'confirm',trip);assert.equal(r.status,200);assert.equal((await r.json()).outcome,'applied');
 assert.deepEqual(f.seen[0].params,{p_proposal_id:proposal,p_idempotency_key:receipt,p_digest:hash,p_support_selection:confirm.supportSelection});
});
