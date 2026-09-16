import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";

/**
 * Repo-wide guard for the credential this round's `SUPABASE_SERVICE_ROLE_KEY`
 * addition (lib/server/maps/service-role-client.ts) introduces -- the first
 * service-role-authorized runtime client this codebase has ever had. #363's
 * "凭据分域" acceptance bullet remains open (no client-facing map-display SDK
 * exists yet to domain-separate against -- see
 * docs/contracts/place-identity.md's Non-goals list), but this test locks in
 * the one concrete boundary that credential's addition must never cross:
 * only lib/server/maps/service-role-client.ts may read it, and no
 * client-rendered surface (components/**, app/**\/page.tsx,
 * app/**\/layout.tsx, ios/**) may reference it or the AMap/Tencent Web
 * Service keys at all.
 */

const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".swift", ".mjs", ".js", ".plist", ".xcconfig", ".json"]);
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".claude", "dist", "build"]);

function walk(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (TEXT_EXTENSIONS.has(extname(entry.name))) out.push(full);
  }
  return out;
}

test("SUPABASE_SERVICE_ROLE_KEY is read nowhere in application code except the dedicated factory", () => {
  const offenders: string[] = [];
  for (const file of walk(".")) {
    if (file === "lib/server/maps/service-role-client.ts") continue;
    if (file.startsWith("tests/")) continue;
    const source = readFileSync(file, "utf8");
    if (source.includes("SUPABASE_SERVICE_ROLE_KEY")) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

test("no client-rendered surface (components/**, ios/**, page/layout files) references any map service credential", () => {
  const clientDirs = ["components", "ios"];
  const pattern = /SUPABASE_SERVICE_ROLE_KEY|AMAP_WEB_SERVICE_KEY|TENCENT_MAP_WEB_SERVICE_KEY|TENCENT_MAP_SK/;
  const offenders: string[] = [];
  for (const dir of clientDirs) {
    for (const file of walk(dir)) {
      if (pattern.test(readFileSync(file, "utf8"))) offenders.push(file);
    }
  }
  for (const file of walk("app")) {
    if (!/page\.tsx$|layout\.tsx$/.test(file)) continue;
    if (pattern.test(readFileSync(file, "utf8"))) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

test("no NEXT_PUBLIC_-prefixed variable name carries any map or service-role secret", () => {
  const offenders: string[] = [];
  const pattern = /NEXT_PUBLIC_[A-Z0-9_]*(?:AMAP|TENCENT_MAP|SERVICE_ROLE)[A-Z0-9_]*/;
  for (const file of walk(".")) {
    if (file.startsWith("tests/")) continue;
    const match = readFileSync(file, "utf8").match(pattern);
    if (match) offenders.push(`${file}:${match[0]}`);
  }
  assert.deepEqual(offenders, []);
});
