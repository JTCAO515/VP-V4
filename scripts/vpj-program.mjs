import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dir = 'docs/program/2026-09-05';
const planPath = `${dir}/issue-plan.json`;
const read = p => readFileSync(p, 'utf8');
const json = p => JSON.parse(read(p));
const save = (p, value) => { mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, value); };
const saveJson = (p, value) => save(p, JSON.stringify(value, null, 2) + '\n');
const plan = json(planPath);
export const executionContractHeader = "# VPJ Issue 执行合同\n\n生成自issue-plan.json。当前共享流程见 [development-workflow.md](../../agents/development-workflow.md) / ADR-0024。\n阅读当前Issue/PR、本行、受影响接口与代码；历史研究按需读取。\n\nChecks列是完整Issue验收清单；每条PR按实际改动选择本地验证，保留适用CI和最终运行门。\nAllowed列标示主要范围；必要的相邻文件调整、维护任务和独立准备片段按共享流程记录。\n运行依赖未完成时父Issue保持未验收；fixture不证明设备、数据库、provider或生产通过。\n\n";
const byId = new Map(plan.tasks.map(t => [t.id, t]));
const number = id => id === 'VPJ-00' ? plan.parentNumber : byId.get(id)?.number;
const link = id => number(id) ? `[${id} #${number(id)}](https://github.com/${plan.repo}/issues/${number(id)})` : id;

export function orderedTasks(tasks) {
  const index = new Map(tasks.map(t => [t.id, t]));
  assert.equal(index.size, tasks.length, 'duplicate task id');
  const visiting = new Set(), done = new Set(), ordered = [];
  const visit = id => {
    assert.ok(index.has(id), `unknown dependency ${id}`);
    assert.ok(!visiting.has(id), `dependency cycle at ${id}`);
    if (done.has(id)) return;
    visiting.add(id);
    for (const dep of index.get(id).blockedBy) visit(dep);
    visiting.delete(id); done.add(id); ordered.push(index.get(id));
  };
  for (const task of tasks) visit(task.id);
  return ordered;
}

function validate() {
  orderedTasks(plan.tasks);
  for (const key of ['number','databaseId']) {
    const values=plan.tasks.map(t=>t[key]).filter(v=>v!=null);
    assert.equal(new Set(values).size,values.length,`duplicate task ${key}`);
  }
  const before = json(plan.sourceSnapshot).issues;
  assert.equal(Object.keys(plan.oldIssueSuccessors).length, before.length);
  for (const old of before) {
    const successors = plan.oldIssueSuccessors[String(old.number)];
    assert.ok(successors?.length, `no successor for #${old.number}`);
    for (const id of successors) assert.ok(id === 'VPJ-00' || byId.has(id));
  }
  for (const task of plan.tasks) {
    assert.match(task.id, /^VPJ-\d{2}$/);
    assert.ok(task.effortDays > 0 && task.effortDays <= 5);
    for (const field of ['allowedPaths','acceptance','checks','doNotTouch','externalPrerequisites','docsImpact','artifactPaths']) assert.ok(task[field]?.length, `${task.id} missing ${field}`);
    assert.ok(task.rollback && task.owner && task.observationWindow && task.contract);
    assert.ok(existsSync(task.contract));
    assert.ok(task.track !== 'expand' || task.activationEvidence);
  }
  if (existsSync(`${dir}/archive-manifest.json`)) {
    for (const item of json(`${dir}/archive-manifest.json`).files) {
      assert.ok(existsSync(item.archivedPath));
      assert.equal(createHash('sha256').update(readFileSync(item.archivedPath)).digest('hex'), item.sha256);
    }
  }
  console.log(`VPJ plan passed: ${plan.tasks.length} tasks, ${before.length} replacements, acyclic dependencies, contracts and archive hashes.`);
}

