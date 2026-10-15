import { readUserProvidedAddress, isUserAddressText, type UserAddressRead } from "../../lib/trip-user-address.ts";
import type { PendingProposalRead } from "../../lib/server/identity/user-data-adapter.ts";
import type { AddressContext } from "./context.ts";

export type AddressReviewContext = Omit<AddressContext, "actorKey">;
type ReadableAddress = Exclude<UserAddressRead, { kind: "unsupported" }>;
const row = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function itemAddress(snapshot: unknown, context: AddressReviewContext, version: number) {
  if (!row(snapshot) || snapshot.version !== version || !Array.isArray(snapshot.days)) return null;
  const day = snapshot.days.find(day => row(day) && day.id === context.dayId);
  if (!row(day) || !Array.isArray(day.items)) return null;
  const item = day.items.find(item => row(item) && item.id === context.itemId && item.dayId === context.dayId);
  return row(item) ? readUserProvidedAddress(item.chineseAddress) : null;
}

/** The renderer and Confirm fence share the exact same projection, with no source-reference dependency. */
export function addressProposalReview(pending: PendingProposalRead, context: AddressReviewContext): Readonly<{ before: ReadableAddress; after: ReadableAddress }> | null {
  const p = pending.proposal;
  if (pending.trip.id !== context.tripId || pending.trip.headVersion !== context.tripVersion || p.baseTripVersion !== context.tripVersion
    || p.status !== "pending" || p.stale !== false || !Number.isSafeInteger(p.revision) || p.revision < 1
    || typeof p.digest !== "string" || !/^[a-f0-9]{64}$/.test(p.digest)) return null;
  const patch: unknown = p.patch;
  if (!row(patch) || patch.expectedVersion !== context.tripVersion || !Array.isArray(patch.operations)) return null;
  const operations = patch.operations.filter(operation => row(operation) && operation.kind === "set_item_chinese_address"
    && operation.dayId === context.dayId && operation.itemId === context.itemId);
  if (operations.length !== 1) return null;
  const operation = operations[0] as Record<string, unknown>;
  if (Object.keys(operation).length !== 4 || operation.text !== null && !isUserAddressText(operation.text)) return null;
  const before = itemAddress(p.before, context, context.tripVersion), after = itemAddress(p.after, context, context.tripVersion + 1);
  if (!before || !after || before.kind === "unsupported" || after.kind === "unsupported"
    || (after.kind === "provided" ? after.address.text : null) !== operation.text) return null;
  return { before, after };
}
