import { createHash } from "node:crypto";
import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import type { CostGuard } from "../../model-gateway/budget/index.ts";
import { inspectWav } from "./wav.ts";

type Budget = Extract<ReturnType<CostGuard["startTurn"]>, { kind: "turn" }>;
type Common = Readonly<{ requestId: string; dataClass: "c0_synthetic"; locale: "zh" | "en"; timeoutMs: number }>;
export type SpeechRequest = Common & (Readonly<{ task: "asr"; wav: Uint8Array }> | Readonly<{ task: "tts"; text: string }>);
export const SPEECH_ENDPOINTS = Object.freeze({ asr: "https://api.openai.com/v1/audio/transcriptions", tts: "https://api.openai.com/v1/audio/speech" });
export const SPEECH_MODELS = Object.freeze({ asr: "whisper-1", tts: "tts-1" });
/** Caller supplies an endpoint-bound transport. No default fetch, credential, retry or log.
 * Must preserve endpoint/model/body and abort signal, refuse redirects and avoid media logs.
 * This C0 port never confers user-data authority or registers a qualified ModelGateway model.
 */
export type SpeechTransport = (request: Readonly<{ endpoint: string; method: "POST"; body: FormData | string; signal: AbortSignal }>) => Promise<Response>;
export type SpeechUsage = Readonly<{ type: "duration"; seconds: number }>;
export type SpeechReceipt = Readonly<{
  schemaVersion: "synthetic-speech/1"; requestId: string; task: "asr" | "tts"; locale: "zh" | "en";
  provider: "openai"; model: string; endpoint: string; inputSha256: string; dispatched: boolean;
  inputSeconds: number | null; inputCharacters: number | null; outputSeconds: number | null;
  firstResponseByteMs: number | null; usage: SpeechUsage | null; cost: "unknown";
  localPersistence: "none"; providerRetention: "unknown"; providerDeletion: "not_verified";
  upstreamCancellation: "not_verified"; userCapability: "disabled";
}>;
type Code = "INVALID_INPUT" | "DATA_POLICY_BLOCKED" | "BUDGET_EXHAUSTED" | "TIMEOUT_BEFORE_OUTPUT" | "PROVIDER_UNAVAILABLE" | "MODEL_OUTPUT_INVALID" | "CANCELLED";
export type SpeechOutcome = Readonly<{ kind: "candidate"; task: "asr"; transcript: string; receipt: SpeechReceipt }>
  | Readonly<{ kind: "candidate"; task: "tts"; wav: Uint8Array; receipt: SpeechReceipt }>
  | Readonly<{ kind: "unavailable"; code: Code; receipt: SpeechReceipt | null }>;

/** C0 synthetic operator invocation only, like synthetic-vision. CostGuard limits attempts/time;
 * monetary reservation and reconciliation remain the enclosing operator's responsibility.
 * Returned WAV is caller-owned ephemeral output, never a cache/playback/persistence grant.
 */
