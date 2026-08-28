export const MEMORY_STATES = ["explicit", "confirmed", "inferred", "rejected", "paused", "deleted"] as const;
export const MEMORY_CONSENT_STATUSES = ["granted", "revoked"] as const;
export const MEMORY_CONSTRAINT_KINDS = ["preference", "hard_constraint"] as const;
const RFC3339_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/;

export type MemoryState = (typeof MEMORY_STATES)[number];
export type MemoryConsentStatus = (typeof MEMORY_CONSENT_STATUSES)[number];
export type MemoryConstraintKind = (typeof MEMORY_CONSTRAINT_KINDS)[number];

export type MemoryProfile = Readonly<{
  id: string;
  ownerId: string;
  sourceReceiptId: string;
  consentStatus: MemoryConsentStatus;
  state: MemoryState;
  constraintKind: MemoryConstraintKind;
  summary: string | null;
  updatedAt: string;
}>;

export function assertMemoryProfile(memory: MemoryProfile): void {
  if (!isBoundedId(memory.id) || !isBoundedId(memory.ownerId) || !isBoundedId(memory.sourceReceiptId)) {
    throw new MemoryProfileError("Memory requires bounded owner and source receipt identifiers");
  }
  if (!MEMORY_STATES.includes(memory.state)) throw new MemoryProfileError("Unknown memory state");
  if (!MEMORY_CONSENT_STATUSES.includes(memory.consentStatus)) throw new MemoryProfileError("Unknown memory consent status");
  if (!MEMORY_CONSTRAINT_KINDS.includes(memory.constraintKind)) throw new MemoryProfileError("Unknown memory constraint kind");
  parseMemoryTimestamp(memory.updatedAt);
  if (memory.state === "deleted") {
    if (memory.summary !== null) throw new MemoryProfileError("Deleted memory must not retain a retrievable summary");
  } else if (typeof memory.summary !== "string" || memory.summary.length < 1 || memory.summary.length > 500) {
    throw new MemoryProfileError("Memory summary must be bounded");
  }
  if (memory.constraintKind === "hard_constraint" && memory.state === "inferred") {
    throw new MemoryProfileError("An inferred memory cannot become a hard constraint");
  }
}

export function projectRetrievableMemory(memories: readonly MemoryProfile[]): readonly MemoryProfile[] {
  return memories
    .map((memory, index) => ({ memory, index }))
    .map(({ memory, index }) => {
      assertMemoryProfile(memory);
      return { memory, index };
    })
    .filter(({ memory }) => memory.consentStatus === "granted" && (memory.state === "explicit" || memory.state === "confirmed"))
    .sort((left, right) => {
      const kind = Number(right.memory.constraintKind === "hard_constraint") - Number(left.memory.constraintKind === "hard_constraint");
      if (kind !== 0) return kind;
      const updated = parseMemoryTimestamp(right.memory.updatedAt) - parseMemoryTimestamp(left.memory.updatedAt);
      return updated !== 0 ? updated : left.index - right.index;
    })
    .map(({ memory }) => memory);
}

export class MemoryProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoryProfileError";
  }
}

function isBoundedId(value: string): boolean {
  return typeof value === "string" && value.length > 0 && value.length <= 160;
}

function parseMemoryTimestamp(value: unknown): number {
  if (typeof value !== "string") throw new MemoryProfileError("Memory requires a timezone-qualified RFC3339 update timestamp");
  const match = RFC3339_TIMESTAMP.exec(value);
  if (!match) throw new MemoryProfileError("Memory requires a timezone-qualified RFC3339 update timestamp");
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const offsetHour = Number(match[9] ?? 0);
  const offsetMinute = Number(match[10] ?? 0);
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    offsetHour > 23 || offsetMinute > 59 ||
    calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day || calendar.getUTCHours() !== hour ||
    calendar.getUTCMinutes() !== minute || calendar.getUTCSeconds() !== second
  ) throw new MemoryProfileError("Memory requires a real RFC3339 update timestamp");
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) throw new MemoryProfileError("Memory requires a valid update timestamp");
  return timestamp;
}
