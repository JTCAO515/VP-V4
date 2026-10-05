'use client';
import Link from 'next/link';
import { useEffect,useRef,useState } from 'react';
import { createPasswordAuthClient } from '@/lib/server/identity/browser-auth-client';
import { CommunityOpsController,emptyView,decodePendingReview,type CommunityView } from './controller';
import { communityBrowserIdentity,communitySend } from './transport';
import { copy } from './copy';
import styles from './workspace.module.css';
const journal='vp.community.ops.pending/1';
export function CommunityOpsWorkspace() {
  const [locale,setLocale]=useState<'zh'|'en'>('zh');const [view,setView]=useState<CommunityView>(emptyView);const [note,setNote]=useState('');const c=copy[locale];
  const controller=useRef<CommunityOpsController|null>(null);
  useEffect(()=>{
    const client=createPasswordAuthClient();let mounted=true;
    const own=new CommunityOpsController({identity:()=>communityBrowserIdentity(client?.auth??null),send:communitySend,read:()=>decodePendingReview(sessionStorage.getItem(journal)),write:p=>sessionStorage.setItem(journal,JSON.stringify(p)),erase:()=>sessionStorage.removeItem(journal),changed:v=>{if (mounted) {setView(v);if (!v.selected) setNote('');}}});controller.current=own;
    const invalidate=()=>own.invalidate();
    const visible=()=>{own.invalidate();if (document.visibilityState==='visible') void own.refresh();};
    const subscription=client?.auth.onAuthStateChange(event=>{if (event==='INITIAL_SESSION') return;own.invalidate(event==='SIGNED_OUT');setTimeout(()=>{if (mounted && document.visibilityState==='visible') void own.refresh();},0);});
    document.addEventListener('visibilitychange',visible);window.addEventListener('pagehide',invalidate);window.addEventListener('pageshow',visible);window.addEventListener('blur',invalidate);
    const timer=setInterval(()=>own.expire(),1000);
    return ()=>{mounted=false;own.dispose();controller.current=null;subscription?.data.subscription.unsubscribe();document.removeEventListener('visibilitychange',visible);window.removeEventListener('pagehide',invalidate);window.removeEventListener('pageshow',visible);window.removeEventListener('blur',invalidate);clearInterval(timer);};
  },[]);
  const selected=view.selected;const state=view.message==='login'?c.needLogin:view.message==='unknown'?c.ack:c[view.message];
  return <main className={styles.workspace} lang={locale}>
    <header className={styles.header}><div><p>VisePanda · Ops</p><h1>{c.title}</h1></div><label>{c.language}<select value={locale} onChange={e=>setLocale(e.target.value as 'zh'|'en')}><option value="zh">中文</option><option value="en">English</option></select></label></header>
    <p>{c.intro}</p><nav className={styles.actions}><Link href="/ops/review">{c.back}</Link><Link href="/ops/community/safety">{locale==='zh'?'社区安全':'Community safety'}</Link><Link href="/auth/sign-in?returnTo=%2Fops%2Fcommunity">{c.login}</Link><button disabled={view.busy} onClick={()=>void controller.current?.refresh()}>{c.refresh}</button></nav>
    <p role="status" aria-live="polite">{view.busy?c.loading:state}</p>
    {view.pending?<section className={styles.panel} aria-label={c.ack}><p>{c.ack}</p><div className={styles.actions}><button disabled={view.busy} onClick={()=>void controller.current?.resolve('operation')}>{c.check}</button><button disabled={view.busy} onClick={()=>void controller.current?.retry()}>{c.retry}</button><button disabled={view.busy} onClick={()=>void controller.current?.resolve('abandon')}>{c.abandon}</button></div></section>:null}
    {view.items.map(item=><article className={styles.panel} key={item.id}><h2>{item.title}</h2><p>{c[item.contentKind==='unknown'?'kindUnknown':item.contentKind]} · {c[item.status]} · {c.version} {item.version}</p><p>{c.identity}: {c[item.authorDisclosure]}</p><button disabled={view.busy} onClick={()=>void controller.current?.inspect(item.id)}>{c.details}</button></article>)}
    {view.message==='ready' && !selected && !view.items.length?<p>{c.noItems}</p>:null}
    {view.cursor?<div className={styles.actions}><p>{c.more}</p><button disabled={view.busy} onClick={()=>void controller.current?.refresh(view.cursor)}>{c.next}</button></div>:view.items.length?<p>{c.complete}</p>:null}
    {selected?<section className={styles.panel}><h2>{selected.title || c[selected.status]}</h2><p>{c.status}: {c[selected.status]} · {c.version} {selected.version}</p><p>{c[selected.contentKind==='unknown'?'kindUnknown':selected.contentKind]}</p><p className={styles.body}>{selected.content}</p><p>{c.identity}: {c[selected.authorDisclosure]}</p><p>{c.benefit}: {selected.benefitDisclosure===null?c.unknown:selected.benefitDisclosure || '—'}</p><p>{c.place}: {selected.place?selected.place.label??c.unknown:c.noPlace}</p><p>{c.reviewerIdentity}: {selected.reviewerDisclosure===null?c.unknown:c[selected.reviewerDisclosure]}</p><p>{c.result}: {selected.reviewNote??c.noReason}</p><h3>{c.history}</h3><ol>{selected.history.map((event,i)=><li key={`${event.version}:${event.action}:${i}`}>{c[event.action]} · {c.version} {event.version} · {new Date(event.createdAt).toLocaleString(locale==='zh'?'zh-CN':'en-US')}</li>)}</ol>
      {selected.status==='pending' && selected.version===1?<form onSubmit={e=>{e.preventDefault();void controller.current?.review('approve',note);}}><p>{c.self}</p><label>{c.note}<textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={400} rows={4} required disabled={view.busy || !!view.pending} /></label><div className={styles.actions}><button type="submit" disabled={view.busy || !!view.pending || !note.trim()}>{c.approve}</button><button type="button" disabled={view.busy || !!view.pending || !note.trim()} onClick={()=>void controller.current?.review('reject',note)}>{c.reject}</button></div></form>:null}
    </section>:null}
  </main>;
}
