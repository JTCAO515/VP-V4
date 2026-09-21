import { type NextRequest } from "next/server";
import { requireAuthenticatedActor } from "@/lib/server/maps/web-auth";
export const dynamic = "force-dynamic";
// AMap's documented security proxy paths only, never an arbitrary upstream URL.
const allowed = new Set(["v4/map/styles", "v3/vectormap", "v3/log/init"]);
export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!await requireAuthenticatedActor(request)) return new Response(null, { status: 401, headers });
  const path = (await context.params).path.join("/");
  const secret = process.env.AMAP_JS_SECURITY_CODE, key = process.env.AMAP_JS_DISPLAY_KEY;
  if (!allowed.has(path) || !secret || !key || request.nextUrl.search.length > 8192) return new Response(null, { status: 404, headers });
  const callback = request.nextUrl.searchParams.get("callback");
  if (callback && !/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(callback)) return new Response(null, { status: 400, headers });
  const url = new URL(`https://webapi.amap.com/${path}`);
  url.search = request.nextUrl.search;
  url.searchParams.set("key", key);
  url.searchParams.set("jscode", secret);
  try {
    const upstream = await fetch(url, { redirect: "error", cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]) });
    if (!upstream.ok) return new Response(null, { status: 502, headers });
    // Forward no upstream cookies or diagnostic URLs/headers.
    return new Response(upstream.body, { headers: { ...headers, "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response(null, { status: 503, headers }); }
}
