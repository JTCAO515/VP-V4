// Feed the unmodified SQL export page with its actual synthetic owner/time.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {decodeTurnExportPage} from './validation-root/lib/server/privacy/turn-data/export.ts';
import {exportCanonical} from './validation-root/lib/server/privacy/export-dispatcher.ts';
const [file,owner,rawNow,rawLimit]=process.argv.slice(2),now=Number(rawNow),limit=Number(rawLimit ?? 1);
assert.ok(file&&owner&&Number.isFinite(now),'usage: validate-sql-page.mjs PAGE.json OWNER_UUID ORIGINAL_NOW_MS [ORIGINAL_LIMIT]');
const page=JSON.parse(readFileSync(file,'utf8'));
assert.equal(page.schemaVersion,'turn-core-export/3');
const decoded=decodeTurnExportPage(page,limit,owner,now);
assert.ok(decoded,'actual SQL page rejected by exact consumer');
assert.deepEqual(decoded.items,page.items,'consumer must preserve complete original snapshot');
assert.equal(createHash('sha256').update(exportCanonical({snapshot:decoded.items}),'utf8').digest('hex'),decoded.sourceDigest,'original snapshot digest must bind the same bytes');
console.log('actual SQL export3 page -> exact TS consumer PASS');
