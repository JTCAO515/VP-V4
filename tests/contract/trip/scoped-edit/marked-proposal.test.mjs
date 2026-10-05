// Real adapter/SDK path with a disposable synthetic Auth/DB transport; not target RLS proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';
import { nativeFixture } from '../../identity/native-fixture.ts';
import { createUserDataAdapter } from '../../../../lib/server/identity/user-data-adapter.ts';

test('original marked Proposal reader binds currentness to exact database id, keeps stale candidates unavailable and preserves sparse rollback target', async t => {
  const saved = process.env.VISEPANDA_TRIP_PROTOCOL_V2;
  process.env.VISEPANDA_TRIP_PROTOCOL_V2 = 'true';
  t.after(() => { if (saved === undefined) delete process.env.VISEPANDA_TRIP_PROTOCOL_V2; else process.env.VISEPANDA_TRIP_PROTOCOL_V2 = saved; });
  const f = await nativeFixture(t), fetcher = globalThis.fetch;
  const trip = { id: '11111111-1111-4111-8111-111111111111', title: 'Current', head_version: 5, updated_at: '2026-10-05T00:00:00Z' };
  const target = { version: 2, title: 'Earlier', content: { title: 'Earlier', days: [{ id: 'day', date: '2026-10-05', items: [{ id: 'c', dayId: 'day', title: 'C', manualOrder: 0 }, { id: 'b', dayId: 'day', title: 'B' }, { id: 'a', dayId: 'day', title: 'A', manualOrder: 9 }] }] } };
  const base = { version: 5, title: 'Current', content: { title: 'Current', days: [{ id: 'day', date: '2026-10-05', items: [{ id: 'a', dayId: 'day', title: 'A' }, { id: 'b', dayId: 'day', title: 'B' }, { id: 'c', dayId: 'day', title: 'C' }] }] } };
  const proposal = { id: '22222222-2222-4222-8222-222222222222', trip_id: trip.id, revision: 4, base_trip_version: 5, status: 'pending', patch: { expectedVersion: 5, operations: [{ kind: 'set_title', title: 'New' }] }, created_at: '2026-10-05T00:00:00Z', expires_at: '2099-01-01T00:00:00Z', rollback_snapshot_version: null, scoped_edit: true };
  let currentness = { kind: 'scoped_edit_current/1', proposalId: proposal.id, current: false }, currentCalls = 0;
  t.mock.method(globalThis, 'fetch', async (raw, init) => {
    const request = new Request(raw, init), url = new URL(request.url);
    if (url.pathname.startsWith('/auth/')) return fetcher(raw, init);
    if (url.pathname === '/rest/v1/trips') return Response.json([trip]);
    if (url.pathname === '/rest/v1/rpc/read_trip_proposal_v2') return Response.json([{ proposal, digest: 'trip-v2:' + 'a'.repeat(64) }]);
    if (url.pathname === '/rest/v1/rpc/read_scoped_trip_edit_proposal_current_v1') { currentCalls++; assert.equal((await request.json()).p_proposal_id, proposal.id); return Response.json(currentness); }
    if (url.pathname === '/rest/v1/trip_version_snapshots') return Response.json([url.searchParams.get('version') === 'eq.2' ? target : base]);
    return Response.json([]);
  });
  const adapter = createUserDataAdapter(new NextRequest('https://web.invalid/api/trips', { headers: { Cookie: f.cookie() } }), f.config);
  const stale = await adapter.getPendingProposal(trip.id, proposal.id);
  assert.equal(stale.data.proposal.stale, true); assert.equal(stale.data.proposal.revision, 4);
  currentness = { ...currentness, current: true };
  assert.equal((await adapter.getPendingProposal(trip.id, proposal.id)).data.proposal.stale, false);
  currentness = { ...currentness, proposalId: trip.id };
  assert.equal((await adapter.getPendingProposal(trip.id, proposal.id)).error, 'PROVIDER_UNAVAILABLE');
  proposal.scoped_edit = false; const count = currentCalls;
  assert.equal((await adapter.getPendingProposal(trip.id, proposal.id)).data.proposal.stale, false);
  assert.equal(currentCalls, count, 'unmarked original Proposal requires no new currentness RPC');
  proposal.rollback_snapshot_version = 2; proposal.patch = { title: 'Earlier' };
  const originalBytes = JSON.stringify(target), read = await adapter.getPendingProposal(trip.id, proposal.id);
  assert.deepEqual(read.data.proposal.after.days, target.content.days);
  assert.equal(read.data.proposal.after.version, 6);
  assert.equal(read.data.proposal.after.days[0].items[2].manualOrder, 9);
  assert.equal(JSON.stringify(target), originalBytes);
});
