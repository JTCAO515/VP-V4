import assert from "node:assert/strict";
import test from "node:test";
import { CostGuard } from "../../../lib/server/model-gateway/budget/index.ts";
import { invokePlanningComparisonProtocol, PROTOCOL_MODELS } from "../../../lib/server/model-gateway/adapters/provider-protocol.ts";
import { parsePlanningSelection } from "../../../lib/server/model-gateway/prompt/planning-comparison.ts";
import { readShanghaiStayAreaRoutes } from "../../../lib/server/tools/planning-place-read.ts";

test("model selection is a closed enum with no model-authored facts or actions", () => {
  assert.deepEqual(parsePlanningSelection({ highlight:"jingan" }),{ highlight:"jingan" });
  for(const value of [{ highlight:"jingan",hotelAvailable:true },{ highlight:"hotel_booking" },
    { highlight:"none",url:"https://example.test" },"jingan",null]) assert.equal(parsePlanningSelection(value),null);
});

test("planning provider egress requires fresh authorization and validates usage and selection", async () => {
  const makeGuard=()=>{const value=new CostGuard({windowMs:120000,perUserAttempts:2,perTaskAttempts:2,
    turnDeadlineMs:120000,maxModelSteps:1,maxToolSteps:1}).startTurn({userId:"owner",taskId:"task"});
    assert.equal(value.kind,"turn");return value.kind==="turn"?value:assert.fail();};
  const input={requestId:"lease-1",text:"Current authorized goal and two observed routes"};
  const binding={provider:"qwen" as const,endpoint:"https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    maxOutputTokens:128,timeoutMs:1000};
  let calls=0;
  const transport=async()=>{calls++;return Response.json({model:PROTOCOL_MODELS.qwen,
    choices:[{index:0,finish_reason:"stop",message:{role:"assistant",content:'{"highlight":"peoples_square"}'}}],
    usage:{prompt_tokens:12,completion_tokens:8,total_tokens:20}});};
  const denied=await invokePlanningComparisonProtocol(input,binding,async()=>false,makeGuard(),transport,new AbortController().signal);
  assert.equal(denied.kind,"unavailable");assert.equal(calls,0);
  const accepted=await invokePlanningComparisonProtocol(input,binding,async()=>true,makeGuard(),transport,new AbortController().signal);
  assert.equal(accepted.kind,"protocol_validated");if(accepted.kind==="protocol_validated")assert.deepEqual(accepted.output,{highlight:"peoples_square"});
  assert.equal(calls,1);
});

test("AMap comparison cannot run without explicit search, detail, route flags and key", async () => {
  let calls=0;
  await assert.rejects(()=>readShanghaiStayAreaRoutes({env:{AMAP_SEARCH_ENABLED:"true",AMAP_DETAIL_ENABLED:"true",AMAP_ROUTES_ENABLED:"true"},
    signal:new AbortController().signal,fetcher:async()=>{calls++;throw Error("unexpected request");}}),/unavailable/i);
  assert.equal(calls,0);
});
