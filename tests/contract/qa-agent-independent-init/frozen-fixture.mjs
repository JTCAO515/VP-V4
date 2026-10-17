import {after} from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

// The operator package remains frozen at its reviewed 155 sources. Exercise its
// real, unchanged modules on those exact inputs; never enroll a later migration.
export const currentRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const sourceDir=join(currentRoot,'scripts/qa-agent-independent-init');
const bytes=readFileSync(join(sourceDir,'migration-sources.json'));
assert.equal(createHash('sha256').update(bytes).digest('hex'),'0b8ff8c6100544e82c3ecb50f54f5baa82f8c9b0fc875cc9d825ec6bcb631767');
const manifest=JSON.parse(bytes);
assert.equal(manifest.count,155);
assert.equal(manifest.sources.length,155);
const root=realpathSync(mkdtempSync(join(tmpdir(),'qa-frozen-contract-')));
after(()=>rmSync(root,{recursive:true}));
const scriptDir=join(root,'scripts/qa-agent-independent-init');
mkdirSync(scriptDir,{recursive:true});
for(const file of ['prepare.mjs','exact80.mjs','migration-sources.json','shared-baseline.json','platform-pins.json']) {
  copyFileSync(join(sourceDir,file),join(scriptDir,file));
}
for(const source of manifest.sources) {
  assert.match(source.file,/^supabase\/migrations\/[0-9]{14}_[A-Za-z0-9_-]+\.sql$/);
  const sourceBytes=readFileSync(join(currentRoot,source.file));
  assert.equal(createHash('sha256').update(sourceBytes).digest('hex'),source.sha256);
  const target=join(root,source.file);
  mkdirSync(dirname(target),{recursive:true});
  copyFileSync(join(currentRoot,source.file),target);
}
export const prepare=await import(pathToFileURL(join(scriptDir,'prepare.mjs')).href);
export const exact80=await import(pathToFileURL(join(scriptDir,'exact80.mjs')).href);
