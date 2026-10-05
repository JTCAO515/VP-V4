'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {createPasswordAuthClient} from '@/lib/server/identity/browser-auth-client';
import {SafetyOpsController,decodeSafetyPending,emptySafetyView,type SafetyView} from './controller';
import {safetyBrowserIdentity,safetySend} from './transport';
import {safetyCopy} from './copy';
import styles from './workspace.module.css';
const journal='vp.community.safety.ops.pending/1';
export function SafetyOpsWorkspace() {
  const [locale,setLocale]=useState<'zh'|'en'>('zh');const [view,setView]=useState<SafetyView>(emptySafetyView);const [note,setNote]=useState('');const [confirmed,setConfirmed]=useState(false);
  const controller=useRef<SafetyOpsController|null>(null);const download=useRef<string|null>(null);const c=safetyCopy[locale];
  useEffect(()=>{
    let mounted=true;const client=createPasswordAuthClient();
    const clearDownload=()=>{if (download.current) {URL.revokeObjectURL(download.current);download.current=null;}};
    const own=new SafetyOpsController({identity:()=>safetyBrowserIdentity(client?.auth??null),send:safetySend,read:()=>decodeSafetyPending(sessionStorage.getItem(journal)),write:p=>sessionStorage.setItem(journal,JSON.stringify(p)),erase:()=>sessionStorage.removeItem(journal),changed:v=>{if (mounted) {clearDownload();setView(v);if (!v.selected) setNote('');if (v.message!=='ready') setConfirmed(false);}}});controller.current=own;
    const invalidate=()=>{own.invalidate();clearDownload();};
    const subscription=client?.auth.onAuthStateChange(event=>{if (event==='INITIAL_SESSION') return;own.invalidate(event==='SIGNED_OUT' || event==='SIGNED_IN');clearDownload();});
    document.addEventListener('visibilitychange',invalidate);window.addEventListener('pagehide',invalidate);window.addEventListener('blur',invalidate);window.addEventListener('pageshow',invalidate);
    const timer=setInterval(()=>own.expire(),500);
    return ()=>{mounted=false;own.dispose();clearDownload();controller.current=null;subscription?.data.subscription.unsubscribe();document.removeEventListener('visibilitychange',invalidate);window.removeEventListener('pagehide',invalidate);window.removeEventListener('blur',invalidate);window.removeEventListener('pageshow',invalidate);clearInterval(timer);};
  },[]);
  const state=view.message==='login'?c.needLogin:c[view.message];const selected=view.selected;const object=view.object;
  const stateLabel=(state:string)=>state==='unavailable'?c.unavailableState:state in c?c[state as keyof typeof c]:c.unknownValue;
  const exportFile=()=>{const data=controller.current?.exportSnapshot();if (!data || data!==view.exported || view.busy) return;const bytes=JSON.stringify(data,null,2);download.current=URL.createObjectURL(new Blob([bytes],{type:'application/json'}));const link=document.createElement('a');link.href=download.current;link.download='community-safety-scoped-export.json';link.click();URL.revokeObjectURL(download.current);download.current=null;};
  return <main className={styles.workspace} lang={locale}>
    <header className={styles.header}><div><p>VisePanda · Ops</p><h1>{c.title}</h1></div><label>{c.language}<select value={locale} onChange={e=>setLocale(e.target.value as 'zh'|'en')}><option value="zh">中文</option><option value="en">English</option></select></label></header>
    <p>{c.intro}</p><nav className={styles.actions}><Link href="/ops/review">{c.back}</Link><Link href="/auth/sign-in?returnTo=%2Fops%2Fcommunity%2Fsafety">{c.login}</Link><button disabled={view.busy} onClick={()=>void controller.current?.queue('reports')}>{c.reports}</button><button disabled={view.busy} onClick={()=>void controller.current?.queue('appeals')}>{c.appeals}</button><button disabled={view.busy} onClick={()=>void controller.current?.queue()}>{c.refresh}</button></nav>
    <p role="status" aria-live="polite">{view.busy?c.loading:state}</p>
    {view.pending?<section className={styles.panel}><p>{c.unknown}</p><div className={styles.actions}><button disabled={view.busy} onClick={()=>void controller.current?.resolve('operation')}>{c.check}</button><button disabled={view.busy} onClick={()=>void controller.current?.retry()}>{c.retry}</button><button disabled={view.busy} onClick={()=>void controller.current?.resolve('abandon')}>{c.abandon}</button></div></section>:null}
    {view.records.map(item=><article className={styles.panel} key={item.id}><p>{'state' in item?stateLabel(item.state):c.unknownValue} · {c.version} {'version' in item?item.version:item.safetyVersion}</p><button disabled={view.busy} onClick={()=>void controller.current?.inspect(view.collection,item.id)}>{c.inspect}</button></article>)}
    {view.message==='ready' && !selected && !view.records.length && !view.exported?<p>{c.noItems}</p>:null}
    {view.cursor?<button disabled={view.busy} onClick={()=>void controller.current?.queue(view.collection,view.cursor)}>{c.next}</button>:view.records.length?<p>{c.complete}</p>:null}
    {selected && (selected.kind==='report' || selected.kind==='appeal')?<section className={styles.panel}>
      <h2>{selected.kind==='report'?c.reports:c.appeals} · {stateLabel(selected.state)}</h2><p>{c.version} {selected.version} · {selected.submissionVersion}/{selected.safetyVersion}</p><h3>{c.reason}</h3><p className={styles.body}>{selected.kind==='report'?selected.details??c.unknownValue:selected.statement??c.unknownValue}</p><h3>{c.result}</h3><p>{selected.note??c.unknownValue}</p>
      <button disabled={view.busy} onClick={()=>void controller.current?.execute({action:'object',submissionId:selected.submissionId})}>{c.object}</button>
      {selected.state==='pending' && selected.version===1?<form onSubmit={e=>{e.preventDefault();void controller.current?.decide(selected.kind==='report'?'dismiss':'uphold',note);}}><p>{c.independence}</p><label>{c.note}<textarea required maxLength={400} rows={4} value={note} onChange={e=>setNote(e.target.value)} disabled={view.busy || !!view.pending}/></label><div className={styles.actions}><button type="submit" disabled={view.busy || !!view.pending || !note.trim()}>{selected.kind==='report'?c.dismiss:c.uphold}</button><button type="button" disabled={view.busy || !!view.pending || !note.trim()} onClick={()=>void controller.current?.decide(selected.kind==='report'?'remove':'restore',note)}>{selected.kind==='report'?c.remove:c.restore}</button></div></form>:null}
    </section>:null}
    {object?<section className={styles.panel}><h2>{object.title}</h2><p>{c.internal}</p><p className={styles.body}>{object.content}</p><dl><dt>{c.source}</dt><dd>{object.source==='unknown'?c.unknownValue:c[object.source]}</dd><dt>{c.copyright}</dt><dd>{c.unknownValue}</dd><dt>{c.affiliation}</dt><dd>{object.authorDisclosure==='unknown'?c.unknownValue:c[object.authorDisclosure]}</dd><dt>{c.reviewerAffiliation}</dt><dd>{object.reviewerDisclosure===null || object.reviewerDisclosure==='unknown'?c.unknownValue:c[object.reviewerDisclosure]}</dd><dt>{c.interest}</dt><dd>{object.benefitDisclosure===null?c.unknownValue:object.benefitDisclosure || '—'}</dd></dl></section>:null}
    <section className={styles.panel}><h2>{c.export}</h2><p>{c.scope}</p><button disabled={view.busy} onClick={()=>void controller.current?.execute({action:'export'})}>{c.export}</button>{view.exported?<button disabled={view.busy} onClick={exportFile}>{c.download}</button>:null}</section>
    <section className={`${styles.panel} ${styles.danger}`}><label><input type="checkbox" checked={confirmed} disabled={view.busy} onChange={e=>setConfirmed(e.target.checked)}/>{c.confirmDelete}</label><button disabled={view.busy || !!view.pending || !confirmed} onClick={()=>void controller.current?.execute({action:'delete',operationId:crypto.randomUUID(),confirmed:true})}>{c.delete}</button></section>
  </main>;
}
