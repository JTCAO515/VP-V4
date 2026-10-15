import { createHash } from "node:crypto";
import { ownExact, record } from "../runtime-recovery/contract.ts";
import { RuntimeFailure } from "../runtime-recovery/transport.ts";
import { isFailureCode, FAILURE_TAXONOMY } from "../../../lib/server/contracts/errors/index.ts";
import { uuid, integer } from "../../../lib/server/today/recovery/contract.ts";
import type { AskRun, AskSubmission } from "./contract.ts";

export type AskRequest = Readonly<{
  port: "session" | "policy" | "history" | "submit" | "events" | "trip";
  body: AskSubmission | null; turnId: string | null; tripId: string | null; cursor: number | null;
}>;
/** Already-authorized ordinary Native user transport, never a credential provider. */
export type AskTransport = (request: AskRequest, signal: AbortSignal) => Promise<Response>;
export type AskObservation = Readonly<{ port: AskRequest["port"]; status: number | null; bytes: number; sha256: string | null; code: string | null }>;

export function createNativeAskTransport(options: Readonly<{ appOrigin: string; authorizedFetch: typeof fetch }>): AskTransport {
  if (!record(options) || !ownExact(options, ["appOrigin", "authorizedFetch"]) || typeof options.appOrigin !== "string"
    || typeof options.authorizedFetch !== "function") throw new RuntimeFailure("INVALID_INPUT");
  let origin: URL;
  try { origin = new URL(options.appOrigin); } catch { throw new RuntimeFailure("INVALID_INPUT"); }
  if (origin.protocol !== "https:" || origin.origin !== options.appOrigin || origin.username || origin.password) throw new RuntimeFailure("INVALID_INPUT");
  const app = origin.origin, fetcher = options.authorizedFetch;
  return async (request, signal) => {
    if (!record(request) || !ownExact(request, ["port", "body", "turnId", "tripId", "cursor"]) || typeof request.port !== "string"
      || !["session", "policy", "history", "submit", "events", "trip"].includes(request.port)) throw new RuntimeFailure("INVALID_INPUT");
    if (signal.aborted) throw new RuntimeFailure("CANCELLED");
    if ((request.port === "events" ? !uuid(request.turnId) || !integer(request.cursor) : request.turnId !== null || request.cursor !== null)
      || (request.port === "trip" ? !uuid(request.tripId) : request.tripId !== null)
      || (request.port !== "submit" && request.body !== null)) throw new RuntimeFailure("INVALID_INPUT");
    if (request.port === "submit") {
      const b = request.body;
      if (!record(b) || !ownExact(b, ["threadId", "turnId", "idempotencyKey", "policyId", "locale", "city", "text", "serviceTask"])
        || ![b.threadId, b.turnId, b.idempotencyKey, b.policyId].every(uuid) || (b.locale !== "zh" && b.locale !== "en")
        || typeof b.city !== "string" || !["shanghai", "beijing", "guangzhou", "chongqing"].includes(b.city)
        || typeof b.text !== "string" || !b.text.trim() || b.text.length > 4000 || b.text.includes("\0")
        || !record(b.serviceTask) || !ownExact(b.serviceTask, ["id", "scopeVersion", "relationship", "parentTurnId"])
        || !uuid(b.serviceTask.id) || b.serviceTask.id === b.turnId || b.serviceTask.scopeVersion !== 1
        || typeof b.serviceTask.relationship !== "string" || !["new_goal", "clarification", "repair"].includes(b.serviceTask.relationship)
        || (b.serviceTask.relationship === "new_goal" ? b.serviceTask.parentTurnId !== null : !uuid(b.serviceTask.parentTurnId) || b.serviceTask.parentTurnId === b.turnId))
        throw new RuntimeFailure("INVALID_INPUT");
    }
    const paths = { session: "/api/auth/native/v2/session", policy: "/api/chat/native/v4/policy", history: "/api/chat/native/v4/turns",
      submit: "/api/chat/native/v4/turns", events: `/api/chat/native/v4/turns/${request.turnId}/events`, trip: `/api/trips/native/v2/${request.tripId}` };
    return fetcher(app + paths[request.port], { method: request.port === "submit" ? "POST" : "GET", signal, redirect: "error", cache: "no-store",
      ...(request.body ? { body: JSON.stringify(request.body), headers: { "Content-Type": "application/json" } }
        : request.port === "events" ? { headers: { "Last-Event-ID": String(request.cursor) } } : {}) });
  };
}

