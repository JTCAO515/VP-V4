import { decodeBrief, decodeBriefLocator, type BriefProjection } from '../../../../lib/server/service-cases/brief/contract.ts';
import { uuid } from '../../../../lib/server/service-cases/operations/contract.ts';

export type Identity = Readonly<{ actorId: string; sessionId: string; expiresAt: number }>;
export type ReadCommand = Readonly<{ action: 'locate'; caseId: string }> | Readonly<{ action: 'read'; caseId: string; recipientId: string; grantRevision: number; expectedRevision: number }>;
export type View = Readonly<{ brief: BriefProjection | null; busy: boolean; message: 'empty' | 'ready' | 'unavailable' | 'auth' | 'expired' | 'invalid' }>;
type Dependencies = Readonly<{
  identity(): Promise<Identity | null>;
  send(command: ReadCommand, identity: Identity, signal: AbortSignal): Promise<Readonly<{ ok: boolean; data?: unknown }>>;
  changed(view: View): void;
  now?: () => number;
}>;
const same = (a: Identity, b: Identity | null) => b !== null && a.actorId === b.actorId && a.sessionId === b.sessionId;

/** Only server locate/read can qualify content. Local expiry is an additional
 * discard fence, never a grant. No body, selection, digest or identity persists. */
export class BriefOpsController {
  private view: View = { brief: null, busy: false, message: 'empty' };
  private generation = 0;
  private active: AbortController | null = null;
  private identity: Identity | null = null;
  private readonly now: () => number;
  private readonly deps: Dependencies;
  readonly caseId: string;
  constructor(deps: Dependencies, caseId: string) { this.deps = deps; this.caseId = caseId; this.now = deps.now ?? Date.now; }
  snapshot(): View { return this.view; }
  private emit(view: View) { this.view = view; this.deps.changed(view); }
  invalidate(message: View['message'] = 'empty') {
    this.generation++; this.active?.abort(); this.active = null; this.identity = null;
    this.emit({ brief: null, busy: false, message });
  }
  expire() {
    if (this.view.brief && (this.view.brief.expiresAt <= this.now() || !this.identity || this.identity.expiresAt <= this.now())) this.invalidate('expired');
  }
  async refresh() {
    this.invalidate();
    if (!uuid(this.caseId)) { this.emit({ brief: null, busy: false, message: 'invalid' }); return; }
    const generation = this.generation, active = new AbortController(); this.active = active;
    this.emit({ brief: null, busy: true, message: 'empty' });
    const deadline = this.now() + 10000;
    const fail = (message: View['message']) => { if (generation === this.generation) this.invalidate(message); };
    const current = () => {
      if (generation !== this.generation || active.signal.aborted) return false;
      if (this.now() >= deadline) { fail('unavailable'); return false; }
      return true;
    };
    const timeout = setTimeout(() => fail('unavailable'), 10000);
    try {
      const identity = await this.deps.identity();
      if (!current()) return;
      if (!identity || !uuid(identity.actorId) || !uuid(identity.sessionId) || !Number.isSafeInteger(identity.expiresAt) || identity.expiresAt <= this.now()) { fail('auth'); return; }
      const located = await this.deps.send({ action: 'locate', caseId: this.caseId }, identity, active.signal);
      if (!current()) return;
      const locator = located.ok ? decodeBriefLocator(located.data) : null;
      if (!locator || locator.caseId !== this.caseId || locator.recipientId !== identity.actorId || locator.expiresAt <= this.now()) { fail('unavailable'); return; }
      // Recheck the actual browser session before consuming the exact head.
      const beforeRead = await this.deps.identity();
      if (!current()) return;
      if (!same(identity, beforeRead) || beforeRead!.expiresAt <= this.now()) { fail('auth'); return; }
      const response = await this.deps.send({ action: 'read', caseId: this.caseId, recipientId: locator.recipientId, grantRevision: locator.grantRevision, expectedRevision: locator.revision }, identity, active.signal);
      if (!current()) return;
      const brief = response.ok ? decodeBrief(response.data) : null;
      if (!brief || brief.kind !== 'brief' || brief.caseId !== this.caseId || brief.ownerId !== locator.ownerId || brief.recipientId !== identity.actorId || brief.grantRevision !== locator.grantRevision || brief.revision !== locator.revision || brief.category !== locator.category || brief.purpose !== locator.purpose || brief.expiresAt > locator.expiresAt || brief.expiresAt <= this.now()) { fail('unavailable'); return; }
      const finalIdentity = await this.deps.identity();
      if (!current()) return;
      if (!same(identity, finalIdentity) || finalIdentity!.expiresAt <= this.now()) { fail('auth'); return; }
      if (brief.expiresAt <= this.now() || locator.expiresAt <= this.now()) { fail('expired'); return; }
      this.identity = { ...finalIdentity!, expiresAt: Math.min(identity.expiresAt, beforeRead!.expiresAt, finalIdentity!.expiresAt) };
      this.emit({ brief, busy: false, message: 'ready' });
    } catch { fail('unavailable'); }
    finally { clearTimeout(timeout); if (generation === this.generation) this.active = null; }
  }
}
