#!/usr/bin/env node
// Explicit read-only configuration check, or one bounded synthetic paid request.
// No database, user input, retries, policy mutation, raw output or credential logs.
import { randomUUID } from "node:crypto";
import { readQwenEndpoint, LEGACY_QWEN_ENDPOINT } from "../../lib/server/model-gateway/adapters/provider-endpoints.ts";
import { createProviderHttpTransport } from "../../lib/server/model-gateway/adapters/http-transport.ts";
import { invokeProviderProtocol, PROTOCOL_MODELS } from "../../lib/server/model-gateway/adapters/provider-protocol.ts";
import { CostGuard } from "../../lib/server/model-gateway/budget/index.ts";

try {
  const mode = process.argv[2];
  if (process.argv.length !== 3 || !["--check", "--probe"].includes(mode)
    || process.env.VISEPANDA_QWEN_ENDPOINT === undefined) throw Error("unavailable");
  const endpoint = readQwenEndpoint(process.env);
  const metadata = { schemaVersion: "qwen-endpoint-probe/1", endpoint, model: PROTOCOL_MODELS.qwen,
    mode: endpoint === LEGACY_QWEN_ENDPOINT ? "legacy" : "workspace", maxCalls: 1, maxOutputTokens: 64, timeoutMs: 15000 };
  if (mode === "--check") {
    console.log(JSON.stringify({ ...metadata, status: "CONFIG_VALID", providerCalls: 0, liveVerified: false }));
  } else {
    const key = process.env.QWEN_API_KEY;
    if (!key || !/^[\x21-\x7e]{1,4096}$/.test(key)) throw Error("unavailable");
    const receipts = [];
    const configurationId = randomUUID();
    const transport = createProviderHttpTransport({ provider: "qwen", endpoint, configurationId, configurationVersion: 1, timeoutMs: metadata.timeoutMs }, {
      qwenEndpoint: endpoint, credential: () => key, recordDestination: async receipt => { receipts.push(receipt); },
    });
    const budget = new CostGuard({ windowMs: 60000, perUserAttempts: 1, perTaskAttempts: 1, turnDeadlineMs: metadata.timeoutMs, maxModelSteps: 1, maxToolSteps: 1 })
      .startTurn({ userId: "synthetic-migration-probe", taskId: configurationId });
    if (budget.kind !== "turn") throw Error("unavailable");
    const start = Date.now();
    const result = await invokeProviderProtocol({ requestId: configurationId, provider: "qwen", dataClass: "c0_synthetic", task: "ordinary_text",
      input: "This is a synthetic connectivity test. Reply with OK only.", maxOutputTokens: metadata.maxOutputTokens, timeoutMs: metadata.timeoutMs }, budget, transport, AbortSignal.timeout(16000));
    const passed = result.kind === "protocol_validated";
    console.log(JSON.stringify({ ...metadata, status: passed ? "PASS" : "FAIL", elapsedMs: Date.now() - start,
      outcome: result.kind, ...(result.kind === "unavailable" ? { code: result.code } : {}),
      usage: result.kind === "cancelled" ? null : result.usage, receipts, liveVerified: passed }));
    if (!passed) process.exitCode = 1;
  }
} catch {
  console.error("Qwen endpoint check unavailable. Verify explicit endpoint, mode and server credential; no automatic retry.");
  process.exitCode = 1;
}
