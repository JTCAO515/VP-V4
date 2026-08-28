"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { VisePandaMark } from "@/components/brand/VisePandaMark";
import { chatThreadCopy, getLocaleAttributes, localeOptions, type Locale } from "@/lib/i18n";
import type { TurnFeedbackKind, TurnFeedbackReason } from "@/lib/server/turn/feedback/contract";
import styles from "./ChatThreadWorkspace.module.css";

type Thread = { id: string; status: "active" | "archived"; createdAt: string; updatedAt: string };
type Turn = { id: string; status: string; createdAt: string; updatedAt: string; events: readonly { eventId: string; sequence: number; type: string; state: string; createdAt: string }[]; feedback: readonly { id: string; kind: TurnFeedbackKind; reason: TurnFeedbackReason; createdAt: string }[]; memoryReceipts: readonly { memoryId: string; sourceReceiptId: string; constraintKind: "preference" | "hard_constraint" }[] };
type ThreadRead = { thread: Thread; turns: readonly Turn[] };
type LoadState = "loading" | "ready" | "unauthenticated" | "unavailable";

export function ChatThreadWorkspace({ initialThreadId, initialPlaceCandidate }: { initialThreadId?: string; initialPlaceCandidate?: Readonly<{ tripId: string; poiId: string }> }) {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("zh");
  const [threads, setThreads] = useState<readonly Thread[]>([]);
  const [selected, setSelected] = useState<ThreadRead | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [creating, setCreating] = useState(false);
  const [turnAction, setTurnAction] = useState<"starting" | "cancelling" | null>(null);
  const [feedbackTurnId, setFeedbackTurnId] = useState<string | null>(null);
  const [exactPoiId, setExactPoiId] = useState<string | null>(null);
  const pendingStarts = useRef(new Map<string, Readonly<{ turnId: string; idempotencyKey: string }>>());
  const copy = chatThreadCopy[locale];

  useEffect(() => {
    const attributes = getLocaleAttributes(locale);
    document.documentElement.lang = attributes.lang;
    document.documentElement.dir = attributes.dir;
  }, [locale]);

  async function readThread(threadId: string): Promise<ThreadRead | null> {
    const response = await fetch(`/api/chat/threads/${threadId}`, { cache: "no-store" });
    if (response.status === 401) { setState("unauthenticated"); return null; }
    if (!response.ok) { setState("unavailable"); return null; }
    return response.json() as Promise<ThreadRead>;
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
    if (!initialThreadId || state !== "ready") return;
    let active = true;
    void readThread(initialThreadId).then((result) => { if (active && result) setSelected(result); });
    return () => { active = false; };
  }, [initialThreadId, state]);

  useEffect(() => {
    setExactPoiId(null);
    if (!initialPlaceCandidate) return;
    let active = true;
    void fetch(`/api/trips/${initialPlaceCandidate.tripId}/places`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok || !active) return;
      const places = await response.json() as readonly { kind: string; canonicalPoiId?: string }[];
      if (!active) return;
      if (places.some((place) => place.kind === "canonical" && place.canonicalPoiId === initialPlaceCandidate.poiId)) setExactPoiId(initialPlaceCandidate.poiId);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [initialPlaceCandidate]);

  async function replaySelected() {
    if (!selected) return;
    const replayed = await Promise.all(selected.turns.map(async (turn) => {
      const afterSequence = turn.events.at(-1)?.sequence ?? 0;
      const response = await fetch(`/api/chat/turns/${turn.id}/events?afterSequence=${afterSequence}`, { cache: "no-store" });
      if (!response.ok) throw new Error("replay unavailable");
      const events = await response.json() as Turn["events"];
      return events.length === 0 ? turn : { ...turn, events: [...turn.events, ...events], status: events.at(-1)?.state ?? turn.status };
    }));
    setSelected((current) => current?.thread.id === selected.thread.id ? { ...current, turns: replayed } : current);
  }

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void replaySelected().catch(() => setState("unavailable"));
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [selected]);

  async function selectThread(thread: Thread) {
    const result = await readThread(thread.id);
    if (!result) return;
    setSelected(result);
    router.replace(`/visepanda/ask/${thread.id}`);
  }

  async function createThread() {
    setCreating(true);
    try {
      const response = await fetch("/api/chat/threads", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (response.status === 401) { setState("unauthenticated"); return; }
      if (!response.ok) { setState("unavailable"); return; }
      const thread = await response.json() as Thread;
      setThreads((current) => [thread, ...current]);
      setSelected({ thread, turns: [] });
      router.replace(`/visepanda/ask/${thread.id}`);
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
      if (refreshed) setSelected(refreshed);
    } catch { setState("unavailable"); } finally { setTurnAction(null); }
  }

  async function cancelTurn(turnId: string) {
    if (!selected) return;
    setTurnAction("cancelling");
    try {
      const response = await fetch(`/api/chat/turns/${turnId}/cancel`, { method: "POST" });
      if (!response.ok) { setState(response.status === 401 ? "unauthenticated" : "unavailable"); return; }
      const refreshed = await readThread(selected.thread.id);
      if (refreshed) setSelected(refreshed);
    } catch { setState("unavailable"); } finally { setTurnAction(null); }
  }

  async function recordFeedback(turnId: string, kind: TurnFeedbackKind, reason: TurnFeedbackReason) {
    if (!selected) return;
    setFeedbackTurnId(turnId);
    try {
      const response = await fetch(`/api/chat/turns/${turnId}/feedback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, reason }) });
      if (!response.ok) { setState(response.status === 401 ? "unauthenticated" : "unavailable"); return; }
      const refreshed = await readThread(selected.thread.id);
      if (refreshed) setSelected(refreshed);
    } catch { setState("unavailable"); } finally { setFeedbackTurnId(null); }
  }

  const statusName = (status: string) => status === "archived" ? copy.archived : status === "active" ? copy.active : status;
  return <main className={styles.shell}>
    <header className={styles.header}><Link href="/" aria-label="VisePanda home"><VisePandaMark /></Link><Link href="/visepanda">{copy.back}</Link><label>{copy.language}<select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>{localeOptions.map((option) => <option key={option.value} value={option.value}>{option.flag} {option.label}</option>)}</select></label></header>
    <section className={styles.content} aria-labelledby="chat-threads-title"><p>{copy.eyebrow}</p><h1 id="chat-threads-title">{copy.title}</h1><p className={styles.body}>{copy.body}</p>{exactPoiId ? <p className={styles.status}>Exact place scope: {exactPoiId}. This opaque ID does not submit a prompt or infer place facts.</p> : null}
      <div aria-live="polite" className={styles.status}>{state === "loading" ? copy.loading : state === "unavailable" ? copy.unavailable : null}</div>
      {state === "unauthenticated" ? <Link className={styles.primary} href="/auth/sign-in?returnTo=/visepanda/ask">{copy.signIn}</Link> : null}
      {state === "ready" ? <><button className={styles.primary} type="button" onClick={createThread} disabled={creating}>{copy.create}</button><div className={styles.grid}><section aria-label={copy.title}>{threads.length === 0 ? <p className={styles.empty}>{copy.empty}</p> : <ul>{threads.map((thread) => <li key={thread.id}><button type="button" onClick={() => void selectThread(thread)}>{statusName(thread.status)} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(thread.createdAt))}</button></li>)}</ul>}</section><section aria-label={copy.state}>{selected ? <><p className={styles.kicker}>{statusName(selected.thread.status)}</p><h2>{selected.turns.length === 0 ? copy.noTurns : `${selected.turns.length} ${copy.recorded}`}</h2>{selected.thread.status === "active" ? <button className={styles.secondary} type="button" onClick={() => void startTurn()} disabled={turnAction !== null}>{turnAction === "starting" ? copy.starting : copy.startTurn}</button> : null}<ul className={styles.turns}>{selected.turns.map((turn) => <li key={turn.id}><strong>{turn.status}</strong><span>{turn.events.map((event) => `${event.sequence}. ${event.state}`).join(" · ")}</span>{turn.memoryReceipts.length > 0 ? <details><summary>Memory provenance</summary><ul>{turn.memoryReceipts.map((receipt) => <li key={`${receipt.memoryId}-${receipt.sourceReceiptId}`}>{receipt.constraintKind === "hard_constraint" ? "Hard constraint" : "Preference"} · <Link href="/visepanda/copilot">Memory source {receipt.memoryId}</Link> · receipt {receipt.sourceReceiptId}</li>)}</ul></details> : null}{turn.status === "accepted" ? <button className={styles.secondary} type="button" onClick={() => void cancelTurn(turn.id)} disabled={turnAction !== null}>{turnAction === "cancelling" ? copy.cancelling : copy.cancelTurn}</button> : null}{["completed", "proposal_ready", "unavailable", "failed"].includes(turn.status) ? <fieldset><legend>{copy.feedback}</legend><button type="button" onClick={() => void recordFeedback(turn.id, "another_option", "different_preference")} disabled={feedbackTurnId === turn.id}>{copy.anotherOption}</button><button type="button" onClick={() => void recordFeedback(turn.id, "inaccurate", "not_relevant")} disabled={feedbackTurnId === turn.id}>{copy.inaccurate}</button><button type="button" onClick={() => void recordFeedback(turn.id, "reject_reason", "missing_evidence")} disabled={feedbackTurnId === turn.id}>{copy.rejectReason}</button><button type="button" onClick={() => void recordFeedback(turn.id, "correction", "incorrect_detail")} disabled={feedbackTurnId === turn.id}>{copy.correction}</button>{turn.feedback.length > 0 ? <small>{copy.feedbackSaved}</small> : null}</fieldset> : null}</li>)}</ul></> : <p className={styles.empty}>{copy.empty}</p>}</section></div></> : null}
    </section>
  </main>;
}
