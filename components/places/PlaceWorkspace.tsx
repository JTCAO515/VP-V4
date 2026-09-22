"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { RouteComparison } from "./RouteComparison";
import styles from "./PlaceWorkspace.module.css";
const AMapCanvas = dynamic(() => import("./AMapCanvas").then(module => module.AMapCanvas), { ssr: false });
type Candidate = { provider: "amap" | "tencent"; providerPoiId: string; rawName: string; matchedCanonicalPoiId?: string | null };
type Point = { lat: number; lng: number; coordinateSystem: string };
type Detail = { provider: string; providerPoiId: string; rawName: string; address: string | null; location: Point | null };
type Reply = { candidates?: Candidate[]; detail?: Detail | null; result?: { formattedAddress: string; location: Point | null } | null; observedAt?: string };
const identity = (candidate: Candidate) => candidate.matchedCanonicalPoiId ? `canonical:${candidate.matchedCanonicalPoiId.toLowerCase()}` : `provider:${candidate.provider}:${candidate.providerPoiId}`;
export function PlaceWorkspace() {
  const [chinese, setChinese] = useState(false), [query, setQuery] = useState(""), [city, setCity] = useState("shanghai");
  const [provider, setProvider] = useState("amap"), [candidates, setCandidates] = useState<Candidate[]>([]), [suggestions, setSuggestions] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Candidate | null>(null), [detail, setDetail] = useState<Detail | null>(null), [addressResult, setAddressResult] = useState<Reply["result"]>(null);
  const [observedAt, setObservedAt] = useState<string>(), [message, setMessage] = useState(""), [loading, setLoading] = useState(false), [showMap, setShowMap] = useState(false);
  const [routeEpoch, setRouteEpoch] = useState(0);
  const generation = useRef(0), request = useRef<AbortController | null>(null);
  const text = (en: string, zh: string) => chinese ? zh : en;
  const reset = () => { generation.current++; request.current?.abort(); setCandidates([]); setSuggestions([]); setSelected(null); setDetail(null); setAddressResult(null); setObservedAt(undefined); setMessage(""); setLoading(false); setShowMap(false); };
  useEffect(() => {
    document.documentElement.lang = chinese ? "zh-Hans" : "en";
    document.documentElement.dir = "ltr";
  }, [chinese]);
  useEffect(() => {
    // Back navigation and tab hiding discard private provider observations. Nothing
    // is retained in localStorage, URLs, history state or a cross-account cache.
    const clear = () => { setRouteEpoch(value => value + 1); generation.current++; request.current?.abort(); setCandidates([]); setSuggestions([]); setSelected(null); setDetail(null); setAddressResult(null); setObservedAt(undefined); setShowMap(false); setLoading(false); setMessage(""); };
    const hidden = () => { if (document.hidden) clear(); };
    window.addEventListener("focus", clear); window.addEventListener("pagehide", clear); document.addEventListener("visibilitychange", hidden);
    return () => { generation.current++; request.current?.abort(); window.removeEventListener("focus", clear); window.removeEventListener("pagehide", clear); document.removeEventListener("visibilitychange", hidden); };
  }, []);
  async function lookup(action: string, extra: Record<string, string> = {}, candidate?: Candidate) {
    request.current?.abort(); const own = ++generation.current, controller = new AbortController(); request.current = controller;
    setLoading(true); setMessage(""); setShowMap(false); setObservedAt(undefined);
    if (action === "detail") { setSelected(candidate ?? null); setDetail(null); setAddressResult(null); }
    else if (action !== "suggest") { setCandidates([]); setSelected(null); setDetail(null); setAddressResult(null); setSuggestions([]); }
    try {
      const params = new URLSearchParams({ action, provider, q: query, city, ...extra });
      const response = await fetch(`/api/places/lookup?${params}`, { cache: "no-store", signal: controller.signal });
      if (own !== generation.current) return;
      if (!response.ok) {
        if (response.status === 401) { reset(); setRouteEpoch(value => value + 1); }
        throw new Error(response.status === 401 ? text("Sign in to search places.", "请先登录后搜索地点。") : text("This lookup is unavailable. You can retry or change the input.", "本次查询暂不可用，可以重试或调整输入。"));
      }
      const data: Reply = await response.json();
      if (own !== generation.current) return;
      setObservedAt(data.observedAt);
      if (action === "detail") {
        if (!data.detail || data.detail.provider !== candidate?.provider || data.detail.providerPoiId !== candidate.providerPoiId) throw new Error(text("Details not found.", "暂无地点详情。"));
        setDetail(data.detail);
      } else if (action === "geocode") { setAddressResult(data.result); if (!data.result) setMessage(text("Address not found.", "没有匹配地址。")); }
      else {
        const rows = (data.candidates ?? []).slice(0, 50);
        if (action === "suggest") setSuggestions(rows); else setCandidates(rows);
        if (!rows.length) setMessage(text("No matching results.", "没有匹配结果。"));
      }
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : text("Lookup unavailable.", "查询暂不可用。")); }
    finally { if (own === generation.current) setLoading(false); }
  }
  const point = detail?.location ?? addressResult?.location, address = detail?.address ?? addressResult?.formattedAddress;
  return <main className={styles.page}>
    <header className={styles.header}><a href="/visepanda">VisePanda</a><button onClick={() => setChinese(!chinese)}>{chinese ? "English" : "中文"}</button></header>
    <h1>{text("Find a place", "查找地点")}</h1>
    <p className={styles.note}>{text("Search in Chinese, English or pinyin. Choose a specific branch or entrance; no location permission is needed.", "支持中文、英文或拼音。请选择具体分店或入口；无需开启定位。")}</p>
    <form className={styles.form} onSubmit={event => { event.preventDefault(); void lookup("search"); }}>
      <label>{text("City", "城市")}<select value={city} onChange={event => { reset(); setCity(event.target.value); }}>{[["shanghai", "Shanghai", "上海"], ["beijing", "Beijing", "北京"], ["guangzhou", "Guangzhou", "广州"], ["chongqing", "Chongqing", "重庆"]].map(([id, en, zh]) => <option key={id} value={id}>{text(en, zh)}</option>)}</select></label>
      <label>{text("Provider", "地图服务商")}<select value={provider} onChange={event => { reset(); setProvider(event.target.value); }}><option value="amap">AMap / 高德</option><option value="tencent">Tencent / 腾讯</option></select></label>
      <label>{text("Place or address", "地点或地址")}<input value={query} maxLength={200} onChange={event => { reset(); setQuery(event.target.value); }} /></label>
      <button disabled={!query.trim() || loading}>{text("Search", "搜索")}</button>
      <button type="button" disabled={!query.trim() || loading} onClick={() => void lookup("suggest")}>{text("Input tips", "输入提示")}</button>
      <button type="button" disabled={!query.trim() || loading} onClick={() => void lookup("geocode")}>{text("Find address", "解析地址")}</button>
    </form>
    <p className={styles.note}>{text("The chosen provider receives your query and city. Results are observations, not reviewed travel facts. Special services and entrance relationships remain unverified.", "所选服务商会收到查询和城市。结果是供应商观测，不是已审核旅行事实；特殊服务和入口关系仍待核实。")}</p>
    <div role="status">{loading ? text("Looking up…", "查询中…") : message}</div>
    <ul className={styles.results}>{suggestions.map((candidate, index) => <li key={`${candidate.rawName}:${index}`}><button onClick={() => { reset(); if (candidate.providerPoiId) { setCandidates([candidate]); void lookup("detail", { provider: candidate.provider, id: candidate.providerPoiId }, candidate); } else { setQuery(candidate.rawName); } }}>{candidate.rawName}</button></li>)}</ul>
    <ul className={styles.results}>{candidates.map(candidate => <li key={`${candidate.provider}:${candidate.providerPoiId}`}><button aria-pressed={!!selected && identity(selected) === identity(candidate)} onClick={() => void lookup("detail", { provider: candidate.provider, id: candidate.providerPoiId }, candidate)}>{candidate.rawName}</button></li>)}</ul>
    {(selected || addressResult) && <section className={styles.detail} aria-label={text("Selected place", "已选地点")}>
      <h2>{selected?.rawName ?? text("Address result", "地址结果")}</h2>
      {point && point.coordinateSystem === "gcj02" && (showMap ? <AMapCanvas key={`${selected ? identity(selected) : "address"}:${point.lat}:${point.lng}`} point={point} selectionID={selected ? identity(selected) : "address"} onSelect={id => { if (selected && identity(selected) === id) setSelected(selected); }} chinese={chinese} /> : <><button onClick={() => setShowMap(true)}>{text("Agree and show AMap", "同意并显示高德地图")}</button><p className={styles.note}>{text("Loading shares this place coordinate and network/device information with AMap. Your current location is not requested.", "加载时将此地点坐标及网络/设备信息发送给高德，不请求当前位置。")} <a href="https://lbs.amap.com/pages/privacy/" target="_blank" rel="noreferrer">{text("AMap privacy policy", "高德隐私政策")}</a></p></>)}
      <address>{address ?? text("Chinese address unavailable", "暂无中文地址")}</address>
      {address && <button onClick={() => void navigator.clipboard.writeText(`${detail?.rawName ?? ""}\n${address}`).then(() => setMessage(text("Address copied.", "地址已复制。"))).catch(() => setMessage(text("Select and copy the address manually.", "请选中文字手动复制地址。")))}>{text("Copy address", "复制地址")}</button>}
      {observedAt && <p className={styles.note}>{text("Queried: ", "查询时间：")}{observedAt}</p>}
      <p className={styles.note}>{text("This is an observed map point, not a verified entrance. Missing coordinates stay unknown.", "这是观测点位，不是已核实入口。缺失坐标保持未知。")}</p>
      {point?.coordinateSystem === "gcj02" && <div className={styles.form}>{[["restroom", "Restrooms", "厕所"], ["convenience_store", "Convenience stores", "便利店"], ["dining", "Food", "餐饮"], ["pharmacy", "Pharmacies", "药店"], ["atm", "ATM", "ATM"]].map(([category, en, zh]) => <button key={category} disabled={loading} onClick={() => void lookup("nearby", { category, lat: String(point.lat), lng: String(point.lng), system: "gcj02" })}>{text(en, zh)}</button>)}</div>}
    </section>}
    <RouteComparison key={`${city}:${provider}:${routeEpoch}`} selected={detail} chinese={chinese} />
  </main>;
}
