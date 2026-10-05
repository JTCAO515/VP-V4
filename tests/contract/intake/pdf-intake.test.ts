import assert from "node:assert/strict";
import test from "node:test";
import { parsePdfCommand, pdfDigest, type PdfCommand } from "../../../lib/server/intake/pdf/contract.ts";
import { buildPdfPreview } from "../../../lib/server/intake/pdf/preview.ts";
import { applyPatch, type TripSnapshot } from "../../../lib/server/trip/patch/contract.ts";
const tripId = "d2231057-860d-46be-a099-a9857a53cba9";
const command: PdfCommand = { operationId: "c2231057-860d-46be-a099-a9857a53cba9", expectedHeadVersion: 0,
  contentHash: "a".repeat(64), byteCount: 20_000_000, pageCount: 10, extraction: "pdfkit_text", expiresAt: "2026-10-05T12:00:00.000Z",
  fields: [{ kind: "date", value: "2026-10-06", locator: { page: 2, line: 4, sourceTextHash: "b".repeat(64) } },
    { kind: "amount", value: "¥128 用户已核对", locator: { page: 10, line: 500, sourceTextHash: "c".repeat(64) } }] };
const snapshot: TripSnapshot = { version: 0, title: "Saved original Trip", days: [{ id: "fixed_day", date: "2026-10-06", timeZone: "Asia/Shanghai", items: [
  { id: "z_fixed_order", dayId: "fixed_day", title: "Fixed original booking", startsAt: "2026-10-06T10:00:00+08:00", endsAt: "2026-10-06T12:00:00+08:00", manualOrder: 0 },
  { id: "a_activity", dayId: "fixed_day", title: "Keep original activity", manualOrder: 1 }] }] };

test("bounded PDF command rejects unsupported claims, raw media, invalid dates, fields and locators without truncation", () => {
  assert.deepEqual(parsePdfCommand(command), command);
  for (const delta of [{ byteCount: 20_000_001 }, { pageCount: 11 }, { byteCount: 0 }, { pageCount: 0 }, { extraction: "ocr" },
    { rawPdf: "bytes" }, { ownerId: tripId }, { expiresAt: "2026-10-05T12:00:00Z" }, { fields: [] },
    { fields: [command.fields[1]] }, { fields: [command.fields[0], command.fields[0]] },
    { fields: [{ ...command.fields[0], value: "2026-02-30" }] },
    { fields: [{ ...command.fields[0], locator: { ...command.fields[0].locator, page: 11 } }] },
    { fields: [command.fields[0], { ...command.fields[1], value: "a".repeat(97) }] },
    { fields: [command.fields[0], { ...command.fields[1], value: "😀".repeat(49) }] },
    { fields: [command.fields[0], { ...command.fields[1], value: "bad\u0000text" }] }]) assert.equal(parsePdfCommand({ ...command, ...delta }), null);
});
test("PDF preview is additive, preserves fixed originals/order, and distinguishes actual repeated and conflicting corrected imports", () => {
  const before = structuredClone(snapshot);
  const first = buildPdfPreview(tripId, snapshot, command);
  assert.deepEqual(snapshot, before);
  assert.equal(first.relation, "new");
  assert.deepEqual(first.fields.map(f => f.state), ["duplicate", "added"]);
  assert.equal(first.orderVerification, "unavailable");
  assert.equal(first.sourceAvailability, "local_only");
  assert(first.patch);
  const next = applyPatch(snapshot, first.patch);
  assert.deepEqual(next.days[0].items?.slice(0, 2), snapshot.days[0].items);
  const replay = buildPdfPreview(tripId, next, { ...command, expectedHeadVersion: 1 });
  assert.equal(replay.relation, "duplicate"); assert.equal(replay.patch, null);
  const corrected = { ...command, expectedHeadVersion: 1, fields: [command.fields[0], { ...command.fields[1], value: "¥256 用户校正" }] };
  const conflict = buildPdfPreview(tripId, next, corrected);
  assert.equal(conflict.relation, "conflict"); assert.equal(conflict.fields[1].state, "conflict"); assert(conflict.patch);
  const alternative = applyPatch(next, conflict.patch);
  assert.deepEqual(alternative.days[0].items?.slice(0, 3), next.days[0].items);
  assert.equal(alternative.days[0].items?.length, 4);
  assert.equal(alternative.title, snapshot.title);
});
test("preview binds current Trip/head, complete corrected source/expiry, and refuses saved ID collisions", () => {
  assert.throws(() => buildPdfPreview(tripId, { ...snapshot, version: 1 }, command), /STALE_TRIP_VERSION/);
  const first = buildPdfPreview(tripId, snapshot, command);
  assert(first.patch);
  const next = applyPatch(snapshot, first.patch);
  const tampered: TripSnapshot = { ...next, days: next.days.map(d => ({ ...d, items: d.items?.map(i => i.id.startsWith("pdfi_") ? { ...i, title: "Manually fixed changed item" } : i) })) };
  assert.throws(() => buildPdfPreview(tripId, tampered, { ...command, expectedHeadVersion: 1 }), /PROPOSAL_NOT_CONFIRMABLE/);
  for (const changed of [{ ...command, expiresAt: "2026-10-05T13:00:00.000Z" }, { ...command, fields: [...command.fields].reverse() },
    { ...command, fields: [command.fields[0], { ...command.fields[1], locator: { ...command.fields[1].locator, line: 501 } }] }])
    assert.notEqual(buildPdfPreview(tripId, snapshot, changed).previewDigest, first.previewDigest);
  assert.notEqual(buildPdfPreview("e2231057-860d-46be-a099-a9857a53cba9", snapshot, command).previewDigest, first.previewDigest);
  assert.equal(pdfDigest({ z: 1, a: { c: "中文 😀", b: "quote\"" } }), pdfDigest({ a: { b: "quote\"", c: "中文 😀" }, z: 1 }));
});
