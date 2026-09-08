"use client";

import { useState } from "react";
import type { Lang } from "@/lib/journey-preview/copy";
import { MEMORY, MEMORY_EXPORT, MEMORY_PREVIEW } from "@/lib/journey-preview/memory";
import { DEMO_UI } from "@/lib/journey-preview/ui";
import { ConfidenceTag, StateBadge } from "./parts";

type Props = {
  lang: Lang;
  focusMemory: string | null;
  onToast: (message: string) => void;
  onOpenCanvas: () => void;
};

export default function CopilotSurface({ lang, focusMemory, onToast, onOpenCanvas }: Props) {
  const ui = DEMO_UI.copilot;
  const [forgotten, setForgotten] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  const [preview, setPreview] = useState(false);
  const [exporting, setExporting] = useState(false);

  return (
    <div className="demo-copilot">
      <header>
        <div>
          <small>VisePanda Copilot</small>
          <h3>{ui.memoryTitle[lang]}</h3>
        </div>
        <span className="vp-ability">{DEMO_UI.ability.copilot[lang]}</span>
      </header>

      <div className="vp-memory">
          {paused ? <p className="vp-banner">{ui.paused[lang]}</p> : null}

          <div className="vp-memory-grid">
            {MEMORY.map((item) => {
              const gone = forgotten.includes(item.id);
              return (
                <article
                  key={item.id}
                  className={`vp-memory-item${item.hard ? " hard" : ""}${gone ? " gone" : ""}${focusMemory === item.id ? " focus" : ""}`}
                >
                  <header>
                    <small>{item.dimension[lang]}</small>
                    <StateBadge state={item.state} lang={lang} />
                  </header>
                  <strong>{item.value[lang]}</strong>
                  {item.fill !== undefined ? <i className="vp-memory-bar"><b style={{ width: `${item.fill}%` }} /></i> : null}
                  {item.hard ? <p className="vp-hard">{ui.hard[lang]}</p> : null}
                  <ConfidenceTag level={item.confidence} lang={lang} />
                  <dl>
                    <div><dt>{ui.source[lang]}</dt><dd>{item.sourceDetail[lang]}</dd></div>
                    <div><dt>{ui.updated[lang]}</dt><dd>{item.updated[lang]}</dd></div>
                    <div><dt>{ui.impact[lang]}</dt><dd>{item.impact.map((line) => line[lang]).join(" · ")}</dd></div>
                  </dl>
                  <div className="vp-memory-actions">
                    <button onClick={() => onToast(item.value[lang])}>{ui.confirm[lang]}</button>
                    <button
                      onClick={() => {
                        setForgotten((value) => (gone ? value.filter((id) => id !== item.id) : [...value, item.id]));
                        if (!gone) onToast(ui.forgotten[lang]);
                      }}
                    >
                      {ui.forget[lang]}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <section className="vp-memory-governance">
            <button onClick={() => { setPaused((value) => !value); onToast(paused ? ui.resume[lang] : ui.paused[lang]); }}>
              {paused ? ui.resume[lang] : ui.pause[lang]}
            </button>
            <button onClick={() => setExporting((value) => !value)}>{ui.exportTitle[lang]}</button>
            <button onClick={() => setPreview((value) => !value)}>{ui.preview[lang]}</button>
          </section>

          {exporting ? (
            <section className="vp-export">
              <small>{ui.exportBody[lang]}</small>
              <pre>{MEMORY_EXPORT}</pre>
            </section>
          ) : null}

          {preview ? (
            <section className="vp-preview">
              <header><b>{MEMORY_PREVIEW.title[lang]}</b></header>
              <div className="vp-preview-cols">
                <div>
                  <small>{ui.before[lang]}</small>
                  <ul>{MEMORY_PREVIEW.before.map((line, index) => <li key={index}>{line[lang]}</li>)}</ul>
                </div>
                <div>
                  <small>{ui.after[lang]}</small>
                  <ul>{MEMORY_PREVIEW.after.map((line, index) => <li key={index}>{line[lang]}</li>)}</ul>
                </div>
              </div>
              <div className="vp-preview-deltas">
                {MEMORY_PREVIEW.deltas.map((delta) => (
                  <span key={delta.label.en}><b>{delta.label[lang]}</b>{delta.from} → {delta.to}</span>
                ))}
              </div>
              <button onClick={onOpenCanvas}>{ui.openCanvas[lang]}</button>
            </section>
          ) : null}
      </div>
    </div>
  );
}
