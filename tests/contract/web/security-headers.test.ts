import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  contentSecurityPolicy,
  mapContentSecurityPolicy,
  securityHeaderRules,
} from "../../../lib/security/headers.ts";

const directives = (policy: string) =>
  new Map(policy.split(";").map(part => part.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));

const prod = { dev: false, vercelEnv: "production" };

test("next.config.ts applies the shared security header rules", () => {
  const source = readFileSync("next.config.ts", "utf8");
  assert.match(source, /async headers\(\)/);
  assert.match(source, /securityHeaderRules\(/);
  assert.match(source, /dev: process\.env\.NODE_ENV !== "production"/);
});

test("every route gets the static hardening headers and the base CSP", () => {
  const [all] = securityHeaderRules(prod);
  assert.equal(all.source, "/:path*");
  const byKey = new Map(all.headers.map(h => [h.key, h.value]));
  assert.equal(byKey.get("X-Content-Type-Options"), "nosniff");
  assert.equal(byKey.get("X-Frame-Options"), "DENY");
  assert.equal(byKey.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(byKey.get("Cross-Origin-Opener-Policy"), "same-origin");
  const permissions = byKey.get("Permissions-Policy") ?? "";
  for (const feature of ["camera=()", "microphone=()", "geolocation=()", "payment=()"]) assert.ok(permissions.includes(feature), feature);
  assert.equal(byKey.get("Content-Security-Policy"), contentSecurityPolicy(prod));
});

test("base production CSP is same-origin, no eval, no framing, no plugins, no third-party map origins", () => {
  const csp = directives(contentSecurityPolicy(prod));
  assert.deepEqual(csp.get("default-src"), ["'self'"]);
  assert.deepEqual(csp.get("frame-ancestors"), ["'none'"]);
  assert.deepEqual(csp.get("object-src"), ["'none'"]);
  assert.deepEqual(csp.get("base-uri"), ["'self'"]);
  assert.deepEqual(csp.get("form-action"), ["'self'"]);
  assert.deepEqual(csp.get("connect-src"), ["'self'"]);
  assert.deepEqual(csp.get("frame-src"), ["'none'"]);
  assert.ok(!csp.get("script-src")?.includes("'unsafe-eval'"));
  assert.ok(!contentSecurityPolicy(prod).includes("amap"));
  assert.ok(!contentSecurityPolicy(prod).includes("vercel.live"));
  // No wildcard sources anywhere in the base policy.
  assert.ok(![...csp.values()].flat().some(v => v === "*" || v === "https:" || v === "http:"));
});

test("development adds only 'unsafe-eval' (Next dev runtime); preview adds only vercel.live toolbar origins", () => {
  assert.ok(directives(contentSecurityPolicy({ dev: true })).get("script-src")?.includes("'unsafe-eval'"));
  const preview = contentSecurityPolicy({ dev: false, vercelEnv: "preview" });
  assert.ok(preview.includes("https://vercel.live"));
  assert.ok(!directives(preview).get("script-src")?.includes("'unsafe-eval'"));
  assert.deepEqual(directives(preview).get("frame-ancestors"), ["'none'"]);
});

test("/places alone gets the AMap relaxation, and its rule comes after the catch-all so it wins", () => {
  const rules = securityHeaderRules(prod);
  assert.equal(rules.length, 2);
  assert.equal(rules[1].source, "/places");
  const enforced = rules[1].headers.find(h => h.key === "Content-Security-Policy")?.value ?? "";
  const reportOnly = rules[1].headers.find(h => h.key === "Content-Security-Policy-Report-Only")?.value ?? "";
  assert.equal(enforced, mapContentSecurityPolicy(prod));
  const map = directives(enforced);
  for (const name of ["script-src", "connect-src", "img-src", "style-src"]) {
    assert.ok(map.get(name)?.includes("https://*.amap.com"), name);
    assert.ok(map.get(name)?.includes("https://*.autonavi.com"), name);
  }
  assert.ok(map.get("worker-src")?.includes("blob:"));
  assert.ok(map.get("script-src")?.includes("'unsafe-eval'"));
  // Framing, plugin and form restrictions are not relaxed for the map page.
  assert.deepEqual(map.get("frame-ancestors"), ["'none'"]);
  assert.deepEqual(map.get("object-src"), ["'none'"]);
  assert.deepEqual(map.get("form-action"), ["'self'"]);
  // The Report-Only candidate is the same policy minus 'unsafe-eval'.
  assert.ok(!directives(reportOnly).get("script-src")?.includes("'unsafe-eval'"));
  assert.ok(directives(reportOnly).get("script-src")?.includes("https://*.amap.com"));
});
