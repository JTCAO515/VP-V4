export type VersionRef = Readonly<{ version: string; digest: string }>;

export type VersionSnapshot = Readonly<{
  prompt: VersionRef;
  schema: VersionRef;
  routePolicy: VersionRef;
  safePhrase: VersionRef;
}>;

type PromptBoundary =
  | Readonly<{ kind: "ready"; stable: VersionSnapshot; variable: Readonly<{ tripVersion: string; evidenceVersion: string; messageVersion: string; externalText: "untrusted" }> }>
  | Readonly<{ kind: "invalid" }>;

const SNAPSHOT_KEYS = Object.freeze(["prompt", "schema", "routePolicy", "safePhrase"] as const);
const BOUNDARY_KEYS = Object.freeze(["versions", "tripVersion", "evidenceVersion", "messageVersion", "externalText"] as const);
const VERSION_PATTERN = /^[a-z][a-z0-9_-]{0,63}-v[1-9]\d*$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

/** Creates metadata-only prompt boundaries; raw prompt and reasoning content are never accepted. */
export function createPromptBoundary(value: unknown): PromptBoundary {
  if (!isRecord(value) || !hasExactKeys(value, BOUNDARY_KEYS) || !isVersionSnapshot(value.versions)) return invalid();
  if (!isVersionLabel(value.tripVersion) || !isVersionLabel(value.evidenceVersion) || !isVersionLabel(value.messageVersion) || value.externalText !== "untrusted") return invalid();
  return Object.freeze({
    kind: "ready",
    stable: copySnapshot(value.versions),
    variable: Object.freeze({
      tripVersion: value.tripVersion,
      evidenceVersion: value.evidenceVersion,
      messageVersion: value.messageVersion,
      externalText: "untrusted",
    }),
  });
}

export function isVersionSnapshot(value: unknown): value is VersionSnapshot {
  return isRecord(value)
    && hasExactKeys(value, SNAPSHOT_KEYS)
    && SNAPSHOT_KEYS.every((key) => isVersionRef(value[key]));
}

export function copyVersionSnapshot(snapshot: VersionSnapshot): VersionSnapshot {
  return copySnapshot(snapshot);
}

function copySnapshot(snapshot: VersionSnapshot): VersionSnapshot {
  return Object.freeze({
    prompt: copyRef(snapshot.prompt),
    schema: copyRef(snapshot.schema),
    routePolicy: copyRef(snapshot.routePolicy),
    safePhrase: copyRef(snapshot.safePhrase),
  });
}

function copyRef(ref: VersionRef): VersionRef {
  return Object.freeze({ version: ref.version, digest: ref.digest });
}

function isVersionRef(value: unknown): value is VersionRef {
  return isRecord(value) && hasExactKeys(value, ["version", "digest"])
    && isVersionLabel(value.version) && typeof value.digest === "string" && DIGEST_PATTERN.test(value.digest);
}

function isVersionLabel(value: unknown): value is string {
  return typeof value === "string" && VERSION_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function invalid(): PromptBoundary {
  return Object.freeze({ kind: "invalid" });
}
