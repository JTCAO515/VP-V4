import { ASSISTANT_EVENTS_BYTES } from "./protocol.ts";

/** Bound the RPC body before SDK JSON parsing; never admit an oversized response
 * merely because the later allowlist would discard its private/unknown fields. */
export async function boundedAssistantReplayResponse(response: Response): Promise<Response> {
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > ASSISTANT_EVENTS_BYTES)) {
    void response.body?.cancel().catch(() => {});
    throw new Error("Assistant replay capacity");
  }
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    if (reader) for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > ASSISTANT_EVENTS_BYTES) throw new Error("Assistant replay capacity");
      chunks.push(next.value);
    }
    return new Response(Buffer.concat(chunks), { status: response.status, statusText: response.statusText, headers: response.headers });
  } finally {
    if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
}
