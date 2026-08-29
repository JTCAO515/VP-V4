"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { VisePandaMark } from "@/components/brand/VisePandaMark";
import { chatThreadCopy, chatThreadWorkspaceCopy, getLocaleAttributes, localeOptions, type Locale } from "@/lib/i18n";
import type { TurnFeedbackKind, TurnFeedbackReason } from "@/lib/server/turn/feedback/contract";
import { replayTurnSse, turnEventsFromHistory } from "./turn-stream-client";
import { initialTurnStreamState, turnStreamReducer } from "./turn-stream-reducer";
import styles from "./ChatThreadWorkspace.module.css";

type Thread = { id: string; tripId: string | null; status: "active" | "archived"; createdAt: string; updatedAt: string };
type Turn = { id: string; status: string; createdAt: string; updatedAt: string; events: readonly { eventId: string; sequence: number; type: string; state: string; createdAt: string }[]; feedback: readonly { id: string; kind: TurnFeedbackKind; reason: TurnFeedbackReason; createdAt: string }[]; memoryReceipts: readonly { memoryId: string; sourceReceiptId: string; constraintKind: "preference" | "hard_constraint" }[] };
type ThreadRead = { thread: Thread; turns: readonly Turn[] };
type Trip = Readonly<{ id: string; title: string }>;
type LoadState = "loading" | "ready" | "unauthenticated" | "unavailable";

const asUuid = (value: string | null): string | undefined =>
  value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined;

