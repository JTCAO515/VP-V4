import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { exportCanonical, type ExportBundle, type ExportLease } from "./export-dispatcher.ts";
export type ExportKey = { keyId: string; key: Uint8Array };
export type ExportArtifact = { schemaVersion: "privacy-export-artifact/1"; keyId: string; nonce: string; tag: string; ciphertext: string; plaintextDigest: string; plaintextBytes: number; expiresAt: string };
const utc = (v: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const maxBytes = 8_388_608;
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const aad = (lease: ExportLease) => Buffer.from(exportCanonical(["privacy-core-export/1", lease.requestId, lease.ownerId, lease.generation]), "utf8");
function base64(raw: unknown, min: number, max: number): Buffer | null {
  if (typeof raw !== "string" || raw.length > Math.ceil(max * 4 / 3) || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  const value = Buffer.from(raw, "base64url");
  return value.length >= min && value.length <= max && value.toString("base64url") === raw ? value : null;
}
export function parseExportKey(value: unknown): ExportKey | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join() !== "algorithm,key,keyId" || v.algorithm !== "AES-256-GCM" || typeof v.keyId !== "string" || !/^[A-Za-z0-9_.:-]{1,128}$/.test(v.keyId)) return null;
  const key = base64(v.key, 32, 32);
  return key ? { keyId: v.keyId, key } : null;
}
export function encryptExportArtifact(bundle: ExportBundle, lease: ExportLease, key: ExportKey, expiresAt: string): ExportArtifact | null {
  try {
    const plaintext = Buffer.from(exportCanonical(bundle), "utf8");
    if (bundle.requestId !== lease.requestId || plaintext.length < 1 || plaintext.length > maxBytes || key.key.length !== 32 || !utc(expiresAt)) return null;
    const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key.key, nonce);
    cipher.setAAD(aad(lease));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { schemaVersion: "privacy-export-artifact/1", keyId: key.keyId, nonce: nonce.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), ciphertext: ciphertext.toString("base64url"), plaintextDigest: sha(plaintext), plaintextBytes: plaintext.length, expiresAt };
  } catch { return null; }
}
export function decryptExportArtifact(value: unknown, lease: ExportLease, key: ExportKey, now = Date.now()): Buffer | null {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const v = value as Record<string, unknown>;
    if (Object.keys(v).sort().join() !== "ciphertext,expiresAt,keyId,nonce,plaintextBytes,plaintextDigest,schemaVersion,tag" || v.schemaVersion !== "privacy-export-artifact/1" || v.keyId !== key.keyId
      || typeof v.expiresAt !== "string" || !utc(v.expiresAt) || Date.parse(v.expiresAt) <= now
      || typeof v.plaintextDigest !== "string" || !/^[0-9a-f]{64}$/.test(v.plaintextDigest) || !Number.isSafeInteger(v.plaintextBytes) || Number(v.plaintextBytes) < 1 || Number(v.plaintextBytes) > maxBytes || key.key.length !== 32) return null;
    const nonce = base64(v.nonce, 12, 12), tag = base64(v.tag, 16, 16), ciphertext = base64(v.ciphertext, 1, maxBytes);
    if (!nonce || !tag || !ciphertext || ciphertext.length !== v.plaintextBytes) return null;
    const decipher = createDecipheriv("aes-256-gcm", key.key, nonce);
    decipher.setAAD(aad(lease)); decipher.setAuthTag(tag);
    const bytes = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    if (bytes.length !== v.plaintextBytes || sha(bytes) !== v.plaintextDigest) return null;
    const bundle = JSON.parse(bytes.toString("utf8"));
    if (bundle?.schemaVersion !== "privacy-core-export/1" || bundle.requestId !== lease.requestId || exportCanonical(bundle) !== bytes.toString("utf8")) return null;
    return bytes;
  } catch { return null; }
}
