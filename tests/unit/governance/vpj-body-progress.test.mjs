import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { body, prepareBodyUpdates, preserveIssueProgress, validateRemoteTaskBody } from '../../../scripts/vpj-program.mjs';

const planDir = 'docs/program/2026-09-05';
const plan = JSON.parse(readFileSync(`${planDir}/issue-plan.json`, 'utf8'));
const task = { ...plan.tasks[0], acceptance: ['A real result can be read.', 'An unauthorized write is rejected.'] };

test('normal verification accepts checked criteria and append-only progress without claiming runtime acceptance', () => {
  const remote = body(task).replace('- [ ] A real result', '- [x] A real result') +
    '\n## Progress\nReviewed PR: ready for the next scoped check.\n';
  assert.equal(validateRemoteTaskBody(task, remote), 'acceptance-present');
  assert.equal(validateRemoteTaskBody(task, body(task), { migrationSnapshot: true }), 'exact-definition');
  assert.throws(() => validateRemoteTaskBody(task, remote, { migrationSnapshot: true }), /body drift in migration snapshot/);
});

test('current acceptance may be in an appended planning block, but missing current clauses fail', () => {
  const previous = { ...task, acceptance: [task.acceptance[0]] };
  const remote = body(previous) + '\n## HF复用执行补充（2026-09-10）\n\n- [ ] ' + task.acceptance[1] + '\n';
  assert.equal(validateRemoteTaskBody(task, remote), 'acceptance-present');
  assert.throws(() => validateRemoteTaskBody(task, body(previous)), /definition drift.*missing current acceptance/);
});

test('quotes, fenced or indented code and HTML comments cannot impersonate current acceptance', () => {
  const old = body({ ...task, acceptance: [task.acceptance[0]] });
  const missing = `- [x] ${task.acceptance[1]}`;
  for (const example of [
    `> ${missing}`, `  > ${missing}`, `    ${missing}`, `\t${missing}`,
    `\`\`\`markdown\n${missing}\n\`\`\``, `~~~~\n${missing}\n~~~~`,
    `<!-- historical acceptance\n${missing}\n-->`, `<!--\n${missing}`,
    `<pre>\n${missing}\n</pre>`, `<code>\n${missing}\n</code>`,
    `<blockquote>\n${missing}\n</blockquote>`,
  ]) {
    assert.throws(() => validateRemoteTaskBody(task, old + '\n' + example), /definition drift/, example);
  }
});

function assertHiddenAcceptance(snippet) {
  const previous = body({ ...task, acceptance: [task.acceptance[0]] });
  assert.throws(() => validateRemoteTaskBody(task, previous + '\n' + snippet), /definition drift/, snippet);
  const current = body(task) + '\n' + snippet;
  assert.equal(preserveIssueProgress(current, body(task), body(task), task.id), current,
    `non-Markdown progress must not check the active criterion: ${snippet}`);
}

const htmlBlockCases = [
  { name: '1 raw text', pairs: [['<pre>', '</pre>'], ['<ScRiPt>', '</sTyLe>'], ['<style>', '</style>'], ['<textarea>', '</textarea>']], blankEnd: false },
  { name: '2 comment', pairs: [['<!-- historical example', '-->']], blankEnd: false },
  { name: '3 processing instruction', pairs: [['<?processing', '?>']], blankEnd: false },
  { name: '4 declaration', pairs: [['<!DOCTYPE html [', ']>']], blankEnd: false },
  { name: '5 CDATA', pairs: [['<![CDATA[', ']]>']], blankEnd: false },
  { name: '6 block tag', pairs: [['<div>', '</div>'], ['<table>', '</table>'], ['</div>', '</div>'], ['   <DIV data-note="open"', '>']], blankEnd: true },
  { name: '7 standalone custom tag', pairs: [['<vp-example label="source > text">', '</vp-example>'], ["<leaf a='value' _flag :kind=example />", '</leaf>'], ['</custom-tag>', '</custom-tag>']], blankEnd: true },
];

