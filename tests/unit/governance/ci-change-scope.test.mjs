import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { classifyChanges, detectScope, selectCheckPlan, detectPlan, DB_LANES } from '../../../scripts/ci-change-scope.mjs';

test('cancellation source and the exact PG entry select native17 while the HTTP fixture stays ordinary integration',()=>{
 for(const file of ['lib/server/qa-agent/cancellation/http.ts','lib/server/qa-agent/cancellation/service.ts',
  'lib/qa-agent/cancellation-contract.ts','lib/server/qa-agent/config.ts',
  'app/api/qa-agent/sessions/[sessionId]/messages/[requestId]/cancellation/route.ts',
  'tests/contract/qa-agent-cancellation/uuid-case.test.mjs',
  'tests/integration/qa-agent-cancellation/native-pg.test.mjs','tests/integration/qa-agent-cancellation/pg-proof.mjs']){
  assert.ok(selectCheckPlan([file],'pull_request').dbLanes.includes('postgres-native-17'),file);
 }
 const http=selectCheckPlan(['tests/integration/qa-agent-cancellation/http.test.mjs'],'pull_request');
 assert.equal(http.checks.integration,true);assert.deepEqual(http.dbLanes,[]);
});

test('only bounded documentation pull requests use the smaller check set', () => {
  assert.equal(classifyChanges(['README.md', 'docs/agents/development-workflow.md',
    'docs/program/2026-09-05/issue-plan.json'], 'pull_request'), 'documentation');
  assert.equal(classifyChanges(['README.md'], 'workflow_dispatch'), 'full');
  assert.equal(classifyChanges([], 'pull_request'), 'full');
});

test('runtime, contracts, unknown files and both sides of moves retain full checks', () => {
  for (const file of ['app/page.tsx', 'ios/VisePanda/App.swift', 'public/assets/image.png',
    'docs/contracts/vpj-04.md', 'docs/policy/policy.json', 'docs/adr/ADR-new.md',
    '.github/workflows/quality-pr.yml', 'scripts/ci-change-scope.mjs', 'package.json',
    'pnpm-lock.yaml', 'tests/unit/new.test.mjs', 'docs/new-guide.md',
    'artifacts/VPJ-00/other/issue-sync.json', 'artifacts/VPJ-16/fixture.json',
    'docs/program/2026-09-05/unknown.json', 'docs/program/2026-09-05/UNKNOWN.md']) {
    assert.equal(classifyChanges(['README.md', file], 'pull_request'), 'full', file);
  }
  assert.equal(classifyChanges(['lib/server/moved.ts', 'docs/agents/moved.md'], 'pull_request'), 'full');
});

test('the known product-planning set uses documentation checks, while a single runtime change retains full checks', () => {
  const files = ['docs/VISEPANDA-MASTER-PLAN-2026-09-05.md',
    'docs/program/2026-09-05/PRODUCT-EXPERIENCE-2026-09-17.md',
    'docs/program/2026-09-05/BRAND-ALIGNMENT-EXECUTION.md',
    'artifacts/VPJ-00/product-experience-20260917/issue-sync.json', 'docs/handoff.json'];
  assert.equal(classifyChanges(files, 'pull_request'), 'documentation');
  assert.equal(classifyChanges([...files, 'lib/server/identity/user-data-adapter.ts'], 'pull_request'), 'full');
  assert.equal(classifyChanges([...files, 'supabase/migrations/new.sql'], 'pull_request'), 'full');
  assert.equal(classifyChanges(files, 'workflow_dispatch'), 'full');
});

