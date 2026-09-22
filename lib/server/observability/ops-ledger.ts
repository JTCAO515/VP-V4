/** Service-only metadata reader. No default client, credentials, HTTP route or team grant. */
export type OpsLedgerRpc = (name: "read_ops_budget_scope_v1", params: Readonly<{ p_scope_id: string }>) => Promise<unknown>;
const ATTEMPTS = ["total", "reserved", "dispatched", "pending", "settled", "released"] as const;
const MONEY = ["settledMicros", "holdMicros", "exposureMicros"] as const;
const TECHNICAL = ["active", "completed", "proposalReady", "unavailable", "failed", "cancelled", "unknown"] as const;
const BUSINESS = ["answered", "partial", "clarification", "blocked", "technicalFailure", "unobserved"] as const;
const UNOBSERVED = ["actualBilledMicros", "providerLatencyMs", "toolAttempts", "humanTimeMs", "semanticQuality", "serviceTaskCount"] as const;
type Counters<K extends string> = Readonly<Record<K, number>>;
type Money = Readonly<Record<typeof MONEY[number], string>>;
export type OpsLedgerSnapshot = Readonly<{
  kind: "snapshot";
  schemaVersion: "ops-budget-scope/v1";
  observedAt: string;
  scope: Readonly<{ currency: "CNY" | "USD"; enabled: boolean; frozen: boolean; expired: boolean }>;
  attempts: Counters<typeof ATTEMPTS[number]>;
  money: Money;
  providers: readonly Readonly<{ provider: "deepseek" | "glm" | "qwen"; attempts: Counters<typeof ATTEMPTS[number]>; money: Money }>[];
  tasks: Readonly<{
    total: number; linkedTurns: number; missingTurns: number; ownerMismatch: number;
    technical: Counters<typeof TECHNICAL[number]>;
    business: Counters<typeof BUSINESS[number]>;
  }>;
  integrity: Readonly<{ inconsistentOutcomeTasks: number; duplicateTerminalTasks: number }>;
  unobserved: Readonly<Record<typeof UNOBSERVED[number], null>>;
}>;
export type OpsLedgerFinding = "unknown_cost_hold" | "unlinked_tasks" | "owner_mismatch" | "inconsistent_outcome" | "duplicate_terminal";

/** One RPC is one database snapshot. The caller must provide a bounded service transport. */
export async function readOpsLedgerScope(rpc: OpsLedgerRpc, scopeId: string): Promise<
  | Readonly<{ kind: "available"; snapshot: OpsLedgerSnapshot; findings: readonly OpsLedgerFinding[] }>
  | Readonly<{ kind: "unavailable" }>
> {
  if (typeof scopeId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(scopeId)) return { kind: "unavailable" };
  try {
    const snapshot = parseOpsLedgerSnapshot(await rpc("read_ops_budget_scope_v1", { p_scope_id: scopeId }));
    const findings = opsLedgerFindings(snapshot);
    return Object.freeze({ kind: "available", snapshot, findings: Object.freeze(findings) });
  } catch { return { kind: "unavailable" }; } // Never return a raw database error or row.
}

/** Findings are derived from the same validated snapshot, never a second ledger read. */
export function opsLedgerFindings(snapshot: OpsLedgerSnapshot): readonly OpsLedgerFinding[] {
  const findings: OpsLedgerFinding[] = [];
  if (BigInt(snapshot.money.holdMicros) > BigInt(0)) findings.push("unknown_cost_hold");
  if (snapshot.tasks.missingTurns) findings.push("unlinked_tasks");
  if (snapshot.tasks.ownerMismatch) findings.push("owner_mismatch");
  if (snapshot.integrity.inconsistentOutcomeTasks) findings.push("inconsistent_outcome");
  if (snapshot.integrity.duplicateTerminalTasks) findings.push("duplicate_terminal");
  return Object.freeze(findings);
}

