import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const repo = resolve(import.meta.dirname, '../..');
export const digest = value => createHash('sha256').update(value).digest('hex');
export function catalog(directory = resolve(repo, 'supabase/migrations')) {
  return readdirSync(directory).filter(f => f.endsWith('.sql')).sort().map(file => {
    const match = /^(\d{14})_([a-z0-9_]+)\.sql$/.exec(file);
    if (!match) throw Error('INVALID_LOCAL_MIGRATION_NAME');
    const sql = readFileSync(resolve(directory, file), 'utf8');
    return { version: match[1], file, sha256: digest(sql), sql };
  });
}
export function compare(local, applied) {
  const validate = (versions, name) => {
    if (!Array.isArray(versions) || versions.some(v => typeof v !== 'string' || !/^\d{14}$/.test(v))) throw Error(`INVALID_${name}_VERSIONS`);
    if (new Set(versions).size !== versions.length) throw Error(`DUPLICATE_${name}_VERSION`);
    if (versions.some((v,i) => i > 0 && v < versions[i-1])) throw Error(`OUT_OF_ORDER_${name}_VERSIONS`);
  };
  const versions = local.map(m => m.version);
  validate(versions, 'LOCAL'); validate(applied, 'APPLIED');
  const known = new Set(versions), present = new Set(applied);
  const unknown = applied.filter(v => !known.has(v));
  const missing = versions.filter(v => !present.has(v));
  const max = applied.at(-1) ?? null;
  return { localCount: versions.length, appliedCount: applied.length, unknown, missing,
    outOfOrderMissing: missing.filter(v => max !== null && v < max),
    catalogSha256: digest(JSON.stringify(local.map(({version,file,sha256}) => ({version,file,sha256})))),
    replayable: unknown.length === 0 };
}
export function snapshot(path) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) throw Error('LOCAL_SNAPSHOT_REQUIRED');
  const value = JSON.parse(readFileSync(path, 'utf8'));
  if (value.schemaVersion !== 'v5-migration-version-snapshot/1' || typeof value.provenance !== 'string') throw Error('INVALID_SNAPSHOT');
  return value;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--compare') throw Error('USAGE: --compare <local version snapshot JSON>; no DSN accepted');
    const input = snapshot(process.argv[3]);
    const report = compare(catalog(), input.applied);
    console.log(JSON.stringify({ ...report, provenance: input.provenance }, null, 2));
    if (!report.replayable) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

// Preserve every SQL statement and permission in each pg_dump TOC block.
// Only metadata comments, random restrict tokens and OID-driven TOC order differ.
export function normalizeSchemaDump(dump) {
  const blocks = dump.split(/(?=^-- Name:)/m).filter(block => block.startsWith('-- Name:')).map(block => {
    const key = block.split('\n')[0];
    const value = block.split('\n').slice(1).filter(line => !/^\\(?:un)?restrict [A-Za-z0-9]+$/.test(line)).join('\n').trim();
    return [key, value];
  }).filter(([, value]) => value).sort(([a], [b]) => a.localeCompare(b));
  if (blocks.length === 0) throw Error('SCHEMA_DUMP_EMPTY_OR_UNRECOGNIZED');
  if (new Set(blocks.map(([key]) => key)).size !== blocks.length) throw Error('SCHEMA_DUMP_DUPLICATE_KEY');
  return blocks;
}
