import {
  decodeServiceReceipt, decodeServiceWorkspace, parseServiceInput, uuid,
  type ServiceMutation, type ServiceProjection, type ServiceReceipt, type ServiceWorkspace,
} from '../../../lib/server/service-cases/operations/contract.ts';

export type Identity = Readonly<{ actorId: string; sessionId: string; expiresAt: number }>;
export type Marker = Readonly<{
  actorId: string; sessionId: string; operationId: string; caseId: string;
  action: 'accept' | 'assign' | 'update'; expectedRevision: number; grantRevision: number;
  requestDigest: string;
}>;
export const JOURNAL_KEY = 'vp-service-ops-pending/1';
export type View = Readonly<{
  workspace: ServiceWorkspace | null; pending: Marker | null; busy: boolean;
  message: 'empty' | 'unavailable' | 'disabled' | 'unknown' | 'confirmed' | 'identity' | 'storage' | 'invalid' | 'erased';
}>;
type Reply = Readonly<{ ok: boolean; data: unknown; code?: string }>;
type Ports = {
  identity(): Promise<Identity | null>;
  send(bytes: string, identity: Identity): Promise<Reply>;
  save(marker: Marker | null): void;
  changed(view: View): void;
  now?(): number;
};
export function decodeMarker(v: unknown): Marker | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const p = v as Record<string, unknown>;
  const keys = ['actorId', 'sessionId', 'operationId', 'caseId', 'action', 'expectedRevision', 'grantRevision', 'requestDigest'];
  if (Object.keys(p).length !== keys.length || !keys.every(k => Object.hasOwn(p, k))) return null;
  if (![p.actorId, p.sessionId, p.operationId, p.caseId].every(uuid) || !['accept', 'assign', 'update'].includes(String(p.action)) || ![p.expectedRevision, p.grantRevision].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0) || typeof p.requestDigest !== 'string' || !/^[a-f0-9]{64}$/.test(p.requestDigest)) return null;
  return p as Marker;
}
export function sameSession(a: Identity | Marker, b: Identity | null): b is Identity {
  return b !== null && a.actorId === b.actorId && a.sessionId === b.sessionId;
}
export function currentCase(c: ServiceProjection, now: number): boolean {
  return c.grantState === 'active' && c.expiresAt !== null && c.expiresAt > now;
}
export function canAct(action: Marker['action'], c: ServiceProjection, w: ServiceWorkspace, now: number): boolean {
  if (w.surface !== 'staff' || !currentCase(c, now)) return false;
  if (action === 'accept') return c.status === 'queued' && w.capacity.state === 'available';
  if (!c.staff || c.staff.actorId !== w.actorId || c.staff.shiftEndsAt <= now) return false;
  return action === 'assign' ? c.status === 'accepted' : ['assigned', 'waiting_external'].includes(c.status);
}
export function receiptMatches(r: ServiceReceipt, p: Marker): boolean {
  return r.operationId === p.operationId && r.requestDigest === p.requestDigest && r.action === p.action && r.caseId === p.caseId && r.grantRevision === p.grantRevision;
}
/** No mutation retries. Persistent journal is metadata only; raw evidence bytes
 * live only in this instance and are erased at every authority/lifetime boundary. */
