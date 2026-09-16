import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync('app/testing-chat/TestingChat.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness() {
  let state, cleanup, listener, resolveClaims, rejectClaims, unsubscribed = false;
  const claims = new Promise((resolve, reject) => { resolveClaims = resolve; rejectClaims = reject; });
  const auth = {
    getClaims: () => claims,
    onAuthStateChange: (callback) => {
      listener = callback;
      return { data: { subscription: { unsubscribe: () => { unsubscribed = true; } } } };
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => {
      if (name === 'react') return {
        useState: (initial) => { state ??= initial; return [state, (next) => { state = next; }]; },
        useEffect: (effect) => { cleanup ??= effect(); },
      };
      if (name === 'react/jsx-runtime') return { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) };
      if (name.endsWith('browser-auth-client')) return { createPasswordAuthClient: () => ({ auth }) };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  exports.TestingChat({ signInFallback: null });
  return {
    get state() { return state.status; },
    render: () => exports.TestingChat({ signInFallback: null }),
    get unsubscribed() { return unsubscribed; },
    event: (name, owner) => listener(name, owner ? { user: { id: owner } } : null),
    resolve: async (owner) => { resolveClaims({ data: { claims: owner ? { sub: owner } : null }, error: null }); await claims; await Promise.resolve(); },
    reject: async () => { rejectClaims(new Error('unavailable')); await claims.catch(() => {}); await Promise.resolve(); },
    cleanup: () => cleanup(),
  };
}

test('login on the current route leaves the fallback without navigation or reload; logout hides chat', async () => {
  const h = harness();
  await h.resolve(null);
  assert.equal(h.state, 'signedOut');
  h.event('SIGNED_IN', 'test-owner');
  assert.equal(h.state, 'signedIn');
  h.event('SIGNED_OUT', null);
  assert.equal(h.state, 'signedOut');
  h.cleanup();
});

test('a stale initial lookup cannot undo a newer login or logout', async () => {
  for (const signedIn of [true, false]) {
    const h = harness();
    h.event(signedIn ? 'SIGNED_IN' : 'SIGNED_OUT', signedIn ? 'test-owner' : null);
    await h.resolve(signedIn ? null : 'test-owner');
    assert.equal(h.state, signedIn ? 'signedIn' : 'signedOut');
    h.cleanup();
  }
  const h = harness();
  h.event('SIGNED_IN', 'test-owner');
  await h.reject();
  assert.equal(h.state, 'signedIn');
  h.cleanup();
});

test('existing sessions and initial authentication failures settle the loading state', async () => {
  const h = harness();
  await h.resolve('test-owner');
  assert.equal(h.state, 'signedIn');
  h.cleanup();
  const failed = harness();
  await failed.reject();
  assert.equal(failed.state, 'signedOut');
  failed.cleanup();
});

test('unmount unsubscribes and ignores queued auth callbacks and pending claims', async () => {
  const h = harness();
  h.cleanup();
  assert.equal(h.unsubscribed, true);
  h.event('SIGNED_IN', 'test-owner');
  await h.resolve('test-owner');
  assert.equal(h.state, 'checking');
});


test('direct account replacement remounts private consent/chat state; refresh keeps the owner', async () => {
  const h = harness();
  await h.resolve('owner-a');
  assert.equal(h.render().key, 'owner-a');
  h.event('TOKEN_REFRESHED', 'owner-a');
  assert.equal(h.render().key, 'owner-a');
  h.event('SIGNED_IN', 'owner-b');
  assert.equal(h.state, 'signedIn');
  assert.equal(h.render().key, 'owner-b');
  h.cleanup();
});
