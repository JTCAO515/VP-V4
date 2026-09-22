"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ReadinessResult } from "@/lib/server/readiness/index";
import styles from "./readiness.module.css";

type Answer = "unknown" | "yes" | "no";
export function ReadinessWorkspace({ tripId }: { tripId: string }) {
  const [locale, setLocale] = useState<"en" | "zh">("en");
  const [city, setCity] = useState("shanghai");
  const [applies, setApplies] = useState<Answer>("unknown");
  const [documentReady, setDocumentReady] = useState<Answer>("unknown");
  const [conditionsChecked, setConditionsChecked] = useState<Answer>("unknown");
  const [timing, setTiming] = useState("now");
  const [selectedTime, setSelectedTime] = useState("");
  const [result, setResult] = useState<ReadinessResult | null>(null);
  const [notice, setNotice] = useState<"unavailable" | "expired" | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const assessedVersion = useRef<number | null>(null);
  const expiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const text = (en: string, zh: string) => locale === "zh" ? zh : en;
  function clear() { request.current?.abort(); request.current = null; if (expiry.current) clearTimeout(expiry.current); setResult(null); setNotice(null); setBusy(false); }
  useEffect(() => {
    const hide = () => { if (document.visibilityState !== "visible") clear(); };
    document.addEventListener("visibilitychange", hide);
    return () => { document.removeEventListener("visibilitychange", hide); request.current?.abort(); if (expiry.current) clearTimeout(expiry.current); };
  }, []);
  useEffect(() => {
    clear(); assessedVersion.current = null; setApplies("unknown"); setDocumentReady("unknown"); setConditionsChecked("unknown");
  }, [tripId]);
  async function check(event: FormEvent) {
    event.preventDefault(); clear();
    const controller = new AbortController(); request.current = controller; setBusy(true);
    const started = performance.now(); const taskId = crypto.randomUUID();
    try {
      const tripResponse = await fetch(`/api/trips/${tripId}`, { cache: "no-store", signal: controller.signal });
      if (!tripResponse.ok) throw new Error("Unavailable");
      const trip = await tripResponse.json();
      const version = trip.trip?.headVersion;
      if (!Number.isSafeInteger(version) || version < 0) throw new Error("Invalid Trip");
      if (controller.signal.aborted || request.current !== controller) return;
      if (assessedVersion.current !== null && assessedVersion.current !== version) {
        assessedVersion.current = version;
        setApplies("unknown"); setDocumentReady("unknown"); setConditionsChecked("unknown");
        throw new Error("Changed Trip; declarations must be entered again");
      }
      assessedVersion.current = version;
      const checkAt = timing === "later" ? new Date(selectedTime).toISOString() : timing;
      const response = await fetch(`/api/trips/${tripId}/readiness`, { method: "POST", cache: "no-store", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId, tripVersion: version, city, locale, applies, documentReady, conditionsChecked, checkAt }) });
      if (!response.ok) throw new Error("Unavailable");
      const { data } = await response.json() as { data: ReadinessResult };
      const lifetime = Date.parse(data.expiresAt) - Date.parse(data.evaluatedAt);
      const remaining = lifetime - (performance.now() - started);
      if (data.schemaVersion !== "readiness/1" || data.taskId !== taskId || data.tripId !== tripId || data.tripVersion !== version
        || !Number.isFinite(lifetime) || lifetime > 30_000 || remaining <= 0 || !Array.isArray(data.evidence) || data.evidence.length > 1) throw new Error("Invalid response");
      if (controller.signal.aborted || request.current !== controller || document.visibilityState !== "visible") return;
      setResult(data); setBusy(false);
      expiry.current = setTimeout(() => { setResult(null); setNotice("expired"); }, remaining);
    } catch {
      if (controller.signal.aborted || request.current !== controller) return;
      setResult(null); setNotice("unavailable"); setBusy(false);
    }
  }
  function answer(label: string, value: Answer, setter: (v: Answer) => void) {
    return <label>{label}<select value={value} onChange={event => { clear(); setter(event.target.value as Answer); }}>
      <option value="unknown">{text("Unknown", "未知")}</option><option value="yes">{text("Yes", "是")}</option><option value="no">{text("No", "否")}</option>
    </select></label>;
  }
  const labels: Record<string, string> = {
    available: text("Reviewed evidence available", "有已审核依据"), unknown: text("Unknown", "未知"),
    satisfied: text("Satisfied for this check · your report", "此项检查已满足 · 用户声明"), not_satisfied: text("Not yet satisfied", "尚未满足"),
    not_applicable: text("Not applicable", "不适用"), now: text("Check now", "现在检查"), not_yet: text("Your selected check time has not arrived", "尚未到你选定的检查时间"),
  };
  return <main className={styles.main} lang={locale}>
    <header className={styles.header}><Link href={`/visepanda/trips/${tripId}`}>{text("Back to Trip", "返回行程")}</Link><label>{text("Language", "语言")}<select value={locale} onChange={e => { clear(); setLocale(e.target.value as "zh" | "en"); }}><option value="en">English</option><option value="zh">中文</option></select></label></header>
    <h1>{text("Preparation check", "准备检查")}</h1><h2>{text("Carrier SIM document check", "运营商 SIM 证件检查")}</h2>
    <p>{text("For an application at a mainland China carrier outlet. Answers are used only for this check and are not saved. No document number or photo is needed.", "适用于在中国大陆运营商营业厅申请 SIM 卡。回答仅用于本次检查，不会保存。无需提供证件号码或照片。")}</p>
    <form onSubmit={check} className={styles.panel}>
      <label>{text("City", "城市")}<select value={city} onChange={e => { clear(); setCity(e.target.value); }}>{["shanghai","beijing","guangzhou","chongqing"].map((value,i) => <option key={value} value={value}>{locale === "zh" ? ["上海","北京","广州","重庆"][i] : ["Shanghai","Beijing","Guangzhou","Chongqing"][i]}</option>)}</select></label>
      {answer(text("Planning to apply at an outlet?", "打算到营业厅办理？"), applies, setApplies)}
      {answer(text("Document in the current guidance ready?", "当前指引所列证件已备妥？"), documentReady, setDocumentReady)}
      {answer(text("Current carrier, branch, handset and plan conditions checked?", "已核对运营商、营业厅、手机及套餐条件？"), conditionsChecked, setConditionsChecked)}
      <label>{text("When to check", "何时检查")}<select value={timing} onChange={e => { clear(); setTiming(e.target.value); }}><option value="now">{text("Now", "现在")}</option><option value="unknown">{text("Not decided", "尚未确定")}</option><option value="later">{text("Choose a time", "选择时间")}</option></select></label>
      {timing === "later" ? <label>{text("Your check time (device time zone; no reminder scheduled)", "你的检查时间（设备时区；不会安排提醒）")}<input type="datetime-local" required value={selectedTime} onChange={e => { clear(); setSelectedTime(e.target.value); }} /></label> : null}
      <button disabled={busy} type="submit">{busy ? text("Checking…", "检查中…") : text("Check with current evidence", "用当前依据检查")}</button>
    </form>
    <div aria-live="polite">{notice ? <p>{notice === "expired" ? text("This check expired. Refresh before using its conclusion.", "本次检查已过期，请刷新后再使用结论。") : text("Could not verify this check. Check your sign-in and reload the Trip before trying again.", "无法核实本次检查，请检查登录状态并重载行程后再试。")}</p> : null}
      {result ? <section className={styles.panel}>
        <h2>{text("Next step", "下一步")}</h2><p>{text(`Trip version ${result.tripVersion}`, `行程版本 ${result.tripVersion}`)}</p>
        <dl>{[[text("Knowledge", "知识依据"),result.knowledgeAvailability],[text("This preparation check", "本项准备检查"),result.userReadiness],[text("Action time", "行动时间"),result.actionTiming]].map(([title,value]) => <div key={title}><dt>{title}</dt><dd>{labels[value]}</dd></div>)}</dl>
        <p>{result.nextStep.text}</p>{result.nextStep.at ? <p>{new Date(result.nextStep.at).toLocaleString(locale)}</p> : null}
        {result.evidence.map(fact => <article key={fact.factId}><h3>{text("Reviewed basis and scope", "已审核依据与范围")}</h3><p>{fact.text}</p><ul>{[...fact.conditions,...fact.exclusions].map((line,i) => <li key={i}>{line}</li>)}</ul>{fact.sources.map(source => <p key={source.sourceRevisionId}><a href={source.uri} target="_blank" rel="noopener noreferrer">{source.publisher} · {source.locator}</a></p>)}</article>)}
      </section> : null}
    </div>
  </main>;
}
