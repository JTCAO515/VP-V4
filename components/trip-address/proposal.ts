import { addressOperation, sameAddressContext, type AddressContext, type AddressOperation } from "./context.ts";

export type AddressPrepare = (request: Readonly<{
  context: AddressContext;
  patch: Readonly<{ expectedVersion: number; operations: readonly AddressOperation[] }>;
}>) => Promise<void>;
/** Only prepares the original Proposal. The parent owns readPending/diff/Confirm/cancel/unknown-ACK. */
export async function prepareAddress(
  expected: AddressContext,
  current: () => AddressContext | null,
  text: string | null,
  prepare: AddressPrepare,
): Promise<"prepared" | "stale"> {
  const live = current();
  if (!live || !sameAddressContext(expected, live)) return "stale";
  const patch = { expectedVersion: expected.tripVersion, operations: [addressOperation(expected, text)] };
  await prepare({ context: expected, patch });
  const after = current();
  return after && sameAddressContext(expected, after) ? "prepared" : "stale";
}
