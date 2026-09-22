import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderHandoffDocuments } from './lib/handoff-documents.mjs';

const root = process.cwd();
const dir = 'docs/program/2026-09-05';
const planPath = `${dir}/issue-plan.json`;
const read = p => readFileSync(p, 'utf8');
const json = p => JSON.parse(read(p));
const save = (p, value) => { mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, value); };
const saveJson = (p, value) => save(p, JSON.stringify(value, null, 2) + '\n');
const plan = json(planPath);
// 76 行执行合同里，不得触碰(68/76)、Rollback(65/76) 和运行门(42/76) 逐字重复同一条款。
// 提成默认条款后，行内只在偏离默认时展开原文：条款一字未改，每个 Issue 锚点少读约 800 字。
// 改这里等于改全部默认任务的条款，改动要和 issue-plan.json 一起审查。
export const contractDefaults = {
  doNotTouch: "No unrelated runtime/module rewrites; allowedPaths is an upper bound, narrow to the current story.；No secrets, original user worktree, old applied migrations, branch protection or production actions.；No unreviewed knowledge publication, unconfirmed Trip writes, or external inventory/payment/fulfillment.；No archived research/test oracle deletion or invented runtime/provider/Store result.",
  rollback: "Revert this Issue's isolated PR/flag and restore the prior supported client/API path. For append-only data changes, use the reviewed forward/compatibility rollback; never rewrite applied history or restore revoked/deleted user data.",
  externalPrerequisites: "本片实际输入与接口可用即可开始；上游Issue仍open不单独阻止有界实施。完整验收仍核对列出的技术依赖与真实环境。 Where provider/DB/media/Store behavior is an acceptance criterion, real permitted test environment is mandatory; fixture-only is partial.",
};

export const executionContractHeader = `# VPJ Issue 执行合同\n\n生成自issue-plan.json。当前共享流程见 [development-workflow.md](../../agents/development-workflow.md) / ADR-0024。\n阅读当前Issue/PR、本行、受影响接口与代码；历史研究按需读取。\n\nChecks列是完整Issue验收清单；每条PR按实际改动选择本地验证，保留适用CI和最终运行门。\nAllowed列标示主要范围；必要的相邻文件调整、维护任务和独立准备片段按共享流程记录。\n运行依赖未完成时父Issue保持未验收；fixture不证明设备、数据库、provider或生产通过。\n\n## 默认条款\n\n下列三条对全部任务生效。任务行写「默认」即适用本节原文；偏离的任务在自己行里写出完整条款。\n\n- 运行门（默认）: ${contractDefaults.externalPrerequisites}\n- 不得触碰（默认）: ${contractDefaults.doNotTouch}\n- Rollback（默认）: ${contractDefaults.rollback}\n\n`;
const byId = new Map(plan.tasks.map(t => [t.id, t]));
const number = id => id === 'VPJ-00' ? plan.parentNumber : byId.get(id)?.number;
const link = id => number(id) ? `[${id} #${number(id)}](https://github.com/${plan.repo}/issues/${number(id)})` : id;

// Both kinds remain in the acceptance graph. Only blockedBy is mirrored to GitHub.
export function allDependencies(task) {
  const acceptance = task.acceptanceDependencies ?? [];
  assert.ok(Array.isArray(task.blockedBy) && Array.isArray(acceptance), `${task.id} invalid dependency list`);
  const dependencies = [...task.blockedBy, ...acceptance];
  assert.ok(dependencies.every(id => typeof id === 'string' && id.trim()), `${task.id} invalid dependency id`);
  assert.equal(new Set(dependencies).size, dependencies.length, `${task.id} duplicate dependency`);
  return dependencies;
}

