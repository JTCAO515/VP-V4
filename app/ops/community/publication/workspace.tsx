'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {createPasswordAuthClient} from '@/lib/server/identity/browser-auth-client';
import {safetySend} from '../safety/transport';
import {PublicationOpsController,decodePublicationPending,emptyPublicationView,type PublicationView} from './controller';
import {publicationBrowserIdentity,publicationSend} from './transport';
import {publicationCopy} from './copy';
import styles from './workspace.module.css';
const journal='vp.community.publication.ops.pending/1';
export function PublicationOpsWorkspace() {
 const [locale,setLocale]=useState<'zh'|'en'>('zh');const [view,setView]=useState<PublicationView>(emptyPublicationView);const [note,setNote]=useState('');const [confirmed,setConfirmed]=useState(false);
 const controller=useRef<PublicationOpsController|null>(null);const download=useRef<string|null>(null);const c=publicationCopy[locale];
 useEffect(()=>{
  let mounted=true;const client=createPasswordAuthClient();
  const clearDownload=()=>{if (download.current) {URL.revokeObjectURL(download.current);download.current=null;}};
  const own=new PublicationOpsController({identity:()=>publicationBrowserIdentity(client?.auth??null),send:publicationSend,source:async(submissionId,identity,signal)=>{const result=await safetySend(JSON.stringify({action:'object',submissionId}),identity,signal);return 'data' in result?result.data:null;},read:()=>decodePublicationPending(sessionStorage.getItem(journal)),write:p=>sessionStorage.setItem(journal,JSON.stringify(p)),erase:()=>sessionStorage.removeItem(journal),changed:v=>{if (mounted) {clearDownload();setView(v);if (!v.selected) setNote('');if (v.message!=='ready' || v.deleted) setConfirmed(false);}}});controller.current=own;
  const invalidate=()=>{own.invalidate();clearDownload();};const subscription=client?.auth.onAuthStateChange(event=>{if (event==='INITIAL_SESSION') return;own.invalidate(event==='SIGNED_OUT' || event==='SIGNED_IN');clearDownload();});
  document.addEventListener('visibilitychange',invalidate);window.addEventListener('pagehide',invalidate);window.addEventListener('blur',invalidate);window.addEventListener('pageshow',invalidate);const timer=setInterval(()=>own.expire(),500);
  return ()=>{mounted=false;own.dispose();clearDownload();controller.current=null;subscription?.data.subscription.unsubscribe();document.removeEventListener('visibilitychange',invalidate);window.removeEventListener('pagehide',invalidate);window.removeEventListener('blur',invalidate);window.removeEventListener('pageshow',invalidate);clearInterval(timer);};
 },[]);
 const selected=view.selected;const source=view.source;const blocked=view.busy || !!view.pending;
 const exportFile=()=>{const value=controller.current?.exportSnapshot();if (!value || value!==view.exported || view.busy) return;download.current=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=download.current;link.download='community-publication-scoped-export.json';link.click();URL.revokeObjectURL(download.current);download.current=null;};
 return <main className={styles.workspace} lang={locale}>
  <header className={styles.header}><div><p>VisePanda · Ops</p><h1>{c.title}</h1></div><label>{c.language}<select value={locale} onChange={e=>setLocale(e.target.value as 'zh'|'en')}><option value="zh">中文</option><option value="en">English</option></select></label></header>
  <p>{c.intro}</p><nav className={styles.actions}><Link href="/ops/community">{c.back}</Link><Link href="/auth/sign-in?returnTo=%2Fops%2Fcommunity%2Fpublication">{c.login}</Link><button disabled={view.busy} onClick={()=>void controller.current?.execute({action:'queue',cursor:null})}>{c.queue}</button><button disabled={view.busy} onClick={()=>void controller.current?.execute({action:'queue',cursor:null})}>{c.refresh}</button></nav>
  <p role="status" aria-live="polite">{view.busy?c.loading:view.deleted?c.deleted:view.message==='login'?c.needLogin:c[view.message]}</p>
  {view.pending?<section className={styles.panel}><p>{c.unknown}</p><div className={styles.actions}><button disabled={view.busy} onClick={()=>void controller.current?.resolve('operation')}>{c.check}</button><button disabled={view.busy} onClick={()=>void controller.current?.retry()}>{c.retry}</button><button disabled={view.busy} onClick={()=>void controller.current?.resolve('abandon')}>{c.abandon}</button></div></section>:null}
  {view.records.map(item=><article className={styles.panel} key={item.id}><p>{c.state[item.state]} · {c.version} {item.version}</p><button disabled={view.busy} onClick={()=>void controller.current?.execute({action:'inspect',publicationId:item.id})}>{c.inspect}</button></article>)}
  {view.message==='ready' && !selected && !view.records.length && !view.exported && !view.deleted?<p>{c.noItems}</p>:null}
  {view.cursor?<button disabled={view.busy} onClick={()=>void controller.current?.execute({action:'queue',cursor:view.cursor})}>{c.next}</button>:view.records.length?<p>{c.complete}</p>:null}
  {selected?<section className={styles.panel}><h2>{c.state[selected.state]}</h2><p>{c.version} {selected.version} · {selected.submissionVersion}/{selected.safetyVersion}</p><p>{c.declaration}</p><p>{c.unknownRights}</p><h3>{c.rightsNote}</h3><p className={styles.body}>{selected.rightsNote??c.unknownValue}</p><button disabled={blocked} onClick={()=>void controller.current?.inspectSource()}>{c.source}</button>
   {source?<article><h3>{source.title}</h3><p className={styles.body}>{source.content}</p><dl><dt>{c.affiliation}</dt><dd>{c.identity[source.authorDisclosure]}</dd><dt>{c.reviewerAffiliation}</dt><dd>{c.identity[source.reviewerDisclosure??'unknown']}</dd><dt>{c.interest}</dt><dd>{source.benefitDisclosure===null?c.unknownValue:source.benefitDisclosure || c.noInterest}</dd></dl></article>:null}
   {selected.state==='pending_rights' && source?<form onSubmit={e=>{e.preventDefault();void controller.current?.decide('approve',note);}}><h3>{c.reviewHeading}</h3><p>{c.independence}</p><label>{c.note}<textarea required maxLength={400} rows={4} value={note} disabled={blocked} onChange={e=>setNote(e.target.value)}/></label><div className={styles.actions}><button type="submit" disabled={blocked || !note.trim()}>{c.approve}</button><button type="button" disabled={blocked || !note.trim()} onClick={()=>void controller.current?.decide('reject',note)}>{c.reject}</button></div></form>:null}
   {selected.state==='rights_approved' && source?<><p>{c.independence}</p><button disabled={blocked} onClick={()=>void controller.current?.publish()}>{c.publish}</button></>:null}
   {selected.state==='published'?<button disabled={blocked} onClick={()=>void controller.current?.revoke()}>{c.revoke}</button>:null}
  </section>:null}
  <section className={styles.panel}><h2>{c.export}</h2><p>{c.scope}</p><button disabled={view.busy} onClick={()=>void controller.current?.execute({action:'export'})}>{c.export}</button>{view.exported?<button disabled={view.busy} onClick={exportFile}>{c.download}</button>:null}</section>
  <section className={`${styles.panel} ${styles.danger}`}><label><input type="checkbox" checked={confirmed} disabled={view.busy} onChange={e=>setConfirmed(e.target.checked)}/>{c.confirmDelete}</label><button disabled={blocked || !confirmed} onClick={()=>void controller.current?.execute({action:'delete',operationId:crypto.randomUUID(),confirmed:true})}>{c.delete}</button></section>
 </main>;
}
