"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { getLocaleAttributes, localeOptions, opsProvenanceCopy, type Locale } from "@/lib/i18n";
import type { ProvenanceRead } from "@/lib/server/knowledge/provenance/ontology";
import styles from "../review/workspace.module.css";

type Status = "empty" | "busy" | "notFound" | "invalid" | "unavailable";

export function OpsProvenanceWorkspace() {
  const [locale, setLocale] = useState<Locale>("zh");
  const [status, setStatus] = useState<Status>("empty");
  const [result, setResult] = useState<ProvenanceRead | null>(null);
  const generation = useRef(0);
  const c = opsProvenanceCopy[locale];

  function onLocaleChange(next: Locale) {
    setLocale(next);
    const attrs = getLocaleAttributes(next);
    document.documentElement.lang = attrs.lang;
    document.documentElement.dir = attrs.dir;
  }

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const factId = String(new FormData(event.currentTarget).get("factId") ?? "").trim();
    const current = ++generation.current;
    setResult(null);
    setStatus("busy");
    try {
      const response = await fetch(`/api/ops/provenance?factId=${encodeURIComponent(factId)}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (current !== generation.current) return;
      const body = await response.json();
      if (response.status === 404) { setStatus("notFound"); return; }
      if (response.status === 400) { setStatus("invalid"); return; }
      if (!response.ok) { setStatus("unavailable"); return; }
      setResult(body.data as ProvenanceRead);
      setStatus("empty");
    } catch {
      if (current === generation.current) setStatus("unavailable");
    }
  }

  return <main className={styles.workspace}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>VisePanda · Ops</p><h1>{c.heading}</h1></div>
      <label>{c.language}
        <select value={locale} onChange={(event) => onLocaleChange(event.target.value as Locale)}>
          {localeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    </header>
    <p className={styles.boundary}>{c.boundary}</p>
    <nav className={styles.actions}><Link href="/auth/sign-in?returnTo=/ops/provenance">{c.login}</Link><Link href="/ops/review">{c.review}</Link></nav>
    <form className={styles.panel} onSubmit={lookup}>
      <label>{c.factId}<input name="factId" required pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" disabled={status === "busy"} /></label>
      <button type="submit" disabled={status === "busy"}>{c.lookup}</button>
    </form>
    <p role="status" aria-live="polite">{status === "busy" ? c.busy : status === "notFound" ? c.notFound : status === "invalid" ? c.invalid : status === "unavailable" ? c.unavailable : !result ? c.empty : ""}</p>
    {result && <section className={styles.list} aria-label={c.heading}>
      <article className={styles.panel}>
        <p className={styles.eyebrow}>{result.state === "published" ? c.published : c.revoked} · {c.publicationVersion} {result.publicationVersion}</p>
        <p className={styles.meta}>{c.subjectId}: {result.assertion.subjectId} · {c.predicate}: {result.assertion.predicate} · {c.objectId}: {result.assertion.objectId}</p>
        <details open>
          <summary>{c.relation}</summary>
          {result.relation ? <p className={styles.content}>
            {locale === "zh" ? result.relation.zhLabel : result.relation.enLabel} — {c.domainType}: {result.relation.domainType} → {c.rangeType}: {result.relation.rangeType}
          </p> : <p className={styles.content}>{c.unregistered}</p>}
        </details>
        <details>
          <summary>{c.sources} ({result.sources.length})</summary>
          {result.sources.map((source) => <section key={source.sourceRevisionId} className={styles.meta}>
            <p>{c.sourceKey}: {source.sourceKey} · {c.revisionLabel}: {source.revisionLabel}</p>
            <p>{c.publisher}: {source.publisher} · {c.uri}: {source.uri} · {c.locator}: {source.locator}</p>
            <p>{c.snippetHash}: {source.snippetHash}</p>
            <p>{c.lineageStatus}: {source.lineageStatus === "tracked" ? c.tracked : c.legacy} · {c.fetchedAt}: {source.fetchedAt ? new Date(source.fetchedAt).toLocaleString(locale) : c.unknownTime} · {c.effectiveAt}: {source.effectiveAt ? new Date(source.effectiveAt).toLocaleString(locale) : c.unknownTime}</p>
          </section>)}
        </details>
        <details>
          <summary>{c.sourceHistory} ({result.sourceHistory.length})</summary>
          {result.sourceHistory.map((source) => <section key={source.sourceRevisionId} className={styles.meta}>
            <p>{c.sourceKey}: {source.sourceKey} · {c.revisionLabel}: {source.revisionLabel} · {c.lineageStatus}: {source.lineageStatus === "tracked" ? c.tracked : c.legacy}</p>
          </section>)}
        </details>
        <details>
          <summary>{c.auditTrail} ({result.auditTrail.length})</summary>
          <ol>{result.auditTrail.map((entry, i) => <li key={i} className={styles.meta}>
            v{entry.version} · {entry.action} · {entry.note} · <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString(locale)}</time>
          </li>)}</ol>
        </details>
      </article>
    </section>}
  </main>;
}