export function orderedTasks(tasks) {
  const index = new Map(tasks.map(t => [t.id, t]));
  assert.equal(index.size, tasks.length, 'duplicate task id');
  const visiting = new Set(), done = new Set(), ordered = [];
  const visit = id => {
    assert.ok(index.has(id), `unknown dependency ${id}`);
    assert.ok(!visiting.has(id), `dependency cycle at ${id}`);
    if (done.has(id)) return;
    visiting.add(id);
    for (const dep of allDependencies(index.get(id))) visit(dep);
    visiting.delete(id); done.add(id); ordered.push(index.get(id));
  };
  for (const task of tasks) visit(task.id);
  return ordered;
}

export function validateDeliveryStages(value) {
  assert.ok(Array.isArray(value.deliveryStages) && value.deliveryStages.length, 'missing delivery stages');
  const stages = new Map();
  for (const [index, stage] of value.deliveryStages.entries()) {
    assert.ok(typeof stage.id === 'string' && stage.id.trim(), 'missing delivery stage id');
    assert.ok(!stages.has(stage.id), `duplicate delivery stage ${stage.id}`);
    assert.ok(typeof stage.title === 'string' && stage.title.trim(), `${stage.id} missing delivery stage title`);
    assert.ok(Array.isArray(stage.acceptance) && stage.acceptance.length &&
      stage.acceptance.every(item => typeof item === 'string' && item.trim()), `${stage.id} missing stage acceptance`);
    if (stage.ongoingIssueNumbers !== undefined) {
      assert.ok(Array.isArray(stage.ongoingIssueNumbers) &&
        stage.ongoingIssueNumbers.every(number => Number.isSafeInteger(number) && number > 0), `${stage.id} invalid ongoing Issue numbers`);
    }
    stages.set(stage.id, index);
  }
  if (stages.has('expand')) assert.equal(stages.get('expand'), stages.size - 1, 'expand must follow launch delivery stages');
  const tasks = orderedTasks(value.tasks);
  const index = new Map(tasks.map(task => [task.id, task]));
  for (const task of tasks) {
    assert.ok(typeof task.deliveryStage === 'string' && task.deliveryStage, `${task.id} missing delivery stage`);
    assert.ok(stages.has(task.deliveryStage), `${task.id} unknown delivery stage ${task.deliveryStage}`);
    if (task.track === 'expand') assert.equal(task.deliveryStage, 'expand', `${task.id} expand task must use expand stage`);
    if (task.track === 'launch') assert.notEqual(task.deliveryStage, 'expand', `${task.id} launch task cannot use expand stage`);
    for (const dependency of allDependencies(task)) {
      const upstream = index.get(dependency);
      assert.ok(stages.get(upstream.deliveryStage) <= stages.get(task.deliveryStage),
        `${task.id} delivery stage ${task.deliveryStage} precedes dependency ${dependency} in ${upstream.deliveryStage}`);
    }
  }
}

function validate() {
  validateDeliveryStages(plan);
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
    validateExecutionBrief(task);
  }
  if (existsSync(`${dir}/archive-manifest.json`)) {
    for (const item of json(`${dir}/archive-manifest.json`).files) {
      assert.ok(existsSync(item.archivedPath));
      assert.equal(createHash('sha256').update(readFileSync(item.archivedPath)).digest('hex'), item.sha256);
    }
  }
  console.log(`VPJ plan passed: ${plan.tasks.length} tasks, ${before.length} replacements, acyclic dependencies, contracts and archive hashes.`);
}

export function validateExecutionBrief(task) {
  const brief = task.executionBrief;
  if (brief === undefined) return;
  assert.ok(brief && typeof brief === 'object' && !Array.isArray(brief), `${task.id} invalid execution brief`);
  assert.deepEqual(Object.keys(brief).sort(), ['boundary', 'firstSlice', 'reuse']);
  for (const key of ['firstSlice', 'boundary']) assert.ok(typeof brief[key] === 'string' && brief[key].trim(), `${task.id} missing ${key}`);
  assert.ok(Array.isArray(brief.reuse) && brief.reuse.length && brief.reuse.every(p => typeof p === 'string' && p.trim()), `${task.id} missing reuse inputs`);
}

