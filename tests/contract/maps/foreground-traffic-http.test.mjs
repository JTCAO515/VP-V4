import test from 'node:test';import assert from 'node:assert/strict';
import {NextRequest} from 'next/server.js';
import {nativeFixture,subject,sessionId} from '../identity/native-fixture.ts';
import {foregroundTrafficHTTP} from '../../../lib/server/maps/foreground-traffic/http.ts';
const id=n=>`${n}14b8576-e9e7-49aa-aa66-94eac6ba6544`;
const trip=id(3),host='vp-v4-foregroundfixture-jtcao515s-projects.vercel.app';
const input={operation:'check',expectedHeadVersion:0,dayId:'DAY',itemId:'Item-1',originPlaceReferenceId:id(5),destinationPlaceReferenceId:id(6),mode:'driving',departure:'now',mapConsent:true,foreground:true,previousReceiptId:null,movementMeters:0,expectedStopEpoch:null};
const policy={kind:'policy',policyId:id(7),policyRevision:1,sourceVersion:'fixture_v1',allowedEndpointModes:['walking','transit','driving'],accountScope:'synthetic',stopEpoch:0,stopped:false,endpoints:Object.fromEntries(['origin','destination'].map((name,i)=>[name,{referenceId:id(i+5),canonicalPoiId:id(i+1),mappingId:id(i+8),providerPoiId:i?'end':'start',canonicalFingerprint:'a'.repeat(64),mappingFingerprint:'b'.repeat(64)}])),policy:{policyId:'synthetic_foreground_http',sourceId:'synthetic_source',licenceVersion:'synthetic_v1',dataClass:'c0_public',grants:['duration','distance','derived_change','receipt_metadata'].flatMap(field=>[['display','explore'],['cache','explore'],['persist','trip_planning']].map(([action,purpose])=>({field,region:'cn',action,purpose}))),effectiveAt:'2026-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z',termsRecheckAt:'2099-01-01T00:00:00Z',trialEndsAt:null,derivative:'allowed',shareAlike:'not_required',combination:'denied',redistribution:'denied',training:'denied',retention:'durable'}};
test('actual native HTTP uses verified actor and separate restricted producer transport; no TMC grant makes no TMC request',async t=>{
 const database='https://dzqdzetcctkhbrhlxxgn.supabase.co',f=await nativeFixture(t,database);
 const env={VERCEL_ENV:'preview',VERCEL_URL:host,VISEPANDA_NATIVE_STAGING:'true',VISEPANDA_TRIP_PROTOCOL_V2:'true',NEXT_PUBLIC_SUPABASE_URL:database,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:f.config.publishableKey,SUPABASE_SERVICE_ROLE_KEY:'synthetic-server-only',VISEPANDA_FOREGROUND_TRAFFIC_ENABLED:'true',AMAP_ROUTES_ENABLED:'true',AMAP_DETAIL_ENABLED:'true',AMAP_WEB_SERVICE_KEY:'synthetic-provider-only',KNOWLEDGE_STAGING_READ:'1'};
 const priorEnv=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);t.after(()=>{for(const[k,v]of Object.entries(priorEnv))v===undefined?delete process.env[k]:process.env[k]=v;});
 const priorFetch=globalThis.fetch;let policyAllowed=true,epoch=1,calls=0;const producer=[],ownerCalls=[];
 t.mock.method(globalThis,'fetch',async(input,init)=>{
   const req=new Request(input,init),url=new URL(req.url),path=url.pathname;
   if(url.hostname==='restapi.amap.com'){
     calls++;if(!path.includes('place/detail'))assert.equal(url.searchParams.get('show_fields'),'cost');
     if(path.includes('place/detail')){const poi=url.searchParams.get('id');return Response.json({status:'1',infocode:'10000',pois:[{id:poi,name:'地点',address:'中文地址',citycode:'021',location:poi==='start'?'121.4,31.2':'121.5,31.3'}]});}
     const transit=path.includes('transit');return Response.json({status:'1',infocode:'10000',route:{origin:'121.4,31.2',destination:'121.5,31.3',[transit?'transits':'paths']:[{distance:'1000',cost:{duration:'600'},steps:[{instruction:'前行'}],segments:[{walking:{distance:'100',steps:[{instruction:'步行'}]},bus:{buslines:[{name:'线路',departure_stop:{name:'起点'},arrival_stop:{name:'终点'}}]}}]}]}});
   }
   if(path.endsWith('/native_session_v2'))return Response.json({version:2,subject,sessionId,mobileEpoch:epoch});
   if(path.endsWith('/foreground_traffic_policy_v1')||path.endsWith('/foreground_traffic_producer_v1')){
     const params=await req.json();producer.push({path,params,authorization:req.headers.get('authorization')});
     assert.equal(req.headers.get('authorization'),'Bearer synthetic-server-only');assert.equal(params.p_actor.subject,subject);assert.equal(params.p_actor.sessionId,sessionId);assert.ok(params.p_actor.mobileEpoch===epoch||params.p_actor.mobileEpoch===null);
     if(path.endsWith('/foreground_traffic_policy_v1'))return Response.json(policyAllowed?policy:{kind:'unavailable'});
     if(params.p_action==='begin')return Response.json({kind:'dispatch',dispatchId:id(9),stopEpoch:0});
     if(params.p_action==='request')return Response.json({kind:'request',dispatchId:id(9),requestIndex:params.p_input.requestIndex});
     if(params.p_action==='complete'){const p=params.p_input;return Response.json({kind:'receipt',receipt:{receiptId:id(8),dispatchId:id(9),scope:{tripId:trip,expectedHeadVersion:0,dayId:'DAY',itemId:'Item-1',originPlaceReferenceId:id(5),destinationPlaceReferenceId:id(6),mode:'driving',departure:'now'},stopEpoch:0,policyId:id(7),policyRevision:1,sourceVersion:'fixture_v1',fetchedAt:p.fetchedAt,providerObservedAt:null,expiresAt:new Date(Date.parse(p.fetchedAt)+299000).toISOString(),selected:p.selected,alternatives:p.alternatives,previousReceiptId:null,changeKind:'first_observation',durationDeltaSeconds:null,routeChangeCaveat:true,r2Qualified:false}});}
     return Response.json({kind:'unknown'});
   }
   if(path.startsWith('/rest/v1/')){ownerCalls.push({path,authorization:req.headers.get('authorization')});
     if(path==='/rest/v1/trips')return Response.json({id:trip,title:'Trip',head_version:0,updated_at:'2026-10-04T00:00:00Z'});
     if(path==='/rest/v1/trip_version_snapshots')return Response.json([{version:0,title:'Trip',content:{title:'Trip',days:[{id:'DAY',date:'2026-10-04',items:[{id:'Item-1',dayId:'DAY',title:'Current selected'}]}]}}]);
     if(path==='/rest/v1/trip_place_references')return Response.json([{id:id(5),reference_kind:'canonical',canonical_poi_id:id(1),freshness:'current'},{id:id(6),reference_kind:'canonical',canonical_poi_id:id(2),freshness:'current'}]);
     return Response.json([]);
   }
   return priorFetch(input,init);
 });
 const request=extra=>new NextRequest(`https://${host}/api/trips/native/v2/${trip}/traffic-observations`,{method:'POST',headers:{authorization:'Bearer '+f.token},body:JSON.stringify({...input,...extra})});
 policyAllowed=false;const denied=await foregroundTrafficHTTP(request(),trip,true);assert.equal(denied.status,200);assert.equal((await denied.json()).data.reason,'FIELD_RIGHTS_UNAVAILABLE');assert.equal(calls,0);
 policyAllowed=true;const response=await foregroundTrafficHTTP(request(),trip,true),result=await response.json();
 assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.data.status,'observed');assert.equal(result.data.traffic.status,'uncovered');assert.equal(result.data.receiptId,id(8));assert.equal(calls,5);
 assert.deepEqual(producer.filter(p=>p.params.p_action==='request').map(p=>p.params.p_input.requestIndex),[1,2,3,4,5]);
 assert.ok(!ownerCalls.some(p=>p.path.includes('consume_place_quota_v1')));assert.ok(ownerCalls.every(p=>p.authorization==='Bearer '+f.token));
 assert.equal((await foregroundTrafficHTTP(request({p_actor:{subject:'other'}}),trip,true)).status,400);
 assert.equal((await foregroundTrafficHTTP(request({expectedHeadVersion:1}),trip,true)).status,409);
 assert.equal(calls,5);
 policyAllowed=false;
 const webRequest=new NextRequest(`https://${host}/api/trips/${trip}/traffic-observations`,{method:'POST',headers:{cookie:f.cookie(),origin:`https://${host}`},body:JSON.stringify(input)});
 const web=await foregroundTrafficHTTP(webRequest,trip,false);assert.equal(web.status,200);assert.equal((await web.json()).data.reason,'FIELD_RIGHTS_UNAVAILABLE');assert.equal(calls,5);
 const crossOrigin=new NextRequest(`https://${host}/api/trips/${trip}/traffic-observations`,{method:'POST',headers:{cookie:f.cookie(),origin:'https://other.invalid'},body:JSON.stringify(input)});
 assert.equal((await foregroundTrafficHTTP(crossOrigin,trip,false)).status,400);
 const beforeContext=producer.length;
 const contextRequest=new NextRequest(`https://${host}/api/trips/native/v2/${trip}/traffic-observations/context`,{method:'POST',headers:{authorization:'Bearer '+f.token},body:JSON.stringify({expectedHeadVersion:0,dayId:'DAY',itemId:'Item-1',scope:null})});
 const context=await foregroundTrafficHTTP(contextRequest,trip,true,{},true),ctx=await context.json();
 assert.equal(context.status,200,JSON.stringify(ctx));assert.equal(ctx.data.kind,'foreground_traffic_context/1');assert.equal(ctx.data.references.length,2);
 assert.equal(ctx.data.references[0].referenceId,id(5));assert.equal(ctx.data.references[0].display,null);assert.equal(ctx.data.completeness.labels,'partial');
 assert.equal(ctx.data.stop.status,'unavailable');assert.equal(ctx.data.qualification,'not_granted_by_context');assert.equal(calls,5);assert.equal(producer.length,beforeContext);
});
