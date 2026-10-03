import { verifyNativeCredentials } from "../identity/native-credentials.ts";
import { nativeFetch } from "../identity/native-fetch.ts";
import type { AdapterResult } from "../identity/user-data-adapter.ts";

export type OfflineNativeActor = Readonly<{ subject: string; sessionId: string; sessionEpoch: number }>;

/** Existing ordinary JWT + native_session_v2 read authority; never increments an epoch. */
export async function createOfflineNativeAuthority(
  request: Pick<Request, "headers">,
  config: Readonly<{ url: string; publishableKey: string }>,
  transport: typeof fetch = nativeFetch,
  onUnavailable?: () => void,
) {
  const credentials = await verifyNativeCredentials(request, config, transport, onUnavailable);
  if (!credentials) return null;
  return {
    async read(): Promise<AdapterResult<OfflineNativeActor>> {
      const state = await credentials.client.rpc("native_session_v2", { p_action: "session" });
      if (state.error) {
        if (/\b(SESSION_REPLACED|UNAUTHENTICATED)\b/.test(state.error.message)) return { error: "UNAUTHENTICATED" };
        return { error: "PROVIDER_UNAVAILABLE" };
      }
      // Malformed or absent epoch authority is unavailable, never a synthesized epoch.
      const row = state.data;
      if (!row || typeof row !== "object" || Array.isArray(row) || row.version !== 2
        || typeof row.subject !== "string" || typeof row.sessionId !== "string"
        || !Number.isSafeInteger(row.mobileEpoch) || row.mobileEpoch <= 0) return { error: "PROVIDER_UNAVAILABLE" };
      if (row.subject !== credentials.subject || row.sessionId !== credentials.sessionId) return { error: "UNAUTHENTICATED" };
      return { data: { subject: row.subject, sessionId: row.sessionId, sessionEpoch: row.mobileEpoch } };
    },
  };
}