for (const fixture of htmlBlockCases) {
  test(`CommonMark HTML block type ${fixture.name} excludes fake acceptance until its actual boundary`, () => {
    for (const [start, end] of fixture.pairs) {
      const hidden = `${start}\n- [x] ${task.acceptance[1]}\n${end}\n`;
      assertHiddenAcceptance(hidden);
      assertHiddenAcceptance(`${start}\n- [x] ${task.acceptance[1]}\n`);
      if (fixture.blankEnd) assertHiddenAcceptance(`${start}\n${end}\n- [x] ${task.acceptance[1]}\n`);
      const previous = body({ ...task, acceptance: [task.acceptance[0]] });
      const outside = previous + '\n' + hidden + (fixture.blankEnd ? '\n' : '') + `- [x] ${task.acceptance[1]}\n`;
      assert.equal(validateRemoteTaskBody(task, outside), 'acceptance-present');
      assert.ok(preserveIssueProgress(outside, previous, body(task), task.id)
        .includes(`- [x] ${task.acceptance[1]}\n\n## 不得触碰`), 'the legal supplement must retain its original line index');
    }
  });
}

test('blank lines end ordinary div/table/custom blocks while raw-text blocks retain their terminator rule', () => {
  const previous = body({ ...task, acceptance: [task.acceptance[0]] });
  for (const start of ['<div>', '<table>', '<custom-tag>']) {
    const remote = previous + `\n${start}\n\n- [x] ${task.acceptance[1]}\n`;
    assert.equal(validateRemoteTaskBody(task, remote), 'acceptance-present', start);
  }
  for (const start of ['<pre>', '<script>', '<style>', '<textarea>', '<!--', '<?pi', '<!DOCTYPE html [', '<![CDATA[']) {
    assertHiddenAcceptance(`${start}\n\n- [x] ${task.acceptance[1]}\n`);
  }
  // A raw-text opener inside an already active type-6 block cannot switch its ending rule.
  const table = previous + `\n<table>\n<pre>\n\n- [x] ${task.acceptance[1]}\n`;
  assert.equal(validateRemoteTaskBody(task, table), 'acceptance-present');
});

test('type-7 tags cannot interrupt a paragraph and type 1–5 single-line endings resume Markdown', () => {
  const previous = body({ ...task, acceptance: [task.acceptance[0]] });
  for (const prefix of [
    'Paragraph text\n<custom-tag>', '<custom-tag> trailing paragraph text',
    '<pre></style>', '<!-- finished -->', '<?finished?>', '<!DOCTYPE html>', '<![CDATA[finished]]>',
  ]) {
    assert.equal(validateRemoteTaskBody(task, previous + `\n${prefix}\n- [x] ${task.acceptance[1]}\n`), 'acceptance-present', prefix);
  }
  assertHiddenAcceptance(`Paragraph text\n<div>\n- [x] ${task.acceptance[1]}\n`);
});

test('nested HTML quotes/code/details remain excluded across blank lines until the outer container closes', () => {
  for (const tag of ['blockquote', 'details', 'q', 'code']) {
    const hidden = `<${tag}>\n<${tag}>\n</${tag}>\n\n- [x] ${task.acceptance[1]}\n</${tag}>\n`;
    assertHiddenAcceptance(hidden);
    assertHiddenAcceptance(`<${tag} title="</${tag}>">\n\n- [x] ${task.acceptance[1]}\n</${tag}>\n`);
    const previous = body({ ...task, acceptance: [task.acceptance[0]] });
    assert.equal(validateRemoteTaskBody(task, previous + '\n' + hidden + `\n- [x] ${task.acceptance[1]}\n`), 'acceptance-present');
  }
  assertHiddenAcceptance(`<blockquote>\n<!-- </blockquote> -->\n\n- [x] ${task.acceptance[1]}\n</blockquote>\n`);
});

