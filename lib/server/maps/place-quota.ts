/**
 * Per-actor quota for routes that spend paid map/place provider quota
 * (AMap/Tencent Web Service via app/api/places/**, AMap JS security proxy via
 * app/api/maps/_AMapService/**).
 *
 * Counting is atomic in PostgreSQL (`public.consume_place_quota_v1`, see
 * supabase/migrations/20260923140000_places_provider_quota.sql). The RPC is
 * called with the caller's own request-scoped client, so `auth.uid()` — never
 * a caller-supplied id — selects the counter row: a user can only ever spend
 * their own quota. No service credential is involved.
 *
 * Fail-closed: if the quota cannot be checked the route returns 503 and makes
 * no provider call. Nothing here logs query text, coordinates or the actor id.
 */

/** Central thresholds. Conservative defaults; raising them is a reviewed code change. */
export const PLACE_QUOTA_LIMITS = {
  /** Web Service search/suggest/detail/geocode/reverse/nearby/route lookups (button-driven UI). */
  places: { perMinute: 30, perDay: 500 },
  /** AMap JS security-proxy requests (styles, vector map metadata, log init) after map consent. */
  map_proxy: { perMinute: 300, perDay: 5000 },
} as const satisfies Record<string, { perMinute: number; perDay: number }>;

export type PlaceQuotaBucket = keyof typeof PLACE_QUOTA_LIMITS;

export type PlaceQuotaDecision =
  | { kind: "allowed" }
  | { kind: "limited"; retryAfterSeconds: number }
  | { kind: "unavailable" };

type RpcBuilder = PromiseLike<{ data: unknown; error: unknown }> & {
  abortSignal?: (signal: AbortSignal) => PromiseLike<{ data: unknown; error: unknown }>;
};
export type QuotaRpcClient = { rpc(name: string, params: Record<string, unknown>): RpcBuilder };

const TIMEOUT_MS = 5_000;
const MAX_RETRY_AFTER_SECONDS = 86_400;

export async function consumePlaceQuota(
  client: QuotaRpcClient,
  bucket: PlaceQuotaBucket,
  signal?: AbortSignal,
): Promise<PlaceQuotaDecision> {
  const limits = PLACE_QUOTA_LIMITS[bucket];
  try {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const builder = client.rpc("consume_place_quota_v1", {
      p_bucket: bucket,
      p_minute_limit: limits.perMinute,
      p_day_limit: limits.perDay,
    });
    const { data, error } = await (builder.abortSignal
      ? builder.abortSignal(signal ? AbortSignal.any([signal, timeout]) : timeout)
      : builder);
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return { kind: "unavailable" };
    const record = data as Record<string, unknown>;
    if (record.allowed === true) return { kind: "allowed" };
    const retry = record.retryAfterSeconds;
    if (record.allowed === false && typeof retry === "number" && Number.isFinite(retry)) {
      return { kind: "limited", retryAfterSeconds: Math.min(MAX_RETRY_AFTER_SECONDS, Math.max(1, Math.ceil(retry))) };
    }
    return { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}

/** Response for a non-allowed decision, or null when the caller may proceed. */
export function placeQuotaRejection(decision: PlaceQuotaDecision): Response | null {
  if (decision.kind === "allowed") return null;
  const headers: Record<string, string> = { "Cache-Control": "private, no-store" };
  if (decision.kind === "limited") {
    headers["Retry-After"] = String(decision.retryAfterSeconds);
    return Response.json({ error: { code: "RATE_LIMITED" } }, { status: 429, headers });
  }
  return Response.json({ error: { code: "PROVIDER_UNAVAILABLE" } }, { status: 503, headers });
}

/** Consume one unit and return a rejection Response, or null when allowed. */
export async function enforcePlaceQuota(
  client: QuotaRpcClient,
  bucket: PlaceQuotaBucket,
  signal?: AbortSignal,
): Promise<Response | null> {
  return placeQuotaRejection(await consumePlaceQuota(client, bucket, signal));
}
