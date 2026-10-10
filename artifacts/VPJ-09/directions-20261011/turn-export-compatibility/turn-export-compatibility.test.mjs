import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeTurnExportPage } from '../../../../lib/server/privacy/turn-data/export.ts';
import { snapshot, page, actor, id, now } from '../turn-data/fixtures.mjs';
const decode = value => decodeTurnExportPage(value, 100, actor.ownerId, now + 40000);
test('SQL appended empty direction groups require exact38 shape and cannot be silently omitted', () => {
  const s = snapshot(); assert.equal(s.sources.length, 38); assert.ok(decode(page(s)));
  assert.deepEqual(s.sources.slice(-3).map(g => g.relation), ['turn_private.assistant_directions_intakes_v1', 'turn_private.directions_result_sources_v1', 'turn_private.directions_operations_v1']);
  for (const mutate of [v => v.sources.pop(), v => v.sources.push({relation:'turn_private.unknown',rows:[]}), v => v.sources.slice(-3).reverse().forEach((g,i) => {v.sources[35+i]=g;})]) {
    const v=structuredClone(s);mutate(v);assert.equal(decode(page(v)),null);
  }
});
test('erased permanent direction receipts preserve exact identity but never revive null business parents', () => {
  const s=snapshot(),row={operation_id:id(70),owner_id:actor.ownerId,session_id:actor.sessionId,action:'save',request_bytes_digest:'b'.repeat(64),erased:true,
    artifact_id:null,source_message_id:null,task_turn_id:null,expected_revision:null,result_revision:null,source_digest:null,output_content_digest:null,trip_id:null,proposal_id:null,proposal_artifact_id:null,receipt:null,created_at:new Date(now-100).toISOString()};
  s.sources.find(g=>g.relation==='turn_private.directions_operations_v1').rows.push(row);s.sourceRows.data++;assert.ok(decode(page(s)));
  for (const mutate of [r=>r.owner_id=id(99),r=>r.receipt={},r=>r.task_turn_id=id(4),r=>r.erased=false,r=>r.request_bytes_digest='invalid',r=>r.unreviewed='body']) {
    const v=structuredClone(s);mutate(v.sources.at(-1).rows[0]);assert.equal(decode(page(v)),null);
  }
});
