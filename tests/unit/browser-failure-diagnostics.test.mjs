import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { browserFailureDiagnostics } from '../integration/knowledge/fixtures/browser-failure-diagnostics.mjs';
const origin = 'http://127.0.0.1:56931';
const request = (url, method = 'GET') => ({ url: () => url, method: () => method,
 headers: () => { throw Error('headers must never be read'); }, postData: () => { throw Error('body must never be read'); } });
const response = (url, status) => ({ status: () => status, request: () => request(url), body: () => { throw Error('response body must never be read'); } });

test('failure diagnostic locates same-origin resource404 without secret query, fragment, credentials or raw error text', () => {
 const page = new EventEmitter(), errors = [], output = [];
 const diagnostics = browserFailureDiagnostics(page, { origin, errors, emit: value => output.push(value) });
 diagnostics.setPhase('author_login');
 page.emit('response', response('http://user-secret:password-secret@127.0.0.1:56931/_next/static/chunks/missing.js?authorization=Bearer-TOKEN#cookie-SECRET', 404));
 page.emit('requestfailed', request(origin + '/api/ops/review?token=QUERY_SECRET'));
 page.emit('console', { type: () => 'error', text: () => { throw Error('raw console text must not be read'); } });
 page.emit('pageerror', { name: 'TypeError', message: 'Authorization: TOKEN_COOKIE_PRIVATE_BODY' });
 let originalFailure;
 assert.throws(() => { try { assert.deepEqual(errors, []); } catch (error) { originalFailure = error; diagnostics.reportFailure(error); throw error; } }, error => error === originalFailure);
 assert.ok(originalFailure instanceof assert.AssertionError, 'the unchanged errors==[] still fails');
 assert.equal(output.length, 1); assert.equal(output[0].failure, 'AssertionError');
 assert.deepEqual(output[0].events[0], { phase: 'author_login', event: 'http_failure', method: 'GET', scope: 'same_origin', pathname: '/_next/static/chunks/missing.js', status: 404 });
 const text = JSON.stringify(output);
 for (const secret of ['user-secret', 'password-secret', 'Bearer-TOKEN', 'cookie-SECRET', 'QUERY_SECRET', 'Authorization', 'TOKEN_COOKIE_PRIVATE_BODY', '?', '#']) assert.ok(!text.includes(secret));
 diagnostics.dispose(); assert.equal(page.listenerCount('response'), 0);
});

test('external/unknown resource paths and untrusted classification/phase are not disclosed', () => {
 const page = new EventEmitter(), errors = [], output = [];
 const diagnostics = browserFailureDiagnostics(page, { origin, errors, emit: value => output.push(value) });
 diagnostics.setPhase('secret-phase');
 page.emit('response', response('https://secret-user:secret-password@private.example/private/credential-secret?secret-query#secret-fragment', 503));
 page.emit('response', response(origin + '/private/credential-secret?secret-query', 404));
 page.emit('response', response(origin + '/auth/reset/secret-path', 404));
 page.emit('response', response(origin + '/_next/static/chunks/%73ecret-path.js', 404));
 page.emit('response', response(origin + '/_next/static/chunks/authorization-secret.js', 404));
 page.emit('pageerror', { name: 'secret-error', message: 'secret-message' });
 diagnostics.reportFailure({ name: 'secret-failure', message: 'secret-message' });
 assert.deepEqual(output[0].events[0], { phase: 'unknown_phase', event: 'http_failure', method: 'GET', scope: 'external_origin', status: 503 });
 for (const event of output[0].events.slice(1, 5)) assert.equal(event.pathname, '[redacted_path]');
 assert.ok(!JSON.stringify(output).includes('secret')); diagnostics.dispose();
});

test('success emits no diagnostic and response observation never changes the original error assertion', () => {
 const page = new EventEmitter(), errors = [], output = [];
 const diagnostics = browserFailureDiagnostics(page, { origin, errors, emit: value => output.push(value) });
 page.emit('response', response(origin + '/_next/static/chunks/ok.js', 200));
 page.emit('response', response(origin + '/favicon.ico', 404));
 page.emit('console', { type: () => 'warning', text: () => 'private warning' });
 assert.deepEqual(errors, []); assert.deepEqual(output, []);
 diagnostics.dispose();
});

test('diagnostic retention is bounded without filtering or swallowing any console error', () => {
 const page = new EventEmitter(), errors = [], output = [];
 const diagnostics = browserFailureDiagnostics(page, { origin, errors, emit: value => output.push(value) });
 for (let i = 0; i < 40; i++) page.emit('console', { type: () => 'error' });
 assert.equal(errors.length, 40);
 assert.throws(() => assert.deepEqual(errors, []), assert.AssertionError);
 diagnostics.reportFailure({ name: 'Error' });
 assert.equal(output[0].events.length, 32); assert.equal(output[0].droppedEvents, 8);
 diagnostics.dispose();
});
