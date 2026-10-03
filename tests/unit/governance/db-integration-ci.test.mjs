import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import {spawnSync} from "node:child_process";
import {selectCheckPlan,DB_LANES} from "../../../scripts/ci-change-scope.mjs";
import { EXCLUDED, LANES, classify, parseNodeTestSummary, pinnedImages, stepProblems } from "../../../scripts/ci-suites/db-integration.mjs";

const read = (path) => readFileSync(path, "utf8");

test("every gated integration test file is in a DB integration lane or on the reasoned allowlist", () => {
  const { rows, problems } = classify();
  assert.deepEqual(problems, []);
  for (const row of rows.filter((r) => r.gated)) assert.notEqual(row.lane, "test:integration", row.file);
  for (const [file, reason] of Object.entries(EXCLUDED)) assert.ok(reason.length > 40, `${file} needs a concrete reason`);
  assert.ok(Object.keys(EXCLUDED).length <= 3, "the not-in-CI allowlist must stay short");
});

test("a DB integration lane fails on skip, todo, cancel, failure, non-zero exit or a missing summary", () => {
  const clean = parseNodeTestSummary("# tests 3\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n");
  assert.deepEqual(stepProblems(0, clean), []);
  const spec = parseNodeTestSummary("ℹ tests 2\nℹ pass 1\nℹ fail 0\nℹ cancelled 0\nℹ skipped 1\nℹ todo 0\n");
  assert.deepEqual(stepProblems(0, spec), ["skipped=1"]);
  assert.deepEqual(stepProblems(0, parseNodeTestSummary("# tests 1\n# pass 0\n# todo 1\n")), ["todo=1"]);
  assert.deepEqual(stepProblems(0, parseNodeTestSummary("# tests 1\n# cancelled 1\n")), ["cancelled=1"]);
  assert.deepEqual(stepProblems(1, parseNodeTestSummary("# tests 1\n# fail 1\n")), ["exit 1", "fail=1"]);
  assert.deepEqual(stepProblems(0, parseNodeTestSummary("no summary")), ["no node:test summary / zero tests"]);
  const twoRuns = parseNodeTestSummary("# tests 2\n# pass 2\n# skipped 0\nℹ tests 3\nℹ pass 2\nℹ skipped 1\n");
  assert.equal(twoRuns.tests, 5);
  assert.equal(twoRuns.skipped, 1);
});

test("DB Integration dynamically selects lanes with a stable fail-closed aggregate and real classification",()=>{
 const workflow=read('.github/workflows/db-integration.yml');assert.match(workflow,/^permissions:\n  contents: read$/m);
 assert.match(workflow,/lane: \$\{\{ fromJSON\(needs.select.outputs.lanes\) \}\}/);
 assert.deepEqual(selectCheckPlan(['supabase/migrations/new.sql'],'pull_request').dbLanes,Object.keys(LANES));assert.deepEqual([...DB_LANES].sort(),Object.keys(LANES).sort());
 assert.match(workflow,/node scripts\/ci-suites\/db-integration\.mjs --list/);assert.match(workflow,/node scripts\/ci-change-scope\.mjs/);
 assert.match(workflow,/node scripts\/ci-suites\/db-integration\.mjs --lane \$\{\{ matrix\.lane \}\}/);
 assert.match(workflow,/^  db-integration:\n    if: always\(\)\n    needs: \[select, lane\]$/m);
 assert.match(workflow,/test "\$SELECT_RESULT" = success/);assert.match(workflow,/test "\$LANE_RESULT" = success/);assert.match(workflow,/test "\$LANE_RESULT" = skipped/);assert.match(workflow,/exit 1/);
 assert.ok(pinnedImages().includes('public.ecr.aws/supabase/postgres:17.6.1.159'));
});

test("deduplicated four PG workflows keep manual commands covered by the selected postgres step",()=>{
 const postgresFiles=new Set(LANES.postgres.steps.flatMap(s=>s.files));
 for(const name of ['budget-postgres','community-postgres','privacy-postgres','memory-postgres']){
  const workflow=read(`.github/workflows/${name}.yml`);assert.doesNotMatch(workflow,/^  pull_request:/m);assert.match(workflow,/workflow_dispatch:/);
  const files=[...workflow.matchAll(/tests\/integration\/[A-Za-z0-9_./-]+\.test\.mjs/g)].map(m=>m[0]);assert.ok(files.length>0);for(const f of files)assert.ok(postgresFiles.has(f),f);
 }
 const env=LANES.postgres.steps[0].env;for(const k of ['VP_BUDGET_DB_TEST','VP_TURN_DB_TEST','VP_OPS_DB_TEST','VP_PRIVACY_DB_TEST','VP_COMMUNITY_DB_TEST','VP_MEMORY_DB_TEST'])assert.equal(env[k],'1');
});