test('inline code spans cannot close hidden containers or transfer their checked acceptance', () => {
  for (const tag of ['details', 'blockquote', 'q', 'code']) {
    for (const literal of [
      `\`</${tag}>\``, `\`\`</${tag}>\`\``, `\`\` example \` </${tag}> \`\``,
      `Example \`first line\nliteral </${tag}> on another line\``,
      `Example \`\`first line \`\nliteral </${tag}> on another line\`\``,
    ]) {
      assertHiddenAcceptance(`<${tag}>\n\n${literal}\n\n- [x] ${task.acceptance[1]}\n</${tag}>\n`);
    }
  }
});

test('inline code spans cannot cross real HTML, heading, list or fence block starts and hide a container opener', () => {
  for (const boundary of [
    '<details>\n<summary>History ` label</summary>',
    '# History <details> ` label',
    '- History <details> ` label',
    '1. History <details> ` label',
    '```text\nopaque example\n```\n<details>\n<summary>History ` label</summary>',
  ]) {
    assertHiddenAcceptance(`A historical \` example\n${boundary}\n\n- [x] ${task.acceptance[1]}\n\n</details>\n`);
  }
});

test('legal paragraph continuations still support multiline code spans', () => {
  for (const continuation of ['ordinary continuation', '2. a non-interrupting ordered marker', '- ']) {
    assertHiddenAcceptance(`<details>\n\nA literal \` example\n${continuation}\nliteral </details> label\`\n\n- [x] ${task.acceptance[1]}\n</details>\n`);
  }
});

test('odd backslash escapes cannot close containers while even pairs preserve real closing tags', () => {
  const previous = body({ ...task, acceptance: [task.acceptance[0]] });
  for (const count of [1, 3, 5]) {
    assertHiddenAcceptance(`<details>\n\n${'\\'.repeat(count)}</details>\n\n- [x] ${task.acceptance[1]}\n</details>\n`);
  }
  for (const count of [2, 4]) {
    const remote = previous + `\n<details>\n\n${'\\'.repeat(count)}</details>\n\n- [x] ${task.acceptance[1]}\n`;
    assert.equal(validateRemoteTaskBody(task, remote), 'acceptance-present');
    assert.ok(preserveIssueProgress(remote, previous, body(task), task.id).includes(`- [x] ${task.acceptance[1]}\n\n## 不得触碰`));
  }
});

test('unclosed and mismatched code spans cannot swallow an actual closing tag or later acceptance', () => {
  const previous = body({ ...task, acceptance: [task.acceptance[0]] });
  for (const literal of ['An unmatched ` delimiter', 'Mismatched `` delimiters `', 'An escaped \\` delimiter']) {
    const remote = previous + `\n<details>\n\n${literal}\n\n</details>\n\n- [x] ${task.acceptance[1]}\n`;
    assert.equal(validateRemoteTaskBody(task, remote), 'acceptance-present', literal);
  }
  const separateParagraphs = previous + `\n<details>\n\nAn unmatched \` delimiter\n\n</details>\n\n- [x] ${task.acceptance[1]}\n\nA later \` literal.\n`;
  assert.equal(validateRemoteTaskBody(task, separateParagraphs), 'acceptance-present');
});

test('backticks and escaped-looking text in complete HTML attributes are not container closing tags', () => {
  for (const literal of [
    '<span title="`</details>`">example</span>',
    '<span title="\\</details>">example</span>',
    '<span title="``\n</details>\n``">example</span>',
  ]) {
    assertHiddenAcceptance(`<details>\n\n${literal}\n\n- [x] ${task.acceptance[1]}\n</details>\n`);
  }
});

test('HTML-looking examples inside fenced code or Markdown quotes do not capture later real acceptance', () => {
  const previous = body({ ...task, acceptance: [task.acceptance[0]] });
  for (const example of ['```html\n<details>\n```', '~~~html\n<blockquote>\n~~~', '> <details>']) {
    const remote = previous + `\n${example}\n\n- [x] ${task.acceptance[1]}\n`;
    assert.equal(validateRemoteTaskBody(task, remote), 'acceptance-present');
  }
});