export function body(t) {
  const source = `https://github.com/${plan.repo}/blob/${t.sourceRef ?? 'main'}`;
  const baselineNote = t.baselineNote ?? `历史规划基线：${plan.baselinePr ? '#' + plan.baselinePr : '尚未登记'}。当前执行读取 main 的合同，并核对实时依赖、可用接口和获准环境；本计划定义不代表任务已就绪或已验收。`;
  return `## Program\n\n${link('VPJ-00')} · ${t.track === 'expand' ? '后续证据触发任务' : '首发交付任务'}\n\n` +
    `## 用户结果\n\n${t.title}。\n\n${t.acceptance[0]}\n\n` +
    `## 当前基线与开发入口\n\n${baselineNote}\n` +
    `主报告：[完整统筹方案](${source}/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。\n` +
    `必须阅读：[本任务执行合同](${source}/${dir}/EXECUTION-CONTRACT.md#${t.id.toLowerCase()}) 与 [领域接口](${source}/${t.contract})。\n\n` +
    `## Blocked by\n\n${t.blockedBy.length ? t.blockedBy.map(id => '- ' + link(id)).join('\n') : '无其他任务依赖；仍需核对当前接口、环境与外部条件。'}\n\n` +
    `## Scope 与接口\n\n${t.allowedPaths.map(p => '- \u0060' + p + '\u0060').join('\n')}\n\n` +
    `只修改本用户故事需要的路径。接口在消费者接入前版本化，不能仅交fixture声称完成。\n\n` +
    `## Acceptance criteria\n\n${t.acceptance.map(a => '- [ ] ' + a).join('\n')}\n\n` +
    `## 不得触碰\n\n${t.doNotTouch.map(s => '- ' + s).join('\n')}\n\n` +
    `## 验证与证据\n\n${t.checks.map(s => '- \u0060' + s + '\u0060').join('\n')}\n\n` +
    `${t.nativeVerification ?? ''}\n\n` +
    `${t.artifactPaths.map(s => '- \u0060' + s + '\u0060').join('\n')}\n\n` +
    `真实DB/provider/设备/购买是验收条件时，skip或fixture只算部分完成。\n\n` +
    `## Owner / 外部条件 / 观察\n\nOwner: ${t.owner}。类型: ${t.kind}。预估专注工作${t.effortDays}日，外部等待另计；超5日必须再拆。\n\n${t.externalPrerequisites.map(s=>'- '+s).join('\n')}\n\n观察：${t.observationWindow}\n\n` +
    (t.activationEvidence ? `后续开启门：${t.activationEvidence}\n\n` : '') +
    `## 文档与回滚\n\n${t.docsImpact.map(s => '- \u0060' + s + '\u0060').join('\n')}\n\n${t.rollback}\n\n` +
    `替代历史责任：${t.oldIssues.length ? t.oldIssues.map(n=>'#'+n).join(', ') : '见Program的旧新映射；不因新增任务删除有效旧测试。'}\n`;
}

function render() {
  validate();
  const header = '# VPJ 任务定义与依赖\n\n生成自 `issue-plan.json`；不要手工改此表。这是计划定义，不是实时进度；执行状态以 GitHub、已合并接口和获准环境的当前证据为准。\n\n';
  const table = '| 任务 | 交付 | 依赖 | Owner | 专注日/观察 | 阶段 |\n| --- | --- | --- | --- | --- | --- |\n' +
    orderedTasks(plan.tasks).map(t=>`| ${link(t.id)} | ${t.title} | ${t.blockedBy.map(link).join(', ') || '无任务依赖；核实际条件'} | ${t.owner} | ${t.effortDays}日；${t.observationWindow} | ${t.track} |`).join('\n');
  save(`${dir}/ISSUES.md`, header + table + '\n\n后续expand必须另有activationEvidence，依赖完成不会自动开放。\n');
  let contracts = executionContractHeader;
  for (const t of plan.tasks) {
    save(`${dir}/issue-bodies/${t.id}.md`, body(t));
    contracts += `## ${t.id}\n\n${link(t.id)} — ${t.title}\n\n` +
      `- Owner: ${t.owner}; ${t.effortDays}专注日，${t.observationWindow}\n` +
      `- Blocked by: ${t.blockedBy.map(link).join(', ') || '无任务依赖；核实际条件'}\n` +
      `- Allowed: ${t.allowedPaths.map(p=>'\u0060'+p+'\u0060').join(', ')}\n` +
      `- Checks: ${t.checks.map(p=>'\u0060'+p+'\u0060').join('; ')}\n` +
      `- Evidence: ${t.artifactPaths.map(p=>'\u0060'+p+'\u0060').join(', ')}\n` +
      `- 接口: ${t.contract}; Red lines: ${t.redLines.join(', ')}\n` +
      `- 运行门: ${t.externalPrerequisites.join(' ')}\n` +
      (t.nativeVerification ? `- Native: ${t.nativeVerification}\n`:'') +
      `- Rollback: ${t.rollback}\n\n` +
      t.acceptance.map(a=>'- [ ] '+a).join('\n') + '\n\n';
  }
  save(`${dir}/EXECUTION-CONTRACT.md`, contracts.trimEnd()+'\n');
  const snap = json(plan.sourceSnapshot).issues;
  save(`${dir}/ISSUE-MIGRATION.md`, '# 2026-09-05 迁移快照：旧开放 Issue → 新责任映射\n\n当日全部旧项按用户授权superseded/not planned关闭，不代表已验收；原body/comments及关系快照保留。PR #185/#186在该迁移快照中为open；当前状态须查询GitHub，不由本历史记录推断。\n\n| 旧Issue | 标题 | 新责任 |\n| --- | --- | --- |\n' + snap.map(t=>`| [#${t.number}](${t.url}) | ${t.title} | ${plan.oldIssueSuccessors[String(t.number)].map(link).join(', ')} |`).join('\n')+'\n');
  renderHandoff();
  const files = walk('docs').filter(p=>p.endsWith('.md') && p !== 'docs/INDEX.md');
  saveJson('docs/manifest.json',{schemaVersion:'vpj-docs/1',date:plan.date,authority:'docs/VISEPANDA-MASTER-PLAN-2026-09-05.md',files:files.map(p=>({path:p,status:p.startsWith('docs/archive/')?'archived':p.startsWith('docs/research/')?'evidence':'document'}))});
  save('docs/INDEX.md','# Documentation index\n\nGenerated by `node scripts/vpj-program.mjs render`; active entry: [VPJ Program](program/2026-09-05/README.md). Archives and old plans are historical, not execution authority.\n\n'+files.map(p=>`- [${p.slice(5)}](${p.slice(5)})${p.startsWith('docs/archive/')?' — archived':''}`).join('\n')+'\n');
  console.log('Generated task bodies, execution contract, migration table and documentation index.');
}

