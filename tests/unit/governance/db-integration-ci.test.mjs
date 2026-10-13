import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {spawnSync} from "node:child_process";
import {selectCheckPlan,DB_LANES} from "../../../scripts/ci-change-scope.mjs";
import { EXCLUDED, LANES, executionMatrix, executionSteps, classify, parseNodeTestSummary, pinnedImages, stepProblems } from "../../../scripts/ci-suites/db-integration.mjs";

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
 assert.match(workflow,/include: \$\{\{ fromJSON\(needs.select.outputs.execution_matrix\).include \}\}/);
 assert.deepEqual(selectCheckPlan(['supabase/migrations/new.sql'],'pull_request').dbLanes,Object.keys(LANES));assert.deepEqual([...DB_LANES].sort(),Object.keys(LANES).sort());
 assert.match(workflow,/node scripts\/ci-suites\/db-integration\.mjs --list/);assert.match(workflow,/node scripts\/ci-change-scope\.mjs/);
 assert.match(workflow,/node scripts\/ci-suites\/db-integration\.mjs --lane "\$\{\{ matrix\.lane \}\}" --shard "\$\{\{ matrix\.shard \}\}"/);
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


test("bounded CI shards preserve every logical step exactly once and reject malformed partitions", () => {
  const jobs = executionMatrix(Object.keys(LANES)).include;
  for (const lane of Object.keys(LANES)) {
    const own = jobs.filter(job => job.lane === lane);
    assert.equal(own.length, lane === "supabase-http-native" ? 8 : 1);
    const selected = own.flatMap(job => executionSteps(lane, job.shard));
    assert.equal(new Set(selected).size, LANES[lane].steps.length);
    assert.equal(selected.length, LANES[lane].steps.length);
    assert.deepEqual(new Set(selected), new Set(LANES[lane].steps));
    for (const job of own) {
      const part = executionSteps(lane, job.shard);
      assert.ok(part.length > 0);
      if (lane === "supabase-http-native") assert.ok(part.length <= 5, "Native HTTP job retains bounded capacity under unchanged 30m limit");
      assert.deepEqual(part, LANES[lane].steps.filter(step => part.includes(step)));
    }
    assert.deepEqual(executionSteps(lane), LANES[lane].steps);
  }
  for (const input of [null, [], ["unknown"], ["postgres", "postgres"], ["none", "postgres"]]) assert.throws(() => executionMatrix(input));
  assert.deepEqual(executionMatrix(["none"]).include, [{lane:"none",shard:"1/1",name:"lane (none)"}]);
  for (const shard of ["0/8", "9/8", "1/3", "1/2", "2/2", "3/2", "1/4", "2/1", "1/1", "01/8", "1/08", "garbage"]) assert.throws(() => executionSteps("supabase-http-native", shard));
  assert.throws(() => executionSteps("postgres", "1/2"));
  assert.throws(() => executionSteps("unknown", "1/1"));
  assert.match(read(".github/workflows/db-integration.yml"), /timeout-minutes: 30/);
});


