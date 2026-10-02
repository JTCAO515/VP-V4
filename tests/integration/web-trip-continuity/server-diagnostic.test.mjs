import test from 'node:test';import assert from 'node:assert/strict';
import {createSafeServerDiagnostic} from './server-diagnostic.mjs';
test('safe server observer retains cause/class/frame but never raw request secrets or arbitrary prefixes',()=>{
 const events=[],p=createSafeServerDiagnostic(e=>events.push(e),()=>0),secret='SYNTHETIC_COOKIE_BEARER_SECRET';
 p.write('stderr',`Error: failed to pipe response\n [cause]: TypeError: Invalid state: Controller is already closed\n code: 'ERR_INVALID_STATE'\n at fn (/private/user/project/node_modules/next/dist/server/response.js:12:5)\nCookie: ${secret}\nAuthorization: ${secret}\nSAFE_SERVER_ERROR ${secret}\nGET https://secret.test/${secret}\n`);
 assert.ok(events.some(e=>e.cause&&e.category==='response_stream'));assert.ok(events.some(e=>e.code==='ERR_INVALID_STATE'));assert.ok(events.some(e=>e.frame==='node_modules/next/dist/server/response.js:12:5'));assert.ok(!JSON.stringify(events).includes(secret));assert.ok(!JSON.stringify(events).includes('/private/user'));
 p.write('stdout','x'.repeat(100000));assert.ok(p.retainedCharacters<=4096);p.end('stdout');
});

test('ordinary compile/request chatter cannot consume reserved late error evidence',()=>{
 const events=[],p=createSafeServerDiagnostic(e=>events.push(e),()=>0),secret='SYNTHETIC_HEADER_TOKEN';
 for(let i=0;i<1000;i++)p.write('stdout',`Compiled ${secret}\nGET /api/trips/11111111-1111-4111-8111-111111111111/proposal 200\n`);
 p.write('stderr',`INFO node_modules/next/not-a-stack.js:1:2 ${secret}\nError: failed to pipe response\n [cause]: TypeError: Invalid state: Controller is already closed\n at fn (/private/path/node_modules/next/dist/server/response.js:12:5)\n code: ERR_INVALID_STATE\nCookie: ${secret}\n`);
 assert.equal(p.counts.ordinary,24);assert.ok(p.counts.errors>0);assert.ok(events.some(e=>e.category==='response_pipe'));assert.ok(events.some(e=>e.cause&&e.category==='response_stream'));assert.ok(events.some(e=>e.frame==='node_modules/next/dist/server/response.js:12:5'));assert.ok(!events.some(e=>e.frame?.includes('not-a-stack')));assert.ok(!JSON.stringify(events).includes(secret));
 for(let i=0;i<1000;i++)p.write('stderr','Error: invalid state\n');assert.equal(p.counts.errors,72);assert.equal(events.length,96);p.write('stderr','x'.repeat(100000));assert.ok(p.retainedCharacters<=8192);
});
