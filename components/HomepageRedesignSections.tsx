"use client";

import type { LocalizedCopy } from "@/lib/i18n";
import { useState } from "react";

type HomepageRedesignSectionsProps = {
  copy: LocalizedCopy;
};

export function HomepageRedesignSections({ copy }: HomepageRedesignSectionsProps) {
  const [activeMoment, setActiveMoment] = useState(0);
  const redesign = copy.redesign;

  return (
    <>
      <section className="story-section story-flow">
        <div className="story-content flow-layout">
          <div className="story-heading story-heading-inverse">
            <h2>{redesign.flow.title}</h2>
            <p>{redesign.flow.body}</p>
          </div>
          <ol className="flow-steps">
            {redesign.flow.steps.map((step, index) => (
              <li key={step}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{step}</strong>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="story-section story-facts">
        <div className="story-content">
          <div className="story-heading">
            <h2>{redesign.facts.title}</h2>
            <p>{redesign.facts.body}</p>
          </div>
          <div className="fact-rail" role="list">
            {redesign.facts.items.map(([label]) => (
              <article key={label} role="listitem">
                <span className="fact-rail-index" aria-hidden="true" />
                <strong>{label}</strong>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="story-section story-workspace">
        <div className="story-content">
          <div className="story-heading">
            <h2>{redesign.workspace.title}</h2>
            <p>{redesign.workspace.body}</p>
          </div>
          <div className="workspace-preview" aria-label={redesign.workspace.previewLabel}>
            <div className="workspace-topline">
              <span>Trip Canvas</span>
              <small>{redesign.workspace.previewState}</small>
            </div>
            <div className="workspace-grid">
              <div className="workspace-days">
                {redesign.workspace.days.map(([day, place], index) => (
                  <div key={day} className={index === 1 ? "is-current" : ""}>
                    <span>{day}</span>
                    <strong>{place}</strong>
                  </div>
                ))}
              </div>
              <div className="workspace-change">
                <span>{redesign.workspace.changeLabel}</span>
                <strong>{redesign.workspace.changeTitle}</strong>
                <p>{redesign.workspace.changeBody}</p>
                <div className="workspace-change-actions">
                  <span className="workspace-change-action">{redesign.workspace.reviewAction}</span>
                  <span>{redesign.workspace.pendingState}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="story-section story-today">
        <div className="story-content today-layout">
          <div className="story-heading story-heading-inverse">
            <h2>{redesign.today.title}</h2>
            <p>{redesign.today.body}</p>
          </div>
          <div className="today-interaction">
            <div className="today-moments" role="tablist" aria-label={redesign.today.momentsLabel}>
              {redesign.today.moments.map((moment, index) => (
                <button
                  key={moment}
                  type="button"
                  role="tab"
                  aria-selected={activeMoment === index}
                  className={activeMoment === index ? "is-selected" : ""}
                  onClick={() => setActiveMoment(index)}
                >
                  {moment}
                </button>
              ))}
            </div>
            <div className="today-panel" role="tabpanel">
              <div>
                <span>{redesign.today.statusLabel}</span>
                <strong>{redesign.today.statusValue}</strong>
              </div>
              <div>
                <span>{redesign.today.nextLabel}</span>
                <strong>{redesign.today.nextSteps[activeMoment]}</strong>
              </div>
              <div>
                <span>{redesign.today.missingLabel}</span>
                <strong>{redesign.today.missingValue}</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="story-section story-mobile-apps">
        <div className="story-content mobile-app-layout">
          <div className="story-heading">
            <h2>{redesign.mobile.title}</h2>
            <p>{redesign.mobile.body}</p>
          </div>
          <div className="mobile-app-platforms" aria-label={redesign.mobile.label}>
            {redesign.mobile.platforms.map(([platform, state]) => (
              <div className="mobile-app-platform" key={platform}>
                <span aria-hidden="true">{platform === "iOS App" ? "iOS" : "Android"}</span>
                <strong>{platform}</strong>
                <small>{state}</small>
              </div>
            ))}
          </div>
          <div className="mobile-app-phones" aria-hidden="true">
            <div><span /><span /><span /></div>
            <div><span /><span /><span /></div>
          </div>
        </div>
      </section>
    </>
  );
}