test("CI matrix CLI and actual workflow projection fail before emitting an output on bad plans", () => {
  const command = ["scripts/ci-suites/db-integration.mjs", "--ci-matrix"];
  for (const input of ["not-json", "{}", "[]", '["unknown"]', '["none","postgres"]', '["postgres","postgres"]']) {
    const cli = spawnSync(process.execPath, command, {env:{...process.env,VP_DB_LANES_JSON:input},encoding:"utf8"});
    assert.notEqual(cli.status, 0); assert.equal(cli.stdout.trim(), "");
  }
  const none = spawnSync(process.execPath, command, {env:{...process.env,VP_DB_LANES_JSON:'["none"]'},encoding:"utf8"});
  assert.equal(none.status,0,none.stderr); assert.deepEqual(JSON.parse(none.stdout),executionMatrix(["none"]));
  const workflow=read(".github/workflows/db-integration.yml");
  const match=workflow.match(/id: execution[\s\S]*?run: \|\n([\s\S]*?)(?=      - )/);
  assert.ok(match); const body=match[1].split("\n").map(line=>line.startsWith("          ")?line.slice(10):line).join("\n");
  assert.match(body,/^matrix=\$\(node scripts\/ci-suites\/db-integration\.mjs --ci-matrix\)$/m);
  const dir=mkdtempSync(join(tmpdir(),"vp-db-matrix-output-")),output=join(dir,"github-output");
  try {
    for(const input of ["not-json",'[]','["unknown"]']){
      const run=spawnSync("/bin/bash",["-e","-c",body],{env:{...process.env,VP_DB_LANES_JSON:input,GITHUB_OUTPUT:output},encoding:"utf8"});
      assert.notEqual(run.status,0);assert.ok(!existsSync(output));
    }
    const run=spawnSync("/bin/bash",["-e","-c",body],{env:{...process.env,VP_DB_LANES_JSON:'["none"]',GITHUB_OUTPUT:output},encoding:"utf8"});
    assert.equal(run.status,0,run.stderr);assert.equal(read(output),'matrix='+JSON.stringify(executionMatrix(["none"]))+'\n');
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test("pinned images pull only exact official GHCR digests and fail closed", () => {
  const workflow = read(".github/workflows/db-integration.yml");
  const match = workflow.match(/- name: Pull pinned test database images[\s\S]*?run: \|\n([\s\S]*?)(?=      - name:)/);
  assert.ok(match);
  const body = match[1].split("\n").map(line => line.startsWith("          ") ? line.slice(10) : line).join("\n");
  assert.equal(spawnSync("/bin/bash", ["-n"], {input: body}).status, 0);
  const evidence = JSON.parse(read("artifacts/QAWEB/ci-image-fallback/registry-digests.json"));
  assert.deepEqual(evidence.images.map(row => `public.ecr.aws/supabase/${row.tag}`).sort(), [...pinnedImages()].sort());
  const harness = `
node() { printf '%s\\n' "$TEST_IMAGES"; return "$LIST_STATUS"; }
docker() {
  printf 'DOCKER %s\\n' "$*" >&2
  if [ "$1" = tag ]; then return "$TAG_STATUS"; fi
  if [ "$1" = pull ] && [ "$2" = --platform ] && [ "$3" = linux/amd64 ]; then
    case "$4" in ghcr.io/supabase/*@sha256:*) return "$MIRROR_STATUS" ;; esac
  fi
  return 99
}
`;
  const run = (images, overrides = {}) => spawnSync("/bin/bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", harness + body], {
    encoding: "utf8", env: {...process.env, TEST_IMAGES: images, LIST_STATUS: "0", MIRROR_STATUS: "0", TAG_STATUS: "0", ...overrides},
  });
  let expected = "";
  for (const row of evidence.images) {
    assert.equal(row["public.ecr.aws"], row["ghcr.io"]);
    assert.match(row["ghcr.io"], /^sha256:[a-f0-9]{64}$/);
    const image = `public.ecr.aws/supabase/${row.tag}`;
    const mirror = `ghcr.io/supabase/${row.tag.split(":")[0]}@${row["ghcr.io"]}`;
    const calls = `DOCKER pull --platform linux/amd64 ${mirror}\nDOCKER tag ${mirror} ${image}\n`;
    expected += calls;
    const success = run(image);
    assert.equal(success.status, 0, success.stderr);
    assert.equal(success.stderr, calls);
    // Digest verification is enforced by Docker's immutable digest pull. Any pull
    // failure (including content digest mismatch) must prevent tagging/continuation.
    const pullFailure = run(image, {MIRROR_STATUS: "8"});
    assert.equal(pullFailure.status, 8);
    assert.equal(pullFailure.stderr, `DOCKER pull --platform linux/amd64 ${mirror}\n`);
    assert.equal(run(image, {TAG_STATUS: "9"}).status, 9);
  }
  const images = evidence.images.map(row => `public.ecr.aws/supabase/${row.tag}`).join("\n");
  const all = run(images);
  assert.equal(all.status, 0, all.stderr); assert.equal(all.stderr, expected);
  for (const overrides of [{MIRROR_STATUS: "8"}, {TAG_STATUS: "9"}]) {
    const result = run(images, overrides);
    assert.notEqual(result.status, 0);
    assert.equal((result.stderr.match(/DOCKER pull/g) || []).length, 1);
  }
  for (const image of ["", "public.ecr.aws/supabase/postgres:unknown", "other.example/supabase/postgres:17.6.1.155"]) {
    const result = run(image);
    assert.equal(result.status, 1); assert.doesNotMatch(result.stderr, /DOCKER/);
  }
  const listFailure = run(images, {LIST_STATUS: "7"});
  assert.equal(listFailure.status, 7); assert.doesNotMatch(listFailure.stderr, /DOCKER/);
});

test("security workflows prepare the exact official Node fixture before offline tests", () => {
  const pin = JSON.parse(read("artifacts/QAWEB/ci-image-fallback/node-fixture/registry-digest.json"));
  assert.equal(pin.sourceTag, "docker.io/library/node:22-bookworm-slim");
  assert.equal(pin.platform, "linux/amd64");
  assert.match(pin.reference, /^docker\.io\/library\/node@sha256:[a-f0-9]{64}$/);
  const harness = `docker() { printf '%s\\n' "$*"; if [ "$1" = pull ]; then return "$PULL_STATUS"; fi; return "$TAG_STATUS"; }\n`;
  for (const name of ["quality-pr", "quality-nightly", "quality-release-candidate"]) {
    const workflow = read(`.github/workflows/${name}.yml`);
    const match = workflow.match(/- name: Prepare pinned Node fixture for offline security tests\n([\s\S]*?)        run: \|\n([\s\S]*?)(?=      - )/);
    assert.ok(match, name);
    assert.match(match[1], /shell: bash/);
    if (name === "quality-pr") assert.match(match[1], /if: steps.scope.outputs.security == 'true'/);
    const body = match[2].split("\n").map(line => line.startsWith("          ") ? line.slice(10) : line).join("\n");
    assert.equal(spawnSync("/bin/bash", ["-n"], {input: body}).status, 0);
    const next = workflow.slice(match.index + match[0].length);
    assert.match(next, name === "quality-pr" ? /^      - if: steps.scope.outputs.security == 'true'\n        run: pnpm test:security/ : /^      - run: pnpm test:security/);
    for (const [pull, tag, status] of [[0, 0, 0], [7, 0, 7], [0, 8, 8]]) {
      const result = spawnSync("/bin/bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", harness + body], {
        encoding: "utf8", env: {...process.env, PULL_STATUS: String(pull), TAG_STATUS: String(tag)},
      });
      assert.equal(result.status, status, result.stderr);
      assert.equal(result.stdout, `pull --platform linux/amd64 ${pin.reference}\n` + (pull ? "" : `tag ${pin.reference} node:22-bookworm-slim\n`));
    }
  }
});
