#!/usr/bin/env node
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { recordedUsageTrace } from '../evals/harness/recorded/usage-trace.ts';

// Offline only: no credentials, provider, DB connection or settlement capability.
try {
  if (process.argv.length !== 3) throw new Error('Invalid arguments');
  const path = process.argv[2];
  if (!statSync(path).isFile() || statSync(path).size > 2_097_152) throw new Error('Invalid file');
  const raw = readFileSync(path);
  const report = recordedUsageTrace(JSON.parse(raw.toString('utf8')));
  console.log(JSON.stringify({ ...report, recordingSha256: createHash('sha256').update(raw).digest('hex') }, null, 2));
  if (report.traceValidation !== 'PASS') process.exitCode = 2;
} catch {
  // JSON and filesystem exceptions can contain source text. Never forward them.
  console.error('Recorded task trace unavailable: invalid recording or arguments.');
  process.exitCode = 1;
}
