// One owned disposable PostgreSQL suite; SQL claims are distinct from signed Auth.
import test from 'node:test';import assert from 'node:assert/strict';import{mkdtemp,readFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{command}from'../../cost/fixtures/postgres-rpc.mjs';
test('Turn source, actual erasure, permanent identities and original D2',{skip:process.env.VP_TURN_DATA_SQL!=='1',timeout:300000},async t=>{
 assert.ok(!process.env.DOCKER_HOST&&!process.env.DOCKER_CONTEXT);const dir=await mkdtemp(join(tmpdir(),'vp-turn-sql-'));process.env.VP_TURN_SQL_FIXTURE_DIR=dir;
 t.after(async()=>{let cn;try{cn=(await readFile(join(dir,'vpj58-turn-sql-container'),'utf8')).trim();}catch{}if(cn){assert.match(cn,/^vpj58-turn-[a-f0-9]{8}$/);assert.equal((await command('docker',['rm','-f',cn])).code,0);}delete process.env.VP_TURN_SQL_FIXTURE_DIR;await rm(dir,{recursive:true,force:true});});
 const run=async file=>{const r=await command(process.execPath,['tests/integration/privacy/turn-data-sql/'+file+'.mjs']);assert.equal(r.code,0,r.stderr||r.stdout);t.diagnostic(r.stdout.trim());};
 await t.test('exact fresh complete migration and fixed helpers',()=>run('runtime'));
 if(process.env.VP_TURN_DATA_SQL_CAPACITY_ONLY==='1'){await run('behavior');await t.test('affected capacity/absolute deadline repair',async()=>{await run('capacity');await run('deadline');});return;}
 await t.test('actual selected legacy source and bounded own progress exact-byte recovery',async()=>{await run('behavior');await run('progress');await run('negatives');});
 await t.test('actual original independent message producer and scoped sensitive effects',async()=>{await run('original-producer');await run('sensitive');await run('late-writers');});
 await t.test('source writer concurrency and strict immutable/helper drift',async()=>{await run('concurrency');await run('strict-drift');});
 await t.test('bounded UTF8/root capacity and absolute original 30s expiry',async()=>{await run('capacity');await run('deadline');});
 await t.test('original D2 canonical encrypted private lifecycle and supplemental key projection',async()=>{await run('export-snapshot');await run('d2');});
 await t.test('session fences and original account/ownerless-child cleanup',()=>run('cascade'));
 // Separate actual original task-bound and historical raw Turn-ID ledger case after cascade.
 await t.test('original canonical and legacy financial source retention',async()=>{await run('behavior');await run('budget');});
});
