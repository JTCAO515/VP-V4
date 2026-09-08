"use client";

import { useState } from "react";
import type { Lang } from "@/lib/journey-preview/copy";
import { PRODUCT_DEMO } from "@/lib/journey-preview/copy";
import { MEMORY, MEMORY_EXPORT } from "@/lib/journey-preview/memory";
import { DEMO_UI } from "@/lib/journey-preview/ui";
import { ConfidenceTag, StateBadge } from "./parts";

type Tab = "account" | "profile" | "memory" | "preferences" | "privacy";

export default function UserSurface({ lang, onToast }: { lang: Lang; onToast: (message: string) => void }) {
  const ui = DEMO_UI.user;
  const profile = PRODUCT_DEMO.userProfile;
  const [tab, setTab] = useState<Tab>("account");
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="demo-user-page">
      <header>
        <div className="user-identity">
          <span className="journey-avatar large" aria-hidden="true">MT</span>
          <div>
            <small>{profile.id}</small>
            <h3>{profile.name}</h3>
            <p>{profile.email} · {profile.location}</p>
          </div>
        </div>
        <button onClick={() => { setEditing((value) => !value); setSaved(false); }}>{editing ? ui.cancel[lang] : ui.edit[lang]}</button>
      </header>

      <nav className="user-page-tabs">
        <button className={tab === "account" ? "active" : ""} onClick={() => setTab("account")}>{ui.account[lang]}</button>
        <button className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>{ui.travelProfile[lang]}</button>
        <button className={tab === "memory" ? "active" : ""} onClick={() => setTab("memory")}>{ui.memory[lang]}</button>
        <button className={tab === "preferences" ? "active" : ""} onClick={() => setTab("preferences")}>{ui.preferences[lang]}</button>
        <button className={tab === "privacy" ? "active" : ""} onClick={() => setTab("privacy")}>{ui.privacy[lang]}</button>
      </nav>

      {tab === "account" ? (
        <div className="user-page-grid">
          <section>
            <small>{lang === "zh" ? "账户与设置" : "Account & settings"}</small>
            <dl>
              <div><dt>Email</dt><dd>{profile.email}</dd></div>
              <div><dt>{lang === "zh" ? "语言" : "Language"}</dt><dd>{profile.language}</dd></div>
              <div><dt>{lang === "zh" ? "货币" : "Currency"}</dt><dd>{profile.currency}</dd></div>
              <div><dt>{lang === "zh" ? "时区" : "Time zone"}</dt><dd>{profile.timeZone}</dd></div>
            </dl>
          </section>
          <section>
            <small>{ui.travelProfile[lang]}</small>
            <dl>
              {MEMORY.slice(0, 4).map((item) => (
                <div key={item.id}><dt>{item.dimension[lang]}</dt><dd>{editing && item.id === "m-budget" ? "USD 200–300" : item.value[lang]}</dd></div>
              ))}
            </dl>
            {editing ? <button onClick={() => { setEditing(false); setSaved(true); onToast(ui.saved[lang]); }}>{ui.save[lang]}</button> : null}
            {saved ? (
              <div className="profile-saved">
                <b>{ui.saved[lang]}</b>
                <small>{ui.affects[lang]}</small>
                <ul><li>Shanghai Day 2</li><li>Beijing hotel shortlist</li></ul>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {tab === "profile" ? (
        <div className="vp-user-profile">
          {MEMORY.map((item) => (
            <article key={item.id} className={item.hard ? "hard" : ""}>
              <small>{item.dimension[lang]}</small>
              <strong>{item.value[lang]}</strong>
              {item.fill !== undefined ? <i className="vp-memory-bar"><b style={{ width: `${item.fill}%` }} /></i> : null}
              <StateBadge state={item.state} lang={lang} />
            </article>
          ))}
        </div>
      ) : null}

      {tab === "memory" ? (
        <div className="vp-user-memory">
          {MEMORY.map((item) => (
            <article key={item.id}>
              <header><small>{item.dimension[lang]}</small><StateBadge state={item.state} lang={lang} /><ConfidenceTag level={item.confidence} lang={lang} /></header>
              <strong>{item.value[lang]}</strong>
              <dl>
                <div><dt>{DEMO_UI.copilot.source[lang]}</dt><dd>{item.sourceDetail[lang]}</dd></div>
                <div><dt>{DEMO_UI.copilot.updated[lang]}</dt><dd>{item.updated[lang]}</dd></div>
                <div><dt>{DEMO_UI.copilot.impact[lang]}</dt><dd>{item.impact.map((line) => line[lang]).join(" · ")}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      ) : null}

      {tab === "preferences" ? (
        <div className="user-page-grid">
          <section>
            <small>{ui.preferences[lang]}</small>
            <dl>
              <div><dt>{lang === "zh" ? "界面语言" : "Interface language"}</dt><dd>English</dd></div>
              <div><dt>{lang === "zh" ? "货币" : "Currency"}</dt><dd>USD</dd></div>
              <div><dt>{ui.units[lang]}</dt><dd>{lang === "zh" ? "公里" : "Kilometres"}</dd></div>
              <div><dt>{ui.temperature[lang]}</dt><dd>°C</dd></div>
            </dl>
          </section>
          <section>
            <small>{ui.notifications[lang]}</small>
            <dl>
              <div><dt>{lang === "zh" ? "行程变化" : "Itinerary changes"}</dt><dd>{lang === "zh" ? "开启" : "On"}</dd></div>
              <div><dt>{lang === "zh" ? "预订提醒" : "Booking reminders"}</dt><dd>{lang === "zh" ? "开启" : "On"}</dd></div>
              <div><dt>{lang === "zh" ? "营销" : "Marketing"}</dt><dd>{lang === "zh" ? "关闭" : "Off"}</dd></div>
              <div><dt>{ui.defaultStart[lang]}</dt><dd>09:00</dd></div>
            </dl>
          </section>
        </div>
      ) : null}

      {tab === "privacy" ? (
        <div className="vp-privacy">
          <section>
            <small>{ui.dataUse[lang]}</small>
            <ul>{ui.dataUseItems.map((item, index) => <li key={index}>{item[lang]}</li>)}</ul>
          </section>
          <section>
            <small>{DEMO_UI.copilot.pause[lang]}</small>
            <p>{DEMO_UI.copilot.paused[lang]}</p>
          </section>
          <section>
            <small>{ui.exportData[lang]}</small>
            <pre>{MEMORY_EXPORT}</pre>
          </section>
          <section>
            <small>{ui.deleteData[lang]}</small>
            <p>{ui.deleteWarn[lang]}</p>
            <button onClick={() => setConfirmDelete((value) => !value)}>{ui.deleteData[lang]}</button>
            {confirmDelete ? <p className="vp-banner">{lang === "zh" ? "这里只切换演示状态，不会真的删除数据。" : "This only changes the demo state. No data is deleted."}</p> : null}
          </section>
          <p className="vp-note">{ui.noCollection[lang]}</p>
        </div>
      ) : null}
    </div>
  );
}
