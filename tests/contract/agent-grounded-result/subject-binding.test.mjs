import assert from 'node:assert/strict';
import test from 'node:test';
import { runGroundedAiAssistJob } from '../../../lib/server/knowledge/wiki/grounded-ai-assist-job.ts';
import { runGroundedWikiSearch } from '../../../lib/server/knowledge/wiki/grounded-search.ts';
const turnId='21111111-1111-4111-8111-111111111111';
const provider={provider:'qwen',endpoint:'https://llm-fixture.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions',configurationId:'11111111-1111-1111-1111-111111111111',configurationVersion:1,timeoutMs:5000};
const input={maxRounds:2,maxOutputTokens:300,timeoutMs:5000,provider};
const context={kind:'context',turnId,city:'shanghai',locale:'en',intent:'place_opening_hours',inputText:'When does Fixture Pavilion open?',placeName:'Fixture Pavilion',placeResolution:'matched',placeSubjectId:'fixture_pavilion'};
const row={factId:'fixture-fact',assertionId:'fixture-assertion',assertion:{subjectId:'fixture_pavilion',predicate:'opens_during',objectId:'opening_hours'},sources:[{sourceRevisionId:'fixture-source'}],text:'Fixture Pavilion opens from 09:00 to 17:00.',conditions:['Check the current dated window'],exclusions:['No holiday guarantee']};
function dependencies(currentContext=context){return {contextRpc:async()=>({data:currentContext,error:null}),rpc:async()=>({data:{schemaVersion:'knowledge-read/1',status:'available',statements:[row]},error:null}),credential:()=> 'fixture-only',qwenEndpoint:provider.endpoint,recordDestination:async()=>{},fetch:async()=>Response.json({model:'qwen3.7-plus-2026-05-26',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({action:'answer',coverage:'answered',summary:'Unsupported guarantee must not survive.',citations:[{pageKey:row.factId,quote:row.text}],gaps:[],conflicts:[]})}}],usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}})};}
const signal=()=>new AbortController().signal;
const claimed=async(_,{p_input})=>({data:p_input.action==='ensure'?{kind:'claimed',jobId:'job',claimToken:'lease'}:{kind:'succeeded',jobId:'job'},error:null});
// This is an explicit prerequisite fixture for the owner-authorized context
// projection candidate, not proof the current SQL emits/requalifies these fields.
test('real job initial call consumes an owner-context resolved subject rather than dropping it',async()=>{
 const out=await runGroundedAiAssistJob(turnId,claimed,input,dependencies(),signal());
 assert.equal(out.status,'succeeded');assert.equal(out.outcome.kind,'answered');
 assert.equal(out.outcome.coverage,'answered');assert.ok(out.outcome.summary.includes(row.conditions[0]));assert.ok(!out.outcome.summary.includes('Unsupported'));
});
test('client subject without a matched server context cannot make a place answered',async()=>{
 const {placeSubjectId,placeResolution,...unresolved}=context;
 const out=await runGroundedAiAssistJob(turnId,claimed,{...input,placeSubjectId:'fixture_pavilion'},dependencies(unresolved),signal());
 assert.equal(out.outcome.kind,'unavailable');assert.equal(out.outcome.reason,'user_input_missing');
});
test('real job done replay accepts a requalified matched place context without rerunning the model',async()=>{
 const stored=await runGroundedWikiSearch({...input,intent:{intent:context.intent,requestScope:'single',placeName:context.placeName},placeSubjectId:context.placeSubjectId,question:context.inputText,city:context.city,locale:context.locale},dependencies(),signal());
 let models=0;
 const jobRpc=async()=>({data:{kind:'done',status:'succeeded',outcome:stored},error:null});
 const out=await runGroundedAiAssistJob(turnId,jobRpc,input,{...dependencies(),fetch:async()=>{models++;throw Error('must not call model');}},signal());
 assert.equal(out.status,'succeeded');assert.equal(out.outcome.kind,'answered');assert.equal(models,0);
});
for(const [name,patch] of [['old turn',{turnId:'22222222-2222-4222-8222-222222222222'}],['ambiguous branch',{placeResolution:'ambiguous'}],['unavailable mapping',{kind:'unavailable'}],['invalid subject',{placeSubjectId:'canonical:client-forged'}]]){
 test(`done replay rejects ${name} without querying evidence or running a model`,async()=>{
  const stored=await runGroundedWikiSearch({...input,intent:{intent:context.intent,requestScope:'single',placeName:context.placeName},placeSubjectId:context.placeSubjectId,question:context.inputText,city:context.city,locale:context.locale},dependencies(),signal());
  let reads=0,models=0;
  const out=await runGroundedAiAssistJob(turnId,async()=>({data:{kind:'done',status:'succeeded',outcome:stored},error:null}),{...input,placeSubjectId:context.placeSubjectId},{...dependencies({...context,...patch}),rpc:async()=>{reads++;throw Error('must not read');},fetch:async()=>{models++;throw Error('must not call');}},signal());
  assert.equal(out.status,'not_offered');assert.equal(reads,0);assert.equal(models,0);
 });
}