function renderHandoff() {
  const h=json('docs/handoff.json');
  h.program.baselinePr=plan.baselinePr;
  saveJson('docs/handoff.json',h);
  const shared=`最新Program：[VPJ-00 #${plan.parentNumber}](https://github.com/${plan.repo}/issues/${plan.parentNumber})。\n\n`+
    `目标：${h.objective}\n\n状态：${h.status}\n\n阶段：${h.currentPhase}\n\n`+
    `## 读取顺序\n\n${h.mandatoryReadingOrder.map(p=>'- ['+p+']('+p+')').join('\n')}\n\n`+
    `## 当前决定\n\n${h.decisions.map(s=>'- '+s).join('\n')}\n\n`+
    `## 未决与运行证据\n\n${h.blockers.map(s=>'- '+s).join('\n')}\n\n${h.unrun.map(s=>'- '+s).join('\n')}\n\n`+
    `## 验证\n\n${h.verification.length?h.verification.map(s=>'- '+s).join('\n'):'验证进行中，最终见Program VERIFICATION.md。'}\n\n`+
    `## 下一动作与回滚\n\n${h.nextAction}\n\n${h.rollback}\n\n${h.observation}\n\n`+
    `历史：${h.historicalSnapshots.map(p=>'['+p+']('+p+')').join(', ')}。\n`;
  save('HANDOFF.md','# Handoff\n\nGenerated from docs/handoff.json by vpj-program.mjs.\n\n'+shared);
  save('CONTEXT.md','# Context\n\nGenerated from docs/handoff.json; active architecture/scope is ADR-0023.\n\n'+shared);
}

function walk(p) { return readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]); }
function api(endpoint, method='GET', payload) {
  const args=['api',endpoint,'--method',method];
  if(payload!==undefined)args.push('--input','-');
  const result=execFileSync('gh',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],input:payload===undefined?undefined:JSON.stringify(payload),maxBuffer:32*1024*1024});
  return result.trim()?JSON.parse(result):null;
}
function allIssues(){const rows=[];for(let page=1;;page++){const part=api(`repos/${plan.repo}/issues?state=all&per_page=100&page=${page}`);rows.push(...part.filter(x=>!x.pull_request));if(part.length<100)break;}return rows;}

const normalizeNewlines = value => value.replace(/\r\n?/g, '\n');
const normalizeCriterion = value => value.trim().replace(/\s+/g, ' ');
const maskLines = value => value.replace(/[^\n]/g, ' ');

// CommonMark 0.31.2 sections 4.6 and 6.6: https://spec.commonmark.org/0.31.2/#html-blocks
// This reader accepts canonical top-level task items; it is not a general Markdown renderer.
const htmlTagName = '[A-Za-z][A-Za-z0-9-]*';
const htmlAttributeName = '[A-Za-z_:][A-Za-z0-9_.:-]*';
const htmlAttributeValue = '(?:[^ \\t\\n"\'=<>`]+|"[^"]*"|\'[^\']*\')';
const htmlAttribute = `[ \\t\\n]+${htmlAttributeName}(?:[ \\t\\n]*=[ \\t\\n]*${htmlAttributeValue})?`;
const htmlOpenTag = `<${htmlTagName}(?:${htmlAttribute})*[ \\t\\n]*/?>`;
const htmlCloseTag = `</${htmlTagName}[ \\t\\n]*>`;
const standaloneHtmlTag = new RegExp(`^ {0,3}(?:${htmlOpenTag}|${htmlCloseTag})[ \\t]*$`);
const rawHtmlNames = new Set(['pre', 'script', 'style', 'textarea']);
const blockHtmlNames = 'address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem nav noframes ol optgroup option p param search section summary table tbody td tfoot th thead title tr track ul'.split(' ');
const blockHtmlStart = new RegExp(`^ {0,3}</?(?:${blockHtmlNames.join('|')})(?:[ \\t]|/?>|$)`, 'i');

