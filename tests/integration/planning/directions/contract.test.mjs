import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDirectionsIntake, parseTravelDirectionsContent, relativePlanForIntake } from '../../../../lib/server/planning/directions/contract.ts';
import { directions, } from '../../../../lib/server/planning/directions/domain.ts';
const intake={schemaVersion:'travel-directions-intake/1',destinations:['上海','北京'],durationDays:10,interests:['food','walk'],currentPace:null,budget:null,dates:null,intent:'explore'};
const content=()=>({schemaVersion:'travel-directions/1',title:'Directions',summary:'Relative ideas; feasibility unknown',intake,directions:directions({destinations:intake.destinations,durationDays:10,interests:intake.interests,currentPace:null,budgetMinorUnits:null,intent:'explore',locale:'en'}),selectedDirectionId:'depth',draft:relativePlanForIntake(intake,'en','depth'),actions:[]});
test('closed content supports unknown dates and complete ten-day allocation; empty unknown draft is saveable',()=>{
 assert.ok(parseDirectionsIntake(intake));assert.ok(parseTravelDirectionsContent(content()));
 const i={...intake,durationDays:null,destinations:[]}; const c={...content(),intake:i,draft:relativePlanForIntake(i,'en','depth')};assert.equal(c.draft.days.length,0);assert.ok(parseTravelDirectionsContent(c));
});
test('intake rejects invalid calendars, inclusive duration mismatch, budgets and extraneous authority',()=>{
 for(const bad of [{...intake,ownerId:'other'},{...intake,durationDays:31},{...intake,budget:{currency:'CNY',totalMinorUnits:0}},{...intake,dates:{startDate:'2026-02-30',endDate:'2026-03-11'}},{...intake,dates:{startDate:'2026-11-01',endDate:'2026-11-11'}}])assert.equal(parseDirectionsIntake(bad),null);
 assert.ok(parseDirectionsIntake({...intake,dates:{startDate:'2026-11-01',endDate:'2026-11-10'}}));
});
test('draft rejects calendar injection, unknown options, false current preference and fabricated dispatch grants',()=>{
 const c=content();for(const bad of [{...c,readyForProvider:true},{...c,actions:['confirm']},{...c,selectedDirectionId:'unknown'},{...c,draft:{...c.draft,days:c.draft.days.map((d,i)=>i?d:{...d,date:'2026-11-01'})}},{...c,draft:{...c.draft,pace:'packed',paceSource:'current_input'}},{...c,draft:{...c.draft,days:c.draft.days.slice(0,7)}}])assert.equal(parseTravelDirectionsContent(bad),null);
 assert.equal(parseTravelDirectionsContent({...c,intake:{...intake,intent:'specific'}}),null);
});
