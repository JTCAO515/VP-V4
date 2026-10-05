import { isUuid } from '../../identity/request-guards.ts';

/** Service operations consume the existing explicit Case grant. They never grant
 * staff authority, dispatch a supplier action, or confirm a TripProposal. */
export type ServiceState = 'queued' | 'accepted' | 'assigned' | 'waiting_external' | 'resolved' | 'unresolved' | 'cancelled';
export type TripBinding = Readonly<{ kind: 'unknown' }> | Readonly<{ kind: 'bound'; tripId: string; headVersion: number }>;
export type ServiceEvidence = Readonly<{
  kind: 'tutorial' | 'contacted_provider' | 'external_resolution';
  note: string; reference: string; observedAt: number;
}>;
export type ServiceMutation =
  | Readonly<{ action: 'request'; operationId: string; caseId: string; expectedRevision: number; grantRevision: number; urgency: 'normal' | 'urgent'; trip: TripBinding }>
  | Readonly<{ action: 'cancel' | 'accept' | 'assign'; operationId: string; caseId: string; expectedRevision: number; grantRevision: number }>
  | Readonly<{ action: 'update'; operationId: string; caseId: string; expectedRevision: number; grantRevision: number; status: 'waiting_external' | 'resolved' | 'unresolved'; evidence: readonly ServiceEvidence[]; minutes: Readonly<{ startedAt: number; endedAt: number }> | null; proposal: Readonly<{ proposalId: string; tripId: string; baseVersion: number }> | null }>;
export type ServiceInput = ServiceMutation
  | Readonly<{ action: 'workspace' }>
  | Readonly<{ action: 'read'; caseId: string }>
  | Readonly<{ action: 'read_operation'; operationId: string }>
  | Readonly<{ action: 'abandon'; operationId: string; mutationBytes: string }>;

export type ServiceCapacity = Readonly<{ state: 'available' | 'full' | 'unknown'; checkedAt: number }>;
export type ServiceProjection = Readonly<{
  caseId: string; revision: number; grantRevision: number; status: ServiceState;
  category: 'transport' | 'accommodation' | 'on_trip' | 'general'; problem: string;
  grantState: 'active' | 'expired' | 'revoked'; expiresAt: number | null;
  updatedAt: number; urgency: 'normal' | 'urgent'; capacity: ServiceCapacity;
  staff: Readonly<{ actorId: string; label: string; acceptedAt: number; shiftEndsAt: number }> | null;
  brief: Readonly<{ kind: 'unknown' }>; sources: Readonly<{ kind: 'unknown' }>;
  trip: TripBinding; evidence: readonly ServiceEvidence[]; manualMinutes: number;
  proposal: Readonly<{ proposalId: string; tripId: string; baseVersion: number }> | null;
}>;
export type ServiceWorkspace = Readonly<{ actorId: string; surface: 'owner' | 'staff'; cases: readonly ServiceProjection[]; capacity: ServiceCapacity }>;
export type ServiceReceipt = Readonly<{
  operationId: string; requestDigest: string; action: ServiceMutation['action'];
  outcome: 'applied' | 'cancelled'; caseId: string; revision: number;
  grantRevision: number; createdAt: number;
}>;

export const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const exact = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
export const integer = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= 2147483647;
export const uuid = (v: unknown): v is string => typeof v === 'string' && isUuid(v) && v === v.toLowerCase();
export const milliseconds = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v < 8640000000000000;
const text = (v: unknown, max: number): v is string => typeof v === 'string' && !!v.trim() && v.length <= max && !v.includes('\0');
export function validTrip(v: unknown): v is TripBinding {
  return record(v) && (v.kind === 'unknown' ? exact(v, ['kind']) : v.kind === 'bound' && exact(v, ['kind', 'tripId', 'headVersion']) && uuid(v.tripId) && integer(v.headVersion, 1));
}
export function validEvidence(v: unknown): v is ServiceEvidence {
  return record(v) && exact(v, ['kind', 'note', 'reference', 'observedAt']) && ['tutorial', 'contacted_provider', 'external_resolution'].includes(String(v.kind)) && text(v.note, 1000) && text(v.reference, 300) && milliseconds(v.observedAt);
}
/** Closed commands. Staff identity, capacity, ETA, Brief content, patches and
 * financial instructions cannot be supplied through this API. */
