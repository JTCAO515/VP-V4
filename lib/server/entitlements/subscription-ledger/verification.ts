import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { AppStoreServerAPIClient, Environment, SignedDataVerifier, Type, type JWSTransactionDecodedPayload as Payload } from "@apple/app-store-server-library";
import { uuid, txid } from "./contract.ts";

/** Structural port supplied directly from #225's validated immutable catalog, not a second catalog. */
export type CatalogInput = Readonly<{ schemaVersion: string; catalogVersion: number; policyVersion: string; saleState: string;
  products: { subscription: { kind: string; period: { unit: string; value: number }; durationAuthority: string;
    storeKitProductId: null; price: null; purchasable: false } };
  serviceTaskCapacity: { subscription: { period: { kind: string; quantity: number }; burst: { kind: string; hours: number; quantity: number } } } }>;
export type Candidate = Readonly<{ schemaVersion: "subscription-verified-period/1"; environment: "Sandbox"; source: "apple_server_verified";
  ownerId: string; appAccountToken: string; transactionId: string; originalTransactionId: string; productId: string;
  subscriptionGroupId: string; purchaseAt: string; expiresAt: string; signedAt: string; checkedAt: string;
  revokedAt: string | null; transactionReason: "PURCHASE" | "RENEWAL"; receiptDigest: string;
  catalogVersion: 3; policyVersion: "subscription-development-policy/1"; capacitySnapshot: CatalogInput["serviceTaskCapacity"]["subscription"] }>;
const admitted = new WeakSet<object>();
export function assertVerified(candidate: Candidate): void {
  if (!admitted.has(candidate)) throw Error("UNTRUSTED_CANDIDATE");
}
export type VerificationPorts = Readonly<{ verify: (jws: string) => Promise<Payload>;
  readback: (id: string) => Promise<string>; now: () => number }>;
export type Binding = Readonly<{ environment: "Sandbox"; approvedProductId: string; approvedGroupId: string; bundleId: "space.go2china.VisePanda" }>;
const jwsValid = (v: unknown): v is string => typeof v === "string" && v.length >= 100 && v.length <= 20000 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v);
function catalogValid(c: CatalogInput): void {
  const s = c.products.subscription, capacity = c.serviceTaskCapacity.subscription;
  if (c.schemaVersion !== "subscription-development/1" || c.catalogVersion !== 3 || c.policyVersion !== "subscription-development-policy/1"
    || c.saleState !== "development_only" || s.kind !== "auto_renewing" || s.period.unit !== "month" || s.period.value !== 1
    || s.durationAuthority !== "apple_verified_period" || s.storeKitProductId !== null || s.price !== null || s.purchasable !== false
    || capacity.period.kind !== "per_verified_period" || capacity.period.quantity !== 80 || capacity.burst.kind !== "account_rolling"
    || capacity.burst.hours !== 24 || capacity.burst.quantity !== 12) throw Error("CATALOG_UNAVAILABLE");
}
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
/** Dependency injection is server composition only; never deserialize these ports or a caller boolean. */
export function createDevelopmentVerifier(options?: Readonly<{ catalog: CatalogInput; binding: Binding; ports: VerificationPorts }>) {
  return async (jws: string, owner: string, source: "Sandbox" | "localTest" = "Sandbox"): Promise<Candidate> => {
    // No env/credential reads, filesystem, network or writes before composition and source checks.
    if (!options || source !== "Sandbox") throw Error("SUBSCRIPTION_UNAVAILABLE");
    const { catalog, binding: b, ports } = options;
    catalogValid(catalog);
    if (b.environment !== "Sandbox" || b.bundleId !== "space.go2china.VisePanda" || !/^\d{1,32}$/.test(b.approvedGroupId)
      || !b.approvedProductId || b.approvedProductId.length > 200 || b.approvedProductId.startsWith("dev.")
      || !uuid(owner) || !jwsValid(jws)) throw Error("INVALID_TRANSACTION");
    const now = ports.now();
    if (!Number.isSafeInteger(now) || now <= 0) throw Error("SUBSCRIPTION_UNAVAILABLE");
    let device: Payload, current: Payload, signed: string;
    try { device = await ports.verify(jws); } catch { throw Error("INVALID_TRANSACTION"); }
    check(device, owner, b, now);
    try {
      signed = await ports.readback(device.transactionId!);
      if (!jwsValid(signed)) throw Error("bad readback");
      current = await ports.verify(signed);
    } catch { throw Error("SUBSCRIPTION_UNAVAILABLE"); }
    const checked = ports.now();
    if (!Number.isSafeInteger(checked) || checked < now || checked - now > 300000) throw Error("SUBSCRIPTION_UNAVAILABLE");
    check(current, owner, b, checked);
    for (const key of ["transactionId", "originalTransactionId", "productId", "subscriptionGroupIdentifier", "purchaseDate", "expiresDate", "transactionReason"] as const) {
      if (device[key] !== current[key]) throw Error("TRANSACTION_CONFLICT");
    }
    if (current.signedDate! < device.signedDate! || device.revocationDate !== undefined && device.revocationDate !== current.revocationDate) throw Error("TRANSACTION_CONFLICT");
    const candidate: Candidate = Object.freeze({ schemaVersion: "subscription-verified-period/1", environment: "Sandbox", source: "apple_server_verified",
      ownerId: owner.toLowerCase(), appAccountToken: owner.toLowerCase(), transactionId: current.transactionId!, originalTransactionId: current.originalTransactionId!,
      productId: b.approvedProductId, subscriptionGroupId: b.approvedGroupId, purchaseAt: new Date(current.purchaseDate!).toISOString(), expiresAt: new Date(current.expiresDate!).toISOString(),
      signedAt: new Date(current.signedDate!).toISOString(), checkedAt: new Date(checked).toISOString(), revokedAt: current.revocationDate === undefined ? null : new Date(current.revocationDate).toISOString(),
      transactionReason: current.transactionReason as "PURCHASE" | "RENEWAL", receiptDigest: createHash("sha256").update(signed).digest("hex"), catalogVersion: 3,
      policyVersion: "subscription-development-policy/1", capacitySnapshot: Object.freeze({ period: Object.freeze({ ...catalog.serviceTaskCapacity.subscription.period }), burst: Object.freeze({ ...catalog.serviceTaskCapacity.subscription.burst }) }) });
    admitted.add(candidate);
    return candidate;
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