function dependencyBlock(t) {
  if (t.acceptanceDependencies === undefined) {
    return `${t.executionBrief ? '## 验收依赖（不自动转为 blocked）' : '## Blocked by'}\n\n${t.blockedBy.length ? t.blockedBy.map(id => '- ' + link(id)).join('\n') : '无其他任务依赖；仍需核对当前接口、环境与外部条件。'}\n\n`;
  }
  return '## 开工依赖（GitHub 原生关系）\n\n' +
    (t.blockedBy.length ? t.blockedBy.map(id => '- ' + link(id)).join('\n') : '无已登记的整票开工硬依赖；开工前仍核实际接口、环境与权限。') +
    '\n\n涉及本轮保护任务的原生关系暂按原样保留；有无 Blocked 图标都不证明已就绪或已验收。\n\n' +
    '## 集成与最终验收依赖（普通关联）\n\n' + (t.acceptanceDependencies.map(id => '- ' + link(id)).join('\n') || '无其他普通关联；上列真实开工依赖仍保留。') +
    '\n\n可按首个切片独立推进；这些输入的实际能力与适用证据仍须在集成/整票验收时核对，不能用 fixture 或移除图标替代。\n\n';
}

function executionBriefBlock(t) {
  if (!t.executionBrief) return '';
  validateExecutionBrief(t);
  const source = `https://github.com/${plan.repo}/blob/${t.sourceRef ?? 'main'}`;
  return '## 执行边界与首个切片\n\n' +
    `- 首个可交付结果：${t.executionBrief.firstSlice}\n` +
    `- 本票责任/非目标：${t.executionBrief.boundary}\n` +
    `- 先读/复用：${t.executionBrief.reuse.map(p => `[${p}](${source}/${p})`).join(' · ')}\n` +
    '- 排期：上游未结票不自动停止开发；先核对本片实际输入。整票关闭仍需全部适用验收，局部/离线通过不能代替真实能力。\n\n';
}

export function body(t) {
  const source = `https://github.com/${plan.repo}/blob/${t.sourceRef ?? 'main'}`;
  const baselineNote = t.baselineNote ?? `历史规划基线：${plan.baselinePr ? '#' + plan.baselinePr : '尚未登记'}。当前执行读取 main 的合同，并核对实时依赖、可用接口和获准环境；本计划定义不代表任务已就绪或已验收。`;
  const entry = t.executionBrief
    ? `## 实施与验收入口\n\n[执行行：范围、检查、证据与回退](${source}/${dir}/EXECUTION-CONTRACT.md#${t.id.toLowerCase()}) · [接口](${source}/${t.contract}) · [开发流程](${source}/docs/agents/development-workflow.md) · [阶段 ${t.deliveryStage}](${source}/${dir}/DELIVERY-STAGES.md#${t.deliveryStage.toLowerCase()})。\n\n`
    : `## 当前基线与开发入口\n\n${baselineNote}\n` +
      `任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](${source}/${dir}/EXECUTION-CONTRACT.md#${t.id.toLowerCase()})；按 [开发流程](${source}/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](${source}/${t.contract})。\n` +
      (t.deliveryStage ? `验收阶段：[${t.deliveryStage}](${source}/${dir}/DELIVERY-STAGES.md#${t.deliveryStage.toLowerCase()})；阶段演示不代替本票完整验收。\n` : '') +
      `首次进入或范围变化时读 [主报告](${source}/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。\n\n`;
  return `## Program\n\n${link('VPJ-00')} · ${t.track === 'expand' ? '后续证据触发任务' : '首发交付任务'}\n\n` +
    `## 用户结果\n\n${t.title}。\n\n` +
    executionBriefBlock(t) +
    entry +
    dependencyBlock(t) +
    `## Acceptance criteria\n\n${t.acceptance.map(a => '- [ ] ' + a).join('\n')}\n\n` +
    `## 不得触碰\n\n${t.doNotTouch.map(s => '- ' + s).join('\n')}\n\n` +
    (t.activationEvidence ? `后续开启门：${t.activationEvidence}\n\n` : '') +
    `替代历史责任：${t.oldIssues.length ? t.oldIssues.map(n=>'#'+n).join(', ') : '见Program的旧新映射；不因新增任务删除有效旧测试。'}\n`;
}

