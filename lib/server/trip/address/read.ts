import { classifyChineseAddressLines, readUserProvidedAddress, type ChineseAddressText, type UserAddressRead } from '../../../trip-user-address.ts';
import { decodeNativeSupportResult } from '../support/native-http.ts';
import type { GroundedClaim } from '../../contracts/index.ts';

export type AddressContext = Readonly<{ tripId: string; tripVersion: number; dayId: string; itemId: string }>;
export type AddressReference = Readonly<{
  supportId: string; receiptId: string; placeReferenceId: string; version: number;
  scope: 'address_reference'; applicability: 'matched'; status: 'reference_current';
  claim: Extract<GroundedClaim, { claimType: 'address' }>;
  claimRevision: number; payloadHash: string; sourceDigest: string;
  sourceRefs: readonly Readonly<{ sourceRevisionId: string; revisionLabel: string; snippetHash: string }>[];
  chineseText: ChineseAddressText; expiresAt: string;
}>;
export type OnlineItemAddressRead =
  | Readonly<{ kind: 'conflict' | 'unavailable' | 'blocked' }>
  | Readonly<{ kind: 'addresses'; context: AddressContext; userProvided: UserAddressRead;
      reference: Readonly<{ kind: 'missing' | 'unavailable' | 'not_qualified' }> | Readonly<{ kind: 'qualified'; entries: readonly AddressReference[] }> }>;

/** Input is an ordinary authenticated current ItemSupport RPC result, never a source eligibility grant. */
export function readOnlineItemAddress(context: AddressContext, manual: unknown, rawSupport: unknown, now = Date.now()): OnlineItemAddressRead {
  const decoded = decodeNativeSupportResult('read', rawSupport, context.tripId,
    { expectedTripVersion: context.tripVersion, dayId: context.dayId, itemId: context.itemId });
  if (!decoded || typeof decoded !== 'object') return { kind: 'unavailable' };
  const value = decoded as { kind: string; entries?: Record<string, unknown>[] };
  if (value.kind === 'stale' || value.kind === 'conflict') return { kind: 'conflict' };
  if (value.kind === 'blocked') return { kind: 'blocked' };
  if (value.kind !== 'support' || !Array.isArray(value.entries)) return { kind: 'unavailable' };
  const addresses = value.entries.filter(entry => entry.scope === 'address_reference');
  const entries: AddressReference[] = [];
  for (const entry of addresses) {
    if (entry.status !== 'reference_current' || entry.applicability !== 'matched') continue;
    const claim = entry.claim as Extract<GroundedClaim, { claimType: 'address' }>;
    const refs = entry.sourceRefs as AddressReference['sourceRefs'];
    if (refs.length === 0) continue;
    const expiries = claim.evidence.flatMap(evidence => 'expiresAt' in evidence ? [Date.parse(evidence.expiresAt)] : []);
    if (expiries.length === 0 || expiries.some(expiry => !Number.isFinite(expiry) || expiry <= now)) continue;
    entries.push({ ...entry, claim, sourceRefs: refs, chineseText: classifyChineseAddressLines(claim.value.lines),
      expiresAt: new Date(Math.min(...expiries)).toISOString() } as AddressReference);
  }
  return { kind: 'addresses', context: { ...context }, userProvided: readUserProvidedAddress(manual),
    reference: entries.length ? { kind: 'qualified', entries } : { kind: addresses.length ? 'not_qualified' : 'missing' } };
}
