// Current original Ops/review/publication + SQL reader through the actual Native
// context handler. Synthetic admin transport is not target Auth or ACL activation.
import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';import {NextRequest} from 'next/server.js';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
import {nativeFixture,subject,sessionId} from '../../contract/identity/native-fixture.ts';
import {lodgingContextHTTP} from '../../../lib/server/lodging/http.ts';
const enabled=process.env.VP_TURN_DB_TEST==='1';
const literal=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):Array.isArray(v)?"array["+v.map(literal).join(',')+"]::uuid[]":"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
test('current reviewed publication/canonical binding qualifies hotel through Native context; withdrawn classification never grants inventory or old evidence',{skip:!enabled,timeout:120000},async t=>{
 const container='vpj23-context-'+uuid().slice(0,8);let created=false;
 const db=async query=>{const r=await sql(container,query);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
 const claims=a=>`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({role:'authenticated',is_anonymous:false,session_id:a.session})}';`;
 const owner={owner:subject,session:sessionId},author={owner:uuid(),session:uuid()},reviewer={owner:uuid(),session:uuid()},trip=uuid(),poi=uuid(),candidate=uuid();
 const rpc=async(actor,name,params)=>JSON.parse(await db(claims(actor)+`select public.${name}(${Object.entries(params).map(([key,value])=>key+' => '+literal(value)).join(',')});`));
 try{
  const started=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
  assert.equal(started.code,0,started.stderr);created=true;
  for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(resolve=>setTimeout(resolve,100));}
  await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
  await db("create function auth.role()returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
  for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db('begin;'+readFileSync('supabase/migrations/'+file,'utf8')+'commit;');
  for(const actor of [owner,author,reviewer])await db(`insert into auth.users(id) values('${actor.owner}');insert into auth.sessions(id,user_id) values('${actor.session}','${actor.owner}');insert into identity_private.mobile_accounts(owner_id,epoch,session_id) values('${actor.owner}',1,'${actor.session}');insert into identity_private.mobile_attempts values('${actor.owner}','${uuid()}','${actor.session}',1);`);
  for(const actor of [author,reviewer])await db(`insert into knowledge_review_private.members(actor_id,active) values('${actor.owner}',true);`);
  await db("update knowledge_review_private.settings set enabled=true;update knowledge_review_private.publication_settings set enabled=true;");
  await db(claims(owner)+`insert into public.trips(id,owner_id,title) values('${trip}','${subject}','Synthetic owned Trip');
   insert into public.canonical_pois(id,primary_name_zh,primary_name_en,category) values('${poi}','合成住宿地点','Synthetic place','other');
   insert into public.provider_poi_mappings(canonical_poi_id,provider,provider_poi_id,raw_name) values('${poi}','amap','hotel-fixture','Synthetic mapped identity');`);
  const statement={schemaVersion:'knowledge-lodging-classification/1',assertion:{subjectId:'synthetic_hotel',predicate:'classified_as',objectId:'hotel',conditions:[],exclusions:['classification_only','no_price_or_inventory_claim','no_guest_eligibility_claim']},scope:{cities:['shanghai'],scene:'lodging_classification',audience:'international_independent_traveler'},
   expressions:{en:{text:'Synthetic hotel classification only.',conditions:[],exclusions:['Classification only.','No price/inventory.','No guest eligibility.']},zh:{text:'合成酒店分类。',conditions:[],exclusions:['仅分类','不含库存价格','不含入住资格']}},
   sources:[{sourceKey:'hotel_'+uuid(),revisionLabel:'one',publisher:'Synthetic reviewed source',uri:'https://example.invalid/classification',locator:'Fixture only',snippet:'Synthetic hotel class; no real content.',usageDeclaration:'Synthetic first-party test only.'}]};
  const op=async(actor,input)=>rpc(actor,'ops_lodging_classification_v1',{p_input:input});
  const submitted=await op(author,{action:'submit',operationId:uuid(),candidateId:candidate,title:'Synthetic hotel classification',statement});
  await op(reviewer,{action:'review',operationId:uuid(),candidateId:candidate,expectedVersion:1,decision:'reviewed',note:'Independent synthetic review'});
  const publication=await op(reviewer,{action:'publish',operationId:uuid(),candidateId:candidate,expectedVersion:2,expiresAt:new Date(Date.now()+600000).toISOString(),useBasis:'original_factual_summary',useNote:'Synthetic composition only, not real licence acceptance.'});
  const mapping=await op(author,{action:'submit_mapping',operationId:uuid(),canonicalPoiId:poi,statementId:submitted.statementId,expectedStatementRevision:1,expectedPayloadHash:submitted.payloadHash,expectedSourceDigest:submitted.sourceDigest,expectedPublicationVersion:1,expectedRightsDigest:publication.rightsDigest,city:'shanghai'});
  await op(reviewer,{action:'review_mapping',operationId:uuid(),mappingId:mapping.mappingId,expectedVersion:1,expectedDigest:mapping.digest,decision:'approved',note:'Independent exact canonical binding'});
  const database='https://dzqdzetcctkhbrhlxxgn.supabase.co',host='vp-v4-lodgingjoint-jtcao515s-projects.vercel.app';
  const auth=await nativeFixture(t,database),env={VERCEL_ENV:'preview',VERCEL_URL:host,VISEPANDA_NATIVE_STAGING:'true',VISEPANDA_TRIP_PROTOCOL_V2:'true',NEXT_PUBLIC_SUPABASE_URL:database,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:auth.config.publishableKey,SUPABASE_SERVICE_ROLE_KEY:'synthetic-nonprivate-mapping-only'};
  const previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);t.after(()=>{for(const[k,v]of Object.entries(previous))v===undefined?delete process.env[k]:process.env[k]=v;});
  const prior=globalThis.fetch;
  t.mock.method(globalThis,'fetch',async(value,init)=>{
   const request=new Request(value,init),path=new URL(request.url).pathname;
   if(path.endsWith('/native_session_v2'))return Response.json(await rpc(owner,'native_session_v2',await request.json()));
   if(path.endsWith('/read_reviewed_lodging_classifications_v1'))return Response.json(await rpc(owner,'read_reviewed_lodging_classifications_v1',await request.json()));
   if(path==='/rest/v1/provider_poi_mappings')return Response.json(JSON.parse(await db(`select jsonb_agg(to_jsonb(m)) from public.provider_poi_mappings m where canonical_poi_id='${poi}';`)));
   if(path==='/rest/v1/trips')return Response.json(JSON.parse(await db(claims(owner)+`select row_to_json(t) from public.trips t where id='${trip}';`)));
   if(path==='/rest/v1/trip_version_snapshots')return Response.json(JSON.parse(await db(claims(owner)+`select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.trip_version_snapshots s where trip_id='${trip}';`)));
   if(path.startsWith('/rest/v1/'))return Response.json([]);
   return prior(value,init);
  });
  const body={expectedTripVersion:0,locale:'en',needs:{city:'shanghai',checkIn:'2026-10-10',checkOut:'2026-10-12',adults:2,children:0,rooms:1,bedType:'double',budget:null,intent:'searching',userNote:null},
   profileChoice:{currentPace:null,useSaved:false,expectedSourceRevision:null},candidates:[{canonicalPoiId:poi,provider:'amap',providerPoiId:'hotel-fixture'}],comparisonReference:null,proposalReference:null};
  const request=()=>new NextRequest(`https://${host}/api/trips/native/v2/${trip}/lodging/context`,{method:'POST',headers:{authorization:'Bearer '+auth.token},body:JSON.stringify(body)});
  const accepted=await lodgingContextHTTP(request(),trip,true);assert.equal(accepted.status,200);const current=(await accepted.json()).data;
  assert.equal(current.candidates[0].hotelClassification,'reviewed_hotel');assert.equal(current.candidates[0].quote,'unknown');assert.equal(current.candidates[0].availability,'unknown');assert.equal(current.candidates[0].checkInEligibility,'unknown');
  await op(reviewer,{action:'revoke',operationId:uuid(),candidateId:candidate,expectedPublicationVersion:1,note:'Synthetic source revoke'});
  const withdrawn=await lodgingContextHTTP(request(),trip,true);assert.equal(withdrawn.status,200);const result=(await withdrawn.json()).data;
  assert.equal(result.candidates[0].hotelClassification,'unknown');assert.equal(result.candidates[0].classificationEvidence,null);
  const denied=await sql(container,'set role authenticated;'+claims(owner)+`select public.read_reviewed_lodging_classifications_v1('${trip}',0,'shanghai','en',array['${poi}']::uuid[]);`);
  assert.notEqual(denied.code,0);assert.match(denied.stderr,/permission denied for function/);
 }finally{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);}
});
