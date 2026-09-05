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

function body(t) {
  const source = `https://github.com/${plan.repo}/blob/${plan.baselineBranch}`;
  return `## Program\n\n${link('VPJ-00')} · ${t.track === 'expand' ? '后续证据触发任务' : '首发交付任务'}\n\n` +
    `## 用户结果\n\n${t.title}。\n\n${t.acceptance[0]}\n\n` +
    `## 当前基线与开发入口\n\n基线PR：${plan.baselinePr ? '#' + plan.baselinePr : '待发布；此状态为开发阻塞'}。合并前不要从旧main实施新合同。\n` +
    `主报告：[完整统筹方案](${source}/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。\n` +
    `必须阅读：[本任务执行合同](${source}/${dir}/EXECUTION-CONTRACT.md#${t.id.toLowerCase()}) 与 [领域接口](${source}/${t.contract})。\n\n` +
    `## Blocked by\n\n${t.blockedBy.length ? t.blockedBy.map(id => '- ' + link(id)).join('\n') : '无其他任务依赖；仍需基线PR已合并。'}\n\n` +
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
  const header = '# VPJ 新任务队列\n\n生成自 `issue-plan.json`；不要手工改此表。基线合并前全部保持blocked。\n\n';
  const table = '| 任务 | 交付 | 依赖 | Owner | 专注日/观察 | 阶段 |\n| --- | --- | --- | --- | --- | --- |\n' +
    orderedTasks(plan.tasks).map(t=>`| ${link(t.id)} | ${t.title} | ${t.blockedBy.map(link).join(', ') || '仅基线合并'} | ${t.owner} | ${t.effortDays}日；${t.observationWindow} | ${t.track} |`).join('\n');
  save(`${dir}/ISSUES.md`, header + table + '\n\n后续expand必须另有activationEvidence，依赖完成不会自动开放。\n');
  let contracts = '# VPJ Issue 执行合同\n\n生成自issue-plan.json。阅读顺序：Program README→当前Issue→本行→INTERFACES→拥有模块及实际代码。\n\n所有任务另允许自己的artifacts、docsImpact以及本Issue新增合同；这些不授予其他模块重构权限。先执行已有快速验证，再做Issue所需设备/运行验收。Native命令由VPJ-01/56引入；未完成不能跳过后声称真机通过。\n\n';
  for (const t of plan.tasks) {
    save(`${dir}/issue-bodies/${t.id}.md`, body(t));
    contracts += `## ${t.id}\n\n${link(t.id)} — ${t.title}\n\n` +
      `- Owner: ${t.owner}; ${t.effortDays}专注日，${t.observationWindow}\n` +
      `- Blocked by: ${t.blockedBy.map(link).join(', ') || '仅基线合并'}\n` +
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
  save(`${dir}/ISSUE-MIGRATION.md`, '# 旧开放 Issue → 新责任映射\n\n全部旧项按用户授权superseded/not planned关闭，不代表已验收；原body/comments及关系快照保留。两条既有PR #185/#186仍open。\n\n| 旧Issue | 标题 | 新责任 |\n| --- | --- | --- |\n' + snap.map(t=>`| [#${t.number}](${t.url}) | ${t.title} | ${plan.oldIssueSuccessors[String(t.number)].map(link).join(', ')} |`).join('\n')+'\n');
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

function publish(){
  validate();
  const existing=allIssues();
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
  for(const t of orderedTasks(plan.tasks)){
    api(`repos/${plan.repo}/issues/${t.number}`,'PATCH',{body:body(t)});
    const deps=api(`repos/${plan.repo}/issues/${t.number}/dependencies/blocked_by`);
    for(const id of t.blockedBy){const dep=byId.get(id);if(!deps.some(d=>d.number===dep.number))api(`repos/${plan.repo}/issues/${t.number}/dependencies/blocked_by`,'POST',{issue_id:dep.databaseId});}
    let parent=null;
    try { parent=api(`repos/${plan.repo}/issues/${t.number}/parent`); }
    catch(error) { if(!String(error.stderr??'').includes('404')) throw error; }
    if(parent?.number!==plan.parentNumber)api(`repos/${plan.repo}/issues/${plan.parentNumber}/sub_issues`,'POST',{sub_issue_id:t.databaseId});
    console.log(`${t.id} dependencies and parent linked`);
  }
  api(`repos/${plan.repo}/issues/${plan.parentNumber}`,'PATCH',{body:read(`${dir}/program-body.md`)+'\n\n## 新队列\n\n'+plan.tasks.map(t=>'- '+link(t.id)+' '+t.title).join('\n')});
  render();
}

async function closeOld(){
  validate();assert.ok(plan.tasks.every(t=>t.number&&t.databaseId),'new tasks must exist before closing old');
  await verifyNewRemote();
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

async function verifyNewRemote(){
  validate();const existing=allIssues();
  for(let start=0;start<plan.tasks.length;start+=8){
    const results=await Promise.allSettled(plan.tasks.slice(start,start+8).map(async t=>{
      const i=existing.find(x=>x.number===t.number);assert.equal(i?.state,'open',t.id);assert.ok(i.title.startsWith(`[${t.id}] `));assert.equal(i.id,t.databaseId);assert.equal(i.body,body(t),`${t.id} body drift`);
      assert.ok(i.labels.some(l=>l.name==='status:blocked'),`${t.id} must remain blocked before baseline merge`);
      const [deps,parent]=await Promise.all([readApi(`repos/${plan.repo}/issues/${t.number}/dependencies/blocked_by`),readApi(`repos/${plan.repo}/issues/${t.number}/parent`)]);
      assert.deepEqual(deps.map(x=>x.number).sort((a,b)=>a-b),t.blockedBy.map(number).sort((a,b)=>a-b),`${t.id} native deps`);assert.equal(parent.number,plan.parentNumber);
    }));
    const failures=results.filter(r=>r.status==='rejected');assert.equal(failures.length,0,failures.map(r=>String(r.reason)).join('\n'));
    console.log(`verified new tasks ${Math.min(start+8,plan.tasks.length)}/${plan.tasks.length}`);
  }
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
  for(const t of plan.tasks){const i=existing.find(x=>x.number===t.number);assert.ok(i?.title.startsWith(`[${t.id}] `));assert.equal(i.id,t.databaseId);api(`repos/${plan.repo}/issues/${t.number}`,'PATCH',{body:body(t)});console.log(`synced ${t.id}`);}
  render();
}

function syncSelected(){
  validate();
  for(const id of process.argv.slice(3)){
    const t=byId.get(id);assert.ok(t?.number,id);
    const i=api(`repos/${plan.repo}/issues/${t.number}`);assert.ok(i.title.startsWith(`[${t.id}] `));assert.equal(i.id,t.databaseId);
    api(`repos/${plan.repo}/issues/${t.number}`,'PATCH',{body:body(t)});
    const deps=api(`repos/${plan.repo}/issues/${t.number}/dependencies/blocked_by`);
    for(const d of t.blockedBy){const dep=byId.get(d);if(!deps.some(x=>x.number===dep.number))api(`repos/${plan.repo}/issues/${t.number}/dependencies/blocked_by`,'POST',{issue_id:dep.databaseId});}
    console.log(`synced ${id} and added dependencies`);
  }
  render();
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(root,'scripts/vpj-program.mjs')) {
  const cmd=process.argv[2]??'verify';
  if(cmd==='verify')validate();
  else if(cmd==='render')render();
  else if(cmd==='publish')publish();
  else if(cmd==='sync-bodies')syncBodies();
  else if(cmd==='sync-selected')syncSelected();
  else if(cmd==='close-old')await closeOld();
  else if(cmd==='verify-remote')await verifyRemote();
  else throw new Error('Use verify, render, publish, close-old or verify-remote. Mutating commands require explicit task authorization.');
}
