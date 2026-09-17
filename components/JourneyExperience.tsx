"use client";

import { VisePandaMark } from "@/components/brand/VisePandaMark";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { journeyCopy, earlyAccessCopy, EARLY_ACCESS_URL, type JourneyLocale } from "@/lib/journey-copy";

const destinations = [
  { id: "guilin", category: "slow", image: "/assets/visepanda/journey/guilin.png" },
  { id: "shanghai", category: "city", image: "/assets/visepanda/journey/shanghai.png" },
  { id: "hangzhou", category: "slow", image: "/assets/visepanda/journey/hangzhou.png" },
] as const;
const sections = ["about", "ask", "explore", "profile"];
const filters = ["all", "slow", "city"] as const;
type Filter = typeof filters[number];
type Exchange = { prompt: number | null; text: string };

function Arrow({ down = false }: { down?: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={down ? "j-arrow j-down" : "j-arrow"}><path d="M5 19 19 5M5 5h14v14" stroke="currentColor" strokeWidth="1.35" /></svg>;
}
function Bookmark({ filled = false }: { filled?: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"}><path d="M6 3h12v18l-6-4-6 4V3Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>;
}
function Chapter({ n, text }: { n: string; text: string }) {
  return <p className="j-chapter"><span>{n}</span><span>/</span>{text}</p>;
}

export function JourneyExperience() {
  const [locale, setLocale] = useState<JourneyLocale>("en");
  const [menu, setMenu] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [saved, setSaved] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Exchange[]>([]);
  const [detail, setDetail] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const heroImage = useRef<HTMLImageElement>(null);
  const progress = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const chat = useRef<HTMLDivElement>(null);
  const c = journeyCopy[locale];
  const access = earlyAccessCopy[locale];

  useEffect(() => {
    setLocale(new URLSearchParams(window.location.search).get("lang") === "zh" ? "zh" : "en");
  }, []);

  useEffect(() => {
    const previous = { lang: document.documentElement.lang, dir: document.documentElement.dir };
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    document.documentElement.dir = "ltr";
    return () => { document.documentElement.lang = previous.lang; document.documentElement.dir = previous.dir; };
  }, [locale]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const elements = root.current?.querySelectorAll<HTMLElement>("[data-reveal]");
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); }
    }), { threshold: 0.08 });
    elements?.forEach(el => { el.classList.add("j-reveal-ready"); observer.observe(el); });
    let frame = 0;
    const update = () => {
      frame = 0;
      const range = document.documentElement.scrollHeight - window.innerHeight;
      if (progress.current) progress.current.style.transform = `scaleX(${range > 0 ? window.scrollY / range : 0})`;
      if (heroImage.current) heroImage.current.style.transform = media.matches ? "none" : `translateY(${Math.min(window.scrollY * .12, 85)}px) scale(1.12)`;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener("scroll", onScroll, { passive: true });
    media.addEventListener("change", onScroll);
    update();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener("scroll", onScroll); media.removeEventListener("change", onScroll); };
  }, []);

  useEffect(() => { if (chat.current) chat.current.scrollTop = chat.current.scrollHeight; }, [messages]);
  useEffect(() => {
    if (detail !== null) dialog.current?.showModal();
    else dialog.current?.close();
  }, [detail]);

  function toggleSave(id: string) { setSaved(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]); }
  function send(prompt: number | null, text = "") {
    setMessages(current => [...current, { prompt, text }]);
    setInput("");
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = input.trim();
    if (!value) return;
    const index = c.prompts.findIndex(prompt => prompt === value);
    send(index < 0 ? null : index, value);
  }
  function exploreCategory(category: string) { setFilter(category === "slow" || category === "city" ? category : "all"); }
  const detailPlace = detail === null ? null : c.places[detail];

  return <div ref={root} className="journey" data-locale={locale} id="beginning">
    <a className="j-skip" href="#content">{c.skip}</a>
    <header className="j-header">
      <a className="j-brand" href="#beginning" aria-label={c.home}><VisePandaMark /></a>
      <nav aria-label={locale === "en" ? "Main navigation" : "主导航"} className={menu ? "j-nav is-open" : "j-nav"}>
        {sections.map((id, i) => <a key={id} href={id === "profile" ? EARLY_ACCESS_URL : `#${id}`} target={id === "profile" ? "_blank" : undefined} rel={id === "profile" ? "noopener noreferrer" : undefined} onClick={() => setMenu(false)}>{id === "profile" ? access.nav : c.nav[i]}{i === 3 && <Arrow />}</a>)}
      </nav>
      <div className="j-header-actions"><div className="j-languages" aria-label={locale === "en" ? "Language" : "语言"}>
        <button onClick={() => setLocale("en")} aria-pressed={locale === "en"} lang="en">EN</button><span>/</span><button onClick={() => setLocale("zh")} aria-pressed={locale === "zh"} lang="zh-CN">中文</button>
      </div><button className="j-menu" aria-expanded={menu} aria-label={menu ? c.close : c.menu} onClick={() => setMenu(!menu)}>{menu ? "−" : "+"}</button></div>
      <div ref={progress} className="j-progress" aria-hidden="true" />
    </header>

    <main id="content">
      <section className="j-hero" aria-labelledby="j-hero-title">
        <div className="j-hero-copy">
          <h1 id="j-hero-title"><span>{c.title[0]}</span><em>{c.title[1]}</em></h1>
          <div className="j-hero-intro"><p>{c.intro}</p><a className="j-button" href={`/journey/plan?lang=${locale}`}>{access.plan}<Arrow /></a></div>
        </div>
        <div className="j-hero-photo"><Image ref={heroImage} src={destinations[0].image} alt={c.places[0].alt} fill sizes="100vw" priority />
          <div className="j-photo-caption"><span>{c.location}</span><p>{c.caption}</p><i /></div>
          <a className="j-scroll" href="#about" aria-label={c.scroll}><Arrow down /></a>
          <span className="j-image-note">{c.imageNote}</span>
        </div>
      </section>

      <section className="j-about j-section" id="about" aria-labelledby="j-about-title">
        <div data-reveal><Chapter n="01" text={c.idea} /><h2 id="j-about-title">{c.aboutTitle[0]} <em>{c.aboutTitle[1]}</em></h2></div>
        <div className="j-about-grid">
          <figure className="j-about-photo" data-reveal><div className="j-photo-frame"><Image src={destinations[2].image} alt={c.places[2].alt} fill sizes="(max-width: 700px) 90vw, 45vw" /><div className="j-stamp" aria-hidden="true">慢<small>{c.stamp}</small></div></div><figcaption>{c.aboutFoot}</figcaption></figure>
          <div className="j-about-text" data-reveal><h3>{c.aboutLead}</h3><p>{c.aboutBody}</p><div className="j-values">{c.aboutRows.map((row, i) => <a key={i} href={`#${["explore", "ask", "profile"][i]}`}><span>0{i + 1}</span><h4>{row}</h4><Arrow /></a>)}</div></div>
        </div>
      </section>

      <section className="j-ask" id="ask" aria-labelledby="j-ask-title">
        <div className="j-ask-intro" data-reveal><Chapter n="02" text={c.askLabel} /><h2 id="j-ask-title">{c.askTitle.map((line, i) => <span key={i}>{line}</span>)}</h2><div className="j-short-rule" /><p>{c.askBody}</p><div className="j-prompts">{c.prompts.map((prompt, i) => <button key={i} onClick={() => send(i)}>{prompt}<Arrow /></button>)}</div></div>
        <div className="j-chat-panel" data-reveal>
          <div className="j-chat-header"><span className="j-avatar"><Image src="/assets/visepanda/brand/icon-heart-20260913.png" width={40} height={40} alt="VisePanda" style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: "50%" }} /></span><span>{c.companion}</span><small><i />{c.preview}</small></div>
          <div className="j-chat-messages" ref={chat} role="log" aria-label={c.companion} aria-live="polite" tabIndex={0}>
            <div className="j-welcome"><span className="j-star" aria-hidden="true">✳</span><h3>{c.welcome}</h3><p>{c.welcomeBody}</p></div>
            {messages.map((message, i) => <div className="j-exchange" key={i}>
              <p className="j-user-message">{message.prompt === null ? message.text : c.prompts[message.prompt]}</p>
              <div className="j-response">{message.prompt === null ? <p>{c.customReply}</p> : <><small>{c.responseLabel}</small><h3>{c.replies[message.prompt].title}</h3><p>{c.replies[message.prompt].body}</p><ol>{c.replies[message.prompt].steps.map(step => <li key={step}>{step}</li>)}</ol><a href="#explore" onClick={() => exploreCategory(c.replies[message.prompt!].category)}>{c.exploreAction}<Arrow /></a></>}</div>
            </div>)}
          </div>
          <form onSubmit={submit} className="j-chat-form"><label className="j-visually-hidden" htmlFor="j-message">{c.placeholder}</label><input id="j-message" value={input} onChange={e => setInput(e.target.value)} placeholder={c.placeholder} maxLength={1000} autoComplete="off" /><button className="j-send" disabled={!input.trim()} aria-label={c.send}><Arrow /></button></form>
          <div className="j-chat-meta"><small>{c.chatNote}</small>{messages.length > 0 && <button onClick={() => setMessages([])}>{c.reset}</button>}</div>
          <a className="j-button j-planning-link" href={`/journey/plan?lang=${locale}`}>{access.workspace}<Arrow /></a>
        </div>
      </section>

      <section className="j-explore j-section" id="explore" aria-labelledby="j-explore-title">
        <div data-reveal><Chapter n="03" text={c.exploreLabel} /><div className="j-explore-heading"><h2 id="j-explore-title">{c.exploreTitle[0]}<br /><em>{c.exploreTitle[1]}</em></h2><div className="j-filters" aria-label={c.exploreLabel}>{filters.map((value, i) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{c.filters[i]}</button>)}</div></div></div>
        <div className="j-destinations" data-filter={filter}>{destinations.map((place, i) => filter !== "all" && filter !== place.category ? null : <article className="j-destination" key={place.id}>
          <button className="j-destination-photo" onClick={() => setDetail(i)} aria-label={`${c.view} ${c.places[i].name}`}><Image src={place.image} alt={c.places[i].alt} fill sizes="(max-width: 700px) 90vw, 33vw" /><span className="j-photo-action"><Arrow /></span></button>
          <div className="j-place-meta"><small>{c.places[i].category}</small><div><button className="j-place-name" onClick={() => setDetail(i)}>{c.places[i].name}</button><button className="j-bookmark" aria-label={`${saved.includes(place.id) ? c.unsave : c.save} ${c.places[i].name}`} aria-pressed={saved.includes(place.id)} onClick={() => toggleSave(place.id)}><Bookmark filled={saved.includes(place.id)} /></button></div><p>{c.places[i].line}</p></div>
        </article>)}</div>
        <p className="j-explore-note">{c.imageNote}<span>·</span>{c.placeNote}</p>
      </section>

      <section className="j-profile j-section" id="profile" aria-labelledby="j-profile-title">
        <div data-reveal><Chapter n="04" text={access.nav} /><h2 id="j-profile-title">{access.title[0]}<br /><em>{access.title[1]}</em></h2><div className="j-short-rule" /><p className="j-profile-intro">{access.body}</p></div>
        <div className="j-profile-card j-access-card" data-reveal><span className="j-access-star" aria-hidden="true">✳</span><h3>{access.cardTitle}</h3><p>{access.cardBody}</p><a className="j-button j-button-light" href={EARLY_ACCESS_URL} target="_blank" rel="noopener noreferrer">{access.nav}<Arrow /></a><small className="j-session">{access.note}</small></div>
      </section>
    </main>
    <footer className="j-footer"><div className="j-footer-top"><a className="j-footer-brand" href="#beginning"><VisePandaMark /></a><p>{c.footer}</p><a className="j-back" href="#beginning" aria-label={c.back}><Arrow /></a></div><div className="j-footer-bottom"><span>{c.legal}</span><span>{c.footerNote}</span><a href={`/research?lang=${locale}`}>{locale === "zh" ? "参加产品研究" : "Join product research"}</a><div><button onClick={() => setLocale("en")} aria-pressed={locale === "en"}>English</button><span>/</span><button onClick={() => setLocale("zh")} aria-pressed={locale === "zh"}>中文</button></div></div></footer>

    <dialog ref={dialog} className="j-dialog" onClose={() => setDetail(null)} onClick={e => { if (e.target === e.currentTarget) setDetail(null); }} aria-labelledby="j-detail-title">
      {detail !== null && detailPlace && <div className="j-story"><button className="j-dialog-close" onClick={() => setDetail(null)} aria-label={c.dismiss}>×</button><div className="j-story-photo"><Image src={destinations[detail].image} alt={detailPlace.alt} fill sizes="(max-width: 700px) 90vw, 400px" /></div><div className="j-story-copy"><small>{detailPlace.category}</small><h2 id="j-detail-title">{detailPlace.name}</h2><h3>{detailPlace.line}</h3><p>{detailPlace.body}</p><button className="j-button" onClick={() => toggleSave(destinations[detail].id)}><Bookmark filled={saved.includes(destinations[detail].id)} />{saved.includes(destinations[detail].id) ? c.unsave : c.save}</button><a href="#ask" onClick={() => { send(detail === 1 ? 2 : 0); setDetail(null); }}>{c.askPlace}<Arrow /></a><small className="j-story-note">{c.detailNote}</small></div></div>}
    </dialog>
  </div>;
}
