import { readUserProvidedAddress, type UserAddressRead } from "../../lib/trip-user-address.ts";
import type { PendingProposalRead } from "../../lib/server/identity/user-data-adapter.ts";
import type { AddressContext } from "./context.ts";
export type AddressReviewContext = Omit<AddressContext, "actorKey">;
type ReadableAddress = Exclude<UserAddressRead, { kind: "unsupported" }>;
export type AddressChange = Readonly<{ dayId: string; itemId: string; title: string; before: ReadableAddress; after: ReadableAddress }>;
type Projection = Readonly<{ kind: "ready"; changes: readonly AddressChange[] }> | Readonly<{ kind: "unavailable"; mayChangeAddress: boolean }>;
const row = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function addresses(snapshot: unknown, version: number): Map<string, { dayId: string; itemId: string; title: string; address: ReadableAddress }> | null {
  if (!row(snapshot) || snapshot.version !== version || !Array.isArray(snapshot.days)) return null;
  const result = new Map<string, { dayId: string; itemId: string; title: string; address: ReadableAddress }>();
  const days = new Set<string>();
  for (const day of snapshot.days) {
    if (!row(day) || typeof day.id !== "string" || days.has(day.id) || !Array.isArray(day.items ?? [])) return null;
    days.add(day.id);
    for (const item of (day.items ?? []) as unknown[]) {
      if (!row(item) || typeof item.id !== "string" || item.dayId !== day.id || typeof item.title !== "string") return null;
      const address = readUserProvidedAddress(item.chineseAddress), key = JSON.stringify([day.id, item.id]);
      if (address.kind === "unsupported" || result.has(key)) return null;
      result.set(key, { dayId: day.id, itemId: item.id, title: item.title, address });
    }
  }
  return result;
}
function hasAddress(snapshot: unknown): boolean {
  return row(snapshot) && Array.isArray(snapshot.days) && snapshot.days.some(day => row(day) && Array.isArray(day.items)
    && day.items.some(item => row(item) && item.chineseAddress != null));
}
/** Actual before/after changes, including rollback removals, moved items and restored/deleted items. */
export function addressProposalChanges(pending: PendingProposalRead, context: Pick<AddressReviewContext, "tripId" | "tripVersion">): Projection {
  const p = pending.proposal, patch: unknown = p.patch;
  const mayChangeAddress = hasAddress(p.before) || hasAddress(p.after) || row(patch) && Array.isArray(patch.operations)
    && patch.operations.some(operation => row(operation) && operation.kind === "set_item_chinese_address");
  const invalid = (): Projection => ({ kind: "unavailable", mayChangeAddress });
  if (pending.trip.id !== context.tripId || pending.trip.headVersion !== context.tripVersion || p.baseTripVersion !== context.tripVersion
    || p.status !== "pending" || p.stale !== false || !Number.isSafeInteger(p.revision) || p.revision < 1
    || typeof p.digest !== "string" || !/^[a-f0-9]{64}$/.test(p.digest)
    || !row(patch) || patch.expectedVersion !== context.tripVersion || !Array.isArray(patch.operations)) return invalid();
  const before = addresses(p.before, context.tripVersion), after = addresses(p.after, context.tripVersion + 1);
  if (!before || !after) return invalid();
  const changes: AddressChange[] = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const left = before.get(key), right = after.get(key), old = left?.address ?? { kind: "missing" as const }, next = right?.address ?? { kind: "missing" as const };
    if ((old.kind === "provided" ? old.address.text : null) === (next.kind === "provided" ? next.address.text : null)) continue;
    const item = right ?? left!;
    changes.push({ dayId: item.dayId, itemId: item.itemId, title: item.title, before: old, after: next });
  }
  return { kind: "ready", changes };
}
/** Renderer and Confirm fence use the same projection; no source-reference availability is involved. */
export function addressProposalReview(pending: PendingProposalRead, context: AddressReviewContext): AddressChange | null {
  const projection = addressProposalChanges(pending, context);
  return projection.kind === "ready" ? projection.changes.find(change => change.dayId === context.dayId && change.itemId === context.itemId) ?? null : null;
}
