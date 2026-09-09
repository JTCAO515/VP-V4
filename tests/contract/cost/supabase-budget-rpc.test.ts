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
