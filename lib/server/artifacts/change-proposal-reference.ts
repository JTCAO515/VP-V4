import type { ResultArtifactRead } from "./result-contract.ts";

export type ChangeProposalReference = Readonly<{
  schemaVersion: "change-proposal-reference/1";
  proposalId: string;
  proposalRevision: number;
  actions: readonly [];
}>;
export type ChangeProposalReferenceRead = Omit<ResultArtifactRead, "content"> & Readonly<{ content: ChangeProposalReference }>;

const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const short = (value: unknown, limit: number): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= limit;
const revision = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

export function parseChangeProposalReference(value: unknown): ChangeProposalReference | null {
  if (!object(value) || !exact(value, ["schemaVersion", "proposalId", "proposalRevision", "actions"])
    || value.schemaVersion !== "change-proposal-reference/1" || !uuid(value.proposalId)
    || !revision(value.proposalRevision) || value.proposalRevision > 2147483647
    || !Array.isArray(value.actions) || value.actions.length !== 0) return null;
  return value as ChangeProposalReference;
}

/** Exact current reference only. No confirmation material or generated proposal body. */
export function parseChangeProposalReferenceRead(value: unknown): ChangeProposalReferenceRead | null {
  if (!object(value) || !exact(value, ["kind", "artifactId", "revision", "currentRevision", "current", "historicalReadable", "lifecycle", "source", "basis", "content", "createdAt"])
    || value.kind !== "result_artifact" || !uuid(value.artifactId) || !revision(value.revision) || !revision(value.currentRevision)
    || typeof value.current !== "boolean" || value.historicalReadable !== true || !["active", "withdrawn"].includes(String(value.lifecycle))
    || !short(value.createdAt, 64) || !object(value.source) || !object(value.basis) || !object(value.content)) return null;
  const source = value.source, basis = value.basis;
  if (!exact(source, ["taskId", "taskTurnId", "goalId", "goalVersion", "inputMessageId", "inputSequence", "tripId", "tripVersion"])
    || !uuid(source.taskId) || !uuid(source.taskTurnId) || !uuid(source.goalId) || !revision(source.goalVersion) || !uuid(source.inputMessageId) || !revision(source.inputSequence)
    || (source.tripId !== null && !uuid(source.tripId)) || (source.tripId === null ? source.tripVersion !== null : !Number.isSafeInteger(source.tripVersion) || Number(source.tripVersion) < 0)) return null;
  if (!exact(basis, ["memories", "evidence"]) || !Array.isArray(basis.memories) || basis.memories.length > 20 || !Array.isArray(basis.evidence) || basis.evidence.length !== 0
    || !basis.memories.every(item => object(item) && exact(item, ["id", "revision"]) && uuid(item.id) && revision(item.revision))) return null;
  const content = parseChangeProposalReference(value.content);
  if (!content || value.current !== true || value.lifecycle !== "active" || value.revision !== value.currentRevision
    || value.source.tripId === null) return null;
  return value as ChangeProposalReferenceRead;
}
