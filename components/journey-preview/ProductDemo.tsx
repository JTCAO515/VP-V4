"use client";

import { VisePandaMark } from "@/components/brand/VisePandaMark";

import Link from "next/link";
import Image from "next/image";
import { Activity, useCallback, useEffect, useState } from "react";
import { COPY, PRODUCT_DEMO, type Lang } from "@/lib/journey-preview/copy";
import { CANVAS } from "@/lib/journey-preview/canvas";
import { CHATS, CHAT_CONTEXT } from "@/lib/journey-preview/chats";
import type { DemoSurface } from "@/lib/journey-preview/features";
import type { ToolId } from "@/lib/journey-preview/tools";
import type { ChatId, Localized } from "@/lib/journey-preview/types";
import { DEMO_UI } from "@/lib/journey-preview/ui";
import { ToolGlyph } from "./art";
import AskSurface from "./AskSurface";
import CopilotSurface from "./CopilotSurface";
import DishDrawer from "./DishDrawer";
import ExploreSurface from "./ExploreSurface";
import TodaySurface from "./TodaySurface";
import ToolsSurface, { type ToolRequest } from "./ToolsSurface";
import UserSurface from "./UserSurface";
import { StateBadge } from "./parts";
import { EARLY_ACCESS_URL } from "@/lib/journey-copy";

export type DemoIntent = { surface: DemoSurface; chatId?: ChatId; nonce: number };

type Props = {
  lang: Lang;
  fullscreen: boolean;
  onFullscreen?: (value: boolean) => void;
  intent: DemoIntent | null;
  standalone?: boolean;
  onLanguageToggle?: () => void;
};

const NOOP_FULLSCREEN = () => {};

const TOUR: Array<{ surface: DemoSurface; chat?: ChatId; diff?: boolean }> = [
  { surface: "ask", chat: "shanghai" },
  { surface: "ask", chat: "shanghai", diff: true },
  { surface: "copilot" },
  { surface: "ask", chat: "import" },
];

const NAV: Array<{ id: DemoSurface; glyph: string }> = [
  { id: "today", glyph: "◉" },
  { id: "ask", glyph: "✦" },
  { id: "copilot", glyph: "◫" },
  { id: "tools", glyph: "⚒" },
  { id: "explore", glyph: "◇" },
];

const MOBILE_NAV: Array<{ id: DemoSurface; glyph: string }> = [...NAV, { id: "user", glyph: "○" }];

