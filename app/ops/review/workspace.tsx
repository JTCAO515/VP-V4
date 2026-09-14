"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { getLocaleAttributes, localeOptions, opsReviewCopy, opsSourceCopy, type Locale } from "@/lib/i18n";
import { createPasswordAuthClient } from "@/lib/server/identity/browser-auth-client";
import type { OpsInput, OpsWorkspace } from "@/lib/server/knowledge/review/local-workspace";
import { dispatchOpsOperation, type PendingOpsOperation } from "@/lib/server/knowledge/review/pending-operation";
import { SourceAssertionFields, sourceFields } from "./source-fields";
import { knowledgeEditorCopy } from "@/lib/i18n";
import { StatementFields, statementFields } from "./statement-fields";
import styles from "./workspace.module.css";

export function OpsReviewWorkspace() {
  const [locale, setLocale] = useState<Locale>("zh");
  const [withSource, setWithSource] = useState(false);
  const [withStatement, setWithStatement] = useState(false);
  const [workspace, setWorkspace] = useState<OpsWorkspace | null>(null);
  const [pending, setPending] = useState<PendingOpsOperation | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<"unavailable" | "success" | "unknown" | null>(null);
  const generation = useRef(0);
  const inFlight = useRef<symbol | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const c = opsReviewCopy[locale];
  const sourceCopy = opsSourceCopy[locale];
  const k = knowledgeEditorCopy[locale];
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setWorkspace(null);
    try {
      const response = await fetch("/api/ops/review", { cache: "no-store", signal: AbortSignal.timeout(10000) });
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
        ++generation.current; inFlight.current = null; setBusy(false); setWorkspace(null); setPending(null); form.current?.reset(); setMessage(null);
        // Keep Supabase auth callback synchronous; refresh on the next task.
        setTimeout(() => { void refresh(); }, 0);
      }
    });
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { ++generation.current; inFlight.current = null; subscription?.data.subscription.unsubscribe(); document.removeEventListener("visibilitychange", visible); };
  }, [refresh]);
  async function mutate(operation: PendingOpsOperation, target?: HTMLFormElement) {
    if (inFlight.current) return;
    const current = generation.current;
    const flight = Symbol("ops-operation");
    inFlight.current = flight; setBusy(true); setMessage(null); setPending(operation);
    const outcome = await dispatchOpsOperation(operation, {
      isCurrent: () => current === generation.current,
      async currentActor() {
        const response = await fetch("/api/ops/review", { cache: "no-store", signal: AbortSignal.timeout(10000) });
        if (response.status >= 500) throw new Error("OPS_UNAVAILABLE");
        if (!response.ok) return null;
        const result = await response.json();
        return typeof result.data?.actorId === "string" ? result.data.actorId : null;
      },
      async send(input) {
        return fetch("/api/ops/review", { method: "POST", headers: { "Content-Type": "application/json", "X-Ops-Expected-Actor": operation.actorId }, body: JSON.stringify(input), signal: AbortSignal.timeout(10000) });
      },
    });
    if (inFlight.current === flight) { inFlight.current = null; setBusy(false); }
    if (current !== generation.current) return;
    if (outcome === "confirmed") { setPending(null); target?.reset(); setMessage("success"); await refresh(); }
    else {
      setWorkspace(null);
      if (outcome !== "unknown") setPending(null);
      setMessage(outcome === "unknown" ? "unknown" : "unavailable");
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const target = event.currentTarget; const values = new FormData(target);
    if (!workspace) return;
    if (withStatement) {
      void mutate({actorId:workspace.actorId,input:{action:"submit_statement",operationId:crypto.randomUUID(),candidateId:crypto.randomUUID(),title:String(values.get("title")),statement:statementFields(values)}},target); return;
    }
    if (withSource) {
      void mutate({ actorId: workspace.actorId, input: { action: "submit_assertion", operationId: crypto.randomUUID(), candidateId: crypto.randomUUID(), title: String(values.get("title")), ...sourceFields(values) } }, target);
      return;
    }
    void mutate({ actorId: workspace.actorId, input: { action: "submit", operationId: crypto.randomUUID(), candidateId: crypto.randomUUID(), title: String(values.get("title")), content: String(values.get("content")) } }, target);
  }
  function review(event: FormEvent<HTMLFormElement>, candidateId: string) {
    event.preventDefault(); const target = event.currentTarget; const values = new FormData(target);
    const button = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (!button || (button.value !== "reviewed" && button.value !== "rejected")) return;
    if (!workspace) return;
    void mutate({ actorId: workspace.actorId, input: { action: "review", operationId: crypto.randomUUID(), candidateId, expectedVersion: 1, decision: button.value, note: String(values.get("note")) } }, target);
  }
  return <main className={styles.workspace}>
    <header className={styles.header}><div><p className={styles.eyebrow}>VisePanda · Ops</p><h1>{c.heading}</h1></div>
      <label>{c.language}<select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>{localeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    </header>
    <p className={styles.boundary}>{k.boundary}</p>
    <nav className={styles.actions}><Link href="/auth/sign-in?returnTo=/ops/review">{c.login}</Link><button type="button" disabled={busy || pending !== null} onClick={() => { setMessage(null); void refresh(); }}>{c.refresh}</button><Link href="/journey/knowledge">{k.preview}</Link><Link href="/ops/wiki">{locale === "zh" ? "Wiki 草稿" : "Wiki drafts"}</Link></nav>
    <p role="status" aria-live="polite">{busy ? c.busy : message ? c[message] : ""}</p>
    {pending && !busy && <button type="button" onClick={() => { void mutate(pending); }}>{c.retry}</button>}
    {workspace && !pending && <><form ref={form} className={styles.panel} onSubmit={submit}>
      <label>{c.title}<input name="title" required maxLength={160} disabled={busy} /></label>
      <label><input className={styles.modeCheckbox} type="checkbox" checked={withSource} onChange={(event) => {setWithSource(event.target.checked);setWithStatement(false);}} disabled={busy} />{sourceCopy.mode}</label>
      <label><input className={styles.modeCheckbox} type="checkbox" checked={withStatement} onChange={event=>{setWithStatement(event.target.checked);setWithSource(false);}} disabled={busy}/>{k.mode}</label>
      {withStatement ? <StatementFields locale={locale} disabled={busy}/> : withSource ? <SourceAssertionFields locale={locale} disabled={busy} /> : <label>{c.content}<textarea name="content" required maxLength={4000} rows={5} disabled={busy} /></label>}
      <button disabled={busy} type="submit">{c.submit}</button>
    </form>
    <section className={styles.list} aria-label={c.heading}>{workspace.candidates.length === 0 && <p>{c.empty}</p>}
      {workspace.candidates.map((candidate) => <article className={styles.panel} key={candidate.id}>
        <p className={styles.eyebrow}>{c[candidate.status]}</p><h2>{candidate.title}</h2><p className={styles.content}>{candidate.content}</p>
        <p className={styles.meta}>{c.author}: {candidate.authorId}</p>
        {candidate.reviewerId && <p className={styles.meta}>{c.reviewer}: {candidate.reviewerId}</p>}
        {candidate.statement && <details><summary>{k.mode}</summary>{(["zh","en"] as const).map(language=><section key={language} lang={language}><p>{candidate.statement!.expressions[language].text}</p><ul>{candidate.statement!.expressions[language].conditions.map((text,i)=><li key={i}>{text}</li>)}</ul><ul>{candidate.statement!.expressions[language].exclusions.map((text,i)=><li key={i}>{text}</li>)}</ul></section>)}<pre className={styles.meta}>{JSON.stringify({assertion:candidate.statement.assertion,scope:candidate.statement.scope},null,2)}</pre>{candidate.statement.sources.map(source=><section key={source.sourceKey+source.revisionLabel}><p>{source.publisher} · {source.sourceKey} · {source.revisionLabel}</p><p>{source.uri} · {source.locator}</p><p>{source.snippet}</p><p>{source.usageDeclaration}</p></section>)}</details>}
        {candidate.statement && candidate.status==="reviewed" && !candidate.publication && candidate.reviewerId===workspace.actorId && <form onSubmit={event=>{event.preventDefault();const target=event.currentTarget,v=new FormData(target);const expires=new Date(String(v.get('expires')));if(!Number.isFinite(expires.getTime()))return;void mutate({actorId:workspace.actorId,input:{action:'publish_statement',operationId:crypto.randomUUID(),candidateId:candidate.id,expectedVersion:2,expiresAt:expires.toISOString(),useBasis:String(v.get('basis')) as 'original_factual_summary'|'explicit_licence',useNote:String(v.get('useNote'))}},target);}}>
          <label>{k.expires}<input type="datetime-local" name="expires" required disabled={busy}/></label><label>{k.basis}<select name="basis" disabled={busy}><option value="original_factual_summary">{k.original}</option><option value="explicit_licence">{k.licence}</option></select></label><label>{k.note}<textarea name="useNote" required maxLength={1000} disabled={busy}/></label><button disabled={busy}>{k.publish}</button>
        </form>}
        {candidate.publication?.state==="published" && <form onSubmit={event=>{event.preventDefault();const target=event.currentTarget;void mutate({actorId:workspace.actorId,input:{action:'revoke_statement',operationId:crypto.randomUUID(),candidateId:candidate.id,expectedPublicationVersion:1,note:String(new FormData(target).get('revokeNote'))}},target);}}><label>{k.note}<textarea name="revokeNote" required maxLength={400} disabled={busy}/></label><button disabled={busy}>{k.revoke}</button></form>}
        {candidate.publication?.state==="revoked" && <p>{k.revoked}</p>}
        {candidate.structured && <details>
          <summary>{sourceCopy.details}</summary><p>{sourceCopy.unverified}</p>
          <p className={styles.meta}>{sourceCopy.sourceKey}: {candidate.structured.source.sourceKey} · {candidate.structured.source.revisionLabel}</p>
          <p className={styles.meta}>{sourceCopy.publisher}: {candidate.structured.source.publisher}</p>
          <p className={styles.meta}>{sourceCopy.uri}: {candidate.structured.source.uri}</p>
          <p className={styles.meta}>{sourceCopy.locator}: {candidate.structured.source.locator}</p>
          <p className={styles.content}>{candidate.structured.source.snippet}</p>
          <p className={styles.meta}>{sourceCopy.hash}: {candidate.structured.source.snippetHash}</p>
          <p className={styles.content}>{sourceCopy.usageDeclaration}: {candidate.structured.source.usageDeclaration}</p>
          <p className={styles.meta}>{sourceCopy.assertion}: {candidate.structured.assertion.assertionId} · {candidate.structured.assertion.revision}</p>
          <p className={styles.meta}>{sourceCopy.subjectId}: {candidate.structured.assertion.subjectId}</p>
          <p className={styles.content}>{[...candidate.structured.assertion.value.lines, ...(candidate.structured.assertion.value.locality ? [candidate.structured.assertion.value.locality] : []), candidate.structured.assertion.value.countryCode].join(" · ")}</p>
          <p className={styles.content} lang="zh-CN" dir="ltr">{sourceCopy.zh}: {candidate.structured.assertion.expressions.zh}</p>
          <p className={styles.content} lang="en" dir="ltr">{sourceCopy.en}: {candidate.structured.assertion.expressions.en}</p>
        </details>}
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
