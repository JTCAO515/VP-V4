import assert from "node:assert/strict";
import test from "node:test";
import { knowledgeIntent } from "../../../../lib/server/knowledge/claim/intent.ts";
import { invokeKnowledgeIntentProtocol, invokeProviderProtocol, type KnowledgeAuthorizationRpc } from "../../../../lib/server/model-gateway/adapters/provider-protocol.ts";
import { KNOWLEDGE_INTENT_SYSTEM_PROMPT } from "../../../../lib/server/model-gateway/prompt/knowledge-intent.ts";
import { budget, completion, request } from "./fixtures.ts";

const lease = { turnId: "00000000-0000-4000-8000-000000000001", leaseToken: "00000000-0000-4000-8000-000000000002" };
const binding = { provider: "qwen" as const, endpoint: "https://fixture.invalid/v1/chat/completions", maxOutputTokens: 128, timeoutMs: 1000 };
const input = { kind: "intent_input", text: "What ID do I need for my train, and how early should I arrive?", locale: "en", policyId: "policy", provider: binding.provider, endpoint: binding.endpoint, contextDigest: "a".repeat(64) };
const signal = () => new AbortController().signal;

test("intent C2 sends only current user input after fresh digest-bound authorization", async () => {
  const calls: string[] = [];
  const rpc: KnowledgeAuthorizationRpc = async (name, params) => {
    calls.push(name);
    assert.equal(params.p_lease_token, lease.leaseToken);
    if (name === "read_grounded_work") return input;
    assert.equal(params.p_context_digest, input.contextDigest);
    assert.equal(params.p_policy_id, input.policyId);
    return { kind: "authorized" };
  };
  const result = await invokeKnowledgeIntentProtocol(lease, binding, rpc, budget(), async wire => {
    calls.push("transport");
    assert.deepEqual(JSON.parse(wire.body).messages, [
      { role: "system", content: KNOWLEDGE_INTENT_SYSTEM_PROMPT },
      { role: "user", content: input.text },
    ]);
    assert.equal(wire.endpoint, binding.endpoint);
    return Response.json(completion("qwen", { role: "assistant", content: '{"intent":"rail_boarding_documents","requestScope":"additional_needs"}' }));
  }, signal());
  assert.equal(result.kind, "protocol_validated");
  assert.deepEqual(calls, ["read_grounded_work", "authorize_grounded_dispatch", "transport"]);
});

test("history, evidence, recipient mismatch and stale authorization never reach intent transport", async () => {
  for (const raw of [{ ...input, history: [] }, { ...input, facts: ["private"] }, { ...input, endpoint: "https://other.invalid" }, { ...input, kind: "task_input" }, { ...input, contextDigest: "" }, input]) {
    let transport = 0;
    const result = await invokeKnowledgeIntentProtocol(lease, binding, async name => name === "read_grounded_work" ? raw : { kind: "blocked" }, budget(), async () => {
      transport++;
      return Response.json(completion("qwen"));
    }, signal());
    assert.equal(result.kind, "unavailable");
    assert.equal(transport, 0);
  }
  let transport = 0;
  await invokeProviderProtocol(request("qwen", { task: "knowledge_intent_v1", dataClass: "c2_sensitive" }), budget(), async () => {
    transport++;
    return Response.json(completion("qwen"));
  }, signal());
  assert.equal(transport, 0, "untrusted compatibility entry cannot assert C2 permission");
});

test("routing parser rejects prose, invented evidence and false complete coverage", () => {
  for (const value of [null, [], { intent: "payment_mobile_setup", requestScope: ["single"] }, { intent: ["unsupported"], requestScope: "unknown" }, { intent: "rail_boarding_documents", requestScope: "single", facts: [] },
    { intent: "rail_boarding_documents", requestScope: "complete" }, { intent: "answered", requestScope: "single" },
    { intent: "clarification", requestScope: "single" }, { intent: "unsupported", requestScope: "additional_needs" }]) {
    assert.equal(knowledgeIntent(value), null);
  }
  for (const value of [{ intent: "rail_boarding_documents", requestScope: "single" },
    { intent: "rail_boarding_documents", requestScope: "additional_needs" },
    { intent: "clarification", requestScope: "unknown" }, { intent: "unsupported", requestScope: "unknown" }]) {
    assert.deepEqual(knowledgeIntent(value), value);
  }
});


test("new intent schema binds unanswered excerpts to the current request, preserving the legacy shape", () => {
  const input = "普通购票要什么证件？另外，遗失护照后可以用照片吗？";
  const value = { intent: "rail_boarding_documents", requestScope: "additional_needs", unansweredNeeds: ["遗失护照后可以用照片吗？"] };
  assert.deepEqual(knowledgeIntent(value, input), value);
  for (const needs of [null, {}, [], [1], ["an invented question"], ["\t"], ["遗失护照后可以用照片吗？", "遗失护照后可以用照片吗？"]]) {
    assert.equal(knowledgeIntent({ ...value, unansweredNeeds: needs }, input), null);
  }
  assert.equal(knowledgeIntent(value), null, "no unbound current-input excerpts");
  assert.equal(knowledgeIntent({ ...value, requestScope: "single" }, input), null);
  assert.deepEqual(knowledgeIntent({ intent: "clarification", requestScope: "unknown", unansweredNeeds: [] }, input),
    { intent: "clarification", requestScope: "unknown", unansweredNeeds: [] });
  assert.equal(knowledgeIntent({ ...value, facts: [] }, input), null);
});


test("excerpts cannot split a Unicode scalar even if a UTF16 substring matches", () => {
  const value={intent:"rail_boarding_documents",requestScope:"additional_needs",unansweredNeeds:["\ud83d"]};
  assert.equal(knowledgeIntent(value,"ordinary ID, then 😀?"),null);
  assert.deepEqual(knowledgeIntent({...value,unansweredNeeds:["😀?"]},"ordinary ID, then 😀?"),{...value,unansweredNeeds:["😀?"]});
});

test("place routing only forwards literal user names, never model-selected identities", () => {
  const input="Where is River Art Hall and what is today's opening time?";
  const value={intent:"place_address_and_hours",requestScope:"single",unansweredNeeds:[],placeName:"River Art Hall"};
  assert.deepEqual(knowledgeIntent(value,input),value);
  for(const mutate of [
    {placeName:"河畔艺术馆"},{placeName:""},{placeName:"River Art Hall",subjectId:"river_hall"},
    {placeName:"Other Museum"},{intent:"payment_mobile_setup"},{placeName:null},
  ])assert.equal(knowledgeIntent({...value,...mutate},input),null);
  const {placeName,...withoutName}=value;
  assert.equal(knowledgeIntent(withoutName,input),null);
  assert.equal(knowledgeIntent(value),null);
});