export function renderDeliveryStages(value) {
  validateDeliveryStages(value);
  const tasks = orderedTasks(value.tasks);
  const issueLink = number => `[#${number}](https://github.com/${value.repo}/issues/${number})`;
  return '# VPJ 分阶段交付与验收\n\n生成自 `issue-plan.json`；复用既有 Issue，不建立第二套队列。阶段是用户可观察成果的归属，不是实时完成状态。\n\n' +
    '阶段演示不等于整票验收或关闭；父 Issue 只有完整验收通过才关闭。独立准备可以跨阶段推进，仍保留实际依赖、运行条件和未验项；前一阶段的全部票不是后一阶段准备工作的额外阻塞。\n\n' +
    '按 [开发流程](../../agents/development-workflow.md) 执行；每次验收记录版本、环境、实际用户结果及 PASS / FAIL / UNRUN，fixture 不替代运行或发布证据。\n\n' +
    value.deliveryStages.map(stage => `## ${stage.id}\n\n**${stage.title}**\n\n` +
      (stage.milestoneUrl ? `[GitHub 里程碑](${stage.milestoneUrl})\n\n` : '') +
      '验收成果：\n\n' + stage.acceptance.map(item => `- ${item}`).join('\n') + '\n\n' +
      '| 现有 Issue | 用户结果 |\n| --- | --- |\n' +
      tasks.filter(task => task.deliveryStage === stage.id).map(task =>
        `| ${issueLink(task.number)} · ${task.id} | ${task.title} |`).join('\n') + '\n\n' +
      (stage.ongoingIssueNumbers?.length ? `持续配合：${stage.ongoingIssueNumbers.map(issueLink).join('、')}；这是跨阶段工作，不改变任务身份或依赖。\n\n` : '')
    ).join('') + '后续 expand 仍需各票 activationEvidence；依赖完成不自动激活，也不纳入当前首发验收。\n';
}

const defaulted = (value, fallback) => (value === fallback ? '默认（见文件开头「默认条款」）' : value);

export function executionContractRow(t) {
  return `## ${t.id}\n\n${link(t.id)} — ${t.title}\n\n` +
    executionBriefBlock(t).replace('## 执行边界与首个切片', '### 执行边界与首个切片') +
    `- Owner: ${t.owner}; ${t.kind}; ${t.effortDays}专注日，${t.observationWindow}\n` +
    `- 验收阶段: ${t.deliveryStage}\n` +
    `- Blocked by: ${t.blockedBy.map(link).join(', ') || '无任务依赖；核实际条件'}\n` +
    (t.acceptanceDependencies !== undefined ? `- 集成/最终验收依赖（普通关联）: ${t.acceptanceDependencies.map(link).join(', ') || '无'}\n` : '') +
    `- Allowed: ${t.allowedPaths.map(p=>'\u0060'+p+'\u0060').join(', ')}\n` +
    `- Checks: ${t.checks.map(p=>'\u0060'+p+'\u0060').join('; ')}\n` +
    `- Evidence: ${t.artifactPaths.map(p=>'\u0060'+p+'\u0060').join(', ')}\n` +
    `- 接口: ${t.contract}; Red lines: ${t.redLines.join(', ')}\n` +
    `- 运行门: ${defaulted(t.externalPrerequisites.join(' '), contractDefaults.externalPrerequisites)}\n` +
    (t.nativeVerification ? `- Native: ${t.nativeVerification}\n`:'') +
    `- 文档影响: ${t.docsImpact.map(p=>'\u0060'+p+'\u0060').join(', ')}\n` +
    `- 不得触碰: ${defaulted(t.doNotTouch.join('；'), contractDefaults.doNotTouch)}\n` +
    (t.activationEvidence ? `- 后续开启门: ${t.activationEvidence}\n` : '') +
    `- Rollback: ${defaulted(t.rollback, contractDefaults.rollback)}\n\n` +
    t.acceptance.map(a=>'- [ ] '+a).join('\n') + '\n\n';
}

