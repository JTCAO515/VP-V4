/** Private service-case runner diagnostics. Raw CLI bytes never leave this process. */
import { spawn } from 'node:child_process';

const hints = [
  ['port_conflict', /address already in use|port is already allocated|bind:.*address already in use/i],
  ['docker_unavailable', /cannot connect to the docker daemon|docker daemon is not running/i],
  ['image_rate_limit', /toomanyrequests|rate exceeded|data limit exceeded/i],
  ['image_pull', /failed to pull|error pulling|pull access denied|manifest unknown/i],
  ['resource_exhausted', /no space left on device|out of memory|cannot allocate memory/i],
  ['health_check', /unhealthy|health check.*failed|failed.*health check/i],
  ['migration', /failed to apply migration|error running migrations/i],
];
// Each stream keeps only a bounded overlap to recognize phrases split across chunks.
// Diagnostics contain literal enums only; matches are hints, never a root-cause verdict.
export function opsOutputClassifier() {
  const tails = { stdout: '', stderr: '' };
  const seen = new Set();
  return {
    consume(stream, chunk) {
      const input = tails[stream] + chunk.toString();
      for (const [hint, pattern] of hints) if (pattern.test(input)) seen.add(hint);
      tails[stream] = input.slice(-256);
    },
    hints() { return hints.filter(([hint]) => seen.has(hint)).map(([hint]) => hint); },
  };
}

export function runOpsProcess(command, args, { phase, cwd, env = process.env, report = line => console.error(line) }) {
  if (!['start', 'cleanup'].includes(phase)) throw new Error('Invalid Ops process phase');
  return new Promise(resolve => {
    const classifier = opsOutputClassifier();
    let launchError = 'none';
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', chunk => classifier.consume('stdout', chunk));
    child.stderr.on('data', chunk => classifier.consume('stderr', chunk));
    child.once('error', error => {
      launchError = ['ENOENT', 'EACCES'].includes(error.code) ? error.code : 'other';
    });
    // close drains both streams before verdict; exit alone can omit the final failure hint.
    child.once('close', (code, signal) => {
      const exitCode = launchError !== 'none' || code === null || code < 0 ? 1 : code;
      if (exitCode !== 0 || signal || launchError !== 'none') {
        report('VP_OPS_PROCESS_FAILURE ' + JSON.stringify({
          schema: 'ops-process-failure/1', phase, exitCode,
          termination: signal ? 'signal' : launchError !== 'none' ? 'launch_error' : 'exit',
          launchError, hints: classifier.hints(),
        }));
      }
      resolve(exitCode);
    });
  });
}
