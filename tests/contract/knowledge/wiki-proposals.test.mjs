import test from 'node:test';
import assert from 'node:assert/strict';
import {conflictsByProposal,detectProposalConflicts,isProposalOutput,isStructuredWikiDraft,resolveProposalOutput} from '../../../lib/server/knowledge/wiki/proposals.ts';
import {runWikiStatementProposalJob} from '../../../lib/server/jobs/wiki-statement-proposal-job.ts';
const id='11111111-1111-4111-8111-111111111111';
const source={id,declaration:{sourceKey:'synthetic',revisionLabel:'1',publisher:'Synthetic',uri:'urn:vpj15:synthetic:proposal',locator:'paragraph 1',snippet:'😀 In Shanghai, bring ID on entry unless exempt.',usageDeclaration:'Synthetic only'}};
const statement={schemaVersion:'knowledge-statement/1',assertion:{subjectId:'museum',predicate:'requires_document',objectId:'id',conditions:['entry'],exclusions:['exempt']},scope:{cities:['shanghai'],scene:'attraction',audience:'international_independent_traveler'},expressions:{zh:{text:'需带证件',conditions:['入场时'],exclusions:['豁免者除外']},en:{text:'Bring ID',conditions:['On entry'],exclusions:['Unless exempt']}}};
const raw={summary:'A synthetic entry rule.',gaps:[],proposals:[{statement,evidence:[{sourceRevisionId:id,quote:'bring ID on entry unless exempt.'}]}]};
test('bounded proposals bind canonical declarations and Unicode code-point offsets',()=>{
 assert.equal(isProposalOutput(raw),true);const stored=resolveProposalOutput(raw,[source]);assert.equal(isStructuredWikiDraft(stored),true);
 assert.deepEqual(stored.statementProposals[0].statement.sources,[source.declaration]);assert.equal(stored.statementProposals[0].evidence[0].startOffset,15);
});
test('invented sources/metadata, missing or repeated quotation and publication authority reject',()=>{
 for(const invalid of [{...raw,published:true},{...raw,proposals:[{...raw.proposals[0],reviewerId:id}]},{...raw,proposals:[{...raw.proposals[0],statement:{...statement,sources:[source.declaration]}}]}])assert.equal(isProposalOutput(invalid),false);
 for(const evidence of [[{sourceRevisionId:'22222222-2222-4222-8222-222222222222',quote:'bring ID'}],[{sourceRevisionId:id,quote:'Invented rule'}]])assert.equal(resolveProposalOutput({...raw,proposals:[{statement,evidence}]},[source]),null);
 assert.equal(resolveProposalOutput({...raw,proposals:[{statement,evidence:[{sourceRevisionId:id,quote:'ID'}]}]},[{...source,declaration:{...source.declaration,snippet:'ID then ID'}}]),null);
 assert.equal(isProposalOutput({...raw,proposals:Array(6).fill(raw.proposals[0])}),false);
 assert.equal(isProposalOutput({...raw,proposals:[{...raw.proposals[0],evidence:[]}]}),false);
});
const provider={provider:'qwen',endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',configurationId:id,configurationVersion:1,timeoutMs:5000};
const input={dataClass:'c0_synthetic',sources:[source],configDigest:'a'.repeat(64),provider,maxOutputTokens:2048,timeoutMs:5000};
const response=output=>Response.json({model:'qwen3.7-plus-2026-05-26',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(output)}}],usage:{prompt_tokens:30,completion_tokens:60,total_tokens:90}});
test('actual worker/protocol path has dedicated prompt, bounded output, no hidden retry',async()=>{
 let calls=0;const result=await runWikiStatementProposalJob(input,{credential:()=> 'synthetic',recordDestination:async()=>{},fetch:async(_u,options)=>{calls++;const body=JSON.parse(options.body);assert.match(body.messages[0].content,/untrusted/);assert.equal(body.max_tokens,2048);assert.equal(body.messages.length,2);return response(raw);}},new AbortController().signal);
 assert.equal(calls,1);assert.equal(result.kind,'succeeded');assert.equal(result.output.schemaVersion,'wiki-draft/2');assert.equal(result.usage.totalTokens,90);
});
test('non-C0, invalid source, pre-cancel and unbound model quote cannot become proposals',async()=>{
 const deps={credential:()=> 'synthetic',recordDestination:async()=>{},fetch:()=>assert.fail('no network')};
 assert.equal((await runWikiStatementProposalJob({...input,dataClass:'c2_sensitive'},deps,new AbortController().signal)).errorCode,'INVALID_INPUT');
 assert.equal((await runWikiStatementProposalJob({...input,sources:[{...source,id:'fake'}]},deps,new AbortController().signal)).errorCode,'INVALID_INPUT');
 const c=new AbortController();c.abort();assert.equal((await runWikiStatementProposalJob(input,deps,c.signal)).kind,'cancelled');
 const bad=await runWikiStatementProposalJob(input,{...deps,fetch:async()=>response({...raw,proposals:[{statement,evidence:[{sourceRevisionId:id,quote:'Invented claim'}]}]})},new AbortController().signal);assert.equal(bad.errorCode,'MODEL_OUTPUT_INVALID');
});
// Structural (non-semantic) conflict detection: two proposals in the same draft
// assert the same {subjectId,predicate} for an overlapping city+scene, but disagree
// on objectId/conditions/exclusions. This is the "surface disagreement to a
// reviewer" logic named as missing in artifacts/VPJ-75/unrun.md.
const sh='shanghai',bj='beijing',scene='public_transport';
const gate=(objectId,city,extra={})=>({schemaVersion:'knowledge-statement/1',assertion:{subjectId:'metro_gate',predicate:'accepts_method',objectId,conditions:[],exclusions:[],...extra.assertion},scope:{cities:[city],scene,audience:'international_independent_traveler'},expressions:{zh:{text:'闸机说明',conditions:[],exclusions:[]},en:{text:'Gate rule',conditions:[],exclusions:[]},...extra.expressions}});
const uid=key=>`${key.charCodeAt(0).toString(16).padStart(8,'0')}-1111-4111-8111-111111111111`;
const src=(key,snippet)=>({id:uid(key),declaration:{sourceKey:key,revisionLabel:'1',publisher:'Synthetic',uri:`urn:vpj15:synthetic:${key}`,locator:'paragraph 1',snippet,usageDeclaration:'Synthetic only'}});
const draftOf=(proposals,sources)=>{const out=resolveProposalOutput({summary:'s',gaps:[],proposals},sources);assert.ok(out,'expected a valid StructuredWikiDraft');return out;};
test('cross-city proposals for the same subject/predicate are never flagged as a conflict',()=>{
 const a=src('a','Contactless bank cards are accepted at metro gates for entry.');
 const b=src('b','Metro gates only accept the Yikatong app for entry.');
 const draft=draftOf([{statement:gate('contactless_bank_card',sh),evidence:[{sourceRevisionId:uid('a'),quote:a.declaration.snippet}]},{statement:gate('yikatong_app',bj),evidence:[{sourceRevisionId:uid('b'),quote:b.declaration.snippet}]}],[a,b]);
 assert.deepEqual(detectProposalConflicts(draft),[]);
});
test('same-city, same-scene proposals that disagree on objectId are flagged',()=>{
 const a=src('a','Contactless bank cards are accepted at metro gates for entry.');
 const c=src('c','An updated notice states metro gates reject all contactless bank cards now.');
 const draft=draftOf([{statement:gate('contactless_bank_card',sh),evidence:[{sourceRevisionId:uid('a'),quote:a.declaration.snippet}]},{statement:gate('no_card_accepted',sh),evidence:[{sourceRevisionId:uid('c'),quote:c.declaration.snippet}]}],[a,c]);
 assert.deepEqual(detectProposalConflicts(draft),[{a:0,b:1,reason:'objectId'}]);
});
test('same objectId with disagreeing conditions or exclusions is flagged, not silently merged',()=>{
 const d=src('d','Metro gates accept contactless bank cards only during morning peak hours.');
 const e=src('e','Metro gates accept contactless bank cards only during evening peak hours.');
 const condA=gate('contactless_bank_card',sh,{assertion:{conditions:['morning_peak']},expressions:{zh:{text:'早高峰',conditions:['早高峰'],exclusions:[]},en:{text:'Morning peak',conditions:['Morning peak'],exclusions:[]}}});
 const condB=gate('contactless_bank_card',sh,{assertion:{conditions:['evening_peak']},expressions:{zh:{text:'晚高峰',conditions:['晚高峰'],exclusions:[]},en:{text:'Evening peak',conditions:['Evening peak'],exclusions:[]}}});
 const draft=draftOf([{statement:condA,evidence:[{sourceRevisionId:uid('d'),quote:d.declaration.snippet}]},{statement:condB,evidence:[{sourceRevisionId:uid('e'),quote:e.declaration.snippet}]}],[d,e]);
 assert.deepEqual(detectProposalConflicts(draft),[{a:0,b:1,reason:'conditions'}]);
 const f=src('f','Contactless bank cards are refused only if the card has expired.');
 const g=src('g','Contactless bank cards are refused only if the card was issued outside China.');
 const exclA=gate('contactless_bank_card',sh,{assertion:{exclusions:['expired_card']},expressions:{zh:{text:'过期卡除外',conditions:[],exclusions:['过期卡除外']},en:{text:'Except expired cards',conditions:[],exclusions:['Except expired cards']}}});
 const exclB=gate('contactless_bank_card',sh,{assertion:{exclusions:['foreign_issued_card']},expressions:{zh:{text:'境外发卡除外',conditions:[],exclusions:['境外发卡除外']},en:{text:'Except foreign-issued cards',conditions:[],exclusions:['Except foreign-issued cards']}}});
 const draft2=draftOf([{statement:exclA,evidence:[{sourceRevisionId:uid('f'),quote:f.declaration.snippet}]},{statement:exclB,evidence:[{sourceRevisionId:uid('g'),quote:g.declaration.snippet}]}],[f,g]);
 assert.deepEqual(detectProposalConflicts(draft2),[{a:0,b:1,reason:'exclusions'}]);
});
test('different subjectId, predicate or scene is never flagged; three-way drafts report every disagreeing pair',()=>{
 const a=src('a','Contactless bank cards are accepted at metro gates for entry.');
 const h=src('h','Bicycle rental deposits are refunded within three business days.');
 const draftUnrelated=draftOf([{statement:gate('contactless_bank_card',sh),evidence:[{sourceRevisionId:uid('a'),quote:a.declaration.snippet}]},{statement:{...gate('deposit_amount',sh),assertion:{subjectId:'bike_rental',predicate:'requires_action',objectId:'deposit_amount',conditions:[],exclusions:[]}},evidence:[{sourceRevisionId:uid('h'),quote:h.declaration.snippet}]}],[a,h]);
 assert.deepEqual(detectProposalConflicts(draftUnrelated),[]);
 const c=src('c','An updated notice states metro gates reject all contactless bank cards now.');
 const threeWay={schemaVersion:'wiki-draft/2',summary:'s',gaps:[],statementProposals:[...draftOf([{statement:gate('contactless_bank_card',sh),evidence:[{sourceRevisionId:uid('a'),quote:a.declaration.snippet}]}],[a]).statementProposals,...draftOf([{statement:gate('no_card_accepted',sh),evidence:[{sourceRevisionId:uid('c'),quote:c.declaration.snippet}]}],[c]).statementProposals,...draftOf([{statement:gate('yikatong_app',bj),evidence:[{sourceRevisionId:uid('b'),quote:'Metro gates only accept the Yikatong app for entry.'}]}],[src('b','Metro gates only accept the Yikatong app for entry.')]).statementProposals]};
 assert.deepEqual(detectProposalConflicts(threeWay),[{a:0,b:1,reason:'objectId'}]);
});
// conflictsByProposal reshapes the flat pair list into a per-index lookup the
// /ops/wiki UI reads directly -- named as the missing wiring in
// artifacts/VPJ-75/unrun.md ("Still not wired into the persisted draft body
// or the /ops/wiki UI").
test('conflictsByProposal is empty for a conflict-free draft',()=>{
 assert.deepEqual(conflictsByProposal([]),new Map());
});
test('conflictsByProposal is symmetric: both indices in a pair see the other side',()=>{
 const map=conflictsByProposal([{a:0,b:1,reason:'objectId'}]);
 assert.deepEqual(map.get(0),[{other:1,reason:'objectId'}]);
 assert.deepEqual(map.get(1),[{other:0,reason:'objectId'}]);
 assert.equal(map.get(2),undefined);
});
test('conflictsByProposal accumulates every pair touching one proposal, order preserved',()=>{
 const map=conflictsByProposal([{a:0,b:1,reason:'objectId'},{a:0,b:2,reason:'conditions'},{a:1,b:2,reason:'exclusions'}]);
 assert.deepEqual(map.get(0),[{other:1,reason:'objectId'},{other:2,reason:'conditions'}]);
 assert.deepEqual(map.get(1),[{other:0,reason:'objectId'},{other:2,reason:'exclusions'}]);
 assert.deepEqual(map.get(2),[{other:0,reason:'conditions'},{other:1,reason:'exclusions'}]);
});
test('conflictsByProposal on a real detected three-way draft matches detectProposalConflicts exactly',()=>{
 const a=src('a','Contactless bank cards are accepted at metro gates for entry.');
 const c=src('c','An updated notice states metro gates reject all contactless bank cards now.');
 const draft={schemaVersion:'wiki-draft/2',summary:'s',gaps:[],statementProposals:[...draftOf([{statement:gate('contactless_bank_card',sh),evidence:[{sourceRevisionId:uid('a'),quote:a.declaration.snippet}]}],[a]).statementProposals,...draftOf([{statement:gate('no_card_accepted',sh),evidence:[{sourceRevisionId:uid('c'),quote:c.declaration.snippet}]}],[c]).statementProposals]};
 const conflicts=detectProposalConflicts(draft);
 assert.deepEqual(conflictsByProposal(conflicts).get(0),[{other:1,reason:'objectId'}]);
});
