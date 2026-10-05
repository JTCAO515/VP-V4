import { isUuid } from "../../identity/request-guards.ts";

export type ReservationBinding = Readonly<{ itemId: string; referenceId: string; referenceRevision: number }>;
export type EditScope = Readonly<{ dayIds: readonly string[]; itemIds: readonly string[] }>;
export type EditBasis = Readonly<{ contextId: string; contextDigest: string; baseVersion: number }>;
export type ManualEdit =
  | Readonly<{ kind: "move_item"; itemId: string; toDayId: string }>
  | Readonly<{ kind: "set_time"; itemId: string; startsAt: string | null; endsAt: string | null }>
  | Readonly<{ kind: "reorder_items"; dayId: string; itemIds: readonly string[] }>;
export type ScopedEditRequest =
  | Readonly<{ action: "context"; expectedHeadVersion: number; scope: EditScope; locale: "zh" | "en"; reservationBindings?: readonly ReservationBinding[] }>
  | Readonly<{ action: "manual"; operationId: string; basis: EditBasis; edit: ManualEdit }>
  | Readonly<{ action: "ask"; operationId: string; basis: EditBasis; text: string }>
  | Readonly<{ action: "lock"; operationId: string; basis: EditBasis; itemId: string; locked: boolean }>
  | Readonly<{ action: "read_operation"; operationId: string }>
  | Readonly<{ action: "abandon"; operationId: string; mutation: Exclude<ScopedEditRequest, { action: "context" | "read_operation" | "abandon" }> }>;
export const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
export const exact = (v: Record<string, unknown>, fields: readonly string[]) => Object.keys(v).length === fields.length && fields.every(k => Object.hasOwn(v, k));
export const integer = (v: unknown, min = 0): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= 2147483647;
export const identifier = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
export const uuid = (v: unknown): v is string => typeof v === "string" && isUuid(v) && v === v.toLowerCase();
export const digest = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
export function ids(v: unknown, min = 0, max = 64): v is readonly string[] { return Array.isArray(v) && v.length >= min && v.length <= max && v.every(identifier) && new Set(v).size === v.length; }
export function validScope(v: unknown): v is EditScope { return record(v) && exact(v, ["dayIds", "itemIds"]) && ids(v.dayIds, 0, 7) && ids(v.itemIds) && v.dayIds.length + v.itemIds.length > 0; }
export function validBasis(v: unknown): v is EditBasis { return record(v) && exact(v, ["contextId", "contextDigest", "baseVersion"]) && uuid(v.contextId) && digest(v.contextDigest) && integer(v.baseVersion); }
function timestamp(v: unknown): v is string { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v)); }
export function validManualEdit(v: unknown): v is ManualEdit {
  if (!record(v)) return false;
  if (v.kind === "move_item") return exact(v, ["kind", "itemId", "toDayId"]) && identifier(v.itemId) && identifier(v.toDayId);
  if (v.kind === "set_time") return exact(v, ["kind", "itemId", "startsAt", "endsAt"]) && identifier(v.itemId) && (v.startsAt === null || timestamp(v.startsAt)) && (v.endsAt === null || timestamp(v.endsAt)) && !(typeof v.startsAt === "string" && typeof v.endsAt === "string" && Date.parse(v.endsAt) <= Date.parse(v.startsAt));
  return v.kind === "reorder_items" && exact(v, ["kind", "dayId", "itemIds"]) && identifier(v.dayId) && ids(v.itemIds, 1);
}
/** Closed native/web mutation language. No client-authored patch, actor, fixed list,
 * model output, qualification or automatic confirmation is accepted. */
export function parseScopedEditRequest(v: unknown): ScopedEditRequest | null {
  if (!record(v)) return null;
  if (v.action === "context") return exact(v, ["action", "expectedHeadVersion", "scope", "locale", ...(Object.hasOwn(v, "reservationBindings") ? ["reservationBindings"] : [])]) && (v.reservationBindings === undefined || validReservationBindings(v.reservationBindings)) && integer(v.expectedHeadVersion) && validScope(v.scope) && ["zh", "en"].includes(String(v.locale)) ? v as ScopedEditRequest : null;
  if (v.action === "read_operation") return exact(v, ["action", "operationId"]) && uuid(v.operationId) ? v as ScopedEditRequest : null;
  if (v.action === "abandon") {
    if (!exact(v, ["action", "operationId", "mutation"]) || !uuid(v.operationId) || !record(v.mutation) || !["manual", "ask", "lock"].includes(String(v.mutation.action))) return null;
    const mutation = parseScopedEditRequest(v.mutation);
    return mutation && "operationId" in mutation && mutation.operationId === v.operationId ? v as ScopedEditRequest : null;
  }
  if (!uuid(v.operationId) || !validBasis(v.basis)) return null;
  if (v.action === "manual") return exact(v, ["action", "operationId", "basis", "edit"]) && validManualEdit(v.edit) ? v as ScopedEditRequest : null;
  if (v.action === "ask") return exact(v, ["action", "operationId", "basis", "text"]) && typeof v.text === "string" && v.text.trim().length > 0 && v.text.length <= 4000 && !v.text.includes("\0") ? v as ScopedEditRequest : null;
  if (v.action === "lock") return exact(v, ["action", "operationId", "basis", "itemId", "locked"]) && identifier(v.itemId) && typeof v.locked === "boolean" ? v as ScopedEditRequest : null;
  return null;
}

export function validReservationBindings(v: unknown): v is readonly ReservationBinding[] { return Array.isArray(v) && v.length <= 100 && v.every(b => record(b) && exact(b, ["itemId", "referenceId", "referenceRevision"]) && identifier(b.itemId) && uuid(b.referenceId) && integer(b.referenceRevision, 1)) && new Set(v.map(b => b.referenceId)).size === v.length; }