test('nested or unclosed details history cannot satisfy or check current acceptance', () => {
  const previous = body({ ...task, acceptance: [task.acceptance[0]] });
  const hidden = `<details><summary>Historical evidence</summary>\n<details>\n- [x] ${task.acceptance[1]}\n</details>\n- [x] ${task.acceptance[0]}\n</details>\n`;
  assert.throws(() => validateRemoteTaskBody(task, previous + hidden), /definition drift/);
  assert.throws(() => validateRemoteTaskBody(task, previous + `<details>\n- [x] ${task.acceptance[1]}\n`), /definition drift/);
  const current = body(task) + '\n' + hidden;
  const updated = preserveIssueProgress(current, body(task), body(task), task.id);
  assert.equal(updated, current, 'hidden checked history must not check the active checklist');
  // Masking preserves original line numbers, including items following nested history.
  const withCurrentSupplement = previous + hidden + `\n- [x] ${task.acceptance[1]}\n`;
  assert.equal(validateRemoteTaskBody(task, withCurrentSupplement), 'acceptance-present');
  const promoted = preserveIssueProgress(withCurrentSupplement, previous, body(task), task.id);
  assert.ok(promoted.includes(`- [x] ${task.acceptance[1]}\n\n## 不得触碰`));
});

test('a recognized generated prefix retains checked items and the entire opaque progress suffix', () => {
  const previous = body(task);
  const suffix = '\n## Runtime evidence\n- [x] Manual device check\n\n<!-- keep original -->\n';
  const current = previous.replace('- [ ] A real result', '- [X] A real result') + suffix;
  const next = body({ ...task, baselineNote: 'Use the newly merged contract.' });
  const updated = preserveIssueProgress(current, previous, next, task.id);
  assert.ok(updated.includes('- [x] A real result can be read.'));
  assert.ok(updated.includes('- [ ] An unauthorized write is rejected.'));
  assert.ok(updated.endsWith(suffix));
  assert.ok(updated.includes('Use the newly merged contract.'));
  assert.equal(preserveIssueProgress(current.replace(/\n/g, '\r\n'), previous, next, task.id), updated);
});

test('unknown edits inside the template and changes to a checked clause require a scoped update', () => {
  const previous = body(task);
  assert.throws(() => preserveIssueProgress(previous.replace('## 当前基线与开发入口', '## Changed entry'), previous, previous, task.id), /unknown body drift/);
  const current = previous.replace('- [ ] A real result', '- [x] A real result');
  const next = body({ ...task, acceptance: ['A different result can be read.', task.acceptance[1]] });
  assert.throws(() => preserveIssueProgress(current, previous, next, task.id), /checked acceptance would be removed or changed/);
});

test('promoting an appended criterion into the generated checklist retains its completion and history', () => {
  const previousTask = { ...task, acceptance: [task.acceptance[0]] };
  const previous = body(previousTask);
  const suffix = `\n## Approved supplement\n\n- [x] ${task.acceptance[1]}\nEvidence: reviewed run.\n`;
  const updated = preserveIssueProgress(previous + suffix, previous, body(task), task.id);
  assert.ok(updated.includes(`## Acceptance criteria\n\n- [ ] ${task.acceptance[0]}\n- [x] ${task.acceptance[1]}`));
  assert.ok(updated.endsWith(suffix));
});

test('batch preparation is pure and refuses unknown drift anywhere in the selected batch', () => {
  const second = { ...task, id: 'VPJ-02', number: 189, databaseId: 99 };
  const firstIssue = { number: task.number, id: task.databaseId, title: `[${task.id}] ${task.title}`, body: body(task), labels: ['status:in-progress'], state: 'open' };
  const secondIssue = { number: second.number, id: second.databaseId, title: `[${second.id}] ${second.title}`, body: body(second).replace('## 当前基线与开发入口', '## Unknown entry') };
  const before = structuredClone([firstIssue, secondIssue]);
  assert.throws(() => prepareBodyUpdates([task, second], [firstIssue, secondIssue]), /VPJ-02 body preflight failed before batch writes/);
  assert.deepEqual([firstIssue, secondIssue], before);
  assert.equal(prepareBodyUpdates([task], [firstIssue])[0].body, firstIssue.body);
  assert.throws(() => prepareBodyUpdates([task], [{ ...firstIssue, id: -1 }]), /database ID mismatch/);
  assert.throws(() => prepareBodyUpdates([task], [], new Map(), { allowMissing: true }), /do not recreate an assigned identity/);
});

