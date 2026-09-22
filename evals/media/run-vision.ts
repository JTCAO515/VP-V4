/** Explicit operator runner. Default is a no-network plan. Never import from app routes. */
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, openSync, writeSync, fsyncSync, closeSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { invokeSyntheticVision } from "../../lib/server/media/synthetic-vision.ts";
import { createProviderHttpTransport } from "../../lib/server/model-gateway/adapters/http-transport.ts";
import { PROTOCOL_MODELS } from "../../lib/server/model-gateway/adapters/provider-protocol.ts";
import { CostGuard } from "../../lib/server/model-gateway/budget/index.ts";
import { runWithDurableBudget, type BudgetRpc } from "../../lib/server/model-gateway/budget/durable.ts";
import { VISION_CASES, scoreVisionTranscript } from "./vision-cases.ts";

const PLAN = Object.freeze({ revision: "vision-c0-20260922-v1", provider: "qwen", model: PROTOCOL_MODELS.qwen,
  endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
  documentedAccessRegion: "China (Beijing)", observedInternalProcessingRegion: "unknown",
  requests: ["ocr-en-v1", "ocr-zh-v1", "cancel-after-dispatch"], maxRequests: 3,
  currency: "CNY", capMicros: 20_000_000, reservationPerAttemptMicros: 6_320_000,
  priceVersion: "20260922-qwen-published-upper-v1", inputMicrosPerToken: 6, outputMicrosPerToken: 24,
  // Full supported context rather than an estimated visual-token conversion. No discounts.
  maxInputTokens: 1_048_576, maxOutputTokens: 1024, userCapability: "disabled", supplierRetention: "unknown",
});
const args = process.argv.slice(2);
if (args.length === 0 || (args.length === 1 && args[0] === "--plan")) {
  console.log(JSON.stringify(PLAN, null, 2));
} else {
  if (args.length !== 4 || args[0] !== "--execute") throw new Error("Usage: --execute FIXTURE_DIR NEW_CAMPAIGN_DIR AUTHORIZATION_REFERENCE");
  if (PLAN.model !== "qwen3.7-plus-2026-05-26") throw new Error("Pinned campaign model changed; revise pricing/authorization before dispatch");
  const [, fixtureDir, campaignDir, authorizationReference] = args;
  if (!/^[a-zA-Z0-9._:/#-]{1,200}$/.test(authorizationReference)) throw new Error("Provide the actual user authorization reference, not a secret");
  const credential = process.env.QWEN_API_KEY;
  if (!credential || !/^[\x21-\x7e]{1,4096}$/.test(credential)) throw new Error("QWEN_API_KEY unavailable; use the existing server env securely");
  // Load all fixed local images before reserving or accessing the provider. No URL fetch.
  const images = VISION_CASES.map(value => readFileSync(resolve(fixtureDir, `${value.id}.png`)));
  // Exclusive creation: no implicit retry, campaign reset, resume or second process.
  mkdirSync(resolve(campaignDir), { mode: 0o700 });
  const fd = openSync(resolve(campaignDir, "journal.jsonl"), "wx", 0o600);
  const record = (value: unknown) => { writeSync(fd, JSON.stringify(value) + "\n"); fsyncSync(fd); };
  record({ kind: "campaign", plan: PLAN, authorizationReference, startedAt: new Date().toISOString() });
  const attempts = new Map<string, { state: "reserved" | "dispatched" | "pending" | "settled" | "released"; hold: number }>();
  let totalHeld = 0;
  const scopeId = randomUUID(), ownerId = randomUUID();
  // Isolated synthetic campaign implementation of the existing durable-budget RPC seam.
  // The journal is fsynced BEFORE acknowledgment; a crash forbids replay and keeps holds.
  const rpc: BudgetRpc = async (name, p) => {
    if (p.p_scope_id !== scopeId || p.p_owner_id !== ownerId) return { kind: "unavailable" };
    const id = String(p.p_attempt_id), prior = attempts.get(id);
    if (name === "reserve_model_budget") {
      if (prior || p.p_reserved_micros !== PLAN.reservationPerAttemptMicros || totalHeld + PLAN.reservationPerAttemptMicros > PLAN.capMicros || attempts.size >= PLAN.maxRequests) return { kind: "denied" };
      record({ kind: "reserved", attemptId: id, reservedMicros: PLAN.reservationPerAttemptMicros });
      totalHeld += PLAN.reservationPerAttemptMicros; attempts.set(id, { state: "reserved", hold: PLAN.reservationPerAttemptMicros }); return { kind: "reserved" };
    }
    if (name === "dispatch_model_budget" && prior?.state === "reserved") {
      record({ kind: "dispatched", attemptId: id }); prior.state = "dispatched"; return { kind: "dispatched" };
    }
    if (name === "finish_model_budget" && prior) {
      if (p.p_action === "release" && prior.state === "reserved") {
        record({ kind: "released", attemptId: id }); totalHeld -= prior.hold; prior.hold = 0; prior.state = "released"; return { kind: "released" };
      }
      if (p.p_action === "pending" && prior.state === "dispatched") {
        record({ kind: "pending", attemptId: id }); prior.state = "pending"; return { kind: "pending" };
      }
      if (p.p_action === "settle" && prior.state === "dispatched" && typeof p.p_actual_micros === "number" && Number.isSafeInteger(p.p_actual_micros) && p.p_actual_micros >= 0 && p.p_actual_micros <= prior.hold) {
        record({ kind: "settled", attemptId: id, budgetDebitMicros: p.p_actual_micros, actualBilledCost: "unknown" });
        totalHeld -= prior.hold - p.p_actual_micros; prior.hold = p.p_actual_micros; prior.state = "settled"; return { kind: "settled", overrun: false };
      }
    }
    return { kind: "unavailable" };
  };
  const results: unknown[] = [];
  try {
    for (let index = 0; index < PLAN.maxRequests; index++) {
      const fixture = VISION_CASES[index % VISION_CASES.length];
      const taskId = randomUUID(), attemptId = randomUUID();
      const controller = new AbortController(); let cancelTimer: ReturnType<typeof setTimeout> | undefined;
      const transport = createProviderHttpTransport({ provider: "qwen", endpoint: PLAN.endpoint, configurationId: scopeId, configurationVersion: 1, timeoutMs: 55000 }, {
        credential: () => credential,
        recordDestination: async receipt => {
          record({ kind: "destination", attemptId, receipt });
          if (index === 2 && receipt.phase === "attempted") cancelTimer = setTimeout(() => controller.abort(), 250);
        },
      });
      const guard = new CostGuard({ windowMs: 60000, perUserAttempts: 1, perTaskAttempts: 1, turnDeadlineMs: 60000, maxModelSteps: 1, maxToolSteps: 1 });
      const turn = guard.startTurn({ userId: "synthetic-media", taskId });
      if (turn.kind !== "turn") throw new Error("Budget unavailable");
      const startedAt = Date.now();
      try {
        const result = await runWithDurableBudget({ scopeId, ownerId, taskId, attemptId, provider: "qwen", model: PLAN.model, priceVersion: PLAN.priceVersion, reservedMicros: PLAN.reservationPerAttemptMicros, timeoutMs: 60000 }, rpc, async budgetSignal => {
          // Combine cancellation with the outer budget deadline; neither can start a retry.
          const outcome = await invokeSyntheticVision({ requestId: attemptId, dataClass: "c0_synthetic", locale: fixture.locale, png: images[index % images.length], timeoutMs: 50000 }, turn, transport, AbortSignal.any([budgetSignal, controller.signal]));
          const usage = outcome.receipt?.usage;
          const debit = usage && usage.inputTokens <= PLAN.maxInputTokens && usage.outputTokens <= PLAN.maxOutputTokens
            ? usage.inputTokens * PLAN.inputMicrosPerToken + usage.outputTokens * PLAN.outputMicrosPerToken : null;
          const safe = { caseId: index === 2 ? "cancel-after-dispatch" : fixture.id, kind: outcome.kind,
            code: outcome.kind === "unavailable" ? outcome.code : null, receipt: outcome.receipt,
            evaluation: outcome.kind === "candidate" ? scoreVisionTranscript(fixture.id, outcome.transcript) : null,
            transcriptSha256: outcome.kind === "candidate" ? createHash("sha256").update(outcome.transcript).digest("hex") : null };
          record({ kind: "observed", attemptId, outcome: safe, budgetDebitMicros: debit, actualBilledCost: "unknown" });
          return { value: safe, actualMicros: debit };
        }, new AbortController().signal);
        const observed = { ...result, elapsedMs: Date.now() - startedAt };
        results.push(observed); record({ kind: "result", attemptId, result: observed });
        if (result.kind !== "completed" || (index < 2 && result.value.kind !== "candidate")) break;
      } finally { if (cancelTimer) clearTimeout(cancelTimer); }
    }
    const report = { plan: PLAN, authorizationReference, results, heldOrDebitedMicros: totalHeld, actualBilledCost: "unknown", supplierDeletion: "UNRUN", upstreamCancellation: "UNRUN", userCapability: "disabled" };
    writeFileSync(resolve(campaignDir, "results.json"), JSON.stringify(report, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    console.log(JSON.stringify({ results: results.length, heldOrDebitedMicros: totalHeld, report: resolve(campaignDir, "results.json") }));
  } finally { closeSync(fd); }
}