export function parseServiceInput(v: unknown): ServiceInput | null {
  if (!record(v)) return null;
  if (v.action === 'workspace') return exact(v, ['action']) ? v as ServiceInput : null;
  if (v.action === 'read') return exact(v, ['action', 'caseId']) && uuid(v.caseId) ? v as ServiceInput : null;
  if (v.action === 'read_operation') return exact(v, ['action', 'operationId']) && uuid(v.operationId) ? v as ServiceInput : null;
  if (v.action === 'abandon') {
    if (!exact(v, ['action', 'operationId', 'mutationBytes']) || !uuid(v.operationId) || !text(v.mutationBytes, 24000)) return null;
    let original: unknown; try { original = JSON.parse(v.mutationBytes); } catch { return null; }
    if (!record(original) || !['request', 'cancel', 'accept', 'assign', 'update'].includes(String(original.action))) return null;
    const command = parseServiceInput(original);
    return command && 'operationId' in command && command.operationId === v.operationId ? v as ServiceInput : null;
  }
  if (!uuid(v.operationId) || !uuid(v.caseId) || !integer(v.expectedRevision) || !integer(v.grantRevision)) return null;
  const keys = ['action', 'operationId', 'caseId', 'expectedRevision', 'grantRevision'];
  if (v.action === 'request') return exact(v, [...keys, 'urgency', 'trip']) && ['normal', 'urgent'].includes(String(v.urgency)) && validTrip(v.trip) ? v as ServiceInput : null;
  if (['cancel', 'accept', 'assign'].includes(String(v.action))) return exact(v, keys) ? v as ServiceInput : null;
  if (v.action !== 'update' || !exact(v, [...keys, 'status', 'evidence', 'minutes', 'proposal']) || !['waiting_external', 'resolved', 'unresolved'].includes(String(v.status))) return null;
  if (!Array.isArray(v.evidence) || v.evidence.length > 10 || !v.evidence.every(validEvidence)) return null;
  if (v.minutes !== null && !(record(v.minutes) && exact(v.minutes, ['startedAt', 'endedAt']) && milliseconds(v.minutes.startedAt) && milliseconds(v.minutes.endedAt) && v.minutes.endedAt > v.minutes.startedAt && v.minutes.endedAt - v.minutes.startedAt <= 8 * 3600000)) return null;
  if (v.proposal !== null && !(record(v.proposal) && exact(v.proposal, ['proposalId', 'tripId', 'baseVersion']) && uuid(v.proposal.proposalId) && uuid(v.proposal.tripId) && integer(v.proposal.baseVersion, 1))) return null;
  // Contact evidence alone never establishes an external resolution.
  if (v.status === 'resolved' && !v.evidence.some(e => e.kind === 'tutorial' || e.kind === 'external_resolution')) return null;
  return v as ServiceInput;
}

