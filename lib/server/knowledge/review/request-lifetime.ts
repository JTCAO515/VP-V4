/** One wall-clock budget shared by body, credentials, refresh fetches and RPC. */
export function requestLifetime(requestSignal: AbortSignal, milliseconds = 8000) {
  const controller = new AbortController();
  const expires = Date.now() + milliseconds;
  const abort = () => controller.abort(new Error("OPS_CANCELLED"));
  const timer = setTimeout(() => controller.abort(new Error("OPS_TIMEOUT")), milliseconds);
  requestSignal.addEventListener("abort", abort, { once: true });
  if (requestSignal.aborted) abort();
  function check() {
    if (!controller.signal.aborted && Date.now() >= expires) controller.abort(new Error("OPS_TIMEOUT"));
    if (controller.signal.aborted) throw controller.signal.reason;
  }
  function run<T>(work: () => PromiseLike<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const cancelled = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", cancelled, { once: true });
      const finish = () => controller.signal.removeEventListener("abort", cancelled);
      try {
        check();
        Promise.resolve(work()).then((value) => { try { check(); resolve(value); } catch (error) { reject(error); } }, reject).finally(finish);
      } catch (error) { finish(); reject(error); }
    });
  }
  return {
    signal: controller.signal, check, run,
    dispose() { clearTimeout(timer); requestSignal.removeEventListener("abort", abort); controller.abort(new Error("OPS_CANCELLED")); },
  };
}
export type RequestLifetime = ReturnType<typeof requestLifetime>;
