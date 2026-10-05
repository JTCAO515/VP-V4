// Starts/removes only its uniquely named local synthetic Ask stack. No repo .env.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { nativeHTTPOptions, nativeHTTPChildEnv, nativeHTTPSupabaseConfig, assertNativeHTTPPortsFree } from "../turn/native-http-ports.mjs";
const { mode, ports } = nativeHTTPOptions(process.argv.slice(2), process.env);
if (mode) throw Error("Guide runner accepts only an explicit port base");
await assertNativeHTTPPortsFree(ports);
if (process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT) throw Error("Docker overrides refused");
const context = execFileSync("docker", ["context", "show"], { encoding: "utf8" }).trim();
const inspected = JSON.parse(execFileSync("docker", ["context", "inspect", context], { encoding: "utf8" }))[0];
if (!inspected.Endpoints.docker.Host.startsWith("unix:///")) throw Error("Local Docker context required");
const project = "vp-native-ask-" + randomUUID().slice(0, 8), target = mkdtempSync(join(tmpdir(), "vpj28-guide-http-"));
mkdirSync(join(target, "supabase"));
writeFileSync(join(target, "supabase/config.toml"), nativeHTTPSupabaseConfig(readFileSync("supabase/config.toml", "utf8"), project, ports));
cpSync("supabase/migrations", join(target, "supabase/migrations"), { recursive: true });
const env = { ...process.env, DOCKER_CONTEXT: context };
const run = (cmd, args, visible = false, childEnv = env) => new Promise((resolve, reject) => {
  const child = spawn(cmd, args, { cwd: process.cwd(), env: childEnv, stdio: visible ? "inherit" : ["ignore", "pipe", "pipe"] });
  if (!visible) { child.stdout.resume(); child.stderr.resume(); }
  child.once("error", () => reject(Error("Owned process launch failed"))); child.once("exit", code => resolve(code ?? 1));
});
let result = 1;
try {
  if (await run("supabase", ["start", "--workdir", target, "-x", "realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor"]) !== 0) throw Error("Owned stack start failed; credential-bearing output suppressed");
  console.log("VP_GUIDE_HTTP_TARGET " + JSON.stringify({ project, api: ports.api, supabaseAPI: ports.supabaseAPI }));
  result = await run(process.execPath, ["--experimental-strip-types", "--test", "tests/integration/guide/guide-http.test.mjs"], true,
    { ...env, VP_GUIDE_HTTP_INTEGRATION: "true", VISEPANDA_TRIP_PROTOCOL_V2: "true", ...nativeHTTPChildEnv(ports, target) });
} finally {
  if (await run("supabase", ["stop", "--workdir", target, "--no-backup"]) !== 0) { console.error("Owned Guide stack cleanup failed for " + project); result = 1; }
  else { rmSync(target, { recursive: true }); console.log("VP_GUIDE_HTTP_CLEANUP " + JSON.stringify({ project, result: "PASS" })); }
}
process.exitCode = result;
