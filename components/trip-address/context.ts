import { isUserAddressText } from "../../lib/trip-user-address.ts";

/** actorKey is an opaque current-session identity from the owning Canvas. Never persist it. */
export type AddressContext = Readonly<{
  actorKey: string;
  tripId: string;
  tripVersion: number;
  dayId: string;
  itemId: string;
}>;

export function sameAddressContext(a: AddressContext, b: AddressContext): boolean {
  return a.actorKey === b.actorKey && a.tripId === b.tripId && a.tripVersion === b.tripVersion
    && a.dayId === b.dayId && a.itemId === b.itemId;
}

export type AddressOperation = Readonly<{
  kind: "set_item_chinese_address";
  dayId: string;
  itemId: string;
  text: string | null;
}>;

export function addressOperation(context: AddressContext, text: string | null): AddressOperation {
  if (text !== null && !isUserAddressText(text)) throw new Error("INVALID_USER_ADDRESS");
  return { kind: "set_item_chinese_address", dayId: context.dayId, itemId: context.itemId, text };
}
