import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_VERSION, MODULE_CATALOG, moduleById } from '../../../../lib/server/privacy/coverage/catalog.ts';
import { parseCoverageInput } from '../../../../lib/server/privacy/coverage/contract.ts';
import { ownerHandlerRequest, OWNER_HANDLERS } from '../../../../lib/server/privacy/coverage/registry.ts';
import { handleCoverage } from '../../../../lib/server/privacy/coverage/http.ts';
import { matchesCoverageResult } from '../../../../lib/server/privacy/coverage/consumer.ts';
import { collectArchiveExport } from '../../../../lib/server/privacy/archive-data/export.ts';
import { id, now, actor, selection, command, bytes, rpcSource, request } from './fixtures.mjs';
const envelope = value => ({ schemaVersion: 'data-coverage/1', catalogVersion: CATALOG_VERSION, actorId: actor.ownerId, sessionId: actor.sessionId, mobileEpoch: actor.mobileEpoch,
  moduleId: 'archive', moduleVersion: 'archive-data/1', operationId: selection.requestId, action: 'export', phase: 'execute', confirmed: true, tripId: selection.tripId,
  commandBytes: typeof value === 'string' ? value : JSON.stringify(value) });

test('archive keeps original denominator and routes selected Trip deletion to the original engine', async () => {
  assert.equal(MODULE_CATALOG.length, 34); assert.equal(moduleById('archive').exportHandler, 'archive_data');
  assert.equal(moduleById('case_attachments').exportHandler, null); assert.ok(moduleById('pdf_intake').missing.includes('original_pdf_bytes'));
  const selected = parseCoverageInput(envelope(bytes)); assert.equal(selected.handler, 'archive_data'); assert.ok(OWNER_HANDLERS[selected.handler]);
  const deletion = { requestId: selection.requestId, tripId: selection.tripId, expectedVersion: 1, confirmed: true };
  const input = { ...envelope(deletion), action: 'delete' }; const original = parseCoverageInput(input);
  assert.equal(original.handler, 'trip');
  const forwarded = ownerHandlerRequest(request(bytes), original, new AbortController().signal);
  assert.equal(new URL(forwarded.url).pathname, '/api/privacy/native/v1/trips'); assert.equal(await forwarded.text(), input.commandBytes);
  const recovery = ownerHandlerRequest(request(bytes), parseCoverageInput({ ...input, phase: 'recover' }), new AbortController().signal);
  assert.equal(recovery.method, 'GET'); assert.equal(new URL(recovery.url).searchParams.get('requestId'), selection.requestId);
  assert.equal(parseCoverageInput({ ...envelope(command), action: 'delete' }), null, 'archive content endpoint cannot delete a Trip');
  assert.equal(parseCoverageInput({ ...envelope(command), moduleId: 'lifecycle' }), null);
});

test('registered source proof stays partial and exact request/actor correlation cannot be promoted by the wrapper', async () => {
  const signal = new AbortController().signal;
  const bundle = await collectArchiveExport(command, bytes, actor, rpcSource().rpc, signal, async () => true, () => now + 1);
  const raw = JSON.stringify(envelope(bytes));
  const response = await handleCoverage(request(raw), { enabled: true,
    authority: () => ({ authenticate: async () => ({ actorId: actor.ownerId, sessionId: actor.sessionId, mobileEpoch: actor.mobileEpoch }), current: async () => true }),
    handlers: { archive_data: async () => Response.json({ data: bundle }) } });
  assert.equal(response.status, 200); const value = await response.json();
  // Production classifier uses the actual clock; this deterministic fixture is old.
  assert.equal(value.state, 'unavailable');
  const valid = { ...envelope(bytes), requestDigest: (await import('../../../../lib/server/privacy/coverage/contract.ts')).coverageDigest(raw),
    state: 'partial', reason: 'PROTECTED_ARCHIVE_FILE_REQUIRED', result: { data: bundle }, allUserDataCompleted: false };
  delete valid.confirmed; delete valid.tripId; delete valid.commandBytes;
  assert.ok(matchesCoverageResult(valid, raw, now + 1));
  assert.equal(matchesCoverageResult({ ...valid, state: 'scoped_complete' }, raw, now + 1), false);
  assert.equal(matchesCoverageResult({ ...valid, mobileEpoch: 99 }, raw, now + 1), false);
});
