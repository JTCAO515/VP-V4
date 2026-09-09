import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { runWithDurableBudget, type BudgetAttempt, type BudgetRpc } from "../../../lib/server/model-gateway/budget/durable.ts";
const attempt = (): BudgetAttempt => ({ scopeId: randomUUID(), ownerId: randomUUID(), taskId: randomUUID(), attemptId: randomUUID(), provider: "deepseek", model: "test-model", priceVersion: "test-price", reservedMicros: 100, timeoutMs: 1000 });
test("invalid and pre-cancelled attempts never reserve or invoke", async () => {
  let calls = 0;
  const rpc: BudgetRpc = async () => { calls++; return {kind:"reserved"}; };
  const invoke = async () => { calls++; return {value:"fake",actualMicros:1}; };
  assert.equal((await runWithDurableBudget({...attempt(),reservedMicros:0},rpc,invoke,new AbortController().signal)).kind,"unavailable");
  assert.equal((await runWithDurableBudget(attempt(),rpc,invoke,AbortSignal.abort())).kind,"unavailable");
  assert.equal(calls,0);
});
test("uncertain reserve or dispatch acknowledgments fail closed without releasing possible spend", async () => {
  for (const failed of ["reserve_model_budget","dispatch_model_budget"]) {
    const calls: string[] = []; let invoked = 0;
    const rpc: BudgetRpc = async (name) => { calls.push(name); if(name===failed)throw Error("SECRET_CANARY"); return {kind:"reserved"}; };
    const result=await runWithDurableBudget(attempt(),rpc,async()=>{invoked++;return {value:"fake",actualMicros:1};},new AbortController().signal);
    assert.deepEqual(result,{kind:"unavailable",reason:"accounting"});assert.equal(invoked,0);assert.equal(calls.includes("finish_model_budget"),false);assert.equal(JSON.stringify(result).includes("SECRET_CANARY"),false);
  }
});
test("transport failures and invalid costs retain uncertainty without exposing raw errors", async () => {
  for(const failure of ["throw","negative","unsafe"]){
    const actions: unknown[]=[];
    const rpc: BudgetRpc=async(name,parameters)=>{if(name==="finish_model_budget"){actions.push(parameters.p_action);return {kind:"pending"};}return {kind:name==="reserve_model_budget"?"reserved":"dispatched"};};
    const result=await runWithDurableBudget(attempt(),rpc,async()=>{if(failure==="throw")throw Error("SECRET_CANARY");return {value:"fake",actualMicros:failure==="negative"?-1:Number.MAX_SAFE_INTEGER+1};},new AbortController().signal);
    assert.equal(result.kind,"unavailable");assert.deepEqual(actions,["pending"]);assert.equal(JSON.stringify(result).includes("SECRET_CANARY"),false);
  }
});
test("cancel while settlement commits suppresses output without reverting accounted cost",async()=>{
  const controller=new AbortController();
  const rpc: BudgetRpc=async(name)=>{if(name==="finish_model_budget"){controller.abort();return {kind:"settled",overrun:false};}return {kind:name==="reserve_model_budget"?"reserved":"dispatched"};};
  assert.deepEqual(await runWithDurableBudget(attempt(),rpc,async()=>({value:"late",actualMicros:1}),controller.signal),{kind:"unavailable",reason:"cancelled"});
});

test("cancel or timeout while unknown-cost pending commits never returns late output",async()=>{
  for(const mode of ["cancel","timeout"]){
    const controller=new AbortController();const a={...attempt(),timeoutMs:10};const actions: unknown[]=[];
    const rpc: BudgetRpc=async(name,parameters)=>{if(name==="finish_model_budget"){actions.push(parameters.p_action);if(mode==="cancel")controller.abort();else await new Promise(r=>setTimeout(r,30));return {kind:"pending"};}return {kind:name==="reserve_model_budget"?"reserved":"dispatched"};};
    assert.deepEqual(await runWithDurableBudget(a,rpc,async()=>({value:"late candidate",actualMicros:null}),controller.signal),{kind:"unavailable",reason:mode==="cancel"?"cancelled":"timeout"});
    assert.deepEqual(actions,["pending"]);
  }
});
