"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PendingProposalRead } from "../../lib/server/identity/user-data-adapter";
import type { LocalTripRead } from "../canvas/TripContentEditor";
import { TripItemAddress } from "./TripItemAddress";
import { AddressProposalDiff } from "./AddressProposalDiff";
import { useAddressActor } from "./useAddressActor";
import { newAddressIntent, postAddressIntent, readAddressIntent, addressIntentSettled, addressReviewBlocked, type AddressIntent } from "./online-proposal";
import type { AddressPrepare } from "./proposal";
import type { AddressContext } from "./context";
import styles from "./TripItemAddress.module.css";

type InFlight = { intent: AddressIntent; phase: "posting" | "unknown" | "handed" };
export type TripAddressSectionProps = {
  tripId: string;
  data: LocalTripRead;
  locale: "zh" | "en";
  pending: PendingProposalRead | null;
  /** External pending/rollback/mutation/initial-reference and local-editor dirty/busy/unknown. Excludes this section's own lock. */
  blocked: boolean;
  /** Exact applied:<proposalId> or rejected:<proposalId> after authoritative terminal/cancellation readback. */
  settledEpoch: string;
  onPrepared: (proposal: PendingProposalRead) => void;
  /** Blocks other writers during dispatch/unknown ACK. Handed proposals use the original parent pending gate; Confirm stays available. */
  onAddressBlockChange: (blocked: boolean) => void;
};

