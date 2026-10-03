import assert from 'node:assert/strict';
import test from 'node:test';
import {parseResultContent,parseResultEvidenceRefs} from '../../../lib/server/artifacts/result-content.ts';
const id='12345678-1234-4234-8234-123456789abc';
const comparison={schemaVersion:'comparison/1',title:'Areas',summary:'Rail only',options:[{id:'a',title:'A',tradeoff:'Unknown'},{id:'b',title:'B',tradeoff:'Unknown'}],actions:[]};
const journey={schemaVersion:'journey-draft/1',title:'Draft',summary:'Not saved',draft:{version:0,title:'Shanghai',days:[{id:'day1',date:'2026-10-03',items:[{id:'item1',dayId:'day1',title:'Visit'}]}]},source:{kind:'task_output',taskTurnId:id},actions:[]};
const decision={schemaVersion:'decision/1',title:'Choose',summary:'Owner choice only',comparisonRef:{artifactId:id,revision:1},state:'pending',chosenOptionId:null,actions:[]};
const practical={schemaVersion:'practical/1',kind:'translation',sourceTurnId:id,sourceLocale:'en',targetLocale:'zh',translation:'上海',backTranslation:'Shanghai',actions:[]};
test('all five typed inert contents are closed; unknown schema/actions and confirmation copy reject',()=>{
 for(const value of [comparison,journey,decision,practical,{schemaVersion:'change-proposal-reference/1',proposalId:id,proposalRevision:1,actions:[]}]){assert.ok(parseResultContent(value));assert.equal(parseResultContent({...value,url:'https://example.test'}),null);assert.equal(parseResultContent({...value,actions:[{kind:'confirm'}]}),null);}
 assert.equal(parseResultContent({...journey,patch:{operations:[]}}),null);assert.equal(parseResultContent({...comparison,schemaVersion:'future/1'}),null);
});
test('draft domain invariants and explicit decision shape reject malformed data',()=>{
 assert.equal(parseResultContent({...journey,draft:{...journey.draft,confirmPayload:{}}}),null);assert.equal(parseResultContent({...journey,draft:{...journey.draft,days:[{id:'x',date:'2026-02-30'}]}}),null);
 assert.equal(parseResultContent({...decision,state:'chosen'}),null);assert.ok(parseResultContent({...decision,state:'chosen',chosenOptionId:'a'}));assert.equal(parseResultContent({...decision,state:['pending']}),null);
 assert.equal(parseResultContent({...practical,kind:'arbitrary_tool'}),null);assert.equal(parseResultContent({...practical,targetLocale:'en'}),null);
});
test('evidence uses canonical v6 descriptor with no copied quote or invented source revision',()=>{
 const ref={factId:'canonical-fact',assertionId:id,assertionRevision:2,city:'shanghai',scene:'rail'};assert.deepEqual(parseResultEvidenceRefs([ref]),[ref]);assert.deepEqual(parseResultEvidenceRefs([]),[]);
 for(const bad of [{...ref,quote:'source body'},{...ref,assertionRevision:0},{...ref,city:['shanghai']},{...ref,scene:'invented'}])assert.equal(parseResultEvidenceRefs([bad]),null);assert.equal(parseResultEvidenceRefs([ref,ref]),null);
});
