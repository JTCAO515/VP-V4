import { object, exact, uuid, integer, instant } from '../../intake/pdf/contract.ts';

/** Internal source join only. This is not a new measurement signal or RPC wire. */
export type Actor = Readonly<{ ownerId: string; sessionId: string; mobileEpoch: number }>;
export type MaterialSource = Readonly<{ kind: 'native_entry'; logicalId: string; entry: 'e2';
  anchor: Readonly<{ kind: 'trip'; tripId: string; tripVersion: number; medium: 'pdf' | 'screenshot' }> }>;
export type GuardedSelection = Readonly<{ actor: Actor; source: MaterialSource;
  boundary: 'before_material_read'; state: 'current'; expiresAt: string;
  originalProposalBytes: string; presentation: 'rendered_confirmed_readback' | 'unknown' }>;
export const actor = (v: unknown): v is Actor => object(v) && exact(v, ['ownerId', 'sessionId', 'mobileEpoch'])
  && uuid(v.ownerId) && uuid(v.sessionId) && integer(v.mobileEpoch, 1, Number.MAX_SAFE_INTEGER);
export function source(v: unknown): v is MaterialSource {
  if (!object(v) || !exact(v, ['kind', 'logicalId', 'entry', 'anchor']) || v.kind !== 'native_entry'
    || v.entry !== 'e2' || !uuid(v.logicalId) || !object(v.anchor)) return false;
  const a = v.anchor;
  return exact(a, ['kind', 'tripId', 'tripVersion', 'medium']) && a.kind === 'trip' && uuid(a.tripId)
    && integer(a.tripVersion, 0, Number.MAX_SAFE_INTEGER) && ['pdf', 'screenshot'].includes(String(a.medium));
}
export function selection(v: unknown): v is GuardedSelection {
  return object(v) && exact(v, ['actor', 'source', 'boundary', 'state', 'expiresAt', 'originalProposalBytes', 'presentation'])
    && actor(v.actor) && source(v.source) && v.boundary === 'before_material_read' && v.state === 'current'
    && instant(v.expiresAt) && typeof v.originalProposalBytes === 'string' && Buffer.byteLength(v.originalProposalBytes) <= 8192
    && ['rendered_confirmed_readback', 'unknown'].includes(String(v.presentation));
}
export type Denial = 'invalid_source' | 'unobservable' | 'source_unavailable' | 'source_changed'
  | 'actor_changed' | 'source_expired' | 'not_confirmed' | 'binding_mismatch' | 'readback_mismatch';
export type Association = Readonly<{ kind: 'qualified'; source: MaterialSource; actor: Actor;
  original: Readonly<{ operationId: string; proposalId: string; proposalRevision: number;
    confirmationEventId: string; baseTripVersion: number; resultingVersion: number }>;
  presented: 'observed' | 'unknown'; adopted: true; saved: true }>
  | Readonly<{ kind: 'unobservable'; reason: Denial }>;
export const denied = (reason: Denial): Association => ({ kind: 'unobservable', reason });
