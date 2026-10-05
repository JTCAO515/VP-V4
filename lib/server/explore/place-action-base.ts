import { isUuid } from "../identity/request-guards.ts";
export type PlaceSelection = Readonly<{ canonicalPoiId: string; provider: "amap" | "tencent"; providerPoiId: string }>;
export const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
export const exact = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
export const revision = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 2147483647;
export const digest = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
export const itemId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
export const uuid = (v: unknown): v is string => typeof v === "string" && isUuid(v) && v === v.toLowerCase();
export function boundedUnicode(v: string): boolean {
  if (v.includes("\u0000")) return false;
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) { const next = v.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) return false; }
    else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}
export function selection(v: unknown): v is PlaceSelection {
  return record(v) && exact(v, ["canonicalPoiId", "provider", "providerPoiId"]) && uuid(v.canonicalPoiId)
    && (v.provider === "amap" || v.provider === "tencent") && typeof v.providerPoiId === "string" && boundedUnicode(v.providerPoiId) && v.providerPoiId.trim() === v.providerPoiId && v.providerPoiId.length > 0 && v.providerPoiId.length <= 128;
}
