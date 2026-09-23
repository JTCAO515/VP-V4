#!/usr/bin/env node
// Read-only VPJ program status report generated from the GitHub API.
//
// Usage:
//   node scripts/program-status.mjs [--out FILE] [--json FILE] [--merged N] [--repo OWNER/NAME]
//
// Authentication: uses GH_TOKEN / GITHUB_TOKEN with fetch when present, otherwise the local
// authenticated `gh api` CLI. The script only issues GET requests; it never changes Issues,
// labels, PRs or deployments. It is not a PR gate: CI checks must not depend on GitHub API
// availability, so this runs only from the separate, non-required program-status workflow or
// locally. The report is a tracker/readback snapshot, never product or runtime acceptance.

import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLAN_PATH = 'docs/program/2026-09-05/issue-plan.json';
// Non-VPJ rows tracked in the status documents: map sub-issues #362–#367 and the first
// published S4/S5 slice Issues #503–#508 (S4-S5-SLICES-2026-09-22.md).
export const EXTRA_ISSUES = [362, 363, 364, 365, 366, 367, 503, 504, 505, 506, 507, 508];

export function parseArgs(argv) {
  const options = { merged: 40, extra: EXTRA_ISSUES };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i], value = argv[i + 1];
    if (flag === '--out') { options.out = value; i += 1; }
    else if (flag === '--json') { options.json = value; i += 1; }
    else if (flag === '--repo') { options.repo = value; i += 1; }
    else if (flag === '--merged') {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1 || n > 200) throw new Error('--merged must be an integer 1..200');
      options.merged = n; i += 1;
    } else if (flag === '--help' || flag === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (options.repo && !/^[\w.-]+\/[\w.-]+$/.test(options.repo)) throw new Error('--repo must be OWNER/NAME');
  return options;
}

function ghApi(endpoint) {
  return new Promise((resolve, reject) => execFile('gh', ['api', endpoint],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(`gh api ${endpoint} failed: ${stderr || error.message}`));
      try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); }
    }));
}

/** GET-only transport. Token comes from the environment and is never printed. */
export function createGetter(env = process.env) {
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  const base = (env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
  if (!token) return ghApi;
  return async endpoint => {
    const response = await fetch(`${base}/${endpoint}`, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
        'user-agent': 'vp-v4-program-status',
      },
    });
    if (!response.ok) throw new Error(`GET ${endpoint} failed: HTTP ${response.status}`);
    return response.json();
  };
}

async function paginate(get, endpoint, { maxPages = 20, truncate = false } = {}) {
  const items = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const sep = endpoint.includes('?') ? '&' : '?';
    const batch = await get(`${endpoint}${sep}per_page=100&page=${page}`);
    items.push(...batch);
    if (batch.length < 100) return items;
  }
  // Recent-first listings (closed PRs sorted by update time) only need the newest pages.
  if (truncate) return items;
  throw new Error(`${endpoint} exceeded ${maxPages} pages`);
}

/** Collect a read-only snapshot. `get` is injectable for tests. */
export async function collectStatus({ plan, get, merged = 40, extra = EXTRA_ISSUES, now = new Date() }) {
  const repo = plan.repo;
  const [commit, issues, openPulls, closedPulls, deployments] = await Promise.all([
    get(`repos/${repo}/commits/main`),
    paginate(get, `repos/${repo}/issues?state=all`),
    paginate(get, `repos/${repo}/pulls?state=open`),
    paginate(get, `repos/${repo}/pulls?state=closed&base=main&sort=updated&direction=desc`, { maxPages: 2, truncate: true }),
    get(`repos/${repo}/deployments?environment=Production&per_page=3`),
  ]);
  const deploymentStatuses = await Promise.all(deployments.map(d =>
    get(`repos/${repo}/deployments/${d.id}/statuses?per_page=1`).then(s => s[0] ?? null)));
  const byNumber = new Map(issues.filter(i => !i.pull_request).map(i => [i.number, i]));
  const issueRow = number => {
    const i = byNumber.get(number);
    return i ? { number, state: i.state.toUpperCase(), stateReason: i.state_reason ?? null,
      updatedAt: i.updated_at, closedAt: i.closed_at ?? null, title: i.title } : { number, state: 'MISSING' };
  };
  return {
    generatedAt: now.toISOString(),
    repo,
    main: { sha: commit.sha, date: commit.commit?.committer?.date ?? null,
      headline: (commit.commit?.message ?? '').split('\n')[0] },
    parent: issueRow(plan.parentNumber),
    tasks: plan.tasks.map(t => ({ id: t.id, stage: t.deliveryStage, plannedTitle: t.title, ...issueRow(t.number) })),
    extra: extra.map(issueRow),
    openPulls: openPulls.map(p => ({ number: p.number, title: p.title, draft: p.draft === true,
      base: p.base?.ref, head: p.head?.sha, updatedAt: p.updated_at }))
      .sort((a, b) => a.number - b.number),
    mergedPulls: closedPulls.filter(p => p.merged_at)
      .map(p => ({ number: p.number, title: p.title, base: p.base?.ref, mergedAt: p.merged_at,
        mergeCommit: p.merge_commit_sha }))
      .sort((a, b) => b.mergedAt.localeCompare(a.mergedAt) || b.number - a.number)
      .slice(0, merged),
    productionDeployments: deployments.map((d, index) => ({ sha: d.sha, ref: d.ref, createdAt: d.created_at,
      latestState: deploymentStatuses[index]?.state ?? null, latestStateAt: deploymentStatuses[index]?.created_at ?? null })),
  };
}