function render() {
  validate();
  const header = '# VPJ 任务定义与依赖\n\n生成自 `issue-plan.json`；不要手工改此表。这是计划定义，不是实时进度；执行状态以 GitHub、已合并接口和获准环境的当前证据为准。\n\n';
  const table = '| 任务 | 交付 | 原生开工依赖 | 集成/验收关联 | Owner | 专注日/观察 | 验收阶段 | 范围 |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n' +
    orderedTasks(plan.tasks).map(t=>`| ${link(t.id)} | ${t.title} | ${t.blockedBy.map(link).join(', ') || '无'} | ${(t.acceptanceDependencies ?? []).map(link).join(', ') || '无'} | ${t.owner} | ${t.effortDays}日；${t.observationWindow} | [${t.deliveryStage}](DELIVERY-STAGES.md#${t.deliveryStage.toLowerCase()}) | ${t.track} |`).join('\n');
  save(`${dir}/ISSUES.md`, header + table + '\n\n后续expand必须另有activationEvidence，依赖完成不会自动开放。\n');
  save(`${dir}/DELIVERY-STAGES.md`, renderDeliveryStages(plan));
  let contracts = executionContractHeader;
  for (const t of plan.tasks) {
    save(`${dir}/issue-bodies/${t.id}.md`, body(t));
    contracts += executionContractRow(t);
  }
  save(`${dir}/EXECUTION-CONTRACT.md`, contracts.trimEnd()+'\n');
  const snap = json(plan.sourceSnapshot).issues;
  save(`${dir}/ISSUE-MIGRATION.md`, '# 2026-09-05 迁移快照：旧开放 Issue → 新责任映射\n\n当日全部旧项按用户授权superseded/not planned关闭，不代表已验收；原body/comments及关系快照保留。PR #185/#186在该迁移快照中为open；当前状态须查询GitHub，不由本历史记录推断。\n\n| 旧Issue | 标题 | 新责任 |\n| --- | --- | --- |\n' + snap.map(t=>`| [#${t.number}](${t.url}) | ${t.title} | ${plan.oldIssueSuccessors[String(t.number)].map(link).join(', ')} |`).join('\n')+'\n');
  renderHandoff();
  const files = walk('docs').filter(p=>p.endsWith('.md') && p !== 'docs/INDEX.md');
  saveJson('docs/manifest.json',{schemaVersion:'vpj-docs/1',date:plan.date,authority:'docs/VISEPANDA-MASTER-PLAN-2026-09-05.md',files:files.map(p=>({path:p,status:p.startsWith('docs/archive/')?'archived':p.startsWith('docs/research/')?'evidence':'document'}))});
  save('docs/INDEX.md','# Documentation index\n\nGenerated by `node scripts/vpj-program.mjs render`; active entry: [VPJ Program](program/2026-09-05/README.md). Archives and old plans are historical, not execution authority.\n\n'+files.map(p=>`- [${p.slice(5)}](${p.slice(5)})${p.startsWith('docs/archive/')?' — archived':''}`).join('\n')+'\n');
  console.log('Generated delivery stages, task bodies, execution contract, migration table and documentation index.');
}

