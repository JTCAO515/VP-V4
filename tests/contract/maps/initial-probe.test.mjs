import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { requests, runProbe, summarize, limits, tencentSig } from "../../../scripts/maps/probe.mjs";

test("fixed official endpoints keep provider coordinate order and city restriction", () => {
  const a = requests("amap", "secret"), t = requests("tencent", "secret");
  assert.deepEqual(a.map(r => r.url.hostname), ["restapi.amap.com", "restapi.amap.com"]);
  assert.deepEqual(t.map(r => r.url.hostname), ["apis.map.qq.com", "apis.map.qq.com"]);
  assert.equal(a[0].url.searchParams.get("city_limit"), "true");
  assert.equal(t[0].url.searchParams.get("boundary"), "region(北京市,0)");
  assert.equal(a[1].url.searchParams.get("origin"), "116.307535,39.984042");
  assert.equal(t[1].url.searchParams.get("from"), "39.984042,116.307535");
  assert.equal(t[0].url.searchParams.has("sig"), false, "no sig without an sk");
  assert.throws(() => requests("https://evil.example", "secret"));
  assert.throws(() => requests("constructor", "secret"));
});

test("tencentSig matches the documented worked example and is only applied for tencent+sk", () => {
  // lbs.qq.com's own sn-guide worked example: md5(path + "?" + sorted params + SK).
  const params = { key: "5Q5BZ-5EVWJ-SN5F3-K6QBZ-B3FAO-RVBWM", location: "28.7033487,115.8660847" };
  const sig = tencentSig("/ws/geocoder/v1", params, "SWvT26ypwq5Nwb5RvS8cLi6NSoH8HlJX");
  assert.equal(sig, "90da272bfa19122547298e2b0bcc0e50");

  const signed = requests("tencent", "secret", "sk-value");
  assert.equal(signed[0].url.searchParams.has("sig"), true);
  assert.equal(signed[0].url.searchParams.get("sig").length, 32);
  const unsigned = requests("amap", "secret", "sk-value");
  assert.equal(unsigned[0].url.searchParams.has("sig"), false, "amap never signs, even if an sk is passed");
});

test("CLI refuses ledger reuse without overwriting a prior admission", () => {
  const root = mkdtempSync(join(tmpdir(), "vp-map-probe-"));
  try {
    const ledger = join(root, "probe.jsonl");
    const args = ["scripts/maps/probe.mjs", "amap", ledger];
    const env = { ...process.env, AMAP_PROBE_ENABLED: "false", AMAP_WEB_SERVICE_KEY: "" };
    assert.equal(spawnSync(process.execPath, args, { env }).status, 1);
    const before = readFileSync(ledger, "utf8");
    assert.equal(JSON.parse(before.trim().split("\n").at(-1)).reason, "disabled");
    assert.equal(spawnSync(process.execPath, args, { env }).status, 1);
    assert.equal(readFileSync(ledger, "utf8"), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("disabled or missing credentials never dispatch", async () => {
  for (const env of [{}, { AMAP_PROBE_ENABLED: "true" }]) {
    const rows = [];
    assert.equal(await runProbe({ provider: "amap", env, record: r => rows.push(r), fetcher: () => { throw new Error("must not call"); } }), false);
    assert.equal(rows[0].requests, 0);
  }
});

test("successful probe reserves exactly two calls and normalizes duration units", async () => {
  const rows = []; let calls = 0;
  const ok = await runProbe({ provider: "tencent", env: { TENCENT_MAP_PROBE_ENABLED: "true", TENCENT_MAP_WEB_SERVICE_KEY: "secret" }, record: r => rows.push(r),
    fetcher: async (_url, options) => {
      assert.equal(rows.at(-1).phase, "admitted");
      assert.equal(options.redirect, "error"); assert.ok(options.signal);
      return Response.json(++calls === 1 ? { status: 0, data: [{ id: "123", title: "public place" }] } : { status: 0, result: { routes: [{ distance: 1000, duration: 12 }] } });
    } });
  assert.equal(ok, true); assert.equal(calls, 2);
  assert.equal(rows.at(-1).routes[0].durationSeconds, 720);
  assert.equal(JSON.stringify(rows).includes("secret"), false);
  assert.equal(summarize("amap", "walking", { status: "1", infocode: "10000", route: { paths: [{ distance: "1000", cost: { duration: "720" } }] } }).routes[0].durationSeconds, 720);
});

test("rejection, oversized response and transport errors stop without retries or leaked messages", async () => {
  for (const fetcher of [
    async () => Response.json({ status: "0", infocode: "10001", info: "secret" }),
    async () => new Response("secret".repeat(limits.responseBytes)),
    async () => { throw new Error("secret URL"); },
  ]) {
    let calls = 0; const rows = [];
    assert.equal(await runProbe({ provider: "amap", env: { AMAP_PROBE_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" }, record: r => rows.push(r),
      fetcher: (...args) => { calls += 1; return fetcher(...args); } }), false);
    assert.equal(calls, 1); assert.equal(JSON.stringify(rows).includes("secret"), false);
  }
});

test("missing route time remains unknown and provider message cannot become evidence", () => {
  const result = summarize("tencent", "walking", { status: 0, result: { routes: [{ distance: 1 }] } });
  assert.equal(result.routes[0].durationSeconds, null);
  assert.equal(result.routeExecutability, "UNRUN");
  assert.deepEqual(summarize("amap", "search", { status: "0", infocode: "secret" }), { status: "provider_rejected", code: null });
});
