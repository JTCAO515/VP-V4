/** Explicit new text + offline-purpose choice, never a claim about authorship or rights. */
export type OfflineTextCommand = Readonly<{
  operationId: string; expectedHeadVersion: number; date: string; title: string; saveOffline: true;
}>;
const keys = ["operationId", "expectedHeadVersion", "date", "title", "saveOffline"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function parseOfflineTextCommand(value: unknown): OfflineTextCommand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== keys.length || !keys.every(key => Object.hasOwn(v, key))
    || typeof v.operationId !== "string" || !uuid.test(v.operationId)
    || typeof v.expectedHeadVersion !== "number" || !Number.isSafeInteger(v.expectedHeadVersion) || v.expectedHeadVersion < 0
    || typeof v.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)
    || typeof v.title !== "string" || v.title.length > 2048 || v.saveOffline !== true) return null;
  const title = v.title.trim();
  if (!title.length || title.length > 160
    || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(title)) return null;
  const date = new Date(`${v.date}T00:00:00.000Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== v.date) return null;
  return Object.freeze({ operationId: v.operationId, expectedHeadVersion: v.expectedHeadVersion, date: v.date, title, saveOffline: true });
}
