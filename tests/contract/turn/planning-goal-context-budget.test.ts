import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assembleGoalContext,createPlanningGoalContextPlan} from '../../../lib/server/context/goal-context.ts';
import {createContextPlan} from '../../../lib/server/context/context-plan.ts';
const actor='11111111-1111-4111-8111-111111111111',goal='22222222-2222-4222-8222-222222222222';
const demo='First China visit, ten days with partner, food and photography, relaxed pace.';
const input=(text=demo)=>({actorId:actor,conversationId:'33333333-3333-4333-8333-333333333333',goal:{id:goal,scopeVersion:1,text},message:{id:'44444444-4444-4444-8444-444444444444',sequence:2,goalId:goal,scopeVersion:1,text:'Compare Shanghai stay areas',taskId:null as null},selectedMemoryIds:[],memories:[]});
test('natural planning goal retains its complete unconfirmed source within the existing total budget',t=>{
 const base=createContextPlan({taskProfile:'trip_planning',riskClass:'elevated'}),total=Object.values(base.policy.tokenBudgets).reduce((a,b)=>a+b,0);
 t.diagnostic(JSON.stringify({goal:demo,goalCharacters:Array.from(demo).length,markerCharacters:Array.from('Current goal (unconfirmed): ').length,renderedCharacters:Array.from('Current goal (unconfirmed): '+demo).length,baseBudgets:base.policy.tokenBudgets,total}));
 const result=assembleGoalContext(input(),"planning_worker");
 assert.equal(result.readyForProvider,false);assert.equal(result.context.contextVersion,"planning-goal-context-plan-v1");assert.equal(result.context.sectionTokenCounts.thread,105);assert.ok(result.context.contentHashes.includes(createHash("sha256").update("Current goal (unconfirmed): "+demo).digest("hex")));assert.ok(result.context.sourceRefs.some(r=>r.id==='goal:'+goal));
});

test('planning formatting profile preserves total and every other allocation and rejects new integrated sources',()=>{
 const base=createContextPlan({taskProfile:'trip_planning',riskClass:'elevated'}),plan=createPlanningGoalContextPlan(['system','policy','constraints','thread','user_message']);
 assert.equal(Object.values(plan.policy.tokenBudgets).reduce((a,b)=>a+b,0),1420);assert.equal(plan.policy.tokenBudgets.trip,152);assert.equal(plan.policy.tokenBudgets.thread,128);
 for(const key of base.sectionOrder.filter(k=>k!=='trip'&&k!=='thread'))assert.equal(plan.policy.tokenBudgets[key],base.policy.tokenBudgets[key]);
 for(const key of ['allowedSources','requiredSources','maxToolDefinitions','maxEvidenceItems','includeRawUserArtifact','compactionVersion'] as const)assert.deepEqual(plan.policy[key],base.policy[key]);
 assert.deepEqual(plan.sectionOrder,base.sectionOrder);assert.ok(Object.isFrozen(plan.policy.tokenBudgets));assert.equal(base.policy.tokenBudgets.thread,100);assert.equal(base.policy.tokenBudgets.trip,180);
 for(const kind of ['trip','proposal','evidence','tool'] as const)assert.throws(()=>createPlanningGoalContextPlan(['system',kind]),/cannot integrate/);
});
test('exact payload boundary retains all text and does not truncate a too-long goal or message',()=>{
 const text='x'.repeat(100),r=assembleGoalContext(input(text),'planning_worker');assert.equal(r.context.sectionTokenCounts.thread,128);assert.ok(r.context.contentHashes.includes(createHash('sha256').update('Current goal (unconfirmed): '+text).digest('hex')));
 assert.throws(()=>assembleGoalContext(input('x'.repeat(101)),'planning_worker'),/bounded context budget/);
 assert.throws(()=>assembleGoalContext({...input(),message:{...input().message,text:'x'.repeat(161)}},'planning_worker'),/Missing required source/);
 assert.throws(()=>assembleGoalContext(input('x'.repeat(4001)),'planning_worker'),/Invalid goal context scope/);
});
test('default preview remains unchanged and unknown server profile never selects a larger budget',()=>{
 const short=input('Compare rail options.');assert.deepEqual(assembleGoalContext(short),assembleGoalContext(short,'default'));assert.equal(assembleGoalContext(short).context.contextVersion,'context-plan-v1');
 assert.throws(()=>assembleGoalContext(input()),/bounded context budget/);
 for(const profile of ['client_requested','planning_worker/2',null,{}])assert.throws(()=>assembleGoalContext(input(),profile as never),/Unknown goal context budget profile/);
});
test('planning profile retains source scope, Memory eligibility and complete hard-constraint guards',()=>{
 const id='55555555-5555-4555-8555-555555555555',memory={id,ownerId:actor,sourceReceiptId:'66666666-6666-4666-8666-666666666666',consentStatus:'granted' as const,state:'explicit' as const,constraintKind:'preference' as const,summary:'Food preferences',updatedAt:'2026-10-03T00:00:00.000Z',revision:1};
 const request={...input(),selectedMemoryIds:[id],memories:[memory]};assert.equal(assembleGoalContext(request,'planning_worker').selectedMemoryCount,1);
 for(const changed of [{...memory,consentStatus:'revoked' as const},{...memory,state:'paused' as const},{...memory,ownerId:goal},{...memory,revision:0}])assert.throws(()=>assembleGoalContext({...request,memories:[changed]},'planning_worker'));
 assert.throws(()=>assembleGoalContext({...request,memories:[{...memory,constraintKind:'hard_constraint' as const,summary:'x'.repeat(500)}]},'planning_worker'),/Complete eligible constraints/);
 assert.throws(()=>assembleGoalContext({...input(),message:{...input().message,scopeVersion:2}},'planning_worker'),/Invalid goal context scope/);
 assert.throws(()=>assembleGoalContext({...input(),message:{...input().message,goalId:actor}},'planning_worker'),/Invalid goal context scope/);
 assert.throws(()=>assembleGoalContext({...input(),goal:{...input().goal,text:''}},'planning_worker'),/Invalid goal context scope/);
});
