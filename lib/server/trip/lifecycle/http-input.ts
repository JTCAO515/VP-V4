import { isLifecycleCommand, uuid, revision, type LifecycleCommand } from "./contract.ts";
import type { nativeRequestScope } from "../../identity/native-request.ts";

/** Decode once with fatal UTF-8, so the receipt hashes the actual received bytes. */
export async function lifecycleRawBody(request: Request, scope: ReturnType<typeof nativeRequestScope>): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let count = 0;
  try {
    for (;;) {
      const value = await scope.run(() => reader.read());
      if (value.done) break;
      count += value.value.byteLength;
      if (count > 32768) return null;
      chunks.push(value.value);
    }
    try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks)); }
    catch { return null; }
  } finally {
    try { void reader.cancel().catch(() => {}); } catch { /* do not wait for cancellation */ }
    try { reader.releaseLock(); } catch { /* hostile reader may retain a lock */ }
  }
}

export function lifecyclePageInput(params: URLSearchParams): Record<string, unknown> | null {
  if ([...params].length === 0) return {};
  if ([...params].length !== 2 || params.getAll("afterTripId").length !== 1 || params.getAll("expectedRevision").length !== 1) return null;
  const afterTripId = params.get("afterTripId"), raw = params.get("expectedRevision");
  if (!uuid(afterTripId) || raw === null || !/^(0|[1-9][0-9]{0,15})$/.test(raw) || !revision(Number(raw))) return null;
  return { afterTripId, expectedRevision: Number(raw) };
}
export function lifecycleBody(bytes: string | null): LifecycleCommand | null {
  if (!bytes || Buffer.byteLength(bytes, "utf8") > 32768 || bytes.charCodeAt(0) === 0xfeff) return null;
  try { const value: unknown = JSON.parse(bytes); return isLifecycleCommand(value) ? value : null; }
  catch { return null; }
}
export function lifecycleStatus(code: string): number {
  if (code === "INVALID_INPUT") return 400;
  if (["UNAUTHENTICATED", "SESSION_REPLACED"].includes(code)) return 401;
  if (code === "FORBIDDEN") return 403;
  return code === "UNAVAILABLE" ? 503 : 409;
}
