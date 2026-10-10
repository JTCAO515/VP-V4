import test from 'node:test';
import assert from 'node:assert/strict';
import { directions, relativePlan, editRelativeDays, bindRelativeDates } from '../../../../lib/server/planning/directions/domain.ts';
import { applyPatch } from '../../../../lib/server/trip/patch/contract.ts';
const input = { destinations: ['上海', '北京'], durationDays: 10, interests: ['吃', '散步'], currentPace: null, budgetMinorUnits: null, intent: 'explore', locale: 'zh' };
test('ten days and all user destinations survive; unknown dates and budget do not block', () => {
 const p=relativePlan(input,'depth'); assert.equal(p.days.length,10); assert.deepEqual([...new Set(p.days.map(d=>d.destination))],input.destinations); assert.equal(p.coverage,'complete_relative'); assert.ok(p.limitations[0].includes('未核实')); assert.equal('date' in p.days[0],false);
 assert.equal(relativePlan({...input,durationDays:null},'depth').coverage,'partial_relative');
 assert.throws(()=>relativePlan({...input,durationDays:31},'depth'),/INVALID_INPUT/);
});
test('explicit purpose returns one direction; alternative changes allocation with honest tradeoff',()=>{
 assert.equal(directions({...input,intent:'specific'}).length,1);
 assert.equal(relativePlan(input,'depth').days[0].activities.length,1); assert.equal(relativePlan(input,'breadth').days[0].activities.length,2);
 const p=relativePlan({...input,destinations:['A','B','C'],durationDays:2},'depth'); assert.equal(p.coverage,'partial_relative'); assert.ok(p.limitations.some(l=>l.includes('C')));
});
test('only task-qualified Profile pace is read; current request takes precedence',()=>{
 const profile={schemaVersion:'task-travel-pace/1',tripId:'trip',travelPace:'relaxed',source:'profile',sourceRevision:2,sourceOperationId:'operation',purpose:'local_trip_planning'};
 assert.equal(relativePlan(input,'breadth','trip',profile).days[0].activities.length,1);
 assert.throws(()=>relativePlan(input,'depth','other',profile),/INVALID_PREFERENCE/);
 assert.throws(()=>relativePlan(input,'depth','trip',{...profile,purpose:'server_planning'}),/INVALID_PREFERENCE/);
 assert.equal(relativePlan({...input,currentPace:'packed'},'depth','trip',profile).paceSource,'current_input');
});
test('local edit preserves untouched objects; date binding only appends and conflict rejects',()=>{
 const p=relativePlan(input,'depth'); const edited=editRelativeDays(p,[{ordinal:2,destination:'上海',activities:['用户指定主题']}]); assert.equal(edited.days[0],p.days[0]); assert.equal(edited.days[2],p.days[2]);
 const trip={version:3,title:'Existing',days:[{id:'old',date:'2026-10-01',items:[{id:'old_item',dayId:'old',title:'Keep'}]}]}; const patch=bindRelativeDates(edited,trip,'2026-11-01','draft'); const preview=applyPatch(trip,patch); assert.deepEqual(preview.days[0],trip.days[0]); assert.equal(preview.title,'Existing'); assert.equal(patch.expectedVersion,3); assert.equal(trip.days.length,1); assert.equal(patch.operations.some(o=>'startsAt' in o||'endsAt' in o||o.kind.startsWith('delete')),false);
 assert.throws(()=>bindRelativeDates(p,trip,'2026-10-01','draft'),/TRIP_DAY_CONFLICT/); assert.throws(()=>bindRelativeDates(p,trip,'2026-02-30','draft'),/INVALID_BINDING/);
});

test('mutation boundaries reject injected dated fields, oversized activities and malformed ordinal',()=>{
 const p=relativePlan(input,'depth'); const trip={version:0,title:'Trip',days:[]};
 for(const bad of [{...p,actions:['confirm']},{...p,days:[{...p.days[0],date:'2026-11-01'},...p.days.slice(1)]},{...p,days:[{...p.days[0],ordinal:2},...p.days.slice(1)]},{...p,days:[{...p.days[0],activities:['x'.repeat(161)]},...p.days.slice(1)]}]) {
  assert.throws(()=>editRelativeDays(bad,[p.days[0]]),/INVALID_RELATIVE_PLAN/);
  assert.throws(()=>bindRelativeDates(bad,trip,'2026-11-01','draft'),/INVALID_RELATIVE_PLAN/);
 }
 assert.throws(()=>bindRelativeDates(relativePlan({...input,durationDays:null},'depth'),trip,'2026-11-01','draft'),/INVALID_BINDING/);
});

test('exploration alternatives remain distinct for one interest, no interest and explicit relaxed pace',()=>{
 for(const patch of [{interests:['food']},{interests:[]},{currentPace:'relaxed'}]){
  const current={...input,...patch};const a=relativePlan(current,'depth'),b=relativePlan(current,'breadth');
  assert.notDeepEqual(a.days.map(d=>d.activities),b.days.map(d=>d.activities));
  if(current.interests.length===0)assert.ok(a.limitations.some(l=>l.includes('兴趣')));
 }
});
