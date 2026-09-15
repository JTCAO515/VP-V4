"use client";

import { useEffect, useRef, useState } from "react";
import { createPasswordAuthClient } from "@/lib/server/identity/browser-auth-client";
import { savedAnswerCopy, savedAnswerNotice } from "@/lib/grounded/copy";
import type { SavedHistory } from "@/lib/grounded/read-model";
import styles from "./SavedAnswers.module.css";

/** VPJ-76 (#360) slice 8: only offered where the reviewed answer itself found nothing. */
const AI_ASSIST_NOTICES = new Set(["blocked", "placeBlocked", "connectivityBlocked", "paymentBlocked"]);
type AiAssistOutcome =
  | { kind: "answered"; coverage: "answered" | "partial"; summary: string; gaps: readonly string[]; conflicts: readonly string[] }
  | { kind: "unavailable"; reason: string }
  | { kind: "budget_exhausted" }
  | { kind: "cancelled" };
type AiAssistJobStatus =
  | { status: "not_offered"; reason: string }
  | { status: "pending" }
  | { status: "succeeded"; outcome: AiAssistOutcome }
  | { status: "failed"; errorCode: string | null }
  | { status: "cancelled" };
const REASON_COPY_KEY: Record<string, "aiAssistMissingContent" | "aiAssistRetrievalMiss" | "aiAssistUserInputMissing" | "aiAssistCapabilityUnsupported" | "aiAssistPolicyDenied" | "aiAssistProviderFailure"> = {
  missing_content: "aiAssistMissingContent", retrieval_miss: "aiAssistRetrievalMiss", user_input_missing: "aiAssistUserInputMissing",
  capability_unsupported: "aiAssistCapabilityUnsupported", policy_denied: "aiAssistPolicyDenied", provider_failure: "aiAssistProviderFailure",
};

function AiAssistPanel({ turnId, locale }: { turnId: string; locale: "zh" | "en" }) {
  const language = savedAnswerCopy[locale];
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<AiAssistJobStatus | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  async function run() {
    setState("loading"); setResult(null);
    for (let poll = 0; poll < 20; poll += 1) {
      if (!alive.current) return;
      let body: { data?: AiAssistJobStatus; error?: string } | null = null;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20_000);
        const response = await fetch("/api/chat/grounded/ai-assist", {
          method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turnId }),
        });
        clearTimeout(timeout);
        if (!response.ok && response.status !== 401 && response.status !== 503) throw new Error("request failed");
        body = await response.json();
      } catch { /* transient network error: keep polling within the loop budget */ }
      if (!alive.current) return;
      if (!body || body.error || !body.data) { setState("error"); return; }
      if (body.data.status === "pending") { await new Promise(resolve => setTimeout(resolve, 1500)); continue; }
      setResult(body.data); setState("done"); return;
    }
    if (alive.current) setState("error");
  }
  if (state === "idle") return <button type="button" onClick={() => void run()}>{language.aiAssistPrompt}</button>;
  if (state === "loading") return <p role="status">{language.aiAssistLoading}</p>;
  if (state === "error" || !result) return <p>{language.aiAssistUnavailable} <button type="button" onClick={() => void run()}>{language.aiAssistRetry}</button></p>;
  if (result.status === "not_offered") return <p>{language.aiAssistNotOffered}</p>;
  if (result.status === "cancelled") return <p>{language.aiAssistCancelled}</p>;
  if (result.status === "failed") return <p>{language.aiAssistUnavailable} <button type="button" onClick={() => void run()}>{language.aiAssistRetry}</button></p>;
  if (result.status !== "succeeded") return null;
  const outcome = result.outcome;
  if (outcome.kind === "budget_exhausted") return <p>{language.aiAssistBudgetExhausted}</p>;
  if (outcome.kind === "cancelled") return <p>{language.aiAssistCancelled}</p>;
  if (outcome.kind === "unavailable") return <p>{language[REASON_COPY_KEY[outcome.reason] ?? "aiAssistUnavailable"]}</p>;
  return <div className={styles.aiAssist}>
    <p>{outcome.summary}</p>
    {outcome.gaps.length ? <><strong>{language.aiAssistGaps}</strong><ul>{outcome.gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul></> : null}
    {outcome.conflicts.length ? <><strong>{language.aiAssistConflicts}</strong><ul>{outcome.conflicts.map((conflict, index) => <li key={index}>{conflict}</li>)}</ul></> : null}
    <small>{language.aiAssistDisclaimer}</small>
  </div>;
}

