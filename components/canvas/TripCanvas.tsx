"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { VisePandaMark } from "@/components/brand/VisePandaMark";
import { getLocaleAttributes, localeOptions, tripCanvasCopy, tripProposalNoticeCopy, type Locale } from "@/lib/i18n";
import { TripPlaceView } from "./TripPlaceView";
import { TripActionsView } from "./TripActionsView";
import styles from "./TripCanvas.module.css";

type TripVersion = { id: string; resultingVersion: number; proposalId: string | null; eventType: "initial" | "proposal_applied"; title: string | null; createdAt: string; memoryReceipts: readonly { memoryId: string; sourceReceiptId: string; constraintKind: "preference" | "hard_constraint" }[] };
type TripRead = { trip: { id: string; title: string; headVersion: number; updatedAt: string }; versions: readonly TripVersion[] };
type PendingProposalRead = { trip: TripRead["trip"]; proposal: { id: string; revision: number; baseTripVersion: number; expiresAt: string; titleDiff: { before: string; after: string }; dayDiffs?: readonly { kind: "added" | "removed" | "changed"; dayId: string; date: string; items: readonly { kind: "added" | "removed" | "changed"; itemId: string; title: string }[] }[]; evidence: "not_recorded"; assumptions: "not_recorded" } };
type LoadState = "loading" | "unavailable" | "unauthenticated" | "ready";
type PendingRollback = { proposalId: string; baseTripVersion: number; targetVersion: number; idempotencyKey: string };
type Mutation = "preparing" | "confirming" | "rejecting" | "revising" | null;

