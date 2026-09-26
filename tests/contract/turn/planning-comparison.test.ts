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

test("fixed AMap reads preserve exact anchors, current routes and a 13-call cap",async()=>{
  const ids:Record<string,string>={"静安寺":"jingan-poi","人民广场":"square-poi","上海站":"station-poi"};
  const coordinates:Record<string,string>={"jingan-poi":"121.440000,31.220000","square-poi":"121.480000,31.230000","station-poi":"121.450000,31.250000"};
  const calls:string[]=[];
  const fetcher=async(request:RequestInfo|URL)=>{
    const url=request instanceof URL?request:new URL(String(request));calls.push(url.pathname);
    if(url.pathname.includes("place/text")){
      const name=url.searchParams.get("keywords")!;
      return Response.json({status:"1",infocode:"10000",pois:[{id:ids[name],name}]});
    }
    if(url.pathname.includes("place/detail")){
      const id=url.searchParams.get("id")!;
      return Response.json({status:"1",infocode:"10000",pois:[{id,name:id,citycode:"021",location:coordinates[id],address:"Synthetic address"}]});
    }
    const origin=url.searchParams.get("origin")!,destination=url.searchParams.get("destination")!;
    const jingan=origin===coordinates["jingan-poi"],transit=url.pathname.includes("transit");
    const segment={walking:{distance:"100",steps:[{instruction:"Walk to station"}]},
      bus:{buslines:[{name:"Synthetic line",departure_stop:{name:"A"},arrival_stop:{name:"B"}}]}};
    return Response.json({status:"1",infocode:"10000",route:{origin,destination,
      [transit?"transits":"paths"]:[{distance:"1000",cost:{duration:jingan?"1260":"960"},
        steps:[{instruction:"Walk"}],segments:jingan?[segment,segment]:[segment]}]}});
  };
  const observed=await readShanghaiStayAreaRoutes({env:{AMAP_SEARCH_ENABLED:"true",AMAP_DETAIL_ENABLED:"true",
    AMAP_ROUTES_ENABLED:"true",AMAP_WEB_SERVICE_KEY:"synthetic-key"},signal:new AbortController().signal,fetcher:fetcher as typeof fetch});
  assert.equal(observed.source,"amap");assert.equal(observed.providerCalls,13);assert.equal(calls.length,13);
  assert.deepEqual(observed.areas.map(area=>[area.id,area.railMinutes,area.transfers]),
    [["jingan",21,1],["peoples_square",16,0]]);
  assert.equal(JSON.stringify(observed).includes("synthetic-key"),false);
});
