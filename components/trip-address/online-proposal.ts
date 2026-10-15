import type { PendingProposalRead } from "../../lib/server/identity/user-data-adapter.ts";
import { isUserAddressText, readUserProvidedAddress } from "../../lib/trip-user-address.ts";
import { addressProposalChanges } from "./review.ts";
import { addressOperation, type AddressContext, type AddressOperation } from "./context.ts";

const row = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
export type AddressIntent = {
  identity: string; context: AddressContext; operation: AddressOperation; bytes: string;
  receipt: { proposalId: string; revision: number; baseTripVersion: number } | null;
};
export function newAddressIntent(identity: string, context: AddressContext, text: string | null): AddressIntent {
  const operation = addressOperation(context, text);
  return { identity, context, operation, bytes: JSON.stringify({ patch: { expectedVersion: context.tripVersion, operations: [operation] } }), receipt: null };
}
function itemAddress(snapshot: Record<string, unknown>, operation: AddressOperation) {
  if (!Array.isArray(snapshot.days)) return null;
  const day = snapshot.days.find(day => row(day) && day.id === operation.dayId);
  if (!row(day) || !Array.isArray(day.items)) return null;
  const item = day.items.find(item => row(item) && item.id === operation.itemId && item.dayId === operation.dayId);
  return row(item) ? readUserProvidedAddress(item.chineseAddress) : null;
}
export function matchingAddressProposal(raw: unknown, intent: AddressIntent, now = Date.now()): PendingProposalRead | null {
  if (!row(raw) || !row(raw.trip) || raw.trip.id !== intent.context.tripId || raw.trip.headVersion !== intent.context.tripVersion || !row(raw.proposal)) return null;
  const p = raw.proposal;
  if (!uuid(p.id) || !Number.isSafeInteger(p.revision) || Number(p.revision) < 1 || p.baseTripVersion !== intent.context.tripVersion
    || p.status !== "pending" || p.stale !== false || typeof p.digest !== "string" || !/^[a-f0-9]{64}$/.test(p.digest)
    || typeof p.expiresAt !== "string" || !Number.isFinite(Date.parse(p.expiresAt)) || Date.parse(p.expiresAt) <= now
    || !row(p.patch) || p.patch.expectedVersion !== intent.context.tripVersion || !Array.isArray(p.patch.operations) || p.patch.operations.length !== 1) return null;
  if (intent.receipt && (p.id !== intent.receipt.proposalId || p.revision !== intent.receipt.revision || p.baseTripVersion !== intent.receipt.baseTripVersion)) return null;
  const op = p.patch.operations[0];
  if (!row(op) || Object.keys(op).length !== 4 || op.kind !== "set_item_chinese_address" || op.dayId !== intent.operation.dayId || op.itemId !== intent.operation.itemId
    || op.text !== intent.operation.text || op.text !== null && !isUserAddressText(op.text)) return null;
  if (!row(p.before) || p.before.version !== intent.context.tripVersion || !row(p.after) || p.after.version !== intent.context.tripVersion + 1) return null;
  const before = itemAddress(p.before, intent.operation), after = itemAddress(p.after, intent.operation);
  if (!before || before.kind === "unsupported" || !after || after.kind === "unsupported" || (after.kind === "provided" ? after.address.text : null) !== op.text) return null;
  return raw as unknown as PendingProposalRead;
}

/** One transport attempt. Any lost/malformed response leaves intent intact; recovery is GET only. */
export async function postAddressIntent(intent: AddressIntent, signal: AbortSignal, live: () => boolean): Promise<void> {
  if (!live()) throw Error("ADDRESS_CONTEXT_CHANGED");
  const response = await fetch(`/api/trips/${encodeURIComponent(intent.context.tripId)}/proposal`, {
    method: "POST", credentials: "same-origin", redirect: "error", cache: "no-store", signal,
    headers: { "content-type": "application/json" }, body: intent.bytes,
  });
  const raw: unknown = await response.json();
  if (!live()) throw Error("ADDRESS_CONTEXT_CHANGED");
  if (!response.ok || !row(raw) || Object.keys(raw).length !== 3 || !uuid(raw.proposalId) || !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 1 || raw.baseTripVersion !== intent.context.tripVersion) throw Error("ADDRESS_PREPARE_UNKNOWN");
  intent.receipt = { proposalId: raw.proposalId, revision: Number(raw.revision), baseTripVersion: Number(raw.baseTripVersion) };
}
export async function readAddressIntent(intent: AddressIntent, signal: AbortSignal, live: () => boolean): Promise<PendingProposalRead> {
  if (!live()) throw Error("ADDRESS_CONTEXT_CHANGED");
  const suffix = intent.receipt ? `?proposalId=${encodeURIComponent(intent.receipt.proposalId)}` : "";
  const response = await fetch(`/api/trips/${encodeURIComponent(intent.context.tripId)}/proposal${suffix}`, {
    credentials: "same-origin", cache: "no-store", redirect: "error", signal,
  });
  const raw: unknown = await response.json();
  if (!live()) throw Error("ADDRESS_CONTEXT_CHANGED");
  const proposal = response.ok ? matchingAddressProposal(raw, intent) : null;
  if (!proposal) throw Error("ADDRESS_PREPARE_UNKNOWN");
  // Lost POST receipt: adopt only the currently authenticated exact matching original diff; never claim POST success.
  intent.receipt = { proposalId: proposal.proposal.id, revision: proposal.proposal.revision, baseTripVersion: proposal.proposal.baseTripVersion };
  return proposal;
}

/** Only the exact handed proposal's authoritative terminal token can settle its local intent. */
export function addressIntentSettled(intent: AddressIntent, phase: string, epoch: string, pendingId: string | null): boolean {
  const id = intent.receipt?.proposalId;
  return phase === "handed" && id !== undefined && pendingId !== id
    && (epoch === `applied:${id}` || epoch === `rejected:${id}`);
}

/** Lock only Confirm when an actual address change lacks a current, visible review. */
export function addressReviewBlocked(pending: PendingProposalRead | null, qualifiedRoot: boolean, current: Readonly<{
  tripId: string; snapshotTripId: string; tripVersion: number;
  items?: readonly Readonly<{ dayId: string; itemId: string }>[];
}>): boolean {
  if (!pending) return false;
  const projection = addressProposalChanges(pending, current);
  if (projection.kind === "unavailable") return projection.mayChangeAddress;
  return projection.changes.length > 0 && (!qualifiedRoot || current.snapshotTripId !== current.tripId);
}

/** Explicit local abandonment only; never rejection, server undo, or a success receipt. */
export function abandonLocalAddressIntent<T extends { intent: AddressIntent; phase: string }>(ledger: Map<string, T>, key: string,
  record: T, confirmed: boolean, live: () => boolean): boolean {
  if (!confirmed || record.phase !== "unknown" || !live() || ledger.get(key) !== record) return false;
  ledger.delete(key);
  record.intent.bytes = "";
  return true;
}

/** The parent owns its original GET-only reload and must fence its own publications too. */
export async function readAddressCurrent(live: () => boolean, read: () => Promise<unknown>): Promise<void> {
  if (!live()) throw Error("ADDRESS_CONTEXT_CHANGED");
  await read();
  if (!live()) throw Error("ADDRESS_CONTEXT_CHANGED");
}
