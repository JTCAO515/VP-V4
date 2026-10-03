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

test('SyntaxError categories and internal/webpack frames distinguish parsing from module load without messages',()=>{
 const events=[],p=createSafeServerDiagnostic(e=>events.push(e),()=>0),secret='SYNTHETIC_RESPONSE_COOKIE_SECRET';
 for(const [message,category] of [
  [`Unexpected token '<', "${secret}" is not valid JSON`,'json_unexpected_token'],
  [`Unexpected end of JSON input ${secret}`,'json_unexpected_end'],
  [`Expected property name or '}' in JSON at position 1 ${secret}`,'json_parse'],
  [`Cannot use import statement outside a module ${secret}`,'module_syntax'],
  [`Unexpected token 'export' ${secret}`,'module_syntax'],
  [`Invalid or unexpected token ${secret}`,'module_syntax'],
  [`opaque ${secret}`,'syntax_unknown'],
 ]){p.write('stderr',`SyntaxError: ${message}\n`);assert.equal(events.at(-1).category,category);}
 p.write('stderr',` at JSON.parse (<anonymous>)\n at parseJSONFromBytes (node:internal/deps/undici/undici:5738:19)\n at Module._compile (node:internal/modules/cjs/loader:1662:20)\n at loadManifest (webpack-internal:///(rsc)/./node_modules/next/dist/server/load-manifest.external.js:54:25)\n at loadComponents (webpack-internal:///(rsc)/./node_modules/next/dist/server/load-components.js:49:31)\n at parse (/private/project/node_modules/@supabase/postgrest-js/dist/cjs/PostgrestBuilder.js:91:23)\n at eval (/private/project/.next/server/webpack-runtime.js:11:2)\n at token (node:internal/${secret}:1:2)\nINFO node:internal/vm:1:2\n`);
 for(const frame of ['JSON.parse (<anonymous>)','node:internal/deps/undici/undici:5738:19','node:internal/modules/cjs/loader:1662:20','node_modules/next/dist/server/load-manifest.external.js:54:25','node_modules/next/dist/server/load-components.js:49:31','node_modules/@supabase/postgrest-js/dist/cjs/PostgrestBuilder.js:91:23','.next/server/webpack-runtime.js:11:2'])assert.ok(events.some(e=>e.frame===frame),frame);
 assert.ok(!events.some(e=>e.frame==='node:internal/vm:1:2'));assert.ok(!JSON.stringify(events).includes(secret));assert.ok(!JSON.stringify(events).includes('/private/project'));assert.ok(!JSON.stringify(events).includes('webpack-internal'));assert.ok(!JSON.stringify(events).includes('loadManifest'));
});