test("every workflow declares least-privilege token permissions", () => {
  for (const file of readdirSync(".github/workflows").filter((name) => name.endsWith(".yml"))) {
    const workflow = read(`.github/workflows/${file}`);
    assert.match(workflow, /^permissions:\n  contents: read$/m, `${file} must declare top-level read-only permissions`);
    assert.doesNotMatch(workflow, /write-all|: write$/m, `${file} must not request write scopes`);
  }
});

test("the self-hosted iOS runner never executes fork pull request code", () => {
  const workflow = read(".github/workflows/native-ios.yml");
  const selfHosted = workflow.split(/\n(?=  [a-z][\w-]*:\n)/).filter((block) => /runs-on: \[self-hosted/.test(block));
  assert.ok(selfHosted.length >= 1);
  for (const job of selfHosted) {
    assert.match(job, /if: github\.event_name == 'workflow_dispatch' \|\| github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  }
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.match(workflow, /persist-credentials: false/);
});

test('stable DB aggregate executes strict result predicates for empty/full/error/cancel states',()=>{
 const workflow=read('.github/workflows/db-integration.yml').split('  db-integration:')[1];const body=workflow.split('        run: |\n')[1].split('\n').map(line=>line.startsWith('          ')?line.slice(10):line).join('\n');
 for(const [select,hasDB,lane,expected]of [['success','true','success',0],['success','false','skipped',0],['failure','false','skipped',1],['success','true','failure',1],['success','true','cancelled',1],['success','false','success',1],['success','','skipped',1]]){
  const run=spawnSync('/bin/sh',['-e','-c',body],{env:{...process.env,SELECT_RESULT:select,HAS_DB:hasDB,LANE_RESULT:lane},stdio:'ignore'});assert.equal(run.status===0,expected===0,`${select}/${hasDB}/${lane}`);
 }
});

test('native PR uses unsigned build or affected permission/data code tests; manual remains full',()=>{
 const workflow=read('.github/workflows/native-ios.yml'),script=read('scripts/ios/ci.py');
 assert.match(workflow,/--pr-base "\$NATIVE_BASE" --pr-head "\$NATIVE_HEAD"/);assert.match(workflow,/else\n            python3 scripts\/ios\/ci.py --output/);assert.doesNotMatch(workflow,/docs\/contracts\/vpj-56|artifacts\/VPJ-56/);
 assert.match(script,/parser.add_argument\("--build-only"/);assert.match(script,/if args.build_only:\n        return/);assert.match(script,/-only-testing:/);assert.match(script,/if not args.build_only:/);assert.match(script,/"simulatorTestsRun": False/);
 const code="import importlib.util,json; s=importlib.util.spec_from_file_location('vpci','scripts/ios/ci.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(json.dumps([m.pr_test_selection(['scripts/ios/ci.py']),m.pr_test_selection(['ios/VisePanda/VisePanda/DesignSystem/Colors.swift']),m.pr_test_selection(['ios/VisePanda/VisePanda/App/NativeSession.swift'])]))";
 const r=spawnSync('python3',['-c',code],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);const [ci,style,risk]=JSON.parse(r.stdout);assert.deepEqual(ci,[]);assert.deepEqual(style,[]);assert.ok(risk.includes('VisePandaTests/NativeTripStateTests'));assert.ok(risk.includes('VisePandaTests/NativeProposalReferenceTests'));assert.ok(risk.includes('VisePandaTests/NativeQualifiedDelegationTransportTests'));assert.ok(risk.every(t=>t.startsWith('VisePandaTests/')));
});

test('changed noncritical native test classes and unknown native sources are never omitted',()=>{
 const code="import importlib.util,json,re,pathlib; s=importlib.util.spec_from_file_location('vpci','scripts/ios/ci.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);f='ios/VisePanda/VisePandaTests/AccessibilityContrastTests.swift';names=m.checked_test_names(pathlib.Path(f));print(json.dumps([names,m.pr_test_selection([f]),m.pr_test_selection(['ios/UnknownScope/Changed.swift'])]))";
 const r=spawnSync('python3',['-c',code],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);const [names,selected,unknown]=JSON.parse(r.stdout);assert.ok(names.length>0);for(const name of names)assert.ok(selected.includes('VisePandaTests/'+name));assert.ok(selected.includes('VisePandaTests/NativeTripStateTests'));assert.deepEqual(unknown,['VisePandaTests']);
});
