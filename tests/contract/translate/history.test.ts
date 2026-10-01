import test from 'node:test';
import assert from 'node:assert/strict';
import { translationPrompt } from '../../../lib/server/media-translation/text/contract.ts';
import { projectTranslationHistory, translationHistoryHTTP } from '../../../lib/server/media-translation/text/history-http.ts';
const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const policy = id(900), input = { sourceLocale: 'en' as const, targetLocale: 'zh' as const, text: 'CNY 50.' };
const turn = (n: number) => ({ turnId: id(n), locale: 'zh', input: translationPrompt(input), status: 'completed', outcome: 'answered', output: JSON.stringify({ translation: '50元。', backTranslation: input.text }) });
const raw = (turns: unknown[], tail = false, anchor: unknown = null) => ({ kind: 'translation_candidates', turns, hasUnscannedTail: tail, anchor });
test('saved translation page emits at most20 and only the last delivered valid translation cursor', () => {
 const page = projectTranslationHistory(raw(Array.from({ length: 22 }, (_, i) => turn(i + 1)), true), policy, null);
 assert.equal(page?.kind, 'translations');
 if (page?.kind !== 'translations') throw Error('expected page');
 assert.equal(page.phrases.length, 20); assert.equal(page.nextCursor, id(20));
 assert.ok(!JSON.stringify(page).includes('hasUnscannedTail')); assert.ok(!JSON.stringify(page).includes('createdAt'));
});
test('empty/full terminal pages are distinct from sparse or malformed/needs_review incomplete windows', () => {
 assert.equal(projectTranslationHistory(raw([]), policy, null)?.kind, 'translations');
 for (const data of [raw([], true), raw([turn(1)], true), raw([{ ...turn(1), output: '{}' }]), raw([{ ...turn(1), output: JSON.stringify({ translation: '500元。', backTranslation: input.text }) }]), raw([{ ...turn(1), status: 'failed' }]), raw([{ ...turn(1), input: 'PRIVATE ASK TITLE' }])]) {
  assert.deepEqual(projectTranslationHistory(data, policy, null), { version: 2, kind: 'unavailable' });
 }
 const mixed = raw([{ ...turn(30), output: '{}' }, ...Array.from({ length: 21 }, (_, i) => turn(i + 1))], true);
 assert.equal(projectTranslationHistory(mixed, policy, null)?.kind, 'translations', 'a21st valid candidate supplies a safe continuation');
});
test('cursor and exact projection require a canonical answered phrase and same exactTurn', () => {
 for (const anchor of [null, turn(2), { ...turn(1), outcome: 'partial' }, { ...turn(1), output: '{}' }]) {
  assert.equal(projectTranslationHistory(raw([], false, anchor), policy, id(1))?.kind, 'unavailable');
 }
 assert.equal(projectTranslationHistory(raw([], false, turn(1)), policy, id(1))?.kind, 'translations');
 assert.equal(projectTranslationHistory({ kind: 'translation_candidate', turn: turn(1) }, policy, null, id(1))?.kind, 'translation');
 assert.equal(projectTranslationHistory({ kind: 'translation_candidate', turn: turn(2) }, policy, null, id(1))?.kind, 'unavailable');
 assert.equal(projectTranslationHistory(raw([turn(1), turn(1)]), policy, null), null);
 assert.equal(projectTranslationHistory(raw(Array.from({ length: 129 }, (_, i) => turn(i + 1))), policy, null), null);
});
test('new history rejects ambient authority/query expansion and keeps Production translation closed', async () => {
 for (const request of [new Request('http://127.0.0.1/api/translate/history/v2', { method: 'POST' }), new Request('http://127.0.0.1/api/translate/history/v2?owner=foreign'), new Request('http://127.0.0.1/api/translate/history/v2?cursor=bad'), new Request(`http://127.0.0.1/api/translate/history/v2?cursor=${id(1)}&cursor=${id(2)}`), new Request('http://127.0.0.1/api/translate/history/v2', { headers: { Cookie: '' } }), new Request('http://127.0.0.1/api/translate/history/v2', { headers: { Origin: 'http://127.0.0.1' } })]) assert.equal((await translationHistoryHTTP(request)).status, 400);
 assert.equal((await translationHistoryHTTP(new Request(`http://127.0.0.1/api/translate/history/v2/turns/${id(1)}?cursor=${id(2)}`), id(1))).status, 400);
 const prior = process.env.VERCEL_ENV; process.env.VERCEL_ENV = 'production';
 try { assert.equal((await translationHistoryHTTP(new Request('https://example.test/api/translate/history/v2'))).status, 503); }
 finally { if (prior === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = prior; }
});
