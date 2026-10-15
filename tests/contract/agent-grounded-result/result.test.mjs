import assert from 'node:assert/strict';
import test from 'node:test';
import { runGroundedWikiSearch } from '../../../lib/server/knowledge/wiki/grounded-search.ts';
import { runGroundedAiAssistJob } from '../../../lib/server/knowledge/wiki/grounded-ai-assist-job.ts';
import { questionDefinition } from '../../../lib/server/knowledge/claim/questions.ts';
const provider = { provider: 'qwen', endpoint: 'https://llm-fixture.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions', configurationId: '11111111-1111-1111-1111-111111111111', configurationVersion: 1, timeoutMs: 5000 };
const input = { intent: { intent: 'payment_card_and_mobile', requestScope: 'single' }, question: 'How can I pay?', city: 'shanghai', locale: 'en', maxRounds: 2, maxOutputTokens: 300, timeoutMs: 5000, provider };
const claims = questionDefinition(input.intent.intent).claims;
const statements = claims.map((claim, i) => ({ factId: `f${i}`, assertionId: `a${i}`, assertion: claim, sources: [{ sourceRevisionId: `s${i}` }], text: ['Check card acceptance with the merchant.', 'Use supported cards for merchant QR payment.'][i], conditions: [], exclusions: [] }));
const read = (rows) => ({ data: { schemaVersion: 'knowledge-read/1', status: rows.length ? 'available' : 'no_eligible_content', statements: rows }, error: null });
const answer = (rows, extra = {}) => ({ action: 'answer', coverage: 'answered', summary: 'Invented price: 500 dollars.', citations: rows.map(s => ({ pageKey: s.factId, quote: s.text })), gaps: [], conflicts: [], ...extra });
function deps(rows, action = answer(rows), rpc = async () => read(rows)) {
  return { qwenEndpoint: provider.endpoint, credential: () => 'fixture-only', recordDestination: async () => {}, rpc, fetch: async () => Response.json({ model: 'qwen3.7-plus-2026-05-26', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(action) } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }) };
}
const signal = () => new AbortController().signal;
test('claimed answered cannot hide an unresolved required claim or add free prose', async () => {
  const out = await runGroundedWikiSearch(input, deps(statements.slice(0, 1)), signal());
  assert.equal(out.kind, 'answered'); assert.equal(out.coverage, 'partial');
  assert.equal(out.summary, statements[0].text); assert.ok(out.gaps.some(g => g.includes(claims[1].objectId)));
});
test('complete OPS_CONFLICT cannot display succeeded', async () => {
  const rpc = async (_, {p_input}) => p_input.action === 'ensure' ? { data: { kind: 'claimed', jobId: 'job', claimToken: 'lease' }, error: null } : { data: null, error: { message: 'OPS_CONFLICT' } };
  const out = await runGroundedAiAssistJob('turn', rpc, input, { ...deps(statements), contextRpc: async () => ({ data: { kind: 'context', city: 'shanghai', locale: 'en', intent: input.intent.intent, inputText: input.question, placeName: null }, error: null }) }, signal());
  assert.notEqual(out.status, 'succeeded');
});
export { input, claims, statements, read, answer, deps, signal };
for (const locale of ['zh', 'en']) {
  test(`${locale}: complete multiple obligations cannot be refused by a model no-content assertion`, async () => {
    const full = statements.map((s,i) => ({ ...s, text: locale === 'zh' ? ['请先核实商户是否接受银行卡。', '请使用受支持的银行卡进行商户二维码付款。'][i] : s.text }));
    const out = await runGroundedWikiSearch({ ...input, locale }, deps(full, answer([], { coverage: 'no_content', summary: 'No answer.', gaps: ['no evidence'] })), signal());
    assert.equal(out.kind, 'answered'); assert.equal(out.coverage, 'answered');
    assert.equal(out.evidence.required.filter(c => c.status === 'covered').length, 2);
    assert.equal(out.summary, full.map(s => s.text).join('\n'));
  });
}
for (const [name, patch] of [
  ['unknown fact', a => ({ ...a, citations: [{ pageKey: 'unknown', quote: 'fake' }] })],
  ['wrong quote', a => ({ ...a, citations: [{ pageKey: 'f0', quote: 'guaranteed free' }] })],
]) test(name, async () => {
  const out = await runGroundedWikiSearch(input, deps(statements, patch(answer(statements))), signal());
  assert.equal(out.kind, 'unavailable'); assert.ok(!JSON.stringify(out).includes('private dispute'));
});
test('wrong subject cannot satisfy an exact required triple', async () => {
  const wrong = [{ ...statements[0], assertion: { ...statements[0].assertion, subjectId: 'another_subject' } }];
  assert.equal((await runGroundedWikiSearch(input, deps(wrong), signal())).kind, 'unavailable');
});
for (const name of ['expired', 'source-revoked', 'missing', 'wrong-scope']) test(`display recheck excludes ${name} evidence`, async () => {
  let reads = 0;
  const out = await runGroundedWikiSearch(input, deps(statements, answer(statements), async () => read(++reads === 1 ? statements : [])), signal());
  assert.equal(reads, 2); assert.equal(out.kind, 'unavailable');
});
test('different projected wording remains unresolved under the existing variant gate, without asserting semantic contradiction', async () => {
  const alternative = { ...statements[0], factId: 'other', assertionId: 'other-a', text: 'Ask the merchant whether card payments are supported.' };
  const rows = [...statements, alternative];
  const out = await runGroundedWikiSearch(input, deps(rows), signal());
  assert.equal(out.kind, 'answered'); assert.equal(out.coverage, 'partial'); assert.equal(out.summary, statements[1].text); assert.ok(out.conflicts[0].includes(claims[0].objectId));
});
test('unlocalized model disagreement retains reliable statements with explicit uncertainty and no free model conflict prose', async () => {
  const rows = [...statements, { ...statements[0], factId:'other', assertionId:'other-a',text:'Card acceptance varies by merchant.' }];
  const out = await runGroundedWikiSearch(input,deps(rows,answer(rows,{conflicts:['Invented private dispute']})),signal());
  assert.equal(out.kind,'answered');assert.equal(out.coverage,'partial');assert.equal(out.summary,statements[1].text);
  assert.ok(out.conflicts.length);assert.ok(out.gaps.length);assert.ok(!JSON.stringify(out).includes('private dispute'));
});
test('same fact with two agreeing published evidence chains stays answerable', async () => {
  const rows = [...statements, { ...statements[0], factId: 'support', assertionId: 'support-a', sources: [{sourceRevisionId:'support-s'}] }];
  const out = await runGroundedWikiSearch(input, deps(rows), signal());
  assert.equal(out.kind, 'answered'); assert.equal(out.coverage, 'answered'); assert.equal(out.evidence.required[0].refs.length, 2);
});
test('conditions and exclusions cannot be removed by model summary or quote', async () => {
  const rows = [{ ...statements[0], conditions: ['Only at participating merchants'], exclusions: ['No cash withdrawal'] }, statements[1]];
  const out = await runGroundedWikiSearch(input, deps(rows), signal());
  assert.match(out.summary, /Only at participating merchants/); assert.match(out.summary, /No cash withdrawal/); assert.ok(!out.summary.includes('500'));
});
const context = { kind: 'context', city: input.city, locale: input.locale, intent: input.intent.intent, inputText: input.question, placeName: null };
for (const [name, reply] of [
  ['error', () => ({data:null,error:{message:'OPS_CONFLICT'}})],
  ['throw', () => {throw Error('private text must not leak');}],
  ['unknown', () => ({data:null,error:null})],
  ['wrong job', () => ({data:{kind:'succeeded',jobId:'other'},error:null})],
  ['wrong status', () => ({data:{kind:'failed',jobId:'job'},error:null})],
  ['cancelled', () => ({data:{kind:'cancelled',jobId:'job'},error:null})],
]) test(`completion ${name}: no successful display, one model call and one completion only`, async () => {
  let completes=0, models=0;
  const d=deps(statements); const transport=d.fetch;
  const jobRpc=async (_, {p_input}) => p_input.action==='ensure' ? {data:{kind:'claimed',jobId:'job',claimToken:'lease'},error:null} : (completes++, reply());
  const out=await runGroundedAiAssistJob('turn',jobRpc,input,{...d,fetch:async(...args)=>{models++; return transport(...args);},contextRpc:async()=>({data:context,error:null})},signal());
  assert.equal(out.status,'pending'); assert.equal(completes,1);assert.equal(models,1); assert.ok(!JSON.stringify(out).includes('private'));
});
test('explicit receipt succeeds; a subsequent done poll does not run the model again', async () => {
  let saved;let models=0;let completes=0;
  const d=deps(statements);const fetch=d.fetch;
  const jobRpc=async(_,{p_input})=>p_input.action==='ensure' ? {data:saved ? {kind:'done',status:'succeeded',outcome:saved} : {kind:'claimed',jobId:'job',claimToken:'lease'},error:null} : (completes++,saved=p_input.outcome.result,{data:{kind:'succeeded',jobId:'job'},error:null});
  const dependencies={...d,fetch:async(...args)=>{models++;return fetch(...args);},contextRpc:async()=>({data:context,error:null})};
  assert.equal((await runGroundedAiAssistJob('turn',jobRpc,input,dependencies,signal())).status,'succeeded');
  assert.equal((await runGroundedAiAssistJob('turn',jobRpc,input,dependencies,signal())).status,'succeeded');
  assert.equal(models,1);assert.equal(completes,1);
});
test('cancellation after model reply never completes successfully', async () => {
  const controller=new AbortController();let completes=0;
  const d=deps(statements);const transport=d.fetch;
  const rpc=async(_,{p_input})=>p_input.action==='ensure'?{data:{kind:'claimed',jobId:'job',claimToken:'lease'},error:null}:(completes++,{data:{kind:'succeeded',jobId:'job'},error:null});
  const out=await runGroundedAiAssistJob('turn',rpc,input,{...d,fetch:async(...args)=>{const value=await transport(...args);controller.abort();return value;},contextRpc:async()=>({data:context,error:null})},controller.signal);
  assert.equal(out.status,'cancelled');assert.equal(completes,0);
});
test('done answer is rechecked after source withdrawal without a new model or completion', async () => {
  const original=await runGroundedWikiSearch(input,deps(statements),signal());
  let models=0,completes=0;
  const rpc=async(_,{p_input})=>{assert.equal(p_input.action,'ensure');return {data:{kind:'done',status:'succeeded',outcome:original},error:null};};
  const out=await runGroundedAiAssistJob('turn',rpc,input,{...deps([],undefined),fetch:async()=>{models++;throw Error('must not run');},contextRpc:async()=>({data:context,error:null})},signal());
  assert.equal(out.status,'succeeded'); assert.equal(out.outcome.kind,'unavailable');assert.equal(models,0);assert.equal(completes,0);
});
test('done legacy invented summary is replaced with current evidence text without running the model', async () => {
  const original=await runGroundedWikiSearch(input,deps(statements),signal());original.summary='Guaranteed free cash everywhere.';
  const rpc=async()=>({data:{kind:'done',status:'succeeded',outcome:original},error:null});
  const out=await runGroundedAiAssistJob('turn',rpc,input,{...deps(statements),fetch:async()=>{throw Error('must not run');},contextRpc:async()=>({data:context,error:null})},signal());
  assert.equal(out.outcome.kind,'answered');assert.equal(out.outcome.summary,statements.map(s=>s.text).join('\n'));
});
test('unknown completion followed by a server pending poll does not repeat model or complete', async () => {
  let ensures=0,models=0,completes=0;const d=deps(statements);const fetch=d.fetch;
  const rpc=async(_,{p_input})=>p_input.action==='ensure'?{data:++ensures===1?{kind:'claimed',jobId:'job',claimToken:'lease'}:{kind:'pending'},error:null}:(completes++,{data:null,error:null});
  const dependencies={...d,fetch:async(...args)=>{models++;return fetch(...args);},contextRpc:async()=>({data:context,error:null})};
  for(let poll=0;poll<2;poll++)assert.equal((await runGroundedAiAssistJob('turn',rpc,input,dependencies,signal())).status,'pending');
  assert.equal(models,1);assert.equal(completes,1);
});
test('long canonical statements keep every condition and exclusion within eight whole citation entries', async () => {
  const rows=statements.map((s,i)=>({...s,text:s.text+' '+`Evidence ${i} `.repeat(210),conditions:['Only under stated conditions'],exclusions:['No additional guarantee']}));
  const action=answer(rows,{citations:rows.map(s=>({pageKey:s.factId,quote:s.text.slice(0,50).trim()}))});
  const out=await runGroundedWikiSearch(input,deps(rows,action),signal());
  assert.equal(out.kind,'answered');assert.equal(out.coverage,'answered');assert.ok(out.summary.length>1200);assert.ok(out.summary.length<=8*4000+7);
  for(const s of rows)assert.ok(out.summary.includes(s.text+'. '+s.conditions[0]+'. '+s.exclusions[0]));
});
test('bounded direct lookup reserves one result per obligation before repeated supporting sources', async () => {
  const rows=[...Array.from({length:15},(_,i)=>({...statements[0],factId:`repeat-${i}`,assertionId:`repeat-a-${i}`})),statements[1]];
  const out=await runGroundedWikiSearch(input,deps(rows,answer([],{coverage:'no_content',summary:'No information'})),signal());
  assert.equal(out.coverage,'answered');assert.equal(out.citations.length,8);assert.equal(out.evidence.required[1].status,'covered');
});
test('malformed persisted answer is failed without model or completing', async () => {
  const rpc=async()=>({data:{kind:'done',status:'succeeded',outcome:{kind:'answered',summary:'Unverified'}},error:null});
  const out=await runGroundedAiAssistJob('turn',rpc,input,{...deps(statements),contextRpc:async()=>{throw Error('must not call');}},signal());
  assert.deepEqual(out,{status:'failed',errorCode:'MALFORMED_OUTCOME'});
});
test('explicit first-party resolved place subject with complete required facts answers; missing subject remains unavailable', async () => {
  const placeInput={...input,intent:{intent:'place_address_and_hours',requestScope:'single',placeName:'Fixture Pavilion'},placeSubjectId:'fixture_pavilion'};
  const rows=questionDefinition(placeInput.intent.intent,placeInput.placeSubjectId).claims.map((claim,i)=>({...statements[i],assertion:claim}));
  const out=await runGroundedWikiSearch(placeInput,deps(rows),signal());
  assert.equal(out.kind,'answered');assert.equal(out.coverage,'answered');assert.equal(out.evidence.required.length,2);
  const {placeSubjectId,...unresolved}=placeInput;
  assert.deepEqual(await runGroundedWikiSearch(unresolved,deps(rows),signal()),{kind:'unavailable',reason:'user_input_missing'});
  assert.deepEqual(await runGroundedWikiSearch({...placeInput,placeSubjectId:'other_pavilion'},deps(rows),signal()),{kind:'unavailable',reason:'retrieval_miss'});
});
test('resolved place partial answer retains reliable claim and names the missing obligation', async () => {
  const placeInput={...input,intent:{intent:'place_address_and_hours',requestScope:'single',placeName:'Fixture Pavilion'},placeSubjectId:'fixture_pavilion'};
  const claim=questionDefinition(placeInput.intent.intent,placeInput.placeSubjectId).claims[0];
  const rows=[{...statements[0],assertion:claim}];
  const out=await runGroundedWikiSearch(placeInput,deps(rows),signal());
  assert.equal(out.kind,'answered');assert.equal(out.coverage,'partial');assert.ok(out.gaps[0].includes('opening_hours'));
});
test('a valid background citation cannot hide complete exact obligations from bounded fallback', async () => {
  const background={...statements[0],factId:'background',assertionId:'background-a',assertion:{...statements[0].assertion,subjectId:'other_subject'}};
  const rows=[...statements,background];
  const out=await runGroundedWikiSearch(input,deps(rows,answer([background])),signal());
  assert.equal(out.kind,'answered');assert.equal(out.coverage,'answered');assert.equal(out.evidence.required.filter(c=>c.status==='covered').length,2);
});
test('model omission of a current place evidence variant cannot assert full coverage', async () => {
  const placeInput={...input,intent:{intent:'place_address_and_hours',requestScope:'single',placeName:'Fixture Pavilion'},placeSubjectId:'fixture_pavilion'};
  const required=questionDefinition(placeInput.intent.intent,placeInput.placeSubjectId).claims;
  const rows=required.map((claim,i)=>({...statements[i],assertion:claim,text:i?'Open from 09:00 to 17:00.':'Address: Fixture Road 1.'}));
  const variant={...rows[1],factId:'hours-variant',assertionId:'hours-variant-a',text:'Open from 11:00 to 18:00.'};
  const out=await runGroundedWikiSearch(placeInput,deps([...rows,variant],answer(rows)),signal());
  assert.equal(out.kind,'answered');assert.equal(out.coverage,'partial');assert.equal(out.summary,rows[0].text);
  assert.equal(out.evidence.required[1].status,'unresolved');assert.ok(out.conflicts.some(c=>c.includes('opening_hours')));
});
test('variant guard compares assertion qualifiers outside the model-selected citation', async () => {
  const rows=[...statements,{...statements[0],factId:'qualified',assertionId:'qualified-a',assertion:{...statements[0].assertion,conditions:['reservation_required']}}];
  const out=await runGroundedWikiSearch(input,deps(rows,answer(statements)),signal());
  assert.equal(out.coverage,'partial');assert.equal(out.summary,statements[1].text);assert.equal(out.evidence.required[0].status,'unresolved');
});
test('structured value differences cannot be hidden by identical localized text', async () => {
  const placeInput={...input,intent:{intent:'place_address_and_hours',requestScope:'single',placeName:'Fixture Pavilion'},placeSubjectId:'fixture_pavilion'};
  const required=questionDefinition(placeInput.intent.intent,placeInput.placeSubjectId).claims;
  const rows=required.map((claim,i)=>({...statements[i],assertion:claim,...(i?{value:{startsAt:'2026-10-15T01:00:00Z',endsAt:'2026-10-15T09:00:00Z',timeZone:'Asia/Shanghai'}}:{})}));
  const variant={...rows[1],factId:'value-variant',assertionId:'value-variant-a',value:{...rows[1].value,startsAt:'2026-10-15T03:00:00Z'}};
  const out=await runGroundedWikiSearch(placeInput,deps([...rows,variant],answer(rows)),signal());
  assert.equal(out.coverage,'partial');assert.equal(out.summary,rows[0].text);assert.equal(out.evidence.required[1].status,'unresolved');
});
test('projected variants use JSONB object equality rather than JavaScript property order', async () => {
  const assertion=statements[0].assertion;
  const support={...statements[0],factId:'ordered',assertionId:'ordered-a',assertion:{objectId:assertion.objectId,predicate:assertion.predicate,subjectId:assertion.subjectId}};
  const out=await runGroundedWikiSearch(input,deps([...statements,support]),signal());
  assert.equal(out.coverage,'answered');assert.equal(out.evidence.required[0].refs.length,2);
});
test('fallback does not grant new evidence to a persisted result after its own sources were revoked', async () => {
  const stored=await runGroundedWikiSearch(input,deps(statements),signal());
  const replacements=statements.map((s,i)=>({...s,factId:`new-${i}`,assertionId:`new-a-${i}`}));
  const rpc=async()=>({data:{kind:'done',status:'succeeded',outcome:stored},error:null});
  const out=await runGroundedAiAssistJob('turn',rpc,input,{...deps(replacements),fetch:async()=>{throw Error('must not run');},contextRpc:async()=>({data:context,error:null})},signal());
  assert.equal(out.outcome.kind,'unavailable');
});
test('fallback filters eight withdrawn publications before capping so a ninth original current source answers', async () => {
  const single={...input,intent:{intent:'payment_card_acceptance',requestScope:'single'}};
  const original=Array.from({length:9},(_,i)=>({...statements[0],factId:`publication-${i}`,assertionId:`assertion-${i}`}));
  const background={...statements[0],factId:'background-nine',assertionId:'background-nine-a',assertion:{...statements[0].assertion,subjectId:'other_subject'}};
  let reads=0,models=0;
  const d=deps([...original,background],answer([background]),async()=>read(++reads===1?[...original,background]:[original[8],background]));
  const transport=d.fetch;
  const out=await runGroundedWikiSearch(single,{...d,fetch:async(...args)=>{models++;return transport(...args);}},signal());
  assert.equal(out.kind,'answered');assert.equal(out.coverage,'answered');assert.equal(out.summary,original[8].text);
  assert.deepEqual(out.citations,[{pageKey:original[8].factId,quote:original[8].text}]);
  assert.equal(out.evidence.required[0].refs[0].publicationId,original[8].assertionId);
  assert.equal(reads,2);assert.equal(models,1);
});
