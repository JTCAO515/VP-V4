import assert from 'node:assert/strict';
import { checkedTaskItems, preserveIssueProgress } from '../vpj-program.mjs';

/** Pure, explicitly scoped rewrite proposal. Caller snapshots, re-reads and PATCHes separately. */
export function prepareIssueRefresh(task, current, generatedBody, { excludedNumbers, archiveUrl }) {
  assert.ok(Array.isArray(excludedNumbers), 'An explicit exclusion list is required');
  assert.ok(!excludedNumbers.includes(task.number), `Protected issue #${task.number}`);
  assert.equal(current.number, task.number, 'Issue identity changed');
  if (task.databaseId !== undefined) assert.equal(current.id, task.databaseId, 'Issue database ID changed');
  assert.equal(current.state, 'open', 'Closed issue bodies are not rewritten');
  assert.ok(current.title.startsWith(`[${task.id}] `), 'Unexpected task identity');
  assert.ok(typeof generatedBody === 'string' && generatedBody.trim());
  assert.ok(/^https:\/\/github\.com\/JTCAO515\/VP-V4\/blob\/[a-zA-Z0-9/_-]+\/[a-zA-Z0-9/_.-]+$/.test(archiveUrl), 'Invalid snapshot link');
  const currentChecked = checkedTaskItems(current.body);
  const canonicalItems = new Set(checkedTaskItems(generatedBody.replaceAll('- [ ] ', '- [x] ')));
  const extra = currentChecked.filter(text => !canonicalItems.has(text));
  const tail = '\n## 已有进展与原始记录\n\n' +
    (extra.length ? extra.map(text => `- [x] ${text}`).join('\n') + '\n\n' : '') +
    `[整理前正文与元数据快照](${archiveUrl})；原评论与证据链接保留。已勾选项仅保持原完成范围，不等于整票通过。\n`;
  const body = preserveIssueProgress(current.body, current.body, generatedBody.trimEnd() + '\n' + tail, task.id);
  assert.deepEqual(checkedTaskItems(body).sort(), [...currentChecked].sort(), 'Checked progress changed');
  const labels = current.labels.map(label => typeof label === 'string' ? label : label.name)
    .filter(label => !label.startsWith('status:') && !['ready-for-agent', 'needs-triage'].includes(label));
  return { title: `[${task.id}] ${task.title}`, body, labels: [...new Set([...labels, 'status:planned'])] };
}