function renderHandoff() {
  const h=json('docs/handoff.json');
  h.program.baselinePr=plan.baselinePr;
  saveJson('docs/handoff.json',h);
  const { context, handoff } = renderHandoffDocuments(h, plan);
  save('HANDOFF.md', handoff);
  save('CONTEXT.md', context);
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
  let nextInlineBlock = 0, activeInlineBlock = null;
  const nonInline = (htmlTags = false) => {
    activeInlineBlock = null;
    return { task: false, htmlTags, inlineBlock: null };
  };
  return lines.map(line => {
    if (fence) {
      if (new RegExp(`^ {0,3}${fence.character}{${fence.length},}[ \\t]*$`).test(line)) fence = null;
      return nonInline();
    }
    if (html) {
      const type = html.type;
      if (type >= 6 && /^[ \t]*$/.test(line)) html = null;
      else {
        if (html.end?.test(line)) html = null;
        return nonInline(type >= 6);
      }
    }
    if (/^[ \t]*$/.test(line)) { paragraphOpen = false; return nonInline(true); }
    if (/^ {0,3}>/.test(line)) { paragraphOpen = false; return nonInline(); }
    if (/^(?: {4}| {0,3}\t)/.test(line)) return nonInline();
    const opening = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (opening && (opening[1][0] === '~' || !opening[2].includes('`'))) {
      fence = { character: opening[1][0], length: opening[1].length };
      paragraphOpen = false;
      return nonInline();
    }
    const started = htmlBlockStart(line, paragraphOpen);
    if (started) {
      html = started.end?.test(line) ? null : started;
      paragraphOpen = false;
      return nonInline(started.type >= 6);
    }
    const heading = /^ {0,3}#{1,6}(?:[ \t]|$)/.test(line);
    const separator = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,}|=+[ \t]*)$/.test(line);
    const list = line.match(/^ {0,3}(?:[-+*]|(\d{1,9})[.)])(?:[ \t]+(.*)|$)/);
    // An empty list item, or an ordered marker other than 1, cannot interrupt a paragraph.
    const listStart = list && (!paragraphOpen || (list[2]?.trim() && (!list[1] || Number(list[1]) === 1)));
    if (separator) { paragraphOpen = false; return nonInline(true); }
    if (heading || listStart || activeInlineBlock === null) activeInlineBlock = ++nextInlineBlock;
    const inlineBlock = activeInlineBlock;
    if (heading) activeInlineBlock = null;
    paragraphOpen = !heading;
    return { task: true, htmlTags: true, inlineBlock };
  });
}

