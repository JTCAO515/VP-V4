import { createHash } from "node:crypto";

export const OFFLINE_FIELDS = Object.freeze(["days.date", "days.items.title"] as const);
export type OfflinePayload = { days: { id: string; date: string; items: { id: string; title: string }[] }[] };
export type OfflineBasis = {
  subject: string; sessionEpoch: number | null; tripId: string; headVersion: number;
  confirmed: boolean; active: boolean; payload: OfflinePayload;
};
export type OfflinePolicy = {
  policyId: string; policyRevision: number; issuedAt: string; expiresAt: string; maxLeaseMs: number;
  // Trusted provenance authority, never inferred from item text or caller input.
  userAuthoredDayIds: readonly string[]; userAuthoredItemIds: readonly string[];
};
export type OfflinePackage = {
  kind: "offline_trip_read/1"; subject: string; sessionEpoch: number; tripId: string; headVersion: number;
  policyId: string; policyRevision: number; issuedAt: string; expiresAt: string;
  fieldAllowlist: typeof OFFLINE_FIELDS; snapshotDigest: string; payload: OfflinePayload;
  proof: { algorithm: "Ed25519"; keyId: string; signature: string };
};
export type OfflineUnavailable = { kind: "unavailable"; reason: "POLICY_UNCONFIGURED" | "NOT_ELIGIBLE" | "STALE_BASIS" };
export type OfflinePorts = {
  readCurrent: () => Promise<OfflineBasis | null>;
  policy?: (basis: OfflineBasis) => Promise<OfflinePolicy | null>;
  sign?: (bytes: Uint8Array) => Promise<OfflinePackage["proof"] | null>;
  now?: () => number;
};
const unavailable = (reason: OfflineUnavailable["reason"]): OfflineUnavailable => ({ kind: "unavailable", reason });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const positive = (n: number) => Number.isSafeInteger(n) && n > 0;
const text = (s: string, max: number) => typeof s === "string" && s.length > 0 && s.length <= max && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(s);

/** Canonical JSON: recursively ASCII-sort keys; JSON.stringify string escaping, UTF-8, no whitespace. */
export function offlineCanonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(offlineCanonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${offlineCanonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  if (typeof value === "number" && !Number.isSafeInteger(value)) throw new Error("Non-integer canonical number");
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Invalid canonical value");
  return encoded;
}
export const offlineDigest = (payload: OfflinePayload) => createHash("sha256").update(offlineCanonical(payload), "utf8").digest("hex");
function validBasis(b: OfflineBasis, tripId: string, head: number): boolean {
  if (!uuid.test(b.subject) || (b.sessionEpoch === null || !positive(b.sessionEpoch)) || b.tripId !== tripId || b.headVersion !== head || b.active !== true || b.confirmed !== true) return false;
  if (!Array.isArray(b.payload.days) || b.payload.days.length === 0 || b.payload.days.length > 60) return false;
  const days = new Set<string>(), items = new Set<string>();
  for (const day of b.payload.days) {
    if (!uuid.test(day.id) || days.has(day.id) || typeof day.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day.date) || new Date(day.date).toISOString().slice(0, 10) !== day.date || !Array.isArray(day.items) || day.items.length > 100) return false;
    days.add(day.id);
    for (const item of day.items) {
      if (!uuid.test(item.id) || items.has(item.id) || !text(item.title, 2000) || Object.keys(item).some(k => !["id", "title"].includes(k))) return false;
      items.add(item.id);
    }
    if (Object.keys(day).some(k => !["id", "date", "items"].includes(k))) return false;
  }
  return Object.keys(b.payload).length === 1 && Buffer.byteLength(offlineCanonical(b.payload), "utf8") <= 128_000;
}
function validPolicy(p: OfflinePolicy, b: OfflineBasis, now: number): boolean {
  const issued = Date.parse(p.issuedAt), expires = Date.parse(p.expiresAt);
  return text(p.policyId, 128) && positive(p.policyRevision) && positive(p.maxLeaseMs)
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(p.issuedAt) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(p.expiresAt)
    && Number.isFinite(issued) && Number.isFinite(expires)
    && new Date(issued).toISOString() === p.issuedAt && new Date(expires).toISOString() === p.expiresAt
    && issued <= now && now < expires && expires > issued && expires - issued <= p.maxLeaseMs
    && b.payload.days.every(d => p.userAuthoredDayIds.includes(d.id) && d.items.every(i => p.userAuthoredItemIds.includes(i.id)));
}

