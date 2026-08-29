import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("V4-15 exposes recorded receipt references without a Memory summary or client-side mutation", () => {
  const adapter = readFileSync("lib/server/identity/user-data-adapter.ts", "utf8");
  const chat = readFileSync("components/chat/ChatThreadWorkspace.tsx", "utf8");
  const canvas = readFileSync("components/canvas/TripCanvas.tsx", "utf8");
  const copy = readFileSync("lib/i18n.ts", "utf8");
  assert.match(adapter, /memory_consumer_receipts/);
  assert.match(adapter, /memory_id,source_receipt_id/);
  assert.match(chat, /copy\.memoryProvenance/);
  assert.match(canvas, /memoryProvenance/);
  assert.match(copy, /Memory provenance/);
  const consumerReads = [...adapter.matchAll(/\.from\("memory_consumer_receipts"\)[\s\S]{0,320}/g)].map((match) => match[0]).join("\n");
  assert.doesNotMatch(consumerReads, /summary/);
  assert.doesNotMatch(chat, /memoryReceipts[^\n]*fetch/);
  assert.doesNotMatch(canvas, /memoryReceipts[^\n]*fetch/);
});
