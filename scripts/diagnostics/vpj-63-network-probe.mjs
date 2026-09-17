import { lookup } from "node:dns/promises";
import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";

const VERSION = "vpj-63-network-probe/1";
const paths = Object.freeze([
  ["identity", "/api/auth/native/v2/session"],
  ["trip", "/api/trips/native/v2"],
  ["ask_policy", "/api/chat/native/v4/policy"],
]);

export function targetURL(raw) {
  if (typeof raw !== "string" || /^https:\/\/[^/?#]*:443(?:[/?#]|$)/.test(raw)) throw new Error("target must be a plain HTTPS origin");
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash || url.pathname !== "/") throw new Error("target must be a plain HTTPS origin");
  return url;
}

export async function probeNetwork({ target, region, authorization = null, fetcher = fetch, resolver = lookup, now = () => new Date().toISOString() }) {
  if (!region || region.length > 80) throw new Error("region label is required");
  const base = targetURL(target);
  const checkedAt = now();
  const dnsStarted = performance.now();
  let dns;
  try {
    const answers = await resolver(base.hostname, { all: true, verbatim: true });
    dns = { outcome: "reachable", latencyMs: elapsed(dnsStarted), addresses: answers.map(answer => answer.address) };
  } catch (error) {
    dns = { outcome: "failed", latencyMs: elapsed(dnsStarted), error: code(error) };
  }
  const headers = authorization ? { authorization } : {};
  const phases = await Promise.all(paths.map(async ([name, path]) => {
    const started = performance.now();
    try {
      const response = await fetcher(new URL(path, base), { headers, redirect: "error", signal: AbortSignal.timeout(15_000) });
      await response.body?.cancel();
      const outcome = response.ok ? "reachable" : [401, 403].includes(response.status) ? "unauthorized" : "http_error";
      return { name, path, outcome, status: response.status, latencyMs: elapsed(started) };
    } catch (error) {
      return { name, path, outcome: "failed", error: code(error), latencyMs: elapsed(started) };
    }
  }));
  return { schemaVersion: VERSION, checkedAt, region, authenticated: Boolean(authorization), target: base.origin, dns, phases };
}

function elapsed(started) { return Math.round((performance.now() - started) * 100) / 100; }
function code(error) { return error instanceof Error && error.name ? error.name : "unknown"; }

function argumentsFor(argv) {
  const values = new Map();
  for (let index = 2; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined || values.has(key)) throw new Error("usage: --target HTTPS_ORIGIN --region LABEL [--output PATH]");
    values.set(key, value);
  }
  return values;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const args = argumentsFor(process.argv);
    const report = await probeNetwork({ target: args.get("--target"), region: args.get("--region"), authorization: process.env.VP_NETWORK_PROBE_AUTHORIZATION ?? null });
    const output = JSON.stringify(report) + "\n";
    if (args.has("--output")) await writeFile(args.get("--output"), output, { encoding: "utf8", flag: "wx" });
    else process.stdout.write(output);
  } catch (error) {
    process.stderr.write(`VPJ-63 network probe failed: ${error instanceof Error ? error.message : "unknown"}\n`);
    process.exitCode = 2;
  }
}
