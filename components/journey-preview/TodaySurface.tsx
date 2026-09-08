"use client";

import { useState } from "react";
import type { Lang } from "@/lib/journey-preview/copy";
import { SIM_CHECKS, TODAY } from "@/lib/journey-preview/today";
import { DEMO_UI } from "@/lib/journey-preview/ui";
import { ToolGlyph } from "./art";
import { EvidenceRow } from "./parts";

export default function TodaySurface({ lang, onToast }: { lang: Lang; onToast: (message: string) => void }) {
  const ui = DEMO_UI.today;
  const sim = DEMO_UI.sim;
  const [ran, setRan] = useState(false);
  const [running, setRunning] = useState(false);
  const [openCheck, setOpenCheck] = useState<string | null>(null);

  const counts = SIM_CHECKS.reduce(
    (value, check) => ({ ...value, [check.verdict]: value[check.verdict] + 1 }),
    { pass: 0, warn: 0, fail: 0 } as Record<string, number>,
  );

  const run = () => {
    setRunning(true);
    window.setTimeout(() => { setRunning(false); setRan(true); }, 700);
  };

  return (
    <div className="vp-today">
      <header>
        <div><small>{ui.title[lang]}</small><h3>{DEMO_UI.ability.today[lang]}</h3></div>
        <span className="vp-fixture">{DEMO_UI.fixture[lang]}</span>
      </header>

      <div className="vp-today-grid">
        <section className="vp-today-next">
          <small>{ui.next[lang]}</small>
          <strong>{TODAY.next.title[lang]}</strong>
          <dl>
            <div><dt>{ui.leaveAt[lang]}</dt><dd>{TODAY.next.leaveAt[lang]}</dd></div>
            <div><dt>{DEMO_UI.canvas.transfer[lang]}</dt><dd>{TODAY.next.transfer[lang]}</dd></div>
            <div><dt>{ui.bring[lang]}</dt><dd>{TODAY.next.bring[lang]}</dd></div>
          </dl>
        </section>

        <section className="vp-today-conditions">
          <small>{ui.conditions[lang]}</small>
          <dl>
            {TODAY.conditions.map((item) => (
              <div key={item.label.en}><dt>{item.label[lang]}</dt><dd>{item.value[lang]}</dd></div>
            ))}
          </dl>
          <em>{DEMO_UI.fixture[lang]}</em>
        </section>
      </div>

      <section className="vp-recovery">
        <small>{ui.recovery[lang]}</small>
        <div>
          {TODAY.recovery.map((item) => (
            <article key={item.id}>
              <ToolGlyph name="alert" />
              <strong>{item.title[lang]}</strong>
              <p>{item.body[lang]}</p>
              <button onClick={() => onToast(DEMO_UI.canvas.nothingApplied[lang])}>{ui.seeChange[lang]}</button>
            </article>
          ))}
        </div>
        <p className="vp-note">{TODAY.note[lang]}</p>
      </section>

      <section className="vp-sim">
        <header>
          <strong>{sim.title[lang]}</strong>
          <button onClick={run} disabled={running}>{running ? sim.running[lang] : sim.run[lang]}</button>
        </header>

        {running ? <div className="vp-skeleton"><i /><i /><i /></div> : null}

        {ran && !running ? (
          <>
            <p className="vp-sim-summary">
              <b className="fail">{counts.fail} {sim.fail[lang]}</b>
              <b className="warn">{counts.warn} {sim.warn[lang]}</b>
              <b className="pass">{counts.pass} {sim.pass[lang]}</b>
            </p>
            <div className="vp-sim-list">
              {SIM_CHECKS.map((check) => (
                <article key={check.id} className={`verdict-${check.verdict}${openCheck === check.id ? " open" : ""}`}>
                  <button onClick={() => setOpenCheck(openCheck === check.id ? null : check.id)}>
                    <span className="vp-verdict">{check.verdict === "pass" ? sim.pass[lang] : check.verdict === "warn" ? sim.warn[lang] : sim.fail[lang]}</span>
                    <strong>{check.label[lang]}</strong>
                  </button>
                  {openCheck === check.id ? (
                    <div>
                      <p>{check.detail[lang]}</p>
                      <EvidenceRow items={check.evidence} lang={lang} />
                      {check.alternatives?.length ? (
                        <>
                          <small>{sim.alternatives[lang]}</small>
                          <ul>{check.alternatives.map((alt, index) => <li key={index}>{alt[lang]}</li>)}</ul>
                          <button onClick={() => onToast(DEMO_UI.canvas.nothingApplied[lang])}>{sim.toDiff[lang]}</button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
