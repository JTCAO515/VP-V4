import { parseOpsLedgerSnapshot } from "../../lib/server/observability/ops-ledger.ts";

/** Text diagnostic for a service caller; no route, credential lookup or raw-row export. */
export function renderOpsLedgerReport(value: unknown): string {
  const s = parseOpsLedgerSnapshot(value);
  return [
    "Budget-scope operational snapshot",
    `Observed at: ${s.observedAt}`,
    `Admission flags: enabled=${s.scope.enabled}; frozen=${s.scope.frozen}; expired=${s.scope.expired}`,
    `Attempts: ${s.attempts.total} (reserved ${s.attempts.reserved}, dispatched ${s.attempts.dispatched}, pending ${s.attempts.pending}, settled ${s.attempts.settled}, released ${s.attempts.released})`,
    `Ledger debit: ${s.money.settledMicros} ${s.scope.currency} micros; unresolved hold: ${s.money.holdMicros}; conservative exposure: ${s.money.exposureMicros}. These are ledger amounts, not a supplier invoice.`,
    `Distinct ledger task IDs: ${s.tasks.total}; owner-matched Turns: ${s.tasks.linkedTurns}; missing: ${s.tasks.missingTurns}; owner mismatch: ${s.tasks.ownerMismatch}. ServiceTask count: unknown.`,
    `Technical states: ${Object.entries(s.tasks.technical).map(([key, count]) => `${key}=${count}`).join(", ")}`,
    `Recorded business outcomes: ${Object.entries(s.tasks.business).map(([key, count]) => `${key}=${count}`).join(", ")}`,
    ...s.providers.map(p => `${p.provider}: attempts=${p.attempts.total}; ledger debit=${p.money.settledMicros}; unresolved hold=${p.money.holdMicros}; exposure=${p.money.exposureMicros}`),
    `Integrity: inconsistent outcome tasks=${s.integrity.inconsistentOutcomeTasks}; duplicate terminal tasks=${s.integrity.duplicateTerminalTasks}`,
    "Actual billed cost, provider latency, tool attempts, human time and semantic quality: unknown (no accepted source in this read model).",
    "Technical completion does not establish an answered request or semantic success. Task IDs are deduplicated before joining outcomes; attempts and money, not task counts, reconcile across providers.",
  ].join("\n");
}
