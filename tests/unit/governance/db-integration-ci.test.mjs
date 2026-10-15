import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, rmSync, existsSync, mkdirSync, chmodSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {spawnSync} from "node:child_process";
import {selectCheckPlan,DB_LANES} from "../../../scripts/ci-change-scope.mjs";
import { EXCLUDED, LANES, executionMatrix, executionSteps, classify, isGated, parseNodeTestSummary, pinnedImages, stepProblems } from "../../../scripts/ci-suites/db-integration.mjs";

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

test("hosted worker prepares the identical GHCR database pin without ECR network access", () => {
  const workflow = read(".github/workflows/hosted-worker.yml");
  const match = workflow.match(/- name: Pull the pinned local test database image\n        shell: bash\n        run: \|\n([\s\S]*?)(?=      - name: Hosted worker loop)/);
  assert.ok(match);
  const body = match[1].split("\n").map(line => line.startsWith("          ") ? line.slice(10) : line).join("\n");
  assert.equal(spawnSync("/bin/bash", ["-n"], {input: body}).status, 0);
  const evidence = JSON.parse(read("artifacts/QAWEB/ci-image-fallback/registry-digests.json"));
  const pin = evidence.images.find(row => row.tag === "postgres:17.6.1.159");
  assert.equal(pin["public.ecr.aws"], pin["ghcr.io"]);
  const reference = `ghcr.io/supabase/postgres@${pin["ghcr.io"]}`;
  const harness = `docker() { printf '%s\\n' "$*"; if [ "$1" = pull ]; then return "$PULL_STATUS"; fi; return "$TAG_STATUS"; }\n`;
  for (const [pull, tag, status] of [[0, 0, 0], [7, 0, 7], [0, 8, 8]]) {
    const result = spawnSync("/bin/bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", harness + body], {
      encoding: "utf8", env: {...process.env, PULL_STATUS: String(pull), TAG_STATUS: String(tag)},
    });
    assert.equal(result.status, status, result.stderr);
    assert.equal(result.stdout, `pull --platform linux/amd64 ${reference}\n` + (pull ? "" : `tag ${reference} public.ecr.aws/supabase/postgres:17.6.1.159\n`));
  }
});

test('resolved-subject PG17 lane is unique, explicit, bounded, and cannot weaken the old Wiki lane',()=>{
 const file='tests/integration/knowledge/agent-grounded-subject/subject-binding-postgres.test.mjs';
 const ownership=Object.entries(LANES).flatMap(([lane,definition])=>definition.steps.flatMap(step=>step.files.filter(f=>f===file).map(()=>lane)));
 assert.deepEqual(ownership,['postgres-native-17']);
 assert.deepEqual(classify().rows.find(row=>row.file===file),{file,gated:true,lane:'postgres-native-17'});
 assert.equal(LANES['postgres-native-17'].steps.length,1);assert.equal(LANES['postgres-native-17'].steps[0].env.AGENT005_NATIVE_PG,'1');assert.equal(LANES['postgres-native-17'].steps[0].concurrency,1);
 assert.deepEqual(LANES['postgres-native'],{needs:['VP_WIKI_PG_BIN','VP_WIKI_PG_MODULE'],steps:[{name:'wiki-native-postgres',env:{},files:['tests/integration/knowledge/wiki-draft.test.mjs']}]});
 const all=executionMatrix(DB_LANES).include;
 assert.deepEqual(all.filter(job=>job.lane!=='postgres-native-17'),executionMatrix(DB_LANES.filter(lane=>lane!=='postgres-native-17')).include);
 assert.deepEqual(all.filter(job=>job.lane==='postgres-native-17'),[{lane:'postgres-native-17',shard:'1/1',name:'lane (postgres-native-17)'}]);
 assert.deepEqual(executionSteps('postgres-native-17','1/1'),LANES['postgres-native-17'].steps);assert.throws(()=>executionSteps('postgres-native-17','1/2'));
 assert.equal(existsSync('tests/contract/agent-grounded-result/subject-binding-postgres.test.mjs'),false);
});

function pg17PreparationBody(){
 const workflow=read('.github/workflows/db-integration.yml');
 const match=workflow.match(/      - name: Prepare PostgreSQL 17 for resolved-subject integration\n        if: matrix\.lane == 'postgres-native-17'\n        shell: bash\n        run: \|\n([\s\S]*?)(?=      - uses:)/);
 assert.ok(match,'only the new job prepares PostgreSQL17');
 return match[1].split('\n').map(line=>line.startsWith('          ')?line.slice(10):line).join('\n');
}

