// Derives an executable order for the still-open VPJ tasks from issue-plan.json and the live
// GitHub state passed in, and writes docs/program/2026-09-05/EXECUTION-SEQUENCE.md.
//
// This is an ordering over the existing manifest, not a second task queue: it invents no task,
// changes no identity, scope, acceptance or dependency, and closes nothing. `blockedBy` is a real
// start blocker; `acceptanceDependencies` is an integration/acceptance input that does NOT stop a
// bounded slice from starting, per docs/agents/issue-tracker.md. Waves are therefore computed from
// acceptance depth only to say what each task's final acceptance has to wait on, while the
// "startable now" list is computed from hard blockers alone.
//
//   node scripts/vpj-sequence.mjs --open <file.json>   # gh issue list --state open --json number,labels
//   node scripts/vpj-sequence.mjs --check              # verify the committed document is current
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const dir = "docs/program/2026-09-05";
const target = `${dir}/EXECUTION-SEQUENCE.md`;
const plan = JSON.parse(readFileSync(`${dir}/issue-plan.json`, "utf8"));

const STAGES = ["S3", "S4", "S5", "S6"];
const TEAMS = [
  ["team:journey-experience", "B · 行程/地图/原生体验"],
  ["team:platform-delivery", "A · 平台/商业/交付"],
  ["team:ai-knowledge", "C · AI/知识/质量"],
];

export function computeSequence(tasks, openNumbers, teamOf) {
  // Resolve ids inside the supplied set, not the module-level manifest, so the ordering is a pure
  // function of its inputs and a fixture graph behaves the same way the real one does.
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const open = tasks.filter((task) => openNumbers.has(task.number));
  const openIds = new Set(open.map((task) => task.id));
  const openDeps = (task, field) => (task[field] ?? []).filter((id) => openIds.has(id));

  // Longest remaining acceptance chain. Cycles are impossible here because the manifest's own
  // validator rejects them, but guard anyway so a bad edit fails loudly instead of hanging.
  const depth = new Map();
  const resolve = (id, seen = new Set()) => {
    if (depth.has(id)) return depth.get(id);
    assert.ok(!seen.has(id), `acceptance cycle at ${id}`);
    const task = byId.get(id);
    const inputs = [...openDeps(task, "blockedBy"), ...openDeps(task, "acceptanceDependencies")];
    const value = inputs.length === 0 ? 0 : 1 + Math.max(...inputs.map((next) => resolve(next, new Set([...seen, id]))));
    depth.set(id, value);
    return value;
  };
  for (const task of open) resolve(task.id);

  return open
    .map((task) => ({
      task,
      team: teamOf(task.number),
      wave: depth.get(task.id),
      hardBlockers: openDeps(task, "blockedBy"),
      acceptanceInputs: openDeps(task, "acceptanceDependencies"),
    }))
    .sort((a, b) => a.wave - b.wave || a.task.number - b.task.number);
}

const row = (entry) =>
  `| [${entry.task.id} #${entry.task.number}](https://github.com/JTCAO515/VP-V4/issues/${entry.task.number}) ` +
  `| ${entry.task.title} | ${entry.task.deliveryStage} | ${entry.hardBlockers.join(", ") || "无"} ` +
  `| ${entry.acceptanceInputs.length} |`;