function htmlBlockStart(line, paragraphOpen) {
  if (/^ {0,3}<(?:pre|script|style|textarea)(?:[ \t]|>|$)/i.test(line)) return { type: 1, end: /<\/(?:pre|script|style|textarea)>/i };
  if (/^ {0,3}<!--/.test(line)) return { type: 2, end: /-->/ };
  if (/^ {0,3}<\?/.test(line)) return { type: 3, end: /\?>/ };
  if (/^ {0,3}<![A-Za-z]/.test(line)) return { type: 4, end: />/ };
  if (/^ {0,3}<!\[CDATA\[/.test(line)) return { type: 5, end: /\]\]>/ };
  if (blockHtmlStart.test(line)) return { type: 6 };
  if (!paragraphOpen && standaloneHtmlTag.test(line)) {
    const tag = line.trimStart().match(/^<(\/?)([A-Za-z][A-Za-z0-9-]*)/);
    if (tag[1] || !rawHtmlNames.has(tag[2].toLowerCase())) return { type: 7 };
  }
  return null;
}

function markdownLineKinds(lines) {
  let fence = null, html = null, paragraphOpen = false;
  return lines.map(line => {
    if (fence) {
      if (new RegExp(`^ {0,3}${fence.character}{${fence.length},}[ \\t]*$`).test(line)) fence = null;
      return { task: false, htmlTags: false };
    }
    if (html) {
      const type = html.type;
      if (type >= 6 && /^[ \t]*$/.test(line)) html = null;
      else {
        if (html.end?.test(line)) html = null;
        return { task: false, htmlTags: type >= 6 };
      }
    }
    if (/^[ \t]*$/.test(line)) { paragraphOpen = false; return { task: false, htmlTags: true }; }
    if (/^ {0,3}>/.test(line)) { paragraphOpen = false; return { task: false, htmlTags: false }; }
    if (/^(?: {4}| {0,3}\t)/.test(line)) return { task: false, htmlTags: false };
    const opening = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (opening && (opening[1][0] === '~' || !opening[2].includes('`'))) {
      fence = { character: opening[1][0], length: opening[1].length };
      paragraphOpen = false;
      return { task: false, htmlTags: false };
    }
    const started = htmlBlockStart(line, paragraphOpen);
    if (started) {
      html = started.end?.test(line) ? null : started;
      paragraphOpen = false;
      return { task: false, htmlTags: started.type >= 6 };
    }
    const block = /^ {0,3}(?:#{1,6}(?:[ \t]|$)|[-+*][ \t]|\d{1,9}[.)][ \t])/.test(line) ||
      /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,}|=+[ \t]*)$/.test(line);
    paragraphOpen = !block;
    return { task: true, htmlTags: true };
  });
}

