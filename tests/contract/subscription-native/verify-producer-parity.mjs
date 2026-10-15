/** Pure source/codec parity. Never invokes Apple, SQL, credentials or an HTTP transport. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const [catalogRoot, ledgerRoot] = process.argv.slice(2);
assert(catalogRoot && ledgerRoot, 'Pass exact producer repository roots');
const catalog = await import(pathToFileURL(resolve(catalogRoot, 'lib/server/entitlements/subscription-development/presentation.ts')));
const ledger = await import(pathToFileURL(resolve(ledgerRoot, 'lib/server/entitlements/subscription-ledger/contract.ts')));
for (const locale of ['en', 'zh']) {
  const fixture = JSON.parse(await readFile(new URL(`Fixtures/catalog-${locale}.json`, import.meta.url)));
  assert.deepEqual(fixture.data, catalog.subscriptionDevelopmentPresentation(locale));
}
const samples = JSON.parse(await readFile(new URL('Fixtures/producer-entitlements.json', import.meta.url)));
for (const sample of samples) assert(ledger.parseSnapshot(sample.data), `Producer rejected synthetic ${sample.data.state}`);
assert.deepEqual(samples.find(s => s.data.state === 'unavailable').data, ledger.closedSnapshot());
assert.deepEqual(samples.find(s => s.data.state === 'reconciliation_required').data, ledger.closedSnapshot('reconciliation_required'));
console.log('PASS exact catalog presentation output and six synthetic entitlement samples accepted by actual closed server producer parser; no signature/runtime proof');
