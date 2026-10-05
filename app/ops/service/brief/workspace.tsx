'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPasswordAuthClient } from '@/lib/server/identity/browser-auth-client';
import type { BriefField, BriefFieldName } from '@/lib/server/service-cases/brief/contract';
import { BriefOpsController, type View } from './controller';
import { browserIdentity, sendBriefRead } from './transport';
import { copy, type Locale } from './copy';
import styles from './workspace.module.css';

const fields: readonly BriefFieldName[] = ['problem', 'requirements', 'budget', 'travel_pace', 'preference', 'response_detail'];
const initial: View = { brief: null, busy: false, message: 'empty' };
function FieldValue({ field, locale }: { field: BriefField; locale: Locale }) {
  const c = copy[locale];
  if (field.state === 'unknown') return <p>{c.unknown}</p>;
  const value = field.value;
  if (typeof value === 'string') return <p className={styles.value}>{field.field === 'travel_pace' ? c[value as 'relaxed' | 'balanced' | 'packed' | 'fast'] : value}</p>;
  if ('currency' in value) return <p>{new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', { style: 'currency', currency: value.currency }).format(value.perNightMinorUnits / 100)}</p>;
  const interest = (s: string) => c[s as 'food' | 'photography' | 'culture' | 'nature'];
  return <dl className={styles.requirements}>
    <div><dt>{c.city}</dt><dd>{value.city ?? c.unknown}</dd></div><div><dt>{c.durationDays}</dt><dd>{value.durationDays ?? c.unknown}</dd></div><div><dt>{c.partySize}</dt><dd>{value.partySize ?? c.unknown}</dd></div>
    <div><dt>{c.interests}</dt><dd>{value.interests?.length ? value.interests.map(interest).join(', ') : c.unknown}</dd></div>
    <div><dt>{c.dates}</dt><dd>{value.dates ? `${value.dates.startDate} – ${value.dates.endDate}` : c.unknown}</dd></div>
    <div><dt>{c.mobilityConstraints}</dt><dd className={styles.value}>{value.mobilityConstraints?.length ? value.mobilityConstraints.join(', ') : c.unknown}</dd></div>
  </dl>;
}
export function BriefOpsWorkspace() {
  const params = useSearchParams();
  const caseIds = params.getAll('caseId');
  const caseId = caseIds.length === 1 && Array.from(params.keys()).every(k => k === 'caseId') ? caseIds[0] : '';
  const [locale, setLocale] = useState<Locale>('zh'), [view, setView] = useState<View>(initial);
  const controller = useRef<BriefOpsController | null>(null);
  const c = copy[locale];
  useEffect(() => {
    let mounted = true;
    const client = createPasswordAuthClient();
    const owned = new BriefOpsController({ identity: () => browserIdentity(client?.auth ?? null), send: sendBriefRead, changed: next => { if (mounted) setView(next); } }, caseId);
    controller.current = owned;
    const refresh = () => { if (document.visibilityState === 'visible') void owned.refresh(); };
    owned.invalidate(); refresh();
    const subscription = client?.auth.onAuthStateChange(event => {
      if (event === 'INITIAL_SESSION') return;
      owned.invalidate('auth'); setTimeout(() => { if (mounted) refresh(); }, 0);
    });
    const visible = () => { owned.invalidate(); refresh(); };
    const exit = () => owned.invalidate();
    document.addEventListener('visibilitychange', visible); window.addEventListener('pagehide', exit); window.addEventListener('pageshow', visible); window.addEventListener('focus', visible);
    const expiry = setInterval(() => owned.expire(), 250);
    // Poll the authoritative server, clearing the prior body before every read.
    const poll = setInterval(refresh, 10000);
    return () => { mounted = false; owned.invalidate(); controller.current = null; subscription?.data.subscription.unsubscribe(); document.removeEventListener('visibilitychange', visible); window.removeEventListener('pagehide', exit); window.removeEventListener('pageshow', visible); window.removeEventListener('focus', visible); clearInterval(expiry); clearInterval(poll); };
  }, [caseId]);
  // Route changes fence the render before the effect clears the previous Case.
  const brief = !view.busy && view.brief?.caseId === caseId && view.brief.expiresAt > Date.now() ? view.brief : null;
  const date = (n: number) => new Date(n).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US');
  return <main className={styles.workspace} lang={locale}>
    <header className={styles.header}><div><p>VisePanda · Ops</p><h1>{c.title}</h1></div><label>{c.language}<select value={locale} onChange={e => setLocale(e.target.value as Locale)}><option value="zh">中文</option><option value="en">English</option></select></label></header>
    <p>{c.intro}</p><nav className={styles.actions}><Link href="/ops/service">{c.back}</Link><Link href="/auth/sign-in?returnTo=/ops/service">{c.login}</Link><button type="button" disabled={view.busy} onClick={() => void controller.current?.refresh()}>{c.refresh}</button></nav>
    <p role="status" aria-live="polite">{view.busy ? c.loading : c[view.message]}</p>
    {brief ? <><section className={styles.panel}><h2>{c.case}</h2><p>{brief.caseId}</p><p>{c.revision}: {brief.revision}</p><p>{c.expires}: {date(brief.expiresAt)}</p></section>
      {fields.map(name => { const entries = brief.fields.filter(f => f.field === name); return <section className={styles.panel} key={name}><h2>{c[name]}</h2>{entries.length ? entries.map(field => <div key={field.key} className={styles.field}><FieldValue field={field} locale={locale} />{field.state === 'available' ? <><p>{c.explicit}</p><dl className={styles.sources}><div><dt>{c.source}</dt><dd>{field.source.kind === 'case' ? c.caseSource : c[field.source.kind]} · {field.source.id}</dd></div><div><dt>{c.sourceRevision}</dt><dd>{field.source.revision}</dd></div><div><dt>{c.updated}</dt><dd>{date(field.source.updatedAt)}</dd></div></dl></> : null}</div>) : <p>{c.unknown}</p>}</section>; })}
    </> : null}
  </main>;
}
