import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Render current handoff data without truncating or modifying its evidence/history. */
export function renderHandoffDocuments(h, program) {
  const shared=`最新Program：[VPJ-00 #${program.parentNumber}](https://github.com/${program.repo}/issues/${program.parentNumber})。\n\n`+
    `目标：${h.objective}\n\n状态：${h.status}\n\n阶段：${h.currentPhase}\n\n`+
    `## 读取顺序\n\n${h.mandatoryReadingOrder.map(p=>'- ['+p+']('+p+')').join('\n')}\n\n`+
    `## 当前决定\n\n${h.decisions.map(s=>'- '+s).join('\n')}\n\n`+
    `## 未决与运行证据\n\n${h.blockers.map(s=>'- '+s).join('\n')}\n\n${h.unrun.map(s=>'- '+s).join('\n')}\n\n`+
    `## 验证\n\n${h.verification.length?h.verification.map(s=>'- '+s).join('\n'):'验证进行中，最终见Program VERIFICATION.md。'}\n\n`+
    `## 下一动作与回滚\n\n${h.nextAction}\n\n${h.rollback}\n\n${h.observation}\n\n`+
    `历史：${h.historicalSnapshots.map(p=>'['+p+']('+p+')').join(', ')}。\n`;
  const handoff = '# Handoff\n\nGenerated from docs/handoff.json by vpj-program.mjs.\n\n' + shared;
  const context = '# Context\n\n' +
    'Generated from [docs/handoff.json](docs/handoff.json). Full decisions, blockers and evidence: [HANDOFF.md](HANDOFF.md).\n' +
    'This entry is a navigation summary, not a grant of authority or a capability acceptance report. Historical records never override the current user request.\n\n' +
    `Program: [VPJ-00 #${program.parentNumber}](https://github.com/${program.repo}/issues/${program.parentNumber}) · Source updated: ${h.lastUpdated}\n\n` +
    `目标：${h.objective}\n\n阶段：${h.currentPhase}\n\n## 源记录状态（执行前核对 GitHub）\n\n${h.status}\n\n` +
    `## 下一动作\n\n${h.nextAction}\n\n` +
    '## 开工入口\n\n' + h.mandatoryReadingOrder.map(p => '- [' + p + '](' + p + ')').join('\n') + '\n' +
    '- [当前决定与授权边界](HANDOFF.md#当前决定)；行动前核对当前任务和已有授权，不从历史验证推导新权限。\n' +
    '- [未决与运行证据](HANDOFF.md#未决与运行证据)；完整 blockers / UNRUN 在此保留，不因摘要省略而视为通过。\n' +
    '- [验证记录](HANDOFF.md#验证) · [回滚与观察](HANDOFF.md#下一动作与回滚)。\n';
  return { context, handoff };
}

/** Read-only drift check. Never rewrites source or repairs evidence during validation. */
export function assertHandoffDocuments(root = process.cwd()) {
  const read = p => readFileSync(path.join(root, p), 'utf8');
  const h = JSON.parse(read('docs/handoff.json'));
  const program = JSON.parse(read('docs/program/2026-09-05/issue-plan.json'));
  const expected = renderHandoffDocuments(h, program);
  for (const [file, content] of [['CONTEXT.md', expected.context], ['HANDOFF.md', expected.handoff]]) {
    assert.ok(read(file) === content,
      `${file} is stale. Run node scripts/vpj-program.mjs render-handoff and review the generated diff.`);
  }
}
