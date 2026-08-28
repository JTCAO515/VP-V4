import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("V4-15 exposes recorded receipt references without a Memory summary or client-side mutation", () => {
  const adapter = readFileSync("lib/server/identity/user-data-adapter.ts", "utf8");
  const chat = readFileSync("components/chat/ChatThreadWorkspace.tsx", "utf8");
  const canvas = readFileSync("components/canvas/TripCanvas.tsx", "utf8");
  assert.match(adapter, /memory_consumer_receipts/);
  assert.match(adapter, /memory_id,source_receipt_id/);
  assert.match(chat, /Memory provenance/);
  assert.match(canvas, /Memory provenance/);
  assert.doesNotMatch(adapter, /\.select\([^)]*summary/);
  assert.doesNotMatch(chat, /memoryReceipts[^\n]*fetch/);
  assert.doesNotMatch(canvas, /memoryReceipts[^\n]*fetch/);
});