test('cancellation PG proof has one explicit native17 owner and the lane cannot silently skip',()=>{
 const file='tests/integration/qa-agent-cancellation/native-pg.test.mjs';
 const owners=Object.entries(LANES).flatMap(([lane,definition])=>definition.steps.flatMap(step=>step.files.filter(f=>f===file).map(()=>lane)));
 assert.deepEqual(owners,['postgres-native-17']);
 assert.deepEqual(classify().rows.find(row=>row.file===file),{file,gated:true,lane:'postgres-native-17'});
 assert.equal(LANES['postgres-native-17'].steps[0].env.QA_CANCEL_NATIVE_PG,'1');
 assert.deepEqual(LANES['postgres-native-17'].steps[0].files,[
  'tests/integration/knowledge/agent-grounded-subject/subject-binding-postgres.test.mjs',file]);
 assert.equal(LANES['postgres-native-17'].steps[0].concurrency,1);
 assert.equal(isGated(file),true);
});

test('PG17 CI preparation retains the old Wiki job and uses official major17 without starting default services',()=>{
 const body=pg17PreparationBody(),workflow=read('.github/workflows/db-integration.yml');
 assert.equal(spawnSync('/bin/bash',['-n'],{input:body}).status,0);
 assert.match(workflow,/- name: Prepare native PostgreSQL for the Wiki lane\n        if: matrix\.lane == 'postgres-native'\n/);
 assert.match(workflow,/bin=\$\(ls -d \/usr\/lib\/postgresql\/\*\/bin \| sort -V \| tail -1\)/);
 assert.match(body,/https:\/\/www\.postgresql\.org\/media\/keys\/ACCC4CF8\.asc/);assert.match(body,/URIs: https:\/\/apt\.postgresql\.org\/pub\/repos\/apt/);assert.match(body,/Suites: noble-pgdg/);
 assert.match(body,/install -y --no-install-recommends postgresql-17/);assert.doesNotMatch(body,/apt-get[^\n]* install[^\n]* postgresql(?:\s|$)/);
 assert.match(body,/create_main_cluster = false/);assert.match(body,/start_conf = 'manual'/);assert.match(body,/exit 101/);assert.match(body,/trap taskPgRestore EXIT/);
 assert.match(body,/Dpkg::Options::=--force-confold/);assert.match(body,/NEEDRESTART_MODE=l/);assert.match(body,/pg@\$PG_CLIENT_VERSION/);
 assert.doesNotMatch(body,/systemctl\s+(?:start|restart)|service\s+postgresql\s+(?:start|restart)|pg_createcluster|pg_ctl[^\n]* start/);
});

