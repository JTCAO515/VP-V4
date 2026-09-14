import { openSync, writeSync, closeSync, fsyncSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadFixtures, fixtureRequestCount, runBatchProbe, HARD_CAP_REQUESTS } from "./batch-probe.mjs";

// Drives the full #362 matrix (120 search fixtures + 40 route fixtures) in
// HARD_CAP_REQUESTS-sized chunks, since that cap is a deliberate per-run
// safety ceiling this script does not raise or bypass — it just calls
// runBatchProbe multiple times, once per chunk, each writing its own
// numbered ledger file under the given directory. A 1s delay between
// requests within a chunk avoids hammering either provider; a short pause
// between chunks is left to the caller (this script runs chunks back to
// back, which is still well under either provider's confirmed daily quota).

export function chunk(fixtures, maxRequests) {
  const chunks = []; let current = [], count = 0;
  for (const fx of fixtures) {
    const n = (fx.operations ?? ["search", "walking"]).length;
    if (count + n > maxRequests) { chunks.push(current); current = []; count = 0; }
    current.push(fx); count += n;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [provider, ledgerDir, ...fixturePaths] = process.argv.slice(2);
  if (!["amap", "tencent"].includes(provider) || !ledgerDir || fixturePaths.length === 0) {
    console.error("Usage: node scripts/maps/run-full-matrix.mjs <amap|tencent> <ledger-dir> <fixtures.json...>");
    process.exit(1);
  }

  mkdirSync(ledgerDir, { recursive: true });
  const allFixtures = fixturePaths.flatMap(p => loadFixtures(readFileSync(p, "utf8")));
  const chunks = chunk(allFixtures, HARD_CAP_REQUESTS);
  console.log(JSON.stringify({ totalFixtures: allFixtures.length, totalRequests: fixtureRequestCount(allFixtures), chunkCount: chunks.length }));

  let allOk = true;
  for (const [i, fixtures] of chunks.entries()) {
    const ledger = join(ledgerDir, `${provider}-chunk-${String(i + 1).padStart(2, "0")}.jsonl`);
    const fd = openSync(ledger, "wx", 0o600);
    const record = value => { writeSync(fd, JSON.stringify(value) + "\n"); fsyncSync(fd); };
    record({ schemaVersion: "map-full-matrix-chunk/1", chunkIndex: i + 1, chunkCount: chunks.length, fixtureCount: fixtures.length });
    let ok;
    try {
      ok = await runBatchProbe({ provider, env: process.env, fixtures, record, delayMs: 1000 });
    } finally { closeSync(fd); }
    allOk = allOk && ok;
    console.log(JSON.stringify({ chunk: i + 1, of: chunks.length, provider, fixtureCount: fixtures.length, status: ok ? "ALL_OBSERVED" : "INCOMPLETE", ledger }));
  }
  console.log(JSON.stringify({ status: allOk ? "ALL_OBSERVED" : "INCOMPLETE", provider, totalChunks: chunks.length }));
  if (!allOk) process.exitCode = 1;
}
