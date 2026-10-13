import assert from 'node:assert/strict';
import test from 'node:test';
import { associateMaterialOutcome, type OriginalMaterialReads } from '../../../../lib/server/journey-entry/material-outcome/consumer.ts';
import { source, type MaterialSource } from '../../../../lib/server/journey-entry/material-outcome/contract.ts';
import { parseClosedJSON } from '../../../../lib/server/journey-entry/material-outcome/json.ts';
import { pdfDigest, type PdfCommand } from '../../../../lib/server/intake/pdf/contract.ts';
import { pdfRequestDigest } from '../../../../lib/server/intake/pdf/repository.ts';

const id = (n: number) => `a2231057-860d-46be-a099-${String(n).padStart(12, '0')}`;
const clock = Date.parse('2026-10-13T02:00:00.000Z');
const expiresAt = '2026-10-13T03:00:00.000Z';
const selected: MaterialSource = { kind: 'native_entry', logicalId: id(1), entry: 'e2',
  anchor: { kind: 'trip', tripId: id(2), tripVersion: 0, medium: 'pdf' } };
const command: PdfCommand = { operationId: id(3), expectedHeadVersion: 0, contentHash: 'a'.repeat(64),
  byteCount: 200, pageCount: 1, extraction: 'pdfkit_text', expiresAt,
  fields: [{ kind: 'date', value: '2026-10-14', locator: { page: 1, line: 1, sourceTextHash: 'b'.repeat(64) } }] };
function fixture() {
  const actor = { ownerId: id(4), sessionId: id(5), mobileEpoch: 1 };
  const bytes = JSON.stringify({ command, reviewedPreviewDigest: 'c'.repeat(64) });
  const selection = { actor, source: structuredClone(selected), boundary: 'before_material_read', state: 'current',
    expiresAt, originalProposalBytes: bytes, presentation: 'rendered_confirmed_readback' };
  const operation = { kind: 'pdf_intake_operation/1', operationId: command.operationId, tripId: selected.anchor.tripId,
    sessionEpoch: 1, state: 'confirmed', requestDigest: pdfRequestDigest(bytes), commandDigest: pdfDigest(command),
    previewDigest: 'c'.repeat(64), expiresAt, proposalId: id(6), proposalRevision: 1, baseTripVersion: 0,
    confirmationEventId: id(7), resultingVersion: 1 };
  const trip = { tripId: selected.anchor.tripId, snapshot: { version: 1, title: 'Saved original Trip', days: [] },
    confirmationState: 'confirmed', versions: [{ id: id(7), proposalId: id(6), resultingVersion: 1, eventType: 'proposal_applied' }] };
  const calls: string[] = [];
  const reads: OriginalMaterialReads = {
    async readActor() { calls.push('actor'); return actor; },
    async readSelection(logicalId) { assert.equal(logicalId, selected.logicalId); calls.push('selection'); return selection; },
    async readPdfOperation(tripId, operationId, identity) {
      assert.equal(tripId, selected.anchor.tripId); assert.equal(operationId, command.operationId);
      assert.deepEqual(identity, actor); calls.push('operation'); return operation;
    },
    async readTrip(tripId) { assert.equal(tripId, selected.anchor.tripId); calls.push('trip'); return trip; },
  };
  return { actor, selection, operation, trip, reads, calls };
}
const run = (reads: OriginalMaterialReads | null, request: unknown = selected, now = () => clock) =>
  associateMaterialOutcome(request, reads, { signal: new AbortController().signal, now });

