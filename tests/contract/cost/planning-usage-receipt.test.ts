import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID as uuid} from "node:crypto";
import {validatedUsageReceipt,validatedPlanningUsageReceipt} from "../../../lib/server/model-gateway/budget/usage-receipt.ts";

function fixture(){const taskId=uuid(),turnId=uuid(),policyId=uuid();return {binding:{taskId,turnId,planningPolicyId:policyId},
  raw:{schemaVersion:"validated-planning-usage/1",turnId,policyId,attempt:{scopeId:uuid(),ownerId:uuid(),taskId,attemptId:uuid(),
    provider:"qwen",model:"qwen3.7-plus-2026-05-26",priceVersion:"fixture-v1",reservedMicros:1000,timeoutMs:1000},
    usage:{inputTokens:20,outputTokens:10,totalTokens:30,cachedInputTokens:null,uncachedInputTokens:null,reasoningTokens:null,cost:"unknown"},
    actualMicros:1,observedAt:new Date().toISOString()}};}
test("planning receipt preserves SQL-captured ServiceTask, Turn and planning policy separately",()=>{
  const {raw,binding}=fixture(),r=validatedPlanningUsageReceipt(raw,binding);
  assert.equal(r.attempt.taskId,binding.taskId);assert.equal(r.turnId,binding.turnId);assert.equal(r.policyId,binding.planningPolicyId);
  assert.throws(()=>validatedUsageReceipt(raw));
  assert.throws(()=>validatedUsageReceipt({...raw,schemaVersion:"validated-model-usage/1"}),"v1 still denies cross-Task binding");
  assert.equal(validatedUsageReceipt({...raw,schemaVersion:"validated-model-usage/1",attempt:{...raw.attempt,taskId:raw.turnId}}).attempt.taskId,raw.turnId);
});
test("planning receipt rejects wrong binding, collision, extra fields and unknown accounting",()=>{
  const {raw,binding}=fixture();
  for(const [value,scope] of [[{...raw,text:"private"},binding],[{...raw,actualMicros:null},binding],
    [{...raw,usage:{...raw.usage,totalTokens:99}},binding],[{...raw,policyId:uuid()},binding],
    [raw,{...binding,taskId:uuid()}],[raw,{...binding,planningPolicyId:uuid()}],
    [{...raw,attempt:{...raw.attempt,taskId:raw.turnId}},{...binding,taskId:raw.turnId}]])assert.throws(()=>validatedPlanningUsageReceipt(value,scope as typeof binding));
});