test('actual Git comparison includes both sides of a runtime-to-document rename', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'vp-ci-scope-'));
  const moduleUrl = pathToFileURL(path.resolve('scripts/ci-change-scope.mjs')).href;
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = () => { git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test',
    '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture'); return git('rev-parse', 'HEAD'); };
  const scope = (base, head) => execFileSync(process.execPath, ['--input-type=module', '-e',
    `import {detectScope} from ${JSON.stringify(moduleUrl)}; console.log(detectScope(${JSON.stringify({ VP_CI_EVENT: 'pull_request', VP_CI_BASE: base, VP_CI_HEAD: head })}));`],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init'); mkdirSync(path.join(root, 'lib'), { recursive: true });
    mkdirSync(path.join(root, 'docs/agents'), { recursive: true });
    writeFileSync(path.join(root, 'README.md'), 'before\n');
    writeFileSync(path.join(root, 'lib/runtime.ts'), 'export const value = 1;\n');
    const base = commit();
    writeFileSync(path.join(root, 'README.md'), 'after\n');
    const docs = commit(); assert.equal(scope(base, docs), 'documentation');
    git('mv', 'lib/runtime.ts', 'docs/agents/moved.md');
    const moved = commit(); assert.equal(scope(docs, moved), 'full');
    assert.equal(scope('0'.repeat(40), moved), 'full');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('missing, invalid or unavailable comparison inputs fall back to the complete gate', () => {
  assert.equal(detectScope({}), 'full');
  assert.equal(detectScope({ VP_CI_EVENT: 'pull_request', VP_CI_BASE: '--help', VP_CI_HEAD: 'a'.repeat(40) }), 'full');
  assert.equal(detectScope({ VP_CI_EVENT: 'pull_request', VP_CI_BASE: '0'.repeat(40), VP_CI_HEAD: 'f'.repeat(40) }), 'full');
});

test('affected selector docs/backend/native/UI/SQL matrices preserve required real checks',()=>{
 const doc=selectCheckPlan(['docs/contracts/new-result.md','artifacts/VPJ-79/proof.log.gz'],'pull_request');assert.equal(doc.profile,'documentation');assert.deepEqual(doc.dbLanes,[]);assert.ok(Object.values(doc.checks).every(x=>x===false));
 const backend=selectCheckPlan(['lib/server/turn/planning-v2-model-request.ts'],'pull_request');assert.equal(backend.profile,'affected');assert.equal(backend.checks.typecheck,true);assert.equal(backend.checks.contract,true);assert.equal(backend.checks.security,true);assert.equal(backend.checks.browser,false);assert.deepEqual(backend.dbLanes,['postgres','supabase-http-native']);
 const native=selectCheckPlan(['ios/VisePanda/Features/Result.swift'],'pull_request');assert.deepEqual(native.dbLanes,[]);assert.equal(native.checks.build,false);
 const ui=selectCheckPlan(['components/canvas/Result.tsx'],'pull_request');assert.equal(ui.checks.build,true);assert.equal(ui.checks.browser,true);
 const sql=selectCheckPlan(['supabase/migrations/new.sql'],'pull_request');assert.deepEqual(sql.dbLanes,DB_LANES);assert.equal(sql.checks.security,true);
 const permissions=selectCheckPlan(['lib/server/identity/request-guards.ts'],'pull_request');assert.deepEqual(permissions.dbLanes,DB_LANES);
 const api=selectCheckPlan(['app/api/results/native/v1/route.ts'],'pull_request');assert.ok(api.dbLanes.includes('postgres'));assert.ok(api.dbLanes.includes('supabase-rls'));
});
test('CI policy changes and unknown/unavailable/manual inputs fail closed to the full superset',()=>{
 for(const f of ['.github/workflows/quality-pr.yml','scripts/ci-change-scope.mjs','scripts/ci-suites/db-integration.mjs','tests/unit/governance/ci-change-scope.test.mjs','unknown-file.xyz','tests/integration/new-domain/new.test.mjs','package.json','a/../README.md','unsafe $(id).md'])assert.equal(selectCheckPlan([f],'pull_request').profile,'full',f);
 assert.equal(selectCheckPlan(['README.md'],'workflow_dispatch').profile,'full');assert.equal(selectCheckPlan(['README.md'],'pull_request',true).profile,'full');assert.equal(detectPlan({}).profile,'full');assert.equal(detectPlan({VP_CI_EVENT:'pull_request',VP_CI_BASE:'0'.repeat(40),VP_CI_HEAD:'f'.repeat(40)}).profile,'full');
});
test('actual registered test lane is selected while known Web failure coverage cannot be narrowed away',()=>{
 const postgres=selectCheckPlan(['tests/integration/turn/planning-v2-real-journal-consumer.test.mjs'],'pull_request');assert.deepEqual(postgres.dbLanes,['postgres']);
 const web=selectCheckPlan(['tests/integration/web-trip-continuity/run.mjs'],'pull_request');assert.ok(web.dbLanes.includes('supabase-http-native'));assert.equal(web.checks.build,true);assert.equal(web.checks.browser,true);
 const batch628=selectCheckPlan(['supabase/migrations/20261003060000_vpj78_v2_model_local_journal.sql','.github/workflows/db-integration.yml','tests/integration/web-trip-continuity/run.mjs'],'pull_request');assert.equal(batch628.profile,'full');assert.deepEqual(batch628.dbLanes,DB_LANES);assert.equal(batch628.checks.browser,true);assert.equal(batch628.checks.build,true);
});

test('wiki source imports select native PostgreSQL persistence and Ops readers without making all server full',()=>{
 for(const f of ['lib/server/knowledge/wiki/proposals.ts','lib/server/jobs/wiki-generation-job.ts']){const p=selectCheckPlan([f],'pull_request');assert.equal(p.profile,'affected');assert.ok(p.dbLanes.includes('postgres-native'));assert.ok(p.dbLanes.includes('supabase-http-ops'));}
 assert.equal(selectCheckPlan(['lib/server/turn/planning-v2-model-request.ts'],'pull_request').dbLanes.includes('postgres-native'),false);
});

test('static output tests always select their build prerequisite, while native and contract-only changes stay bounded',()=>{
 for(const files of [
  ['lib/server/media/speech/index.ts','tests/contract/agent-speech/speech.test.ts'],
  ['lib/server/turn/planning-v2-model-request.ts'],
  ['supabase/migrations/new.sql'],
  ['lib/server/identity/request-guards.ts'],
  ['components/canvas/Result.tsx'],
 ]){
  const plan=selectCheckPlan(files,'pull_request');
  assert.equal(plan.checks.test,true,files.join(','));
  assert.equal(plan.checks.build,true,files.join(','));
 }
 for(const files of [['ios/VisePanda/Features/Result.swift'],['tests/contract/agent-speech/speech.test.ts'],['README.md']]){
  const plan=selectCheckPlan(files,'pull_request');
  assert.equal(plan.checks.test,false,files.join(','));
  assert.equal(plan.checks.build,false,files.join(','));
 }
});

test('resolved-subject source and tests select the independent PG17 lane without losing existing gates',()=>{
 for(const file of ['lib/server/knowledge/wiki/grounded-ai-assist.ts','lib/server/knowledge/wiki/grounded-ai-assist-job.ts','lib/server/knowledge/wiki/grounded-search.ts','lib/server/jobs/wiki-search-job.ts']){
  const plan=selectCheckPlan([file],'pull_request');assert.equal(plan.profile,'affected');
  for(const lane of ['postgres','postgres-native','postgres-native-17','supabase-http-native','supabase-http-ops'])assert.ok(plan.dbLanes.includes(lane),file+' selects '+lane);
 }
 const entry=selectCheckPlan(['tests/integration/knowledge/agent-grounded-subject/subject-binding-postgres.test.mjs'],'pull_request');assert.deepEqual(entry.dbLanes,['postgres-native-17']);
 const contract=selectCheckPlan(['tests/contract/agent-grounded-result/subject-binding.test.mjs'],'pull_request');assert.deepEqual(contract.dbLanes,['postgres-native-17']);assert.equal(contract.checks.contract,true);assert.equal(contract.checks.security,true);
 for(const file of ['lib/server/turn/native-ai-assist-http.ts','app/api/chat/grounded/ai-assist/route.ts','lib/server/model-gateway/prompt/wiki-search.ts'])assert.ok(selectCheckPlan([file],'pull_request').dbLanes.includes('postgres-native-17'),file);
 assert.equal(selectCheckPlan(['lib/server/turn/planning-v2-model-request.ts'],'pull_request').dbLanes.includes('postgres-native-17'),false);
 for(const [files,event]of [[['unknown-file.xyz'],'pull_request'],[['README.md'],'workflow_dispatch'],[['.github/workflows/db-integration.yml'],'pull_request'],[['supabase/migrations/new.sql'],'pull_request']])assert.deepEqual(selectCheckPlan(files,event).dbLanes,DB_LANES);
});


test('Trip task, scoped host, provider, privacy, SQL and suite dependencies retain native17 coverage',()=>{
 for(const file of ['lib/server/service-task-trip/contract.ts','lib/server/trip/scoped-edit/service.ts','lib/server/turn/scoped-edit/executor.ts','lib/server/model-gateway/adapters/provider-protocol.ts','lib/server/jobs/run-hosted-text-worker.mjs','lib/server/privacy/turn-data/export.ts','lib/server/privacy/conversation-data/contract.ts','supabase/migrations/new.sql','tests/contract/service-task-trip/contract.test.mjs','tests/integration/service-task-trip/settlement.test.mjs']){
  const plan=selectCheckPlan([file],'pull_request');assert.ok(plan.dbLanes.includes('postgres-native-17'),file);assert.equal(plan.checks.contract,true);assert.equal(plan.checks.security,true);
 }
 for(const file of ['tests/integration/service-task-trip/native-db.mjs','tests/integration/service-task-trip/run-integration.mjs','tests/integration/service-task-trip/trip-privacy-front.sql'])assert.deepEqual(selectCheckPlan([file],'pull_request').dbLanes,DB_LANES,file);
 for(const file of ['tests/integration/service-task-trip/unknown.test.mjs','unknown-trip-root.mjs'])assert.equal(selectCheckPlan([file],'pull_request').profile,'full',file);
});
