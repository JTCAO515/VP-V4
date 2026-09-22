import { opsLedgerFindings, type OpsLedgerSnapshot } from "@/lib/server/observability/ops-ledger";
import { renderOpsLedgerReport } from "@/apps/ops/ledger-report";
import styles from "./snapshot.module.css";

const labels = {
  zh: {
    observed: "观察时间", tasks: "任务结果", taskCount: "不同账本任务 ID", attempts: "尝试对账", providers: "供应商分项", money: "预算与费用", integrity: "关联与完整性", unknown: "未知", unknowns: "尚未观测的指标", admission: "预算接纳", enabled: "启用", disabled: "停用", frozen: "冻结", expired: "过期", yes: "是", no: "否",
    taskNote: "任务 ID 已去重，同一任务重试只计一次。已回答是记录的业务结果，不证明回答正确；技术完成也不等于已回答。",
    providerNote: "各供应商的尝试和金额相加等于范围总计。跨供应商重试可能属于同一任务，不能相加为任务数。",
    moneyNote: "金额单位为微单位（1,000,000 微单位 = 1 货币单位），是内部账本记录，不是供应商账单。未解预留继续占用预算。",
    empty: "本快照没有已记录的尝试。", diagnostics: "需核对", noFindings: "本快照未发现列出的对账异常；这不代表语义质量或运营验收通过。", raw: "查看完整文本快照",
    business: { answered: "已回答", partial: "部分回答", clarification: "需澄清", blocked: "已阻止", technicalFailure: "技术失败", unobserved: "未观测" },
    technical: { active: "进行中", completed: "技术完成", proposalReady: "提案就绪", unavailable: "不可用", failed: "失败", cancelled: "已取消", unknown: "未知" },
    states: { total: "总尝试", reserved: "已预留", dispatched: "已派发", pending: "费用待核", settled: "已结算", released: "已释放" },
    amounts: { settledMicros: "内部账本扣额", holdMicros: "未解预留", exposureMicros: "保守敞口" },
    unobserved: { actualBilledMicros: "实际账单", providerLatencyMs: "供应商延迟", toolAttempts: "工具尝试", humanTimeMs: "人工时间", semanticQuality: "语义质量", serviceTaskCount: "ServiceTask 数量" },
    linkage: { linkedTurns: "同 owner 的 Turn", missingTurns: "缺失 Turn", ownerMismatch: "owner 不匹配", inconsistentOutcomeTasks: "结果与终态不符", duplicateTerminalTasks: "重复终态" },
    findings: { unknown_cost_hold: "存在未解预留：先核实供应商用量，不能当作免费或直接释放。", unlinked_tasks: "存在缺失的 Turn：对应业务结果保持未观测。", owner_mismatch: "存在 owner 不匹配：交由账本生产者核对，不读取其他用户内容。", inconsistent_outcome: "业务结果与终态不符：调查来源记录，不自动修复。", duplicate_terminal: "存在重复终态：交由执行系统调查，不重复计算为成功。" },
  },
  en: {
    observed: "Observed at", tasks: "Task outcomes", taskCount: "Distinct ledger task IDs", attempts: "Attempt reconciliation", providers: "Provider breakdown", money: "Budget and costs", integrity: "Linkage and integrity", unknown: "Unknown", unknowns: "Unobserved metrics", admission: "Budget admission", enabled: "Enabled", disabled: "Disabled", frozen: "Frozen", expired: "Expired", yes: "Yes", no: "No",
    taskNote: "Task IDs are deduplicated across retries. Answered is a recorded business outcome, not proof of correctness. Technical completion does not establish an answered request.",
    providerNote: "Provider attempts and amounts sum to scope totals. Retries across providers may belong to one task; provider counts are not task counts.",
    moneyNote: "Amounts are micros (1,000,000 micros = 1 currency unit). These are internal ledger records, not supplier invoices. Unresolved holds continue to occupy the budget.",
    empty: "No attempts recorded in this snapshot.", diagnostics: "Needs reconciliation", noFindings: "None of the listed reconciliation findings occur in this snapshot; semantic quality and operational acceptance are not established.", raw: "View complete text snapshot",
    business: { answered: "Answered", partial: "Partial", clarification: "Clarification", blocked: "Blocked", technicalFailure: "Technical failure", unobserved: "Unobserved" },
    technical: { active: "Active", completed: "Technically completed", proposalReady: "Proposal ready", unavailable: "Unavailable", failed: "Failed", cancelled: "Cancelled", unknown: "Unknown" },
    states: { total: "Total attempts", reserved: "Reserved", dispatched: "Dispatched", pending: "Pending cost", settled: "Settled", released: "Released" },
    amounts: { settledMicros: "Ledger debit", holdMicros: "Unresolved hold", exposureMicros: "Conservative exposure" },
    unobserved: { actualBilledMicros: "Actual billed cost", providerLatencyMs: "Provider latency", toolAttempts: "Tool attempts", humanTimeMs: "Human time", semanticQuality: "Semantic quality", serviceTaskCount: "ServiceTask count" },
    linkage: { linkedTurns: "Owner-matched Turns", missingTurns: "Missing Turns", ownerMismatch: "Owner mismatch", inconsistentOutcomeTasks: "Inconsistent outcomes", duplicateTerminalTasks: "Duplicate terminals" },
    findings: { unknown_cost_hold: "Unresolved holds exist: reconcile supplier usage before settlement; do not assume free usage or release holds.", unlinked_tasks: "Missing Turns exist: their business outcomes remain unobserved.", owner_mismatch: "Owner mismatch exists: investigate with the ledger producer without reading another user's content.", inconsistent_outcome: "Outcomes disagree with terminal states: investigate source records without automatic repair.", duplicate_terminal: "Duplicate terminals exist: investigate in the execution system without counting additional successes." },
  },
} as const;

