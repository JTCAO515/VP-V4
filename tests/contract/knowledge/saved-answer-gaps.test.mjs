import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as copy from '../../../lib/grounded/copy.ts';

const compiled = ts.transpileModule(readFileSync('components/chat/SavedAnswers.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
function render(locale, gaps, overrides = {}) {
  const facts = [{ id: 'reliable', text: locale === 'zh' ? '合成已审核购票证件指引。' : 'Synthetic reviewed booking ID guidance.',
    conditions: [locale === 'zh' ? '仅限此合成场景。' : 'This synthetic scenario only.'], exclusions: [],
    sources: [{ id: 'source', publisher: 'Synthetic source', href: 'https://example.test/source', locator: 'Fixture section' }] }];
  const history = { turns: [{ id: 'turn', taskId: 'task', city: 'shanghai', locale, input: locale === 'zh' ? '合成问题：需要什么购票证件和车票凭证？' : 'Synthetic question: which booking ID and ticket proof?',
    status: 'completed', projection: 'current', outcome: gaps.length ? 'partial' : 'answered', coverage: gaps.length ? 'partial' : 'answered', questionId: 'rail_boarding_documents', facts, claimGaps: gaps, ...overrides }] };
  let stateIndex = 0;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require(name) {
    if (name === 'react/jsx-runtime') return jsx;
    if (name === 'react') return { useState: () => [stateIndex++ === 0 ? history : 'ready', () => {}], useRef: current => ({ current }), useEffect() {} };
    if (name.includes('browser-auth-client')) return {};
    if (name.includes('grounded/copy')) return copy;
    if (name.endsWith('.css')) return { default: new Proxy({}, { get: (_, key) => key }) };
    throw new Error(`Unexpected import: ${name}`);
  } });
  return renderToStaticMarkup(jsx.jsx(exports.SavedAnswers, { locale }));
}

test('actual saved-answer component renders bilingual precise gaps beside reliable content and sources', () => {
  for (const locale of ['zh', 'en']) {
    const gaps = [{ id: 'valid_ticket_not_itinerary_or_receipt', reasons: ['revoked', 'unreviewed'] }];
    const html = render(locale, gaps), labels = copy.savedClaimGapCopy[locale];
    for (const value of [labels.title, labels.claims[gaps[0].id], ...gaps[0].reasons.map(reason => labels.reasons[reason]), labels.nextStep, labels.nextSteps[gaps[0].id], 'Synthetic source', 'https://example.test/source']) assert.ok(html.includes(value), value);
    assert.ok(html.includes(locale === 'zh' ? '合成已审核购票证件指引。' : 'Synthetic reviewed booking ID guidance.'));
    assert.ok(!html.includes(copy.savedAnswerCopy[locale].blocked));
    assert.ok(!html.includes(copy.savedAnswerCopy[locale].aiAssistPrompt));
    const complete = render(locale, []);
    assert.ok(!complete.includes(labels.title));
    assert.ok(!complete.includes(labels.nextStep));
    assert.ok(!complete.includes(copy.savedAnswerCopy[locale].partial));
    if (process.env.VPJ16_RENDER_DIRECTORY) {
      const css = readFileSync('components/chat/SavedAnswers.module.css', 'utf8');
      writeFileSync(`${process.env.VPJ16_RENDER_DIRECTORY}/${locale}.html`, `<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>VPJ-16 synthetic component verification</title><style>body{font:16px/1.5 system-ui;margin:24px;--ink:#222;--line:#ddd;--surface:#fff;--muted:#555}${css}</style><body><p>Local synthetic fixture — no live account or knowledge publication</p>${html}</body></html>`);
    }
  }
});

test('a temporarily unavailable saved projection shows a retry notice without claiming a knowledge gap', () => {
  for (const locale of ['zh', 'en']) {
    const html = render(locale, [], { projection: 'unavailable', facts: [], claimGaps: undefined });
    assert.ok(html.includes(copy.savedAnswerCopy[locale].recheckUnavailable));
    assert.ok(!html.includes(copy.savedAnswerCopy[locale].blocked));
    assert.ok(!html.includes(copy.savedAnswerCopy[locale].aiAssistPrompt));
    assert.ok(!html.includes(copy.savedClaimGapCopy[locale].title));
    assert.ok(!html.includes('Synthetic source'));
  }
});
