import { createOfflineNativeAuthority } from '../../today/offline-native-authority.ts';
import { createPdfRepository } from '../../intake/pdf/repository.ts';
import { createNativeTripDataAdapter } from '../../identity/user-data-adapter.ts';
import { nativeRequestScope } from '../../identity/native-request.ts';
import type { OriginalMaterialReads } from './consumer.ts';

/** Ordinary authenticated existing sources only. No privileged transport, new RPC,
 * deployment switch, mutation or default source-selection authority. */
export async function createOriginalMaterialReads(request: Pick<Request, 'headers' | 'signal'>,
  config: Readonly<{ url: string; publishableKey: string }>,
  protectedSelection: OriginalMaterialReads['readSelection'] | null = null) {
  if (!protectedSelection) return null;
  const scope = nativeRequestScope(request.signal, 15000);
  async function scoped<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    const abort = () => scope.unavailable();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    try { return await scope.run(work); }
    finally { signal.removeEventListener('abort', abort); }
  }
  // Refuse oversize responses, never truncate source evidence or history.
  const transport: typeof fetch = async (input, init) => scope.run(async () => {
    const response = await scope.fetch(input, init);
    if (!response.body) return response;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const next = await scope.run(() => reader.read());
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > 65536) { scope.unavailable(); throw Error('unavailable'); }
        chunks.push(next.value);
      }
      return new Response(Buffer.concat(chunks), { status: response.status, statusText: response.statusText, headers: response.headers });
    } finally {
      try { void reader.cancel().catch(() => {}); } catch { /* already closed */ }
      try { reader.releaseLock(); } catch { /* pending reader */ }
    }
  });
  try {
    const authority = await createOfflineNativeAuthority(request, config, transport, scope.unavailable);
    const pdf = await createPdfRepository(request, config, transport, scope.unavailable);
    const trips = await createNativeTripDataAdapter(request, config, transport, scope.unavailable);
    if (!authority || !pdf || !trips) { scope.dispose(); return null; }
    const reads: OriginalMaterialReads = {
      async readActor(signal) { return scoped(signal, async () => {
        if (signal.aborted) return null;
        const value = await authority.read(); scope.check();
        return 'error' in value ? null : { ownerId: value.data.subject, sessionId: value.data.sessionId, mobileEpoch: value.data.sessionEpoch };
      }); },
      // No protected original PDF guarded-selection handoff is installed in this
      // base. Main must compose that original Native holder; caller JSON cannot fill it.
      async readSelection(logicalId, signal) { return scoped(signal, async () => {
        if (!protectedSelection || signal.aborted) return null;
        const value = await scope.run(() => protectedSelection(logicalId, AbortSignal.any([scope.signal, signal])));
        scope.check(); return value;
      }); },
      async readPdfOperation(tripId, operationId, actor, signal) { return scoped(signal, async () => {
        if (signal.aborted) return null;
        const value = await pdf.operation('operation', tripId, JSON.stringify({ operationId }), operationId,
          { subject: actor.ownerId, sessionId: actor.sessionId, sessionEpoch: actor.mobileEpoch });
        scope.check(); return 'error' in value ? null : value.data;
      }); },
      async readTrip(tripId, signal) { return scoped(signal, async () => {
        if (signal.aborted) return null;
        const archived = await trips.readArchive(tripId);
        if ('error' in archived || archived.data) return null;
        const value = await trips.getTrip(tripId);
        scope.check();
        if ('error' in value || value.data.versions.length > 64) return null;
        const archiveAgain = await trips.readArchive(tripId);
        scope.check();
        if ('error' in archiveAgain || archiveAgain.data) return null;
        return { tripId: value.data.trip.id,
          snapshot: { version: value.data.trip.headVersion, title: value.data.trip.title, days: value.data.content.days },
          confirmationState: value.data.confirmationState,
          versions: value.data.versions.map(({ id, proposalId, resultingVersion, eventType }) => ({ id, proposalId, resultingVersion, eventType })) };
      }); },
    };
    return { reads, dispose: scope.dispose };
  } catch { scope.dispose(); return null; }
}