/** Finite monotonic lifetime, before parsing and at every read/return; no retries. */
export function boundedAskPort(transport: AskTransport, bounds: AskRun["bounds"], signal: AbortSignal, deadline: number) {
  const observations: AskObservation[] = [];
  let requests = 0, totalBytes = 0;
  const check = () => {
    if (performance.now() >= deadline) throw new RuntimeFailure(totalBytes > 0 ? "TIMEOUT_AFTER_OUTPUT" : "TIMEOUT_BEFORE_OUTPUT");
    if (signal.aborted) throw new RuntimeFailure("CANCELLED");
  };
  async function call(request: AskRequest): Promise<unknown> {
    check();
    if (++requests > bounds.maxRequests) throw new RuntimeFailure("RATE_LIMITED");
    // Request content stays in memory. The body is the detached validated native DTO.
    if (Buffer.byteLength(JSON.stringify(request)) > 16384) throw new RuntimeFailure("INVALID_INPUT");
    let status: number | null = null, bytes = 0, digest: string | null = null;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined, abort = () => {};
    const interrupted = new Promise<never>((_, reject) => {
      abort = () => reject(new RuntimeFailure("CANCELLED"));
      signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
    });
    try {
      const pending = Promise.resolve().then(() => { check(); return transport(Object.freeze(request), signal); }).then(response => {
        try { check(); } catch (error) { void response.body?.cancel().catch(() => {}); throw error; } return response;
      });
      const response = await Promise.race([pending, interrupted]); status = response.status;
      const size = response.headers.get("content-length");
      if (size !== null && (!/^\d+$/.test(size) || Number(size) > bounds.maxResponseBytes)) {
        void response.body?.cancel().catch(() => {}); throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
      }
      const mime = response.headers.get("content-type")?.split(";")[0].trim();
      if (mime !== (response.ok && request.port === "events" ? "text/event-stream" : "application/json")) {
        void response.body?.cancel().catch(() => {}); throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
      }
      reader = response.body?.getReader(); const chunks: Uint8Array[] = [];
      let reads = 0, emptyReads = 0;
      if (reader) for (;;) {
        check(); if (++reads > bounds.maxReads) throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
        const chunk = await Promise.race([reader.read(), interrupted]); check();
        if (chunk.done) break;
        if (!(chunk.value instanceof Uint8Array)) throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
        if (!chunk.value.byteLength) { if (++emptyReads > bounds.maxEmptyReads) throw new RuntimeFailure("MODEL_OUTPUT_INVALID"); continue; }
        bytes += chunk.value.byteLength; totalBytes += chunk.value.byteLength;
        if (bytes > bounds.maxResponseBytes || totalBytes > bounds.maxTotalBytes) throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
        chunks.push(chunk.value);
      }
      const body = Buffer.concat(chunks); digest = createHash("sha256").update(body).digest("hex");
      let data: unknown;
      try { const text = new TextDecoder("utf-8", { fatal: true }).decode(body); data = response.ok && request.port === "events" ? text : JSON.parse(text); }
      catch { throw new RuntimeFailure("MODEL_OUTPUT_INVALID"); }
      check();
      if (!response.ok) {
        const value = record(data) && record(data.error) ? data.error.code : null;
        throw new RuntimeFailure(isFailureCode(value) && FAILURE_TAXONOMY[value].httpStatus === status ? value
          : value === "SESSION_REPLACED" && status === 401 ? "UNAUTHENTICATED" : "PROVIDER_UNAVAILABLE");
      }
      observations.push(Object.freeze({ port: request.port, status, bytes, sha256: digest, code: null })); return data;
    } catch (error) {
      const code = error instanceof RuntimeFailure && isFailureCode(error.code) ? error.code : "PROVIDER_UNAVAILABLE";
      observations.push(Object.freeze({ port: request.port, status, bytes, sha256: digest, code })); throw new RuntimeFailure(code);
    } finally {
      signal.removeEventListener("abort", abort);
      if (reader) { void reader.cancel().catch(() => {}); try { reader.releaseLock(); } catch { /* pending read */ } }
    }
  }
  return { call, check, observations };
}
