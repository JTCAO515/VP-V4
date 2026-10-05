import { isUuid } from "../../identity/request-guards.ts";

/** Archive proof exists only on a server-authorized Trip reference, never Task. */
export function validResultReference(value: unknown, field: "tripId" | "taskId", expectedId: string): value is Readonly<{
  kind: "result_reference"; artifactId: string; revision: number; archiveHistorical?: true;
}> & Record<"tripId" | "taskId", unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const keys = ["kind", "artifactId", "revision", field];
  if (field === "tripId" && Object.hasOwn(row, "archiveHistorical")) {
    if (row.archiveHistorical !== true) return false;
    keys.push("archiveHistorical");
  }
  return Object.keys(row).length === keys.length && keys.every(key => Object.hasOwn(row, key))
    && row.kind === "result_reference" && row[field] === expectedId && typeof row.artifactId === "string" && isUuid(row.artifactId)
    && Number.isSafeInteger(row.revision) && Number(row.revision) >= 1 && Number(row.revision) <= 1000;
}
