import assert from 'node:assert/strict';import {randomUUID as uuid} from 'node:crypto';import {writeFileSync} from 'node:fs';
import {prepared,adm} from './completed-fixture.mjs';import {db,call,selected,eraseFor,actor} from './runtime.mjs';
import {decodeResultPreview} from './wire.mjs';
const f=await prepared();console.log('original prepared');const completed=await adm('complete_planning_intake_comparison_v1',f.complete);assert.equal(completed.kind,'published');console.log('original completed');
const a={owner:f.b.owner,session:f.a.session,artifact:f.l.artifactId};const s=selected(a),p=await call(a,{action:'preview',...s});console.log('copies preview',p.eligible,p.conflicts,p.eraseCounts,p.retainCounts);
assert.equal(p.eligible,true);assert.equal(p.graph.executionIds.length,1);assert.equal(p.graph.journalIds.length,1);assert.ok(decodeResultPreview(p,s,actor(a),Date.now()));
const r=await call(a,eraseFor(s,p));assert.equal(r.decision.erasedCounts.executionRuns,1);assert.equal(r.decision.erasedCounts.localJournals,1);
assert.equal(await db(`select count(*) from turn_private.planning_comparisons where artifact_id='${a.artifact}';`),'1');assert.equal(await db(`select count(*) from public.model_budget_attempts where task_id='${f.b.task}' and status='settled';`),'1');
writeFileSync('tests/integration/privacy/result-data-sql/ownproof/copies.json',JSON.stringify({kind:'original worker synthetic source RPC→completed proof→ResultData SQL erase, no provider',preview:p,receipt:r},null,2)+'\n');