// Shield literal tag text for the container scanner without changing the displayed criterion.
// Code spans use equal-length backtick runs inside one actual inline block. Complete HTML tags
// take precedence, so attribute contents are never rescanned. Unmatched runs remain literal.
function containerTagSource(markdown, kinds) {
  const htmlTag = new RegExp(`${htmlOpenTag}|${htmlCloseTag}`, 'y');
  const parts = [];
  const lineStarts = [0];
  for (let offset = 0; offset < markdown.length; offset++) if (markdown[offset] === '\n') lineStarts.push(offset + 1);
  const inlineEnds = [];
  for (let line = kinds.length - 1; line >= 0; line--) {
    inlineEnds[line] = kinds[line].inlineBlock !== null && kinds[line].inlineBlock === kinds[line + 1]?.inlineBlock
      ? inlineEnds[line + 1] : (lineStarts[line + 1] ?? markdown.length);
  }
  let cursor = 0, index = 0, line = 0;
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
    while (lineStarts[line + 1] <= index) line++;
    const inline = kinds[line].inlineBlock !== null;
    if (markdown[index] === '<') {
      if (inline && escaped(index)) { mask(index, index + 1); index++; continue; }
      htmlTag.lastIndex = index;
      if (htmlTag.exec(markdown)) { index = htmlTag.lastIndex; continue; }
    }
    if (!inline || markdown[index] !== '`' || escaped(index)) { index++; continue; }
    let openingEnd = index + 1;
    while (markdown[openingEnd] === '`') openingEnd++;
    const length = openingEnd - index;
    const boundary = inlineEnds[line];
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
function withoutQuotedContainers(markdown, kinds) {
  const tagSource = containerTagSource(markdown, kinds);
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
    .replace(/<!--[\s\S]*?(?:-->|$)|<\?[\s\S]*?(?:\?>|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<![A-Za-z][^>]*(?:>|$)/g, maskLines), kinds);
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

// Public checked progress only; quoted examples and hidden historical blocks stay excluded.
export function checkedTaskItems(markdown) {
  return [...new Set(checklistEntries(markdown).filter(entry => entry.checked).map(entry => entry.text))];
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

export function programBody() {
  return read(`${dir}/program-body.md`) + '\n\n## 当前六阶段与后续扩展\n\n' +
    '阶段演示不是整票完成；完整验收、原生依赖及后续激活条件保留。当前按[三队任务分工](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/TEAM-PLAN-2026-09-17.md)并行，每队一个主要交付；已分配VPJ-04/08/07/75/76保持原归属。\n\n' +
    '| 阶段 | 验收成果 | 现有任务数 |\n| --- | --- | --- |\n' +
    plan.deliveryStages.map(stage => `| [${stage.id}](${stage.milestoneUrl ?? `https://github.com/${plan.repo}/blob/main/${dir}/DELIVERY-STAGES.md#${stage.id.toLowerCase()}`}) | ${stage.title} | ${plan.tasks.filter(task => task.deliveryStage === stage.id).length} |`).join('\n') +
    `\n\n[逐阶段验收与现有 Issue](https://github.com/${plan.repo}/blob/main/${dir}/DELIVERY-STAGES.md) · [完整任务定义](https://github.com/${plan.repo}/blob/main/${dir}/ISSUES.md)\n`;
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
    const labels=['enhancement',`phase:${t.phase}`,`priority:${t.track==='expand'?'P2':t.phase==='R0'||t.phase==='R1'?'P0':'P1'}`,'status:planned',t.owner==='operator'?'ready-for-human':'needs-triage'];
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

export function validateRemoteTaskState(task, issue, { baselineMerged, blockers = [], acceptanceInputs = [], migrationSnapshot = false }) {
  assert.ok(issue, `${task.id} missing remote issue`);
  const labels = issue.labels.map(label => label.name);
  if (migrationSnapshot || !baselineMerged) {
    assert.equal(issue.state, 'open', `${task.id} must be open before baseline/migration acceptance`);
    assert.ok(labels.includes('status:blocked'), `${task.id} must remain blocked before baseline/migration acceptance`);
    return 'baseline-blocked';
  }
  const openBlockers = blockers.filter(blocker => blocker.state !== 'closed' || blocker.state_reason !== 'completed');
  const unfinishedAcceptance = acceptanceInputs.filter(input => input.state !== 'closed' || input.state_reason !== 'completed');
  if (issue.state === 'closed') {
    assert.equal(issue.state_reason, 'completed', `${task.id} closed without completion; reconcile its planned scope`);
    assert.ok(!labels.some(label => ['status:planned', 'status:blocked', 'status:ready', 'status:in-progress'].includes(label) || label.startsWith('ready-for-')),
      `${task.id} completed with active readiness labels; reconcile tracker lifecycle`);
    // A dependent may have accepted a usable interface while its upstream still has
    // other unfinished scope. Flag the evidence review; never infer runtime acceptance
    // or reopen/mark every downstream blocked merely from whole-Issue state.
    return openBlockers.length || unfinishedAcceptance.length ? 'completion-evidence-review' : 'completed';
  }
  assert.equal(issue.state, 'open', `${task.id} unexpected state`);
  if (labels.some(label => ['status:ready', 'ready-for-agent'].includes(label))) {
    assert.equal(openBlockers.length, 0, `${task.id} active with unresolved native blockers`);
  }
  if (labels.includes('status:in-progress') && openBlockers.length) return 'active-input-review';
  if (labels.includes('status:blocked') && openBlockers.length === 0) return 'readiness-review';
  return 'open';
}

async function verifyNewRemote({ migrationSnapshot = false } = {}){
  validate();const existing=allIssues();
  const baseline = api(`repos/${plan.repo}/pulls/${plan.baselinePr}`);
  const baselineMerged = baseline.merged === true;
  const readinessReview = [];
  const completionEvidenceReview = [], activeInputReview = [];
  for(let start=0;start<plan.tasks.length;start+=8){
    const results=await Promise.allSettled(plan.tasks.slice(start,start+8).map(async t=>{
      const i=existing.find(x=>x.number===t.number);assert.ok(i,`${t.id} missing remote issue`);assert.ok(i.title.startsWith(`[${t.id}] `));assert.equal(i.id,t.databaseId);
      validateRemoteTaskBody(t, i.body, { migrationSnapshot });
      const [deps,parent]=await Promise.all([readApi(`repos/${plan.repo}/issues/${t.number}/dependencies/blocked_by`),readApi(`repos/${plan.repo}/issues/${t.number}/parent`)]);
      assert.deepEqual(deps.map(x=>x.number).sort((a,b)=>a-b),t.blockedBy.map(number).sort((a,b)=>a-b),`${t.id} native deps`);assert.equal(parent.number,plan.parentNumber);
      const acceptanceInputs = (t.acceptanceDependencies ?? []).map(id => {
        const input = existing.find(issue => issue.number === number(id));
        assert.ok(input, `${t.id} missing acceptance input ${id}`);
        assert.ok(i.body.includes(`https://github.com/${plan.repo}/issues/${number(id)}`), `${t.id} missing acceptance link ${id}`);
        return input;
      });
      const state = validateRemoteTaskState(t, i, { baselineMerged, blockers: deps, acceptanceInputs, migrationSnapshot });
      if (state === 'readiness-review') readinessReview.push(t.id);
      if (state === 'completion-evidence-review') completionEvidenceReview.push(t.id);
      if (state === 'active-input-review') activeInputReview.push(t.id);
    }));
    const failures=results.filter(r=>r.status==='rejected');assert.equal(failures.length,0,failures.map(r=>String(r.reason)).join('\n'));
    console.log(`verified new tasks ${Math.min(start+8,plan.tasks.length)}/${plan.tasks.length}`);
  }
  console.log(JSON.stringify({ baselineMerged, migrationSnapshot, readinessReview: readinessReview.sort(), completionEvidenceReview: completionEvidenceReview.sort(), activeInputReview: activeInputReview.sort(), runtimeAcceptance: false, bodyValidation: migrationSnapshot ? 'exact snapshot' : 'current acceptance criteria present; progress and appended history allowed', note: 'Tracker structure only. Open upstream Issues require checking actual interfaces/evidence, not automatic blocking or completion. No labels changed.' }));
  return existing;
}

function readApi(endpoint){return new Promise((resolve,reject)=>execFile('gh',['api',endpoint],{encoding:'utf8',maxBuffer:32*1024*1024},(error,stdout)=>{if(error)return reject(error);try{resolve(JSON.parse(stdout));}catch(e){reject(e);}}));}

async function verifyRemote(){
  const existing=await verifyNewRemote();
  for(const n of Object.keys(plan.oldIssueSuccessors)){const i=existing.find(x=>x.number===Number(n));assert.equal(i?.state,'closed',n);assert.equal(i.state_reason,'not_planned',n);}
  const result={at:new Date().toISOString(),repo:plan.repo,parent:plan.parentNumber,newTasks:plan.tasks.length,closedOld:Object.keys(plan.oldIssueSuccessors).length,nativeDependencies:plan.tasks.reduce((n,t)=>n+t.blockedBy.length,0),acceptanceDependencies:plan.tasks.reduce((n,t)=>n+(t.acceptanceDependencies?.length ?? 0),0),verified:true,runtimeAcceptance:false};
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
