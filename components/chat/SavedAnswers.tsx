"use client";

import { useEffect, useRef, useState } from "react";
import { createPasswordAuthClient } from "@/lib/server/identity/browser-auth-client";
import { savedAnswerCopy } from "@/lib/grounded/copy";
import type { SavedHistory } from "@/lib/grounded/read-model";
import styles from "./SavedAnswers.module.css";

export function SavedAnswers({ locale }: { locale: "zh" | "en" }) {
  const copy = savedAnswerCopy[locale];
  const [history, setHistory] = useState<SavedHistory | null>(null);
  const [state, setState] = useState<"checking" | "ready" | "unavailable">("checking");
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    const auth = createPasswordAuthClient();
    let alive = true, generation = 0, owner: string | null = null;
    let controller: AbortController | undefined, expiry: ReturnType<typeof setTimeout> | undefined;
    function invalidate(clear = false) {
      generation++; controller?.abort(); clearTimeout(expiry);
      if (alive) { setState("checking"); if (clear) setHistory(null); }
    }
    async function load() {
      invalidate();
      if (!alive || document.visibilityState !== "visible" || !navigator.onLine || !auth) return;
      const revision = generation, started = performance.now();
      const requestController = new AbortController(); controller = requestController;
      const signal = requestController.signal, timeout = setTimeout(() => requestController.abort(), 10_000);
      try {
        const session = await auth.auth.getSession();
        const subject = session.data.session?.user.id;
        if (!subject || revision !== generation) throw new Error("Session unavailable");
        if (owner !== subject) { owner = subject; setHistory(null); }
        const response = await fetch("/api/chat/grounded", { cache: "no-store", credentials: "same-origin", signal });
        if (!response.ok) throw new Error("Read unavailable");
        const body: { data?: SavedHistory } = await response.json();
        const data = body.data;
        const remaining = Math.min(30_000, data?.lifetimeMs ?? 0) - (performance.now() - started);
        if (!data || data.ownerId !== subject || !Array.isArray(data.turns) || data.turns.length > 20 || !Number.isFinite(remaining) || remaining <= 0) throw new Error("Invalid read");
        if (!alive || revision !== generation || signal.aborted || document.visibilityState !== "visible") return;
        setHistory(data); setState("ready");
        expiry = setTimeout(() => { invalidate(); void load(); }, remaining);
      } catch {
        if (alive && revision === generation) { setHistory(null); setState("unavailable"); }
      } finally { clearTimeout(timeout); }
    }
    const visibility = () => { invalidate(); if (document.visibilityState === "visible") void load(); };
    const hide = () => invalidate(true);
    const offline = () => { invalidate(true); setState("unavailable"); };
    const online = () => void load();
    const subscription = auth?.auth.onAuthStateChange((_event, session) => {
      // Synchronous invalidation; never wait for SDK work while its auth lock is held.
      invalidate(true); owner = session?.user.id ?? null;
      queueMicrotask(() => { if (alive) { if (owner) void load(); else setState("unavailable"); } });
    });
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", hide); window.addEventListener("pageshow", visibility);
    window.addEventListener("offline", offline); window.addEventListener("online", online);
    refresh.current = () => void load();
    if (!auth) setState("unavailable");
    return () => {
      alive = false; invalidate(); subscription?.data.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", hide); window.removeEventListener("pageshow", visibility);
      window.removeEventListener("offline", offline); window.removeEventListener("online", online);
      refresh.current = () => {};
    };
  }, []);
  return <section className={styles.panel} aria-label={copy.title}>
    <h2>{copy.title}</h2><p>{copy.description}</p>
    <button type="button" onClick={() => refresh.current()}>{copy.refresh}</button>
    <div className={styles.body}>
      {state !== "ready" ? <p className={styles.notice} role="status">{state === "checking" ? copy.checking : copy.unavailable}</p> : null}
      <div className={state === "ready" ? undefined : styles.hidden} aria-hidden={state !== "ready"} inert={state !== "ready"}>
        {history?.turns.length === 0 ? <p>{copy.empty}</p> : null}
        {history?.turns.map(turn => {
          const language = savedAnswerCopy[turn.locale];
          return <article key={turn.id} lang={turn.locale} dir="ltr" data-turn-id={turn.id} data-task-id={turn.taskId}>
            <small>{language.cities[turn.city as keyof typeof language.cities]} · {turn.locale === "zh" ? "中文" : "English"} · {turn.parentId ? language.parent : language.original}</small>
            <h3>{turn.input}</h3>
            {turn.projection === "pending" ? <p>{language.pending}</p> : turn.projection === "unavailable" ? <p>{language.blocked}</p>
              : turn.outcome === "clarification" ? <p>{language.clarification}</p> : turn.outcome === "technical_failure" ? <p>{language.failed}</p>
              : turn.outcome === "blocked" || !turn.facts.length ? <p>{language.blocked}</p> : turn.outcome === "partial" || turn.coverage === "partial" ? <p>{language.partial}</p> : null}
            {turn.facts.map(fact => <div key={fact.id} className={styles.fact}>
              <p>{fact.text}</p>
              {fact.conditions.length ? <><strong>{language.conditions}</strong><ul>{fact.conditions.map((text, index) => <li key={index}>{text}</li>)}</ul></> : null}
              {fact.exclusions.length ? <><strong>{language.exclusions}</strong><ul>{fact.exclusions.map((text, index) => <li key={index}>{text}</li>)}</ul></> : null}
              <details><summary>{language.sources}</summary>
                <ul>{fact.sources.map(source => <li key={source.id}>{source.href ? <a href={source.href} target="_blank" rel="noopener noreferrer">{source.publisher}</a> : source.publisher} · {source.locator}</li>)}</ul>
              </details>
            </div>)}
          </article>;
        })}
      </div>
    </div>
  </section>;
}
