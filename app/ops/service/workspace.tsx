'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPasswordAuthClient } from '@/lib/server/identity/browser-auth-client';
import { uuid, type ServiceEvidence, type ServiceMutation, type ServiceProjection } from '@/lib/server/service-cases/operations/contract';
import { canAct, decodeMarker, JOURNAL_KEY, ServiceOpsController, type Identity, type View } from './controller';
import { copy, type Locale } from './copy';
import styles from './workspace.module.css';

const initial: View = {workspace: null, pending: null, busy: false, message: 'empty'};
/** JWT fields fence local lifetime only. The cookie API and SQL independently
 * verify the actual session and staff qualification; no role claim is consulted. */
async function browserIdentity(): Promise<Identity | null> {
  const client = createPasswordAuthClient();
  if (!client) return null;
  const {data, error} = await client.auth.getSession();
  if (error || !data.session) return null;
  try {
    const payload = JSON.parse(atob(data.session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
    if (!uuid(payload.sub) || !uuid(payload.session_id) || typeof payload.exp !== 'number' || !Number.isSafeInteger(payload.exp)) return null;
    return {actorId: payload.sub, sessionId: payload.session_id, expiresAt: payload.exp * 1000};
  } catch { return null; }
}
export function ServiceOpsWorkspace() {
  const [locale, setLocale] = useState<Locale>('zh');
  const [view, setView] = useState<View>(initial);
  const controller = useRef<ServiceOpsController | null>(null);
  const c = copy[locale];
  useEffect(() => {
    let mounted = true;
    let marker = null; let blocked = false;
    try { const raw = sessionStorage.getItem(JOURNAL_KEY); if (raw) { marker = decodeMarker(JSON.parse(raw)); blocked = !marker; } } catch { blocked = true; }
    const owned = new ServiceOpsController({
      identity: browserIdentity,
      async send(bytes, identity) {
        const response = await fetch('/api/ops/service-cases/v1', {method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: {'Content-Type': 'application/json', 'x-ops-expected-actor': identity.actorId, 'x-ops-expected-session': identity.sessionId}, body: bytes, signal: AbortSignal.timeout(10000)});
        const wire = await response.json();
        return {ok: response.ok, data: wire.data, code: typeof wire.error?.code === 'string' ? wire.error.code : undefined};
      },
      save(pending) { if (pending) sessionStorage.setItem(JOURNAL_KEY, JSON.stringify(pending)); else sessionStorage.removeItem(JOURNAL_KEY); },
      changed(next) { if (mounted) setView(next); },
    }, marker, blocked);
    controller.current = owned; setView(owned.snapshot()); void owned.refresh();
    const client = createPasswordAuthClient();
    const subscription = client?.auth.onAuthStateChange(event => {
      if (event === 'INITIAL_SESSION') return;
      owned.invalidate();
      setTimeout(() => { if (mounted && document.visibilityState === 'visible') void owned.refresh(); }, 0);
    });
    const visible = () => { owned.invalidate(); if (document.visibilityState === 'visible') void owned.refresh(); };
    const exit = () => owned.invalidate();
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('pagehide', exit);
    const expiry = setInterval(() => owned.expire(), 500);
    const polling = setInterval(() => { if (document.visibilityState === 'visible') void owned.refresh(); }, 10000);
    return () => { mounted = false; owned.invalidate(); controller.current = null; subscription?.data.subscription.unsubscribe(); document.removeEventListener('visibilitychange', visible); window.removeEventListener('pagehide', exit); clearInterval(expiry); clearInterval(polling); };
  }, []);
  const w = view.workspace;
  const locked = view.busy || view.pending !== null || view.message === 'storage';
  function operation(p: ServiceProjection, action: 'accept' | 'assign') {
    void controller.current?.mutate({action, operationId: crypto.randomUUID(), caseId: p.caseId, expectedRevision: p.revision, grantRevision: p.grantRevision});
  }
  function update(event: FormEvent<HTMLFormElement>, p: ServiceProjection) {
    event.preventDefault(); if (locked) return;
    const fields = new FormData(event.currentTarget);
    const kind = String(fields.get('kind'));
    const evidence: ServiceEvidence[] = kind === 'none' ? [] : [{kind: kind as ServiceEvidence['kind'], note: String(fields.get('note') ?? ''), reference: String(fields.get('reference') ?? ''), observedAt: new Date(String(fields.get('observed'))).getTime()}];
    const start = String(fields.get('start') ?? ''), end = String(fields.get('end') ?? '');
    const command: ServiceMutation = {action: 'update', operationId: crypto.randomUUID(), caseId: p.caseId, expectedRevision: p.revision, grantRevision: p.grantRevision, status: String(fields.get('status')) as 'waiting_external' | 'resolved' | 'unresolved', evidence, minutes: !start && !end ? null : {startedAt: new Date(start).getTime(), endedAt: new Date(end).getTime()}, proposal: null};
    void controller.current?.mutate(command);
  }
  const date = (value: number) => new Date(value).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en');
  return <main className={styles.workspace} lang={locale === 'zh' ? 'zh-CN' : 'en'}>
    <header className={styles.header}><div><p>VisePanda · Ops</p><h1>{c.title}</h1></div><label>{c.language}<select value={locale} onChange={e => setLocale(e.target.value as Locale)}><option value="zh">中文</option><option value="en">English</option></select></label></header>
    <p>{c.intro}</p>
    <nav className={styles.actions}><Link href="/auth/sign-in?returnTo=/ops/service">{c.login}</Link><button type="button" disabled={view.busy} onClick={() => void controller.current?.refresh()}>{c.refresh}</button></nav>
    <p role="status" aria-live="polite">{view.busy ? c.loading : view.message === 'empty' ? '' : view.message === 'unknown' ? c.pending : c[view.message]}</p>
    {view.pending ? <section className={styles.panel} aria-label={c.operation}><h2>{c.operation}</h2><p>{view.pending.operationId}</p><div className={styles.actions}><button type="button" disabled={view.busy} onClick={() => void controller.current?.recover()}>{c.readAck}</button>{controller.current?.canAbandon() ? <button type="button" disabled={view.busy} onClick={() => void controller.current?.recover(true)}>{c.abandon}</button> : <p>{c.bytesLost}</p>}</div></section> : null}
    {w ? <><section className={styles.panel}><h2>{c.capacity}: {c[w.capacity.state]}</h2><p>{c.checked}: {date(w.capacity.checkedAt)}</p><p>{c.actor}: {w.actorId}</p></section>{w.cases.length === 0 ? <p>{c.empty}</p> : w.cases.map(p => <article className={styles.panel} key={`${p.caseId}:${p.revision}:${p.grantRevision}`}>
      <h2>{c.case} · {p.caseId}</h2><dl className={styles.details}><div><dt>{c.status}</dt><dd>{c[p.status]}</dd></div><div><dt>{c.grant}</dt><dd>{c[p.grantState]}</dd></div><div><dt>{c.expires}</dt><dd>{p.expiresAt === null ? c.unknown : date(p.expiresAt)}</dd></div><div><dt>{c.urgency}</dt><dd>{c[p.urgency]}</dd></div></dl>
      {p.urgency === 'urgent' ? <p>{c.urgentHint}</p> : null}
      <h3>{c.problem}</h3><p className={styles.problem}>{p.problem}</p>
      {p.staff ? <div><p>{c.staff}: {p.staff.label}</p><p>{c.acceptedAt}: {date(p.staff.acceptedAt)}</p><p>{c.shift}: {date(p.staff.shiftEndsAt)}</p><p>{c.noEta}</p></div> : <p>{c.noStaff}</p>}
      <p>{c.context}</p><p>{c.minutes}: {p.manualMinutes}</p><p>{c.minutesHint}</p>
      <h3>{c.evidence}</h3><p>{c.tutorialHint}</p>{p.evidence.length ? <ul>{p.evidence.map((e, i) => <li key={i}><strong>{c[e.kind]}</strong><p className={styles.problem}>{e.note}</p><p className={styles.problem}>{c.reference}: {e.reference}</p><p>{c.observed}: {date(e.observedAt)}</p></li>)}</ul> : <p>{c.noEvidence}</p>}
      <div className={styles.actions}>{canAct('accept', p, w, Date.now()) ? <button type="button" disabled={locked} onClick={() => operation(p, 'accept')}>{c.accept}</button> : null}{canAct('assign', p, w, Date.now()) ? <button type="button" disabled={locked} onClick={() => operation(p, 'assign')}>{c.assign}</button> : null}</div>
      {canAct('update', p, w, Date.now()) ? <form onSubmit={event => update(event, p)}><fieldset disabled={locked}><legend>{c.update}</legend><label>{c.outcome}<select name="status" defaultValue="waiting_external"><option value="waiting_external">{c.waiting_external}</option><option value="resolved">{c.resolved}</option><option value="unresolved">{c.unresolved}</option></select></label><label>{c.evidenceKind}<select name="kind" defaultValue="none"><option value="none">{c.none}</option><option value="tutorial">{c.tutorial}</option><option value="contacted_provider">{c.contacted_provider}</option><option value="external_resolution">{c.external_resolution}</option></select></label><label>{c.note}<textarea name="note" maxLength={1000}/></label><label>{c.reference}<input name="reference" maxLength={300}/></label><label>{c.observed}<input name="observed" type="datetime-local"/></label><label>{c.start}<input name="start" type="datetime-local"/></label><label>{c.end}<input name="end" type="datetime-local"/></label><p>{c.doneHint}</p><button type="submit">{c.record}</button></fieldset></form> : null}
    </article>)}</> : null}
  </main>;
}
