"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { localeOptions, type Locale } from "@/lib/i18n";
import { canvasCopy } from "./copy";
import styles from "./trip-canvas.module.css";

type Trip = Readonly<{ id:string; title:string; headVersion:number; updatedAt:string }>;
type Audit = Readonly<{ id:string; action:string; proposalId:string; createdAt:string }>;
type Proposal = Readonly<{ id:string; revision:number; baseTripVersion:number; status:"pending"; createdAt:string; expiresAt:string; titleDiff:Readonly<{before:string;after:string}>; evidence:"not_recorded"; assumptions:"not_recorded" }>;
type Phase = "loading"|"ready"|"unauthenticated"|"forbidden"|"unavailable"|"conflict";
type Mutation = "idle"|"saving"|"rejecting"|"confirming";

export function TripCanvas({ tripId }: { tripId:string }) {
  const [locale,setLocale]=useState<Locale>("en");
  const [phase,setPhase]=useState<Phase>("loading");
  const [mutation,setMutation]=useState<Mutation>("idle");
  const [trip,setTrip]=useState<Trip|null>(null);
  const [audits,setAudits]=useState<readonly Audit[]>([]);
  const [proposal,setProposal]=useState<Proposal|null>(null);
  const [included,setIncluded]=useState(true);
  const [title,setTitle]=useState("");
  const [notice,setNotice]=useState<"applied"|"rejected"|null>(null);
  const text=canvasCopy[locale];

  useEffect(()=>{document.documentElement.lang=locale==="zh"?"zh-CN":locale;document.documentElement.dir=locale==="ar"?"rtl":"ltr";},[locale]);

  const load=useCallback(async()=>{
    setPhase("loading");
    try{
      const tripResponse=await fetch(`/api/trips/${tripId}`,{cache:"no-store"});
      if(!tripResponse.ok){setPhase(tripResponse.status===401?"unauthenticated":tripResponse.status===403?"forbidden":"unavailable");return;}
      const tripBody=await tripResponse.json() as {trip:Trip;audits:readonly Audit[]};
      setTrip(tripBody.trip);setAudits(tripBody.audits);
      const proposalResponse=await fetch(`/api/trips/${tripId}/proposal`,{cache:"no-store"});
      if(proposalResponse.ok){const body=await proposalResponse.json() as {proposal:Proposal};setProposal(body.proposal);setTitle(body.proposal.titleDiff.after);setIncluded(true);setPhase("ready");return;}
      if(proposalResponse.status===409){setProposal(null);setPhase("ready");return;}
      setPhase(proposalResponse.status===401?"unauthenticated":proposalResponse.status===403?"forbidden":"unavailable");
    }catch{setPhase("unavailable");}
  },[tripId]);

  useEffect(()=>{void load();},[load]);

  const mutate=async(kind:Exclude<Mutation,"idle">,url:string,body:object,success:"applied"|"rejected"|null)=>{
    setMutation(kind);setNotice(null);
    try{
      const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      if(response.ok){setNotice(success);await load();setMutation("idle");return;}
      setMutation("idle");setPhase(response.status===401?"unauthenticated":response.status===403?"forbidden":response.status===409?"conflict":"unavailable");
    }catch{setMutation("idle");setPhase("unavailable");}
  };

  if(phase==="loading")return <CanvasShell locale={locale} setLocale={setLocale}><p role="status">{text.loading}</p></CanvasShell>;
  if(phase==="unauthenticated")return <CanvasShell locale={locale} setLocale={setLocale}><Link className={styles.primary} href="/auth/sign-in">{text.signIn}</Link></CanvasShell>;
  if(phase==="forbidden"||phase==="unavailable"||phase==="conflict")return <CanvasShell locale={locale} setLocale={setLocale}><p role="alert">{phase==="forbidden"?text.forbidden:phase==="conflict"?text.conflict:text.unavailable}</p><button className={styles.secondary} onClick={()=>void load()}>{text.reload}</button></CanvasShell>;

  return <CanvasShell locale={locale} setLocale={setLocale}>
    {notice?<p className={styles.notice} role="status">{notice==="applied"?text.applied:text.rejected}</p>:null}
    {trip?<section className={styles.trip}><p>{text.currentTrip}</p><h2>{trip.title}</h2><span>{text.version} {trip.headVersion}</span></section>:null}
    {proposal?<section className={styles.proposal} aria-label={text.pending}>
      <header><div><p>{text.pending}</p><h2>{text.revision} {proposal.revision}</h2></div><span>Base {proposal.baseTripVersion}</span></header>
      <div className={styles.diff}><article><span>{text.oldValue}</span><strong>{proposal.titleDiff.before}</strong></article><article><span>{text.newValue}</span><strong>{proposal.titleDiff.after}</strong></article></div>
      <div className={styles.provenance}><p><b>{text.evidence}:</b> {text.notRecorded}</p><p><b>{text.assumptions}:</b> {text.notRecorded}</p></div>
      <label className={styles.check}><input type="checkbox" checked={included} onChange={event=>setIncluded(event.target.checked)}/>{text.include}</label>
      <label className={styles.field}>{text.edit}<input value={title} maxLength={160} onChange={event=>setTitle(event.target.value)}/></label>
      <div className={styles.actions}>
        <button className={styles.secondary} disabled={mutation!=="idle"||!included||!title.trim()||title.trim()===proposal.titleDiff.after} onClick={()=>void mutate("saving",`/api/trips/${tripId}/proposal/revision`,{proposalId:proposal.id,title},null)}>{mutation==="saving"?text.saving:text.saveRevision}</button>
        <button className={styles.danger} disabled={mutation!=="idle"} onClick={()=>void mutate("rejecting",`/api/trips/${tripId}/proposal/reject`,{proposalId:proposal.id},"rejected")}>{mutation==="rejecting"?text.rejecting:text.reject}</button>
        <button className={styles.primary} disabled={mutation!=="idle"||!included} onClick={()=>void mutate("confirming",`/api/trips/${tripId}/confirm`,{proposalId:proposal.id,idempotencyKey:crypto.randomUUID(),digest:`canvas-${proposal.id}-${proposal.revision}`},"applied")}>{mutation==="confirming"?text.confirming:text.confirm}</button>
      </div>
    </section>:<section className={styles.empty}><p>{text.noProposal}</p><button className={styles.secondary} onClick={()=>void load()}>{text.reload}</button></section>}
    <section className={styles.audit}><h2>{text.audit}</h2>{audits.length?<ul>{audits.map(item=><li key={item.id}><span>{item.action}</span><time>{new Date(item.createdAt).toLocaleString(locale)}</time></li>)}</ul>:<p>{text.noAudit}</p>}</section>
    <p className={styles.boundary}>{text.boundary}</p>
  </CanvasShell>;
}

function CanvasShell({locale,setLocale,children}:{locale:Locale;setLocale:(locale:Locale)=>void;children:React.ReactNode}){
  const text=canvasCopy[locale];
  return <main className={styles.shell}><header className={styles.header}><Link href="/" className={styles.logo}>VisePanda.</Link><label>{text.language}<select value={locale} onChange={event=>setLocale(event.target.value as Locale)}>{localeOptions.map(option=><option value={option.value} key={option.value}>{option.flag} {option.label}</option>)}</select></label></header><section className={styles.hero}><p>{text.eyebrow}</p><h1>{text.title}</h1><span>{text.subtitle}</span></section><div className={styles.content}>{children}</div></main>;
}