function Metrics({ values, names }: { values: Readonly<Record<string, string | number>>; names: Readonly<Record<string, string>> }) {
  return <dl className={styles.metrics}>{Object.entries(values).map(([key, value]) => <div key={key}><dt>{names[key]}</dt><dd>{value}</dd></div>)}</dl>;
}

export function BudgetSnapshot({ snapshot: s, locale }: { snapshot: OpsLedgerSnapshot; locale: "zh" | "en" }) {
  const c = labels[locale];
  const findings = opsLedgerFindings(s);
  return <div className={styles.snapshot}>
    <p>{c.observed}: <time dateTime={s.observedAt}>{s.observedAt}</time></p>
    <section className={styles.panel} aria-label={c.tasks}>
      <h2>{c.tasks}</h2><p>{c.taskCount}: <strong>{s.tasks.total}</strong></p>
      <Metrics values={s.tasks.business} names={c.business} />
      <p>{c.taskNote}</p><Metrics values={s.tasks.technical} names={c.technical} />
    </section>
    <section className={styles.panel} aria-label={c.attempts}>
      <h2>{c.attempts}</h2><Metrics values={s.attempts} names={c.states} />
      {s.attempts.total === 0 ? <p>{c.empty}</p> : null}
    </section>
    <section className={styles.panel} aria-label={c.money}>
      <h2>{c.money} · {s.scope.currency}</h2>
      <p>{c.admission}: {s.scope.enabled ? c.enabled : c.disabled} · {c.frozen}: {s.scope.frozen ? c.yes : c.no} · {c.expired}: {s.scope.expired ? c.yes : c.no}</p>
      <Metrics values={s.money} names={c.amounts} /><p>{c.moneyNote}</p>
    </section>
    <section className={styles.panel} aria-label={c.providers}>
      <h2>{c.providers}</h2><p>{c.providerNote}</p>
      {s.providers.length === 0 ? <p>{c.empty}</p> : s.providers.map(p => <section key={p.provider} aria-label={p.provider} className={styles.provider}>
        <h3>{p.provider}</h3><Metrics values={p.attempts} names={c.states} /><Metrics values={p.money} names={c.amounts} />
      </section>)}
    </section>
    <section className={styles.panel} aria-label={c.integrity}>
      <h2>{c.integrity}</h2><Metrics values={{ linkedTurns: s.tasks.linkedTurns, missingTurns: s.tasks.missingTurns, ownerMismatch: s.tasks.ownerMismatch, ...s.integrity }} names={c.linkage} />
      {findings.length ? <><h3>{c.diagnostics}</h3><ul className={styles.findings}>{findings.map(finding => <li key={finding}>{c.findings[finding]}</li>)}</ul></> : <p>{c.noFindings}</p>}
    </section>
    <section className={styles.panel} aria-label={c.unknowns}>
      <h2>{c.unknowns}</h2><Metrics values={Object.fromEntries(Object.keys(s.unobserved).map(key => [key, c.unknown]))} names={c.unobserved} />
    </section>
    <details className={styles.panel}><summary>{c.raw}</summary><pre className={styles.raw}>{renderOpsLedgerReport(s, locale)}</pre></details>
  </div>;
}
