"use client";

import { useEffect, useRef, useState } from "react";
import { createPasswordAuthClient } from "@/lib/server/identity/browser-auth-client";
import { parseResultArtifactRead, type ResultArtifactRead } from "@/lib/server/artifacts/result-contract";
import type { Locale } from "@/lib/i18n";
import styles from "./TripComparisonResult.module.css";
import { comparisonBasisFacts } from "./comparison-basis";

type Read = { tripId: string; tripVersion: number; result: ResultArtifactRead };
type State = "loading" | "ready" | "empty" | "unavailable" | "unauthenticated" | "expired";

export function TripComparisonResult({ tripId, tripVersion, locale }: { tripId: string; tripVersion: number; locale: Locale }) {
  const [read, setRead] = useState<Read | null>(null);
  const [state, setState] = useState<State>("loading");
  const [refresh, setRefresh] = useState(0);
  const [visible, setVisible] = useState(true);
  const generation = useRef(0);
  const zh = locale === "zh";
  useEffect(() => {
    const visibility = () => { generation.current += 1; setVisible(document.visibilityState === "visible"); setRead(null); setRefresh(value => value + 1); };
    const resume = () => { generation.current += 1; setRead(null); setRefresh(value => value + 1); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pageshow", resume); window.addEventListener("online", resume);
    const auth = createPasswordAuthClient()?.auth.onAuthStateChange(resume);
    setVisible(document.visibilityState === "visible");
    return () => { auth?.data.subscription.unsubscribe(); document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pageshow", resume); window.removeEventListener("online", resume); };
  }, []);
  useEffect(() => {
    const own = ++generation.current, controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setRead(null); setState("loading");
    if (!visible) return () => { generation.current += 1; controller.abort(); };
    const deadline = performance.now() + 30_000;
    void (async () => {
      try {
        const response = await fetch(`/api/trips/${tripId}/comparison-result`, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        if (own !== generation.current || controller.signal.aborted) return;
        if (!response.ok) { setState(response.status === 401 ? "unauthenticated" : "unavailable"); return; }
        const envelope: unknown = await response.json();
        if (own !== generation.current || controller.signal.aborted) return;
        if (!envelope || typeof envelope !== "object" || !("version" in envelope) || envelope.version !== 1 || !("data" in envelope)) throw new Error("Invalid result");
        const data = envelope.data;
        if (data && typeof data === "object" && "kind" in data && (data.kind === "empty" || data.kind === "unavailable")) { setState(data.kind); return; }
        const result = parseResultArtifactRead(data);
        if (!result || !result.current || result.source.tripId !== tripId || result.source.tripVersion !== tripVersion) throw new Error("Stale result");
        const remaining = deadline - performance.now();
        if (remaining <= 0) { setState("expired"); return; }
        setRead({ tripId, tripVersion, result }); setState("ready");
        timer = setTimeout(() => { if (own === generation.current) { setRead(null); setState("expired"); } }, remaining);
      } catch { if (own === generation.current && !controller.signal.aborted) setState("unavailable"); }
    })();
    return () => { generation.current += 1; controller.abort(); if (timer) clearTimeout(timer); };
  }, [tripId, tripVersion, refresh, visible]);
  const result = visible && state === "ready" && read?.tripId === tripId && read.tripVersion === tripVersion ? read.result : null;
  const basis = result ? comparisonBasisFacts(result, zh) : null;
  const notice = state === "empty" ? (zh ? "此行程暂无当前有效的比较成果。" : "No current comparison is saved for this Trip.")
    : state === "unauthenticated" ? (zh ? "请重新登录后读取成果。" : "Sign in again to read this comparison.")
    : state === "unavailable" ? (zh ? "成果暂不可安全读取，请刷新重试。" : "This comparison cannot be read safely. Refresh to retry.")
    : state === "expired" ? (zh ? "请刷新以核对成果是否仍有效。" : "Refresh to check whether this comparison is still current.")
    : (zh ? "正在核对行程成果……" : "Checking this Trip’s comparison…");
  return <section className={styles.card} aria-labelledby="trip-comparison-title" data-testid="trip-comparison">
    <div className={styles.header}><h2 id="trip-comparison-title">{zh ? "方向比较" : "Direction comparison"}</h2>
      <button type="button" onClick={() => { generation.current += 1; setRead(null); setRefresh(value => value + 1); }}>{zh ? "刷新成果" : "Refresh comparison"}</button></div>
    <p className={styles.note}>{zh ? "已保存成果 · 只读" : "Saved comparison · Read only"}</p>
    {result ? <><h3>{result.content.title}</h3><p>{result.content.summary}</p><ul>{result.content.options.map(option =>
      <li key={option.id}><h4>{option.title}</h4><p>{option.tradeoff}</p></li>)}</ul>
      {basis ? <details className={styles.basis} key={`${result.artifactId}:${result.revision}`} data-testid="comparison-basis">
        <summary>{basis.heading}</summary>
        <p>{basis.trip}</p><p>{basis.request}</p><p>{basis.memory}</p>
        <p>{basis.evidence}</p><p>{basis.explanation}</p><p className={styles.note}>{basis.currentness}</p>
        <details className={styles.records}><summary>{basis.records}</summary>
          <p className={styles.identity} data-testid="comparison-identity">{result.artifactId} · r{result.revision}</p>
          <p>{zh ? "目标记录版本" : "Goal record version"}：v{result.source.goalVersion}</p>
          <p className={styles.identity}>{zh ? "任务完成记录" : "Task completion record"}：{result.source.taskTurnId}</p>
          <p className={styles.identity}>{zh ? "成果版本记录时间" : "Result revision recorded at"}：{result.createdAt}</p>
        </details>
      </details> : null}</>
      : <p role="status" aria-live="polite">{notice}</p>}
  </section>;
}
