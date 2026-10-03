import { createHash, createPrivateKey, createPublicKey, sign as cryptoSign, type KeyObject } from "node:crypto";
import { OFFLINE_FIELDS, offlineCanonical, offlineDigest, type OfflineBasis, type OfflinePolicy, type OfflinePorts } from "./offline-read.ts";

type Environment = "local" | "staging" | "production";
type PolicyConfiguration = {
  version: "offline_read_policy/1"; environment: Environment; enabled: boolean; revoked: boolean;
  policyId: string; policyRevision: number; fieldAllowlist: typeof OFFLINE_FIELDS;
  issuedAt: string; expiresAt: string; maxLeaseMs: number;
};
export type OfflineProvenance = {
  subject: string; sessionEpoch: number; tripId: string; headVersion: number; snapshotDigest: string;
  userAuthoredDayIds: readonly string[]; userAuthoredItemIds: readonly string[];
};
export type OfflineConfigurationProvider = {
  readPolicy: () => string | undefined;
  readSigner: () => string | undefined;
};
const environmentValues = ["local", "staging", "production"];
const positive = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0;
const plain = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const only = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const asciiId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(v);
const timestamp = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
function parse(raw: string | undefined, max: number): unknown {
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > max) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
export function readOfflinePolicy(raw: string | undefined, environment: Environment, now: number): PolicyConfiguration | null {
  const v = parse(raw, 8192);
  if (!plain(v) || !only(v, ["version", "environment", "enabled", "revoked", "policyId", "policyRevision", "fieldAllowlist", "issuedAt", "expiresAt", "maxLeaseMs"])
    || v.version !== "offline_read_policy/1" || !environmentValues.includes(environment) || v.environment !== environment
    || v.enabled !== true || v.revoked !== false || !asciiId(v.policyId) || !positive(v.policyRevision) || !positive(v.maxLeaseMs)
    || !Array.isArray(v.fieldAllowlist) || offlineCanonical(v.fieldAllowlist) !== offlineCanonical(OFFLINE_FIELDS)
    || !timestamp(v.issuedAt) || !timestamp(v.expiresAt) || !Number.isSafeInteger(now)) return null;
  const issued = Date.parse(v.issuedAt), expires = Date.parse(v.expiresAt);
  if (issued > now || expires <= now || expires <= issued || expires - issued > v.maxLeaseMs) return null;
  return v as PolicyConfiguration;
}
export function readOfflineSigner(raw: string | undefined, environment: Environment): { keyId: string; privateKey: KeyObject } | null {
  try {
    const v = parse(raw, 12288);
    if (!plain(v) || !only(v, ["version", "environment", "algorithm", "keyId", "publicKeySpki", "privateKeyPkcs8Pem"])
      || v.version !== "offline_read_signer/1" || !environmentValues.includes(environment) || v.environment !== environment || v.algorithm !== "Ed25519"
      || typeof v.keyId !== "string" || !/^ed25519:[0-9a-f]{64}$/.test(v.keyId)
      || typeof v.publicKeySpki !== "string" || !/^[A-Za-z0-9_-]{1,172}$/.test(v.publicKeySpki)
      || typeof v.privateKeyPkcs8Pem !== "string" || Buffer.byteLength(v.privateKeyPkcs8Pem, "utf8") > 4096
      || !/^-----BEGIN PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END PRIVATE KEY-----\r?\n?$/.test(v.privateKeyPkcs8Pem)) return null;
    const declaredPublic = Buffer.from(v.publicKeySpki, "base64url");
    if (declaredPublic.toString("base64url") !== v.publicKeySpki || declaredPublic.length > 128) return null;
    const publicKey = createPublicKey({ key: declaredPublic, format: "der", type: "spki" });
    const privateKey = createPrivateKey({ key: v.privateKeyPkcs8Pem, format: "pem", type: "pkcs8" });
    if (privateKey.asymmetricKeyType !== "ed25519" || publicKey.asymmetricKeyType !== "ed25519") return null;
    const derivedPublic = createPublicKey(privateKey).export({ format: "der", type: "spki" });
    if (!derivedPublic.equals(declaredPublic) || v.keyId !== `ed25519:${createHash("sha256").update(derivedPublic).digest("hex")}`) return null;
    return { keyId: v.keyId, privateKey };
  } catch {
    // Never log malformed key content, provider data or crypto exceptions.
    return null;
  }
}

/** Explicit server environment provider. No public env variables or request-selected settings. */
const serverConfiguration: OfflineConfigurationProvider = {
  readPolicy: () => process.env.VISEPANDA_OFFLINE_READ_POLICY,
  readSigner: () => process.env.VISEPANDA_OFFLINE_READ_SIGNER,
};

/** Installed HTTP composition. Provenance is absent until a real authority reader is connected. */
export function productionOfflinePorts(
  readCurrent: OfflinePorts["readCurrent"], environment: Environment,
  configuration: OfflineConfigurationProvider = serverConfiguration,
  provenance?: (basis: OfflineBasis) => Promise<OfflineProvenance | null>,
  now: () => number = Date.now,
): OfflinePorts {
  let pinnedSigningKeyId: string | null = null;
  return {
    readCurrent, now,
    policy: async basis => {
      const config = readOfflinePolicy(configuration.readPolicy(), environment, now());
      if (!config || !provenance) return null;
      const receipt = await provenance(structuredClone(basis));
      if (!receipt || receipt.subject !== basis.subject || receipt.sessionEpoch !== basis.sessionEpoch
        || receipt.tripId !== basis.tripId || receipt.headVersion !== basis.headVersion || receipt.snapshotDigest !== offlineDigest(basis.payload)
        || !Array.isArray(receipt.userAuthoredDayIds) || !Array.isArray(receipt.userAuthoredItemIds)
        || !basis.payload.days.every(d => receipt.userAuthoredDayIds.includes(d.id) && d.items.every(i => receipt.userAuthoredItemIds.includes(i.id)))) return null;
      const currentConfig = readOfflinePolicy(configuration.readPolicy(), environment, now());
      if (!currentConfig || offlineCanonical(currentConfig) !== offlineCanonical(config)) return null;
      // Do not read private-key configuration until independently qualified provenance exists.
      const signer = readOfflineSigner(configuration.readSigner(), environment);
      if (!signer) return null;
      pinnedSigningKeyId ??= signer.keyId;
      return {
        policyId: config.policyId, policyRevision: config.policyRevision, issuedAt: config.issuedAt,
        expiresAt: config.expiresAt, maxLeaseMs: config.maxLeaseMs, signingKeyId: signer.keyId,
        userAuthoredDayIds: [...receipt.userAuthoredDayIds], userAuthoredItemIds: [...receipt.userAuthoredItemIds],
      } satisfies OfflinePolicy;
    },
    sign: async bytes => {
      if (!pinnedSigningKeyId || bytes.byteLength === 0 || bytes.byteLength > 128_000) return null;
      const signer = readOfflineSigner(configuration.readSigner(), environment);
      if (!signer || signer.keyId !== pinnedSigningKeyId) return null;
      return { algorithm: "Ed25519", keyId: signer.keyId, signature: cryptoSign(null, bytes, signer.privateKey).toString("base64url") };
    },
  };
}