/** Read-only issuance; ports are server authority. No client metadata can grant cache rights. */
export async function issueOfflineRead(tripId: string, expectedHeadVersion: number, ports: OfflinePorts): Promise<OfflinePackage | OfflineUnavailable> {
  if (!uuid.test(tripId) || !positive(expectedHeadVersion)) return unavailable("NOT_ELIGIBLE");
  const now = ports.now ?? Date.now;
  try {
    const initial = await ports.readCurrent();
    if (!initial) return unavailable("NOT_ELIGIBLE");
    if (initial.headVersion !== expectedHeadVersion) return unavailable("STALE_BASIS");
    if (initial.tripId !== tripId || !uuid.test(initial.subject) || initial.active !== true || initial.confirmed !== true) return unavailable("NOT_ELIGIBLE");
    // Detach from mutable adapter objects before any asynchronous authority call.
    const basis: OfflineBasis = structuredClone(initial);
    if (!ports.policy || !ports.sign) return unavailable("POLICY_UNCONFIGURED");
    if (!validBasis(basis, tripId, expectedHeadVersion) || basis.sessionEpoch === null) return unavailable("NOT_ELIGIBLE");
    const policy = await ports.policy(structuredClone(basis));
    if (!policy) return unavailable("POLICY_UNCONFIGURED");
    const pinnedPolicy = structuredClone(policy);
    if (!validPolicy(pinnedPolicy, basis, now())) return unavailable("NOT_ELIGIBLE");
    const unsigned = {
      kind: "offline_trip_read/1" as const, subject: basis.subject, sessionEpoch: basis.sessionEpoch,
      tripId, headVersion: expectedHeadVersion, policyId: pinnedPolicy.policyId, policyRevision: pinnedPolicy.policyRevision,
      issuedAt: pinnedPolicy.issuedAt, expiresAt: pinnedPolicy.expiresAt,
      fieldAllowlist: OFFLINE_FIELDS, snapshotDigest: offlineDigest(basis.payload), payload: basis.payload,
    };
    const proof = await ports.sign(Buffer.from(offlineCanonical(unsigned), "utf8"));
    if (!proof || proof.algorithm !== "Ed25519" || !text(proof.keyId, 128) || !/^[A-Za-z0-9_-]{86}$/.test(proof.signature) || Buffer.from(proof.signature, "base64url").length !== 64 || Buffer.from(proof.signature, "base64url").toString("base64url") !== proof.signature || Object.keys(proof).length !== 3) return unavailable("POLICY_UNCONFIGURED");
    const final = await ports.readCurrent();
    if (!final || !validBasis(final, tripId, expectedHeadVersion) || offlineCanonical(final) !== offlineCanonical(basis)) return unavailable("STALE_BASIS");
    const currentPolicy = await ports.policy(structuredClone(final));
    if (!currentPolicy || offlineCanonical(currentPolicy) !== offlineCanonical(pinnedPolicy) || !validPolicy(currentPolicy, final, now())) return unavailable("STALE_BASIS");
    const settled = await ports.readCurrent();
    if (!settled || !validBasis(settled, tripId, expectedHeadVersion) || offlineCanonical(settled) !== offlineCanonical(basis) || !validPolicy(currentPolicy, settled, now())) return unavailable("STALE_BASIS");
    const result = { ...unsigned, proof: structuredClone(proof) };
    return Buffer.byteLength(offlineCanonical(result), "utf8") <= 128_000 ? result : unavailable("NOT_ELIGIBLE");
  } catch { return unavailable("NOT_ELIGIBLE"); }
}