test('complete original receipt + two exact readbacks qualifies the internal tuple without mutating inputs', async () => {
  const f = fixture(); const before = structuredClone([selected, f.actor, f.selection, f.operation, f.trip]);
  const result = await run(f.reads);
  assert.deepEqual(result, { kind: 'qualified', source: selected, actor: f.actor,
    original: { operationId: id(3), proposalId: id(6), proposalRevision: 1, confirmationEventId: id(7), baseTripVersion: 0, resultingVersion: 1 },
    presented: 'observed', adopted: true, saved: true });
  assert.deepEqual(f.calls, ['actor', 'selection', 'operation', 'trip', 'operation', 'trip', 'selection', 'actor']);
  assert.deepEqual([selected, f.actor, f.selection, f.operation, f.trip], before);
});
test('missing presentation stays unknown; lost confirmation ACK can recover only through original confirmed operation', async () => {
  const f = fixture(); f.selection.presentation = 'unknown';
  const result = await run(f.reads); assert.equal(result.kind, 'qualified');
  if (result.kind === 'qualified') assert.equal(result.presented, 'unknown');
});
test('missing protected selection, screenshot and caller claims do not qualify or read material', async () => {
  for (const requested of [{ ...selected, anchor: { ...selected.anchor, medium: 'screenshot' } }, { ...selected, success: true },
    { ...selected, actor: fixture().actor }, { ...selected, rawPdf: 'bytes' }]) {
    const f = fixture(); assert.equal((await run(f.reads, requested)).kind, 'unobservable'); assert.deepEqual(f.calls, []);
  }
  assert.deepEqual(await run(null), { kind: 'unobservable', reason: 'unobservable' });
  const f = fixture(); f.reads.readSelection = async () => null;
  assert.deepEqual(await run(f.reads), { kind: 'unobservable', reason: 'unobservable' }); assert.deepEqual(f.calls, ['actor']);
});
for (const [name, change] of [
  ['foreign owner', (f: ReturnType<typeof fixture>) => { f.selection.actor = { ...f.actor, ownerId: id(8) }; }],
  ['foreign session', (f: ReturnType<typeof fixture>) => { f.selection.actor = { ...f.actor, sessionId: id(8) }; }],
  ['foreign epoch', (f: ReturnType<typeof fixture>) => { f.selection.actor = { ...f.actor, mobileEpoch: 2 }; }],
  ['wrong selected logical entry', (f: ReturnType<typeof fixture>) => { f.selection.source = { ...f.selection.source, logicalId: id(8) }; }],
  ['different selected Trip', (f: ReturnType<typeof fixture>) => { f.selection.source = { ...f.selection.source, anchor: { ...f.selection.source.anchor, tripId: id(8) } }; }],
  ['guard installed after material read', (f: ReturnType<typeof fixture>) => { f.selection.boundary = 'after_material_read'; }],
  ['withdrawn selection', (f: ReturnType<typeof fixture>) => { f.selection.state = 'withdrawn'; }],
  ['expired selection', (f: ReturnType<typeof fixture>) => { f.selection.expiresAt = '2026-10-13T01:00:00.000Z'; }],
  ['operation alias', (f: ReturnType<typeof fixture>) => { f.operation.operationId = id(8); }],
  ['operation Trip alias', (f: ReturnType<typeof fixture>) => { f.operation.tripId = id(8); }],
  ['operation epoch alias', (f: ReturnType<typeof fixture>) => { f.operation.sessionEpoch = 2; }],
  ['body digest alias', (f: ReturnType<typeof fixture>) => { f.operation.requestDigest = 'd'.repeat(64); }],
  ['command digest alias', (f: ReturnType<typeof fixture>) => { f.operation.commandDigest = 'd'.repeat(64); }],
  ['preview digest alias', (f: ReturnType<typeof fixture>) => { f.operation.previewDigest = 'd'.repeat(64); }],
  ['base version alias', (f: ReturnType<typeof fixture>) => { f.operation.baseTripVersion = 1; f.operation.resultingVersion = 2; }],
  ['receipt expiry alias', (f: ReturnType<typeof fixture>) => { f.operation.expiresAt = '2026-10-13T04:00:00.000Z'; }],
  ['readback Trip alias', (f: ReturnType<typeof fixture>) => { f.trip.tripId = id(8); }],
  ['newer head is not exact resulting version', (f: ReturnType<typeof fixture>) => { f.trip.snapshot.version = 2; }],
  ['older head', (f: ReturnType<typeof fixture>) => { f.trip.snapshot.version = 0; }],
  ['unknown confirmation', (f: ReturnType<typeof fixture>) => { f.trip.confirmationState = 'unknown'; }],
  ['event alias', (f: ReturnType<typeof fixture>) => { f.trip.versions[0].id = id(8); }],
  ['proposal alias', (f: ReturnType<typeof fixture>) => { f.trip.versions[0].proposalId = id(8); }],
  ['event version alias', (f: ReturnType<typeof fixture>) => { f.trip.versions[0].resultingVersion = 2; }],
  ['wrong event kind', (f: ReturnType<typeof fixture>) => { f.trip.versions[0].eventType = 'edited'; }],
  ['ambiguous duplicated event', (f: ReturnType<typeof fixture>) => { f.trip.versions.push(f.trip.versions[0]); }],
  ['oversize history is refused', (f: ReturnType<typeof fixture>) => { f.trip.versions = Array.from({ length: 65 }, () => f.trip.versions[0]); }],
  ['lexically different original bytes', (f: ReturnType<typeof fixture>) => { f.selection.originalProposalBytes += ' '; }],
  ['unknown original body field', (f: ReturnType<typeof fixture>) => { f.selection.originalProposalBytes = JSON.stringify({ command, reviewedPreviewDigest: 'c'.repeat(64), success: true }); }],
  ['duplicate hidden body field', (f: ReturnType<typeof fixture>) => { f.selection.originalProposalBytes = f.selection.originalProposalBytes.replace('"command":', '"command":null,"command":'); }],
] as const) test(`refuses ${name}`, async () => { const f = fixture(); change(f); assert.equal((await run(f.reads)).kind, 'unobservable'); });
for (const state of ['absent', 'pending', 'rejected', 'cancelled', 'expired']) test(`parse/preview/refused proposal state ${state} never activates`, async () => {
  const f = fixture(); f.operation.state = state; f.operation.confirmationEventId = '';
  assert.equal((await run(f.reads)).kind, 'unobservable'); assert(!f.calls.includes('trip'));
});
for (const changed of ['actor', 'epoch', 'selection', 'withdraw', 'operation', 'snapshot', 'head'] as const)
  test(`refuses concurrent ${changed} change at final reread`, async () => {
    const f = fixture();
    const originals = { ...f.reads }; let actors = 0; let selections = 0; let operations = 0; let trips = 0;
    f.reads.readActor = async signal => { const value = await originals.readActor(signal); if (++actors === 2 && (changed === 'actor' || changed === 'epoch')) return { ...f.actor, ...(changed === 'actor' ? { ownerId: id(8) } : { mobileEpoch: 2 }) }; return value; };
    f.reads.readSelection = async (logicalId, signal) => { const value = await originals.readSelection(logicalId, signal); if (++selections === 2) { if (changed === 'selection') return { ...f.selection, originalProposalBytes: f.selection.originalProposalBytes + ' ' }; if (changed === 'withdraw') return null; } return value; };
    f.reads.readPdfOperation = async (...args) => { const value = await originals.readPdfOperation(...args); return ++operations === 2 && changed === 'operation' ? { ...f.operation, proposalRevision: 2 } : value; };
    f.reads.readTrip = async (...args) => { const value = await originals.readTrip(...args); if (++trips === 2 && (changed === 'snapshot' || changed === 'head')) return { ...f.trip, snapshot: { ...f.trip.snapshot, ...(changed === 'head' ? { version: 2 } : { title: 'Changed' }) } }; return value; };
    assert.equal((await run(f.reads)).kind, 'unobservable');
  });