export async function invokeSyntheticSpeech(raw: SpeechRequest, budget: Budget, transport: SpeechTransport, signal: AbortSignal): Promise<SpeechOutcome> {
  const fail = (code: Code, receipt: SpeechReceipt | null = null): SpeechOutcome => ({ kind: "unavailable", code, receipt });
  const snapshot = snapshotRequest(raw);
  if (typeof window !== "undefined" || !snapshot) return fail("INVALID_INPUT");
  raw = snapshot;
  if (raw.dataClass !== "c0_synthetic") return fail("DATA_POLICY_BLOCKED");
  if (!validRequest(raw) || !(signal instanceof AbortSignal) || typeof transport !== "function"
    || !budget || typeof budget.admitModelStep !== "function") return fail("INVALID_INPUT");
  const started = performance.now(), deadline = started + raw.timeoutMs;
  // Snapshot admitted input before any await; caller mutation cannot alter digest or payload.
  const task = raw.task, locale = raw.locale, requestId = raw.requestId;
  const input = raw.task === "asr" ? Buffer.from(raw.wav) : Buffer.from(raw.text, "utf8");
  const text = raw.task === "tts" ? raw.text : null;
  const audio = task === "asr" ? inspectWav(input) : null;
  if (task === "asr" && (!audio || audio.silent)) { input.fill(0); return fail("INVALID_INPUT"); }
  const base = {
    schemaVersion: "synthetic-speech/1" as const, requestId, task, locale, provider: "openai" as const,
    model: SPEECH_MODELS[task], endpoint: SPEECH_ENDPOINTS[task], inputSha256: createHash("sha256").update(input).digest("hex"),
    inputSeconds: audio?.seconds ?? null, inputCharacters: text === null ? null : [...text].length,
    cost: "unknown" as const, localPersistence: "none" as const, providerRetention: "unknown" as const,
    providerDeletion: "not_verified" as const, upstreamCancellation: "not_verified" as const, userCapability: "disabled" as const,
  };
  let dispatched = false, usage: SpeechUsage | null = null, outputSeconds: number | null = null, firstResponseByteMs: number | null = null;
  const receipt = (): SpeechReceipt => Object.freeze({ ...base, dispatched, usage, outputSeconds, firstResponseByteMs });
  const controller = new AbortController();
  let timedOut = false, timer: ReturnType<typeof setTimeout> | undefined;
  const abort = () => controller.abort();
  const stopped = (): boolean => {
    if (signal.aborted) abort();
    if (controller.signal.aborted) return true;
    if (performance.now() >= deadline) { timedOut = true; abort(); return true; }
    return false;
  };
  const stopCode = (): Code => timedOut ? "TIMEOUT_BEFORE_OUTPUT" : "CANCELLED";
  let interrupt = () => {};
  try {
    if (stopped()) return fail(stopCode(), receipt());
    const admission = budget.admitModelStep();
    if (admission.kind !== "admitted") return fail(admission.kind === "invalid" ? "INVALID_INPUT" : admission.code, receipt());
    let body: FormData | string;
    if (task === "asr") {
      body = new FormData();
      body.set("file", new Blob([input], { type: "audio/wav" }), "synthetic.wav");
      body.set("model", base.model); body.set("language", locale); body.set("response_format", "verbose_json"); body.set("temperature", "0");
    } else {
      // Input is read-aloud data, never added as system instructions or translated.
      body = JSON.stringify({ model: base.model, input: text, voice: "alloy", response_format: "wav", speed: 1 });
    }
    signal.addEventListener("abort", abort, { once: true });
    const stop = new Promise<SpeechOutcome>(resolve => {
      interrupt = () => resolve(fail(timedOut ? "TIMEOUT_BEFORE_OUTPUT" : "CANCELLED", receipt()));
      controller.signal.addEventListener("abort", interrupt, { once: true });
    });
    timer = setTimeout(() => { timedOut = true; abort(); }, Math.max(0, deadline - performance.now()));
    // Admission/transport preparation could synchronously abort the caller signal.
    if (stopped()) return fail(stopCode(), receipt());
    const work = async (): Promise<SpeechOutcome> => {
      dispatched = true;
      let response: Response;
      try { response = await transport({ endpoint: base.endpoint, method: "POST", body, signal: controller.signal }); }
      catch { return fail(stopped() ? stopCode() : "PROVIDER_UNAVAILABLE", receipt()); }
      if (stopped()) { void response.body?.cancel().catch(() => {}); return fail(stopCode(), receipt()); }
      const mime = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      if (response.status !== 200 || response.redirected || !response.body
        || (task === "asr" ? mime !== "application/json" : !["audio/wav", "audio/x-wav"].includes(mime ?? ""))) {
        void response.body?.cancel().catch(() => {}); return fail("PROVIDER_UNAVAILABLE", receipt());
      }
      const bytes = await readBounded(response, controller.signal, task === "asr" ? 65536 : 2_880_128, () => {
        firstResponseByteMs = Math.max(0, performance.now() - started);
      }, stopped);
      try {
        if (stopped()) return fail(stopCode(), receipt());
        if (task === "tts") {
          const wav = inspectWav(bytes);
          if (!wav || wav.silent) return fail("MODEL_OUTPUT_INVALID", receipt());
          const output = Uint8Array.from(bytes);
          if (stopped()) { output.fill(0); return fail(stopCode(), receipt()); }
          outputSeconds = wav.seconds;
          return { kind: "candidate", task, wav: output, receipt: receipt() };
        }
        const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        if (!record(value)) return fail("MODEL_OUTPUT_INVALID", receipt());
        if (Object.hasOwn(value, "usage")) {
          if (!record(value.usage) || Object.keys(value.usage).length !== 2 || value.usage.type !== "duration"
            || !finiteSeconds(value.usage.seconds)) return fail("MODEL_OUTPUT_INVALID", receipt());
          usage = Object.freeze({ type: "duration", seconds: value.usage.seconds });
        }
        if (value.error != null || value.refusal != null || value.partial != null || value.finish_reason != null
          || value.task !== "transcribe" || value.language !== (locale === "zh" ? "chinese" : "english")
          || !finiteSeconds(value.duration) || Math.abs(value.duration - audio!.seconds) > 0.1
          || !validText(value.text, 8000) || !validSegments(value)) return fail("MODEL_OUTPUT_INVALID", receipt());
        if (stopped()) return fail(stopCode(), receipt());
        return { kind: "candidate", task, transcript: value.text, receipt: receipt() };
      } finally { bytes.fill(0); }
    };
    return await Promise.race([work(), stop]);
  } catch {
    return fail(stopped() ? stopCode() : "MODEL_OUTPUT_INVALID", receipt());
  } finally {
    clearTimeout(timer); signal.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", interrupt); controller.abort(); input.fill(0);
  }
}

