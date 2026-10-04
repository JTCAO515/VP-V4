import { assertGroundedClaim, type GroundedClaim } from "../../contracts/index.ts";
import { decodeNativeSupportResult } from "../../trip/support/native-http.ts";
import type { TripContentRead } from "../../identity/user-data-adapter.ts";
import { record, uuid } from "./contract.ts";
import type { TrafficRPC, TrafficScope } from "./authority.ts";
export type ContextInput = { expectedHeadVersion: number; dayId: string; itemId: string; scope: TrafficScope | null };
export function parseContextInput(v: unknown, tripId: string): ContextInput | null {
  if (!record(v) || Object.keys(v).length !== 4 || !["expectedHeadVersion", "dayId", "itemId", "scope"].every(k => Object.hasOwn(v, k))
    || typeof v.expectedHeadVersion !== "number" || !Number.isSafeInteger(v.expectedHeadVersion) || v.expectedHeadVersion < 0 || v.expectedHeadVersion > 999999999
    || typeof v.dayId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(v.dayId) || typeof v.itemId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(v.itemId)) return null;
  if (v.scope !== null && (!record(v.scope) || Object.keys(v.scope).length !== 8 || v.scope.tripId !== tripId || v.scope.expectedHeadVersion !== v.expectedHeadVersion
    || v.scope.dayId !== v.dayId || v.scope.itemId !== v.itemId || !uuid(v.scope.originPlaceReferenceId) || !uuid(v.scope.destinationPlaceReferenceId)
    || v.scope.originPlaceReferenceId === v.scope.destinationPlaceReferenceId || !["walking", "transit", "driving"].includes(v.scope.mode as string) || v.scope.departure !== "now")) return null;
  return structuredClone(v) as ContextInput;
}
/** Labels reuse an existing current owner ItemSupport read. Unknown labels are null;
 * internal IDs are never promoted to display copy, and no item relation is inferred. */
export async function readForegroundContext(tripId: string, input: ContextInput, content: TripContentRead,
  references: readonly { id: string; canonicalPoiId: string }[], owner: TrafficRPC) {
  const all = content.days.flatMap(d => d.items.map(item => ({ dayId: d.id, item })));
  const selected = all.find(s => s.dayId === input.dayId && s.item.id === input.itemId);
  if (!selected) return null;
  const items = [selected, ...all.filter(s => s !== selected)].slice(0, 24);
  const labels = new Map<string, { zh: string; en: string; addressLines: string[]; source: "current_item_support" }>();
  const sourceBindings: unknown[] = []; let complete = all.length <= 24;
  for (const { dayId, item } of items) {
    const result = await owner("read_trip_item_support_v1", { p_trip: tripId, p_expected_trip_version: input.expectedHeadVersion, p_day: dayId, p_item: item.id });
    const decoded = !result.error ? decodeNativeSupportResult("read", result.data, tripId, { expectedTripVersion: input.expectedHeadVersion, dayId, itemId: item.id }) : null;
    if (!record(decoded) || !Array.isArray(decoded.entries)) { complete = false; continue; }
    for (const entry of decoded.entries) {
      if (!record(entry) || entry.scope !== "address_reference" || entry.status !== "reference_current" || entry.applicability !== "matched"
        || typeof entry.placeReferenceId !== "string" || !references.some(r => r.id === entry.placeReferenceId) || !record(entry.claim) || !record(entry.claim.value)
        || !Array.isArray(entry.claim.value.lines) || !entry.claim.value.lines.every(l => typeof l === "string" && l.length > 0 && l.length <= 160)) continue;
      try { assertGroundedClaim(entry.claim as GroundedClaim, Date.now()); } catch { continue; }
      if (!labels.has(entry.placeReferenceId)) labels.set(entry.placeReferenceId, { zh: item.title, en: item.title,
        addressLines: entry.claim.value.lines as string[], source: "current_item_support" });
      sourceBindings.push({ dayId, itemId: item.id, supportId: entry.supportId, version: entry.version, sourceDigest: entry.sourceDigest, claim: entry.claim });
    }
  }
  let stop: { status: "current" | "unavailable"; epoch: number | null; stopped: boolean | null } = { status: "unavailable", epoch: null, stopped: null };
  if (input.scope && references.some(r => r.id === input.scope!.originPlaceReferenceId) && references.some(r => r.id === input.scope!.destinationPlaceReferenceId)) {
    const result = await owner("read_foreground_traffic_scope_v1", { p_scope: input.scope });
    if (!result.error && record(result.data) && result.data.kind === "scope" && Object.keys(result.data).length === 3
      && typeof result.data.stopEpoch === "number" && Number.isSafeInteger(result.data.stopEpoch) && result.data.stopEpoch >= 0 && typeof result.data.stopped === "boolean") {
      stop = { status: "current", epoch: result.data.stopEpoch, stopped: result.data.stopped };
    }
  }
  return { data: { kind: "foreground_traffic_context/1", tripId, headVersion: input.expectedHeadVersion, dayId: input.dayId, itemId: input.itemId,
    references: references.map(r => ({ referenceId: r.id, canonicalPoiId: r.canonicalPoiId, referenceStatus: "current", display: labels.get(r.id) ?? null,
      displayStatus: labels.has(r.id) ? "current" : "unavailable", association: "explicit_selection_required" })),
    completeness: { references: "complete", labels: complete && labels.size === references.length ? "complete" : "partial", scannedItems: items.length, totalItems: all.length },
    stop, qualification: "not_granted_by_context", providerCalls: 0, tripMutation: "none" }, sourceBindings };
}
