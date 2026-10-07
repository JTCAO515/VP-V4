import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeTurnExportPage,turnExportHandler } from '../../../../lib/server/privacy/turn-data/export.ts';
import { collectCoreExport } from '../../../../lib/server/privacy/export-dispatcher.ts';
import { encryptExportArtifact,decryptExportArtifact } from '../../../../lib/server/privacy/export-artifact.ts';
import { randomBytes } from 'node:crypto';
import { now,actor,id,snapshot,page,lease,operation } from './fixtures.mjs';
const decode=v=>decodeTurnExportPage(v,100,actor.ownerId,now+40000);
const signal=()=>new AbortController().signal;
const group=(s,r)=>s.sources.find(v=>v.relation===r).rows;
test('all actual groups and original input/output are one source-bound owner snapshot',()=>{
  const v=page();assert.ok(decode(v));assert.equal(decode(v).items[0].sources.length,35);
  assert.equal(group(decode(v).items[0],'turn_private.text_content')[0].input_text,'真实用户输入');
  for(const mutate of [s=>s.sources.pop(),s=>s.sources.reverse(),s=>group(s,'public.turns')[0].owner_id=id(99),s=>group(s,'public.turns')[0].secret='secret',
    s=>s.sourceRows.data++,s=>s.sourceAuthorities=[],s=>s.sources[0].rows.push({}),s=>group(s,'turn_private.text_content')[0].thread_id='unknown']) {
    const s=snapshot();mutate(s);assert.equal(decode(page(s)),null);
  }
});
test('retained operation/fence bytes stay finite and original authorities cannot be omitted',()=>{
  const s=snapshot();s.operations=[operation()];s.fences=[{kind:'turn',objectId:id(4),requestId:id(3),createdAt:now+10}];s.sourceRows.operations=1;s.sourceRows.fences=1;assert.ok(decode(page(s)));
  s.operations[0].sourceAuthorities=[{policyId:id(40),consentId:id(41)}];assert.equal(decode(page(s)),null);
  s.sourceAuthorities.push({policyId:id(40),consentId:id(41)});assert.ok(decode(page(s)));
  s.operations[0].decision.receipt={};assert.equal(decode(page(s)),null);
});
test('legacy Turn budget identity preserves exact decimal financial amounts and rejects lossy/foreign values',()=>{
  const s=snapshot(),budget={scope_id:id(60),attempt_id:id(61),task_id:id(4),provider:'qwen',model:'original',price_version:'v1',reserved_micros:'9223372036854775807',actual_micros:'9007199254740993',status:'settled',created_at:new Date(now-100).toISOString(),updated_at:new Date(now-90).toISOString()};
  group(s,'public.model_budget_attempts').push(budget);s.sourceRows.data++;assert.ok(decode(page(s)));
  for(const value of [9007199254740992,'9223372036854775808','01','1e3','-0']) {budget.actual_micros=value;assert.equal(decode(page(s)),null);}
  budget.actual_micros='1';budget.task_id=id(99);assert.equal(decode(page(s)),null);
});
test('actual read progress/source digest/lease do not silently turn outer capacity failure into completion',async()=>{
  const l=lease(),calls=[],handler=turnExportHandler(l,async(a,i)=>{calls.push([a,i]);return page();},()=>now);
  const bundle=await collectCoreExport(l,{turn:handler},{enabled:true,maxPages:1,maxBytes:1000000,pageSize:100},async()=>true,signal(),()=>now);
  const r=bundle.modules.find(m=>m.module==='turn');assert.equal(r.status,'complete');assert.ok(handler.matchesReceipt(r));
  assert.deepEqual(calls[0],['turn_page',{requestId:l.requestId,leaseId:l.leaseId,generation:1,section:'snapshot',cursor:null,limit:100}]);
  const capHandler=turnExportHandler(l,async()=>page(),()=>now),cap=await collectCoreExport(l,{turn:capHandler},{enabled:true,maxPages:1,maxBytes:1200,pageSize:100},async()=>true,signal(),()=>now);
  assert.deepEqual(capHandler.progress(),{pages:1,rows:1,terminalSections:1});assert.equal(capHandler.matchesReceipt(cap?.modules.find(m=>m.module==='turn')),false);
  const key={keyId:'fixture',key:randomBytes(32)},artifact=encryptExportArtifact(bundle,l,key,new Date(now+90000).toISOString());
  assert.ok(artifact);assert.deepEqual(JSON.parse(decryptExportArtifact(artifact,l,key,now).toString('utf8')),bundle);
});
test('changed bytes/digest/cursor under same source lease never requalify a forged snapshot',async()=>{
  let v=page();const h=turnExportHandler(lease(),async()=>v,()=>now);await h.page('snapshot',null,100,signal());
  group(v.items[0],'turn_private.text_content')[0].output_text='changed';await assert.rejects(h.page('snapshot',null,100,signal()));
  v=page(v.items[0]);await assert.rejects(h.page('snapshot',null,100,signal()));
  await assert.rejects(h.page('snapshot',id(90),100,signal()));
});