export function TripCanvas({ tripId }: { tripId: string }) {
  const [locale, setLocale] = useState<Locale>("zh");
  const [data, setData] = useState<TripRead | null>(null);
  const [pendingProposal, setPendingProposal] = useState<PendingProposalRead | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [pendingRollback, setPendingRollback] = useState<PendingRollback | null>(null);
  const [mutation, setMutation] = useState<Mutation>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [manualPatch, setManualPatch] = useState('{\n  "expectedVersion": 0,\n  "operations": []\n}');
  const [notice, setNotice] = useState<string | null>(null);
  const confirmKeys = useRef(new Map<string, string>());
  const requestGeneration = useRef(0);
  const copy = tripCanvasCopy[locale];

  useEffect(() => {
    const attributes = getLocaleAttributes(locale);
    document.documentElement.lang = attributes.lang;
    document.documentElement.dir = attributes.dir;
  }, [locale]);

  async function reload(generation: number): Promise<TripRead | null> {
    const response = await fetch(`/api/trips/${tripId}`, { cache: "no-store" });
    if (generation !== requestGeneration.current) return null;
    if (response.status === 401) { setState("unauthenticated"); return null; }
    if (!response.ok) { setState("unavailable"); return null; }
    const current = await response.json() as TripRead;
    if (generation !== requestGeneration.current || current.trip.id !== tripId) return null;
    setData(current);
    setState("ready");
    return current;
  }

  async function readPendingProposal(generation: number): Promise<PendingProposalRead | null> {
    const response = await fetch(`/api/trips/${tripId}/proposal`, { cache: "no-store" });
    if (generation !== requestGeneration.current) return null;
    if (response.status === 401) { setState("unauthenticated"); return null; }
    if (response.status === 409) return null;
    if (!response.ok) throw new Error("proposal read unavailable");
    const pending = await response.json() as PendingProposalRead;
    return generation === requestGeneration.current ? pending : null;
  }

  async function reloadAll(generation = requestGeneration.current): Promise<TripRead | null> {
    const current = await reload(generation);
    if (!current) return null;
    try {
      const proposal = await readPendingProposal(generation);
      if (generation !== requestGeneration.current) return null;
      setPendingProposal(proposal);
      setDraftTitle(proposal?.proposal.titleDiff.after ?? "");
    } catch {
      if (generation !== requestGeneration.current) return null;
      setPendingProposal(null);
      setDraftTitle("");
      setNotice(tripProposalNoticeCopy[locale]);
    }
    return current;
  }

  useEffect(() => {
    requestGeneration.current += 1;
    setData(null);
    setPendingProposal(null);
    setPendingRollback(null);
    setNotice(null);
    setMutation(null);
    setState("loading");
    void reloadAll();
    return () => { requestGeneration.current += 1; };
  }, [tripId]);

  async function refreshAfterMutation(response: Response, generation: number): Promise<void> {
    if (generation !== requestGeneration.current) return;
    if (response.status === 401) { setState("unauthenticated"); return; }
    const current = await reloadAll(generation).catch(() => null);
    if (generation !== requestGeneration.current) return;
    setNotice(current && response.ok ? copy.proposalRefreshed : response.ok ? copy.unavailable : copy.proposalConflict);
  }

  async function prepareRollback(targetVersion: number) {
    const generation = requestGeneration.current;
    setMutation("preparing");
    try {
      const response = await fetch(`/api/trips/${tripId}/rollback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetVersion }) });
      if (generation !== requestGeneration.current) return;
      if (!response.ok) return setState(response.status === 401 ? "unauthenticated" : "unavailable");
      const pending = await response.json() as Omit<PendingRollback, "idempotencyKey">;
      if (generation !== requestGeneration.current) return;
      setPendingRollback({ ...pending, idempotencyKey: crypto.randomUUID() });
    } catch { if (generation === requestGeneration.current) setState("unavailable"); } finally { if (generation === requestGeneration.current) setMutation(null); }
  }

  async function confirmRollback() {
    if (!pendingRollback) return;
    const generation = requestGeneration.current;
    setMutation("confirming");
    try {
      const response = await fetch(`/api/trips/${tripId}/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ proposalId: pendingRollback.proposalId, idempotencyKey: pendingRollback.idempotencyKey, digest: `rollback-v${pendingRollback.targetVersion}-to-v${pendingRollback.baseTripVersion}` }) });
      if (generation !== requestGeneration.current) return;
      if (!response.ok && response.status === 401) return setState("unauthenticated");
      const refreshed = await reloadAll(generation);
      if (generation === requestGeneration.current && refreshed && refreshed.trip.headVersion > pendingRollback.baseTripVersion) setPendingRollback(null);
    } catch {
      const refreshed = await reloadAll(generation).catch(() => { if (generation === requestGeneration.current) setState("unavailable"); return null; });
      if (generation === requestGeneration.current && refreshed && refreshed.trip.headVersion > pendingRollback.baseTripVersion) setPendingRollback(null);
    } finally { if (generation === requestGeneration.current) setMutation(null); }
  }

  async function confirmPendingProposal() {
    if (!pendingProposal) return;
    const generation = requestGeneration.current;
    setMutation("confirming");
    try {
      const idempotencyKey = confirmKeys.current.get(pendingProposal.proposal.id) ?? crypto.randomUUID();
      confirmKeys.current.set(pendingProposal.proposal.id, idempotencyKey);
      const response = await fetch(`/api/trips/${tripId}/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ proposalId: pendingProposal.proposal.id, idempotencyKey, digest: `proposal-v${pendingProposal.proposal.revision}-base-v${pendingProposal.proposal.baseTripVersion}` }) });
      await refreshAfterMutation(response, generation);
    } catch { if (generation === requestGeneration.current) setNotice(copy.unavailable); } finally { if (generation === requestGeneration.current) setMutation(null); }
  }

  async function rejectPendingProposal() {
    if (!pendingProposal) return;
    const generation = requestGeneration.current;
    setMutation("rejecting");
    try {
      const response = await fetch(`/api/trips/${tripId}/proposal/reject`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ proposalId: pendingProposal.proposal.id }) });
      await refreshAfterMutation(response, generation);
    } catch { if (generation === requestGeneration.current) setNotice(copy.unavailable); } finally { if (generation === requestGeneration.current) setMutation(null); }
  }

  async function revisePendingProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingProposal || !draftTitle.trim()) return;
    const generation = requestGeneration.current;
    setMutation("revising");
    try {
      const response = await fetch(`/api/trips/${tripId}/proposal/revision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ proposalId: pendingProposal.proposal.id, title: draftTitle }) });
      await refreshAfterMutation(response, generation);
    } catch { if (generation === requestGeneration.current) setNotice(copy.unavailable); } finally { if (generation === requestGeneration.current) setMutation(null); }
  }

  async function createManualProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const generation = requestGeneration.current;
    let patch: unknown;
    try { patch = JSON.parse(manualPatch); } catch { setNotice(copy.proposalConflict); return; }
    setMutation("revising");
    try {
      const response = await fetch(`/api/trips/${tripId}/proposal`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ patch }) });
      await refreshAfterMutation(response, generation);
    } catch { if (generation === requestGeneration.current) setNotice(copy.unavailable); } finally { if (generation === requestGeneration.current) setMutation(null); }
  }

  if (state === "unauthenticated") return <Shell locale={locale} setLocale={setLocale} copy={copy}><section className={styles.status}><h1>{copy.title}</h1><p>{copy.signInBody}</p><Link className={styles.action} href={`/auth/sign-in?returnTo=/visepanda/trips/${tripId}`}>{copy.signIn}</Link></section></Shell>;
  if (state !== "ready" || !data || data.trip.id !== tripId) return <Shell locale={locale} setLocale={setLocale} copy={copy}><section className={styles.status}><h1>{copy.title}</h1><p>{state === "loading" ? copy.loading : copy.unavailable}</p></section></Shell>;

  return <Shell locale={locale} setLocale={setLocale} copy={copy}><main className={styles.main}>
    <p className={styles.eyebrow}>{copy.eyebrow}</p>
    <h1 className={styles.title}>{data.trip.title}</h1>
    <p className={styles.lede}>{copy.lede}</p>
    <section className={styles.overview} aria-label={copy.currentVersion}><div><span>{copy.currentVersion}</span><strong>v{data.trip.headVersion}</strong></div><time dateTime={data.trip.updatedAt}>{copy.updated} {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.trip.updatedAt))}</time></section>
    <p className={styles.notice}>{copy.rollbackNotice}</p>
    <div className={styles.live} aria-live="polite">{notice}</div>
    {pendingProposal ? <section className={styles.proposal} aria-labelledby="pending-proposal-title"><p className={styles.eyebrow}>{copy.pendingEyebrow}</p><h2 id="pending-proposal-title">{copy.pendingTitle} · v{pendingProposal.proposal.revision}</h2><p>{copy.pendingBody}</p><dl className={styles.diff}><div><dt>{copy.before}</dt><dd>{pendingProposal.proposal.titleDiff.before}</dd></div><div><dt>{copy.after}</dt><dd>{pendingProposal.proposal.titleDiff.after}</dd></div></dl>{pendingProposal.proposal.dayDiffs?.map((day) => <details key={day.dayId}><summary>{day.date}</summary><ul>{day.items.map((item) => <li key={item.itemId}>{item.title}</li>)}</ul></details>)}{pendingProposal.proposal.evidence === "not_recorded" ? <p className={styles.missing}>{copy.evidenceMissing}</p> : null}{pendingProposal.proposal.assumptions === "not_recorded" ? <p className={styles.missing}>{copy.assumptionsMissing}</p> : null}<p className={styles.meta}>{copy.proposalBase} v{pendingProposal.proposal.baseTripVersion} · {copy.expires} {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(pendingProposal.proposal.expiresAt))}</p><div className={styles.proposalActions}><button className={styles.primary} type="button" disabled={mutation !== null} onClick={() => void confirmPendingProposal()}>{mutation === "confirming" ? copy.confirming : copy.confirm}</button><button className={styles.secondary} type="button" disabled={mutation !== null} onClick={() => void rejectPendingProposal()}>{mutation === "rejecting" ? copy.rejecting : copy.reject}</button></div><form className={styles.revision} onSubmit={(event) => void revisePendingProposal(event)}><label htmlFor="proposal-title">{copy.reviseLabel}</label><input id="proposal-title" value={draftTitle} maxLength={160} required disabled={mutation !== null} onChange={(event) => setDraftTitle(event.target.value)} /><button className={styles.button} type="submit" disabled={mutation !== null || !draftTitle.trim()}>{mutation === "revising" ? copy.revising : copy.revise}</button></form></section> : <section className={styles.noProposal}><strong>{copy.noPendingTitle}</strong><p>{copy.noPendingBody}</p><form className={styles.revision} onSubmit={(event) => void createManualProposal(event)}><label htmlFor="manual-proposal-patch">{copy.reviseLabel}</label><textarea id="manual-proposal-patch" value={manualPatch} disabled={mutation !== null} onChange={(event) => setManualPatch(event.target.value)} /><button className={styles.button} type="submit" disabled={mutation !== null}>{copy.revise}</button></form></section>}
    {pendingRollback && <section className={styles.proposal} aria-live="polite"><strong>{copy.restoreReady} {pendingRollback.targetVersion}</strong><p>{copy.restoreBody}</p><div className={styles.proposalActions}><button className={styles.primary} disabled={mutation !== null} onClick={() => void confirmRollback()}>{mutation === "confirming" ? copy.confirming : copy.confirmRestore}</button><button className={styles.secondary} disabled={mutation !== null} onClick={() => setPendingRollback(null)}>{copy.keepCurrent}</button></div></section>}
    <section className={styles.history}><article className={styles.panel}><p className={styles.eyebrow}>{copy.historyEyebrow}</p><h2>{copy.confirmedChanges}</h2>{data.versions.length === 0 ? <p>{copy.noChanges}</p> : <ol className={styles.timeline}>{data.versions.map((version) => <li className={styles.event} key={version.id}><i className={styles.dot} aria-hidden="true"/><div><strong>{version.eventType === "initial" ? copy.initialVersion : `${copy.version} ${version.resultingVersion} ${copy.confirmed}`}</strong><span>{version.eventType === "initial" ? copy.initialBody : copy.confirmedBody}</span><span className={styles.meta}>{copy.recorded} {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(version.createdAt))}</span>{version.proposalId && <details><summary>{copy.inspectOrigin}</summary><span className={styles.meta}>{copy.proposalId} {version.proposalId}</span></details>}{version.memoryReceipts.length > 0 ? <details><summary>{copy.memoryProvenance}</summary><ul>{version.memoryReceipts.map((receipt) => <li key={`${receipt.memoryId}-${receipt.sourceReceiptId}`}>{receipt.constraintKind === "hard_constraint" ? copy.hardConstraint : copy.preference} · <Link href="/visepanda/copilot">{copy.memorySource} {receipt.memoryId}</Link> · {copy.receipt} {receipt.sourceReceiptId}</li>)}</ul></details> : null}{version.resultingVersion < data.trip.headVersion && version.title !== null && <button className={styles.button} disabled={mutation !== null || pendingRollback !== null} onClick={() => void prepareRollback(version.resultingVersion)}>{mutation === "preparing" ? copy.preparing : `${copy.restore} v${data.trip.headVersion + 1}`}</button>}</div></li>)}</ol>}</article><div><TripPlaceView tripId={tripId} locale={locale}/><TripActionsView tripId={tripId} locale={locale}/><aside className={styles.panel}><p className={styles.eyebrow}>{copy.integrityEyebrow}</p><h2>{copy.integrityTitle}</h2><p>{copy.integrityBody}</p></aside></div></section>
  </main></Shell>;
}

function Shell({ children, locale, setLocale, copy }: { children: ReactNode; locale: Locale; setLocale: (locale: Locale) => void; copy: (typeof tripCanvasCopy)[Locale] }) {
  return <div className={styles.shell}><header className={styles.header}><Link className={styles.brand} href="/visepanda" aria-label={copy.home}><VisePandaMark /></Link><Link className={styles.back} href="/visepanda">{copy.back}</Link><label className={styles.language}>{copy.language}<select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>{localeOptions.map((option) => <option key={option.value} value={option.value}>{option.flag} {option.label}</option>)}</select></label></header>{children}</div>;
}
