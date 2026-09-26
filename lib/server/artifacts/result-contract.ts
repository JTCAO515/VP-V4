export type ComparisonOption = Readonly<{ id: string; title: string; tradeoff: string }>;
export type ComparisonContent = Readonly<{
  schemaVersion: "comparison/1";
  title: string;
  summary: string;
  options: readonly ComparisonOption[];
  actions: readonly [];
}>;

export type ResultArtifactRead = Readonly<{
  kind: "result_artifact";
  artifactId: string;
  revision: number;
  currentRevision: number;
  current: boolean;
  historicalReadable: true;
  lifecycle: "active" | "withdrawn";
  source: Readonly<{ taskId: string; goalId: string; goalVersion: number; inputMessageId: string; inputSequence: number; tripId: string | null; tripVersion: number | null }>;
  basis: Readonly<{ memories: readonly Readonly<{ id: string; revision: number }>[]; evidence: readonly [] }>;
  content: ComparisonContent;
  createdAt: string;
}>;

const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const short = (value: unknown, limit: number): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= limit;
const revision = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

/** Closed renderer input. Unknown schema, HTML/URL/action fields and partial reads fail closed. */
export function parseResultArtifactRead(value: unknown): ResultArtifactRead | null {
  if (!object(value) || !exact(value, ["kind", "artifactId", "revision", "currentRevision", "current", "historicalReadable", "lifecycle", "source", "basis", "content", "createdAt"])
    || value.kind !== "result_artifact" || !uuid(value.artifactId) || !revision(value.revision) || !revision(value.currentRevision)
    || typeof value.current !== "boolean" || value.historicalReadable !== true || !["active", "withdrawn"].includes(String(value.lifecycle))
    || !short(value.createdAt, 64) || !object(value.source) || !object(value.basis) || !object(value.content)) return null;
  const source = value.source, basis = value.basis, content = value.content;
  if (!exact(source, ["taskId", "goalId", "goalVersion", "inputMessageId", "inputSequence", "tripId", "tripVersion"])
    || !uuid(source.taskId) || !uuid(source.goalId) || !revision(source.goalVersion) || !uuid(source.inputMessageId) || !revision(source.inputSequence)
    || (source.tripId !== null && !uuid(source.tripId)) || (source.tripId === null ? source.tripVersion !== null : !Number.isSafeInteger(source.tripVersion) || Number(source.tripVersion) < 0)) return null;
  if (!exact(basis, ["memories", "evidence"]) || !Array.isArray(basis.memories) || basis.memories.length > 20 || !Array.isArray(basis.evidence) || basis.evidence.length !== 0
    || !basis.memories.every(item => object(item) && exact(item, ["id", "revision"]) && uuid(item.id) && revision(item.revision))) return null;
  if (!exact(content, ["schemaVersion", "title", "summary", "options", "actions"]) || content.schemaVersion !== "comparison/1"
    || !short(content.title, 120) || !short(content.summary, 1000) || !Array.isArray(content.options)
    || content.options.length < 2 || content.options.length > 4 || !Array.isArray(content.actions) || content.actions.length !== 0
    || !content.options.every(option => object(option) && exact(option, ["id", "title", "tradeoff"])
      && short(option.id, 40) && /^[a-z0-9_-]+$/.test(option.id) && short(option.title, 120) && short(option.tradeoff, 500))
    || new Set(content.options.map(option => (option as ComparisonOption).id)).size !== content.options.length) return null;
  if (value.current && (value.lifecycle !== "active" || value.revision !== value.currentRevision)) return null;
  return value as ResultArtifactRead;
}
