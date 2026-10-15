import { assertGroundedClaim, type GroundedAddressClaim } from "../../lib/server/contracts/index.ts";
import { classifyChineseAddressLines, readUserProvidedAddress, type ChineseAddressText, type UserAddressRead } from "../../lib/trip-user-address.ts";
import type { AddressContext } from "./context.ts";

export type AddressReference = Readonly<{
  supportId: string;
  claim: GroundedAddressClaim;
  chineseText: ChineseAddressText;
  expiresAt: string;
  sourceRefs: readonly { sourceRevisionId: string; revisionLabel: string; snippetHash: string }[];
}>;
export type AddressRead = Readonly<{
  context: AddressContext;
  manual: UserAddressRead;
  references: readonly AddressReference[];
  referencesUnavailable: boolean;
}>;
/** Server port must recheck owner/RLS, current support/mapping/source rights and TTL on every read. */
export type AddressReader = (context: AddressContext, signal: AbortSignal) => Promise<unknown>;
const row = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const positive = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;

/** Decode the backend OnlineItemAddressRead candidate, never a historical receipt or raw POI. */
export function decodeAddressRead(value: unknown, context: AddressContext, now = Date.now()): AddressRead | null {
  if (!row(value) || value.kind !== "addresses" || !row(value.context) || value.context.tripId !== context.tripId
    || value.context.tripVersion !== context.tripVersion || value.context.dayId !== context.dayId || value.context.itemId !== context.itemId
    || !row(value.userProvided) || !row(value.reference)) return null;
  let manual: UserAddressRead;
  if (value.userProvided.kind === "provided") {
    manual = readUserProvidedAddress(value.userProvided.address);
    if (manual.kind !== "provided") return null;
  } else if (value.userProvided.kind === "missing" || value.userProvided.kind === "unsupported") {
    if (Object.keys(value.userProvided).length !== 1) return null;
    manual = { kind: value.userProvided.kind };
  } else return null;
  const reference = value.reference;
  if (["missing", "unavailable", "not_qualified"].includes(String(reference.kind))) {
    if (Object.keys(reference).length !== 1) return null;
    return { context, manual, references: [], referencesUnavailable: reference.kind !== "missing" };
  }
  if (reference.kind !== "qualified" || !Array.isArray(reference.entries) || reference.entries.length === 0 || reference.entries.length > 8) return null;
  const references: AddressReference[] = [];
  const ids = new Set<string>();
  let referencesUnavailable = false;
  for (const entry of reference.entries) {
    if (!row(entry) || !uuid(entry.supportId) || ids.has(entry.supportId)) return null;
    ids.add(entry.supportId);
    if (entry.scope !== "address_reference" || entry.status !== "reference_current" || entry.applicability !== "matched") return null;
    if (!positive(entry.version) || !uuid(entry.receiptId) || !uuid(entry.placeReferenceId)
      || !positive(entry.claimRevision) || !hash(entry.payloadHash) || !hash(entry.sourceDigest)
      || !Array.isArray(entry.sourceRefs) || entry.sourceRefs.length === 0 || entry.sourceRefs.length > 8
      || !entry.sourceRefs.every(ref => row(ref) && uuid(ref.sourceRevisionId) && typeof ref.revisionLabel === "string"
        && ref.revisionLabel.length > 0 && [...ref.revisionLabel].length <= 120 && hash(ref.snippetHash))
      || new Set(entry.sourceRefs.map(ref => ref.sourceRevisionId)).size !== entry.sourceRefs.length
      || !row(entry.claim) || entry.claim.claimType !== "address" || !row(entry.claim.value)
      || !Array.isArray(entry.claim.value.lines) || !entry.claim.value.lines.every(line => typeof line === "string")
      || typeof entry.expiresAt !== "string") return null;
    const claim = entry.claim as GroundedAddressClaim;
    try { assertGroundedClaim(claim, now); } catch { referencesUnavailable = true; continue; }
    const expiries = claim.evidence.flatMap(receipt => "expiresAt" in receipt ? [Date.parse(receipt.expiresAt)] : []);
    if (expiries.length === 0 || expiries.some(expiry => !Number.isFinite(expiry) || expiry <= now)
      || Date.parse(entry.expiresAt) !== Math.min(...expiries)) { referencesUnavailable = true; continue; }
    const chineseText = classifyChineseAddressLines(claim.value.lines);
    if (entry.chineseText !== chineseText) return null;
    references.push({ supportId: entry.supportId, claim, chineseText, expiresAt: entry.expiresAt, sourceRefs: entry.sourceRefs as AddressReference["sourceRefs"] });
  }
  return { context, manual, references, referencesUnavailable };
}

/** Cookie route only. No bearer/service credentials, model or map egress. */
export const readOnlineAddresses: AddressReader = async (context, signal) => {
  const query = new URLSearchParams({ expectedTripVersion: String(context.tripVersion), dayId: context.dayId, itemId: context.itemId });
  const response = await fetch(`/api/trips/${encodeURIComponent(context.tripId)}/addresses?${query}`, {
    cache: "no-store", credentials: "same-origin", signal, redirect: "error",
  });
  if (!response.ok) throw new Error("ADDRESS_READ_UNAVAILABLE");
  return response.json();
};
