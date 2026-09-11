import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Produces a new unlinked directory, never runs a Supabase command or copies local configuration.
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const args=process.argv.slice(2);assert.equal(args.length,2);assert.equal(args[0],'--out');assert.ok(isAbsolute(args[1]));
const output=resolve(realpathSync(dirname(args[1])),args[1].split('/').at(-1));
const raw=readFileSync(root+'/artifacts/VPJ-07/staging-36-preparation/migrations.json');
const manifest=JSON.parse(raw);assert.equal(manifest.targetCount,36);assert.equal(manifest.migrations.length,36);
const sha=value=>createHash('sha256').update(value).digest('hex');
const frozen=manifest.migrations.map((m,i)=>{
  assert.equal(m.ordinal,i+1);assert.match(m.file,/^supabase\/migrations\/[0-9]{14}_[a-z0-9_]+\.sql$/);
  const bytes=readFileSync(root+'/'+m.file);assert.equal(sha(bytes),m.sha256,'Frozen migration changed');return {m,bytes};
});
assert.equal(manifest.lastVerifiedStagingCount,33);
assert.deepEqual(manifest.administrativePreparation,[],'No repeated ACL normalization or other administrative SQL');
const administrative=manifest.administrativePreparation.map(m=>{
  assert.match(m.file,/^scripts\/db\/staging-33-[a-z0-9-]+\.sql$/);
  const bytes=readFileSync(root+'/'+m.file);assert.equal(sha(bytes),m.sha256,'Administrative preparation changed');return {m,bytes};
});
const sourceNames=frozen.map(({m})=>m.file.split('/').at(-1));
const excluded=readdirSync(root+'/supabase/migrations').filter(f=>f.endsWith('.sql')&&!sourceNames.includes(f)).sort();
assert.ok(excluded.every(f=>f>sourceNames.at(-1)),'Unreviewed earlier migration: do not silently exclude');
// mkdir without recursive is the exclusive creation gate. Existing directories/symlinks are refused.
mkdirSync(output,{mode:0o700});mkdirSync(output+'/supabase',{mode:0o700});mkdirSync(output+'/supabase/migrations',{mode:0o700});
for(const {m,bytes} of frozen)writeFileSync(output+'/'+m.file,bytes,{flag:'wx',mode:0o600});
writeFileSync(output+'/supabase/config.toml','project_id = "vpj07-staging-36-frozen"\n',{flag:'wx',mode:0o600});
writeFileSync(output+'/migration-manifest.json',raw,{flag:'wx',mode:0o600});
mkdirSync(output+'/administrative-preflight',{mode:0o700});
for(const {m,bytes} of administrative)writeFileSync(output+'/administrative-preflight/'+m.file.split('/').at(-1),bytes,{flag:'wx',mode:0o600});
const emitted=readdirSync(output+'/supabase/migrations').sort();assert.deepEqual(emitted,frozen.map(({m})=>m.file.split('/').at(-1)));
console.log(JSON.stringify({result:'FROZEN_PACKAGE_CREATED',count:36,manifestSha256:sha(raw),laterMigrationsExcluded:excluded,
  linked:false,remoteActions:0,activation:false}));