// Shield literal tag text for the container scanner without changing the displayed criterion.
// Code spans use equal-length backtick runs; unmatched runs stay literal, and blank lines end
// the inline block. Complete HTML tags take precedence, so attribute contents are never rescanned.
function containerTagSource(markdown) {
  const htmlTag = new RegExp(`${htmlOpenTag}|${htmlCloseTag}`, 'y');
  const parts = [];
  let cursor = 0, index = 0;
  const escaped = position => {
    let count = 0;
    for (let before = position - 1; before >= 0 && markdown[before] === '\\'; before--) count++;
    return count % 2 === 1;
  };
  const mask = (start, end) => {
    parts.push(markdown.slice(cursor, start), maskLines(markdown.slice(start, end)));
    cursor = end;
  };
  while (index < markdown.length) {
    if (markdown[index] === '<') {
      if (escaped(index)) { mask(index, index + 1); index++; continue; }
      htmlTag.lastIndex = index;
      if (htmlTag.exec(markdown)) { index = htmlTag.lastIndex; continue; }
    }
    if (markdown[index] !== '`' || escaped(index)) { index++; continue; }
    let openingEnd = index + 1;
    while (markdown[openingEnd] === '`') openingEnd++;
    const length = openingEnd - index;
    const blankOffset = markdown.slice(openingEnd).search(/\n[ \t]*\n/);
    const boundary = blankOffset < 0 ? markdown.length : openingEnd + blankOffset;
    const closingRuns = /`+/g;
    closingRuns.lastIndex = openingEnd;
    let closing, end = null;
    while ((closing = closingRuns.exec(markdown)) && closing.index < boundary) {
      if (closing[0].length === length) { end = closingRuns.lastIndex; break; }
    }
    if (end !== null) { mask(index, end); index = end; }
    else index = openingEnd;
  }
  parts.push(markdown.slice(cursor));
  return parts.join('');
}

// Quoted/code content and collapsed history are excluded even after an HTML block's blank-line
// boundary. Match complete tags (including quoted attributes) and retain nested container depth.
function withoutQuotedContainers(markdown) {
  const tagSource = containerTagSource(markdown);
  const tags = new RegExp(`${htmlOpenTag}|${htmlCloseTag}`, 'g');
  const depths = new Map(['details', 'blockquote', 'q', 'code'].map(name => [name, 0]));
  const parts = [];
  let depth = 0, cursor = 0, start = 0, match;
  while ((match = tags.exec(tagSource))) {
    const tag = match[0].match(/^<(\/?)([A-Za-z][A-Za-z0-9-]*)/);
    const name = tag[2].toLowerCase();
    if (!depths.has(name)) continue;
    if (!tag[1]) {
      if (depth === 0) { parts.push(markdown.slice(cursor, match.index)); start = match.index; }
      depths.set(name, depths.get(name) + 1);
      depth++;
    } else if (depths.get(name) > 0) {
      depths.set(name, depths.get(name) - 1);
      if (--depth === 0) {
        parts.push(maskLines(markdown.slice(start, tags.lastIndex)));
        cursor = tags.lastIndex;
      }
    }
  }
  parts.push(depth > 0 ? maskLines(markdown.slice(start)) : markdown.slice(cursor));
  return parts.join('');
}

// Only actual Markdown task items count as acceptance, not examples, quotes or hidden history.
function checklistEntries(markdown) {
  const lines = normalizeNewlines(markdown).split('\n');
  const kinds = markdownLineKinds(lines);
  const visible = withoutQuotedContainers(lines.map((line, index) => kinds[index].htmlTags ? line : maskLines(line)).join('\n')
    .replace(/<!--[\s\S]*?(?:-->|$)|<\?[\s\S]*?(?:\?>|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<![A-Za-z][^>]*(?:>|$)/g, maskLines));
  const entries = [];
  for (const [lineIndex, line] of visible.split('\n').entries()) {
    if (!kinds[lineIndex].task) continue;
    const item = line.match(/^ {0,3}[-*+] \[([ xX])\] (.+)$/);
    if (item) entries.push({ lineIndex, text: normalizeCriterion(item[2]), checked: item[1].toLowerCase() === 'x' });
  }
  return entries;
}

function withoutCheckboxProgress(markdown) {
  const lines = normalizeNewlines(markdown).split('\n');
  for (const entry of checklistEntries(markdown)) {
    lines[entry.lineIndex] = lines[entry.lineIndex].replace(/^( {0,3}[-*+] \[)[xX](\] )/, '$1 $2');
  }
  return lines.join('\n');
}

export function validateRemoteTaskBody(task, markdown, { migrationSnapshot = false } = {}) {
  assert.equal(typeof markdown, 'string', `${task.id} missing remote body`);
  if (migrationSnapshot) {
    assert.equal(markdown, body(task), `${task.id} body drift in migration snapshot`);
    return 'exact-definition';
  }
  const actual = new Set(checklistEntries(markdown).map(entry => entry.text));
  const missing = task.acceptance.filter(criterion => !actual.has(normalizeCriterion(criterion)));
  assert.equal(missing.length, 0, `${task.id} definition drift: missing current acceptance criteria:\n${missing.join('\n')}`);
  return 'acceptance-present';
}

// Recognize a generated prefix, preserve its checked items and keep all appended history opaque.
// Changes inside the generated prefix require an explicitly reviewed migration, not a blanket sync.
export function preserveIssueProgress(currentBody, previousGeneratedBody, nextGeneratedBody, id = 'Issue') {
  const current = normalizeNewlines(currentBody);
  const previous = normalizeNewlines(previousGeneratedBody).trimEnd();
  const canonicalCurrent = withoutCheckboxProgress(current);
  const canonicalPrevious = withoutCheckboxProgress(previous);
  assert.ok(canonicalCurrent.startsWith(canonicalPrevious) &&
    (current.length === previous.length || current[previous.length] === '\n'),
  `${id} unknown body drift; no safe generated prefix. Review the remote body and preserve progress with a scoped update.`);
  const prefix = current.slice(0, previous.length);
  const suffix = current.slice(previous.length);
  const next = normalizeNewlines(nextGeneratedBody).trimEnd();
  const nextEntries = checklistEntries(next);
  const nextCriteria = new Set(nextEntries.map(entry => entry.text));
  const prefixCompleted = new Set(checklistEntries(prefix).filter(entry => entry.checked).map(entry => entry.text));
  for (const criterion of prefixCompleted) {
    assert.ok(nextCriteria.has(criterion), `${id} checked acceptance would be removed or changed: ${criterion}; preserve its evidence in a reviewed scoped update.`);
  }
  const completed = new Set(checklistEntries(current).filter(entry => entry.checked).map(entry => entry.text));
  const lines = next.split('\n');
  for (const entry of nextEntries) {
    if (completed.has(entry.text)) lines[entry.lineIndex] = lines[entry.lineIndex].replace(/^( {0,3}[-*+] \[) (\] )/, '$1x$2');
  }
  return lines.join('\n') + (suffix || '\n');
}

export function prepareBodyUpdates(tasks, existing, previousBodies = new Map(), { allowMissing = false } = {}) {
  return tasks.flatMap(task => {
    const candidates = existing.filter(issue => issue.title.startsWith(`[${task.id}] `));
    assert.ok(candidates.length <= 1, `duplicate remote title for ${task.id}`);
    const issue = existing.find(candidate => candidate.number === task.number) ?? candidates[0];
    if (!issue) {
      assert.ok(allowMissing && task.number == null && task.databaseId == null, `${task.id} missing remote issue; do not recreate an assigned identity`);
      return [];
    }
    assert.ok(issue.title.startsWith(`[${task.id}] `), `refuse mismatched issue ${task.id}/#${issue.number}`);
    if (task.databaseId != null) assert.equal(issue.id, task.databaseId, `database ID mismatch ${task.id}`);
    if (task.number != null) assert.equal(issue.number, task.number, `number mismatch ${task.id}`);
    const nextBody = body(task);
    const templates = [...new Set([nextBody, previousBodies.get(task.id)].filter(value => typeof value === 'string'))];
    const failures = [];
    for (const previousBody of templates) {
      try { return [{ task, issue, body: preserveIssueProgress(issue.body, previousBody, nextBody, task.id) }]; }
      catch (error) { failures.push(error.message); }
    }
    throw new Error(`${task.id} body preflight failed before batch writes:\n${failures.join('\n')}`);
  });
}

