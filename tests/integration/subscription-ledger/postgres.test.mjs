import test from 'node:test';
const enabled=process.env.SUBSCRIPTION_LEDGER_PG==='1';
test('subscription private PG17 persistence and denial vectors',{skip:!enabled},async t=>{
 const {run}=await import('./selected-cases.mjs');await run(t);
});
if(!enabled) console.log('INCOMPLETE: private subscription PG gated; no resource started');

test('cross-ledger pinned candidate and actual writer concurrency',{skip:!enabled},async t=>{
 const {runCrossLedger}=await import('./cross-ledger-cases.mjs');await runCrossLedger(t);
});
