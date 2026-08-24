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
          <div className="execution-simulator">
            <article className="execution-panel execution-plan">
              <small>你的已有计划</small>
              {redesign.flow.steps.slice(0, 3).map((step, index) => (
                <div key={step}><span>Day {index + 1}</span><strong>{step}</strong></div>
              ))}
            </article>
            <span className="execution-arrow" aria-hidden="true">→</span>
            <article className="execution-panel execution-checks">
              <small>旅行执行逻辑</small>
              {redesign.facts.items.map(([label], index) => (
                <div key={label}><span className={index === 2 ? "is-attention" : "is-ready"} /><strong>{label}</strong><em>{index === 2 ? "关注" : "清晰"}</em></div>
              ))}
            </article>
            <span className="execution-arrow" aria-hidden="true">→</span>
            <article className="execution-panel execution-output">
              <small>行程与下一步</small>
              {redesign.workspace.days.map(([day, place], index) => (
                <div key={day}><span>{day}</span><strong>{place}</strong><em>{redesign.today.nextSteps[index]}</em></div>
              ))}
            </article>
          </div>
        </div>
      </section>

      <section className="story-section story-workspace">
        <div className="story-content">
          <div className="story-heading">
            <h2>{redesign.workspace.title}</h2>
            <p>{redesign.workspace.body}</p>
          </div>
          <div className="workspace-preview canvas-simulator" aria-label={redesign.workspace.previewLabel}>
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
                <div className="canvas-progress"><span>行程节奏</span><i /><i className="is-active" /><i /></div>
              </div>
              <div className="canvas-detail">
                <div className="canvas-detail-header"><span>Day 02</span><strong>{redesign.workspace.days[1][1]}</strong></div>
                <div className="canvas-timeline">
                  {redesign.today.nextSteps.slice(0, 3).map((step, index) => (
                    <div key={step}><time>{String(9 + index * 3).padStart(2, "0")}:00</time><span /><strong>{step}</strong></div>
                  ))}
                </div>
                <div className="workspace-change">
                  <span>{redesign.workspace.changeLabel}</span>
                  <strong>{redesign.workspace.changeTitle}</strong>
                  <p>{redesign.workspace.changeBody}</p>
                  <div className="workspace-change-actions"><span className="workspace-change-action">{redesign.workspace.reviewAction}</span><span>{redesign.workspace.pendingState}</span></div>
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
            <div className="today-panel today-command" role="tabpanel">
              <div className="today-next-card"><span>{redesign.today.nextLabel}</span><strong>{redesign.today.nextSteps[activeMoment]}</strong><small>{redesign.today.statusValue}</small></div>
              <div className="today-route">
                {redesign.today.nextSteps.slice(activeMoment, activeMoment + 3).concat(redesign.today.nextSteps.slice(0, activeMoment)).slice(0, 3).map((step, index) => (
                  <div key={`${step}-${index}`}><time>{String(8 + index * 2).padStart(2, "0")}:30</time><i /><strong>{step}</strong></div>
                ))}
              </div>
              <div className="today-note"><span>{redesign.today.missingLabel}</span><strong>{redesign.today.missingValue}</strong></div>
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
            <div className="app-phone app-canvas"><b>Trip Canvas</b><small>Day 03 · 西安</small><p><i />09:00 · 出发准备</p><p><i />11:30 · 行程安排</p><p><i />15:00 · 下一步</p></div>
            <div className="app-phone app-today"><b>Today</b><small>你的下一步</small><strong>查看入场安排</strong><p><i />09:30 · 行程更新</p><p><i />12:00 · 路上变化</p></div>
          </div>
        </div>
      </section>
    </>
  );
}
