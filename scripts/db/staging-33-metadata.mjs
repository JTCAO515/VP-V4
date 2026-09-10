import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Explicit, metadata-only official CLI access. No local linking, secret lookup, raw errors or writes.
assert.deepEqual(process.argv.slice(2), ['--read-staging-metadata']);
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const directory=root+'/artifacts/VPJ-02/staging-33-preparation';
function cli(args) {
  const r=spawnSync('supabase',args,{cwd:root,encoding:'utf8',timeout:45000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']});
  if(r.error||r.status!==0)throw new Error('Official CLI metadata request failed; raw output suppressed');
  try{return JSON.parse(r.stdout);}catch{throw new Error('Unrecognized CLI metadata response; raw output suppressed');}
}
try {
  const projects=cli(['projects','list','--output-format','json']).projects;
  assert.ok(Array.isArray(projects),'Project envelope changed');
  const matches=projects.filter(p=>p.name==='VP - V4'&&p.region==='ap-southeast-1');
  assert.equal(matches.length,1,'Staging target absent/ambiguous');assert.equal(matches[0].status,'ACTIVE_HEALTHY');
  const ref=matches[0].ref||matches[0].id;assert.match(ref,/^[a-z0-9]+$/);
  const result=cli(['db','query','--linked','--project-ref',ref,'--file',root+'/scripts/db/staging-33-readonly.sql','--output-format','json']);
  assert.equal(result.rows.length,1);
  const inventory=typeof result.rows[0].inventory==='string'?JSON.parse(result.rows[0].inventory):result.rows[0].inventory;
  assert.deepEqual(Object.keys(inventory).sort(),['authAccountCount','tripCount','migrations','authenticatedPublicDefiners','authenticatedTripUpdate','nativeSessionTablePresent','textPolicyTablePresent','budgetStopPresent','opsSnapshotPresent'].sort());
  const manifest=JSON.parse(readFileSync(directory+'/migrations.json','utf8'));
  const versionsMatch=inventory.migrations.length===26&&inventory.migrations.every((m,i)=>m.version===manifest.migrations[i].version&&m.name===manifest.migrations[i].file.split('/').at(-1).slice(15,-4));
  const source=readFileSync(root+'/'+manifest.migrations[26].file,'utf8');
  const normalize=s=>s.replace(/^public\./,'').replaceAll(', ', ',');
  const frozen=Object.fromEntries([...source.matchAll(/\('([^']+)', '([a-f0-9]{32})'\)/g)].map(m=>[normalize(m[1]),m[2]]));
  assert.equal(Object.keys(frozen).length,15);
  const actual=Object.fromEntries(inventory.authenticatedPublicDefiners.map(r=>[normalize(r.signature),r.sourceMd5]));
  const differences=[...new Set([...Object.keys(frozen),...Object.keys(actual)])].sort().filter(k=>actual[k]!==frozen[k]).map(k=>({signature:k,expectedMd5:frozen[k]??null,actualMd5:actual[k]??null}));
  const evidence={observedAt:new Date().toISOString(),target:{name:'VP - V4',region:'ap-southeast-1',status:'ACTIVE_HEALTHY',projectRefRecorded:false},
    operation:'official CLI Management API; BEGIN READ ONLY / ROLLBACK',inventory,migrationVersionNameMatch26:versionsMatch,
    migration27FrozenDefinerBodiesMatch15:differences.length===0,definerDifferences:differences,remoteMutations:0};
  writeFileSync(directory+'/staging-metadata.json',JSON.stringify(evidence,null,2)+'\n');
  const ready=versionsMatch&&differences.length===0;
  console.log(JSON.stringify({result:ready?'PREFLIGHT_METADATA_MATCH':'BLOCKED',migrationCount:inventory.migrations.length,
    expectedDefiners:15,observedDefiners:inventory.authenticatedPublicDefiners.length,definerDifferences:differences.length,remoteMutations:0}));
  if(!ready)process.exitCode=2;
} catch {console.error('Staging metadata not verified; raw response and target identifiers suppressed');process.exitCode=1;}
