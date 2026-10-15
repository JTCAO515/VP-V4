import { isQaCancellationReceipt, type QaCancellationErrorCode } from "../../../qa-agent/cancellation-contract.ts";
import { uuid, record, exact, type Rpc } from "../service.ts";
export class QaCancellationError extends Error {
  readonly code: QaCancellationErrorCode;
  readonly ack: "not_submitted" | "unknown";
  constructor(code: QaCancellationErrorCode, ack: "not_submitted" | "unknown" = "not_submitted") { super(code); this.code=code; this.ack=ack; }
}
/** Only the authenticated owner RPC resolves the original request to a QA Turn.
 * No caller turnId, owner, policy, provider or privileged client participates. */
export function createQaCancellationService(rpc: Rpc) {
  return async (action: "read" | "cancel", sessionId: string, requestId: string, input?: unknown) => {
    if (!uuid(sessionId) || !uuid(requestId) || (action === "cancel" && (!record(input) || !exact(input, [])))) throw new QaCancellationError("INVALID_INPUT");
    // PostgreSQL uuid values serialize canonically; preserve UUID identity while
    // decoding against the same canonical scope, including uppercase URLs.
    sessionId=sessionId.toLowerCase();requestId=requestId.toLowerCase();
    let result;
    try { result = await rpc("qa_cancellation_v1", { p_action: action, p_thread_id: sessionId, p_request_id: requestId }); }
    catch (error) { if(error instanceof QaCancellationError)throw error; throw new QaCancellationError("PROVIDER_UNAVAILABLE", "unknown"); }
    if (result.error) {
      const message = result.error.message;
      if (/UNAUTHENTICATED|SESSION_REPLACED/.test(message)) throw new QaCancellationError("UNAUTHENTICATED");
      if (/FORBIDDEN/.test(message)) throw new QaCancellationError("FORBIDDEN");
      if (/INVALID_INPUT/.test(message)) throw new QaCancellationError("INVALID_INPUT");
      throw new QaCancellationError("PROVIDER_UNAVAILABLE", "unknown");
    }
    if (!isQaCancellationReceipt(result.data, { sessionId, requestId })) throw new QaCancellationError("PROVIDER_UNAVAILABLE", "unknown");
    return result.data;
  };
}