export function ChatThreadWorkspace({ initialThreadId, initialPlaceCandidate }: { initialThreadId?: string; initialPlaceCandidate?: Readonly<{ tripId: string; poiId: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [locale, setLocale] = useState<Locale>("zh");
  const [threads, setThreads] = useState<readonly Thread[]>([]);
  const [trips, setTrips] = useState<readonly Trip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ThreadRead | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [creating, setCreating] = useState(false);
  const [turnAction, setTurnAction] = useState<"starting" | "cancelling" | null>(null);
  const [feedbackTurnId, setFeedbackTurnId] = useState<string | null>(null);
  const [exactPoiId, setExactPoiId] = useState<string | null>(null);
  const [turnStreams, dispatchTurnStreams] = useReducer(turnStreamReducer, initialTurnStreamState);
  const [pollCycle, setPollCycle] = useState(0);
  const pendingStarts = useRef(new Map<string, Readonly<{ turnId: string; idempotencyKey: string }>>());
  const copy = { ...chatThreadCopy[locale], ...chatThreadWorkspaceCopy[locale] };
  const queryThreadId = asUuid(searchParams.get("thread"));
  const queryTripId = asUuid(searchParams.get("tripId"));
  const queryPoiId = asUuid(searchParams.get("poiId"));
  const effectiveThreadId = initialThreadId ?? queryThreadId;
  const effectivePlaceCandidate = useMemo(
    () => initialPlaceCandidate ?? (queryTripId && queryPoiId ? { tripId: queryTripId, poiId: queryPoiId } : undefined),
    [initialPlaceCandidate, queryPoiId, queryTripId],
  );

  useEffect(() => {
    const attributes = getLocaleAttributes(locale);
    document.documentElement.lang = attributes.lang;
    document.documentElement.dir = attributes.dir;
    document.title = `${copy.title} | VisePanda`;
  }, [copy.title, locale]);

  async function readThread(threadId: string): Promise<ThreadRead | null> {
    const response = await fetch(`/api/chat/threads/${threadId}`, { cache: "no-store" });
    if (response.status === 401) { setState("unauthenticated"); return null; }
    if (!response.ok) { setState("unavailable"); return null; }
    return response.json() as Promise<ThreadRead>;
  }

  function selectThreadRead(next: ThreadRead) {
    dispatchTurnStreams({ type: "reset" });
    try {
      for (const turn of next.turns) {
        dispatchTurnStreams({ type: "events", turnId: turn.id, events: turnEventsFromHistory(turn.id, turn.events) });
      }
    } catch {
      setState("unavailable");
      return;
    }
    setSelected(next);
    setPollCycle((current) => current + 1);
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/chat/threads", { cache: "no-store" }).then(async (response) => {
      if (!active) return;
      if (response.status === 401) { setState("unauthenticated"); return; }
      if (!response.ok) { setState("unavailable"); return; }
      setThreads(await response.json() as Thread[]);
      setState("ready");
    }).catch(() => { if (active) setState("unavailable"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/trips", { cache: "no-store" })
      .then(async (response) => {
        if (!active || !response.ok) return;
        const data = (await response.json()) as Readonly<{ trips: readonly Trip[] }>;
        setTrips(data.trips);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!effectiveThreadId || state !== "ready") return;
    let active = true;
    void readThread(effectiveThreadId).then((result) => { if (active && result) selectThreadRead(result); });
    return () => { active = false; };
  }, [effectiveThreadId, state]);

  useEffect(() => {
    setExactPoiId(null);
    if (!effectivePlaceCandidate) return;
    setSelectedTripId(effectivePlaceCandidate.tripId);
    let active = true;
    void fetch(`/api/trips/${effectivePlaceCandidate.tripId}/places`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok || !active) return;
      const places = await response.json() as readonly { kind: string; canonicalPoiId?: string }[];
      if (!active) return;
      if (places.some((place) => place.kind === "canonical" && place.canonicalPoiId === effectivePlaceCandidate.poiId)) setExactPoiId(effectivePlaceCandidate.poiId);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [effectivePlaceCandidate]);

  async function replaySelected() {
    if (!selected) return;
    await Promise.all(selected.turns.map(async (turn) => {
      const afterSequence = turnStreams.byTurn[turn.id]?.cursor ?? 0;
      const replay = await replayTurnSse(turn.id, afterSequence);
      dispatchTurnStreams({ type: "events", turnId: turn.id, events: replay.events });
    }));
    setPollCycle((current) => current + 1);
  }

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void replaySelected().catch(() => setState("unavailable"));
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [selected]);

  useEffect(() => {
    if (!selected || !selected.turns.some((turn) => !turnStreams.byTurn[turn.id]?.terminal && !["completed", "proposal_ready", "unavailable", "failed", "cancelled"].includes(turn.status))) return;
    const timeout = window.setTimeout(() => { void replaySelected().catch(() => setState("unavailable")); }, 2_000);
    return () => window.clearTimeout(timeout);
  }, [pollCycle, selected, turnStreams]);

  async function selectThread(thread: Thread) {
    const result = await readThread(thread.id);
    if (!result) return;
    selectThreadRead(result);
    router.replace(`/visepanda?thread=${thread.id}`);
  }

  async function createThread() {
    setCreating(true);
    try {
      const response = await fetch("/api/chat/threads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(selectedTripId ? { tripId: selectedTripId } : {}) });
      if (response.status === 401) { setState("unauthenticated"); return; }
      if (!response.ok) { setState("unavailable"); return; }
      const thread = await response.json() as Thread;
      setThreads((current) => [thread, ...current]);
      selectThreadRead({ thread, turns: [] });
      router.replace(`/visepanda?thread=${thread.id}`);
    } catch { setState("unavailable"); } finally { setCreating(false); }
  }

  async function startTurn() {
    if (!selected) return;
    setTurnAction("starting");
    try {
      const pending = pendingStarts.current.get(selected.thread.id) ?? { turnId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() };
      pendingStarts.current.set(selected.thread.id, pending);
      const response = await fetch(`/api/chat/threads/${selected.thread.id}/turns`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...pending, digest: "chat-state-control-v1" }) });
      if (!response.ok) { setState(response.status === 401 ? "unauthenticated" : "unavailable"); return; }
      pendingStarts.current.delete(selected.thread.id);
      const refreshed = await readThread(selected.thread.id);
      if (refreshed) selectThreadRead(refreshed);
    } catch { setState("unavailable"); } finally { setTurnAction(null); }
  }

  async function cancelTurn(turnId: string) {
    if (!selected) return;
    setTurnAction("cancelling");
    try {
      const response = await fetch(`/api/chat/turns/${turnId}/cancel`, { method: "POST" });
      if (!response.ok) { setState(response.status === 401 ? "unauthenticated" : "unavailable"); return; }
      const refreshed = await readThread(selected.thread.id);
      if (refreshed) selectThreadRead(refreshed);
    } catch { setState("unavailable"); } finally { setTurnAction(null); }
  }

  async function recordFeedback(turnId: string, kind: TurnFeedbackKind, reason: TurnFeedbackReason) {
    if (!selected) return;
    setFeedbackTurnId(turnId);
    try {
      const response = await fetch(`/api/chat/turns/${turnId}/feedback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, reason }) });
      if (!response.ok) { setState(response.status === 401 ? "unauthenticated" : "unavailable"); return; }
      const refreshed = await readThread(selected.thread.id);
      if (refreshed) selectThreadRead(refreshed);
    } catch { setState("unavailable"); } finally { setFeedbackTurnId(null); }
  }

  const statusName = (status: string) => status === "archived" ? copy.archived : status === "active" ? copy.active : status;
  return <main className={styles.shell}>
    <header className={styles.header}><Link href="/" aria-label="VisePanda home"><VisePandaMark /></Link><Link href="/visepanda">{copy.back}</Link><label>{copy.language}<select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>{localeOptions.map((option) => <option key={option.value} value={option.value}>{option.flag} {option.label}</option>)}</select></label></header>
    <section className={styles.content} aria-labelledby="chat-threads-title"><p>{copy.eyebrow}</p><h1 id="chat-threads-title">{copy.title}</h1><p className={styles.body}>{copy.body}</p>{exactPoiId ? <p className={styles.status}>{copy.exactPlaceScope.replace("{poiId}", exactPoiId)}</p> : null}
      <div aria-live="polite" className={styles.status}>{state === "loading" ? copy.loading : state === "unavailable" ? copy.unavailable : null}</div>
      {state === "unauthenticated" ? <Link className={styles.primary} href="/auth/sign-in?returnTo=/visepanda">{copy.signIn}</Link> : null}
      {state === "ready" ? <>
        <label className={styles.tripScope}>{copy.tripScope}<select value={selectedTripId ?? ""} onChange={(event) => setSelectedTripId(event.target.value || null)}><option value="">{copy.noTripScope}</option>{trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.title}</option>)}</select></label>
        <button className={styles.primary} type="button" onClick={createThread} disabled={creating}>{copy.create}</button>
        <div className={styles.grid}>
          <section aria-label={copy.title}>{threads.length === 0 ? <p className={styles.empty}>{copy.empty}</p> : <ul>{threads.map((thread) => <li key={thread.id}><button type="button" onClick={() => void selectThread(thread)}>{statusName(thread.status)} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(thread.createdAt))}</button></li>)}</ul>}</section>
          <section aria-label={copy.state}>{selected ? <>
            <p className={styles.kicker}>{statusName(selected.thread.status)}</p>
            <h2>{selected.turns.length === 0 ? copy.noTurns : `${selected.turns.length} ${copy.recorded}`}</h2>
            <label className={styles.composer}>{copy.composerLabel}<textarea disabled placeholder={copy.composerUnavailable} aria-describedby="composer-unavailable" /><span id="composer-unavailable">{copy.composerUnavailable}</span></label>
            {selected.thread.status === "active" ? <button className={styles.secondary} type="button" onClick={() => void startTurn()} disabled={turnAction !== null}>{turnAction === "starting" ? copy.starting : copy.startTurn}</button> : null}
            <ul className={styles.turns}>{selected.turns.map((turn) => {
              const stream = turnStreams.byTurn[turn.id];
              const status = stream?.state ?? turn.status;
              const events = stream?.events ?? [];
              return <li key={turn.id}>
                <strong>{status}</strong><span>{events.map((event) => `${event.sequence}. ${event.state}`).join(" · ")}</span>
                {turn.memoryReceipts.length > 0 ? <details><summary>{copy.memoryProvenance}</summary><ul>{turn.memoryReceipts.map((receipt) => <li key={`${receipt.memoryId}-${receipt.sourceReceiptId}`}>{receipt.constraintKind === "hard_constraint" ? copy.hardConstraint : copy.preference} · <Link href="/visepanda/copilot">{copy.memorySource} {receipt.memoryId}</Link> · {copy.receipt} {receipt.sourceReceiptId}</li>)}</ul></details> : null}
                {status === "accepted" ? <button className={styles.secondary} type="button" onClick={() => void cancelTurn(turn.id)} disabled={turnAction !== null}>{turnAction === "cancelling" ? copy.cancelling : copy.cancelTurn}</button> : null}
                {["completed", "proposal_ready", "unavailable", "failed"].includes(status) ? <fieldset><legend>{copy.feedback}</legend><button type="button" onClick={() => void recordFeedback(turn.id, "another_option", "different_preference")} disabled={feedbackTurnId === turn.id}>{copy.anotherOption}</button><button type="button" onClick={() => void recordFeedback(turn.id, "inaccurate", "not_relevant")} disabled={feedbackTurnId === turn.id}>{copy.inaccurate}</button><button type="button" onClick={() => void recordFeedback(turn.id, "reject_reason", "missing_evidence")} disabled={feedbackTurnId === turn.id}>{copy.rejectReason}</button><button type="button" onClick={() => void recordFeedback(turn.id, "correction", "incorrect_detail")} disabled={feedbackTurnId === turn.id}>{copy.correction}</button>{turn.feedback.length > 0 ? <small>{copy.feedbackSaved}</small> : null}</fieldset> : null}
              </li>;
            })}</ul>
          </> : <p className={styles.empty}>{copy.empty}</p>}</section>
        </div>
      </> : null}
    </section>
  </main>;
}
