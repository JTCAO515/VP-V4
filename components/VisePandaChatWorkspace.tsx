"use client";

import { CircleHelp, Diamond, Send, Sparkles, UserRound } from "@/components/icons";
import { VisePandaMark } from "@/components/brand/VisePandaMark";
import { getLocaleAttributes, localeOptions, productShellCopy, type Locale } from "@/lib/i18n";
import { useEffect, useState } from "react";
import styles from "@/components/product-shell/ProductShell.module.css";

type Surface = "today" | "ask" | "copilot" | "tools" | "explore" | "profile";
const surfaceIds: readonly Surface[] = ["today", "ask", "copilot", "tools", "explore", "profile"];

export function VisePandaChatWorkspace() {
  const [locale, setLocale] = useState<Locale>("zh");
  const [surface, setSurface] = useState<Surface>("today");
  const [draft, setDraft] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const attributes = getLocaleAttributes(locale);
  const content = productShellCopy[locale];
  const activeIndex = surfaceIds.indexOf(surface);
  useEffect(() => { document.documentElement.lang = attributes.lang; document.documentElement.dir = attributes.dir; document.title = `VisePanda | ${content.destination[activeIndex]}`; }, [activeIndex, attributes.dir, attributes.lang, content.destination]);
  function submit() { const value = draft.trim(); if (value) { setSubmitted(value); setDraft(""); } }
  return <main className={styles.shell} data-locale={locale}>
    <header className={styles.topbar}><a href="/" aria-label="VisePanda home" className={styles.brand}><VisePandaMark /></a><p>{content.goldenRoute}</p><select aria-label="Interface language" value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>{localeOptions.map((option) => <option key={option.value} value={option.value}>{option.flag} {option.label}</option>)}</select></header>
    <div className={styles.layout}>
      <nav className={styles.nav} aria-label="Product destinations">{surfaceIds.map((id, index) => <button key={id} className={surface === id ? styles.active : ""} onClick={() => setSurface(id)}><span>0{index + 1}</span>{content.destination[index]}</button>)}</nav>
      <section className={styles.canvas} aria-label="Trip Canvas"><p>{content.canvas}</p><h1>{surface === "today" ? content.todayTitle : content.destination[activeIndex]}</h1><p>{content.preview}</p><div className={styles.ribbon}>01 · 02 · 03</div><article className={styles.routeCard}><Sparkles /><p>{content.goldenRoute}</p><h2>{content.todayTitle}</h2><ul><li>{content.unavailable}</li><li>{content.noLive}</li><li>{content.proposal}</li></ul></article><div className={styles.unavailable}><Diamond /><div><strong>{content.unavailable}</strong><p>{content.noLive}</p></div></div></section>
      <section className={styles.ask} aria-label="Ask VisePanda"><p>{content.ask}</p><h2>{content.askTitle}</h2><article className={styles.message}><UserRound /><p>{content.askBody}</p></article>{submitted ? <article className={styles.submitted}><b>{content.ask}</b><p>{submitted}</p><small>{content.received}</small></article> : null}<div className={styles.composer}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={content.placeholder} aria-label={content.ask} /><button onClick={submit} disabled={!draft.trim()} aria-label="Send"><Send /></button></div><p className={styles.disclaimer}><CircleHelp /> {content.disclaimer}</p></section>
    </div><nav className={styles.mobileNav} aria-label="Mobile product destinations">{[0, 1, 4, 3].map((index) => <button key={surfaceIds[index]} className={surface === surfaceIds[index] ? styles.active : ""} onClick={() => setSurface(surfaceIds[index])}>{content.destination[index]}</button>)}<details><summary>{content.more}</summary><button onClick={() => setSurface("copilot")}>{content.destination[2]}</button><button onClick={() => setSurface("profile")}>{content.destination[5]}</button></details></nav>
  </main>;
}
