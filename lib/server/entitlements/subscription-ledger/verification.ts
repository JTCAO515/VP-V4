import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { AppStoreServerAPIClient, Environment, SignedDataVerifier, Type, type JWSTransactionDecodedPayload as Payload } from "@apple/app-store-server-library";
import { uuid, txid } from "./contract.ts";
import { types } from "node:util";
import { validateSubscriptionDevelopmentCatalog, type SubscriptionDevelopmentCatalog } from "../subscription-development/index.ts";

/** Direct #225 dependency; never another editable catalog. */
export type CatalogInput = SubscriptionDevelopmentCatalog;
export type Candidate = Readonly<{ schemaVersion: "subscription-verified-period/1"; environment: "Sandbox"; source: "apple_server_verified";
  ownerId: string; appAccountToken: string; transactionId: string; originalTransactionId: string; productId: string;
  subscriptionGroupId: string; purchaseAt: string; expiresAt: string; signedAt: string; checkedAt: string;
  revokedAt: string | null; transactionReason: "PURCHASE" | "RENEWAL"; receiptDigest: string;
  catalogVersion: 3; policyVersion: "subscription-development-policy/1"; capacitySnapshot: CatalogInput["serviceTaskCapacity"]["subscription"] }>;
const admitted = new WeakMap<object, Readonly<{ signal?: AbortSignal; deadline: number }>>();
export function assertVerified(candidate: Candidate): void {
  const lease = admitted.get(candidate);
  if (!lease) throw Error("UNTRUSTED_CANDIDATE");
  if (lease.signal?.aborted || performance.now() >= lease.deadline) throw Error("SUBSCRIPTION_CANCELLED");
}
export type VerificationPorts = Readonly<{ verify: (jws: string) => Promise<Payload>;
  readback: (id: string) => Promise<string>; now: () => number }>;
