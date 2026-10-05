import { record, exact, revision, digest, itemId, uuid, selection } from "./place-action-base.ts";
import type { PlaceActionInput, PlaceMutation } from "./place-action-contract.ts";
const locale = (v: unknown) => v === "zh" || v === "en";
function instant(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const p = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(v);
  if (!p) return false;
  const year = Number(p[1]), month = Number(p[2]), day = Number(p[3]);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= last && Number(p[4]) < 24 && Number(p[5]) < 60 && Number(p[6]) < 60
    && (p[7] === undefined || Number(p[7]) <= 14 && Number(p[8]) < 60 && (Number(p[7]) < 14 || Number(p[8]) === 0)) && Number.isFinite(Date.parse(v));
}
/** Caller supplies identity and explicit choices only. No title, source, route, actor, consent or policy assertions. */
export function parsePlaceCommand(v: unknown, receipt = true): PlaceActionInput | null {
  if (!record(v)) return null;
  if (v.action === "saved") return receipt && exact(v, ["action", "expectedTripVersion", "locale", "limit", "cursor"]) && revision(v.expectedTripVersion) && locale(v.locale)
    && revision(v.limit) && v.limit >= 1 && v.limit <= 100 && (v.cursor === null || record(v.cursor) && exact(v.cursor, ["contextDigest", "afterCanonicalPoiId"]) && digest(v.cursor.contextDigest) && uuid(v.cursor.afterCanonicalPoiId)) ? structuredClone(v) as PlaceActionInput : null;
  if (v.action === "receipt" || v.action === "abandon") {
    if (!receipt || !exact(v, ["action", "request"])) return null;
    const request = parsePlaceCommand(v.request, false);
    return request && ["save", "unsave", "add"].includes(request.action) ? { action: v.action, request: request as PlaceMutation } : null;
  }
  if (!revision(v.expectedTripVersion) || !selection(v.selection)) return null;
  const common = ["action", "expectedTripVersion", "selection"];
  if (v.action === "context") return exact(v, [...common, "locale"]) && locale(v.locale) ? structuredClone(v) as PlaceActionInput : null;
  if (!digest(v.expectedMappingDigest)) return null;
  common.push("expectedMappingDigest");
  if (v.action === "ask") return exact(v, [...common, "locale"]) && locale(v.locale) ? structuredClone(v) as PlaceActionInput : null;
  if (!uuid(v.operationId)) return null;
  common.push("operationId");
  if (v.action === "save" && exact(v, [...common, "expectedSaveRevision"]) && revision(v.expectedSaveRevision)) return structuredClone(v) as PlaceMutation;
  if (v.action === "unsave" && exact(v, [...common, "referenceId", "expectedSaveRevision"]) && uuid(v.referenceId) && revision(v.expectedSaveRevision) && v.expectedSaveRevision > 0) return structuredClone(v) as PlaceMutation;
  if (v.action === "add" && exact(v, [...common, "dayId", "itemId", "startsAt", "endsAt", "locale"]) && itemId(v.dayId) && itemId(v.itemId) && instant(v.startsAt) && instant(v.endsAt)
    && Date.parse(v.endsAt) > Date.parse(v.startsAt) && Date.parse(v.endsAt) - Date.parse(v.startsAt) <= 86400000 && locale(v.locale)) {
    return structuredClone(v) as PlaceMutation;
  }
  return null;
}