export function TripAddressSection(props: TripAddressSectionProps) {
  const { actor, current } = useAddressActor();
  const [, setRevision] = useState(0);
  const [recovering, setRecovering] = useState(false);
  const intents = useRef(new Map<string, InFlight>());
  const transport = useRef<AbortController | null>(null);
  const liveProps = useRef(props); liveProps.current = props;
  const active = useRef(true);
  const scope = actor ? JSON.stringify([actor.identity, props.tripId]) : null;
  const currentIntent = scope ? intents.current.get(scope) : undefined;
  const qualifiedRoot = !!actor && current()?.key === actor.key && props.data.trip.id === props.tripId && props.data.confirmationState === "confirmed";
  const retainedUnknown = !actor && [...intents.current.values()].some(record => record.intent.context.tripId === props.tripId && record.phase !== "handed");
  const ownBlocked = currentIntent !== undefined || retainedUnknown;
  const parentLock = currentIntent !== undefined && currentIntent.phase !== "handed" || retainedUnknown
    || addressReviewBlocked(props.pending, qualifiedRoot);
  const contexts = useMemo(() => actor ? props.data.content.days.flatMap(day => (day.items ?? []).map(item => ({
    title: item.title, context: { actorKey: actor.key, tripId: props.tripId, tripVersion: props.data.trip.headVersion, dayId: day.id, itemId: item.id },
  }))) : [], [actor, props.tripId, props.data]);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; transport.current?.abort(); };
  }, []);
  useEffect(() => {
    transport.current?.abort(); transport.current = null; setRecovering(false);
    let changed = false;
    for (const record of intents.current.values()) {
      if (record.phase === "posting") { record.phase = "unknown"; changed = true; }
    }
    if (changed) setRevision(n => n + 1);
  }, [actor?.key, props.tripId, props.data.trip.headVersion]);
  useEffect(() => {
    liveProps.current.onAddressBlockChange(parentLock);
    return () => liveProps.current.onAddressBlockChange(false);
  }, [parentLock]);
  useEffect(() => {
    if (!scope) return;
    const record = intents.current.get(scope);
    // A disappearing pending value alone is never a terminal receipt.
    if (record && addressIntentSettled(record.intent, record.phase, props.settledEpoch, props.pending?.proposal.id ?? null)) {
      intents.current.delete(scope); setRevision(n => n + 1);
    }
  }, [scope, props.settledEpoch, props.pending]);

  const contextCurrent = useCallback((context: AddressContext, identity: string, allowOwn: boolean) => {
    const p = liveProps.current, root = current();
    if (!active.current || !root || root.identity !== identity || root.key !== context.actorKey
      || p.tripId !== context.tripId || p.data.trip.id !== context.tripId || p.data.trip.headVersion !== context.tripVersion
      || p.data.confirmationState !== "confirmed" || !p.data.content.days.some(day => day.id === context.dayId && day.items?.some(item => item.id === context.itemId))
      || document.visibilityState === "hidden" || navigator.onLine === false) return false;
    return allowOwn || !p.blocked && p.pending === null;
  }, [current]);

  const prepare: AddressPrepare = useCallback(async request => {
    const root = current();
    if (!root || !contextCurrent(request.context, root.identity, false)) throw Error("ADDRESS_CONTEXT_CHANGED");
    const key = JSON.stringify([root.identity, request.context.tripId]);
    if (intents.current.has(key) || request.patch.expectedVersion !== request.context.tripVersion || request.patch.operations.length !== 1) throw Error("ADDRESS_PREPARE_BLOCKED");
    const text = request.patch.operations[0].text;
    const intent = newAddressIntent(root.identity, request.context, text);
    if (JSON.stringify(request.patch.operations[0]) !== JSON.stringify(intent.operation)) throw Error("INVALID_ADDRESS_OPERATION");
    const record: InFlight = { intent, phase: "posting" };
    // Synchronous lock before the only POST; retained across auth/visibility/version fences.
    intents.current.set(key, record); setRevision(n => n + 1);
    liveProps.current.onAddressBlockChange(true);
    const controller = new AbortController(); transport.current = controller;
    const live = () => !controller.signal.aborted && contextCurrent(intent.context, intent.identity, true) && !liveProps.current.blocked
      && (!liveProps.current.pending || liveProps.current.pending.proposal.id === intent.receipt?.proposalId) && intents.current.get(key) === record;
    const timeout = setTimeout(() => {
      controller.abort(); record.phase = "unknown";
      if (transport.current === controller) transport.current = null;
      if (active.current) setRevision(n => n + 1);
    }, 8000);
    try {
      await postAddressIntent(intent, controller.signal, live);
      const pending = await readAddressIntent(intent, controller.signal, live);
      if (!live()) throw Error("ADDRESS_CONTEXT_CHANGED");
      record.phase = "handed"; setRevision(n => n + 1);
      liveProps.current.onPrepared(pending);
    } catch (error) {
      record.phase = "unknown";
      if (active.current) setRevision(n => n + 1);
      throw error;
    } finally {
      clearTimeout(timeout);
      if (transport.current === controller) transport.current = null;
    }
  }, [current, contextCurrent]);

  async function recover() {
    const root = current();
    if (!root || !scope || recovering || transport.current) return;
    const record = intents.current.get(scope);
    if (!record || record.phase !== "unknown" || !qualifiedRoot || props.blocked || props.pending !== null) return;
    const controller = new AbortController(); transport.current = controller; setRecovering(true);
    const key = scope;
    // Requalify same subject/session under the new ephemeral root; the original request bytes never change.
    const context = { ...record.intent.context, actorKey: root.key };
    const live = () => !controller.signal.aborted && contextCurrent(context, record.intent.identity, true) && !liveProps.current.blocked
      && (!liveProps.current.pending || liveProps.current.pending.proposal.id === record.intent.receipt?.proposalId) && intents.current.get(key) === record;
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const pending = await readAddressIntent(record.intent, controller.signal, live);
      if (live()) { record.phase = "handed"; setRevision(n => n + 1); liveProps.current.onPrepared(pending); }
    } catch { /* Remain unknown. A failed GET is never permission to POST again. */ }
    finally { clearTimeout(timeout); if (transport.current === controller) transport.current = null; if (active.current) setRecovering(false); }
  }

  const zh = props.locale === "zh";
  return <section className={styles.panel} aria-label={zh ? "当前行程地址" : "Current Trip addresses"} data-testid="trip-address-section">
    {!qualifiedRoot ? <p role="status">{zh ? "当前身份或确认版本地址暂不可用。" : "Addresses are unavailable for the current identity or confirmed version."}</p> : <>
      {currentIntent?.phase === "unknown" ? <div role="status"><p>{zh ? "地址提案结果未知。保留原请求，仅重新读取原提案；不会重复提交。" : "Address proposal outcome unknown. Original request retained; recovery only rereads the original proposal."}</p><button type="button" disabled={recovering || props.blocked || props.pending !== null || transport.current !== null} onClick={() => void recover()}>{zh ? "读取原提案状态" : "Read original proposal status"}</button></div> : null}
      {contexts.map(({ title, context }) => <section key={`${context.dayId}:${context.itemId}`} aria-label={title}>
        <h2>{title}</h2>
        <TripItemAddress context={context} locale={props.locale} blocked={props.blocked || props.pending !== null || ownBlocked} settledEpoch={props.settledEpoch} prepare={prepare} />
        {props.pending ? <AddressProposalDiff pending={props.pending} context={context} locale={props.locale} /> : null}
      </section>)}
    </>}
  </section>;
}