function validRequest(raw: SpeechRequest): boolean {
  const keys = ["requestId", "dataClass", "locale", "timeoutMs", "task", raw.task === "asr" ? "wav" : "text"];
  if (Reflect.ownKeys(raw).length !== keys.length || !keys.every(key => Object.hasOwn(raw, key))
    || typeof raw.requestId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(raw.requestId)
    || !["zh", "en"].includes(raw.locale) || !Number.isSafeInteger(raw.timeoutMs) || raw.timeoutMs < 1 || raw.timeoutMs > 60000) return false;
  return raw.task === "asr" ? raw.wav instanceof Uint8Array && raw.wav.length <= 2_880_128
    : raw.task === "tts" && validText(raw.text, 2000);
}
/** Inspect descriptors before reading fields: symbols, hidden extra keys, inherited
 * fields and accessors cannot sneak authority/configuration into the closed request.
 * Snapshot data fields once; a throwing proxy is invalid input, not an escape.
 */
function snapshotRequest(raw: unknown): SpeechRequest | null {
  try {
    if (!record(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) return null;
    const keys = Reflect.ownKeys(raw), descriptors = Object.getOwnPropertyDescriptors(raw);
    if (keys.some(key => typeof key !== "string" || !Object.hasOwn(descriptors[key], "value"))) return null;
    const task = descriptors.task?.value;
    const allowed = ["requestId", "dataClass", "locale", "timeoutMs", "task", task === "asr" ? "wav" : "text"];
    if (keys.length !== allowed.length || keys.some(key => !allowed.includes(String(key)))) return null;
    return Object.freeze(Object.fromEntries(allowed.map(key => [key, descriptors[key].value]))) as SpeechRequest;
  } catch { return null; }
}
function validText(value: unknown, max: number): value is string {
  return typeof value === "string" && !!value.trim() && value.length <= max
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) && value.isWellFormed();
}
function finiteSeconds(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 60; }
/** Optional verbose segments must be bounded, ordered and agree with the returned text.
 * These checks do not certify acoustic completeness or recognition accuracy.
 */
function validSegments(value: Record<string, unknown>): boolean {
  if (!Object.hasOwn(value, "segments")) return true;
  if (!Array.isArray(value.segments) || !value.segments.length || value.segments.length > 256) return false;
  let end = 0;
  const texts: string[] = [];
  for (const segment of value.segments) {
    if (!record(segment) || typeof segment.start !== "number" || !Number.isFinite(segment.start) || segment.start < end
      || !finiteSeconds(segment.end) || segment.end <= segment.start || segment.end > Number(value.duration) + 0.1
      || !validText(segment.text, 8000)) return false;
    end = segment.end; texts.push(segment.text);
  }
  return texts.join("").trim() === String(value.text).trim();
}
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
async function readBounded(response: Response, signal: AbortSignal, limit: number, firstByte: () => void, stopped: () => boolean): Promise<Buffer> {
  const reader = response.body!.getReader(), chunks: Uint8Array[] = [];
  const cancel = () => { void reader.cancel().catch(() => {}); };
  let size = 0, reads = 0, emptyReads = 0;
  signal.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      if (stopped()) throw new Error("Interrupted");
      if (++reads > 4096) throw new Error("Read limit");
      const { done, value } = await reader.read();
      if (stopped()) { value?.fill(0); throw new Error("Interrupted"); }
      if (done) break;
      if (!value.byteLength) {
        if (++emptyReads > 64) throw new Error("Empty read limit");
      } else {
        if (size === 0) firstByte();
        size += value.byteLength;
        if (size > limit) { value.fill(0); throw new Error("Response limit"); }
        chunks.push(value);
      }
      // Bound microtask runs so external abort/timers can run even for queued reads.
      if (reads % 64 === 0) await yieldToEventLoop();
    }
    return Buffer.concat(chunks);
  } finally {
    cancel(); signal.removeEventListener("abort", cancel); reader.releaseLock();
    for (const chunk of chunks) chunk.fill(0);
  }
}
