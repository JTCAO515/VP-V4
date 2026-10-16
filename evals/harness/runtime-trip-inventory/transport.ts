import { createHash } from "node:crypto";
import { RuntimeFailure } from "../runtime-recovery/transport.ts";
import { createNativeAskTransport, type AskRequest, type AskTransport } from "../runtime-ask/transport.ts";
import type { AskRun } from "../runtime-ask/contract.ts";
export type InventoryRequest = Readonly<{ port: "inventory" }>;
export type InventoryTransport = (request: AskRequest | InventoryRequest, signal: AbortSignal) => Promise<Response>;
export type InventoryObservation = Readonly<{ port: AskRequest["port"] | "inventory"; status: number | null; bytes: number; sha256: string | null }>;
/** Explicit caller-authorized ordinary Native transport. No credential lookup/default network. */
export function createNativeInventoryTransport(options: Readonly<{ allowedOrigin: string; authorizedFetch: typeof fetch }>): InventoryTransport {
  if (!options || Object.keys(options).sort().join(",") !== "allowedOrigin,authorizedFetch" || typeof options.authorizedFetch !== "function") throw new RuntimeFailure("INVALID_INPUT");
  const ask = createNativeAskTransport({ appOrigin: options.allowedOrigin, authorizedFetch: options.authorizedFetch });
  const { allowedOrigin, authorizedFetch } = options;
  return (request, signal) => {
    if (request.port !== "inventory") return ask(request, signal);
    if (Object.keys(request).join(",") !== "port" || signal.aborted) throw new RuntimeFailure(signal.aborted ? "CANCELLED" : "INVALID_INPUT");
    return authorizedFetch(allowedOrigin + "/api/trips/native/v2/inventory", { method: "GET", signal, redirect: "error", cache: "no-store" });
  };
}
/** Shared, finite network accounting for both snapshots AND every original Ask request. */
export function inventoryBudget(transport: InventoryTransport, bounds: AskRun["bounds"], signal: AbortSignal, deadline: number) {
  let requests = 0, totalBytes = 0;
  const observations: InventoryObservation[] = [];
  const check = () => {
    if (performance.now() >= deadline) throw new RuntimeFailure(totalBytes ? "TIMEOUT_AFTER_OUTPUT" : "TIMEOUT_BEFORE_OUTPUT");
    if (signal.aborted) throw new RuntimeFailure("CANCELLED");
  };
  async function call(request: AskRequest | InventoryRequest, innerSignal: AbortSignal = signal): Promise<Response> {
    check(); if (++requests > bounds.maxRequests) throw new RuntimeFailure("RATE_LIMITED");
    const combined = AbortSignal.any([signal, innerSignal]);
    let rejectAbort = () => {}, reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const interrupted = new Promise<never>((_, reject) => { rejectAbort = () => reject(new RuntimeFailure("CANCELLED")); combined.addEventListener("abort", rejectAbort, { once: true }); if (combined.aborted) rejectAbort(); });
    let status: number | null = null, bytes = 0, sha256: string | null = null;
    try {
      const pending = Promise.resolve().then(() => { check(); return transport(request, combined); }).then(response => {
        try { check(); if (combined.aborted) throw new RuntimeFailure("CANCELLED"); }
        catch (error) { void response.body?.cancel().catch(() => {}); throw error; } return response;
      });
      const response = await Promise.race([pending, interrupted]); status = response.status;
      const mime = response.headers.get("content-type")?.split(";")[0].trim();
      if (response.redirected || (response.url && new URL(response.url).protocol !== "https:")
        || mime !== (response.ok && request.port === "events" ? "text/event-stream" : "application/json")) {
        void response.body?.cancel().catch(() => {}); throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
      }
      const size = response.headers.get("content-length");
      if (size !== null && (!/^\d+$/.test(size) || Number(size) > bounds.maxResponseBytes)) { void response.body?.cancel().catch(() => {}); throw new RuntimeFailure("MODEL_OUTPUT_INVALID"); }
      reader = response.body?.getReader(); const chunks: Uint8Array[] = []; let reads = 0, empty = 0;
      if (reader) for (;;) {
        check(); if (++reads > bounds.maxReads) throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
        const chunk = await Promise.race([reader.read(), interrupted]); check(); if (combined.aborted) throw new RuntimeFailure("CANCELLED");
        if (chunk.done) break;
        if (!(chunk.value instanceof Uint8Array)) throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
        if (!chunk.value.byteLength && ++empty > bounds.maxEmptyReads) throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
        bytes += chunk.value.byteLength; totalBytes += chunk.value.byteLength;
        if (bytes > bounds.maxResponseBytes || totalBytes > bounds.maxTotalBytes) throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
        chunks.push(chunk.value);
      }
      const body = Buffer.concat(chunks); new TextDecoder("utf-8", { fatal: true }).decode(body);
      sha256 = createHash("sha256").update(body).digest("hex"); check();
      return new Response(body, { status: response.status, headers: { "Content-Type": mime! } });
    } finally {
      observations.push(Object.freeze({ port: request.port, status, bytes, sha256 }));
      combined.removeEventListener("abort", rejectAbort);
      if (reader) { void reader.cancel().catch(() => {}); try { reader.releaseLock(); } catch { /* pending read */ } }
    }
  }
  return { call, check, observations, get requests() { return requests; }, get bytes() { return totalBytes; } };
}
export type { AskTransport };
