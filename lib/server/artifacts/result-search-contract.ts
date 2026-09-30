import { isUuid } from "../identity/request-guards.ts";

export type ResultSearchItem = Readonly<{
  artifactId: string; revision: number; title: string; summary: string;
  tripId: string | null; tripVersion: number | null;
}>;
export type ResultSearchPage = Readonly<{ kind: "result_search"; results: readonly ResultSearchItem[]; nextCursor: string | null }>;
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));

export function parseResultSearchPage(value: unknown): ResultSearchPage | null {
  if (!object(value) || !exact(value, ["kind", "results", "nextCursor"]) || value.kind !== "result_search"
    || !Array.isArray(value.results) || value.results.length > 20
    || !(value.nextCursor === null || typeof value.nextCursor === "string" && isUuid(value.nextCursor))) return null;
  for (const row of value.results) {
    if (!object(row) || !exact(row, ["artifactId", "revision", "title", "summary", "tripId", "tripVersion"])
      || typeof row.artifactId !== "string" || !isUuid(row.artifactId)
      || !Number.isSafeInteger(row.revision) || Number(row.revision) < 1 || Number(row.revision) > 1000
      || typeof row.title !== "string" || !row.title.trim() || row.title.length > 120
      || typeof row.summary !== "string" || !row.summary.trim() || row.summary.length > 1000
      || !(row.tripId === null || typeof row.tripId === "string" && isUuid(row.tripId))
      || (row.tripId === null ? row.tripVersion !== null : !Number.isSafeInteger(row.tripVersion) || Number(row.tripVersion) < 0)) return null;
  }
  if (new Set(value.results.map(row => row.artifactId)).size !== value.results.length
    || value.nextCursor !== null && (value.results.length !== 20 || value.results.at(-1)?.artifactId !== value.nextCursor)) return null;
  return value as ResultSearchPage;
}
