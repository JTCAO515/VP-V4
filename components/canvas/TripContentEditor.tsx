"use client";

import { useEffect, useRef, useState } from "react";
import { tripLocalEditorCopy, type Locale } from "@/lib/i18n";
import type { PendingProposalRead } from "@/lib/server/identity/user-data-adapter";
import { draftTripPatch } from "@/lib/server/trip/patch/draft";
import type { TripSnapshot, TripDay } from "@/lib/server/trip/patch/contract";
import styles from "./TripContentEditor.module.css";

export type LocalTripRead = { trip: { id: string; title: string; headVersion: number; updatedAt: string }; content: { days: readonly TripDay[] }; confirmationState?: "initial" | "confirmed" | "unknown" };
const snapshotOf = (data: LocalTripRead): TripSnapshot => structuredClone({ version: data.trip.headVersion, title: data.trip.title, days: data.content.days });

export function TripContentEditor({ data, pending, locale, onReload, onPending }: {
  data: LocalTripRead; pending: PendingProposalRead | null; locale: Locale;
  onReload: () => Promise<LocalTripRead | null>; onPending: (pending: PendingProposalRead | null) => void;
}) {
  const copy = tripLocalEditorCopy[locale];
  const [base, setBase] = useState(() => snapshotOf(data));
  const [draft, setDraft] = useState(() => snapshotOf(data));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const live = useRef(true);
  const reviewedDraft = useRef<string | null>(null);
  const keys = useRef(new Map<string, string>());
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => { if (!dirty) { const next = snapshotOf(data); setBase(next); setDraft(next); } }, [data, dirty]);
  const stale = dirty && base.version !== data.trip.headVersion;
  function reset(next = data) { const value = snapshotOf(next); setBase(value); setDraft(value); setDirty(false); reviewedDraft.current = null; }
  function edit(value: TripSnapshot) { setDraft(value); setDirty(true); }
  function dayEdit(id: string, update: (day: TripDay) => TripDay) { edit({ ...draft, days: draft.days.map(day => day.id === id ? update(day) : day) }); }
  async function loadLatest() { setBusy(true); try { await onReload(); } catch { if (live.current) setNotice(copy.unavailable); } finally { if (live.current) setBusy(false); } }
  async function propose(revise: boolean) {
    const patch = draftTripPatch(base, draft);
    if (!patch.operations.length) { setNotice(copy.noChanges); return; }
    setBusy(true);
    try {
      const result = await fetch(`/api/trips/${data.trip.id}/proposal${revise ? "/revision" : ""}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(revise && pending ? { proposalId: pending.proposal.id, patch } : { patch }) });
      if (!live.current) return;
      if (!result.ok) { await onReload(); if (live.current) setNotice(result.status === 409 ? copy.conflict : copy.unavailable); return; }
      const receipt = await result.json() as { proposalId: string };
      const read = await fetch(`/api/trips/${data.trip.id}/proposal?proposalId=${receipt.proposalId}`, { cache: "no-store" });
      if (!live.current) return;
      if (!read.ok) { setNotice(copy.conflict); return; }
      const proposal = await read.json() as PendingProposalRead;
      if (!live.current || proposal.trip.id !== data.trip.id || proposal.proposal.id !== receipt.proposalId || !proposal.proposal.digest) return;
      reviewedDraft.current = JSON.stringify(draft);
      onPending(proposal); setNotice(copy.pending);
    } catch { if (live.current) setNotice(copy.unavailable); } finally { if (live.current) setBusy(false); }
  }
  async function confirm() {
    if (!pending?.proposal.digest) return;
    const intent = pending.proposal;
    const id = intent.id + ":" + intent.digest;
    const key = keys.current.get(id) ?? crypto.randomUUID(); keys.current.set(id, key);
    const clearDraft = !dirty || reviewedDraft.current === JSON.stringify(draft);
    setBusy(true);
    try {
      const result = await fetch(`/api/trips/${data.trip.id}/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ proposalId: intent.id, idempotencyKey: key, digest: intent.digest }) });
      if (!live.current) return;
      const latest = await onReload();
      if (!live.current) return;
      if (result.ok && latest) { if (clearDraft) reset(latest); setNotice(copy.stored); }
      else setNotice(result.status === 409 ? copy.conflict : copy.unavailable);
    } catch { if (live.current) setNotice(copy.unavailable); } finally { if (live.current) setBusy(false); }
  }
  async function reject() {
    if (!pending) return; setBusy(true);
    try {
      const result = await fetch(`/api/trips/${data.trip.id}/proposal/reject`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ proposalId: pending.proposal.id }) });
      if (!live.current) return;
      if (result.ok) onPending(null); else setNotice(copy.unavailable);
    } catch { if (live.current) setNotice(copy.unavailable); } finally { if (live.current) setBusy(false); }
  }
  return <section className={styles.workspace} data-testid="same-trip-editor">
    <p className={styles.note}>{copy.localOnly}</p>
    <section className={styles.recorded}><h2>{data.confirmationState === "confirmed" ? copy.confirmed : data.confirmationState === "initial" ? copy.initial : copy.unknown} · v{data.trip.headVersion}</h2><SnapshotContent value={snapshotOf(data)} /><p>{copy.locks} · {copy.orders}</p><button type="button" onClick={() => void loadLatest()} disabled={busy}>{copy.reload}</button></section>
    <div role="status" className={styles.note}>{stale ? copy.conflict : notice}</div>
    <section className={styles.draft}><h2>{copy.draft}</h2><p>{copy.base} {base.version}</p>
      <label>{copy.tripTitle}<input value={draft.title} maxLength={160} disabled={busy} onChange={event => edit({ ...draft, title: event.target.value })} /></label>
      {draft.days.map((day, index) => <fieldset key={day.id}><legend>{copy.date} {index + 1}</legend><div className={styles.row}><label>{copy.date}<input type="date" value={day.date} disabled={busy} onChange={event => dayEdit(day.id, previous => ({ ...previous, date: event.target.value }))} /></label><button type="button" disabled={busy} onClick={() => edit({ ...draft, days: draft.days.filter(value => value.id !== day.id) })}>{copy.remove}</button></div>
        {(day.items ?? []).map(item => <div className={styles.row} key={item.id}><label>{copy.itemTitle}<input value={item.title} maxLength={160} disabled={busy} onChange={event => dayEdit(day.id, previous => ({ ...previous, items: previous.items?.map(value => value.id === item.id ? { ...value, title: event.target.value } : value) }))} /></label><button type="button" disabled={busy} onClick={() => dayEdit(day.id, previous => ({ ...previous, items: previous.items?.filter(value => value.id !== item.id) }))}>{copy.remove}</button></div>)}
        <button type="button" disabled={busy} onClick={() => dayEdit(day.id, previous => ({ ...previous, items: [...(previous.items ?? []), { id: crypto.randomUUID(), dayId: day.id, title: copy.newItem }] }))}>{copy.addItem}</button>
      </fieldset>)}
      <div className={styles.actions}><button type="button" disabled={busy} onClick={() => { const last = draft.days.at(-1)?.date; const date = last ? new Date(last + "T12:00:00Z") : new Date(); if (last) date.setUTCDate(date.getUTCDate() + 1); edit({ ...draft, days: [...draft.days, { id: crypto.randomUUID(), date: date.toISOString().slice(0, 10), items: [] }] }); }}>{copy.addDay}</button><button type="button" disabled={busy || !dirty || Boolean(pending)} onClick={() => void propose(false)}>{copy.review}</button>{pending ? <button type="button" disabled={busy || !dirty} onClick={() => void propose(true)}>{copy.revise}</button> : null}<button type="button" disabled={busy || !dirty} onClick={() => reset()}>{copy.reset}</button></div>
    </section>
    {pending ? <section className={styles.pending}><h2>{copy.pending}</h2><p>{copy.proposalBase} {pending.proposal.baseTripVersion} · {copy.proposalRevision} {pending.proposal.revision}</p><div className={styles.diff}><div><h3>{copy.before}</h3>{pending.proposal.before ? <SnapshotContent value={pending.proposal.before} /> : <p>{pending.proposal.titleDiff.before}</p>}</div><div><h3>{copy.after}</h3>{pending.proposal.after ? <SnapshotContent value={pending.proposal.after} /> : <p>{pending.proposal.titleDiff.after}</p>}</div></div><div className={styles.actions}><button type="button" disabled={busy || pending.proposal.stale || !pending.proposal.digest} onClick={() => void confirm()}>{copy.confirm}</button><button type="button" disabled={busy} onClick={() => void reject()}>{copy.reject}</button></div></section> : null}
  </section>;
}
function SnapshotContent({ value }: { value: TripSnapshot }) { return <div><strong>{value.title}</strong>{value.days.map(day => <div key={day.id}><h3>{day.date}{day.timeZone ? ` · ${day.timeZone}` : ""}</h3><ul>{(day.items ?? []).map(item => <li key={item.id}>{item.title}{item.startsAt ? ` · ${item.startsAt}` : ""}{item.endsAt ? ` – ${item.endsAt}` : ""}</li>)}</ul></div>)}</div>; }
