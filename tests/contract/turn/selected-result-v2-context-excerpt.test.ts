import test from 'node:test';import assert from 'node:assert/strict';
import {selectedResultExcerptV2} from '../../../lib/server/turn/native-assistant-context-http.ts';
test('typed five-result excerpts retain supported content rather than empty practical title',()=>{
 assert.match(selectedResultExcerptV2({schemaVersion:'comparison/1',title:'Transport',summary:'Known only'}),/Transport/);
 assert.match(selectedResultExcerptV2({schemaVersion:'journey-draft/1',title:'Shanghai',draft:{version:0,title:'Shanghai',days:[{id:'d',date:'2026-10-03',items:[]}]} }),/1 days.*2026-10-03.*Not a saved Trip/);
 assert.match(selectedResultExcerptV2({schemaVersion:'decision/1',title:'Choose',state:'chosen',chosenOptionId:'jingan',comparisonRef:{artifactId:'id',revision:2}}),/chosen jingan.*r2.*No Trip confirmation/);
 assert.match(selectedResultExcerptV2({schemaVersion:'practical/1',kind:'translation',sourceLocale:'en',targetLocale:'zh',translation:'3号门',backTranslation:'Gate 3'}),/en→zh.*3号门.*Gate 3/);
 assert.match(selectedResultExcerptV2({schemaVersion:'change-proposal-reference/1',proposalRevision:3}),/Unconfirmed.*r3.*No confirm action/);
 assert.throws(()=>selectedResultExcerptV2({schemaVersion:'arbitrary-html',title:'ignored'}));
});
