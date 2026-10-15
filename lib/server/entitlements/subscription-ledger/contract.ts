/** Closed development projection. No remaining balance or runtime capacity authority. */
export const SCHEMA = "subscription-entitlement/1" as const;
export const states = ["none", "active", "expired", "revoked", "reconciliation_required", "unavailable"] as const;
export type State = typeof states[number];
export type Period = Readonly<{ transactionId: string; originalTransactionId: string; productId: string;
  subscriptionGroupId: string; purchaseAt: string; expiresAt: string; revokedAt: string | null;
  descriptorId: string; catalogVersion: 3; policyVersion: "subscription-development-policy/1" }>;
export type Snapshot = Readonly<{ schemaVersion: typeof SCHEMA; sourceEnvironment: "Sandbox" | "localTest" | null;
  localTest: boolean; ownerId: string | null; catalogVersion: 3; policyVersion: "subscription-development-policy/1";
  state: State; period: Period | null; remainingCapacity: null; purchaseEnabled: false; runtimeCapacityEnabled: false }>;
export const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export const txid = (v: unknown): v is string => typeof v === "string" && /^[0-9]{1,32}$/.test(v);
export const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
export const exact = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
export const iso = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
export function closedSnapshot(state: "unavailable" | "reconciliation_required" = "unavailable"): Snapshot {
  return Object.freeze({ schemaVersion: SCHEMA, sourceEnvironment: null, localTest: false, ownerId: null,
    catalogVersion: 3, policyVersion: "subscription-development-policy/1", state, period: null,
    remainingCapacity: null, purchaseEnabled: false, runtimeCapacityEnabled: false });
}
/** A parser is not proof of signature. Only the server reader produces active snapshots. */
export function parseSnapshot(v: unknown): Snapshot | null {
  if (!record(v) || !exact(v, ["schemaVersion", "sourceEnvironment", "localTest", "ownerId", "catalogVersion", "policyVersion", "state", "period", "remainingCapacity", "purchaseEnabled", "runtimeCapacityEnabled"])
    || v.schemaVersion !== SCHEMA || v.catalogVersion !== 3 || v.policyVersion !== "subscription-development-policy/1"
    || !states.includes(v.state as State) || v.remainingCapacity !== null || v.purchaseEnabled !== false || v.runtimeCapacityEnabled !== false
    || typeof v.localTest !== "boolean") return null;
  if (v.state === "unavailable" || v.state === "reconciliation_required") {
    if (v.ownerId !== null || v.period !== null || v.sourceEnvironment !== null || v.localTest) return null;
  } else {
    if (!uuid(v.ownerId) || v.sourceEnvironment !== "Sandbox" || v.localTest) return null;
    if (v.state === "none") { if (v.period !== null) return null; }
    else {
      const p = v.period;
      if (!record(p) || !exact(p, ["transactionId", "originalTransactionId", "productId", "subscriptionGroupId", "purchaseAt", "expiresAt", "revokedAt", "descriptorId", "catalogVersion", "policyVersion"])
        || !txid(p.transactionId) || !txid(p.originalTransactionId) || typeof p.productId !== "string" || p.productId.length < 1 || p.productId.length > 200
        || typeof p.subscriptionGroupId !== "string" || !/^\d{1,32}$/.test(p.subscriptionGroupId)
        || !iso(p.purchaseAt) || !iso(p.expiresAt) || p.purchaseAt >= p.expiresAt || p.revokedAt !== null && !iso(p.revokedAt)
        || p.descriptorId !== `Sandbox:${p.transactionId}` || p.catalogVersion !== 3 || p.policyVersion !== v.policyVersion
        || (v.state === "revoked") !== (p.revokedAt !== null)) return null;
    }
  }
  return Object.freeze(v) as Snapshot;
}