function previousBodies(tasks) {
  return new Map(tasks.flatMap(task => {
    const filename = `${dir}/issue-bodies/${task.id}.md`;
    return existsSync(filename) ? [[task.id, read(filename)]] : [];
  }));
}

function applyBodyUpdate(update) {
  // GitHub has no transactional multi-Issue edit. Re-read before each PATCH to avoid clobbering
  // progress added after the complete batch preflight; already applied safe updates remain applied.
  const latest = api(`repos/${plan.repo}/issues/${update.issue.number}`);
  assert.equal(latest.id, update.issue.id, `identity changed after preflight for #${update.issue.number}`);
  assert.equal(latest.title, update.issue.title, `title changed after preflight for #${update.issue.number}`);
  assert.equal(latest.body, update.issue.body, `body changed after preflight for #${update.issue.number}; stop and re-read the batch`);
  if (latest.body !== update.body) api(`repos/${plan.repo}/issues/${update.issue.number}`, 'PATCH', { body: update.body });
}

function programBody() {
  return read(`${dir}/program-body.md`) + '\n\n## 新队列\n\n' + plan.tasks.map(t => '- ' + link(t.id) + ' ' + t.title).join('\n');
}

function publish(){
  validate();
  const existing=allIssues();
  const previous = previousBodies(plan.tasks);
  const preflight = prepareBodyUpdates(plan.tasks, existing, previous, { allowMissing: true });
  const parent = api(`repos/${plan.repo}/issues/${plan.parentNumber}`);
  const initialProgramBody = read(`${dir}/program-body.md`);
  const priorProgramBody = withoutCheckboxProgress(parent.body).trimEnd() === withoutCheckboxProgress(initialProgramBody).trimEnd()
    ? initialProgramBody : programBody();
  preserveIssueProgress(parent.body, priorProgramBody, programBody(), 'VPJ-00');
  for(const t of orderedTasks(plan.tasks)){
    const candidates=existing.filter(i=>i.title.startsWith(`[${t.id}]`));
    assert.ok(candidates.length<=1,`duplicate remote title for ${t.id}`);
    let match=existing.find(i=>i.number===t.number)||candidates[0];
    if(match){
      assert.ok(match.title.startsWith(`[${t.id}] `),`refuse mismatched issue ${t.id}/#${match.number}`);
      if(t.databaseId)assert.equal(match.id,t.databaseId,`database ID mismatch ${t.id}`);
      if(t.number)assert.equal(match.number,t.number,`number mismatch ${t.id}`);
    }
    const labels=['enhancement',`phase:${t.phase}`,`priority:${t.track==='expand'?'P2':t.phase==='R0'||t.phase==='R1'?'P0':'P1'}`,'status:blocked',t.owner==='operator'?'ready-for-human':'needs-triage'];
    if(!match)match=api(`repos/${plan.repo}/issues`,'POST',{title:`[${t.id}] ${t.title}`,body:body(t),labels});
    t.number=match.number;t.databaseId=match.id;t.url=match.html_url;
    saveJson(planPath,plan);
    console.log(`${t.id} -> #${t.number}`);
  }
  const updates = prepareBodyUpdates(preflight.map(update => update.task), existing, previous);
  for(const update of updates) applyBodyUpdate(update);
  for(const t of orderedTasks(plan.tasks)){
    const deps=api(`repos/${plan.repo}/issues/${t.number}/dependencies/blocked_by`);
    for(const id of t.blockedBy){const dep=byId.get(id);if(!deps.some(d=>d.number===dep.number))api(`repos/${plan.repo}/issues/${t.number}/dependencies/blocked_by`,'POST',{issue_id:dep.databaseId});}
    let parent=null;
    try { parent=api(`repos/${plan.repo}/issues/${t.number}/parent`); }
    catch(error) { if(!String(error.stderr??'').includes('404')) throw error; }
    if(parent?.number!==plan.parentNumber)api(`repos/${plan.repo}/issues/${plan.parentNumber}/sub_issues`,'POST',{sub_issue_id:t.databaseId});
    console.log(`${t.id} dependencies and parent linked`);
  }
  applyBodyUpdate({ issue: parent, body: preserveIssueProgress(parent.body, priorProgramBody, programBody(), 'VPJ-00') });
  render();
}

