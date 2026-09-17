import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { runTextWorker } from "../../../lib/server/turn/text-worker.ts";
import { PROTOCOL_MODELS } from "../../../lib/server/model-gateway/adapters/provider-protocol.ts";

const endpoint = "https://fixture.invalid/chat/completions";

async function completeWith(output, locale = "en") {
  const turnId = randomUUID(), ownerId = randomUUID(), leaseToken = randomUUID(), policyId = randomUUID();
  const persisted = [];
  const result = await runTextWorker(
    async name => {
      assert.equal(name, "claim_turn_work");
      return { kind: "leased", turnId, ownerId, leaseToken, attempt: 1, leaseMs: 60_000 };
    },
    async (name, params) => {
      if (name === "read_text_work") return { kind: "input", text: "Synthetic question", locale, policyId, provider: "qwen", endpoint };
      if (name === "authorize_text_dispatch") return { kind: "authorized" };
      assert.equal(name, "complete_text_work");
      persisted.push(params);
      return { kind: "finished" };
    },
    async name => ({ kind: ({ reserve_model_budget: "reserved", dispatch_model_budget: "dispatched", finish_model_budget: "settled" })[name], overrun: false }),
    { scopeId: randomUUID(), priceVersion: "synthetic-v1", reservedMicros: 100, maxOutputTokens: 256, timeoutMs: 5_000 },
    {
      provider: "qwen", endpoint, price: () => 5,
      transport: async () => Response.json({
        model: PROTOCOL_MODELS.qwen,
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(output) } }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }),
    },
    new AbortController().signal,
  );
  assert.equal(result, "finished");
  assert.equal(persisted.length, 1);
  return persisted[0];
}

test("all five outcomes retain natural English and Chinese user-facing results", async () => {
  const examples = [
    ["answered", "Take Metro Line 2 to the airport; check your terminal before leaving.", "乘坐地铁2号线前往机场，出发前请核对航站楼。"],
    ["partial", "I can explain the route, but not today's traffic. Check the operator before you leave.", "我可以说明路线，但无法确认今天的路况；出发前请向运营方核对。"],
    ["clarification", "Which airport terminal are you leaving from?", "你是从哪个机场航站楼出发？"],
    ["blocked", "I cannot access that private booking. You can check it in the airline app or with the carrier.", "我无法查看这笔私密预订；你可以在航司应用中查询或联系承运方。"],
    ["technical_failure", "I could not produce a reliable answer. Please try this same question again shortly.", "这次未能得到可靠答案，请稍后用同一个问题重试。"],
  ];
  for (const [outcome, english, chinese] of examples) {
    for (const text of [english, chinese]) {
      const persisted = await completeWith({ outcome, text });
      assert.equal(persisted.p_kind, outcome);
      assert.equal(persisted.p_text, text);
    }
  }
});

test("machine outcome tokens never become a saved final answer", async () => {
  for (const [locale, fallback] of [["en", "The answer could not be completed. Please try again later."], ["zh", "这次回答未能完成，请稍后重试。"]]) {
    for (const token of ["answered", "PARTIAL", "clarification", "blocked", "technical_failure", "technical failure", "Outcome: answered."]) {
      const persisted = await completeWith({ outcome: "answered", text: token }, locale);
      assert.equal(persisted.p_kind, "technical_failure");
      assert.equal(persisted.p_text, fallback);
    }
  }
});
