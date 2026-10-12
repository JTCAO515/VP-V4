import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { captureIdeaResultSource, matchesIdeaResultSource } from '../../../lib/server/journey-entry/idea-result/source.ts';
import { runIdeaResultModel } from '../../../lib/server/journey-entry/idea-result/model-adapter.ts';
import { projectIdeaResult } from '../../../lib/server/journey-entry/idea-result/result-projection.ts';
import { projectQualifiedIntakeComparison } from '../../../lib/server/artifacts/qualified-intake-comparison.ts';
import { createPlanningV2ModelOutputReceipt } from '../../../lib/server/turn/planning-v2-model-output-receipt.ts';
import { PROTOCOL_MODELS } from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';
import type { V2Lease } from '../../../lib/server/turn/planning-intake-worker-protocol.ts';
import type { PlanningV2ModelStepPorts } from '../../../lib/server/turn/planning-v2-model-step.ts';
function fixture() {
 const lease: V2Lease = { ownerId:randomUUID(),taskId:randomUUID(),turnId:randomUUID(),leaseToken:randomUUID(),artifactId:randomUUID(),planningPolicyId:randomUUID(),intakeContextDigest:'a'.repeat(64),planningContextDigest:'b'.repeat(64),source:{conversationId:randomUUID(),goalId:randomUUID(),goalVersion:3,messageId:randomUUID(),messageSequence:8,intakeRevision:2,memoryBasis:[]},environment:'local_synthetic',locale:'en' };
 const intake={schemaVersion:'stay-area-intake/1',city:'shanghai',comparisonTarget:'area_transport',durationDays:null,partySize:3,interests:['food'],pace:'relaxed',lodgingBudget:null,dates:{startDate:'2026-10-20',endDate:'2026-10-23'},mobilityConstraints:null};
 const qualified={version:5,kind:'travel_intake',schemaVersion:'assistant-travel-current-basis/1',...lease.source,sourceKind:'explicit_current_input',intake,contextDigest:lease.intakeContextDigest,readiness:{kind:'ready',scope:'transport_screening',unknown:['durationDays','lodgingBudget','mobilityConstraints']},readyForProvider:false};
 const read={kind:'planning_intake_input',schemaVersion:'planning-intake-context/2',ownerId:lease.ownerId,taskId:lease.taskId,turnId:lease.turnId,artifactId:lease.artifactId,planningPolicyId:lease.planningPolicyId,provider:'qwen',endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',goalText:'I want to explore Shanghai with my family; dates are flexible.',delegation:'Compare rail access only',planningActionBasis:'c'.repeat(64),qualifiedIntake:qualified,intakeContextDigest:lease.intakeContextDigest,planningContextDigest:lease.planningContextDigest,executionAvailable:false,readyForProvider:false};
 const place={schemaVersion:'planning-place/1',source:'synthetic_fixture',observedAt:new Date().toISOString(),providerCalls:0,areas:[{id:'jingan',label:"Jing'an Temple",railMinutes:24,transfers:1},{id:'peoples_square',label:"People's Square",railMinutes:12,transfers:0}]};
 const now=Date.parse(place.observedAt),binding={owner:lease.ownerId,task:lease.taskId,turn:lease.turnId,lease:lease.leaseToken,textPolicy:randomUUID(),planningPolicy:lease.planningPolicyId,scope:randomUUID(),attempt:randomUUID(),provider:'qwen' as const,model:PROTOCOL_MODELS.qwen,priceVersion:'synthetic-1',intakeDigest:lease.intakeContextDigest,planningDigest:lease.planningContextDigest};
 const source=captureIdeaResultSource(read,lease,place,now)!;
 const prepared=projectQualifiedIntakeComparison(qualified,{...lease.source,contextDigest:lease.intakeContextDigest},place,'en',now,'local_synthetic')!;
 const usageReceipt={schemaVersion:'validated-planning-usage/1',attempt:{scopeId:binding.scope,ownerId:binding.owner,taskId:binding.task,attemptId:binding.attempt,provider:'qwen',model:binding.model,priceVersion:binding.priceVersion,reservedMicros:10,timeoutMs:1000},turnId:binding.turn,policyId:binding.planningPolicy,usage:{inputTokens:12,outputTokens:8,totalTokens:20,cachedInputTokens:null,uncachedInputTokens:null,reasoningTokens:null,cost:'unknown'},actualMicros:5,observedAt:place.observedAt};
 const output=createPlanningV2ModelOutputReceipt({schemaVersion:'planning-v2-model-output/1',binding,usageReceipt,output:{highlight:'peoples_square'},observedAt:place.observedAt},binding)!;
 return {lease,read,intake,qualified,place,now,binding,source,prepared,output};
}
test('literal idea, known party and dates reach original payload unchanged; unknown duration stays null',()=>{
 const f=fixture();assert.ok(f.source);const p=JSON.parse(f.source.prompt);
 assert.equal(p.goal,f.read.goalText);assert.equal(p.delegation,f.read.delegation);assert.deepEqual(p.intake,f.intake);assert.equal(p.intake.durationDays,null);assert.equal(p.intake.partySize,3);assert.deepEqual(p.intake.dates,f.intake.dates);
 assert.equal(f.source.executionAvailable,false);assert.equal(f.source.scope,'transport_screening');assert.equal(Object.hasOwn(p.intake,'serviceIntent'),false);
 f.read.goalText='changed';f.intake.partySize=1;assert.notEqual(f.source.read.goalText,f.read.goalText);assert.equal(JSON.parse(f.source.prompt).intake.partySize,3);
});
test('foreign, stale, unknown fields, unsupported service and city cannot form a source',()=>{
 const f=fixture();for(const key of ['ownerId','taskId','turnId','artifactId','planningPolicyId'])assert.equal(captureIdeaResultSource({...f.read,[key]:randomUUID()},f.lease,f.place,f.now),null,key);
 for(const key of ['conversationId','goalId','messageId'])assert.equal(captureIdeaResultSource({...f.read,qualifiedIntake:{...f.qualified,[key]:randomUUID()}},f.lease,f.place,f.now),null,key);
 for(const key of ['goalVersion','messageSequence','intakeRevision'])assert.equal(captureIdeaResultSource({...f.read,qualifiedIntake:{...f.qualified,[key]:999}},f.lease,f.place,f.now),null,key);
 for(const intake of [{...f.intake,serviceIntent:'booking'},{...f.intake,city:null},{...f.intake,comparisonTarget:null},{...f.intake,comparisonTarget:'lodging_budget_filter'}])assert.equal(captureIdeaResultSource({...f.read,qualifiedIntake:{...f.qualified,intake}},f.lease,f.place,f.now),null);
 assert.equal(captureIdeaResultSource({...f.read,extra:true},f.lease,f.place,f.now),null);assert.equal(captureIdeaResultSource(f.read,f.lease,f.place,f.now+300001),null);
 assert.equal(matchesIdeaResultSource({...f.read,goalText:'different but unchanged digest'},f.source),false);
 assert.equal(matchesIdeaResultSource({...f.read,qualifiedIntake:{...f.qualified,intake:{...f.intake,partySize:4}}},f.source),false);
});
test('real selection affects option order while original factual prose and no actions remain; none keeps order',()=>{
 const f=fixture(),p=projectIdeaResult(f.source,f.prepared,f.output,f.binding,f.now);assert.ok(p);assert.deepEqual(p.content.options.map(x=>x.id),['peoples_square','jingan']);assert.equal(p.readyForPublication,false);assert.equal(p.content.summary,f.prepared.content.summary);assert.deepEqual(p.content.actions,[]);
 for(const option of p.content.options)assert.deepEqual(option,f.prepared.content.options.find(x=>x.id===option.id));
 const none=createPlanningV2ModelOutputReceipt({schemaVersion:f.output.schemaVersion,binding:f.binding,usageReceipt:f.output.usageReceipt,output:{highlight:'none'},observedAt:f.output.observedAt},f.binding)!;
 assert.deepEqual(projectIdeaResult(f.source,f.prepared,none,f.binding,f.now)!.content.options,f.prepared.content.options);
 assert.equal(projectIdeaResult(f.source,{...f.prepared,content:{...f.prepared.content,summary:'Perfect lodging for three travellers'}},f.output,f.binding,f.now),null);
 assert.equal(projectIdeaResult(f.source,f.prepared,{...f.output,outputDigest:'f'.repeat(64)},f.binding,f.now),null);
 assert.equal(projectIdeaResult(f.source,f.prepared,f.output,{...f.binding,task:randomUUID()},f.now),null);
 assert.equal(projectIdeaResult(f.source,f.prepared,f.output,f.binding,f.now+300001),null);
 const original={...f.binding,lease:randomUUID()};const recovered=createPlanningV2ModelOutputReceipt({schemaVersion:f.output.schemaVersion,binding:original,usageReceipt:f.output.usageReceipt,output:f.output.output,observedAt:f.output.observedAt},original)!;assert.ok(projectIdeaResult(f.source,f.prepared,recovered,original,f.now),'reclaimed current lease does not invalidate the original settled attempt receipt');
});
function modelFixture(mode:'normal'|'stale_before'|'denied'|'late'|'abort'='normal') {
 const f=fixture();let reads=0,sends=0,saved:typeof f.output|null=null;const events:string[]=[];const abort=new AbortController();
 const ports:PlanningV2ModelStepPorts={read:async()=>{reads++;return mode==='stale_before'&&reads>=2||mode==='late'&&saved?{...f.read,goalText:'replacement'}:f.read;},authorize:async(effect,b)=>mode==='denied'?{kind:'blocked'}:{schemaVersion:'planning-v2-effect-authority/1',kind:'authorized',effect,binding:b},bindReserved:async b=>({kind:'model_attempt_binding',schemaVersion:'planning-v2-model-binding/1',ownerId:b.owner,taskId:b.task,turnId:b.turn,textPolicyId:b.textPolicy,planningPolicyId:b.planningPolicy,scopeId:b.scope,attemptId:b.attempt,provider:b.provider,model:b.model,priceVersion:b.priceVersion,intakeContextDigest:b.intakeDigest,planningContextDigest:b.planningDigest,ledgerStatus:'reserved',reservedMicros:10,actualMicros:null,unknown:false,reused:false,executionAllowed:false,executionAvailable:false,readyForProvider:false}),budgetForAttempt:()=>async(name)=>{events.push(name);return name==='reserve_model_budget'?{kind:'reserved'}:name==='dispatch_model_budget'?{kind:'dispatched'}:{kind:'settled',overrun:false};},transportForAttempt:()=>async request=>{sends++;const p=JSON.parse(JSON.parse(request.body).messages[1].content);assert.equal(p.goal,f.read.goalText);assert.equal(p.intake.partySize,3);assert.deepEqual(p.intake.dates,f.intake.dates);if(mode==='abort')abort.abort();return Response.json({model:PROTOCOL_MODELS.qwen,choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:'{"highlight":"peoples_square"}'}}],usage:{prompt_tokens:12,completion_tokens:8,total_tokens:20}});},price:()=>5,recordUsage:async()=>{},persistOutput:async o=>{saved=o;return {kind:'output_recorded',binding:o.binding,outputDigest:o.outputDigest,usageDigest:o.usageDigest};},readOutput:async()=>{throw Error('not needed');}};
 const input={enabled:true,lease:f.lease,binding:f.binding,reservedMicros:10,timeoutMs:1000,maxOutputTokens:128,observation:f.place,observedNow:f.now};
 return {f,ports,input,abort,events,get sends(){return sends;}};
}
test('adapter runs original protocol with exact literal/intake; disabled, stale and denied do no sends',async()=>{
 const f=modelFixture();assert.equal((await runIdeaResultModel(f.input,f.ports,f.abort.signal)).kind,'settled');assert.equal(f.sends,1);assert.ok(f.events.includes('finish_model_budget'));
 for(const mode of ['stale_before','denied'] as const){const x=modelFixture(mode);assert.equal((await runIdeaResultModel(x.input,x.ports,x.abort.signal)).kind,'blocked');assert.equal(x.sends,0);}
 const off=modelFixture();assert.equal((await runIdeaResultModel({...off.input,enabled:false},off.ports,off.abort.signal)).kind,'disabled');assert.equal(off.sends,0);assert.deepEqual(off.events,[]);
});
test('settled late response preserves accounted receipt but never qualifies current result; abort never returns current source',async()=>{
 const f=modelFixture('late'),r=await runIdeaResultModel(f.input,f.ports,f.abort.signal);assert.equal(r.kind,'stale');assert.equal(f.sends,1);assert.ok('output' in r);assert.equal('source' in r,false);
 const x=modelFixture('abort'),a=await runIdeaResultModel(x.input,x.ports,x.abort.signal);assert.notEqual(a.kind,'settled');assert.equal('source' in a,false);assert.equal(x.sends,1);
});
