// Offline metadata-only planner. No network, credentials, child processes or target writes.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'../..');
assert.equal(process.argv.length,2,'No target/connection arguments accepted');
const observed=JSON.parse(readFileSync(resolve(root,'artifacts/QAWEB/staging-replay/target-metadata.json'),'utf8'));
const old=['public','auth','storage','private','identity_private','knowledge_review_private','turn_private','supabase_migrations'];
const required=[...new Set([...observed.schemas,'auth','storage','supabase_migrations'])].sort();
const missing=required.filter(s=>!old.includes(s));
console.log(JSON.stringify({mode:'OFFLINE_PLAN_ONLY',target:'dzqdzetcctkhbrhlxxgn',observedOn:'2026-10-13',businessSchemas:observed.schemas,requiredDataSchemas:required,oldBackupSchemas:old,missingFromOldBackup:missing,oldCoverage:missing.length?'FAIL':'PASS',targetBackup:'UNRUN',restore:'UNRUN',additionalRequiredEvidence:['Fresh coherent snapshot with writes quiesced or database snapshot consistency; encrypted archive + separate recovery identity + integrity hash + retention destination approval','Role memberships/default ACLs/owners, extensions and versions, enabled event triggers and dependent functions; managed Auth/Storage handling reviewed','Restore into separately authorized isolated equivalent with supported platform schemas, role ownership and extension prerequisites','Verify constraints/indexes/triggers/RLS/ACLs/sequence values/migration history plus content-free aggregate invariants before and after upgrade','Object-store bytes are not contained in Storage metadata database backup; cover separately if applicable','No target apply until current recovery point and actual-data restore/replay are verified']},null,2));
