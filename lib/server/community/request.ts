const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isCommunityInput(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const exact = (keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
  const text = (s: unknown, n: number) => typeof s === "string" && s.trim().length > 0 && s.length <= n;
  if (v.action === "mine" || v.action === "queue") return exact(["action"]);
  if (typeof v.operationId !== "string" || !uuid.test(v.operationId) || typeof v.submissionId !== "string" || !uuid.test(v.submissionId)) return false;
  if (v.action === "submit") return exact(["action", "operationId", "submissionId", "title", "content", "consent"])
    && text(v.title, 160) && text(v.content, 4000) && v.consent === "internal-review-v1";
  if (typeof v.expectedVersion !== "number" || !Number.isInteger(v.expectedVersion) || v.expectedVersion < 1 || v.expectedVersion > 2) return false;
  if (v.action === "withdraw") return exact(["action", "operationId", "submissionId", "expectedVersion"]);
  return v.action === "review" && v.expectedVersion === 1
    && exact(["action", "operationId", "submissionId", "expectedVersion", "decision", "note"])
    && (v.decision === "approve" || v.decision === "reject") && text(v.note, 400);
}
