export const MEMORY_STATES = ["explicit", "confirmed", "inferred", "rejected", "paused", "deleted"] as const;
export const MEMORY_CONSENT_STATUSES = ["granted", "revoked"] as const;
export const MEMORY_CONSTRAINT_KINDS = ["preference", "hard_constraint"] as const;

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
  if (!Number.isFinite(Date.parse(memory.updatedAt))) throw new MemoryProfileError("Memory requires a valid update timestamp");
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
      const updated = Date.parse(right.memory.updatedAt) - Date.parse(left.memory.updatedAt);
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
