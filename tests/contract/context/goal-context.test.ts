import assert from "node:assert/strict";
import test from "node:test";
import { assembleGoalContext, ContextAssemblyError } from "../../../lib/server/context/index.ts";

const owner = "11111111-1111-4111-8111-111111111111";
const conversation = "22222222-2222-4222-8222-222222222222";
const goalId = "33333333-3333-4333-8333-333333333333";
const messageId = "44444444-4444-4444-8444-444444444444";
const memoryId = "55555555-5555-4555-8555-555555555555";
const memory = {
  id:memoryId, ownerId:owner, sourceReceiptId:"66666666-6666-4666-8666-666666666666",
  consentStatus:"granted" as const, state:"explicit" as const, constraintKind:"preference" as const,
  summary:"Prefer rail travel with fewer transfers.", updatedAt:"2026-09-27T00:00:00.000Z", revision:2,
};
const base = {
  actorId:owner, conversationId:conversation,
  goal:{id:goalId,scopeVersion:3,text:"Plan rail travel in China."},
  message:{id:messageId,sequence:5,goalId,scopeVersion:3,text:"Compare rail options.",taskId:null as null},
  selectedMemoryIds:[memoryId], memories:[memory],
};

test("goal context records exact goal and selected Memory versions without returning management text", () => {
  const result = assembleGoalContext(base);
  assert.equal(result.schemaVersion,"assistant-goal-context/1");
  assert.equal(result.goalScopeVersion,3);
  assert.equal(result.messageSequence,5);
  assert.equal(result.readyForProvider,false);
  assert.equal(result.selectedMemoryCount,1);
  assert.deepEqual(result.context.sourceRefs.filter(source => source.id.startsWith("memory:")),
    [{id:`memory:${memoryId}`,kind:"memory",sourceVersion:`revision:2:receipt:${memory.sourceReceiptId}`}]);
  assert.equal(result.context.sourceRefs.some(source => source.id === `goal:${goalId}` && source.sourceVersion === "scope:3"),true);
  assert.equal(JSON.stringify(result).includes(memory.summary),false);
  assert.equal(JSON.stringify(result).includes(owner),false);
  assert.equal(result.context.omittedReasons.includes("not_integrated:trip"),true);
  assert.equal(result.context.omittedReasons.includes("not_integrated:profile_recipient"),true);
});

test("only selected, relevant and currently retrievable Memory enters the manifest", () => {
  const irrelevant = {...memory,summary:"Use a larger font."};
  const noMatch = assembleGoalContext({...base,memories:[irrelevant]});
  assert.equal(noMatch.selectedMemoryCount,0);
  assert.equal(noMatch.context.omittedReasons.includes("not_relevant:memory"),true);
  assert.throws(() => assembleGoalContext({...base,memories:[{...memory,state:"paused" as const}]}),ContextAssemblyError);
  assert.throws(() => assembleGoalContext({...base,memories:[{...memory,consentStatus:"revoked" as const}]}),ContextAssemblyError);
  assert.throws(() => assembleGoalContext({...base,memories:[{...memory,ownerId:"77777777-7777-4777-8777-777777777777"}]}),ContextAssemblyError);
  assert.throws(() => assembleGoalContext({...base,memories:[{...memory,revision:0}]}),ContextAssemblyError);
});

test("hard constraints are retained only when explicitly selected and fit the fixed budget", () => {
  const hard = {...memory,constraintKind:"hard_constraint" as const,summary:"Avoid late-night arrivals."};
  const selected = assembleGoalContext({...base,memories:[hard]});
  assert.equal(selected.selectedMemoryCount,1);
  assert.equal(selected.context.sourceRefs.find(source => source.id === `memory:${memoryId}`)?.kind,"constraints");
  assert.throws(() => assembleGoalContext({...base,memories:[{...hard,summary:"x".repeat(500)}]}),ContextAssemblyError);
  assert.equal(assembleGoalContext({...base,selectedMemoryIds:[],memories:[hard]}).selectedMemoryCount,0);
});

test("scope, task, duplicate selections and oversized current input fail closed", () => {
  assert.throws(() => assembleGoalContext({...base,message:{...base.message,scopeVersion:2}}),ContextAssemblyError);
  assert.throws(() => assembleGoalContext({...base,message:{...base.message,taskId:memoryId as never}}),ContextAssemblyError);
  assert.throws(() => assembleGoalContext({...base,selectedMemoryIds:[memoryId,memoryId]}),ContextAssemblyError);
  assert.throws(() => assembleGoalContext({...base,goal:{...base.goal,text:"x".repeat(500)}}),ContextAssemblyError);
  assert.throws(() => assembleGoalContext({...base,message:{...base.message,text:"x".repeat(500)}}),ContextAssemblyError);
});
