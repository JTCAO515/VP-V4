// Keep the existing default integration convention; the required lane sets this switch.
import test from 'node:test';
test('original-role QA cancellation native PostgreSQL proof', { skip: process.env.QA_CANCEL_NATIVE_PG !== '1', timeout: 180000 }, async () => {
  await import('./pg-proof.mjs');
  if (process.exitCode) throw Error('QA cancellation PostgreSQL proof failed');
});
