import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";

// Real built routes with no supplied target/provider credentials. This tests
// ingress/config denial only; it does not prove a qualified source RPC exists.
test("Guide native/web routes reject mixed credentials and cross-origin input before target work", async () => {
  const portProbe = createServer(); portProbe.listen(0, "127.0.0.1"); await once(portProbe, "listening");
  const port = portProbe.address().port; await new Promise(resolve => portProbe.close(resolve));
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(), env: { PATH: process.env.PATH, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = ""; child.stdout.on("data", c => { output += c.toString(); }); child.stderr.on("data", c => { output += c.toString(); });
  try {
    const started = Date.now();
    while (!output.includes("Ready in")) {
      if (child.exitCode !== null || Date.now() - started > 10000) throw Error("Owned built server did not start");
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    const root = `http://127.0.0.1:${port}`, trip = "00000000-0000-4000-8000-000000000001";
    const native = `/api/guide/native/v1/trips/${trip}`, web = `/api/guide/trips/${trip}`;
    const denied = [
      [native, { cookie: "fixture=1" }], [native, { origin: root }], [`${native}?actor=caller`, {}],
      [web, { authorization: "Bearer owned-invalid-fixture", origin: root }], [web, { origin: "https://cross-origin.invalid" }],
      [web, { origin: root, "sec-fetch-site": "cross-site" }],
    ];
    for (const [path, headers] of denied) {
      const response = await fetch(root + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: "{}" });
      assert.equal(response.status, 400); assert.deepEqual(await response.json(), { error: { code: "INVALID_INPUT" } });
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.ok(response.headers.get("vary").split(",").map(v => v.trim()).includes(path.startsWith(native) ? "Authorization" : "Cookie"));
    }
    const absent = await fetch(root + native, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(absent.status, 503); assert.deepEqual(await absent.json(), { error: { code: "GUIDE_UNAVAILABLE" } });
  } finally {
    if (child.exitCode === null) { const stopped = once(child, "exit"); child.kill("SIGTERM"); await stopped; }
  }
});
