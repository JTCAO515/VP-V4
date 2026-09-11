import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Only known navigation and planning documents qualify. Runtime data, contracts,
// ADRs, code, tests, workflow changes and unknown files retain the complete gate.
const documents = new Set([
  'README.md', 'AGENTS.md', 'CONTEXT.md', 'HANDOFF.md',
  'docs/INDEX.md', 'docs/handoff.json', 'docs/manifest.json',
  'docs/program/2026-09-05/issue-plan.json',
]);
const documentPatterns = [
  /^docs\/agents\/(?:[^/]+\/)*[^/]+\.md$/,
  /^docs\/maintenance\/[^/]+\.md$/,
  /^docs\/program\/2026-09-05\/(?:README|AGENT-KICKOFF|DELIVERY-STAGES|EXECUTION-CONTRACT|ISSUES)\.md$/,
  /^docs\/program\/2026-09-05\/issue-bodies\/VPJ-\d{2}\.md$/,
];

export function classifyChanges(files, eventName) {
  return eventName === 'pull_request' && files.length > 0 &&
    files.every(file => documents.has(file) || documentPatterns.some(pattern => pattern.test(file)))
    ? 'documentation' : 'full';
}

export function detectScope(env = process.env) {
  if (env.VP_CI_EVENT !== 'pull_request' ||
      !/^[a-f0-9]{40}$/.test(env.VP_CI_BASE ?? '') ||
      !/^[a-f0-9]{40}$/.test(env.VP_CI_HEAD ?? '')) return 'full';
  try {
    // Disable rename detection so moving runtime code into docs cannot hide its old path.
    const changed = execFileSync('git', ['diff', '--name-only', '--no-renames', '-z',
      env.VP_CI_BASE, env.VP_CI_HEAD, '--'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return classifyChanges(changed.split('\0').filter(Boolean), env.VP_CI_EVENT);
  } catch {
    return 'full';
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/ci-change-scope.mjs')) {
  const scope = detectScope();
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `scope=${scope}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    scope === 'documentation'
      ? '\nDocumentation scope: source-policy lint, governance, contracts and docs checks run. Runtime/build/browser suites are not applicable to this allowlisted documentation diff; this is not product acceptance.\n'
      : '\nFull scope: all existing product checks run.\n');
  console.log(`Quality PR scope: ${scope}`);
}
