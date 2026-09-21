"use client";
import { useEffect, useRef, useState } from "react";

type Point = { lat: number; lng: number; coordinateSystem: string };
type Marker = { on(event: "click", action: () => void): void; setMap(map: MapInstance): void };
type MapInstance = { destroy(): void; add(marker: Marker): void };
type SDK = { Map: new (container: HTMLElement, options: object) => MapInstance; Marker: new (options: object) => Marker };
declare global { interface Window { AMap?: SDK; __vpAMapReady?: () => void; _AMapSecurityConfig?: { serviceHost: string }; } }
let sdkPromise: Promise<SDK> | undefined;
function loadSDK(key: string, serviceHost: string): Promise<SDK> {
  if (window.AMap) return Promise.resolve(window.AMap);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<SDK>((resolve, reject) => {
    window._AMapSecurityConfig = { serviceHost: new URL(serviceHost, window.location.origin).href };
    const script = document.createElement("script");
    const timer = window.setTimeout(() => { script.remove(); delete window.__vpAMapReady; reject(new Error("map unavailable")); }, 15_000);
    window.__vpAMapReady = () => { clearTimeout(timer); delete window.__vpAMapReady; window.AMap ? resolve(window.AMap) : reject(new Error("map unavailable")); };
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&callback=__vpAMapReady`;
    script.async = true;
    script.onerror = () => { clearTimeout(timer); delete window.__vpAMapReady; script.remove(); reject(new Error("map unavailable")); };
    document.head.appendChild(script);
  }).catch(error => { sdkPromise = undefined; throw error; });
  return sdkPromise;
}

/** Render only an explicit GCJ02 provider observation. No browser geolocation,
 * inferred entrance, persistence, names/addresses in HTML, or extra provider SDK. */
export function AMapCanvas({ point, selectionID, onSelect, chinese }: { point: Point; selectionID: string; onSelect: (id: string) => void; chinese: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const select = useRef(onSelect);
  useEffect(() => { select.current = onSelect; }, [onSelect]);
  useEffect(() => {
    let alive = true, map: MapInstance | undefined;
    const controller = new AbortController();
    async function start() {
      if (point.coordinateSystem !== "gcj02" || !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) throw new Error("invalid coordinate");
      const response = await fetch("/api/maps/display-config", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("map unavailable");
      const config = await response.json();
      if (!config.enabled || typeof config.key !== "string" || config.serviceHost !== "/api/maps/_AMapService") throw new Error("map unavailable");
      if (!alive) return;
      const sdk = await loadSDK(config.key, config.serviceHost);
      if (!alive || !ref.current) return;
      map = new sdk.Map(ref.current, { center: [point.lng, point.lat], zoom: 16, viewMode: "2D" });
      const marker = new sdk.Marker({ position: [point.lng, point.lat] });
      marker.on("click", () => select.current(selectionID));
      map.add(marker);
    }
    void start().catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; controller.abort(); map?.destroy(); };
  }, [point.lat, point.lng, point.coordinateSystem, selectionID]);
  return <div>{failed && <p role="status">{chinese ? "地图暂不可用，仍可使用下方地址。" : "Map unavailable. You can still use the address below."}</p>}<div ref={ref} style={{ height: 280, width: "100%" }} aria-label={chinese ? "已选地点地图" : "Map of selected place"} /></div>;
}
