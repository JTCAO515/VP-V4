import test from 'node:test';
import assert from 'node:assert/strict';
import { translationPrompt } from '../../../lib/server/media-translation/text/contract.ts';
import { parseTranslationRecoveryIdentity, projectTranslationRecovery, translationInputHash } from '../../../lib/server/media-translation/text/recovery-contract.ts';
const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const input = { sourceLocale: 'en' as const, targetLocale: 'zh' as const, text: 'CNY 50. No peanuts.' };
const identity = { turnId: id(1), threadId: id(2), idempotencyKey: id(3), policyId: id(4), noticeHash: 'a'.repeat(64), sourceLocale: input.sourceLocale, targetLocale: input.targetLocale, inputHash: translationInputHash(input.text) };
const params = () => new URLSearchParams(Object.entries(identity).filter(([key]) => key !== 'turnId'));
const turn = { turnId: identity.turnId, threadId: identity.threadId, locale: 'zh', input: translationPrompt(input), status: 'completed', outcome: 'answered', output: JSON.stringify({ translation: '50元，不要花生。', backTranslation: input.text }) };
test('recovery query is closed, canonical and contains only original identity and UTF8 text digest', () => {
 assert.deepEqual(parseTranslationRecoveryIdentity(identity.turnId, params()), identity);
 for (const [key, value] of [['owner', id(5)], ['text', input.text], ['threadId', id(5)], ['inputHash', 'A'.repeat(64)], ['sourceLocale', 'es']]) {
  const p = params(); p.append(key, value); assert.equal(parseTranslationRecoveryIdentity(identity.turnId, p), null);
 }
 for (const [key, value] of [['inputHash', 'A'.repeat(64)], ['policyId', 'BAD'], ['sourceLocale', 'zh'], ['targetLocale', 'es']]) {
  const p = params(); p.set(key, value); assert.equal(parseTranslationRecoveryIdentity(identity.turnId, p), null);
 }
 const p = params(); p.delete('noticeHash'); assert.equal(parseTranslationRecoveryIdentity(identity.turnId, p), null);
 assert.equal(parseTranslationRecoveryIdentity('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'.toUpperCase(), params()), null);
 assert.notEqual(translationInputHash('é'), translationInputHash('e\u0301'));
 assert.notEqual(translationInputHash(' text'), translationInputHash('text'));
});
test('same original Turn projects pending then translated/failed/cancelled without changing identity', () => {
 for (const status of ['accepted', 'planning', 'retrieving', 'generating', 'validating']) {
  const value = projectTranslationRecovery(identity, { ...turn, status, output: null, outcome: null });
  assert.equal(value.state, 'pending'); assert.deepEqual(value.identity, identity);
 }
 assert.equal(projectTranslationRecovery(identity, turn).state, 'translated');
 for (const status of ['failed', 'unavailable', 'cancelled']) assert.equal(projectTranslationRecovery(identity, { ...turn, status, output: null, outcome: null }).state, status === 'cancelled' ? 'cancelled' : 'unavailable');
 assert.equal(projectTranslationRecovery(identity, { ...turn, output: '{}' }).state, 'needs_review');
 assert.equal(projectTranslationRecovery(identity, { ...turn, output: JSON.stringify({ translation: '500元', backTranslation: input.text }) }).state, 'needs_review');
});
test('identity/content mismatches, unknown state and incomplete/late callback evidence never manufacture a terminal result', () => {
 for (const patch of [{ turnId: id(9) }, { threadId: id(9) }, { locale: 'en' }, { input: 'private ordinary Ask' }, { status: 'novel' }, { status: 'completed', output: null, outcome: null }, { status: 'generating' }, { status: 'cancelled' }, { outcome: 'unknown' }, { output: 'x'.repeat(8001) }]) {
  const value = projectTranslationRecovery(identity, { ...turn, ...patch });
  assert.equal(value.state, 'unknown'); assert.equal(value.phrase, null); assert.ok(!JSON.stringify(value).includes(input.text));
 }
 for (const patch of [{ inputHash: 'f'.repeat(64) }, { sourceLocale: 'zh' as const, targetLocale: 'en' as const }]) {
  const value = projectTranslationRecovery({ ...identity, ...patch }, turn); assert.equal(value.state, 'unknown'); assert.equal(value.phrase, null);
 }
});
