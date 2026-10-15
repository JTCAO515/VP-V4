import type { LocalTripRead } from "../canvas/TripContentEditor.tsx";
import type { PendingProposalRead } from "../../lib/server/identity/user-data-adapter.ts";
import type { AddressActor } from "./actor.ts";
const row = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (row(value)) return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]));
  return value;
}
const encoded = (value: unknown) => JSON.stringify(canonical(value));
const tripView = (data: LocalTripRead) => ({ id: data.trip.id, version: data.trip.headVersion, confirmationState: data.confirmationState, content: data.content });
const pendingView = (pending: PendingProposalRead | null) => pending ? { trip: { id: pending.trip.id, version: pending.trip.headVersion }, proposal: pending.proposal } : null;
export function addressBindingKey(tripId: string, data: LocalTripRead, pending: PendingProposalRead | null): string {
  return encoded({ tripId, trip: tripView(data), pending: pendingView(pending) });
}
export type CurrentAddressBinding = Readonly<{ actorKey: string; inputKey: string }>;

/** A display lease from ordinary current-Cookie GETs, never an alternate Trip/pending store. */
export async function readCurrentAddressBinding(root: AddressActor, tripId: string, data: LocalTripRead, pending: PendingProposalRead | null,
  signal: AbortSignal, current: () => AddressActor | null): Promise<CurrentAddressBinding> {
  const check = () => { if (signal.aborted || current()?.key !== root.key) throw Error("ADDRESS_ROOT_CHANGED"); };
  const options: RequestInit = { cache: "no-store", credentials: "same-origin", redirect: "error", signal };
  check();
  const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}`, options);
  const raw: unknown = await response.json(); check();
  if (!response.ok || !row(raw) || !row(raw.trip) || raw.trip.id !== tripId || raw.trip.headVersion !== data.trip.headVersion
    || raw.confirmationState !== "confirmed" || encoded(tripView(raw as unknown as LocalTripRead)) !== encoded(tripView(data))) throw Error("ADDRESS_TRIP_READ_UNAVAILABLE");
  const suffix = pending ? `?proposalId=${encodeURIComponent(pending.proposal.id)}` : "";
  const read = await fetch(`/api/trips/${encodeURIComponent(tripId)}/proposal${suffix}`, options);
  const original: unknown = await read.json(); check();
  if (pending) {
    if (!read.ok || !row(original) || !row(original.trip) || !row(original.proposal)
      || original.trip.id !== tripId || original.trip.headVersion !== data.trip.headVersion
      || encoded(pendingView(original as unknown as PendingProposalRead)) !== encoded(pendingView(pending))) throw Error("ADDRESS_PENDING_READ_UNAVAILABLE");
  } else if (read.status !== 409 || !row(original) || !row(original.error) || original.error.code !== "PROPOSAL_NOT_CONFIRMABLE") throw Error("ADDRESS_PENDING_READ_UNAVAILABLE");
  check();
  return { actorKey: root.key, inputKey: addressBindingKey(tripId, data, pending) };
}
