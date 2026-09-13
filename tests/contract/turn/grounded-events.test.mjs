import test from 'node:test';
import assert from 'node:assert/strict';
import {groundedEventFrames} from '../../../lib/server/turn/grounded-events.ts';
const id='30000000-0000-4000-8000-000000000001';
const turn={kind:'grounded_turn',schemaVersion:'grounded-turn/1',turnId:id,status:'completed',result:{projection:'current',knowledge:{statements:[{text:'Atomic 中英 card'}]}}};
const accepted={eventId:'accepted',sequence:1,type:'accepted',state:'accepted'};
const terminal={eventId:'worker-terminal-2',sequence:2,type:'terminal',state:'completed'};
const snapshot=(events=[accepted,terminal],value=turn)=>({kind:'grounded_events',schemaVersion:'grounded-events/1',turn:value,events,lastSequence:2});
test('canonical terminal frame contains one whole card; reconnect restores current projection without a new event',()=>{
 const a=groundedEventFrames(snapshot(),id,0);
 const frames=a.text.trim().split('\n\n');assert.equal(frames.length,2);
 const card=JSON.parse(frames[1].split('\ndata: ')[1]);assert.deepEqual(card.turn,turn);assert.equal(card.eventId,terminal.eventId);assert.equal(a.cursor,2);assert.equal(a.terminal,true);
 const replay=groundedEventFrames(snapshot([terminal]),id,1);assert.equal(replay.text,frames[1]+'\n\n');
 const refresh=groundedEventFrames(snapshot([], {...turn,result:{projection:'unavailable',knowledge:null}}),id,2);
 assert.match(refresh.text,/event: projection/);assert.ok(!refresh.text.includes('id: '));assert.ok(!refresh.text.includes('Atomic'));assert.equal(refresh.cursor,2);
});
test('invalid ownership envelope, cursor and terminal combinations cannot be encoded',()=>{
 for(const value of [snapshot([terminal,accepted]),snapshot([{...terminal,sequence:1}]),snapshot([{...terminal,state:'accepted'}]),snapshot([terminal],{...turn,turnId:'foreign'}),snapshot([accepted],{...turn,status:'accepted'}),snapshot([{...terminal,extra:'secret'}])])assert.throws(()=>groundedEventFrames(value,id,0));
 assert.throws(()=>groundedEventFrames(snapshot(),id,1));
 assert.throws(()=>groundedEventFrames(snapshot([]),id,3));
});

test('unfinished cancelled and failed work ends replay without inventing a terminal event or cursor',()=>{
 for(const status of ['cancelled','failed']){
  const value={...turn,status,outcome:null,output:null,result:{projection:'pending',completedAt:null,intent:null,requestScope:null,originalOutcome:null,knowledge:null}};
  for(const after of [0,1]){
   const result=groundedEventFrames({...snapshot(after?[]:[accepted],value),lastSequence:1},id,after);
   assert.equal(result.terminal,true);assert.equal(result.cursor,1);assert.match(result.text,/event: projection/);
   assert.ok(!result.text.includes('heartbeat'));assert.ok(!result.text.includes('"type":"terminal"'));
   const frame=result.text.split('event: projection\ndata: ')[1];assert.deepEqual(JSON.parse(frame),{schemaVersion:'grounded-events/1',turnId:id,afterSequence:1,turn:value});
  }
  for(const patch of [{status:'completed'},{output:'invented'},{outcome:'answered'},...['completedAt','intent','requestScope','originalOutcome','knowledge'].map(key=>({result:{...value.result,[key]:'invented'}})),{result:{...value.result,projection:'current'}}]){
   assert.throws(()=>groundedEventFrames({...snapshot([accepted],{...value,...patch}),lastSequence:1},id,0));
  }
  assert.throws(()=>groundedEventFrames(snapshot([accepted,terminal],value),id,0));
 }
});
