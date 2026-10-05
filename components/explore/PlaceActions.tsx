"use client";
import { useEffect, useRef, useState } from "react";
import { createPasswordAuthClient } from "@/lib/server/identity/browser-auth-client";
import { decodePlaceContext, type PlaceActionContext } from "@/lib/server/explore/place-action-context";
import { decodePlaceReceipt, decodePlaceCancelled, decodeSavedPlaceActions, type SavedPlaceActions } from "@/lib/server/explore/place-action-service";
import { parsePlaceCommand } from "@/lib/server/explore/place-action-command";
import { record, exact, uuid } from "@/lib/server/explore/place-action-base";
import { sameSelection } from "@/lib/server/explore/place-action-context";
import { placeProposalReference, type PlaceProposalReference } from "@/lib/server/explore/proposal-review-reference";
import type { PlaceSelection, PlaceMutation } from "@/lib/server/explore/place-action-contract";
import styles from "../places/PlaceWorkspace.module.css";

type Trip = { id: string; title: string; headVersion: number };
type Pending = { tripId: string; body: string; request: PlaceMutation };
const key = (subject: string) => "vp:place-action:1:" + subject;
function pendingOf(value: unknown): Pending | null {
  if (!record(value) || !exact(value, ["tripId", "body"]) || !uuid(value.tripId) || typeof value.body !== "string" || value.body.length > 8192) return null;
  try { const request = parsePlaceCommand(JSON.parse(value.body), false); return request && ["save", "unsave", "add"].includes(request.action) ? { tripId: value.tripId, body: value.body, request: request as PlaceMutation } : null; } catch { return null; }
}
/** Metadata recovery only. Provider labels, addresses and raw results never enter storage. */
export function PlaceActions({ selected, chinese }: { selected: PlaceSelection | null; chinese: boolean }) {
  const [actor, setActor] = useState<{ subject: string; session: string } | null>(null), [trips, setTrips] = useState<Trip[]>([]), [tripId, setTripId] = useState("");
  const [context, setContext] = useState<PlaceActionContext | null>(null), [saved, setSaved] = useState<SavedPlaceActions["items"]>([]), [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [dayId, setDayId] = useState(""), [start, setStart] = useState(""), [end, setEnd] = useState("");
  const [review, setReview] = useState<PlaceProposalReference | null>(null), [reviewTrip, setReviewTrip] = useState("");
  const epoch = useRef(0), locked = useRef(false), lifetime = useRef<AbortController | null>(null), lastIdentity = useRef("");
  const text = (en: string, zh: string) => chinese ? zh : en;
  const locale = chinese ? "zh" as const : "en" as const;
  const resetView = () => { epoch.current++; lifetime.current?.abort(); lifetime.current = new AbortController(); setContext(null); setSaved([]); setReview(null); setReviewTrip(""); setDayId(""); setStart(""); setEnd(""); setBusy(false); locked.current = false; };
  useEffect(() => {
    const auth = createPasswordAuthClient(); if (!auth) return;
    let live = true;
    const load = async () => {
      const claims = await auth.auth.getClaims(); if (!live) return;
      const sub = claims.data?.claims.sub, session = claims.data?.claims.session_id;
      const identity = !claims.error && typeof sub === "string" && typeof session === "string" ? sub + ":" + session : "";
      if (identity === lastIdentity.current) return;
      lastIdentity.current = identity; resetView(); setTrips([]); setTripId(""); setPending(null); setActor(null);
      if (!identity || typeof sub !== "string" || typeof session !== "string") return;
      setActor({ subject: sub, session });
      try { const p = pendingOf(JSON.parse(localStorage.getItem(key(sub)) ?? "null")); if (p) setPending(p); } catch { setNotice(text("Recovery storage is unavailable.", "恢复记录暂不可用。")); }
      const own = epoch.current;
      try { const response = await fetch("/api/trips?limit=50", { cache: "no-store", signal: lifetime.current?.signal }); const body: unknown = await response.json();
        if (!live || own !== epoch.current || !response.ok || !record(body) || !Array.isArray(body.trips)) return;
        setTrips(body.trips.filter((t): t is Trip => record(t) && uuid(t.id) && typeof t.title === "string" && typeof t.headVersion === "number"));
      } catch { /* private view remains unavailable */ }
    };
    void load(); const subscription = auth.auth.onAuthStateChange(() => { queueMicrotask(() => { void load(); }); });
    const focus = () => { resetView(); lastIdentity.current = ""; void load(); };
    window.addEventListener("focus", focus); window.addEventListener("pagehide", resetView);
    return () => { live = false; epoch.current++; lifetime.current?.abort(); subscription.data.subscription.unsubscribe(); window.removeEventListener("focus", focus); window.removeEventListener("pagehide", resetView); };
  }, []);
  useEffect(() => { resetView(); setNotice(""); }, [selected?.canonicalPoiId, selected?.provider, selected?.providerPoiId, chinese]);
  const trip = trips.find(t => t.id === tripId);
  const current = context && trip && selected && context.tripId === trip.id && context.tripVersion === trip.headVersion && sameSelection(context.selection, selected) && Date.parse(context.expiresAt) > Date.now() ? context : null;
  async function owns() {
    const auth = createPasswordAuthClient(); if (!auth || !actor) return false;
    const c = await auth.auth.getClaims(); return !c.error && c.data?.claims.sub === actor.subject && c.data.claims.session_id === actor.session;
  }
  async function send(id: string, body: string) {
    if (!await owns()) throw Error("UNAUTHENTICATED");
    const response = await fetch(`/api/trips/${id}/explore/place-actions`, { method: "POST", headers: { "content-type": "application/json" }, body, cache: "no-store", signal: lifetime.current?.signal });
    if (response.status === 401 || response.status === 403) { resetView(); setActor(null); setTrips([]); setTripId(""); setPending(null); setNotice(text("Sign in again to read your recovery receipt.", "请重新登录后读取本人的恢复回执。")); throw Error("UNAUTHENTICATED"); }
    const value: unknown = await response.json(); if (!response.ok) throw Error(record(value) && record(value.error) ? String(value.error.code) : "PLACE_ACTION_UNAVAILABLE");
    if (!await owns()) throw Error("UNAUTHENTICATED"); return value;
  }
  async function readTrips() {
    if (!await owns()) throw Error("UNAUTHENTICATED"); const own = epoch.current;
    const response = await fetch("/api/trips?limit=50", { cache: "no-store", signal: lifetime.current?.signal }); const value: unknown = await response.json();
    if (own !== epoch.current || !await owns()) return;
    if (!response.ok || !record(value) || !Array.isArray(value.trips)) throw Error("TRIP_UNAVAILABLE");
    const rows = value.trips.filter((t): t is Trip => record(t) && uuid(t.id) && typeof t.title === "string" && typeof t.headVersion === "number");
    setContext(null); setSaved([]); setTrips(rows); if (!rows.some(t => t.id === tripId)) setTripId("");
    if (rows.length === 50) setNotice(text("Showing the 50 most recent Trips.", "当前显示最近 50 个行程。"));
  }
  async function action(work: () => Promise<void>) {
    if (locked.current) return; locked.current = true; setBusy(true); const own = epoch.current; setNotice("");
    try { await work(); } catch { if (own === epoch.current) { setContext(null); setNotice(text("This action could not be verified. Keep any pending operation and check its receipt.", "此操作尚未核实。请保留未决记录并查询回执。")); } }
    finally { if (own === epoch.current) { locked.current = false; setBusy(false); } }
  }
  async function readContext() {
    if (!trip || !selected) return; const own = epoch.current;
    const input = { action: "context", expectedTripVersion: trip.headVersion, selection: selected, locale };
    const value = await send(trip.id, JSON.stringify(input)); if (own !== epoch.current) return;
    const decoded = decodePlaceContext(value, trip.id, input); if (!decoded) throw Error("INVALID_RESPONSE");
    setContext(decoded); setDayId("");
  }
  async function readSaved() {
    if (!trip) return; const own = epoch.current, entries: SavedPlaceActions["items"][number][] = []; let cursor: SavedPlaceActions["nextCursor"] = null;
    setSaved([]);
    for (let page = 0; page < 5; page++) {
      const value = await send(trip.id, JSON.stringify({ action: "saved", expectedTripVersion: trip.headVersion, locale, limit: 20, cursor })); if (own !== epoch.current) return;
      const decoded = decodeSavedPlaceActions(value, trip.id, trip.headVersion, 20, cursor); if (!decoded) throw Error("INVALID_RESPONSE");
      entries.push(...decoded.items); if (!decoded.hasMore) { setSaved(entries); setNotice(entries.length ? "" : text("No saved places in this Trip.", "此行程暂无收藏地点。")); return; } cursor = decoded.nextCursor;
    }
    throw Error("INCOMPLETE_SAVED_LIST");
  }
  async function settle(p: Pending, mode: "execute" | "receipt" | "abandon") {
    const own = epoch.current, value = await send(p.tripId, mode === "execute" ? p.body : `{"action":"${mode}","request":${p.body}}`);
    if (own !== epoch.current || !actor) return;
    const committed = record(value) && exact(value, ["kind", "tripId", "operationId", "action", "selection", "tripVersion", "mappingDigest", "requestDigest", "referenceId", "savedRevision", "savedStatus", "proposal", "historicalOnly", "currentEligibilityRequiresRead", "proposalReview", "preview"])
      ? decodePlaceReceipt(Object.fromEntries(Object.entries(value).filter(([k]) => !["proposalReview", "preview"].includes(k))), p.tripId, p.request) : null;
    const cancelled = decodePlaceCancelled(value, p.tripId, p.request);
    if (!committed && !cancelled) { setNotice(text("Receipt is not final. Retry the same operation or explicitly stop it.", "回执尚未终结。可重试原操作或明确停止。")); return; }
    localStorage.removeItem(key(actor.subject)); setPending(null); setContext(null); setSaved([]);
    if (committed) { const reference = record(value) ? placeProposalReference(value.proposalReview) : null; setReview(reference); setReviewTrip(p.tripId);
      setNotice(p.request.action === "add" ? text("Proposal prepared. Feasibility is pending; review its diff before confirming.", "提案已准备。可行性仍待核实；确认前请查看差异。") : p.request.action === "save" ? text("Place identity saved in this Trip.", "地点身份已收藏到此行程。") : text("Place removed from saved references.", "已取消地点收藏。"));
    } else setNotice(text("Unsubmitted operation stopped. This does not reverse a completed change.", "已停止未提交操作，不撤销已成功的变更。"));
  }
  async function mutate(request: PlaceMutation) {
    if (!actor || pending) return; const p = { tripId, body: JSON.stringify(request), request };
    localStorage.setItem(key(actor.subject), JSON.stringify({ tripId: p.tripId, body: p.body })); setPending(p);
    await settle(p, "execute");
  }
  const base = current ? { expectedTripVersion: current.tripVersion, selection: current.selection, expectedMappingDigest: current.mappingDigest } : null;
  return <section aria-label={text("Place actions in your Trip", "同一行程地点操作")} className={styles.detail}>
    <h2>{text("Keep it in your Trip", "放入你的行程")}</h2>
    {!actor ? <p>{text("Sign in to save a place or prepare a Trip change.", "登录后可收藏地点或准备行程调整。")}</p> : <>
      <label>{text("Trip", "行程")} <select disabled={busy} value={tripId} onChange={e => { resetView(); setTripId(e.target.value); }}><option value="">{text("Choose a Trip", "明确选择行程")}</option>{trips.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
      <div className={styles.form}><button disabled={busy} onClick={() => void action(readTrips)}>{text("Reread Trips", "重新读取行程")}</button><button disabled={!trip || busy} onClick={() => void action(readSaved)}>{text("Read saved places", "读取收藏地点")}</button><button disabled={!trip || !selected || busy || !!pending} onClick={() => void action(readContext)}>{text("Check this place", "核对此地点")}</button></div>
      {!selected && <p>{text("Select a mapped place for new actions. Saved places remain readable.", "请选择已映射地点开始新操作；已有收藏仍可读取。")}</p>}
      {current && base && <><p>{current.displayTitle}</p><div className={styles.form}>
        <button disabled={busy || !!pending} onClick={() => void action(() => mutate({ action: "save", operationId: crypto.randomUUID(), ...base, expectedSaveRevision: current.saved?.revision ?? 0 }))}>{text("Save", "收藏")}</button>
        <button disabled={busy || !!pending} onClick={() => void action(async () => { const own = epoch.current, value = await send(tripId, JSON.stringify({ action: "ask", ...base, locale }));
          if (own !== epoch.current || !record(value) || value.kind !== "place_ask_context" || value.tripId !== tripId || value.tripVersion !== base.expectedTripVersion || !record(value.selection) || value.selection.canonicalPoiId !== base.selection.canonicalPoiId || value.mappingDigest !== base.expectedMappingDigest || value.readyForProvider !== false) throw Error("INVALID_RESPONSE");
          if (record(value.handoff) && value.handoff.kind === "ask_ready" && value.handoff.href === `/visepanda/ask?tripId=${tripId}&poiId=${base.selection.canonicalPoiId}`) window.location.assign(value.handoff.href);
          else setNotice(text("This is a first-party place reference. Save it before using the Web Ask handoff.", "这是本人地点引用；请先收藏，再交给网页版 VP。")); })}>{text("Ask VP", "问 VP")}</button>
      </div><div className={styles.form}><label>{text("Day", "当天")}<select value={dayId} onChange={e => setDayId(e.target.value)}><option value="">{text("Choose a day", "明确选择日期")}</option>{current.snapshot.days.map(d => <option key={d.id} value={d.id}>{d.date} · {d.timeZone ?? text("time zone unknown", "时区未知")}</option>)}</select></label>
        <label>{text("Start (your device time zone)", "开始（本机时区）")}<input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></label><label>{text("End (your device time zone)", "结束（本机时区）")}<input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></label>
        <button disabled={!dayId || !start || !end || busy || !!pending} onClick={() => void action(() => mutate({ action: "add", operationId: crypto.randomUUID(), ...base, dayId, itemId: "place_" + crypto.randomUUID().replaceAll("-", ""), startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), locale }))}>{text("Prepare Add proposal", "准备加入提案")}</button></div>
        <p className={styles.note}>{text("Saving keeps an identity reference. Your time choice does not verify opening, reservations, stay duration or future routes.", "收藏保存身份引用；所选时间不代表已核实开放、预约、停留或未来路线。")}</p></>}
      {saved.length > 0 && <ul>{saved.map(row => <li key={row.referenceId}>{row.displayTitle ?? text("Saved place — name unavailable", "收藏地点（名称暂不可用）")} · {row.mappingStatus === "current" ? text("identity current", "身份当前有效") : text("identity needs checking", "身份需重新核实")} <button disabled={busy || !!pending || !trip} onClick={() => void action(() => mutate({ action: "unsave", operationId: crypto.randomUUID(), expectedTripVersion: trip!.headVersion, selection: row.selection, expectedMappingDigest: row.mappingDigest, referenceId: row.referenceId, expectedSaveRevision: row.revision }))}>{text("Unsave", "取消收藏")}</button></li>)}</ul>}
      {pending && <div><p>{text("An earlier operation needs a receipt. Changes cannot start until it is resolved.", "先前操作仍待回执，解决前不能发起新变更。")}</p><div className={styles.form}><button disabled={busy} onClick={() => void action(() => settle(pending, "receipt"))}>{text("Check receipt", "查询回执")}</button><button disabled={busy} onClick={() => void action(() => settle(pending, "execute"))}>{text("Retry same operation", "重试原操作")}</button><button disabled={busy} onClick={() => void action(() => settle(pending, "abandon"))}>{text("Stop if not submitted", "停止尚未提交的操作")}</button></div></div>}
      {review && <a href={`/visepanda/trips/${reviewTrip}?${new URLSearchParams({ proposalId: review.id, proposalRevision: String(review.revision), proposalDigest: review.digest, baseVersion: String(review.baseVersion) })}`}>{text("Review this Proposal and its diff", "查看此提案及差异")}</a>}
    </>}
    <p role="status">{notice}</p>
  </section>;
}
