import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const manifest=JSON.parse(readFileSync(root+'/artifacts/VPJ-07/staging-36-preparation/migrations.json','utf8'));
function fixture(t){
  const temp=mkdtempSync(join(tmpdir(),'vpj02-package-test-'));
  t.after(()=>rmSync(temp,{recursive:true,force:true}));
  const source=join(temp,'source');mkdirSync(source);
  const files=['scripts/db/staging-36-package.mjs','artifacts/VPJ-07/staging-36-preparation/migrations.json',...manifest.migrations.map(m=>m.file),...manifest.administrativePreparation.map(m=>m.file)];
  for(const f of files){mkdirSync(dirname(join(source,f)),{recursive:true});copyFileSync(join(root,f),join(source,f));}
  const out=join(temp,'package');
  const run=()=>spawnSync(process.execPath,[source+'/scripts/db/staging-36-package.mjs','--out',out],{encoding:'utf8'});
  return {source,out,run};
}
test('frozen package emits exact36 and administrative hashes while excluding future migrations/config',t=>{
  const f=fixture(t);
  writeFileSync(f.source+'/supabase/migrations/20990101000000_future_not_authorized.sql','select 1;');
  writeFileSync(f.source+'/supabase/config.toml','unrelated source config must not copy');
  writeFileSync(f.source+'/.env','synthetic sentinel, not a credential');
  const r=f.run();assert.equal(r.status,0,r.stderr);const result=JSON.parse(r.stdout);
  assert.equal(result.count,36);assert.equal(result.remoteActions,0);assert.equal(result.linked,false);
  assert.deepEqual(result.laterMigrationsExcluded,['20990101000000_future_not_authorized.sql']);
  assert.equal(readdirSync(f.out+'/supabase/migrations').length,36);
  for(const m of manifest.migrations)assert.equal(createHash('sha256').update(readFileSync(f.out+'/'+m.file)).digest('hex'),m.sha256);
  assert.deepEqual(readdirSync(f.out+'/administrative-preflight'),[]);
  for(const m of manifest.administrativePreparation)assert.equal(createHash('sha256').update(readFileSync(f.out+'/administrative-preflight/'+m.file.split('/').at(-1))).digest('hex'),m.sha256);
  assert.equal(readFileSync(f.out+'/supabase/config.toml','utf8'),'project_id = "vpj07-staging-36-frozen"\n');
  assert.equal(existsSync(f.out+'/.env'),false);assert.equal(existsSync(f.out+'/supabase/.temp'),false);
});
test('existing output is refused without modifying its sentinel',t=>{
  const f=fixture(t);mkdirSync(f.out);writeFileSync(f.out+'/sentinel','preserve');
  assert.notEqual(f.run().status,0);assert.deepEqual(readdirSync(f.out),['sentinel']);assert.equal(readFileSync(f.out+'/sentinel','utf8'),'preserve');
});
test('hash drift or an unreviewed earlier migration fails before any output directory is created',t=>{
  const f=fixture(t),m=manifest.migrations[26];
  writeFileSync(f.source+'/'+m.file,readFileSync(f.source+'/'+m.file,'utf8')+'\n-- drift');
  assert.notEqual(f.run().status,0);assert.equal(existsSync(f.out),false);
  copyFileSync(root+'/'+m.file,f.source+'/'+m.file);
  writeFileSync(f.source+'/supabase/migrations/20200101000000_unreviewed.sql','select 1;');
  assert.notEqual(f.run().status,0);assert.equal(existsSync(f.out),false);
});
