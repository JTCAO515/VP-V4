"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { VisePandaMark } from "@/components/brand/VisePandaMark";
import { TripPlaceView } from "./TripPlaceView";
import { TripActionsView } from "./TripActionsView";
import styles from "./TripCanvas.module.css";

type TripVersion = { id: string; resultingVersion: number; proposalId: string | null; eventType: "initial" | "proposal_applied"; title: string | null; createdAt: string };
type TripRead = { trip: { id: string; title: string; headVersion: number; updatedAt: string }; versions: readonly TripVersion[] };
type LoadState = "loading" | "unavailable" | "unauthenticated" | "ready";
type PendingRollback = { proposalId: string; baseTripVersion: number; targetVersion: number; idempotencyKey: string };

export function TripCanvas({ tripId }: { tripId: string }) {
  const [data, setData] = useState<TripRead | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [pendingRollback, setPendingRollback] = useState<PendingRollback | null>(null);
  const [action, setAction] = useState<"preparing" | "confirming" | null>(null);

  async function reload(): Promise<TripRead | null> {
    const response = await fetch(`/api/trips/${tripId}`, { cache: "no-store" });
    if (response.status === 401) { setState("unauthenticated"); return null; }
    if (!response.ok) { setState("unavailable"); return null; }
    const current = await response.json() as TripRead;
    setData(current);
    setState("ready");
    return current;
  }

  useEffect(() => { void reload().catch(() => setState("unavailable")); }, [tripId]);

  async function prepareRollback(targetVersion: number) {
    setAction("preparing");
    try {
      const response = await fetch(`/api/trips/${tripId}/rollback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetVersion }) });
      if (!response.ok) return setState(response.status === 401 ? "unauthenticated" : "unavailable");
      const pending = await response.json() as Omit<PendingRollback, "idempotencyKey">;
      setPendingRollback({ ...pending, idempotencyKey: crypto.randomUUID() });
    } catch { setState("unavailable"); } finally { setAction(null); }
  }

  async function confirmRollback() {
    if (!pendingRollback) return;
    setAction("confirming");
    try {
      const response = await fetch(`/api/trips/${tripId}/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ proposalId: pendingRollback.proposalId, idempotencyKey: pendingRollback.idempotencyKey, digest: `rollback-v${pendingRollback.targetVersion}-to-v${pendingRollback.baseTripVersion}` }) });
      if (!response.ok && response.status === 401) return setState("unauthenticated");
      const refreshed = await reload();
      if (refreshed && refreshed.trip.headVersion > pendingRollback.baseTripVersion) setPendingRollback(null);
    } catch {
      const refreshed = await reload().catch(() => { setState("unavailable"); return null; });
      if (refreshed && refreshed.trip.headVersion > pendingRollback.baseTripVersion) setPendingRollback(null);
    } finally { setAction(null); }
  }

  if (state === "unauthenticated") return <Shell><section className={styles.status}><h1>Trip Canvas</h1><p>Sign in to read this Trip’s current version.</p><Link className={styles.action} href={`/auth/sign-in?returnTo=/visepanda/trips/${tripId}`}>Sign in</Link></section></Shell>;
  if (state !== "ready" || !data) return <Shell><section className={styles.status}><h1>Trip Canvas</h1><p>{state === "loading" ? "Loading the current version…" : "This Trip is unavailable."}</p></section></Shell>;

  return <Shell><main className={styles.main}>
    <p className={styles.eyebrow}>Trip Canvas · canonical timeline</p>
    <h1 className={styles.title}>{data.trip.title}</h1>
    <p className={styles.lede}>A read-only view of the current Trip and its confirmed version history. Each recorded change has an immutable origin Proposal and remains append-only.</p>
    <section className={styles.overview} aria-label="Current Trip version"><div><span>Current version</span><strong>v{data.trip.headVersion}</strong></div><time dateTime={data.trip.updatedAt}>Updated {new Date(data.trip.updatedAt).toLocaleString()}</time></section>
    <p className={styles.notice}>Rollback is not a rewrite. Preparing a restore makes a new Proposal; only your explicit confirmation can create the next version.</p>
    {pendingRollback && <section className={styles.proposal} aria-live="polite"><strong>Restore to version {pendingRollback.targetVersion} is ready for confirmation.</strong><p>This will create a new version from the recorded snapshot. No existing event or version will be changed.</p><div className={styles.proposalActions}><button className={styles.primary} disabled={action !== null} onClick={() => void confirmRollback()}>{action === "confirming" ? "Confirming…" : "Confirm restore"}</button><button className={styles.secondary} disabled={action !== null} onClick={() => setPendingRollback(null)}>Keep current version</button></div></section>}
    <section className={styles.history}><article className={styles.panel}><p className={styles.eyebrow}>Version history</p><h2>Confirmed changes</h2>{data.versions.length === 0 ? <p>No confirmed changes have been recorded for this Trip yet.</p> : <ol className={styles.timeline}>{data.versions.map((version) => <li className={styles.event} key={version.id}><i className={styles.dot} aria-hidden="true"/><div><strong>{version.eventType === "initial" ? "Initial version" : `Version ${version.resultingVersion} confirmed`}</strong><span>{version.eventType === "initial" ? "The immutable baseline for this Trip." : "Applied through an immutable Proposal."}</span><span className={styles.meta}>Recorded {new Date(version.createdAt).toLocaleString()}</span>{version.proposalId && <details><summary>Inspect origin Proposal</summary><span className={styles.meta}>Proposal ID: {version.proposalId}</span></details>}{version.resultingVersion < data.trip.headVersion && version.title !== null && <button className={styles.button} disabled={action !== null || pendingRollback !== null} onClick={() => void prepareRollback(version.resultingVersion)}>{action === "preparing" ? "Preparing…" : `Restore this version as v${data.trip.headVersion + 1}`}</button>}</div></li>)}</ol>}</article><div><TripPlaceView tripId={tripId}/><TripActionsView tripId={tripId}/><aside className={styles.panel}><p className={styles.eyebrow}>Integrity</p><h2>One current head</h2><p>The timeline is read from the same owner-scoped Trip source as the current version. It has no fixture fallback and no direct write action.</p></aside></div></section>
  </main></Shell>;
}

function Shell({ children }: { children: ReactNode }) {
  return <div className={styles.shell}><header className={styles.header}><Link className={styles.brand} href="/visepanda" aria-label="VisePanda home"><VisePandaMark /></Link><Link className={styles.back} href="/visepanda">Back to VisePanda</Link></header>{children}</div>;
}
