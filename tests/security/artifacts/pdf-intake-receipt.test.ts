import assert from "node:assert/strict";
import test from "node:test";
import { parsePdfOperation, parsePdfProposal, pdfRequestDigest, pdfError } from "../../../lib/server/intake/pdf/repository.ts";
import { pdfDigest, type PdfCommand } from "../../../lib/server/intake/pdf/contract.ts";
const tripId = "d2231057-860d-46be-a099-a9857a53cba9", operationId = "c2231057-860d-46be-a099-a9857a53cba9", proposalId = "e2231057-860d-46be-a099-a9857a53cba9";
const command: PdfCommand = { operationId, expectedHeadVersion: 0, contentHash: "a".repeat(64), byteCount: 1, pageCount: 1,
  extraction: "pdfkit_text", expiresAt: "2026-10-05T12:00:00.000Z", fields: [{ kind: "date", value: "2026-10-06", locator: { page: 1, line: 1, sourceTextHash: "b".repeat(64) } }] };
const raw = JSON.stringify({ command, reviewedPreviewDigest: "d".repeat(64) });
const pending = { kind: "pdf_intake_operation/1", operationId, tripId, sessionEpoch: 3, state: "pending", requestDigest: pdfRequestDigest(raw),
  commandDigest: pdfDigest(command), previewDigest: "d".repeat(64), expiresAt: command.expiresAt, proposalId, proposalRevision: 1, baseTripVersion: 0,
  confirmationEventId: null, resultingVersion: null };
test("an operation read requires exact actor/Trip/op binding and actual confirmed receipt fields", () => {
  assert.deepEqual(parsePdfOperation(pending, tripId, operationId, 3), pending);
  for (const delta of [{ sessionEpoch: 2 }, { tripId: proposalId }, { operationId: proposalId }, { rawPdf: "bad" },
    { state: "confirmed" }, { state: "confirmed", confirmationEventId: proposalId, resultingVersion: 2 },
    { state: "absent" }, { proposalId: null }, { confirmationEventId: proposalId, resultingVersion: 1 }])
    assert.equal(parsePdfOperation({ ...pending, ...delta }, tripId, operationId, 3), null);
  const confirmed = { ...pending, state: "confirmed", confirmationEventId: proposalId, resultingVersion: 1 };
  assert.deepEqual(parsePdfOperation(confirmed, tripId, operationId, 3), confirmed);
});
test("proposal ACK requires original exact POST bytes, canonical command, preview, head and current epoch", () => {
  const receipt = { kind: "pdf_intake_proposal/1", operationId, tripId, sessionEpoch: 3, requestDigest: pdfRequestDigest(raw),
    commandDigest: pdfDigest(command), previewDigest: "d".repeat(64), proposalId, proposalRevision: 1, baseTripVersion: 0, reused: false };
  assert.deepEqual(parsePdfProposal(receipt, tripId, command, "d".repeat(64), raw, 3), receipt);
  assert.equal(parsePdfProposal(receipt, tripId, command, "d".repeat(64), raw + " ", 3), null);
  assert.equal(parsePdfProposal(receipt, tripId, command, "e".repeat(64), raw, 3), null);
  assert.equal(parsePdfProposal(receipt, tripId, command, "d".repeat(64), raw, 4), null);
  assert.equal(parsePdfProposal({ ...receipt, baseTripVersion: 1 }, tripId, command, "d".repeat(64), raw, 3), null);
  assert.equal(pdfError("missing function pdf_intake_v1"), "PROVIDER_UNAVAILABLE");
  assert.equal(pdfError("SESSION_REPLACED"), "UNAUTHENTICATED");
});
