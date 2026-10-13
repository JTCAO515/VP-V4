// Read-only Main-reviewed migration overlay. Never modifies repository migrations.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { catalog as original, digest, repo } from '../acceptance/v5-staging-migration-set.mjs';
export function catalog() {
  const local=original();
  const item=local.find(m=>m.version==='20261013050429');assert.ok(item);
  const sql=readFileSync(resolve(repo,'artifacts/QAWEB/staging-replay/qa-migration-reviewed.sql'),'utf8');
  const sha256=digest(sql);
  assert.equal(sha256,'835cb185a1027949da9670c75f72e6cd62b49c25fd5ae0dcf88f8c87e0a477ba');
  return local.map(m=>m===item?{...m,sql,sha256}:m);
}
