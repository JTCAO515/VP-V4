"use client";
import { useEffect, useRef, useState } from "react";
import type { RouteOption } from "@/lib/server/maps/route-comparison";
import styles from "./PlaceWorkspace.module.css";
export type RoutePlace = { provider: string; providerPoiId: string; rawName: string; address: string | null; location: { lat: number; lng: number; coordinateSystem: string } | null };
type Comparison = { provider: string; origin: RoutePlace; destination: RoutePlace; observedAt: string; expiresAt: string; options: RouteOption[] };
export function RouteComparison({ selected, chinese }: { selected: RoutePlace | null; chinese: boolean }) {
  const text = (en: string, zh: string) => chinese ? zh : en;
  const [origin, setOrigin] = useState<RoutePlace | null>(null), [destination, setDestination] = useState<RoutePlace | null>(null);
  const [reply, setReply] = useState<Comparison | null>(null), [message, setMessage] = useState(""), [loading, setLoading] = useState(false), [future, setFuture] = useState(false), [now, setNow] = useState(Date.now());
  const request = useRef<AbortController | null>(null), generation = useRef(0);
  const invalidate = () => { generation.current++; request.current?.abort(); setReply(null); setLoading(false); setMessage(""); };
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => { clearInterval(timer); generation.current++; request.current?.abort(); }; }, []);
  const expired = !!reply && (!Number.isFinite(Date.parse(reply.expiresAt)) || now >= Date.parse(reply.expiresAt));
  const choose = (start: boolean) => { invalidate(); if (start) setOrigin(selected); else setDestination(selected); };
  async function compare() {
    if (!origin || !destination) return;
    invalidate(); const own = generation.current, controller = new AbortController(); request.current = controller; setLoading(true);
    try {
      const params = new URLSearchParams({ action: "routes", provider: "amap", originId: origin.providerPoiId, destinationId: destination.providerPoiId, departure: "now" });
      const response = await fetch(`/api/places/lookup?${params}`, { cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (generation.current !== own) return;
      if (!response.ok) {
        if (response.status === 401) { setOrigin(null); setDestination(null); }
        throw new Error(data.error?.code === "TIMEOUT_BEFORE_OUTPUT" ? text("Query timed out. Retry.", "查询超时，请重试。") : text("Routes unavailable. Check the selected places and sign-in, or copy the address.", "路线暂不可用。请检查起终点和登录状态，或复制地址。"));
      }
      if (data.provider !== "amap" || data.origin?.providerPoiId !== origin.providerPoiId || data.destination?.providerPoiId !== destination.providerPoiId || !Array.isArray(data.options) || !Number.isFinite(Date.parse(data.expiresAt))) throw new Error(text("Route endpoints do not match. Select again.", "路线起终点不匹配，请重新选择。"));
      setReply(data); setNow(Date.now());
    } catch (error) { if (!controller.signal.aborted && own === generation.current) setMessage(error instanceof Error ? error.message : text("Routes unavailable.", "路线暂不可用。")); }
    finally { if (own === generation.current) setLoading(false); }
  }
  const eligible = selected?.provider === "amap" && selected.location?.coordinateSystem === "gcj02";
  return <section className={styles.detail} aria-label={text("Compare routes", "比较路线")}>
    <h2>{text("Compare routes", "比较路线")}</h2>
    <p>{text("Choose an AMap place below, then set it as your start or destination. Manual selection works when location permission is denied.", "在下方选择高德地点，再设为起点或终点。拒绝定位权限后仍可手动选点。")}</p>
    <div className={styles.form}><button disabled={!eligible} onClick={() => choose(true)}>{text("Use selected place as start", "将已选地点设为起点")}</button><button disabled={!eligible} onClick={() => choose(false)}>{text("Use selected place as destination", "将已选地点设为终点")}</button><button onClick={() => { invalidate(); setOrigin(null); setDestination(null); }}>{text("Clear route", "清除路线")}</button></div>
    <p>{text("Start: ", "起点：")}{origin?.rawName ?? "—"} → {text("Destination: ", "终点：")}{destination?.rawName ?? "—"}</p>
    <label>{text("Departure", "出发时间")} <select value={future ? "future" : "now"} onChange={event => { invalidate(); setFuture(event.target.value === "future"); }}><option value="now">{text("Now", "现在")}</option><option value="future">{text("Future departure", "未来出发")}</option></select></label>
    {future ? <p>{text("Future departure is unavailable. Current traffic is not a forecast for tomorrow.", "暂不支持未来出发。当前路况不是明日预测。")}</p> : <button disabled={!origin || !destination || origin.providerPoiId === destination.providerPoiId || loading} onClick={() => void compare()}>{text("Agree and compare with AMap", "同意并向高德查询比较")}</button>}
    <p className={styles.note}>{text("This query sends the two selected places to AMap. No current or background location is sent. Estimates are not quotes; tolls exclude taxi fare. Transit planning is not live arrivals, and driving does not book a car. Accessibility and entrances are unverified.", "查询将两处已选地点发送给高德，不发送当前或后台定位。估算不是实际报价；过路费不含打车费。公交规划不是实时到站，驾车规划不代表叫车成功。无障碍及入口未核实。")}</p>
    <p role="status">{loading ? text("Comparing…", "比较中…") : message}</p>
    {destination && <><h3>{text("Chinese address card", "中文地址卡")}</h3><p>{destination.rawName}</p><address>{destination.address ?? text("Address unavailable; reselect an exact entrance or terminal.", "地址缺失，请重选准确入口或航站楼。")}</address>{destination.address && <button onClick={() => void navigator.clipboard.writeText(`${destination.rawName}\n${destination.address}`).then(() => setMessage(text("Address copied.", "地址已复制。"))).catch(() => setMessage(text("Select and copy the address manually.", "请选中文字手动复制地址。")))}>{text("Copy destination address", "复制终点地址")}</button>}</>}
    {reply && <><p>{text("Source: AMap · Queried: ", "来源：高德 · 查询：")}{reply.observedAt}</p>{expired ? <p role="alert">{text("Route observation expired. Query again before navigation.", "路线观测已过期，请重新查询后导航。")}</p> : reply.options.map(option => <article key={option.mode}>
      <h3>{text(option.mode, { walking: "步行", transit: "公交", driving: "驾车" }[option.mode])}</h3>
      {option.status !== "observed" ? <p>{text("Unavailable for this mode: ", "此方式暂不可用：")}{option.status}</p> : <><p>{Math.ceil((option.durationSeconds ?? 0) / 60)} {text("min", "分钟")} · {option.distanceMeters} m</p><p>{text("Walking / transfers: ", "步行距离 / 换乘：")}{option.walkingMeters ?? "—"} m / {option.transfers ?? "—"}</p><p>{text(option.estimateKind === "tolls_only" ? "Estimated tolls only: " : "Estimated fare: ", option.estimateKind === "tolls_only" ? "仅过路费估算：" : "票价估算：")}{option.estimateCny == null ? text("Unknown", "未知") : `¥${option.estimateCny}`}</p><p>{text("Estimated departure / arrival: ", "估算出发 / 到达：")}{option.departureAt} / {option.arrivalAt}</p><ol>{option.steps?.map((step, index) => <li key={index}>{step}</li>)}</ol>{option.webUrl?.startsWith("https://uri.amap.com/navigation?") && <a onClick={event => { if (Date.now() >= Date.parse(reply.expiresAt)) { event.preventDefault(); setNow(Date.now()); } }} href={option.webUrl} target="_blank" rel="noreferrer">{text("Open AMap web directions", "打开高德网页路线")}</a>}</>}
    </article>)}<p>{text("If the map cannot open, copy the address. After returning to VP, select and query again.", "地图无法打开时请复制地址；返回 VP 后请重新选点查询。")}</p></>}
  </section>;
}
