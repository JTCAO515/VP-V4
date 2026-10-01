import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { catalog, compare, snapshot, repo, normalizeSchemaDump } from '../../../scripts/acceptance/v5-staging-migration-set.mjs';
import { resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
const local = catalog();
test('exact audited gap includes migration below applied max', () => {
  const report = compare(local, snapshot(resolve(repo,'tests/fixtures/v5-staging-migration/observed-20261001.json')).applied);
  assert.equal(report.appliedCount,75); assert.equal(report.localCount,local.length);
  assert.equal(report.missing.filter(v=>v<='20260930020000').length,15); assert.deepEqual(report.unknown,[]);
  assert.deepEqual(report.outOfOrderMissing,['20260922033000']);
  assert.ok(report.missing.includes('20260930020000'));
});
test('unknown history fails replay eligibility; duplicate and unordered history fail closed', () => {
  assert.equal(compare(local,['19990101000000']).replayable,false);
  assert.throws(()=>compare(local,[local[0].version,local[0].version]),/DUPLICATE_APPLIED/);
  assert.throws(()=>compare(local,[local[1].version,local[0].version]),/OUT_OF_ORDER_APPLIED/);
  assert.throws(()=>compare([local[0],local[0]],[]),/DUPLICATE_LOCAL/);
  assert.throws(()=>compare([local[1],local[0]],[]),/OUT_OF_ORDER_LOCAL/);
  assert.throws(()=>compare(local,['postgres://secret']),/INVALID_APPLIED/);
});
test('full and empty history use set difference; SQL digests bind the catalog', () => {
  assert.deepEqual(compare(local,local.map(m=>m.version)).missing,[]);
  assert.equal(compare(local,[]).missing.length,local.length);
  const changed=local.map(m=>({...m}));changed[0].sha256='changed';
  assert.notEqual(compare(changed,[]).catalogSha256,compare(local,[]).catalogSha256);
});
test('replay refuses target arguments and remote Docker overrides before creating resources', () => {
  for (const args of [['--execute','postgres://remote'],['--dsn','postgres://remote']]) {
    const result=spawnSync(process.execPath,['scripts/acceptance/v5-staging-migration-replay.mjs',...args],{cwd:repo,encoding:'utf8'});
    assert.notEqual(result.status,0);assert.match(result.stderr,/USAGE/);
  }
  const result=spawnSync(process.execPath,['scripts/acceptance/v5-staging-migration-replay.mjs','--execute'],{cwd:repo,encoding:'utf8',env:{...process.env,DOCKER_HOST:'tcp://remote:2375'}});
  assert.notEqual(result.status,0);assert.match(result.stderr,/DOCKER_OVERRIDE/);
});

test('schema normalization ignores TOC order but detects ACL and definition changes', () => {
  const a='-- Name: a; Type: FUNCTION;\nSELECT 1;\n-- Name: b; Type: ACL;\nGRANT EXECUTE ON FUNCTION a() TO authenticated;\n\\unrestrict random';
  const b='-- header\n\\restrict other\n-- Name: b; Type: ACL;\nGRANT EXECUTE ON FUNCTION a() TO authenticated;\n-- Name: a; Type: FUNCTION;\nSELECT 1;';
  assert.deepEqual(normalizeSchemaDump(a),normalizeSchemaDump(b));
  assert.notDeepEqual(normalizeSchemaDump(a),normalizeSchemaDump(b.replace('authenticated','anon')));
  assert.notDeepEqual(normalizeSchemaDump(a),normalizeSchemaDump(b.replace('SELECT 1','SELECT 2')));
  assert.throws(()=>normalizeSchemaDump(''),/SCHEMA_DUMP_EMPTY/);
  assert.throws(()=>normalizeSchemaDump(a+'\n-- Name: a; Type: FUNCTION;\nSELECT 2;'),/SCHEMA_DUMP_DUPLICATE/);
});

test('unknown snapshot refuses replay before any resource is created', () => {
  const dir=mkdtempSync(join(tmpdir(),'v5-migration-unit-'));
  try {
    const path=join(dir,'unknown.json');
    writeFileSync(path,JSON.stringify({schemaVersion:'v5-migration-version-snapshot/1',provenance:'unit synthetic',applied:['19990101000000']}));
    const r=spawnSync(process.execPath,['scripts/acceptance/v5-staging-migration-replay.mjs','--execute','--snapshot',path],{cwd:repo,encoding:'utf8'});
    assert.notEqual(r.status,0);const report=JSON.parse(r.stderr);
    assert.match(report.reason,/UNKNOWN_APPLIED_VERSION/);assert.deepEqual(report.cleanup,[]);
    assert.deepEqual(report.versionSet.unknown,['19990101000000']);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
