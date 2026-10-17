// Actual Web Cookie / Native Bearer adapters over an intercepted SDK transport to owned PG.
// Synthetic local signing is not managed GoTrue or a target-device acceptance claim.
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {NextRequest} from 'next/server.js';
import {createUserDataAdapter,createNativeTripDataAdapter} from '../../../lib/server/identity/user-data-adapter.ts';
export async function readerCases(c:any, fixture:any) {
 const config={url:'https://ios004-fixture.invalid',publishableKey:'synthetic-publishable-key'};
 const keys=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const jwk={...await webcrypto.subtle.exportKey('jwk',keys.publicKey),kid:'ios004-local-fixture',alg:'ES256',use:'sig'};
 const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const claims={sub:fixture.owner,session_id:fixture.session,role:'authenticated',is_anonymous:false,aud:'authenticated',iss:config.url+'/auth/v1',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600};
 const unsigned=encode({alg:'ES256',typ:'JWT',kid:jwk.kid})+'.'+encode(claims);
 const signature=await webcrypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,Buffer.from(unsigned));
 const token=unsigned+'.'+Buffer.from(signature).toString('base64url');
 const calls:string[]=[];
 const transport:typeof fetch=async(input,init)=>{
  const req=new Request(input,init),url=new URL(req.url);assert.equal(url.origin,config.url);calls.push(url.pathname);
  if(url.pathname==='/auth/v1/.well-known/jwks.json')return Response.json({keys:[jwk]});
  assert.ok(url.pathname.startsWith('/rest/v1/'));
  await c.query("select set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[fixture.owner,JSON.stringify(claims)]);
  await c.query('set role authenticated');
  let data;
  if(url.pathname==='/rest/v1/rpc/native_session_v2')data=(await c.query("select public.native_session_v2('session') value")).rows[0].value;
  else if(url.pathname==='/rest/v1/rpc/read_trip_item_support_v1'){
   const body=await req.json();try{data=(await c.query('select public.read_trip_item_support_v1($1,$2,$3,$4) value',[body.p_trip,body.p_expected_trip_version,body.p_day,body.p_item])).rows[0].value;}catch(error){assert.match((error as Error).message,/permission denied for function read_trip_item_support_v1/);return Response.json({code:'42501',message:'permission denied for function read_trip_item_support_v1'},{status:403});}
  }else{
   const table=url.pathname.split('/').at(-1)!;
   const statements:Record<string,string>={trips:'select id,title,head_version,updated_at from public.trips where id=$1',trip_audit_events:'select id,action,proposal_id,created_at from public.trip_audit_events where trip_id=$1 order by created_at desc',trip_events:'select id,resulting_version,proposal_id,event_type,created_at from public.trip_events where trip_id=$1 order by resulting_version desc',trip_version_snapshots:'select version,title,content,created_at from public.trip_version_snapshots where trip_id=$1',memory_consumer_receipts:'select proposal_id,memory_id,source_receipt_id,constraint_kind from public.memory_consumer_receipts where proposal_id=any($1::uuid[])',trip_idempotency:'select proposal_id,resulting_version from public.trip_idempotency where proposal_id=any($1::uuid[])',trip_proposals:'select id,trip_id,base_trip_version,status from public.trip_proposals where id=any($1::uuid[])'};
   assert.ok(statements[table],'only exact fixture read tables');
   const isIn=['memory_consumer_receipts','trip_idempotency','trip_proposals'].includes(table);
   const raw=url.searchParams.get(table==='trips'||table==='trip_proposals'?'id':isIn?'proposal_id':'trip_id')!;
   const value=isIn?raw.slice(4,-1).split(','):raw.slice(3);
   const rows=(await c.query(statements[table],[value])).rows;
   // Match PostgREST single-object negotiation; dates serialize as SDK JSON strings.
   data=req.headers.get('accept')?.includes('vnd.pgrst.object')?(rows[0]??null):rows;
  }
  return Response.json(data);
 };
 try {
  const cookieName='sb-ios004-fixture-auth-token';
  const session={access_token:token,refresh_token:'synthetic-refresh',expires_at:claims.exp,expires_in:3600,token_type:'bearer',user:{id:fixture.owner,aud:'authenticated',role:'authenticated'}};
  const web=createUserDataAdapter(new NextRequest(config.url,{headers:{cookie:cookieName+'=base64-'+encode(session)}}),config,transport)!;
  const webRead=await web.getTrip(fixture.trip);assert.ok('data' in webRead);
  if(!('data' in webRead))throw Error('Web read missing');
  const native=await createNativeTripDataAdapter(new NextRequest(config.url,{headers:{authorization:'Bearer '+token}}),config,transport);assert.ok(native);
  const nativeRead=await native!.getTrip(fixture.trip);assert.ok('data' in nativeRead);
  if(!('data' in nativeRead))throw Error('Native read missing');
  assert.equal(webRead.data.trip.headVersion,5);assert.equal(nativeRead.data.trip.headVersion,5);
  assert.deepEqual(nativeRead.data.content,webRead.data.content);
  assert.equal(webRead.data.content.days[0].items[0].chineseAddress?.text,fixture.current.days[0].items[0].chineseAddress.text);
  const address=await web.readTripItemAddressSupport(fixture.trip,5,'d','i');assert.ok('data' in address);
  if(!('data' in address)||address.data.kind!=='addresses')throw Error('Address read unavailable '+JSON.stringify(address));
  assert.equal(address.data.userProvided.kind,'provided');assert.equal(address.data.reference.kind,'unavailable');
  assert.deepEqual(await web.readTripItemAddressSupport(fixture.trip,4,'d','i'),{data:{kind:'conflict'}});
  assert.deepEqual(await web.readTripItemAddressSupport(fixture.trip,5,'d','missing'),{data:{kind:'blocked'}});
  assert.ok(calls.includes('/rest/v1/rpc/read_trip_item_support_v1'));
  console.log('PASS actual Cookie + Native Bearer SDK adapters read same confirmed version/address; exact Cookie support, stale/missing item fences');
 } finally {await c.query('reset role');}
}
