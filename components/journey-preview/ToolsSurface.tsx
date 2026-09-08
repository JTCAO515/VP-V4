"use client";

import { useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/journey-preview/copy";
import { TOOLS, type ToolId } from "@/lib/journey-preview/tools";
import { DEMO_UI } from "@/lib/journey-preview/ui";
import { ToolGlyph } from "./art";

export type ToolRequest = { id: ToolId; requestId: number };
type Props = { lang: Lang; focusTool: ToolRequest | null; onToast: (message: string) => void };

export default function ToolsSurface({ lang, focusTool, onToast }: Props) {
  const ui = DEMO_UI.copilot;
  const [toolId, setToolId] = useState<ToolId>(focusTool?.id ?? "translate");
  const [screenId, setScreenId] = useState<string>(TOOLS[0].screens[0].id);
  const [degraded, setDegraded] = useState<"normal" | "partial" | "offline">("normal");

  const handledRequest = useRef<ToolRequest | null>(null);
  useEffect(() => {
    if (!focusTool || handledRequest.current === focusTool) return;
    handledRequest.current = focusTool;
    setToolId(focusTool.id);
    const tool = TOOLS.find((item) => item.id === focusTool.id);
    if (tool) setScreenId(tool.screens[0].id);
  }, [focusTool]);

  const tool = TOOLS.find((item) => item.id === toolId) ?? TOOLS[0];
  const screen = tool.screens.find((item) => item.id === screenId) ?? tool.screens[0];
  const offlineAvailable = tool.id === "translate" && (screen.id === "direction" || screen.id === "address");

  return (
    <div className="demo-tools-page">
      <header>
        <div><small>Tools</small><h3>{ui.toolsTitle[lang]}</h3></div>
        <span className="vp-ability">{DEMO_UI.ability.tools[lang]}</span>
      </header>

      <div className="vp-degrade-controls" aria-label={DEMO_UI.empty.loading[lang]}>
        <button className={degraded === "normal" ? "active" : ""} onClick={() => setDegraded("normal")}>{DEMO_UI.empty.normal[lang]}</button>
        <button className={degraded === "partial" ? "active" : ""} onClick={() => setDegraded("partial")}>{DEMO_UI.empty.simulatePartial[lang]}</button>
        <button className={degraded === "offline" ? "active" : ""} onClick={() => setDegraded("offline")}>{DEMO_UI.empty.simulateOffline[lang]}</button>
      </div>

      {degraded !== "normal" ? (
        <p className={`vp-degrade-banner ${degraded}`}>
          <b>{degraded === "partial" ? DEMO_UI.empty.partial[lang] : DEMO_UI.empty.offline[lang]}</b>
          {degraded === "partial" ? DEMO_UI.empty.partialBody[lang] : DEMO_UI.empty.offlineBody[lang]}
        </p>
      ) : null}

      <div className="vp-tools">
        <nav className="vp-tool-list">
          {TOOLS.map((item) => (
            <button
              key={item.id}
              className={item.id === toolId ? "active" : ""}
              onClick={() => { setToolId(item.id); setScreenId(item.screens[0].id); }}
            >
              <ToolGlyph name={item.glyph} />
              <strong>{item.title[lang]}</strong>
              <small>{item.lede[lang]}</small>
            </button>
          ))}
        </nav>

        <section className="vp-tool-detail">
          <header>
            <ToolGlyph name={tool.glyph} />
            <div>
              <h4>{tool.title[lang]}</h4>
              <p>{tool.lede[lang]}</p>
            </div>
          </header>

          <div className="vp-tool-screens">
            {tool.screens.map((item) => (
              <button key={item.id} className={item.id === screen.id ? "active" : ""} onClick={() => setScreenId(item.id)}>
                {item.label[lang]}
              </button>
            ))}
          </div>

          <article className="vp-tool-screen">
            <strong>{screen.label[lang]}</strong>
            <p>{screen.body[lang]}</p>
            {screen.fields?.length ? (
              <dl>
                {screen.fields.map((field, index) => (
                  <div key={index}><dt>{field.k[lang]}</dt><dd>{field.v[lang]}</dd></div>
                ))}
              </dl>
            ) : null}
            {screen.note ? <p className="vp-tool-note">{screen.note[lang]}</p> : null}
            <button disabled={degraded === "offline" && !offlineAvailable} onClick={() => onToast(`${tool.title[lang]} · ${screen.label[lang]}`)}>
              {lang === "zh" ? "查看演示状态" : "Show this demo state"}
            </button>
          </article>

          <p className="vp-tool-boundary"><b>{ui.boundary[lang]}</b>{tool.boundary[lang]}</p>
        </section>
      </div>
    </div>
  );
}
