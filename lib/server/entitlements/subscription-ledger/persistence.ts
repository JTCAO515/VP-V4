import { closedSnapshot, parseSnapshot, uuid, record, type Snapshot } from "./contract.ts";
import { assertVerified, type Candidate } from "./verification.ts";
export type Query = (sql: string, values: readonly unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
export type Receipt = Readonly<{ schemaVersion: "subscription-ledger-receipt/1"; transactionId: string;
  descriptorId: string; epoch: number; replayed: boolean; state: "recorded" | "revoked" }>;
/** A query belongs to the private admin fixture, never a service-role client or browser. */
export function developmentLedger(query?: Query) {
  return Object.freeze({
    async apply(candidate: Candidate, expectedEpoch: number): Promise<Receipt> {
      if (!query) throw Error("SUBSCRIPTION_UNAVAILABLE");
      assertVerified(candidate);
      if (!Number.isSafeInteger(expectedEpoch) || expectedEpoch < 0) throw Error("INVALID_EPOCH");
      let rows: Record<string, unknown>[];
      try { ({ rows } = await query("select subscription_development.apply_period_v1($1::jsonb,$2::bigint) as receipt", [JSON.stringify(candidate), expectedEpoch])); }
      catch { throw Error("RECONCILIATION_REQUIRED"); } // Includes unknown ACK: read/reconcile; never issue another identity.
      const r = rows.length === 1 ? rows[0].receipt : null;
      if (!record(r) || r.schemaVersion !== "subscription-ledger-receipt/1" || r.transactionId !== candidate.transactionId
        || r.descriptorId !== `Sandbox:${candidate.transactionId}` || !Number.isSafeInteger(r.epoch) || (r.epoch as number) < 1
        || typeof r.replayed !== "boolean" || !["recorded", "revoked"].includes(r.state as string)) throw Error("RECONCILIATION_REQUIRED");
      return Object.freeze(r) as Receipt;
    },
    async read(ownerId: string): Promise<Snapshot> {
      if (!query || !uuid(ownerId)) return closedSnapshot();
      try {
        const { rows } = await query("select subscription_development.read_owner_v1($1::uuid) as snapshot", [ownerId.toLowerCase()]);
        const snapshot = rows.length === 1 ? parseSnapshot(rows[0].snapshot) : null;
        if (!snapshot || snapshot.ownerId !== null && snapshot.ownerId !== ownerId.toLowerCase()) return closedSnapshot();
        return snapshot;
      } catch { return closedSnapshot(); } // A failed query is never a zero balance or absence.
    },
  });
}