test('expiry crossing, invalid authority clock, malformed closed JSON and mutable callback actor fail closed', async () => {
  const f = fixture(); let ticks = 0;
  assert.equal((await run(f.reads, selected, () => ++ticks < 3 ? clock : Date.parse(expiresAt))).kind, 'unobservable');
  assert.equal((await run(fixture().reads, selected, () => NaN)).kind, 'unobservable');
  for (const body of ['{"x":1,"x":2}', '{"x":1,"\\u0078":2}', '{"x":true}false', ' '.repeat(8193), '{"x":"\\q"}']) assert.throws(() => parseClosedJSON(body));
  assert.deepEqual(JSON.parse(JSON.stringify(parseClosedJSON('{"a":[true,false,null,-1.2e2]}'))), { a: [true, false, null, -120] });
  assert.equal(source({ ...selected, anchor: { ...selected.anchor, tripVersion: -1 } }), false);
  const mutable = fixture(); const original = mutable.reads.readPdfOperation;
  mutable.reads.readPdfOperation = async (...args) => { const result = await original(...args); Object.assign(args[2], { ownerId: id(8) }); return result; };
  assert.equal((await run(mutable.reads)).kind, 'qualified'); assert.equal(mutable.actor.ownerId, id(4));
});
test('abort and deadline bound a hung read with zero later reads', async () => {
  const f = fixture(); const cancel = new AbortController(); let calls = 0;
  f.reads.readActor = async signal => { calls++; assert(signal instanceof AbortSignal); return new Promise(() => {}); };
  const started = Date.now();
  const result = await associateMaterialOutcome(selected, f.reads, { signal: cancel.signal, timeoutMs: 20, now: () => clock });
  assert.deepEqual(result, { kind: 'unobservable', reason: 'source_unavailable' }); assert.equal(calls, 1); assert(Date.now() - started < 1000);
  cancel.abort(); calls = 0;
  assert.equal((await associateMaterialOutcome(selected, f.reads, { signal: cancel.signal, now: () => clock })).kind, 'unobservable'); assert.equal(calls, 0);
  const rejected = fixture(); rejected.reads.readActor = async () => { throw Error('private source error'); };
  assert.deepEqual(await run(rejected.reads), { kind: 'unobservable', reason: 'source_unavailable' });
  const malformed = fixture(); malformed.reads.readActor = async () => ({ callback() {} });
  assert.deepEqual(await run(malformed.reads), { kind: 'unobservable', reason: 'source_unavailable' });
});
