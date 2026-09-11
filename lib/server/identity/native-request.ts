import { nativeFetch } from "./native-fetch.ts";

/** Request-local lifetime; no retry, identity, endpoint or credential authority. */
export function nativeRequestScope(requestSignal: AbortSignal, milliseconds = 10_000) {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 1 || milliseconds > 10_000) throw new Error("Native request unavailable.");
  const controller = new AbortController();
  const expiresAt = Date.now() + milliseconds;
  const abort = () => controller.abort();
  const timer = setTimeout(abort, milliseconds);
  requestSignal.addEventListener("abort", abort, { once: true });
  if (requestSignal.aborted) abort();
  function check() {
    if (Date.now() >= expiresAt) abort();
    if (controller.signal.aborted) throw new Error("Native request unavailable.");
  }
  function run<T>(work: () => PromiseLike<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const cancelled = () => reject(new Error("Native request unavailable."));
      controller.signal.addEventListener("abort", cancelled, { once: true });
      const finish = () => controller.signal.removeEventListener("abort", cancelled);
      try {
        check();
        Promise.resolve(work()).then(value => {
          try { check(); resolve(value); } catch (error) { reject(error); }
        }, reject).finally(finish);
      } catch (error) { finish(); reject(error); }
    });
  }
  const fetcher: typeof fetch = (input, init) => {
    const signals = [controller.signal];
    if (input instanceof Request) signals.push(input.signal);
    if (init?.signal) signals.push(init.signal);
    return run(async () => {
      let response: Response;
      try { response = await nativeFetch(input, { ...init, signal: AbortSignal.any(signals) }); }
      catch (error) {
        // A network/redirect failure is not a credential denial. Stop later SDK
        // network retries;503 does not delete the caller's stored attempt.
        abort(); throw error;
      }
      if (response.status === 429 || response.status >= 500) {
        abort();
        try { void response.body?.cancel().catch(() => {}); } catch { /* already closed */ }
      }
      try { check(); } catch (error) {
        try { void response.body?.cancel().catch(() => {}); } catch { /* already closed */ }
        throw error;
      }
      // Auth consumes JSON after fetch resolves. Mark a broken response body
      // before the SDK can turn it into a denial or retry a refresh mutation.
      const readJson = response.json.bind(response);
      response.json = () => run(async () => {
        try { return await readJson(); } catch (error) { abort(); throw error; }
      });
      return response;
    });
  };
  async function body(request: Request, maximumBytes = 60_000): Promise<string | null> {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > 192_000) throw new Error("Native request unavailable.");
    check();
    const reader = request.body?.getReader();
    if (!reader) return "";
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const next = await run(() => reader.read());
        if (next.done) break;
        bytes += next.value.byteLength;
        // Identity uses60k bytes; Trip uses192k for its existing64k UTF-16 limit.
        if (bytes > maximumBytes) return null;
        chunks.push(next.value);
      }
      return new TextDecoder().decode(Buffer.concat(chunks));
    } finally {
      // Cancellation may itself hang; it cannot hold the HTTP response open.
      try { void reader.cancel().catch(() => {}); } catch { /* already closed */ }
      try { reader.releaseLock(); } catch { /* a hostile pending reader may retain its lock */ }
    }
  }
  return { signal: controller.signal, check, run, fetch: fetcher, body, unavailable: abort,
    dispose() { clearTimeout(timer); requestSignal.removeEventListener("abort", abort); abort(); },
  };
}
