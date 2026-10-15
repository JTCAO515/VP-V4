import test from 'node:test';import assert from 'node:assert/strict';
import {lifecycleExportSource} from '../../../lib/server/trip/lifecycle/export.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const address={text:'上海市\n一号',source:'user_provided',verification:'unverified'};
test('existing lifecycle export accepts exact user address and rejects unsupported shapes',async()=>{
 for(const value of [address,{...address,verification:'verified'},{...address,extra:true},{...address,text:'　'}]){
  const lease={requestId:id(1),ownerId:id(2),leaseId:id(3),generation:1,expiresAt:new Date(Date.now()+60000).toISOString()};
  const binding={requestId:lease.requestId,leaseId:lease.leaseId,generation:1};
  const lifecycle={tripId:id(4),title:'Saved',headVersion:1,state:'archived',archivedVersion:1,archivedAt:'2026-10-05T01:00:00Z'};
  const content={days:[{id:'d',date:'2026-10-16',items:[{id:'i',dayId:'d',title:'Visit',chineseAddress:value}]}]};
  const source=lifecycleExportSource(lease as never,async(action)=>action==='enroll'?{schemaVersion:'trip-lifecycle-export/2',...binding,sourceRevision:4,enrolled:true}:{schemaVersion:'trip-lifecycle-export/2',...binding,sourceRevision:4,section:'trips',items:[{tripId:id(4),title:'Saved',headVersion:1,confirmationState:'confirmed',content,lifecycle}],hasMore:false,nextCursor:null,sectionComplete:true});
  const signal=new AbortController().signal;await source.enroll(signal);
  if(value===address)assert.deepEqual(((await source.page('trips',null,50,signal)).items[0] as {content:unknown}).content,content);
  else await assert.rejects(()=>source.page('trips',null,50,signal),/unavailable/);
 }
});