export function renderSequence(entries, generatedOn) {
  const inScope = entries.filter((entry) => STAGES.includes(entry.task.deliveryStage));
  const startable = inScope.filter((entry) => entry.hardBlockers.length === 0);
  const waves = [...new Set(inScope.map((entry) => entry.wave))].sort((a, b) => a - b);

  let out = `# S3–S6 可执行顺序\n\n`;
  out += `生成自 \`issue-plan.json\` 与当日 GitHub 开放 Issue（${generatedOn}）：\`node scripts/vpj-sequence.mjs\`。\n`;
  out += `这是既有任务的排序，不是第二套队列——不新增任务，不改身份、范围、验收或依赖，也不关闭任何票。\n`;
  out += `任务定义仍以 [issue-plan.json](issue-plan.json) 和各自[执行行](EXECUTION-CONTRACT.md)为准。\n\n`;
  out += `\`blockedBy\` 是开工硬依赖；\`acceptanceDependencies\` 是集成/最终验收输入，**不阻止有界切片开工**\n`;
  out += `（见 [issue-tracker.md](../../agents/issue-tracker.md)）。所以下面「现在可开工」按硬依赖判定，\n`;
  out += `「验收波次」按剩余验收链长度判定：波次高不代表不能动手，只代表它的整票验收要等更多上游真实证据。\n\n`;

  out += `## 现在就可以开工（无开放硬依赖）\n\n`;
  out += `S3–S6 共 ${inScope.length} 张开放票，其中 ${startable.length} 张没有任何开放的开工硬依赖。\n`;
  out += `领域归属沿用三队，活跃开发最多六线程；具体开工顺序见[已确认S4/S5切片](S4-S5-SLICES-2026-09-22.md)。\n\n`;
  for (const [label, name] of TEAMS) {
    const mine = startable.filter((entry) => entry.team === label);
    if (mine.length === 0) continue;
    out += `### ${name} — ${mine.length} 张\n\n`;
    out += `| 任务 | 用户结果 | 阶段 | 开工硬依赖 | 待验收输入数 |\n| --- | --- | --- | --- | ---: |\n`;
    out += mine.map(row).join("\n") + `\n\n`;
    out += `建议起点：${mine.slice(0, 2).map((entry) => `${entry.task.id} #${entry.task.number}`).join("、")}（本队波次最浅）。\n\n`;
  }

  const blocked = inScope.filter((entry) => entry.hardBlockers.length > 0);
  if (blocked.length > 0) {
    out += `## 有开工硬依赖（${blocked.length} 张）\n\n`;
    out += `| 任务 | 用户结果 | 阶段 | 开工硬依赖 | 待验收输入数 |\n| --- | --- | --- | --- | ---: |\n`;
    out += blocked.map(row).join("\n") + `\n\n`;
  }

  out += `## 验收波次\n\n`;
  out += `波次 = 该票剩余验收链上还开着的上游票数量的最长路径。最后一波是整链验收的收口票。\n\n`;
  for (const wave of waves) {
    const mine = inScope.filter((entry) => entry.wave === wave);
    out += `- **W${wave}**（${mine.length} 张）：` +
      mine.map((entry) => `${entry.task.id}`).join("、") + `\n`;
  }
  out += `\n波次最深的三张是整链收口：` +
    inScope.slice(-3).map((entry) => `${entry.task.id} #${entry.task.number}（W${entry.wave}）`).join("、") +
    `。它们不是可以提前「做完」的任务，而是前面所有票的真实证据到齐后才可能通过验收。\n`;
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const openArg = args[args.indexOf("--open") + 1];
  const openNumbers = openArg && args.includes("--open")
    ? new Set(JSON.parse(readFileSync(openArg, "utf8")).map((issue) => issue.number))
    : null;
  if (!openNumbers) throw new Error("pass --open <gh issue list --state open --json number,labels output>");
  const labels = new Map(JSON.parse(readFileSync(openArg, "utf8"))
    .map((issue) => [issue.number, (issue.labels ?? []).map((label) => label.name)]));
  const teamOf = (number) => (labels.get(number) ?? []).find((name) => name.startsWith("team:")) ?? "team:unassigned";

  const entries = computeSequence(plan.tasks, openNumbers, teamOf);
  const rendered = renderSequence(entries, new Date().toISOString().slice(0, 10));
  if (args.includes("--check")) {
    assert.equal(readFileSync(target, "utf8"), rendered, `${target} is stale; re-run node scripts/vpj-sequence.mjs`);
    console.log("vpj-sequence: committed document matches the manifest and the supplied open Issues.");
    return;
  }
  writeFileSync(target, rendered);
  console.log(`vpj-sequence: wrote ${target} (${entries.length} open tasks ordered).`);
}

if (process.argv[1] && process.argv[1].endsWith("vpj-sequence.mjs")) main();