export type Binding = Readonly<{ environment: "Sandbox"; approvedProductId: string; approvedGroupId: string; bundleId: "space.go2china.VisePanda" }>;
const jwsValid = (v: unknown): v is string => typeof v === "string" && v.length >= 100 && v.length <= 20000 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v);
/** Descriptor-only snapshots: getters and proxies never become evidence or execute here. */
function dataObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || types.isProxy(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw Error("INVALID_DATA_OBJECT");
  return value as Record<string, unknown>;
}
function ownData(object: unknown, key: string, optional = false): unknown {
  const d = Object.getOwnPropertyDescriptor(dataObject(object), key);
  if (!d && optional) return undefined;
  if (!d || !("value" in d)) throw Error("INVALID_DATA_DESCRIPTOR");
  return d.value;
}
function frozenData(value: unknown, depth = 0): unknown {
  if (depth > 12) throw Error("INVALID_DATA_DEPTH");
  if (value === null || ["string", "boolean", "number"].includes(typeof value)) return value;
  if (Array.isArray(value)) {
    if (types.isProxy(value) || value.length > 200) throw Error("INVALID_DATA_ARRAY");
    const result: unknown[] = [];
    for (let i = 0; i < value.length; i++) {
      const d = Object.getOwnPropertyDescriptor(value, String(i));
      if (!d || !("value" in d)) throw Error("INVALID_DATA_DESCRIPTOR");
      result.push(frozenData(d.value, depth + 1));
    }
    return Object.freeze(result);
  }
  const o = dataObject(value), descriptors = Object.getOwnPropertyDescriptors(o);
  if (Object.keys(descriptors).length > 200) throw Error("INVALID_DATA_SIZE");
  const result = Object.create(null) as Record<string, unknown>;
  for (const [key, d] of Object.entries(descriptors)) {
    if (!("value" in d)) throw Error("INVALID_DATA_DESCRIPTOR");
    result[key] = frozenData(d.value, depth + 1);
  }
  return Object.freeze(result);
}
const payloadFields = ["transactionId", "originalTransactionId", "environment", "bundleId", "productId", "subscriptionGroupIdentifier", "type", "quantity", "appAccountToken", "inAppOwnershipType", "isUpgraded", "transactionReason", "purchaseDate", "expiresDate", "signedDate", "revocationDate", "revocationReason"] as const;
function payloadSnapshot(value: unknown): Payload {
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of payloadFields) {
    const v = ownData(value, key, true);
    if (v !== undefined && v !== null && !["string", "number", "boolean"].includes(typeof v)) throw Error("INVALID_PAYLOAD");
    result[key] = v;
  }
  return Object.freeze(result) as Payload;
}
export type VerificationControl = Readonly<{ signal?: AbortSignal; timeoutMs?: number }>;
function check(p: Payload, owner: string, b: Binding, now: number): void {
  if (!txid(p.transactionId) || !txid(p.originalTransactionId) || p.environment !== Environment.SANDBOX || p.bundleId !== b.bundleId
    || p.productId !== b.approvedProductId || p.subscriptionGroupIdentifier !== b.approvedGroupId
    || p.type !== Type.AUTO_RENEWABLE_SUBSCRIPTION || p.quantity !== 1 || p.appAccountToken?.toLowerCase() !== owner.toLowerCase()
    || p.inAppOwnershipType !== "PURCHASED" || p.isUpgraded === true || !["PURCHASE", "RENEWAL"].includes(p.transactionReason ?? "")
    || !Number.isSafeInteger(p.purchaseDate) || !Number.isSafeInteger(p.expiresDate) || !Number.isSafeInteger(p.signedDate)
    || p.purchaseDate! <= 0 || p.expiresDate! <= p.purchaseDate! || p.purchaseDate! > now || p.signedDate! < p.purchaseDate! || p.signedDate! > now
    || p.revocationDate !== undefined && (!Number.isSafeInteger(p.revocationDate) || p.revocationDate < p.purchaseDate! || p.revocationDate > p.signedDate!)
    || p.revocationReason !== undefined && p.revocationDate === undefined) throw Error("INVALID_TRANSACTION");
}
/** Server composition only. Capture data and function references before the first await. */
export function createDevelopmentVerifier(options?: Readonly<{ catalog: CatalogInput; binding: Binding; ports: VerificationPorts }>) {
  let captured: Readonly<{ catalog: CatalogInput; binding: Binding; ports: VerificationPorts }> | undefined;
  let captureError: unknown;
  if (options) {
    try {
      const catalog = frozenData(ownData(options, "catalog"));
      validateSubscriptionDevelopmentCatalog(catalog);
      const binding = frozenData(ownData(options, "binding")) as Binding;
      const p = ownData(options, "ports"), verify = ownData(p, "verify"), readback = ownData(p, "readback"), now = ownData(p, "now");
      if (typeof verify !== "function" || typeof readback !== "function" || typeof now !== "function") throw Error("INVALID_PORTS");
      captured = Object.freeze({ catalog, binding, ports: Object.freeze({ verify, readback, now }) as VerificationPorts });
    } catch { captureError = Error("CATALOG_OR_COMPOSITION_UNAVAILABLE"); }
  }
  return async (jws: string, owner: string, source: "Sandbox" | "localTest" = "Sandbox", control: VerificationControl = {}): Promise<Candidate> => {
    if (captureError) throw captureError;
    if (!captured || source !== "Sandbox") throw Error("SUBSCRIPTION_UNAVAILABLE");
    const { catalog, binding: b, ports } = captured;
    if (b.environment !== "Sandbox" || b.bundleId !== "space.go2china.VisePanda" || !/^\d{1,32}$/.test(b.approvedGroupId)
      || !b.approvedProductId || b.approvedProductId.length > 200 || b.approvedProductId.startsWith("dev.")
      || !uuid(owner) || !jwsValid(jws)) throw Error("INVALID_TRANSACTION");
    const signal = ownData(control, "signal", true) as AbortSignal | undefined;
    const timeoutMs = ownData(control, "timeoutMs", true) ?? 10000;
    if (!Number.isSafeInteger(timeoutMs) || (timeoutMs as number) < 1 || (timeoutMs as number) > 30000
      || signal !== undefined && !(signal instanceof AbortSignal)) throw Error("INVALID_CONTROL");
    const deadline = performance.now() + (timeoutMs as number);
    let pending = false, cancelled = false, stopped: Error | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    let rejectStop: (error: Error) => void = () => {};
    const stop = new Promise<never>((_resolve, reject) => { rejectStop = reject; });
    // A losing race may complete later; its rejection stays observed and can never mint evidence.
    void stop.catch(() => {});
    const abort = () => { cancelled = true; stopped = Error(pending ? "SUBSCRIPTION_INFLIGHT_UNKNOWN" : "SUBSCRIPTION_CANCELLED"); rejectStop(stopped); };
    const guard = () => {
      if (stopped) throw stopped;
      if (cancelled || signal?.aborted || performance.now() >= deadline) { stopped = Error(pending ? "SUBSCRIPTION_INFLIGHT_UNKNOWN" : "SUBSCRIPTION_CANCELLED"); throw stopped; }
    };
    async function bounded<T>(work: () => Promise<T>): Promise<T> {
      guard(); pending = true;
      try { const value = await Promise.race([Promise.resolve().then(() => { guard(); return work(); }), stop]); guard(); return value; }
      finally { pending = false; }
    }
    try {
      guard(); // Aborted before entry performs zero dependency calls.
      signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(abort, timeoutMs as number);
      const now = ports.now();
      if (!Number.isSafeInteger(now) || now <= 0) throw Error("SUBSCRIPTION_UNAVAILABLE");
      let device: Payload;
      try { device = payloadSnapshot(await bounded(() => ports.verify(jws))); }
      catch (e) { guard(); if (cancelled) throw e; throw Error("INVALID_TRANSACTION"); }
      guard(); check(device, owner, b, now);
      const requestedTransaction = device.transactionId!;
      let signed: string, current: Payload;
      try {
        signed = await bounded(() => ports.readback(requestedTransaction));
        guard();
        if (!jwsValid(signed)) throw Error("bad readback");
        current = payloadSnapshot(await bounded(() => ports.verify(signed)));
      } catch (e) { guard(); if (cancelled) throw e; throw Error("SUBSCRIPTION_UNAVAILABLE"); }
      guard();
      const checked = ports.now();
      if (!Number.isSafeInteger(checked) || checked < now || checked - now > 300000) throw Error("SUBSCRIPTION_UNAVAILABLE");
      check(current, owner, b, checked);
      if (current.transactionId !== requestedTransaction) throw Error("TRANSACTION_CONFLICT");
      for (const key of ["transactionId", "originalTransactionId", "productId", "subscriptionGroupIdentifier", "purchaseDate", "expiresDate", "transactionReason"] as const) {
        if (device[key] !== current[key]) throw Error("TRANSACTION_CONFLICT");
      }
      if (current.signedDate! < device.signedDate! || device.revocationDate !== undefined && device.revocationDate !== current.revocationDate) throw Error("TRANSACTION_CONFLICT");
      guard();
      const candidate: Candidate = Object.freeze({ schemaVersion: "subscription-verified-period/1", environment: "Sandbox", source: "apple_server_verified",
        ownerId: owner.toLowerCase(), appAccountToken: owner.toLowerCase(), transactionId: current.transactionId!, originalTransactionId: current.originalTransactionId!,
        productId: b.approvedProductId, subscriptionGroupId: b.approvedGroupId, purchaseAt: new Date(current.purchaseDate!).toISOString(), expiresAt: new Date(current.expiresDate!).toISOString(),
        signedAt: new Date(current.signedDate!).toISOString(), checkedAt: new Date(checked).toISOString(), revokedAt: current.revocationDate === undefined ? null : new Date(current.revocationDate).toISOString(),
        transactionReason: current.transactionReason as "PURCHASE" | "RENEWAL", receiptDigest: createHash("sha256").update(signed).digest("hex"), catalogVersion: 3,
        policyVersion: "subscription-development-policy/1", capacitySnapshot: catalog.serviceTaskCapacity.subscription });
      guard(); admitted.set(candidate, { signal, deadline });
      return candidate;
    } finally { if (timer) clearTimeout(timer); signal?.removeEventListener("abort", abort); }
  };
}
/** Constructed only by a future approved server root. Never reads process.env or calls Apple itself. */
export function appleSandboxPorts(credentials: Readonly<{ signingKey: string; keyId: string; issuerId: string }>): VerificationPorts {
  const root = readFileSync(new URL("../AppleRootCA-G3.cer", import.meta.url));
  const verifier = new SignedDataVerifier([root], true, Environment.SANDBOX, "space.go2china.VisePanda");
  const api = new AppStoreServerAPIClient(credentials.signingKey, credentials.keyId, credentials.issuerId, "space.go2china.VisePanda", Environment.SANDBOX);
  return { now: Date.now, verify: jws => verifier.verifyAndDecodeTransaction(jws), readback: async id => {
    const result = await api.getTransactionInfo(id);
    if (!result.signedTransactionInfo) throw Error("SUBSCRIPTION_UNAVAILABLE");
    return result.signedTransactionInfo;
  } };
}
