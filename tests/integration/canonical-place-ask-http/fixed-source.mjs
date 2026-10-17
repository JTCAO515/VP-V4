import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const repo=fileURLToPath(new URL('../../../',import.meta.url));
const allowed=path=>/^(?:supabase\/migrations\/[a-z0-9_]+\.sql|tests\/integration\/(?:canonical-place-ask-sql\/(?:fixtures|db)\.mjs|turn\/fixtures\/durable-work-schema\.sql))$/.test(path);
/** Coherent checkout only, with every executable SQL/helper source version-pinned.
 * No runtime source-commit input, private Git-object dependency or live peer path. */
export async function fixedSource(){
 const manifest=JSON.parse(readFileSync(new URL('./source-manifest.json',import.meta.url),'utf8'));
 if(manifest.schemaVersion!=='canonical-place-http-sql-input/1'||manifest.acceptedBaseline!=='ead1efc19f2f540d9056eb37ed90333388b0c8a9'||!/^[a-f0-9]{40}$/.test(manifest.reviewedSQLCheckpoint??'')||!manifest.files||!Array.isArray(manifest.migrations)||!manifest.migrations.length)throw Error('SQL input manifest is not frozen from an integrated reviewed checkout');
 const pins={},contents=new Map();
 for(const[path,expected]of Object.entries(manifest.files)){
  if(!allowed(path)||!/^[a-f0-9]{64}$/.test(expected))throw Error('Unregistered fixed SQL input');
  const bytes=readFileSync(resolve(repo,path)),actual=createHash('sha256').update(bytes).digest('hex');
  if(actual!==expected)throw Error('Fixed SQL source SHA mismatch: '+path);
  contents.set(path,bytes.toString('utf8'));pins[path]=actual;
 }
 const readSource=path=>{if(!contents.has(path))throw Error('Unpinned SQL input');return contents.get(path);};
 const append='supabase/migrations/20261015083120_agent005_canonical_place_ask.sql';
 const inventory=readdirSync(resolve(repo,'supabase/migrations')).filter(p=>p.endsWith('.sql')).sort().map(p=>'supabase/migrations/'+p);
 if(new Set(manifest.migrations).size!==manifest.migrations.length||!manifest.migrations.includes(append)||JSON.stringify(manifest.migrations)!==JSON.stringify(inventory)||manifest.migrations.some(p=>!p.startsWith('supabase/migrations/')||!contents.has(p)))throw Error('Incomplete fixed migration inventory');
 for(const path of ['tests/integration/turn/fixtures/durable-work-schema.sql','tests/integration/canonical-place-ask-sql/fixtures.mjs','tests/integration/canonical-place-ask-sql/db.mjs'])readSource(path);
 const {canonicalFixturePorts}=await import(pathToFileURL(resolve(repo,'tests/integration/canonical-place-ask-sql/fixtures.mjs')).href);
 if(typeof canonicalFixturePorts!=='function')throw Error('Pinned SQL fixture lacks own-connection portable interface');
 return {checkpoint:manifest.reviewedSQLCheckpoint,pins,readSource,migrations:manifest.migrations,canonicalFixturePorts};
}
