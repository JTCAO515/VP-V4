import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function setup() {
  const directory = mkdtempSync(join(tmpdir(), "vp-vision-campaign-"));
  const fixture = join(directory, "fixtures"); mkdirSync(fixture);
  const png = Buffer.alloc(40); Buffer.from([137,80,78,71,13,10,26,10]).copy(png);
  png.writeUInt32BE(13,8); png.write("IHDR",12); png.writeUInt32BE(960,16); png.writeUInt32BE(560,20);
  for (const name of ["ocr-en-v1", "ocr-zh-v1"]) writeFileSync(join(fixture, name + ".png"), png);
  return { directory, fixture, campaign: join(directory, "campaign") };
}
function run(paths, failure = false) {
  // Process-local controlled network seam. Never calls the real fetch or uses real env secrets.
  const mock = `let calls=0; globalThis.fetch=async (_url, init)=>{ calls++;
    if (${failure}) return new Response('secret upstream error', {status:500});
    if(calls===3) return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('cancelled')), {once:true}));
    return new Response(JSON.stringify({model:'qwen3.7-plus-2026-05-26', choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({transcript:'synthetic mismatch'})}}], usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30}}), {headers:{'content-type':'application/json'}});
  };`;
  return spawnSync(process.execPath, ["--experimental-strip-types", "--import", "data:text/javascript," + encodeURIComponent(mock), "evals/media/run-vision.ts", "--execute", paths.fixture, paths.campaign, "fixture-authorization"], {
    encoding: "utf8", timeout: 10000, env: { PATH: process.env.PATH, QWEN_API_KEY: "fixture-key" },
  });
}

test("campaign journals complete usage before settling and retains the cancelled hold; duplicate execution fails", () => {
  const paths = setup();
  try {
    const result = run(paths); assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(join(paths.campaign, "results.json"), "utf8"));
    assert.equal(report.results.length, 3);
    assert.equal(report.results[0].value.evaluation.pass, false); // never relabel semantic failure
    assert.equal(report.results[2].value.code, "CANCELLED");
    assert.equal(report.results[2].accounting, "pending");
    assert.equal(report.heldOrDebitedMicros, 6320000 + 2 * (20 * 6 + 10 * 24));
    const originalJournal = readFileSync(join(paths.campaign, "journal.jsonl"), "utf8");
    const rows = originalJournal.trim().split("\n").map(JSON.parse);
    for (const settled of rows.filter(r => r.kind === "settled")) {
      const observation = rows.findIndex(r => r.kind === "observed" && r.attemptId === settled.attemptId);
      assert.ok(observation > rows.findIndex(r => r.kind === "dispatched" && r.attemptId === settled.attemptId));
      assert.ok(observation < rows.indexOf(settled));
    }
    assert.doesNotMatch(originalJournal, /fixture-key|synthetic mismatch|secret upstream error/);
    const rerun = run(paths); assert.notEqual(rerun.status, 0);
    assert.equal(readFileSync(join(paths.campaign, "journal.jsonl"), "utf8"), originalJournal);
  } finally { rmSync(paths.directory, { recursive: true, force: true }); }
});

test("unknown provider failure stops campaign and retains full reservation, without error-body logging", () => {
  const paths = setup();
  try {
    const result = run(paths, true); assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(join(paths.campaign, "results.json"), "utf8"));
    assert.equal(report.results.length, 1); assert.equal(report.heldOrDebitedMicros, 6320000);
    assert.equal(report.results[0].accounting, "pending");
    assert.doesNotMatch(readFileSync(join(paths.campaign, "journal.jsonl"), "utf8"), /secret upstream error|fixture-key/);
  } finally { rmSync(paths.directory, { recursive: true, force: true }); }
});
