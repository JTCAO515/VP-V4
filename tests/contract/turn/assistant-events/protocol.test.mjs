import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeAssistantEvents, assistantEventFrames, assistantReplayCursor } from '../../../../lib/server/turn/assistant-events/protocol.ts';
import { boundedAssistantReplayResponse } from '../../../../lib/server/turn/assistant-events/transport.ts';
const conversation='22222222-2222-4222-8222-222222222222',task='33333333-3333-4333-8333-333333333333';
const event=(sequence=1)=>({eventId:`${conversation}:${sequence}`,sequence,taskId:task,turnId:task,type:'task_status',status:'planning'});
const page=(events=[event()],after=0,hasMore=false)=>({kind:'assistant_events',schemaVersion:'assistant-events/1',conversationId:conversation,afterSequence:after,lastSequence:events.at(-1)?.sequence??after,hasMore,events});
test('durable pages resume without process state and no checkpoint cursor id',()=>{
 const first=decodeAssistantEvents(page(Array.from({length:50},(_,i)=>event(i+1)),0,true),conversation,0);
 const next=decodeAssistantEvents(page([event(51)],50),conversation,50);
 assert.equal(first.lastSequence,50);assert.equal(next.lastSequence,51);
 const frames=assistantEventFrames(next);assert.match(frames,/^id: 51\nevent: assistant/);
 assert.equal((frames.match(/^id:/gm)||[]).length,1);
 assert.match(frames,/event: checkpoint\ndata: .*"afterSequence":51,"hasMore":false/);
 assert.equal(decodeAssistantEvents(page([],51),conversation,51).lastSequence,51);
});
test('original decimal cursor semantics reject conflicting transport syntax',()=>{
 for(const v of ['-1','01','1.0','NaN','1000000000000000','1\n','1:2',''])assert.throws(()=>assistantReplayCursor(v));
 assert.equal(assistantReplayCursor(null),0);assert.equal(assistantReplayCursor('999999999999999'),999999999999999);
});
test('whole page fails before serialization for gaps, duplicates, private keys and foreign IDs',()=>{
 for(const events of [[event(2)],[event(),event()],[{...event(),eventId:'foreign:1'}],[{...event(),privatePrompt:'secret'}],[{...event(),status:'paid'}],[{...event(),taskId:'invalid'}]])assert.throws(()=>decodeAssistantEvents(page(events),conversation,0));
 for(const value of [{...page(),lastSequence:2},{...page(),hasMore:true},{...page(),conversationId:task},{...page(),prompt:'private'},page(Array.from({length:51},(_,i)=>event(i+1)))])assert.throws(()=>decodeAssistantEvents(value,conversation,0));
});
test('artifact hints cannot claim current or resurrect invalidation; progress is closed original metadata',()=>{
 const base={eventId:`${conversation}:1`,sequence:1,taskId:task,turnId:task};
 for(const type of ['artifact_ready','artifact_updated','artifact_invalidated']){
  const e={...base,type,artifactId:task,revision:1,availability:'unavailable'};
  assert.equal(decodeAssistantEvents(page([e]),conversation,0).events[0].availability,'unavailable');
  assert.throws(()=>decodeAssistantEvents(page([{...e,availability:'current'}]),conversation,0));
  if(type==='artifact_invalidated')assert.throws(()=>decodeAssistantEvents(page([{...e,availability:'recheck'}]),conversation,0));
 }
 const progress={...base,type:'task_progress',tool:'place.read',state:'unknown'};
 assert.equal(decodeAssistantEvents(page([progress]),conversation,0).events[0].state,'unknown');
 for(const p of [{...progress,tool:'payment'},{...progress,state:'settled'},{...progress,lease:'private'},{...progress,tool:['place.read']},{...progress,state:['unknown']}])assert.throws(()=>decodeAssistantEvents(page([p]),conversation,0));
});

test('RPC bytes bounded before SDK parses even unknown field and missing content length',async()=>{
 for(const headers of [{},{'content-length':'65537'}])await assert.rejects(()=>boundedAssistantReplayResponse(new Response('x'.repeat(65537),{headers})));
 const response=await boundedAssistantReplayResponse(Response.json({kind:'unavailable'}));assert.deepEqual(await response.json(),{kind:'unavailable'});
});
