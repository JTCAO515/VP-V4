const DIRECT_UPLOAD_MIN_BYTES = 4_718_593;
const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,127}$/i;
const MEDIA_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

type MediaUnavailable = Readonly<{ kind: "media_unavailable" }>;
type PersistPolicy = Readonly<{
  receiptId: string;
  ownerId: string;
  dataClass: "C2";
  action: "persist";
  expiresAt: string;
}>;

export type PrivateMediaUpload =
  | Readonly<{
      kind: "direct_upload_required";
      ownerId: string;
      objectId: string;
      storagePath: string;
      policyReceiptId: string;
      maxFunctionBodyBytes: 4_718_592;
    }>
  | MediaUnavailable;

export function preparePrivateMediaUpload(input: unknown): PrivateMediaUpload {
  if (!isRecord(input, ["ownerId", "objectId", "storagePath", "byteLength", "media", "policy", "now"])) return unavailable();
  const { ownerId, objectId, storagePath, byteLength, media, policy, now } = input;
  if (!isSafeId(ownerId) || !isSafeId(objectId) || storagePath !== privatePath(ownerId, objectId)) return unavailable();
  if (typeof byteLength !== "number" || !Number.isSafeInteger(byteLength) || byteLength < DIRECT_UPLOAD_MIN_BYTES) return unavailable();
  if (!isMediaMetadata(media) || !isPersistPolicy(policy, ownerId, now)) return unavailable();
  // No authenticated actor or server-verified PolicyReceipt adapter exists yet.
  // Metadata supplied by a caller cannot authorize a private Storage capability.
  return unavailable();
}

export type PrivateMediaDeletion =
  | Readonly<{
      kind: "delete_required";
      ownerId: string;
      objectId: string;
      policyReceiptId: string;
      providerDeletion: "not_configured";
    }>
  | MediaUnavailable;

export function preparePrivateMediaDeletion(input: unknown): PrivateMediaDeletion {
  if (!isRecord(input, ["ownerId", "objectId", "storagePath", "policy", "now"])) return unavailable();
  const { ownerId, objectId, storagePath, policy, now } = input;
  if (!isSafeId(ownerId) || !isSafeId(objectId) || storagePath !== privatePath(ownerId, objectId) || !isPersistPolicy(policy, ownerId, now)) return unavailable();
  // As above, do not translate unverified caller metadata into a delete capability.
  return unavailable();
}

export type ProviderFileDeletion =
  | Readonly<{ kind: "provider_delete_required"; provider: "deepseek_files"; fileId: string }>
  | MediaUnavailable;

export function prepareProviderFileDeletion(input: unknown): ProviderFileDeletion {
  if (!isRecord(input, ["provider", "fileId", "expiresAt", "now"])) return unavailable();
  const { provider, fileId, expiresAt, now } = input;
  if (provider !== "deepseek_files" || !isSafeId(fileId) || !isFutureInstant(expiresAt, now)) return unavailable();
  // A provider file ID is not an authorization capability. Until an authenticated,
  // owner-bound provider-file receipt exists server-side, never emit a delete intent.
  return unavailable();
}

function isPersistPolicy(value: unknown, ownerId: string, now: unknown): value is PersistPolicy {
  if (!isRecord(value, ["receiptId", "ownerId", "dataClass", "action", "expiresAt"])) return false;
  return isSafeId(value.receiptId) && value.ownerId === ownerId && value.dataClass === "C2" && value.action === "persist" && isFutureInstant(value.expiresAt, now);
}

function isMediaMetadata(value: unknown): value is Readonly<{ declaredMime: string; magicMime: string }> {
  return isRecord(value, ["declaredMime", "magicMime"]) && typeof value.declaredMime === "string" && value.declaredMime === value.magicMime && MEDIA_MIMES.has(value.magicMime);
}

function isFutureInstant(value: unknown, now: unknown): boolean {
  if (typeof value !== "string" || typeof now !== "string") return false;
  const expiresAt = parseRfc3339(value);
  const current = parseRfc3339(now);
  return expiresAt !== null && current !== null && expiresAt > current;
}

function parseRfc3339(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!match) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day && utc.getUTCHours() === hour && utc.getUTCMinutes() === minute && utc.getUTCSeconds() === second ? timestamp : null;
}

function isRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => key in value);
}

function isSafeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

function privatePath(ownerId: string, objectId: string): string {
  return `private/${ownerId}/${objectId}`;
}

function unavailable(): MediaUnavailable {
  return freeze({ kind: "media_unavailable" as const });
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}
