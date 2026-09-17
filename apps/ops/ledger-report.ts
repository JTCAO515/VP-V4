import { parseOpsLedgerSnapshot } from "../../lib/server/observability/ops-ledger.ts";

/** Text diagnostic from a validated aggregate; no credential lookup or raw-row export. */
export function renderOpsLedgerReport(value: unknown, locale: "zh" | "en" = "en"): string {
  const s = parseOpsLedgerSnapshot(value);
  if (locale === "zh") return [
    "预算范围运营快照",
    `观察时间：${s.observedAt}`,
    `接纳状态：启用=${s.scope.enabled}；冻结=${s.scope.frozen}；过期=${s.scope.expired}`,
    `尝试：${s.attempts.total}（已预留 ${s.attempts.reserved}、已派发 ${s.attempts.dispatched}、费用待核 ${s.attempts.pending}、已结算 ${s.attempts.settled}、已释放 ${s.attempts.released}）`,
    `内部账本扣额：${s.money.settledMicros} ${s.scope.currency} 微单位；未解预留：${s.money.holdMicros}；保守敞口：${s.money.exposureMicros}。这不是供应商账单。`,
    `不同账本任务 ID：${s.tasks.total}；同 owner 的 Turn：${s.tasks.linkedTurns}；缺失：${s.tasks.missingTurns}；owner 不匹配：${s.tasks.ownerMismatch}。ServiceTask 数量：未知。`,
    `技术状态：${Object.entries(s.tasks.technical).map(([key, count]) => `${key}=${count}`).join("，")}`,
    `已记录业务结果：${Object.entries(s.tasks.business).map(([key, count]) => `${key}=${count}`).join("，")}`,
    ...s.providers.map(p => `${p.provider}：尝试=${p.attempts.total}；内部扣额=${p.money.settledMicros}；未解预留=${p.money.holdMicros}；敞口=${p.money.exposureMicros}`),
    `完整性：结果/终态不符任务=${s.integrity.inconsistentOutcomeTasks}；重复终态任务=${s.integrity.duplicateTerminalTasks}`,
    "实际账单、供应商延迟、工具调用、人工时间和语义质量：未知（本读取模型没有合格来源）。",
    "技术完成不等于正确回答。任务 ID 在关联业务结果前已去重；供应商小计只对尝试与金额对账。",
  ].join("\n");
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
