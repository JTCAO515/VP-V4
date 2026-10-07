import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { parseProfileCommand, profileDigest, PROFILE_SCHEMA } from '../../../../lib/server/privacy/profile-data/contract.ts';
import { decodeProfilePreview, decodeProfileReceipt, decodeProfileList, decodeProfileUnknown } from '../../../../lib/server/privacy/profile-data/protocol.ts';
import * as f from './fixtures.mjs';
const output = resolve(process.argv[2] ?? '/tmp/vpj58-profile-data-native-fixtures');
const listCommand = { action: 'list', scope: 'profile-delete-progress/1', cursor: null, limit: 20 };
const values = { preview: f.preview(), blocked: { ...f.preview(), conflicts: ['ACTIVE_PROFILE_USE'], eligible: false }, receipt: f.receipt(), unknown: f.unknown(),
  'progress-preview': f.progressPreview(), 'progress-receipt': f.progressReceipt(), 'progress-list': f.list(),
  'profile-list': { schemaVersion: PROFILE_SCHEMA, kind: 'list', ...f.actor, scope: 'profile-sensitive-data/1', sourceDigest: 'c'.repeat(64),
    capturedAt: f.now, expiresAt: f.now + 30000, items: [{ profileId: f.actor.ownerId, summary: f.summary }], hasMore: false, nextCursor: null, allUserDataCompleted: false } };
for (const name of ['preview', 'blocked']) assert.ok(decodeProfilePreview(values[name], { action: 'preview', ...f.selection }, f.actor, f.now + 1));
assert.ok(decodeProfileReceipt(values.receipt, f.command, f.actor, profileDigest(f.bytes), f.now + 40000));
assert.ok(decodeProfileUnknown(values.unknown, f.recover(), f.actor, profileDigest(f.bytes)));
assert.ok(decodeProfilePreview(values['progress-preview'], { action: 'preview', ...f.progressSelection }, f.actor, f.now + 1));
assert.ok(decodeProfileReceipt(values['progress-receipt'], f.progressCommand, f.actor, profileDigest(f.progressBytes), f.now + 40000));
assert.ok(decodeProfileList(values['progress-list'], listCommand, f.actor, f.now + 40001));
assert.ok(decodeProfileList(values['profile-list'], { ...listCommand, scope: 'profile-sensitive-data/1' }, f.actor, f.now + 1));
assert.ok(parseProfileCommand(f.command));assert.ok(parseProfileCommand(f.progressCommand));
mkdirSync(output, { recursive: true });
for (const [name, data] of Object.entries(values)) writeFileSync(resolve(output, `${name}.json`), JSON.stringify({ data }) + '\n');
writeFileSync(resolve(output, 'commands.json'), JSON.stringify({ actor: f.actor, now: f.now, preview: { action: 'preview', ...f.selection }, erase: f.command,
  eraseBytes: f.bytes, recover: f.recover(), progressPreview: { action: 'preview', ...f.progressSelection }, progressErase: f.progressCommand,
  progressEraseBytes: f.progressBytes, progressRecover: { action: 'recover', ...f.progressSelection, mutationBytes: f.progressBytes }, list: listCommand }, null, 2) + '\n');
console.log(`${Object.keys(values).length} self-checked synthetic envelopes plus commands: ${output}`);