const cell = value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const short = sha => (sha ? sha.slice(0, 7) : '');
const issueLink = (repo, n) => `[#${n}](https://github.com/${repo}/issues/${n})`;
const pullLink = (repo, n) => `[#${n}](https://github.com/${repo}/pull/${n})`;
const stateText = row => row.state === 'CLOSED' && row.stateReason && row.stateReason !== 'completed'
  ? `CLOSED (${row.stateReason})` : row.state;

/** Pure Markdown rendering; kept deterministic for tests. */
export function renderStatusMarkdown(s) {
  const stages = [...new Set(s.tasks.map(t => t.stage))];
  const stageRows = stages.map(stage => {
    const rows = s.tasks.filter(t => t.stage === stage);
    const open = rows.filter(t => t.state === 'OPEN');
    return `| ${stage} | ${rows.length} | ${open.length} | ${rows.length - open.length} | ${open.map(t => issueLink(s.repo, t.number)).join(' ')} |`;
  });
  const lines = [
    '# VPJ 程序状态读回（自动生成）',
    '',
    `生成时间：${s.generatedAt} · 仓库：${s.repo} · main：\`${short(s.main.sha)}\`（${s.main.date ?? '未知'}，${cell(s.main.headline)}）`,
    '',
    '由 `node scripts/program-status.mjs` 只读查询 GitHub API 生成。OPEN/CLOSED 只是 Tracker 状态，不等于对应版本、环境或用户行为已验收；' +
      '部署记录只是 GitHub Deployment 元数据，不代表线上实际提供的版本；Vercel CLI/Dashboard 发布不产生这类记录，生产实际版本须以 Vercel alias 读取为准。',
    '',
    '## 阶段汇总',
    '',
    '| 阶段 | 任务 | OPEN | CLOSED | OPEN 任务 |',
    '| --- | ---: | ---: | ---: | --- |',
    ...stageRows,
    '',
    `Program ${issueLink(s.repo, s.parent.number)}：${stateText(s.parent)}。` +
      (s.extra.length ? ` 附加跟踪子票（地图/S4–S5 切片）：${s.extra.map(r => `${issueLink(s.repo, r.number)} ${stateText(r)}`).join('；')}。` : ''),
    '',
    '## 开放 PR',
    '',
    ...(s.openPulls.length ? ['| PR | 标题 | base | head | Draft | 最近更新（UTC） |', '| --- | --- | --- | --- | --- | --- |',
      ...s.openPulls.map(p => `| ${pullLink(s.repo, p.number)} | ${cell(p.title)} | ${cell(p.base)} | \`${short(p.head)}\` | ${p.draft ? '是' : '否'} | ${p.updatedAt} |`)]
      : ['无。']),
    '',
    `## 最近合并到 main 的 PR（最多 ${s.mergedPulls.length} 条）`,
    '',
    '| PR | 合并时间（UTC） | 合并提交 | 标题 |',
    '| --- | --- | --- | --- |',
    ...s.mergedPulls.map(p => `| ${pullLink(s.repo, p.number)} | ${p.mergedAt} | \`${short(p.mergeCommit)}\` | ${cell(p.title)} |`),
    '',
    '## GitHub Production Deployment 记录（仅元数据）',
    '',
    ...(s.productionDeployments.length ? ['| SHA | ref | 创建（UTC） | 最新状态 | 状态时间（UTC） |', '| --- | --- | --- | --- | --- |',
      ...s.productionDeployments.map(d => `| \`${short(d.sha)}\` | ${cell(short(d.ref) === short(d.sha) ? short(d.ref) : d.ref)} | ${d.createdAt} | ${cell(d.latestState ?? '无')} | ${d.latestStateAt ?? ''} |`)]
      : ['无记录。']),
    '',
    '## 全部 VPJ 任务',
    '',
    '| 任务 | 阶段 | GitHub 状态 | 最近更新（UTC） | 关闭（UTC） |',
    '| --- | --- | --- | --- | --- |',
    ...s.tasks.map(t => `| ${issueLink(s.repo, t.number)} ${t.id} ${cell(t.plannedTitle)} | ${t.stage} | ${stateText(t)} | ${t.updatedAt ?? ''} | ${t.closedAt ?? ''} |`),
    '',
  ];
  return lines.join('\n');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node scripts/program-status.mjs [--out FILE] [--json FILE] [--merged N] [--repo OWNER/NAME]');
    return;
  }
  const plan = JSON.parse(readFileSync(path.join(root, PLAN_PATH), 'utf8'));
  if (options.repo) plan.repo = options.repo;
  const status = await collectStatus({ plan, get: createGetter(), merged: options.merged, extra: options.extra });
  const markdown = renderStatusMarkdown(status);
  if (options.json) writeFileSync(options.json, JSON.stringify(status, null, 2) + '\n');
  if (options.out) writeFileSync(options.out, markdown);
  else process.stdout.write(markdown);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
