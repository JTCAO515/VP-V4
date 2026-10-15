// Read-only local validation of Main's exact committed test blob; not a product loader.
import {registerHooks} from 'node:module';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const target=resolve('tests/integration/turn/qualified-intake-comparison.test.mjs');const fixed=resolve('artifacts/AGENT-005/canonical-place-sql-20261015/qualified-order-candidate/main-fixed.mjs');
const sha=s=>createHash('sha256').update(s).digest('hex');const source=readFileSync(fixed,'utf8');
if(sha(source)!=='63129bbff282b7b79021d33f093f2a6c7591481b583cc6e06b2eb249c7aefc7e'||sha(readFileSync(target))!=='2c32845a2e31e7e3e994a9866b43b2b33de2796326dbeb7212875742b3b5e8f2')throw Error('Qualified fixture input pin mismatch');
registerHooks({load(url,context,nextLoad){if(url===pathToFileURL(target).href)return {format:'module',source,shortCircuit:true};return nextLoad(url,context);}});