const unknownBinding = (v: unknown) => record(v) && exact(v, ['kind']) && v.kind === 'unknown';
const proposal = (v: unknown) => v === null || (record(v) && exact(v, ['proposalId', 'tripId', 'baseVersion']) && uuid(v.proposalId) && uuid(v.tripId) && integer(v.baseVersion, 1));
export function validCapacity(v: unknown): v is ServiceCapacity {
  return record(v) && exact(v, ['state', 'checkedAt']) && ['available', 'full', 'unknown'].includes(String(v.state)) && milliseconds(v.checkedAt);
}
export function decodeServiceProjection(v: unknown): ServiceProjection | null {
  if (!record(v) || !exact(v, ['caseId', 'revision', 'grantRevision', 'status', 'category', 'problem', 'grantState', 'expiresAt', 'updatedAt', 'urgency', 'capacity', 'staff', 'brief', 'sources', 'trip', 'evidence', 'manualMinutes', 'proposal'])) return null;
  if (!uuid(v.caseId) || !integer(v.revision) || !integer(v.grantRevision) || !['queued', 'accepted', 'assigned', 'waiting_external', 'resolved', 'unresolved', 'cancelled'].includes(String(v.status))) return null;
  if (!['transport', 'accommodation', 'on_trip', 'general'].includes(String(v.category)) || !text(v.problem, 1000)) return null;
  if (!['active', 'expired', 'revoked'].includes(String(v.grantState)) || !(v.expiresAt === null || milliseconds(v.expiresAt)) || !milliseconds(v.updatedAt) || !['normal', 'urgent'].includes(String(v.urgency)) || !validCapacity(v.capacity)) return null;
  if (!unknownBinding(v.brief) || !unknownBinding(v.sources) || !validTrip(v.trip) || !integer(v.manualMinutes) || !Array.isArray(v.evidence) || v.evidence.length > 100 || !v.evidence.every(validEvidence) || !proposal(v.proposal)) return null;
  if (v.staff !== null && !(record(v.staff) && exact(v.staff, ['actorId', 'label', 'acceptedAt', 'shiftEndsAt']) && uuid(v.staff.actorId) && text(v.staff.label, 80) && milliseconds(v.staff.acceptedAt) && milliseconds(v.staff.shiftEndsAt) && v.staff.shiftEndsAt > v.staff.acceptedAt)) return null;
  if (v.status === 'queued' && (v.staff !== null || v.manualMinutes !== 0 || v.evidence.length || v.proposal !== null)) return null;
  if (['accepted', 'assigned', 'waiting_external', 'resolved', 'unresolved'].includes(String(v.status)) && v.staff === null) return null;
  if (v.status === 'resolved' && !v.evidence.some(e => e.kind === 'tutorial' || e.kind === 'external_resolution')) return null;
  if (v.proposal !== null && (!record(v.trip) || v.trip.kind !== 'bound' || (v.proposal as Record<string, unknown>).tripId !== v.trip.tripId || (v.proposal as Record<string, unknown>).baseVersion !== v.trip.headVersion)) return null;
  return v as ServiceProjection;
}
export function decodeServiceWorkspace(v: unknown): ServiceWorkspace | null {
  if (!record(v) || !exact(v, ['actorId', 'surface', 'cases', 'capacity']) || !uuid(v.actorId) || !['owner', 'staff'].includes(String(v.surface)) || !validCapacity(v.capacity) || !Array.isArray(v.cases) || v.cases.length > 50) return null;
  if (!v.cases.every(c => decodeServiceProjection(c)) || new Set(v.cases.map(c => c.caseId)).size !== v.cases.length) return null;
  // Existing Case grants disclose only problem, never Trip/Brief context to staff.
  if (v.surface === 'staff' && v.cases.some(c => c.trip.kind !== 'unknown' || c.proposal !== null)) return null;
  return v as ServiceWorkspace;
}
export function decodeServiceReceipt(v: unknown): ServiceReceipt | null {
  return record(v) && exact(v, ['operationId', 'requestDigest', 'action', 'outcome', 'caseId', 'revision', 'grantRevision', 'createdAt']) && uuid(v.operationId) && typeof v.requestDigest === 'string' && /^[a-f0-9]{64}$/.test(v.requestDigest) && ['request', 'cancel', 'accept', 'assign', 'update'].includes(String(v.action)) && ['applied', 'cancelled'].includes(String(v.outcome)) && uuid(v.caseId) && integer(v.revision) && integer(v.grantRevision) && milliseconds(v.createdAt) ? v as ServiceReceipt : null;
}
