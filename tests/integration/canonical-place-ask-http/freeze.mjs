// Maintainer-only freeze after Main integrates and reviews the coherent source.
// This writes test metadata, never SQL, configuration, permissions or a database.
import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../../../',import.meta.url));
const[reviewedSQLCheckpoint,checkout]=process.argv.slice(2);
if(!/^[a-f0-9]{40}$/.test(reviewedSQLCheckpoint??'')||!/^[a-f0-9]{40}$/.test(checkout??''))throw Error('Explicit reviewed SQL checkpoint and integrated HEAD SHA required');
if(execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim()!==checkout)throw Error('Integrated checkout HEAD changed');
const append='supabase/migrations/20261015083120_agent005_canonical_place_ask.sql';
const all=readdirSync(new URL('../../../supabase/migrations/',import.meta.url)).filter(p=>p.endsWith('.sql')).sort().map(p=>'supabase/migrations/'+p);
if(!all.includes(append))throw Error('Reviewed canonical migration is not integrated');
const migrations=all;
const paths=[...migrations,'tests/integration/turn/fixtures/durable-work-schema.sql','tests/integration/canonical-place-ask-sql/fixtures.mjs','tests/integration/canonical-place-ask-sql/db.mjs'];
execFileSync('git',['diff','--exit-code','HEAD','--',...paths],{cwd:repo,stdio:'pipe'});
for(const path of paths)execFileSync('git',['ls-files','--error-unmatch',path],{cwd:repo,stdio:'pipe'});
const files=Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(new URL('../../../'+p,import.meta.url))).digest('hex')]));
writeFileSync(new URL('./source-manifest.json',import.meta.url),JSON.stringify({schemaVersion:'canonical-place-http-sql-input/1',acceptedBaseline:'ead1efc19f2f540d9056eb37ed90333388b0c8a9',reviewedSQLCheckpoint,integratedCheckout:checkout,files,migrations},null,2)+'\n');
console.log('Frozen '+paths.length+' integrated SQL/helper sources; runtime needs only these checkout bytes');