export class ServiceOpsController {
  private epoch = 0;
  private lock = false;
  private bytes: string | null = null;
  private actor: Identity | null = null;
  private freshUntil = 0;
  private rawValidUntil = 0;
  private storageBlocked = false;
  private view: View;
  private ports: Ports;
  constructor(ports: Ports, marker: Marker | null, blocked = false) {
    this.ports = ports;
    this.storageBlocked = blocked;
    this.view = {workspace: null, pending: marker, busy: false, message: blocked ? 'storage' : marker ? 'unknown' : 'empty'};
  }
  snapshot() { return this.view; }
  private now() { return this.ports.now?.() ?? Date.now(); }
  private set(patch: Partial<View>) { this.view = {...this.view, ...patch, ...(this.storageBlocked ? {message: 'storage' as const} : {})}; this.ports.changed(this.view); }
  invalidate() { ++this.epoch; this.actor = null; this.bytes = null; this.freshUntil = 0; this.rawValidUntil = 0; this.set({workspace: null, message: this.view.pending ? 'unknown' : 'unavailable'}); }
  private async qualified(epoch: number, expected?: Identity | Marker): Promise<Identity | null> {
    const id = await this.ports.identity();
    if (epoch !== this.epoch || !id || id.expiresAt <= this.now() || (expected && !sameSession(expected, id))) return null;
    return id;
  }
  private async workspace(epoch: number, id: Identity): Promise<ServiceWorkspace | null> {
    const deadline = this.now() + 30000;
    const reply = await this.ports.send(JSON.stringify({action: 'workspace'}), id);
    const next = reply.ok ? decodeServiceWorkspace(reply.data) : null;
    if (!await this.qualified(epoch, id)) { if (epoch === this.epoch) this.invalidate(); return null; }
    if (this.now() >= deadline || !next || next.surface !== 'staff' || next.actorId !== id.actorId || next.cases.some(c => !currentCase(c, this.now()))) {
      this.bytes = null;
      if (epoch === this.epoch) this.set({workspace: null, message: ['CASE_DISABLED', 'CASE_OPERATIONS_DISABLED', 'SERVICE_OPERATIONS_DISABLED'].includes(reply.code ?? '') ? 'disabled' : 'unavailable'});
      return null;
    }
    const p = this.view.pending;
    if (p && (!sameSession(p, id) || !next.cases.some(c => c.caseId === p.caseId && c.grantRevision === p.grantRevision))) this.bytes = null;
    this.actor = id; this.freshUntil = deadline;
    this.set({workspace: next, message: p ? 'unknown' : 'empty'});
    return next;
  }
  async refresh() {
    if (this.lock) return;
    this.lock = true; const epoch = this.epoch;
    this.set({busy: true});
    try {
      const id = await this.qualified(epoch);
      if (!id) { if (epoch === this.epoch) this.invalidate(); return; }
      await this.workspace(epoch, id);
    } catch { if (epoch === this.epoch) { this.bytes = null; this.set({workspace: null, message: 'unavailable'}); } }
    finally { this.lock = false; this.set({busy: false}); }
  }
  expire() {
    const w = this.view.workspace;
    if (this.bytes !== null && this.rawValidUntil <= this.now()) { this.invalidate(); return; }
    if (w && ((this.freshUntil <= this.now() || !this.actor || this.actor.expiresAt <= this.now()) || w.cases.some(c => !currentCase(c, this.now()) || (c.staff !== null && c.staff.shiftEndsAt <= this.now() && !['resolved', 'unresolved', 'cancelled'].includes(c.status))))) this.invalidate();
  }
  async mutate(command: ServiceMutation) {
    if (this.lock || this.view.pending || this.storageBlocked || !['accept', 'assign', 'update'].includes(command.action)) return;
    const input = parseServiceInput(command);
    if (!input) { this.set({message: 'invalid'}); return; }
    this.lock = true; const epoch = this.epoch; this.set({busy: true});
    try {
      const id = await this.qualified(epoch, this.actor ?? undefined);
      if (!id) { if (epoch === this.epoch) this.invalidate(); return; }
      const w = await this.workspace(epoch, id);
      const c = w?.cases.find(c => c.caseId === command.caseId);
      if (!w || !c || c.revision !== command.expectedRevision || c.grantRevision !== command.grantRevision || !canAct(command.action as Marker['action'], c, w, this.now())) return;
      const bytes = JSON.stringify(command);
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bytes))), n => n.toString(16).padStart(2, '0')).join('');
      if (!await this.qualified(epoch, id) || this.freshUntil <= this.now() || !canAct(command.action as Marker['action'], c, w, this.now())) { if (epoch === this.epoch) this.invalidate(); return; }
      const marker: Marker = {actorId: id.actorId, sessionId: id.sessionId, operationId: command.operationId, caseId: command.caseId, action: command.action as Marker['action'], expectedRevision: command.expectedRevision, grantRevision: command.grantRevision, requestDigest: digest};
      try { this.ports.save(marker); } catch { this.storageBlocked = true; this.set({message: 'storage'}); return; }
      this.bytes = bytes; this.rawValidUntil = Math.min(this.freshUntil, id.expiresAt, c.expiresAt ?? 0, c.staff?.shiftEndsAt ?? Infinity); this.set({pending: marker, workspace: null, message: 'unknown'});
      const reply = await this.ports.send(bytes, id);
      if (!await this.qualified(epoch, id)) { if (epoch === this.epoch) this.invalidate(); return; }
      await this.finish(reply, marker, epoch, id);
    } catch { if (epoch === this.epoch) this.set({workspace: null, message: this.view.pending ? 'unknown' : 'unavailable'}); }
    finally { this.lock = false; this.set({busy: false}); }
  }
  private async finish(reply: Reply, p: Marker, epoch: number, id: Identity) {
    if (reply.code === 'CASE_OPERATION_ERASED') { this.bytes = null; this.set({workspace: null, message: 'erased'}); return; }
    const value = reply.data && typeof reply.data === 'object' && 'receipt' in reply.data ? (reply.data as {receipt: unknown}).receipt : reply.data;
    const receipt = reply.ok ? decodeServiceReceipt(value) : null;
    if (!receipt || !receiptMatches(receipt, p)) { this.set({workspace: null, message: 'unknown'}); return; }
    try { this.ports.save(null); } catch { this.storageBlocked = true; this.bytes = null; this.set({workspace: null, message: 'storage'}); return; }
    this.bytes = null; this.set({pending: null, message: 'confirmed'});
    await this.workspace(epoch, id);
    if (epoch === this.epoch && this.view.workspace) this.set({message: 'confirmed'});
  }
  canAbandon() { return this.bytes !== null && this.rawValidUntil > this.now() && !this.storageBlocked; }
  async recover(abandon = false) {
    this.expire();
    const p = this.view.pending;
    if (this.lock || !p || this.storageBlocked || (abandon && !this.bytes)) return;
    this.lock = true; const epoch = this.epoch; this.set({workspace: null, busy: true});
    try {
      const id = await this.qualified(epoch, p);
      if (!id) { if (epoch === this.epoch) { this.bytes = null; this.set({message: 'identity'}); } return; }
      // Qualification is re-read before recovery; absent/forbidden never clears the marker.
      const w = await this.workspace(epoch, id);
      if (!w) return;
      if (abandon && !this.canAbandon()) return;
      const bytes = JSON.stringify(abandon ? {action: 'abandon', operationId: p.operationId, mutationBytes: this.bytes} : {action: 'read_operation', operationId: p.operationId});
      this.set({workspace: null});
      const reply = await this.ports.send(bytes, id);
      if (!await this.qualified(epoch, id)) { if (epoch === this.epoch) this.invalidate(); return; }
      await this.finish(reply, p, epoch, id);
    } catch { if (epoch === this.epoch) this.set({workspace: null, message: 'unknown'}); }
    finally { this.lock = false; this.set({busy: false}); }
  }
}