test('PG17 setup mock preserves existing files and propagates install/version failures without Linux or network execution',()=>{
 const original=pg17PreparationBody();
 for(const scenario of [
  {name:'existing17',installed:true,status:0},
  {name:'install17',present:true,status:0},
  {name:'existing-official-source',present:true,official:true,status:0},
  {name:'install-error',present:true,installStatus:7,status:7},
  {name:'install-error-absent-files',installStatus:7,status:7},
  {name:'wrong-major',present:true,version:'18.1',status:1},
 ]){
  const root=mkdtempSync(join(tmpdir(),'vp-native17-'));assert.match(root,/^[-A-Za-z0-9_/.]+$/);
  const local=(path)=>join(root,path),paths=['usr/sbin/policy-rc.d','etc/postgresql-common/createcluster.conf','etc/apt/sources.list.d/agent005-pg17.sources','usr/share/postgresql-common/pgdg/agent005-pg17.asc'];
  try{
   for(const p of [...paths,'etc/os-release','etc/apt/sources.list','pgbin/postgres','pgcrypto.control','runtime/placeholder'])mkdirSync(local(p.lastIndexOf('/')<0?'':p.slice(0,p.lastIndexOf('/'))),{recursive:true});
   writeFileSync(local('etc/os-release'),'VERSION_CODENAME=noble\n');writeFileSync(local('etc/apt/sources.list'),'');mkdirSync(local('runtime'),{recursive:true});mkdirSync(local('pgbin'),{recursive:true});
   const originals=new Map();
   if(scenario.present)for(const [i,p]of paths.entries()){const value=`original-${i}\n`;writeFileSync(local(p),value);chmodSync(local(p),i===0?0o755:0o640);originals.set(p,value);}
   if(scenario.official)writeFileSync(local('etc/apt/sources.list.d/pgdg.sources'),'URIs: https://apt.postgresql.org/pub/repos/apt\n');
   const createBinary=()=>{for(const name of ['postgres','initdb','pg_ctl']){writeFileSync(local('pgbin/'+name),name==='postgres'?"#!/bin/sh\nprintf 'postgres (PostgreSQL) 17.11\\n'\n":"#!/bin/sh\nexit 99\n");chmodSync(local('pgbin/'+name),0o755);}writeFileSync(local('pgcrypto.control'),'fixture only');};
   if(scenario.installed)createBinary();
   const body=original.replaceAll('/usr/lib/postgresql/17/bin',()=>local('pgbin')).replaceAll('/usr/share/postgresql/17/extension/pgcrypto.control',()=>local('pgcrypto.control')).replaceAll('/usr/sbin/',()=>local('usr/sbin/')).replaceAll('/usr/share/postgresql-common/',()=>local('usr/share/postgresql-common/')).replaceAll('/etc/',()=>local('etc/'));
   const harness=String.raw`
sudo() {
  if [ "$1" = env ]; then shift; while [[ "$1" == *=* ]]; do export "$1"; shift; done; fi
  "$@"
}
dpkg() { printf 'amd64\n'; }
curl() { printf 'curl\n' >> "$CI_TEST_TRACE"; while [ "$1" != -o ]; do shift; done; shift; printf 'controlled public key fixture\n' > "$1"; }
apt-get() {
  printf 'apt %s\n' "$*" >> "$CI_TEST_TRACE"
  case " $* " in
    *' install '*)
      grep -q 'exit 101' "$CI_TEST_ROOT/usr/sbin/policy-rc.d" || return 90
      grep -q 'create_main_cluster = false' "$CI_TEST_ROOT/etc/postgresql-common/createcluster.conf" || return 91
      if [ "$CI_TEST_INSTALL_STATUS" != 0 ]; then return "$CI_TEST_INSTALL_STATUS"; fi
      printf '#!/bin/sh\nprintf "postgres (PostgreSQL) %s\\n"\n' "$CI_TEST_VERSION" > "$CI_TEST_ROOT/pgbin/postgres"
      chmod +x "$CI_TEST_ROOT/pgbin/postgres"
      for tool in initdb pg_ctl; do printf '#!/bin/sh\nexit 99\n' > "$CI_TEST_ROOT/pgbin/$tool"; chmod +x "$CI_TEST_ROOT/pgbin/$tool"; done
      printf 'fixture\n' > "$CI_TEST_ROOT/pgcrypto.control"
      ;;
  esac
}
npm() {
  printf 'npm %s\n' "$*" >> "$CI_TEST_TRACE"
  while [ "$1" != --prefix ]; do shift; done; shift
  mkdir -p "$1/node_modules/pg/lib"; printf 'controlled fixture\n' > "$1/node_modules/pg/lib/index.js"
}
`;
   const output=local('github-env'),trace=local('trace');
   const result=spawnSync('/bin/bash',['-c',harness+body],{encoding:'utf8',env:{...process.env,RUNNER_TEMP:local('runtime'),GITHUB_ENV:output,PG_CLIENT_VERSION:'8.13.1',CI_TEST_ROOT:root,CI_TEST_TRACE:trace,CI_TEST_INSTALL_STATUS:String(scenario.installStatus??0),CI_TEST_VERSION:scenario.version??'17.11'}});
   assert.equal(result.status,scenario.status,scenario.name+': '+result.stderr);
   for(const p of paths)if(originals.has(p))assert.equal(read(local(p)),originals.get(p),scenario.name+' restores '+p);else assert.equal(existsSync(local(p)),false,scenario.name+' removes temporary '+p);
   const calls=existsSync(trace)?read(trace):'';
   if(scenario.installed)assert.doesNotMatch(calls,/apt |curl/);else assert.match(calls,/apt update/);
   if(scenario.official)assert.doesNotMatch(calls,/curl/);
   if(scenario.status===0){assert.match(read(output),/VP_WIKI_PG_BIN=/);assert.match(read(output),/VP_WIKI_PG_MODULE=/);assert.match(calls,/pg@8\.13\.1/);}else{assert.equal(existsSync(output),false);assert.doesNotMatch(calls,/npm /);}
   assert.deepEqual(readdirSync(local('runtime')).filter(name=>name.startsWith('agent005-pg17.')),[]);
  }finally{rmSync(root,{recursive:true,force:true});}
 }
});

test('the registered PG17 lane rejects a PG16 binary before any gated test can silently skip',()=>{
 const root=mkdtempSync(join(tmpdir(),'vp-pg17-preflight-'));
 try{
  const binary=join(root,'postgres');writeFileSync(binary,"#!/bin/sh\nprintf 'postgres (PostgreSQL) 16.15\\n'\n");chmodSync(binary,0o755);
  const result=spawnSync(process.execPath,['scripts/ci-suites/db-integration.mjs','--lane','postgres-native-17'],{encoding:'utf8',env:{...process.env,VP_WIKI_PG_BIN:root,VP_WIKI_PG_MODULE:'unused-preflight-fixture'}});
  assert.notEqual(result.status,0);assert.match(result.stderr,/PostgreSQL 17 is required/);assert.doesNotMatch(result.stdout,/::group::/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
