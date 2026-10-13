import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeFixture, subject, sessionId } from '../../identity/native-fixture.ts';
import { readOriginalMaterialOutcome } from '../../../../lib/server/journey-entry/material-outcome/runtime.ts';
import { createOriginalMaterialReads } from '../../../../lib/server/journey-entry/material-outcome/original-reads.ts';
import { pdfDigest } from '../../../../lib/server/intake/pdf/contract.ts';
import { pdfRequestDigest } from '../../../../lib/server/intake/pdf/repository.ts';
const id = (n: number) => `a2231057-860d-46be-a099-${String(n).padStart(12, '0')}`;
const source = { kind: 'native_entry', logicalId: id(1), entry: 'e2', anchor: { kind: 'trip', tripId: id(2), tripVersion: 0, medium: 'pdf' } };

for (const mode of ['complete', 'archived', 'archive_during_read', 'later_head', 'missing_idempotency', 'oversize', 'epoch_changed'] as const)
  test(`ordinary authenticated adapter ${mode}: only original read RPCs, same JWT and exact source`, async t => {
    const f = await nativeFixture(t); const originalFetch = globalThis.fetch;
    const expiresAt = new Date(Date.now() + 3600000).toISOString();
    const command = { operationId: id(3), expectedHeadVersion: 0, contentHash: 'a'.repeat(64), byteCount: 200, pageCount: 1,
      extraction: 'pdfkit_text', expiresAt, fields: [{ kind: 'date', value: '2026-10-14', locator: { page: 1, line: 1, sourceTextHash: 'b'.repeat(64) } }] };
    const bytes = JSON.stringify({ command, reviewedPreviewDigest: 'c'.repeat(64) });
    const selection = { actor: { ownerId: subject, sessionId, mobileEpoch: 1 }, source, boundary: 'before_material_read', state: 'current',
      expiresAt, originalProposalBytes: bytes, presentation: 'unknown' };
    const operation = { kind: 'pdf_intake_operation/1', operationId: id(3), tripId: id(2), sessionEpoch: 1, state: 'confirmed',
      requestDigest: pdfRequestDigest(bytes), commandDigest: pdfDigest(command), previewDigest: 'c'.repeat(64), expiresAt,
      proposalId: id(6), proposalRevision: 1, baseTripVersion: 0, confirmationEventId: id(7), resultingVersion: 1 };
    const seen: { path: string; method: string; body: unknown }[] = []; let archiveReads = 0; let actorReads = 0;
    t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init); const url = new URL(req.url);
      if (url.pathname.startsWith('/auth/')) return originalFetch(input, init);
      assert.equal(url.origin, f.config.url); assert.equal(req.headers.get('authorization'), `Bearer ${f.token}`);
      assert.equal(req.headers.get('apikey'), f.config.publishableKey); assert.equal(init?.redirect, 'error');
      const body: unknown = req.method === 'POST' ? await req.json() : null;
      seen.push({ path: url.pathname, method: req.method, body });
      if (mode === 'oversize') return new Response('x'.repeat(65537));
      if (url.pathname.endsWith('/rpc/native_session_v2')) {
        assert.deepEqual(body, { p_action: 'session' });
        return Response.json({ version: 2, subject, sessionId, mobileEpoch: mode === 'epoch_changed' && ++actorReads > 1 ? 2 : 1 });
      }
      if (url.pathname.endsWith('/rpc/pdf_intake_v1')) {
        assert.deepEqual(body, { p_action: 'operation', p_trip_id: id(2), p_input_bytes: JSON.stringify({ operationId: id(3) }), p_expected_epoch: 1 });
        return Response.json(operation);
      }
      assert.equal(req.method, 'GET');
      if (url.pathname.endsWith('/trips')) return Response.json([{ id: id(2), title: 'Original saved Trip', head_version: mode === 'later_head' ? 2 : 1, updated_at: expiresAt }]);
      if (url.pathname.endsWith('/trip_archives')) return Response.json(mode === 'archived' || mode === 'archive_during_read' && ++archiveReads === 2
        ? [{ trip_id: id(2), archived_version: 1, archived_at: expiresAt }] : []);
      if (url.pathname.endsWith('/trip_audit_events') || url.pathname.endsWith('/memory_consumer_receipts')) return Response.json([]);
      if (url.pathname.endsWith('/trip_events')) return Response.json([{ id: id(7), proposal_id: id(6), resulting_version: 1, event_type: 'proposal_applied', created_at: expiresAt }]);
      if (url.pathname.endsWith('/trip_version_snapshots')) return Response.json([0, 1].map(version => ({ version, title: 'Original saved Trip', content: { title: 'Original saved Trip', days: [] }, created_at: expiresAt })));
      if (url.pathname.endsWith('/trip_idempotency')) return Response.json(mode === 'missing_idempotency' ? [] : [{ proposal_id: id(6), resulting_version: 1 }]);
      if (url.pathname.endsWith('/trip_proposals')) return Response.json([{ id: id(6), trip_id: id(2), base_trip_version: 0, status: 'applied' }]);
      throw Error('unexpected adapter endpoint');
    });
    const request = new Request('https://app.invalid/internal', { headers: { authorization: `Bearer ${f.token}` } });
    const result = await readOriginalMaterialOutcome(source, request, f.config, async (logicalId, signal) => {
      assert.equal(logicalId, id(1)); assert.equal(signal.aborted, false); return selection;
    });
    assert.equal(result.kind, mode === 'complete' ? 'qualified' : 'unobservable');
    if (result.kind === 'qualified') { assert.equal(result.original.resultingVersion, 1); assert.equal(result.presented, 'unknown'); }
    assert(seen.length > 0);
    assert(seen.every(row => row.method === 'GET' || row.path.endsWith('/rpc/native_session_v2') || row.path.endsWith('/rpc/pdf_intake_v1')));
    assert(!seen.some(row => /confirm|proposal$|preview|cancel|measurement/.test(row.path)));
  });

