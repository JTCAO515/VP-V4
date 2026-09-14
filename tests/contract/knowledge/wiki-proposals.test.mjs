import test from 'node:test';
import assert from 'node:assert/strict';
import {isProposalOutput,isStructuredWikiDraft,resolveProposalOutput} from '../../../lib/server/knowledge/wiki/proposals.ts';
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