/** Exact allowlist plus arithmetic reconciliation; rejects extra body/identifier fields. */
export function parseOpsLedgerSnapshot(value: unknown): OpsLedgerSnapshot {
  const row = exact(value, ["kind", "schemaVersion", "observedAt", "scope", "attempts", "money", "providers", "tasks", "integrity", "unobserved"]);
  if (row.kind !== "snapshot" || row.schemaVersion !== "ops-budget-scope/v1"
    || typeof row.observedAt !== "string" || row.observedAt.length > 40
    || !/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(row.observedAt) || !Number.isFinite(Date.parse(row.observedAt))) invalid();
  const scope = exact(row.scope, ["currency", "enabled", "frozen", "expired"]);
  if ((scope.currency !== "CNY" && scope.currency !== "USD") || [scope.enabled, scope.frozen, scope.expired].some(v => typeof v !== "boolean")) invalid();
  const attempts = counters(row.attempts, ATTEMPTS); reconcileAttempts(attempts);
  const money = parseMoney(row.money);
  if (!Array.isArray(row.providers) || row.providers.length > 3) invalid();
  const providers = row.providers.map(value => {
    const provider = exact(value, ["provider", "attempts", "money"]);
    if (provider.provider !== "deepseek" && provider.provider !== "glm" && provider.provider !== "qwen") invalid();
    const counts = counters(provider.attempts, ATTEMPTS); reconcileAttempts(counts);
    if (counts.total === 0) invalid();
    return Object.freeze({ provider: provider.provider, attempts: counts, money: parseMoney(provider.money) });
  });
  if (new Set(providers.map(p => p.provider)).size !== providers.length) invalid();
  for (const key of ATTEMPTS) if (sum(providers.map(p => p.attempts[key])) !== attempts[key]) invalid();
  for (const key of MONEY) if (providers.reduce((n, p) => n + BigInt(p.money[key]), BigInt(0)) !== BigInt(money[key])) invalid();
  const tasks = exact(row.tasks, ["total", "linkedTurns", "missingTurns", "ownerMismatch", "technical", "business"]);
  const taskCounts = counters({ total: tasks.total, linkedTurns: tasks.linkedTurns, missingTurns: tasks.missingTurns, ownerMismatch: tasks.ownerMismatch }, ["total", "linkedTurns", "missingTurns", "ownerMismatch"] as const);
  const technical = counters(tasks.technical, TECHNICAL), business = counters(tasks.business, BUSINESS);
  if (sum([taskCounts.linkedTurns, taskCounts.missingTurns, taskCounts.ownerMismatch]) !== taskCounts.total
    || sum(Object.values(technical)) !== taskCounts.total || sum(Object.values(business)) !== taskCounts.total
    || taskCounts.total > attempts.total || technical.unknown < taskCounts.missingTurns + taskCounts.ownerMismatch
    || business.unobserved < taskCounts.missingTurns + taskCounts.ownerMismatch
    || business.answered + business.partial + business.clarification > technical.completed
    || business.blocked > technical.unavailable || business.technicalFailure > technical.failed) invalid();
  const integrity = counters(row.integrity, ["inconsistentOutcomeTasks", "duplicateTerminalTasks"] as const);
  if (integrity.inconsistentOutcomeTasks > business.unobserved || integrity.duplicateTerminalTasks > taskCounts.linkedTurns) invalid();
  const unobserved = exact(row.unobserved, UNOBSERVED);
  if (Object.values(unobserved).some(v => v !== null)) invalid();
  return Object.freeze({
    kind: "snapshot", schemaVersion: "ops-budget-scope/v1", observedAt: row.observedAt,
    scope: Object.freeze(scope) as OpsLedgerSnapshot["scope"], attempts, money,
    providers: Object.freeze(providers), tasks: Object.freeze({ ...taskCounts, technical, business }),
    integrity, unobserved: Object.freeze(unobserved) as OpsLedgerSnapshot["unobserved"],
  });
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) invalid();
  return row;
}
function counters<K extends string>(value: unknown, keys: readonly K[]): Counters<K> {
  const row = exact(value, keys);
  for (const key of keys) if (typeof row[key] !== "number" || !Number.isSafeInteger(row[key]) || (row[key] as number) < 0) invalid();
  return Object.freeze({ ...row }) as Counters<K>;
}
function sum(values: readonly number[]): number {
  const result = values.reduce((n, value) => n + value, 0);
  if (!Number.isSafeInteger(result)) invalid();
  return result;
}
function reconcileAttempts(counts: Counters<typeof ATTEMPTS[number]>) {
  if (sum([counts.reserved, counts.dispatched, counts.pending, counts.settled, counts.released]) !== counts.total) invalid();
}
function parseMoney(value: unknown): Money {
  const row = exact(value, MONEY);
  for (const key of MONEY) if (typeof row[key] !== "string" || !/^(0|[1-9]\d{0,39})$/.test(row[key] as string)) invalid();
  const money = row as Money;
  if (BigInt(money.settledMicros) + BigInt(money.holdMicros) !== BigInt(money.exposureMicros)) invalid();
  return Object.freeze({ ...money });
}
function invalid(): never { throw new TypeError("Invalid operational ledger snapshot"); }
