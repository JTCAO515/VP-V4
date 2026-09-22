import { KNOWLEDGE_CITIES, type KnowledgeCity } from "../knowledge/publication/statement.ts";
import { isUuid } from "../identity/request-guards.ts";

export type Answer = "unknown" | "yes" | "no";
/** Request-local declarations. No profile/memory consent or document data is inferred. */
export type ReadinessInput = Readonly<{
  taskId: string; tripVersion: number; city: KnowledgeCity; locale: "zh" | "en";
  applies: Answer; documentReady: Answer; conditionsChecked: Answer;
  checkAt: "now" | "unknown" | string;
}>;
export function parseReadinessInput(value: unknown): ReadinessInput | null {
  if (!record(value) || Object.keys(value).sort().join() !== "applies,checkAt,city,conditionsChecked,documentReady,locale,taskId,tripVersion") return null;
  if (typeof value.taskId !== "string" || !isUuid(value.taskId) || !Number.isSafeInteger(value.tripVersion) || Number(value.tripVersion) < 0
    || !KNOWLEDGE_CITIES.includes(value.city as KnowledgeCity) || !(value.locale === "zh" || value.locale === "en")
    || ![value.applies, value.documentReady, value.conditionsChecked].every(v => v === "unknown" || v === "yes" || v === "no")
    || !(value.checkAt === "now" || value.checkAt === "unknown" || timestamp(value.checkAt) !== null)) return null;
  return value as ReadinessInput;
}
export function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
/** Explicit offset required: no local clock, inferred zone or normalized impossible dates. */
export function timestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const local = Date.parse(match[1] + "Z");
  if (!Number.isFinite(local) || new Date(local).toISOString().slice(0, 19) !== match[1]
    || (match[2] !== "Z" && (Number(match[2].slice(1, 3)) > 23 || Number(match[2].slice(4, 6)) > 59))) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}