async function closeOld(){
  validate();assert.ok(plan.tasks.every(t=>t.number&&t.databaseId),'new tasks must exist before closing old');
  await verifyNewRemote({ migrationSnapshot: true });
  const snapshot=json(plan.sourceSnapshot);const results=[];
  const old=[...snapshot.issues].sort((a,b)=>Number([2,149].includes(a.number))-Number([2,149].includes(b.number)));
  for(const item of old){
    const current=api(`repos/${plan.repo}/issues/${item.number}`);
    assert.equal(current.title,item.title,`title changed for #${item.number}; inspect before closing`);
    if(current.state==='open'){
      const replacement=plan.oldIssueSuccessors[String(item.number)].map(link).join(', ');
      api(`repos/${plan.repo}/issues/${item.number}/comments`,'POST',{body:`2026-09-05 JT明确授权关闭全部旧开放Issue并按全新规划重建。本项由 ${replacement} 承接。\n\n关闭含义：superseded / not planned，**不是原验收已完成**。已合并代码、未完成的Staging/Provider/RLS/隐私/备份/发布责任保留在替代任务。原正文、评论与native依赖快照在新Program的issue-snapshot-before.json / issue-relations-before.json。需要回滚时可重新打开并恢复原标签。已有PR不会因此自动关闭。`});
      const labels=current.labels.map(l=>l.name).filter(s=>!s.startsWith('status:')&&!['ready-for-agent','ready-for-human','needs-triage','needs-info'].includes(s));
      api(`repos/${plan.repo}/issues/${item.number}`,'PATCH',{state:'closed',state_reason:'not_planned',labels});
    }
    results.push({number:item.number,state:'closed',reason:'not_planned',successors:plan.oldIssueSuccessors[String(item.number)]});
    saveJson(`${dir}/tracker-migration-result.json`,{updatedAt:new Date().toISOString(),results});console.log(`superseded #${item.number}`);
  }
}

export function validateRemoteTaskState(task, issue, { baselineMerged, blockers = [], migrationSnapshot = false }) {
  assert.ok(issue, `${task.id} missing remote issue`);
  const labels = issue.labels.map(label => label.name);
  if (migrationSnapshot || !baselineMerged) {
    assert.equal(issue.state, 'open', `${task.id} must be open before baseline/migration acceptance`);
    assert.ok(labels.includes('status:blocked'), `${task.id} must remain blocked before baseline/migration acceptance`);
    return 'baseline-blocked';
  }
  const openBlockers = blockers.filter(blocker => blocker.state !== 'closed' || blocker.state_reason !== 'completed');
  if (issue.state === 'closed') {
    assert.equal(issue.state_reason, 'completed', `${task.id} closed without completion; reconcile its planned scope`);
    assert.equal(openBlockers.length, 0, `${task.id} completed with unresolved native blockers`);
    assert.ok(!labels.some(label => ['status:ready', 'status:in-progress'].includes(label) || label.startsWith('ready-for-')),
      `${task.id} completed with active readiness labels; reconcile tracker lifecycle`);
    return 'completed';
  }
  assert.equal(issue.state, 'open', `${task.id} unexpected state`);
  if (labels.some(label => ['status:ready', 'status:in-progress', 'ready-for-agent'].includes(label))) {
    assert.equal(openBlockers.length, 0, `${task.id} active with unresolved native blockers`);
  }
  if (labels.includes('status:blocked') && openBlockers.length === 0) return 'readiness-review';
  return 'open';
}