export default function ProductDemo({ lang, fullscreen, onFullscreen = NOOP_FULLSCREEN, intent, standalone = false, onLanguageToggle }: Props) {
  const ui = PRODUCT_DEMO.ui;
  const [surface, setSurface] = useState<DemoSurface>("ask");
  const [chatId, setChatId] = useState<ChatId>("shanghai");
  const [focusMemory, setFocusMemory] = useState<string | null>(null);
  const [focusTool, setFocusTool] = useState<ToolRequest | null>(null);
  const [placeRequest, setPlaceRequest] = useState<{ text: Localized; requestId: number } | null>(null);
  const [dishOpen, setDishOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [tourStep, setTourStep] = useState(-1);
  const currentDoc = CANVAS[chatId];

  const navLabel: Record<DemoSurface, string> = {
    today: DEMO_UI.today.title[lang],
    ask: PRODUCT_DEMO.nav.ask[lang],
    copilot: PRODUCT_DEMO.nav.copilot[lang],
    tools: DEMO_UI.copilot.tools[lang],
    explore: PRODUCT_DEMO.nav.explore[lang],
    user: PRODUCT_DEMO.nav.user[lang],
  };

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectChat = useCallback((id: ChatId) => {
    setSurface("ask");
    setChatId(id);
    setDishOpen(false);
    setToast("");
    setTourStep(-1);
  }, []);

  // External deep links from the page's capability cards and the hero button.
  useEffect(() => {
    if (!intent) return;
    setSurface(intent.surface);
    if (intent.chatId) setChatId(intent.chatId);
    setDishOpen(false);
    setTourStep(-1);
  }, [intent]);

  const immersive = fullscreen || standalone;

  // Immersive mode locks the page behind it. The shareable page stays immersive.
  useEffect(() => {
    if (!immersive) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (standalone) return () => { document.body.style.overflow = previous; };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [immersive, standalone, onFullscreen]);

  const openMemory = (memoryId: string) => {
    setSurface("copilot");
    setFocusMemory(memoryId);
  };

  const openTool = (toolId: string) => {
    setSurface("tools");
    setFocusTool({ id: toolId as ToolId, requestId: Date.now() });
  };

  const runTour = (step: number) => {
    const target = TOUR[step];
    if (!target) return;
    setTourStep(step);
    setSurface(target.surface);
    if (target.chat) setChatId(target.chat);
  };

  return (
    <section className={standalone ? "section product-demo-section demo-standalone" : "section product-demo-section"} id="product-demo">
      <div className={standalone ? "demo-standalone-inner" : "wrap"}>
        {standalone ? null : <h2 className="display">{ui.sectionTitle[lang]}</h2>}
        {standalone ? null : <p className="section-lede">{ui.sectionLede[lang]}</p>}

        <div className={immersive ? `demo-frame fullscreen${standalone ? " standalone" : ""}` : "demo-frame"}>
          <div className="demo-browser" aria-label="Interactive VisePanda product demo">
            <header className="demo-browser-bar">
              <Link className="journey-studio-home" href={`/journey?lang=${lang}`}><VisePandaMark style={{ fontSize: 20, display: "inline-block" }} /><span> / Journey studio</span><small>{lang === "zh" ? "演示预览 · 刷新即重置" : "Demo preview · refresh resets"}</small></Link>
              <div className="demo-bar-right">
                <span className="vp-fixture" title={DEMO_UI.fixtureLong[lang]}>{DEMO_UI.fixture[lang]}</span>
                {standalone ? (
                  <>
                    <button className="vp-demo-language" onClick={onLanguageToggle} aria-label={lang === "en" ? "Switch to Chinese" : "切换到英文"}>{COPY.nav.langToggle[lang]}</button>
                    <a className="vp-demo-back" href={EARLY_ACCESS_URL} target="_blank" rel="noopener noreferrer">Early Access ↗</a>
                  </>
                ) : (
                  <button
                    className="vp-fullscreen"
                    onClick={() => onFullscreen(!fullscreen)}
                    aria-label={fullscreen ? DEMO_UI.shell.exitFullscreen[lang] : DEMO_UI.shell.fullscreen[lang]}
                  >
                    <ToolGlyph name={fullscreen ? "collapse" : "expand"} />
                    <span>{fullscreen ? DEMO_UI.shell.exitFullscreen[lang] : DEMO_UI.shell.fullscreen[lang]}</span>
                  </button>
                )}
              </div>
            </header>

            <div className="demo-app-shell">
              <aside className="demo-sidebar">
                <span className="demo-brand"><Image className="demo-brand-logo" src="/assets/visepanda/brand/icon-heart-20260913.png" width={30} height={30} alt="" aria-hidden="true" /><span>{lang === "zh" ? "旅途，有你。" : "Make it yours."}</span></span>

                <nav className="demo-main-nav">
                  {NAV.map((item) => (
                    <button
                      key={item.id}
                      className={surface === item.id ? "active" : ""}
                      onClick={() => setSurface(item.id)}
                    >
                      <span>{item.glyph}</span>{navLabel[item.id]}
                    </button>
                  ))}
                </nav>

                <div className="demo-chat-list">
                  <small>{ui.chats[lang]}</small>
                  <div className="demo-chat-scroll">
                    {CHATS.map((chat) => (
                      <button
                        key={chat.id}
                        className={surface === "ask" && chatId === chat.id ? "active" : ""}
                        onClick={() => selectChat(chat.id)}
                      >
                        <b>{chat.title[lang]}</b>
                        <small>{chat.subtitle[lang]}</small>
                        <em>{chat.when[lang]}</em>
                      </button>
                    ))}
                  </div>
                </div>

                <button className={surface === "user" ? "demo-user active" : "demo-user"} onClick={() => setSurface("user")}>
                  <span className="journey-avatar" aria-hidden="true">MT</span>
                  {navLabel.user}
                </button>
              </aside>

              <main className="demo-workspace">
                <div className="journey-chat-select" hidden={surface !== "ask"}>
                  <label htmlFor="preview-chat">{ui.chats[lang]}</label>
                  <select id="preview-chat" value={chatId} onChange={(event) => selectChat(event.target.value as ChatId)}>
                    {CHATS.map((chat) => <option key={chat.id} value={chat.id}>{chat.title[lang]}</option>)}
                  </select>
                </div>
                {CHATS.map((chat) => <Activity key={chat.id} mode={surface === "ask" && chatId === chat.id ? "visible" : "hidden"}>
                  <AskSurface
                    lang={lang}
                    chatId={chat.id}
                    onToast={setToast}
                    onOpenMemory={openMemory}
                    onOpenDishes={() => setDishOpen(true)}
                    onOpenTool={openTool}
                    forceDiff={tourStep === 1 && chat.id === "shanghai"}
                    placeRequest={chat.id === "shanghai" ? placeRequest : null}
                  />
                </Activity>)}

                <Activity mode={surface === "copilot" ? "visible" : "hidden"}>
                  <CopilotSurface
                    lang={lang}
                    focusMemory={focusMemory}
                    onToast={setToast}
                    onOpenCanvas={() => selectChat("shanghai")}
                  />
                </Activity>

                <Activity mode={surface === "tools" ? "visible" : "hidden"}><ToolsSurface lang={lang} focusTool={focusTool} onToast={setToast} /></Activity>

                <Activity mode={surface === "explore" ? "visible" : "hidden"}>
                  <ExploreSurface lang={lang} onAdd={(text) => { setPlaceRequest({ text, requestId: Date.now() }); selectChat("shanghai"); }} />
                </Activity>

                <Activity mode={surface === "today" ? "visible" : "hidden"}><TodaySurface lang={lang} onToast={setToast} /></Activity>
                <Activity mode={surface === "user" ? "visible" : "hidden"}><UserSurface lang={lang} onToast={setToast} /></Activity>

                {dishOpen ? <DishDrawer lang={lang} onClose={() => setDishOpen(false)} onToast={setToast} /> : null}

                {toast ? <div className="demo-toast" role="status">{toast}</div> : null}
              </main>

              <nav className="demo-mobile-nav" aria-label={DEMO_UI.shell.mobileNav[lang]}>
                {MOBILE_NAV.map((item) => (
                  <button key={item.id} className={surface === item.id ? "active" : ""} onClick={() => setSurface(item.id)}>
                    <span>{item.glyph}</span><small>{navLabel[item.id]}</small>
                  </button>
                ))}
              </nav>
            </div>

            <footer className="demo-status-bar">
              <span className="vp-status-context">
                <b>{DEMO_UI.status.trip[lang]}</b>{currentDoc.title[lang]}
                <i>·</i><b>{DEMO_UI.status.context[lang]}</b>{CHAT_CONTEXT[chatId][lang]}
                <i>·</i>{DEMO_UI.localTime[lang]}{fullscreen && !standalone ? ` · ${DEMO_UI.shell.escHint[lang]}` : ""}
              </span>
              <div className="vp-state-legend">
                <small>{DEMO_UI.status.states[lang]}</small>
                {(["confirmed", "proposed", "inferred", "recheck"] as const).map((state) => <StateBadge key={state} state={state} lang={lang} />)}
              </div>
              <div className="vp-tour">
                <small>{DEMO_UI.tour.title[lang]}</small>
                {DEMO_UI.tour.steps.map((step, index) => (
                  <button key={index} className={tourStep === index ? "active" : ""} aria-current={tourStep === index ? "step" : undefined} onClick={() => runTour(index)}>
                    {index + 1}. {step[lang]}
                  </button>
                ))}
              </div>
            </footer>
          </div>
        </div>
      </div>
    </section>
  );
}