test('missing protected selection or screenshot refuses before authentication/network; malformed credentials never reach holder', async t => {
  let fetched = 0; let selected = 0;
  t.mock.method(globalThis, 'fetch', async () => { fetched++; throw Error('unexpected network'); });
  const request = new Request('https://app.invalid/internal'); const config = { url: 'https://db.invalid', publishableKey: 'synthetic' };
  assert.equal(await createOriginalMaterialReads(request, config), null);
  assert.deepEqual(await readOriginalMaterialOutcome(source, request, config), { kind: 'unobservable', reason: 'unobservable' });
  assert.deepEqual(await readOriginalMaterialOutcome({ ...source, anchor: { ...source.anchor, medium: 'screenshot' } }, request, config, async () => { selected++; return null; }),
    { kind: 'unobservable', reason: 'unobservable' });
  assert.equal(await createOriginalMaterialReads(request, config, async () => { selected++; return null; }), null);
  assert.equal(fetched, 0); assert.equal(selected, 0);
});

test('per-read cancellation aborts underlying authenticated transport; disposal prevents subsequent reads', async t => {
  const f = await nativeFixture(t); const originalFetch = globalThis.fetch;
  let started = false; let aborted = false; let startRead!: () => void;
  const ready = new Promise<void>(resolve => { startRead = resolve; });
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    if (new URL(req.url).pathname.startsWith('/auth/')) return originalFetch(input, init);
    started = true; startRead();
    return new Promise<Response>((_, reject) => req.signal.addEventListener('abort', () => { aborted = true; reject(Error('cancelled')); }, { once: true }));
  });
  const original = await createOriginalMaterialReads(new Request('https://app.invalid/internal', { headers: { authorization: `Bearer ${f.token}` } }), f.config, async () => null);
  assert(original); t.after(original.dispose);
  const cancel = new AbortController(); const read = original.reads.readActor(cancel.signal);
  await ready; cancel.abort(); await assert.rejects(read); assert.equal(started, true); assert.equal(aborted, true);
  original.dispose(); await assert.rejects(original.reads.readActor(new AbortController().signal));
});
