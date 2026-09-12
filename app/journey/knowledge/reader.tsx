"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { KNOWLEDGE_CITIES, KNOWLEDGE_SCENES, type KnowledgeCity, type KnowledgeScene } from "@/lib/server/knowledge/publication/statement";
import { createPasswordAuthClient } from "@/lib/server/identity/browser-auth-client";
import { knowledgeReaderCopy } from "@/lib/i18n";
import styles from "@/app/ops/review/workspace.module.css";
type Statement = { factId: string; text: string; conditions: string[]; exclusions: string[]; expiresAt: string; reviewedAt: string; sources: {sourceRevisionId:string;publisher:string;uri:string;locator:string}[] };
export function KnowledgeReader() {
 const [locale,setLocale]=useState<"en"|"zh">("en"),[city,setCity]=useState<KnowledgeCity>("shanghai"),[scene,setScene]=useState<KnowledgeScene>("arrival");
 const [rows,setRows]=useState<Statement[]>([]),[state,setState]=useState<"loading"|"empty"|"ready"|"unavailable">("loading"),[revision,setRevision]=useState(0);
 const c=knowledgeReaderCopy[locale];
 useEffect(()=>{document.documentElement.lang=locale;document.documentElement.dir="ltr";},[locale]);
 useEffect(()=>{
  let current=true,sequence=0,timer:ReturnType<typeof setTimeout>|undefined;
  const controller=new AbortController();
  function clear(){sequence++;setRows([]);setState("loading");if(timer)clearTimeout(timer);}
  async function refresh(){
   clear();const own=sequence;
   if(document.visibilityState==="hidden")return;
   try{
    const query=new URLSearchParams({city,scene,locale});
    const response=await fetch('/api/knowledge?'+query,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])});
    const payload=await response.json();
    if(!current||own!==sequence)return;
    if(!response.ok||payload.data?.schemaVersion!=="knowledge-read/1"||!Array.isArray(payload.data.statements))throw new Error('unavailable');
    const valid=payload.data.statements.filter((row:Statement)=>Date.parse(row.expiresAt)>Date.now()) as Statement[];
    setRows(valid);setState(valid.length?'ready':'empty');
    const delay=Math.min(30000,...valid.map(row=>Date.parse(row.expiresAt)-Date.now()));
    timer=setTimeout(()=>{void refresh();},Math.max(1,delay));
   }catch{if(current&&own===sequence){setRows([]);setState('unavailable');}}
  }
  const visible=()=>{void refresh();};document.addEventListener('visibilitychange',visible);
  const subscription=createPasswordAuthClient()?.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'||event==='SIGNED_IN'||event==='USER_UPDATED'){clear();setTimeout(()=>{if(current)void refresh();},0);}});
  void refresh();
  return ()=>{current=false;controller.abort();sequence++;if(timer)clearTimeout(timer);subscription?.data.subscription.unsubscribe();document.removeEventListener('visibilitychange',visible);};
 },[city,scene,locale,revision]);
 return <main className={styles.workspace}>
  <header className={styles.header}><div><p className={styles.eyebrow}>VisePanda</p><h1>{c.heading}</h1></div><label>{c.language}<select aria-label={c.language} value={locale} onChange={e=>{setRows([]);setLocale(e.target.value as "en"|"zh");}}><option value="en">English</option><option value="zh">中文</option></select></label></header>
  <p className={styles.boundary}>{c.boundary}</p>
  <nav className={styles.actions}><Link href="/auth/sign-in?returnTo=/journey/knowledge">{c.signIn}</Link><button type="button" onClick={()=>{setRows([]);setRevision(v=>v+1);}}>{c.refresh}</button></nav>
  <section className={styles.panel}><label>{c.city}<select aria-label={c.city} value={city} onChange={e=>{setRows([]);setCity(e.target.value as KnowledgeCity);}}>{KNOWLEDGE_CITIES.map((value,i)=><option key={value} value={value}>{c.cities[i]}</option>)}</select></label><label>{c.scene}<select aria-label={c.scene} value={scene} onChange={e=>{setRows([]);setScene(e.target.value as KnowledgeScene);}}>{KNOWLEDGE_SCENES.map((value,i)=><option key={value} value={value}>{c.scenes[i]}</option>)}</select></label></section>
  <p role="status">{state==='ready'?'':c[state]}</p>
  <section className={styles.list} aria-label={c.heading}>{rows.map(row=><article className={styles.panel} key={row.factId}>
   <p className={styles.content}>{row.text}</p>{row.conditions.length>0 && <section><h2>{c.conditions}</h2><ul>{row.conditions.map((text,i)=><li key={i}>{text}</li>)}</ul></section>}{row.exclusions.length>0 && <section><h2>{c.exclusions}</h2><ul>{row.exclusions.map((text,i)=><li key={i}>{text}</li>)}</ul></section>}<p>{c.reviewed}: <time dateTime={row.reviewedAt}>{new Date(row.reviewedAt).toLocaleDateString(locale)}</time></p>
   <details><summary>{c.sources}</summary><ul>{row.sources.map(source=><li key={source.sourceRevisionId}>{/^https?:\/\//.test(source.uri)?<a href={source.uri} target="_blank" rel="noreferrer noopener">{source.publisher}</a>:source.publisher}<p>{source.locator}</p></li>)}</ul></details>
  </article>)}</section>
 </main>;
}
