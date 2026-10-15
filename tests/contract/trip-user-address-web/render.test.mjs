import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const root = new URL('../../../components/trip-address/', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.startsWith(root) && specifier.startsWith('.')) {
      const url = new URL(specifier, context.parentURL);
      if (url.pathname.endsWith('.module.css')) return { url: url.href, shortCircuit: true };
      for (const suffix of ['.ts', '.tsx']) {
        if (!/\.tsx?$/.test(url.pathname) && existsSync(fileURLToPath(url) + suffix)) return { url: url.href + suffix, shortCircuit: true };
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith(root) && url.endsWith('.module.css')) return { format: 'module', source: 'export default new Proxy({}, {get: (_, key) => key});', shortCircuit: true };
    if (url.startsWith(root) && url.endsWith('.tsx')) return { format: 'module', source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext } }).outputText, shortCircuit: true };
    return next(url, context);
  },
});
const { AddressFacts, TripItemAddress } = await import('../../../components/trip-address/TripItemAddress.tsx');
const { AddressProposalDiff } = await import('../../../components/trip-address/AddressProposalDiff.tsx');
const context = { actorKey: 'A', tripId: 'trip', tripVersion: 3, dayId: 'day', itemId: 'item' };
const manual = { text: '  上海\n<script>alert(1)</script>  ', source: 'user_provided', verification: 'unverified' };
const value = { context, manual: { kind: 'provided', address: manual }, references: [{ supportId: 'support', chineseText: 'unknown', claim: { value: { lines: ['上海 テスト'] } }, sourceRefs: [{ sourceRevisionId: 'source', revisionLabel: 'Source 1' }] }], referencesUnavailable: false };
test('rendered zh/en facts distinguish source/manual and unknown script, escape input', () => {
  for (const locale of ['zh', 'en']) {
    const html = renderToStaticMarkup(React.createElement(AddressFacts, { value, locale }));
    assert.match(html, locale === 'zh' ? /用户补充 · 未验证/ : /User provided · Unverified/);
    assert.match(html, locale === 'zh' ? /文字类型未知/ : /script unknown/);
    assert.match(html, /Source 1/); assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/);
    assert.doesNotMatch(html, locale === 'zh' ? /含中文地址文字/ : /Contains Chinese address text/);
  }
});
test('initial unloaded component never offers an enabled editor or a false missing result', () => {
  const html = renderToStaticMarkup(React.createElement(TripItemAddress, { context, locale: 'en', blocked: false, settledEpoch: 'initial', prepare: async () => {} }));
  assert.match(html, /Reading the current version/); assert.match(html, /disabled/); assert.doesNotMatch(html, /Not provided/);
});
test('original proposal diff renders authoritative raw before/after only for exact base/item/digest', () => {
  const snapshot = address => ({ version: address ? 4 : 3, days: [{ id: 'day', items: [{ id: 'item', ...(address ? { chineseAddress: address } : {}) }] }] });
  const pending = { trip: { id: 'trip' }, proposal: { baseTripVersion: 3, digest: 'digest', before: snapshot(null), after: snapshot(manual), patch: { expectedVersion: 3, operations: [{ kind: 'set_item_chinese_address', dayId: 'day', itemId: 'item', text: manual.text }] } } };
  const render = p => renderToStaticMarkup(React.createElement(AddressProposalDiff, { context, locale: 'en', pending: p }));
  assert.match(render(pending), /Not provided/); assert.match(render(pending), /&lt;script&gt;/); assert.doesNotMatch(render(pending), /<button/);
  for (const change of [{ baseTripVersion: 2 }, { stale: true }, { digest: null }, { after: snapshot({ ...manual, verification: 'verified' }) }, { after: snapshot({ ...manual, text: 'different' }) }]) assert.equal(render({ ...pending, proposal: { ...pending.proposal, ...change } }), '');
});

const { TripAddressSection } = await import('../../../components/trip-address/TripAddressSection.tsx');
test('real Section starts fail closed until verified claims, without rendering stale item facts', () => {
  const data = { trip: { id: 'trip', headVersion: 3 }, confirmationState: 'confirmed', content: { days: [{ id: 'day', items: [{ id: 'item', title: 'OLD_ACTOR_PRIVATE_ITEM' }] }] } };
  const html = renderToStaticMarkup(React.createElement(TripAddressSection, { tripId: 'trip', data, locale: 'en', pending: null, blocked: false, settledEpoch: 'initial', onPrepared: () => {}, onAddressBlockChange: () => {} }));
  assert.match(html, /unavailable for the current identity/);
  assert.doesNotMatch(html, /OLD_ACTOR_PRIVATE_ITEM|textarea|Not provided/);
});
