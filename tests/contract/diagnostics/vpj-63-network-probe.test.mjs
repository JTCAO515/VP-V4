import assert from "node:assert/strict";
import test from "node:test";
import { probeNetwork, targetURL } from "../../../scripts/diagnostics/vpj-63-network-probe.mjs";

test("VPJ-63 only accepts a plain HTTPS target origin", () => {
  assert.equal(targetURL("https://staging.go2china.space").origin, "https://staging.go2china.space");
  for (const raw of ["http://staging.go2china.space", "https://user:secret@staging.go2china.space", "https://staging.go2china.space:443", "https://staging.go2china.space/path", "https://staging.go2china.space?q=1"]) assert.throws(() => targetURL(raw));
});

test("VPJ-63 records DNS and fixed identity, Trip, and Ask-policy probes without response bodies or credentials", async () => {
  const seen = [];
  const report = await probeNetwork({
    target: "https://staging.go2china.space", region: "synthetic-test", authorization: "Bearer never-print-this",
    resolver: async () => [{ address: "203.0.113.1", family: 4 }],
    fetcher: async (url, init) => { seen.push([url.pathname, init.headers.authorization]); return new Response(null, { status: url.pathname.includes("trip") ? 503 : 200 }); },
    now: () => "2026-09-17T00:00:00.000Z",
  });
  assert.deepEqual(seen.map(([path]) => path), ["/api/auth/native/v2/session", "/api/trips/native/v2", "/api/chat/native/v4/policy"]);
  assert.equal(report.authenticated, true);
  assert.equal(JSON.stringify(report).includes("never-print-this"), false);
  assert.equal(report.dns.outcome, "reachable");
  assert.deepEqual(report.phases.map(phase => [phase.name, phase.outcome, phase.status]), [["identity", "reachable", 200], ["trip", "http_error", 503], ["ask_policy", "reachable", 200]]);
});

test("VPJ-63 distinguishes authentication denial from transport failure", async () => {
  const report = await probeNetwork({
    target: "https://staging.go2china.space", region: "synthetic-test",
    resolver: async () => [{ address: "203.0.113.1", family: 4 }],
    fetcher: async () => new Response(null, { status: 401 }),
  });
  assert.deepEqual(report.phases.map(phase => phase.outcome), ["unauthorized", "unauthorized", "unauthorized"]);
});

test("VPJ-63 keeps DNS and request failures distinct", async () => {
  const report = await probeNetwork({
    target: "https://staging.go2china.space", region: "synthetic-test",
    resolver: async () => { throw new Error("dns unavailable"); },
    fetcher: async () => { throw new TypeError("network unavailable"); },
  });
  assert.equal(report.dns.outcome, "failed");
  assert.deepEqual(report.phases.map(phase => phase.outcome), ["failed", "failed", "failed"]);
});
