import test from 'node:test';
import assert from 'node:assert/strict';
import { completeWikiGenerationJob } from '../../../lib/server/jobs/wiki-generation-complete.ts';
import { runWikiGenerationJob } from '../../../lib/server/jobs/wiki-generation-job.ts';
const metadata = {operationId:'11111111-1111-4111-8111-111111111111',jobId:'22222222-2222-4222-8222-222222222222',expectedVersion:2,sourceRevisionIds:['33333333-3333-4333-8333-333333333333'],statementRefs:[],promptVersion:'vp-wiki-generation-v1',configDigest:'a'.repeat(64),generatedAt:'2026-09-14T00:00:00Z',changeNote:'A new draft'};
test('worker output including >400 character body and all gaps reaches complete intact; retry keeps original receipt identity', async () => {
  const output={summary:'中'.repeat(600),gaps:['甲'.repeat(160),'An unresolved condition.']};
  let network=0;
  const outcome=await runWikiGenerationJob({pageType:'source_summary',pageKey:'source_summary:unit',sourceText:'Controlled synthetic material',promptVersion:metadata.promptVersion,configDigest:metadata.configDigest,maxOutputTokens:1024,timeoutMs:5000,provider:{provider:'qwen',endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',configurationId:metadata.operationId,configurationVersion:1,timeoutMs:5000}}, {
    credential:()=> 'synthetic',recordDestination:async()=>{},fetch:async()=>{network++;return Response.json({model:'qwen3.7-plus-2026-05-26',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(output)}}],usage:{prompt_tokens:10,completion_tokens:200,total_tokens:210}});}
  },new AbortController().signal);
  assert.equal(outcome.kind,'succeeded');
  const calls=[]; const rpc={call:async(name,input)=>{calls.push({name,input});return {data:{kind:'succeeded'},error:null};}};
  await completeWikiGenerationJob(rpc,metadata,outcome); await completeWikiGenerationJob(rpc,metadata,outcome);
  assert.equal(network,1);assert.deepEqual(calls[0],calls[1]);
  assert.deepEqual(calls[0].input.p_input.outcome.draftContent,output);
  assert.equal(calls[0].input.p_input.outcome.costTokens,210);
  assert.equal(calls[0].input.p_input.outcome.changeNote,metadata.changeNote);
});
test('failure/cancel outcomes do not manufacture body or known cost',async()=>{
  for(const outcome of [{kind:'failed',errorCode:'MODEL_OUTPUT_INVALID'},{kind:'cancelled'}]){
    await completeWikiGenerationJob({call:async(_name,input)=>{assert.deepEqual(input.p_input.outcome,outcome);return {data:null,error:null};}},metadata,outcome);
  }
});
test('invalid output cannot reach persistence even through an untyped caller',()=>{
  for(const output of [{summary:'\n',gaps:[]},{summary:'😀'.repeat(301),gaps:[]},{summary:'ok',gaps:['\tbad']},{summary:'ok',gaps:[],reviewerId:'invented'}]){
    assert.throws(()=>completeWikiGenerationJob({call:()=>assert.fail('no RPC')},metadata,{kind:'succeeded',output,usage:{totalTokens:1}}),/INVALID_INPUT/);
  }
});
