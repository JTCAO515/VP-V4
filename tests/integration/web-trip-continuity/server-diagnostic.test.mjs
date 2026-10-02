import test from 'node:test';import assert from 'node:assert/strict';
import {createSafeServerDiagnostic} from './server-diagnostic.mjs';
test('safe server observer retains cause/class/frame but never raw request secrets or arbitrary prefixes',()=>{
 const events=[],p=createSafeServerDiagnostic(e=>events.push(e),()=>0),secret='SYNTHETIC_COOKIE_BEARER_SECRET';
 p.write('stderr',`Error: failed to pipe response\n [cause]: TypeError: Invalid state: Controller is already closed\n code: 'ERR_INVALID_STATE'\n at fn (/private/user/project/node_modules/next/dist/server/response.js:12:5)\nCookie: ${secret}\nAuthorization: ${secret}\nSAFE_SERVER_ERROR ${secret}\nGET https://secret.test/${secret}\n`);
 assert.ok(events.some(e=>e.cause&&e.category==='response_stream'));assert.ok(events.some(e=>e.code==='ERR_INVALID_STATE'));assert.ok(events.some(e=>e.frame==='node_modules/next/dist/server/response.js:12:5'));assert.ok(!JSON.stringify(events).includes(secret));assert.ok(!JSON.stringify(events).includes('/private/user'));
 p.write('stdout','x'.repeat(100000));assert.ok(p.retainedCharacters<=4096);p.end('stdout');
});
