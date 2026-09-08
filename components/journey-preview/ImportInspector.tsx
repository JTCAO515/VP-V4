"use client";

import { useState } from "react";
import type { Lang } from "@/lib/journey-preview/copy";
import { IMPORT_ITEMS, IMPORT_STAGES, IMPORT_UI } from "@/lib/journey-preview/import";
import { ConfidenceTag } from "./parts";

export default function ImportInspector({ lang, onReviewDiff }: { lang: Lang; onReviewDiff: () => void }) {
  const [stage, setStage] = useState(2);
  const [edited, setEdited] = useState<string[]>([]);
  const current = IMPORT_STAGES[stage];

  const toggle = (id: string) => setEdited((value) => (
    value.includes(id) ? value.filter((item) => item !== id) : [...value, id]
  ));

  return (
    <section className="vp-import">
      <header>
        <div><small>{IMPORT_UI.title[lang]}</small><p>{IMPORT_UI.lede[lang]}</p></div>
        <span>{stage + 1}/4</span>
      </header>

      <nav className="vp-import-steps" aria-label={IMPORT_UI.title[lang]}>
        {IMPORT_STAGES.map((item, index) => (
          <button key={item.id} className={stage === index ? "active" : index < stage ? "done" : ""} onClick={() => setStage(index)}>
            <i>{index + 1}</i><span>{item.label[lang]}</span>
          </button>
        ))}
      </nav>

      <div className="vp-import-stage">
        <strong>{current.label[lang]}</strong>
        <p>{current.body[lang]}</p>

        {current.id === "parsing" ? (
          <div className="vp-import-entities"><span>Dates</span><span>Cities</span><span>POIs</span><span>Booking fields</span></div>
        ) : null}

        {current.id === "extracted" ? (
          <>
            <p className="vp-import-partial"><b>{IMPORT_UI.partial[lang]}</b>{IMPORT_UI.partialBody[lang]}</p>
            <div className="vp-import-items">
              {IMPORT_ITEMS.map((item) => {
                const changed = edited.includes(item.id);
                return (
                  <article key={item.id} className={item.failed && !changed ? "failed" : changed ? "edited" : ""}>
                    <div><small>{item.field[lang]}</small><strong>{changed ? item.alternate[lang] : item.value[lang]}</strong></div>
                    <ConfidenceTag level={changed ? "high" : item.confidence} lang={lang} />
                    <button onClick={() => toggle(item.id)}>{changed ? IMPORT_UI.undo[lang] : item.failed ? IMPORT_UI.repair[lang] : IMPORT_UI.edit[lang]}</button>
                  </article>
                );
              })}
            </div>
          </>
        ) : null}

        {current.id === "checked" ? <button className="vp-import-review" onClick={onReviewDiff}>{IMPORT_UI.review[lang]}</button> : null}
      </div>
      <small className="vp-import-privacy">{IMPORT_UI.privacy[lang]}</small>
    </section>
  );
}