export function SavedAnswers({ locale }: { locale: "zh" | "en" }) {
  const copy = savedAnswerCopy[locale];
  const [history, setHistory] = useState<SavedHistory | null>(null);
  const [state, setState] = useState<"checking" | "ready" | "unavailable">("checking");
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    const auth = createPasswordAuthClient();
    let alive = true, generation = 0, owner: string | null = null;
    let controller: AbortController | undefined, expiry: ReturnType<typeof setTimeout> | undefined;
    let earlyRefresh: ReturnType<typeof setTimeout> | undefined, validUntil = 0;
    function invalidate(clear = false) {
      generation++; controller?.abort(); clearTimeout(expiry); clearTimeout(earlyRefresh); validUntil = 0;
      if (alive) { setState("checking"); if (clear) setHistory(null); }
    }
    async function load(keepCurrent = false) {
      // A refresh may retain only the current owner's still-valid answer. Keep
      // its hard expiry armed until a complete authorized replacement arrives.
      const retained = keepCurrent && performance.now() < validUntil;
      if (retained) { generation++; controller?.abort(); clearTimeout(earlyRefresh); }
      else invalidate();
      if (!alive || document.visibilityState !== "visible" || !navigator.onLine || !auth) { invalidate(); return; }
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
        const deadline = started + Math.min(30_000, data?.lifetimeMs ?? 0);
        const remaining = deadline - performance.now();
        if (!data || data.ownerId !== subject || !Array.isArray(data.turns) || data.turns.length > 20 || !Number.isFinite(remaining) || remaining <= 0) throw new Error("Invalid read");
        if (!alive || revision !== generation || signal.aborted || document.visibilityState !== "visible") return;
        clearTimeout(expiry); clearTimeout(earlyRefresh);
        validUntil = deadline;
        setHistory(data); setState("ready");
        expiry = setTimeout(() => { invalidate(); void load(); }, Math.max(0, deadline - performance.now()));
        // Short-lived reads get one refresh at their deadline, avoiding a tight
        // request loop. Longer reads refresh five seconds before that deadline.
        if (remaining > 5_000) earlyRefresh = setTimeout(() => void load(true), Math.max(1_000, remaining - 5_000));
      } catch {
        if (alive && revision === generation) { invalidate(true); setState("unavailable"); }
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
          const notice = savedAnswerNotice(turn);
          return <article key={turn.id} lang={turn.locale} dir="ltr" data-turn-id={turn.id} data-task-id={turn.taskId}>
            <small>{language.cities[turn.city as keyof typeof language.cities]} · {turn.locale === "zh" ? "中文" : "English"} · {turn.parentId ? language.parent : language.original}</small>
            <h3>{turn.input}</h3>
            {notice ? <p>{language[notice]}</p> : null}
            {notice && AI_ASSIST_NOTICES.has(notice) ? <AiAssistPanel turnId={turn.id} locale={turn.locale} /> : null}
            {turn.unansweredNeeds?.length ? <div>
              <strong>{language.unanswered}</strong><p>{language.outsideScope}</p>
              <ul>{turn.unansweredNeeds.map(need => <li key={need}><q>{need}</q></li>)}</ul>
            </div> : null}
            {turn.facts.map(fact => <div key={fact.id} className={styles.fact}>
              <p>{fact.text}</p>
              {fact.placeDetails?.map((detail, index) => <p key={index}>{detail}</p>)}
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