async function verifyNewRemote({ migrationSnapshot = false } = {}){
  validate();const existing=allIssues();
  const baseline = api(`repos/${plan.repo}/pulls/${plan.baselinePr}`);
  const baselineMerged = baseline.merged === true;
  const readinessReview = [];
  for(let start=0;start<plan.tasks.length;start+=8){
    const results=await Promise.allSettled(plan.tasks.slice(start,start+8).map(async t=>{
      const i=existing.find(x=>x.number===t.number);assert.ok(i,`${t.id} missing remote issue`);assert.ok(i.title.startsWith(`[${t.id}] `));assert.equal(i.id,t.databaseId);
      validateRemoteTaskBody(t, i.body, { migrationSnapshot });
      const [deps,parent]=await Promise.all([readApi(`repos/${plan.repo}/issues/${t.number}/dependencies/blocked_by`),readApi(`repos/${plan.repo}/issues/${t.number}/parent`)]);
      assert.deepEqual(deps.map(x=>x.number).sort((a,b)=>a-b),t.blockedBy.map(number).sort((a,b)=>a-b),`${t.id} native deps`);assert.equal(parent.number,plan.parentNumber);
      const state = validateRemoteTaskState(t, i, { baselineMerged, blockers: deps, migrationSnapshot });
      if (state === 'readiness-review') readinessReview.push(t.id);
    }));
    const failures=results.filter(r=>r.status==='rejected');assert.equal(failures.length,0,failures.map(r=>String(r.reason)).join('\n'));
    console.log(`verified new tasks ${Math.min(start+8,plan.tasks.length)}/${plan.tasks.length}`);
  }
  console.log(JSON.stringify({ baselineMerged, migrationSnapshot, readinessReview: readinessReview.sort(), bodyValidation: migrationSnapshot ? 'exact snapshot' : 'current acceptance criteria present; progress and appended history allowed', note: 'Tracker identity, acceptance definitions, dependencies, parent and lifecycle checked; not runtime acceptance. Readiness candidates still need interface, environment, ownership and activation review; no labels changed.' }));
  return existing;
}

function readApi(endpoint){return new Promise((resolve,reject)=>execFile('gh',['api',endpoint],{encoding:'utf8',maxBuffer:32*1024*1024},(error,stdout)=>{if(error)return reject(error);try{resolve(JSON.parse(stdout));}catch(e){reject(e);}}));}

async function verifyRemote(){
  const existing=await verifyNewRemote();
  for(const n of Object.keys(plan.oldIssueSuccessors)){const i=existing.find(x=>x.number===Number(n));assert.equal(i?.state,'closed',n);assert.equal(i.state_reason,'not_planned',n);}
  const result={at:new Date().toISOString(),repo:plan.repo,parent:plan.parentNumber,newTasks:plan.tasks.length,closedOld:Object.keys(plan.oldIssueSuccessors).length,nativeDependencies:plan.tasks.reduce((n,t)=>n+t.blockedBy.length,0),verified:true};
  saveJson(`${dir}/tracker-verification.json`,result);console.log(JSON.stringify(result));
}

function syncBodies(){
  validate();const existing=allIssues();
  const updates = prepareBodyUpdates(plan.tasks, existing, previousBodies(plan.tasks));
  for(const update of updates){applyBodyUpdate(update);console.log(`synced ${update.task.id}`);}
  render();
}

function syncSelected(){
  validate();
  const selected = [...new Set(process.argv.slice(3))].map(id => { const task=byId.get(id);assert.ok(task?.number,id);return task; });
  assert.ok(selected.length, 'sync-selected requires at least one task ID');
  const existing = selected.map(t => api(`repos/${plan.repo}/issues/${t.number}`));
  const updates = prepareBodyUpdates(selected, existing, previousBodies(selected));
  for(const update of updates){
    const t=update.task;
    applyBodyUpdate(update);
    const deps=api(`repos/${plan.repo}/issues/${t.number}/dependencies/blocked_by`);
    for(const d of t.blockedBy){const dep=byId.get(d);if(!deps.some(x=>x.number===dep.number))api(`repos/${plan.repo}/issues/${t.number}/dependencies/blocked_by`,'POST',{issue_id:dep.databaseId});}
    console.log(`synced ${t.id} and added dependencies`);
  }
  render();
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(root,'scripts/vpj-program.mjs')) {
  const cmd=process.argv[2]??'verify';
  if(cmd==='verify')validate();
  else if(cmd==='render')render();
  else if(cmd==='render-handoff')renderHandoff();
  else if(cmd==='publish')publish();
  else if(cmd==='sync-bodies')syncBodies();
  else if(cmd==='sync-selected')syncSelected();
  else if(cmd==='close-old')await closeOld();
  else if(cmd==='verify-remote')await verifyRemote();
  else throw new Error('Use verify, render, publish, close-old or verify-remote. Mutating commands require explicit task authorization.');
}
