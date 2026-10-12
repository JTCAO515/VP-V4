import { parseControlJson } from './input-json.ts';
import type { RequestLifetime } from '../../knowledge/review/request-lifetime.ts';

export const CONTROL_MAX_BYTES = 4096;

/** The deployed origin comes from the request URL selected by opsRuntimeConfig.
 * Headers never select a database or an Ops identity. */
export function permitsControlEnvelope(request: Request): boolean {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  if (request.method !== 'POST' || url.search || request.headers.has('authorization')
    || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json'
    || origin !== url.origin) return false;
  const site = request.headers.get('sec-fetch-site');
  return site === null || site === 'same-origin';
}

/** Body bytes, UTF-8, parsing and cancellation share the authentication/RPC budget.
 * Never log a rejected body or return its parser error. */
export async function readControlBody(request: Request, lifetime: RequestLifetime): Promise<unknown> {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^(0|[1-9][0-9]*)$/.test(length) || Number(length) > CONTROL_MAX_BYTES))
    throw new Error('INVALID_INPUT');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('INVALID_INPUT');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await lifetime.run(() => reader.read());
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > CONTROL_MAX_BYTES) throw new Error('INVALID_INPUT');
      chunks.push(chunk.value);
    }
    lifetime.check();
    const bytes = Buffer.concat(chunks);
    // BOM is not part of the accepted JSON envelope.
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new Error('INVALID_INPUT');
    return parseControlJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
