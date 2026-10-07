import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { parseResultCommand, resultDigest } from '../../../../lib/server/privacy/result-data/contract.ts';
import { decodeResultPreview, decodeResultReceipt, decodeResultList, decodeResultUnknown } from '../../../../lib/server/privacy/result-data/protocol.ts';
import * as f from './fixtures.mjs';
const directory = resolve(process.argv[2] ?? '/tmp/vpj58-result-data-native-fixtures');
const blocked = { ...f.preview(), conflicts: ['CROSS_RESULT_REFERENCE', 'PROPOSAL_REFERENCE', 'DECISION_REFERENCE', 'CORE_EXPORT_COPY'], eligible: false };
const plainGraph = { ...f.graph, executionIds: [], journalIds: [] };
const plainCounts = { ...f.zero(Object.keys(f.eraseCounts)), artifacts: 1, revisions: 2, resultEvents: 3 };
const plainPreview = { ...f.preview(), graph: plainGraph, eraseCounts: plainCounts };
const plainReceipt = { ...f.receipt(), decision: { ...f.decision(), graph: plainGraph, erasedCounts: plainCounts, retainedFences: 3 } };
const artifacts = {
  'preview.json': [f.preview(), v => decodeResultPreview(v, f.previewCommand, f.actor, f.now + 1)],
  'blocked-preview.json': [blocked, v => decodeResultPreview(v, f.previewCommand, f.actor, f.now + 1)],
  'plain-preview.json': [plainPreview, v => decodeResultPreview(v, f.previewCommand, f.actor, f.now + 1)],
  'receipt.json': [f.receipt(), v => decodeResultReceipt(v, f.erase, f.actor, resultDigest(f.eraseBytes), f.now + 40000)],
  'plain-receipt.json': [plainReceipt, v => decodeResultReceipt(v, f.erase, f.actor, resultDigest(f.eraseBytes), f.now + 40000)],
  'unknown.json': [f.unknown(), v => decodeResultUnknown(v, f.recover, f.actor, resultDigest(f.eraseBytes))],
  'list.json': [f.list(), v => decodeResultList(v, f.listCommand, f.actor, f.now + 1)],
  'progress-preview.json': [f.progressPreview(), v => decodeResultPreview(v, f.progressPreviewCommand, f.actor, f.now + 40001)],
  'progress-receipt.json': [f.progressReceipt(), v => decodeResultReceipt(v, f.progressErase, f.actor, resultDigest(f.progressEraseBytes), f.now + 80001)],
  'progress-list.json': [f.progressList(), v => decodeResultList(v, f.progressListCommand, f.actor, f.now + 80001)],
};
await mkdir(directory, { recursive: true });
for (const [file, [value, decode]] of Object.entries(artifacts)) {
  assert.ok(decode(value), `${file} producer is invalid`);
  await writeFile(resolve(directory, file), JSON.stringify({ data: value }, null, 2) + '\n');
}
const commands = { schemaVersion: 'result-data-native-fixtures/1', synthetic: true, actor: f.actor, now: f.now,
  previewBytes: JSON.stringify(f.previewCommand), eraseBytes: f.eraseBytes, recoverBytes: JSON.stringify(f.recover), listBytes: JSON.stringify(f.listCommand),
  progressPreviewBytes: JSON.stringify(f.progressPreviewCommand), progressEraseBytes: f.progressEraseBytes,
  progressRecoverBytes: JSON.stringify(f.progressRecover), progressListBytes: JSON.stringify(f.progressListCommand) };
for (const key of ['previewBytes', 'eraseBytes', 'recoverBytes', 'listBytes', 'progressPreviewBytes', 'progressEraseBytes', 'progressRecoverBytes', 'progressListBytes'])
  assert.ok(parseResultCommand(JSON.parse(commands[key])), key);
await writeFile(resolve(directory, 'commands.json'), JSON.stringify(commands, null, 2) + '\n');
console.log(`Synthetic TS producer: ${Object.keys(artifacts).length} envelopes + commands, self-validated: ${directory}`);
