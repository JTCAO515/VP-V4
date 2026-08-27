"use client";

import Image from "next/image";
import {
  ArrowRight,
  BedDouble,
  CircleHelp,
  Diamond,
  HeartHandshake,
  MessageCircle,
  Mic,
  Paperclip,
  Plus,
  Send,
  Settings,
  Sparkles,
  UserRound,
  X,
} from "@/components/icons";
import { chatWorkspaceCopy } from "@/lib/chat-workspace-i18n";
import { localeOptions, type Locale } from "@/lib/i18n";
import { useEffect, useState } from "react";

const ASSET_ROOT = "/assets/visepanda/";
const poiImages = ["scene-beijing.jpg", "scene-shanghai-rain.jpg", "scene-guangzhou-local.jpg"];
const poiNames = ["Forbidden City", "Temple of Heaven", "798 Art Zone"];
const canvasItems = ["Arrival and payment setup", "Show-to-local address card", "Official entry recheck"];

type Surface = "canvas" | "chat";

export function VisePandaChatWorkspace() {
  const [locale, setLocale] = useState<Locale>("en");
  const [surface, setSurface] = useState<Surface>("chat");
  const [showMap, setShowMap] = useState(false);
  const [showBrief, setShowBrief] = useState(false);
  const [showLanguages, setShowLanguages] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [selectedPois, setSelectedPois] = useState<Set<number>>(new Set([0]));
  const [draft, setDraft] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const copy = chatWorkspaceCopy[locale];
  const selectedLocale = localeOptions.find((option) => option.value === locale) ?? localeOptions[1];

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.title = `VisePanda AI | ${copy.chat}`;
  }, [copy.chat, locale]);

  const send = () => {
    if (!draft.trim()) return;
    setSubmitted(draft.trim());
    setDraft("");
  };

  const togglePoi = (index: number) => {
    setSelectedPois((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <main className="vp-chat-workspace" data-locale={locale}>
      <aside className="vp-chat-sidebar" aria-label="VisePanda navigation">
        <a className="vp-chat-logo" href="/" aria-label="VisePanda home"><Image className="brand-logo brand-logo-chat" src="/assets/visepanda/brand/VP-Logo.svg" alt="VisePanda" width={4096} height={4096} priority /></a>
        <nav>
          {[MessageCircle, BedDouble, Diamond, HeartHandshake].map((Icon, index) => (
            <button className={index === 0 ? "active" : ""} key={copy.nav[index]} onClick={() => setSurface(index === 1 ? "canvas" : "chat")}>
              <Icon /><span>{copy.nav[index]}</span>
            </button>
          ))}
        </nav>
        <button className="vp-chat-new" onClick={() => { setDraft(""); setSubmitted(null); setSurface("chat"); }}><Plus />{copy.newChat}</button>
        <div className="vp-chat-sidebar-footer">
          <button onClick={() => setShowLanguages(true)} aria-label={copy.language}><span className="flag-icon">{selectedLocale.flag}</span><span>{selectedLocale.currencySymbol}</span></button>
          <button aria-label={copy.collapse}><Settings /></button>
        </div>
      </aside>

      <header className="vp-chat-mobile-header">
        <button onClick={() => setShowDrawer(true)} aria-label={copy.viewChats}><MessageCircle /></button>
        <a href="/" aria-label="VisePanda home"><Image className="brand-logo brand-logo-mobile" src="/assets/visepanda/brand/VP-Logo.svg" alt="VisePanda" width={4096} height={4096} priority /></a>
        <button onClick={() => setShowLanguages(true)} aria-label={copy.language}><span className="flag-icon">{selectedLocale.flag}</span></button>
      </header>

      <section className={`vp-chat-context ${surface === "canvas" ? "mobile-active" : ""}`} aria-label={copy.canvas}>
        <header className="vp-chat-context-header">
          <div><p>{copy.tripBrief}</p><h1>{copy.canvas}</h1></div>
          <div className="vp-chat-mode-toggle" role="group" aria-label={copy.canvas}>
            <button className={!showMap ? "active" : ""} onClick={() => setShowMap(false)}>{copy.list}</button>
            <button className={showMap ? "active" : ""} onClick={() => setShowMap(true)}>{copy.map}</button>
          </div>
        </header>

        <div className="vp-chat-brief-row">
          <button onClick={() => setShowBrief((current) => !current)}><Sparkles />{copy.briefItems[0]}<ArrowRight /></button>
          <span>{copy.briefItems[1]}</span><span>{copy.briefItems[2]}</span>
        </div>
        {showBrief ? <div className="vp-chat-brief-popover"><b>{copy.tripBrief}</b><p>{copy.chatBody}</p></div> : null}
        <section className="vp-chat-day-card" aria-label="Proposal diff fixture">
          <div><p>Fixture proposal · not saved</p><h2>Visible change before confirmation</h2></div>
          <ul><li><span /><p><s>Arrival and payment setup</s> → Arrival, payment setup, and official entry recheck</p></li><li><span /><p>Evidence: reviewed fixture · Assumption: arrival time needs confirmation</p></li></ul>
          <button type="button" onClick={() => setSubmitted("Fixture proposal confirmed locally; no Trip was saved.")}>Confirm fixture change</button>
        </section>

        {showMap ? (
          <section className="vp-chat-place-view" aria-label={copy.map}>
            <Image src={`${ASSET_ROOT}scene-beijing.jpg`} alt="VisePanda China travel scene" width={1600} height={1066} unoptimized />
            <span className="vp-chat-place-pin pin-one">{poiNames[0]}</span>
            <span className="vp-chat-place-pin pin-two">{poiNames[1]}</span>
            <span className="vp-chat-place-pin pin-three">{poiNames[2]}</span>
            <p>{copy.previewOnly}</p>
          </section>
        ) : (
          <>
            <section className="vp-chat-day-card">
              <div><p>{copy.today}</p><h2>{copy.dayLabel}</h2></div>
              <BedDouble />
              <ul>{canvasItems.map((item) => <li key={item}><span /><p>{item}</p></li>)}</ul>
            </section>
            <section className="vp-chat-pois">
              <div className="vp-chat-section-heading"><div><h2>{copy.poiTitle}</h2><p>{copy.poiSubtitle}</p></div><button onClick={() => setShowMap(true)}>{copy.map}<ArrowRight /></button></div>
              <div className="vp-chat-poi-grid">
                {poiNames.map((name, index) => {
                  const active = selectedPois.has(index);
                  return <article className={active ? "selected" : ""} key={name}>
                    <Image src={`${ASSET_ROOT}${poiImages[index]}`} alt={`${name} preview`} width={800} height={533} priority={index === 0} unoptimized />
                    <div><span>{copy.poiKinds[index]}</span><h3>{name}</h3><button onClick={() => togglePoi(index)}>{active ? copy.selected : copy.add}</button></div>
                  </article>;
                })}
              </div>
            </section>
          </>
        )}
      </section>

      <section className={`vp-chat-conversation ${surface === "chat" ? "mobile-active" : ""}`} aria-label={copy.chat}>
        <header className="vp-chat-conversation-header">
          <div><button onClick={() => setShowDrawer(true)} className="vp-chat-history-button"><MessageCircle />{copy.viewChats}</button><span>{copy.chatEyebrow}</span></div>
          <button onClick={() => setShowLanguages(true)} aria-label={copy.language}><span className="flag-icon">{selectedLocale.flag}</span></button>
        </header>
        <div className="vp-chat-scroll-area">
          <div className="vp-chat-welcome-mark"><Image src="/assets/visepanda/brand/guide-welcome.png" alt="VisePanda Guide welcoming a traveller" width={1024} height={1024} /></div>
          <p className="vp-chat-eyebrow">{copy.chatEyebrow}</p>
          <h2>{copy.chatTitle}</h2><p className="vp-chat-intro">{copy.chatBody}</p>
          <button className="vp-chat-assistant-chip"><UserRound />{copy.assistantLabel}</button>
          <article className="vp-chat-message assistant"><b>{copy.assistantLabel}</b><p>{copy.greeting}</p></article>
          {submitted ? <><article className="vp-chat-message user"><p>{submitted}</p></article><article className="vp-chat-message assistant"><b>{copy.assistantLabel}</b><p>{copy.response}</p></article></> : null}
        </div>
        <div className="vp-chat-composer-wrap">
          <p>{copy.suggestionLabel}</p>
          <div className="vp-chat-suggestions">{copy.suggestions.map((item) => <button key={item} onClick={() => setDraft(item)}>{item}</button>)}</div>
          <div className="vp-chat-composer">
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={copy.placeholder} aria-label={copy.placeholder} />
            <div><button aria-label={copy.attach}><Paperclip /></button><button aria-label={copy.voice}><Mic /></button><button className="vp-chat-send" disabled={!draft.trim()} onClick={send} aria-label={copy.send}><Send /></button></div>
          </div>
          <p className="vp-chat-disclaimer"><CircleHelp />{copy.disclaimer}</p>
        </div>
      </section>

      <nav className="vp-chat-mobile-tabs" aria-label="Workspace views">
        <button className={surface === "canvas" ? "active" : ""} onClick={() => setSurface("canvas")}><BedDouble />{copy.canvas}</button>
        <button className={surface === "chat" ? "active" : ""} onClick={() => setSurface("chat")}><MessageCircle />{copy.chat}</button>
      </nav>

      {showLanguages ? <div className="vp-chat-overlay" role="presentation" onMouseDown={() => setShowLanguages(false)}><section className="vp-chat-language-modal" role="dialog" aria-label={copy.language} onMouseDown={(event) => event.stopPropagation()}><header><h2>{copy.language}</h2><button onClick={() => setShowLanguages(false)} aria-label={copy.close}><X /></button></header>{localeOptions.map((option) => <button key={option.value} className={option.value === locale ? "selected" : ""} lang={option.value} dir={option.value === "ar" ? "rtl" : "ltr"} onClick={() => { setLocale(option.value); setShowLanguages(false); }}><span className="flag-icon">{option.flag}</span><span>{option.label}</span><small>{option.currencySymbol}</small></button>)}</section></div> : null}
      {showDrawer ? <div className="vp-chat-overlay vp-chat-drawer-overlay" role="presentation" onMouseDown={() => setShowDrawer(false)}><section className="vp-chat-drawer" role="dialog" aria-label={copy.chatHistory} onMouseDown={(event) => event.stopPropagation()}><div className="vp-chat-sheet-handle" /><header><h2>{copy.chatHistory}</h2><button onClick={() => setShowDrawer(false)} aria-label={copy.close}><X /></button></header><button className="vp-chat-drawer-new" onClick={() => { setSubmitted(null); setDraft(""); setShowDrawer(false); }}><Plus />{copy.newChat}</button><button className="vp-chat-history-row" onClick={() => setShowDrawer(false)}>{copy.historyItem}<ArrowRight /></button></section></div> : null}
    </main>
  );
}
