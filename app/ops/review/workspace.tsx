"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { getLocaleAttributes, localeOptions, opsReviewCopy, type Locale } from "@/lib/i18n";
import { createPasswordAuthClient } from "@/lib/server/identity/browser-auth-client";
import type { OpsInput, OpsWorkspace } from "@/lib/server/knowledge/review/local-workspace";
import styles from "./workspace.module.css";

export function OpsReviewWorkspace() {
  const [locale, setLocale] = useState<Locale>("zh");
  const [workspace, setWorkspace] = useState<OpsWorkspace | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<"unavailable" | "success" | null>(null);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const c = opsReviewCopy[locale];
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setWorkspace(null);
    try {
      const response = await fetch("/api/ops/review", { cache: "no-store" });
      const result = await response.json();
      if (current !== generation.current) return;
      if (!response.ok) { setMessage("unavailable"); return; }
      setWorkspace(result.data as OpsWorkspace);
      setMessage((previous) => previous === "unavailable" ? null : previous);
    } catch { if (current === generation.current) setMessage("unavailable"); }
  }, []);
  useEffect(() => {
    const attrs = getLocaleAttributes(locale);
    document.documentElement.lang = attrs.lang;
    document.documentElement.dir = attrs.dir;
  }, [locale]);
  useEffect(() => {
    void refresh();
    const client = createPasswordAuthClient();
    const subscription = client?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "SIGNED_IN" || event === "USER_UPDATED") {
        ++generation.current; setWorkspace(null); form.current?.reset(); setMessage(null);
        // Keep Supabase auth callback synchronous; refresh on the next task.
        setTimeout(() => { void refresh(); }, 0);
      }
    });
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { ++generation.current; subscription?.data.subscription.unsubscribe(); document.removeEventListener("visibilitychange", visible); };
  }, [refresh]);
  async function mutate(input: OpsInput, target: HTMLFormElement) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/ops/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      if (!response.ok) { setWorkspace(null); setMessage("unavailable"); return; }
      target.reset(); setMessage("success"); await refresh();
    } catch { setWorkspace(null); setMessage("unavailable"); }
    finally { inFlight.current = false; setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const target = event.currentTarget; const values = new FormData(target);
    void mutate({ action: "submit", operationId: crypto.randomUUID(), candidateId: crypto.randomUUID(), title: String(values.get("title")), content: String(values.get("content")) }, target);
  }
  function review(event: FormEvent<HTMLFormElement>, candidateId: string) {
    event.preventDefault(); const target = event.currentTarget; const values = new FormData(target);
    const button = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (!button || (button.value !== "reviewed" && button.value !== "rejected")) return;
    void mutate({ action: "review", operationId: crypto.randomUUID(), candidateId, expectedVersion: 1, decision: button.value, note: String(values.get("note")) }, target);
  }
  return <main className={styles.workspace}>
    <header className={styles.header}><div><p className={styles.eyebrow}>VisePanda · Ops</p><h1>{c.heading}</h1></div>
      <label>{c.language}<select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>{localeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    </header>
    <p className={styles.boundary}>{c.boundary}</p>
    <nav className={styles.actions}><Link href="/auth/sign-in?returnTo=/ops/review">{c.login}</Link><button type="button" disabled={busy} onClick={() => { setMessage(null); void refresh(); }}>{c.refresh}</button></nav>
    <p role="status" aria-live="polite">{busy ? c.busy : message ? c[message] : ""}</p>
    {workspace && <><form ref={form} className={styles.panel} onSubmit={submit}>
      <label>{c.title}<input name="title" required maxLength={160} disabled={busy} /></label>
      <label>{c.content}<textarea name="content" required maxLength={4000} rows={5} disabled={busy} /></label>
      <button disabled={busy} type="submit">{c.submit}</button>
    </form>
    <section className={styles.list} aria-label={c.heading}>{workspace.candidates.length === 0 && <p>{c.empty}</p>}
      {workspace.candidates.map((candidate) => <article className={styles.panel} key={candidate.id}>
        <p className={styles.eyebrow}>{c[candidate.status]}</p><h2>{candidate.title}</h2><p className={styles.content}>{candidate.content}</p>
        <p className={styles.meta}>{c.author}: {candidate.authorId}</p>
        {candidate.reviewerId && <p className={styles.meta}>{c.reviewer}: {candidate.reviewerId}</p>}
        {candidate.reviewNote && <p className={styles.content}>{candidate.reviewNote}</p>}
        {candidate.status === "pending" && (candidate.authorId === workspace.actorId ? <p>{c.self}</p> : <form onSubmit={(event) => review(event, candidate.id)}>
          <label>{c.note}<textarea name="note" required maxLength={400} rows={2} disabled={busy} /></label>
          <div className={styles.actions}><button name="decision" value="reviewed" disabled={busy}>{c.reviewed}</button><button name="decision" value="rejected" disabled={busy}>{c.rejected}</button></div>
        </form>)}
        <details><summary>{c.audit}</summary><ol>{candidate.audit.map((entry) => <li className={styles.meta} key={entry.id}>{c[entry.action]} · {entry.actorId} · <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString(locale)}</time></li>)}</ol></details>
      </article>)}
    </section></>}
  </main>;
}
