import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseBudgetRpc } from "../../../lib/server/model-gateway/budget/supabase-rpc.ts";

test("Supabase RPC adapter sends only named budget parameters through an injected client",async()=>{
  let called=0;
  const client=createClient("https://synthetic.invalid","synthetic-server-key",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
    called++;assert.equal(String(input),"https://synthetic.invalid/rest/v1/rpc/dispatch_model_budget");assert.equal(init?.method,"POST");assert.deepEqual(JSON.parse(String(init?.body)),{p_scope_id:"synthetic"});assert.ok(init?.signal);
    return new Response(JSON.stringify({kind:"dispatched"}),{status:200,headers:{"Content-Type":"application/json"}});
  }}});
  assert.deepEqual(await createSupabaseBudgetRpc(client)("dispatch_model_budget",{p_scope_id:"synthetic"}),{kind:"dispatched"});assert.equal(called,1);
});
test("Supabase RPC errors redact provider response details",async()=>{
  const client=createClient("https://synthetic.invalid","synthetic-server-key",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async()=>new Response(JSON.stringify({code:"42501",message:"SECRET_CANARY",details:"SECRET_CANARY",hint:"SECRET_CANARY"}),{status:403,headers:{"Content-Type":"application/json"}})}});
  await assert.rejects(createSupabaseBudgetRpc(client)("dispatch_model_budget",{}),error=>error instanceof Error&&error.message==="Budget RPC unavailable."&&!(error.stack??"").includes("SECRET_CANARY"));
});

test("stop consumer uses scoped server RPC and redacts uncertain acknowledgments",async()=>{
  const { stopDurableBudget }=await import("../../../lib/server/model-gateway/budget/stop.ts");
  const scope={scopeId:"10000000-0000-4000-8000-000000000001",ownerId:"20000000-0000-4000-8000-000000000002"};
  const client=createClient("https://synthetic.invalid","synthetic-server-key",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
    assert.equal(String(input),"https://synthetic.invalid/rest/v1/rpc/stop_model_budget");
    assert.deepEqual(JSON.parse(String(init?.body)),{p_scope_id:scope.scopeId,p_owner_id:scope.ownerId});
    return new Response(JSON.stringify({kind:"stopped",released:2,pending:1}),{status:200,headers:{"Content-Type":"application/json"}});
  }}});
  assert.deepEqual(await stopDurableBudget(scope,createSupabaseBudgetRpc(client)),{kind:"stopped",released:2,pending:1});
  assert.deepEqual(await stopDurableBudget(scope,async()=>{throw Error("SECRET_CANARY");}),{kind:"unavailable"});
  for(const response of [null,[],{kind:"stopped",released:-1,pending:0},{kind:"stopped",released:0,pending:"1"},{kind:"disabled"}]){
    assert.deepEqual(await stopDurableBudget(scope,async()=>response),{kind:"unavailable"});
  }
  let invoked=0;
  assert.deepEqual(await stopDurableBudget({...scope,scopeId:"invalid"},async()=>{invoked++;return {}; }),{kind:"unavailable"});
  assert.equal(invoked,0);
});
