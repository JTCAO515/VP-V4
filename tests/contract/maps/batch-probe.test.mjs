import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadFixtures, requestsForFixture, runBatchProbe, HARD_CAP_REQUESTS, MAX_DELAY_MS } from "../../../scripts/maps/batch-probe.mjs";

const okFixtures = [
  { city: "上海市", category: "airport_terminal", query: "上海虹桥国际机场2号航站楼", from: { lat: 31.1975, lng: 121.3364 }, to: { lat: 31.2, lng: 121.34 } },
  { city: "北京市", category: "station_exit", query: "北京西站", from: { lat: 39.8952, lng: 116.3226 }, to: { lat: 39.899, lng: 116.327 } },
];

test("loadFixtures rejects malformed or empty input", () => {
  assert.throws(() => loadFixtures("[]"));
  assert.throws(() => loadFixtures("not json"));
  assert.throws(() => loadFixtures(JSON.stringify([{ city: "x" }])));
  assert.deepEqual(loadFixtures(JSON.stringify(okFixtures)), okFixtures);
});

test("requestsForFixture keeps fixed official endpoints and coordinate order", () => {
  const [search, walking] = requestsForFixture("amap", "secret", okFixtures[0]);
  assert.equal(search.url.hostname, "restapi.amap.com");
  assert.equal(search.url.searchParams.get("keywords"), "上海虹桥国际机场2号航站楼");
  assert.equal(walking.url.searchParams.get("origin"), "121.3364,31.1975");
  const [tSearch] = requestsForFixture("tencent", "secret", okFixtures[1]);
  assert.equal(tSearch.url.hostname, "apis.map.qq.com");
  assert.equal(tSearch.url.searchParams.get("boundary"), "region(北京市,0)");
  assert.throws(() => requestsForFixture("evil", "secret", okFixtures[0]));
});

test("hard cap rejects a fixture list that would exceed it", async () => {
  const tooMany = Array.from({ length: 21 }, (_, i) => ({ ...okFixtures[0], query: `q${i}` }));
  await assert.rejects(() => runBatchProbe({ provider: "amap", env: { AMAP_PROBE_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fixtures: tooMany, record: () => {}, fetcher: () => { throw new Error("must not call"); } }));
  assert.equal(tooMany.length * 2 > HARD_CAP_REQUESTS, true);
});

test("disabled or missing credentials never dispatch", async () => {
  const rows = [];
  const ok = await runBatchProbe({ provider: "amap", env: {}, fixtures: okFixtures, record: r => rows.push(r),
    fetcher: () => { throw new Error("must not call"); } });
  assert.equal(ok, false);
  assert.equal(rows[0].requests, 0);
});

test("successful batch dispatches exactly 2 requests per fixture and redacts secrets", async () => {
  const rows = []; let calls = 0;
  const ok = await runBatchProbe({ provider: "tencent", env: { TENCENT_MAP_PROBE_ENABLED: "true", TENCENT_MAP_WEB_SERVICE_KEY: "secret" },
    fixtures: okFixtures, record: r => rows.push(r),
    fetcher: async () => Response.json(++calls % 2 === 1 ? { status: 0, data: [{ id: "1", title: "p" }] } : { status: 0, result: { routes: [{ distance: 100, duration: 2 }] } }) });
  assert.equal(ok, true);
  assert.equal(calls, okFixtures.length * 2);
  assert.equal(JSON.stringify(rows).includes("secret"), false);
});

test("one non-observed result marks the batch incomplete but does not stop remaining fixtures", async () => {
  let calls = 0;
  const ok = await runBatchProbe({ provider: "amap", env: { AMAP_PROBE_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fixtures: okFixtures, record: () => {},
    fetcher: async () => { calls += 1; return calls === 1 ? Response.json({ status: "0", infocode: "10001" }) : Response.json({ status: "1", infocode: "10000", pois: [] }); } });
  assert.equal(ok, false);
  assert.equal(calls, okFixtures.length * 2);
});

test("delayMs sleeps between requests but never before the first, and rejects out-of-range values", async () => {
  const sleeps = [];
  const fakeSleep = ms => { sleeps.push(ms); return Promise.resolve(); };
  let calls = 0;
  const ok = await runBatchProbe({ provider: "amap", env: { AMAP_PROBE_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fixtures: okFixtures, delayMs: 500, sleep: fakeSleep, record: () => {},
    fetcher: async () => Response.json(++calls % 2 === 1
      ? { status: "1", infocode: "10000", pois: [{ id: "1", name: "p" }] }
      : { status: "1", infocode: "10000", route: { paths: [{ distance: "100", cost: { duration: "60" } }] } }) });
  assert.equal(ok, true);
  assert.deepEqual(sleeps, [500, 500, 500]);

  await assert.rejects(() => runBatchProbe({ provider: "amap", env: { AMAP_PROBE_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fixtures: okFixtures, delayMs: MAX_DELAY_MS + 1, record: () => {}, fetcher: () => { throw new Error("must not call"); } }));
  await assert.rejects(() => runBatchProbe({ provider: "amap", env: { AMAP_PROBE_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fixtures: okFixtures, delayMs: -1, record: () => {}, fetcher: () => { throw new Error("must not call"); } }));
});

test("CLI refuses ledger reuse and an oversized fixtures file", () => {
  const root = mkdtempSync(join(tmpdir(), "vp-map-batch-"));
  try {
    const fixturesPath = join(root, "fixtures.json");
    writeFileSync(fixturesPath, JSON.stringify(okFixtures));
    const ledger = join(root, "probe.jsonl");
    const args = ["scripts/maps/batch-probe.mjs", "amap", ledger, fixturesPath];
    const env = { ...process.env, AMAP_PROBE_ENABLED: "false", AMAP_WEB_SERVICE_KEY: "" };
    assert.equal(spawnSync(process.execPath, args, { env }).status, 1);
    const before = readFileSync(ledger, "utf8");
    assert.equal(JSON.parse(before.trim().split("\n").at(-1)).reason, "disabled");
    assert.equal(spawnSync(process.execPath, args, { env }).status, 1);
    assert.equal(readFileSync(ledger, "utf8"), before);

    const bigFixturesPath = join(root, "big.json");
    writeFileSync(bigFixturesPath, JSON.stringify(Array.from({ length: 21 }, (_, i) => ({ ...okFixtures[0], query: `q${i}` }))));
    const bigLedger = join(root, "big.jsonl");
    assert.equal(spawnSync(process.execPath, ["scripts/maps/batch-probe.mjs", "amap", bigLedger, bigFixturesPath], { env }).status, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