function commandFixture(t, command, { parentDrift = false, successfulPublish = false, acceptanceOnly = false } = {}) {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'vpj-body-preflight-'));
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));
  const tasks = plan.tasks.slice(0, 2).map(entry => ({ ...entry, blockedBy: [] }));
  if (acceptanceOnly) tasks[1].acceptanceDependencies = [tasks[0].id];
  if (successfulPublish) {
    delete tasks[1].number;
    delete tasks[1].databaseId;
    delete tasks[1].url;
  }
  const fixturePlan = { ...plan, tasks, sourceSnapshot: 'snapshot.json', oldIssueSuccessors: {} };
  for (const directory of ['scripts', 'bin', `${planDir}/issue-bodies`]) mkdirSync(path.join(fixtureRoot, directory), { recursive: true });
  cpSync('scripts/vpj-program.mjs', path.join(fixtureRoot, 'scripts/vpj-program.mjs'));
  mkdirSync(path.join(fixtureRoot, 'scripts/lib'), { recursive: true });
  cpSync('scripts/lib/handoff-documents.mjs', path.join(fixtureRoot, 'scripts/lib/handoff-documents.mjs'));
  writeFileSync(path.join(fixtureRoot, `${planDir}/issue-plan.json`), JSON.stringify(fixturePlan));
  writeFileSync(path.join(fixtureRoot, 'snapshot.json'), JSON.stringify({ issues: [] }));
  for (const entry of tasks) {
    mkdirSync(path.dirname(path.join(fixtureRoot, entry.contract)), { recursive: true });
    writeFileSync(path.join(fixtureRoot, entry.contract), '# Contract\n');
    writeFileSync(path.join(fixtureRoot, `${planDir}/issue-bodies/${entry.id}.md`), body(entry));
  }
  const existing = tasks.filter(entry => entry.number != null).map(entry => ({ number: entry.number, id: entry.databaseId, title: `[${entry.id}] ${entry.title}`, body: body(entry), state: 'closed', state_reason: 'completed', labels: [{ name: 'enhancement' }] }));
  if (successfulPublish) existing[0].body = existing[0].body.replace('- [ ] ', '- [x] ') + '\n## Progress\nReviewed run retained.\n';
  else if (!parentDrift) existing[1].body = existing[1].body.replace('## 当前基线与开发入口', '## Unknown entry');
  writeFileSync(path.join(fixtureRoot, 'issues.json'), JSON.stringify(existing));
  writeFileSync(path.join(fixtureRoot, `${planDir}/program-body.md`), '# Program\n');
  writeFileSync(path.join(fixtureRoot, 'parent.json'), JSON.stringify({ number: plan.parentNumber, id: 1, title: 'Program', body: successfulPublish ? '# Program\n' : '# Unexpected parent changes\n' }));
  if (successfulPublish) writeFileSync(path.join(fixtureRoot, 'docs/handoff.json'), JSON.stringify({
    program: {}, objective: 'Fixture', status: 'Fixture', currentPhase: 'Fixture', mandatoryReadingOrder: [],
    decisions: [], blockers: [], unrun: [], verification: [], nextAction: 'Fixture', rollback: 'Fixture', observation: 'Fixture', historicalSnapshots: [],
  }));
  const fakeGh = `#!${process.execPath}\n` + String.raw`
const fs = require('node:fs');
const path = require('node:path');
const directory = process.env.VPJ_TEST_FIXTURE;
const args = process.argv.slice(2);
const methodIndex = args.indexOf('--method');
const method = methodIndex < 0 ? 'GET' : args[methodIndex + 1];
const endpoint = args[1];
fs.appendFileSync(path.join(directory, 'calls.jsonl'), JSON.stringify({ endpoint, method }) + '\n');
const issues = JSON.parse(fs.readFileSync(path.join(directory, 'issues.json'), 'utf8'));
const parent = JSON.parse(fs.readFileSync(path.join(directory, 'parent.json'), 'utf8'));
const number = Number(endpoint.split('/').at(-1));
let result;
if (method !== 'GET') {
  if (process.env.VPJ_TEST_MUTATIONS !== 'fixture-only') { process.stderr.write('Unexpected external mutation'); process.exit(9); }
  const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (method === 'POST' && endpoint.endsWith('/issues')) {
    result = { ...payload, number: 999, id: 9999, html_url: 'https://example.test/issues/999', state: 'open' };
    issues.push(result);
    fs.writeFileSync(path.join(directory, 'issues.json'), JSON.stringify(issues));
  } else if (method === 'PATCH' && number === parent.number && Object.keys(payload).join() === 'body') {
    result = { ...parent, ...payload };
    fs.writeFileSync(path.join(directory, 'parent.json'), JSON.stringify(result));
  } else { process.stderr.write('Unexpected fixture mutation'); process.exit(9); }
} else {
  result = endpoint.includes('/issues?') ? issues : endpoint.endsWith('/dependencies/blocked_by') ? [] : endpoint.endsWith('/parent') || number === parent.number ? parent : issues.find(issue => issue.number === number);
}
if (!result) { process.stderr.write('Unexpected fixture endpoint: ' + endpoint); process.exit(8); }
process.stdout.write(JSON.stringify(result));
`;
  const ghPath = path.join(fixtureRoot, 'bin/gh');
  writeFileSync(ghPath, fakeGh, { mode: 0o755 });
  const args = command === 'sync-selected' ? [command, ...tasks.map(entry => entry.id)] : [command];
  const result = spawnSync(process.execPath, ['scripts/vpj-program.mjs', ...args], {
    cwd: fixtureRoot, encoding: 'utf8', env: { PATH: `${path.join(fixtureRoot, 'bin')}:${path.dirname(process.execPath)}:/usr/bin:/bin`, VPJ_TEST_FIXTURE: fixtureRoot, VPJ_TEST_MUTATIONS: successfulPublish ? 'fixture-only' : 'forbidden' },
  });
  const calls = readFileSync(path.join(fixtureRoot, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(calls.length > 0);
  if (successfulPublish) {
    assert.equal(result.status, 0, result.stderr);
    const after = JSON.parse(readFileSync(path.join(fixtureRoot, 'issues.json'), 'utf8'));
    assert.deepEqual(after[0], existing[0], 'completed Issue body, labels and state must be preserved');
    assert.equal(after[1].number, 999);
    assert.equal(after[1].title, `[${tasks[1].id}] ${tasks[1].title}`);
    assert.ok(after[1].labels.some(label => (label.name ?? label) === 'status:planned'));
    assert.ok(!after[1].labels.some(label => (label.name ?? label) === 'status:blocked'));
    const finalParent = JSON.parse(readFileSync(path.join(fixtureRoot, 'parent.json'), 'utf8'));
    assert.ok(finalParent.body.includes('/DELIVERY-STAGES.md'), 'Program links the grouped task view');
    assert.ok(readFileSync(path.join(fixtureRoot, `${planDir}/DELIVERY-STAGES.md`), 'utf8')
      .includes('issues/999'), 'the new Issue remains discoverable through its generated stage');
    assert.equal(calls.filter(call => call.method === 'POST').length, 1);
  } else {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unknown body drift|body preflight failed/);
    assert.ok(calls.every(call => call.method === 'GET'), JSON.stringify(calls));
  }
}

for (const command of ['sync-bodies', 'sync-selected', 'publish']) {
  test(`${command} performs no remote mutation when a later Issue has unknown body drift`, t => commandFixture(t, command));
}

test('publish also preflights the existing Program body before any remote mutation', t => commandFixture(t, 'publish', { parentDrift: true }));

test('publish can add an unassigned task while preserving a completed Issue and its appended progress', t => commandFixture(t, 'publish', { successfulPublish: true }));

test('publish keeps acceptance links without recreating native blocking relationships', t =>
  commandFixture(t, 'publish', { successfulPublish: true, acceptanceOnly: true }));
