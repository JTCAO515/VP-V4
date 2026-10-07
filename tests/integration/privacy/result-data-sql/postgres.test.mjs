// Actual PostgreSQL fixtures with SQL claims. Signed Auth and target acceptance
// are separate integration checks, owned by the sole TS integrator.
import test from 'node:test';import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';import {readFileSync,writeFileSync} from 'node:fs';
import {command,sql} from '../../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_PRIVACY_DB_TEST==='1'||process.env.VP_RESULT_DATA_DB_TEST==='1';
test('ResultData whole PostgreSQL source, CAS, immutable receipt, progress, copies and writer compatibility',{skip:!enabled,timeout:240000},async t=>{
 const container='vpj58-result-sql-'+uuid().slice(0,8);const prior=process.env.VP_RESULT_DATA_SQL_CONTAINER;
 process.env.VP_RESULT_DATA_SQL_CONTAINER=container;
 t.after(async()=>{assert.equal((await command('docker',['rm','-f',container])).code,0);if(prior)process.env.VP_RESULT_DATA_SQL_CONTAINER=prior;else delete process.env.VP_RESULT_DATA_SQL_CONTAINER;});
 const bootstrap=await command(process.execPath,['tests/integration/privacy/result-data-sql/ownproof/bootstrap.mjs']);assert.equal(bootstrap.code,0,bootstrap.stderr);
 const applied=await sql(container,'begin;'+readFileSync('supabase/migrations/20261007010000_result_data.sql','utf8')+'commit;');assert.equal(applied.code,0,applied.stderr);
 const invoke=async args=>{const context=process.env.NODE_TEST_CONTEXT;delete process.env.NODE_TEST_CONTEXT;try{return await command(process.execPath,args);}finally{if(context)process.env.NODE_TEST_CONTEXT=context;}};
 for(const [name,file,args] of [
  ['actual no-copy source and sole TS decoding','runtime.mjs',[]],
  ['complete original synthetic worker/execution/journal erasure with retained financial sources','copies.mjs',[]],
  ['full financial/config witness CAS and preservation','copy-witnesses.mjs',[]],
  ['mixed core queued copy blocker and stale original commit fence','core-fence.mjs',[]],
  ['historical references, ownership, mixed closure, CAS, 30s rollback, progress and permanent guards','adversarial.mjs',['--test','--test-concurrency=1']],
 ])await t.test(name,async()=>{const r=await invoke(['--experimental-strip-types',...args,'tests/integration/privacy/result-data-sql/ownproof/'+file]);
  writeFileSync('tests/integration/privacy/result-data-sql/ownproof/'+file.replace('.mjs','.log'),r.stdout+r.stderr);assert.equal(r.code,0,r.stdout+'\n'+r.stderr);
  if(args.includes('--test')){assert.match(r.stdout,/fail 0/);assert.match(r.stdout,/skipped 0/);assert.match(r.stdout,/cancelled 0/);}
 });
});
