import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeAssistantEvents,assistantEventFrames} from '../../../../lib/server/turn/assistant-events/protocol.ts';
const conversation='22222222-2222-4222-8222-222222222222',task='33333333-3333-4333-8333-333333333333';
const retirement=(sequence,retiredSequence=sequence)=>({eventId:conversation+':'+sequence,sequence,type:'source_retired',retiredSequence});
const live=sequence=>({eventId:conversation+':'+sequence,sequence,type:'task_status',taskId:task,turnId:task,status:'accepted'});
const page=(events,after=0,hasMore=false)=>({kind:'assistant_events',schemaVersion:'assistant-events/1',conversationId:conversation,afterSequence:after,lastSequence:events.at(-1)?.sequence??after,hasMore,events});
const decode=(events,after=0,hasMore=false)=>decodeAssistantEvents(page(events,after,hasMore),conversation,after);

test('scrubbed ordinal and later notice have exact metadata-free wire; deleted anchor keeps contiguous delivery',()=>{
 const initial=decode([retirement(1),live(2),retirement(3,1)]);
 const resumed=decode([live(2),retirement(3,1)],1);
 assert.equal(initial.lastSequence,3);assert.equal(resumed.lastSequence,3);
 assert.deepEqual(Object.keys(initial.events[0]).sort(),['eventId','sequence','type','retiredSequence'].sort());
 const text=assistantEventFrames(decode([retirement(3,1)],2));
 assert.match(text,/^id: 3\nevent: assistant/);assert.match(text,/"retiredSequence":1/);
 assert.doesNotMatch(text,/taskId|turnId|artifactId|revision|reason|status|sourceKey/);
});
test('lost mixed page repeats stable IDs; retirement references can repeat without new source identity',()=>{
 const events=Array.from({length:50},(_,i)=>i%2?live(i+1):retirement(i+1));
 const first=decode(events,0,true);assert.deepEqual(decode(events,0,true),first);
 const tail=decode([retirement(51,1),retirement(52,1),live(53)],50);
 assert.equal(tail.lastSequence,53);assert.equal(tail.events[0].retiredSequence,tail.events[1].retiredSequence);
 assert.notEqual(tail.events[0].eventId,tail.events[1].eventId);
 assert.throws(()=>decode([retirement(52,1)],50),'no retirement-based jump');
 assert.throws(()=>decode([retirement(51,1),retirement(51,1)],50),'duplicate sequence is not a page');
});
test('unknown/partial retirement or nullable live references reject the whole page before IDs',()=>{
 for(const field of ['taskId','turnId','artifactId','revision','rawTuple','reason','time','status','tool','state']){
  for(const value of [null,'private'])assert.throws(()=>decode([live(1),{...retirement(2,1),[field]:value}]));
 }
 for(const retiredSequence of [0,-1,3,1.5,'1',null,NaN,Infinity,1000000000000000])assert.throws(()=>decode([{...retirement(2,1),retiredSequence}],1));
 assert.throws(()=>decode([{...retirement(1),type:'retired_unknown'}]));
 for(const taskId of [null,undefined])assert.throws(()=>decode([{...live(1),taskId}]));
 assert.throws(()=>decode([{...live(1),retiredSequence:1}]));
});
