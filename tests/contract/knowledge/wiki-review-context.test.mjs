import test from 'node:test';
import assert from 'node:assert/strict';
import {wikiReviewTarget,wikiReviewContext} from '../../../lib/server/knowledge/wiki/review-context.ts';
const id='11111111-1111-4111-8111-111111111111';
const target={pageKey:'source:x',revisionId:id,version:2};
const source={id,missing:false,declaration:{sourceKey:'x',revisionLabel:'1',publisher:'Synthetic',uri:'urn:vpj15:synthetic:x',locator:'p1',snippet:'Original text',usageDeclaration:'Synthetic'}};
const read={pageKey:target.pageKey,version:2,revisions:[{id,version:2,draftContent:{summary:'Draft summary',gaps:['Unresolved']},validationStatus:'draft',sources:[source]}]};
test('pinned review context retains canonical source; stale or missing records do not upgrade silently',()=>{
 const context=wikiReviewContext(read,target);assert.deepEqual(context.sources,[{id,declaration:source.declaration}]);assert.deepEqual(context.gaps,['Unresolved']);
 for(const bad of [{...read,version:3},{...read,pageKey:'other'},{...read,revisions:[]},{...read,revisions:[{...read.revisions[0],draftContent:null}]},{...read,revisions:[{...read.revisions[0],validationStatus:'rejected'}]},{...read,revisions:[{...read.revisions[0],sources:[{...source,missing:true}]}]}])assert.equal(wikiReviewContext(bad,target),null);
});
test('ordinary review remains unchanged; malformed pinned target rejects',()=>{
 assert.equal(wikiReviewTarget(''),undefined);assert.equal(wikiReviewTarget('?wikiVersion=2'),null);
 assert.deepEqual(wikiReviewTarget(`?wikiPageKey=source%3Ax&wikiRevisionId=${id}&wikiVersion=2`),target);
});

import {safeReturnTo} from '../../../lib/navigation/safe-return-to.ts';
test('sign-in preserves only a closed pinned Wiki target, never an external redirect',()=>{
 const route=`/ops/review?wikiPageKey=source%3Ax&wikiRevisionId=${id}&wikiVersion=2`;
 assert.equal(safeReturnTo(route),route);assert.equal(safeReturnTo('/ops/wiki'),'/ops/wiki');
 for(const bad of [route+'&next=https://evil.example',route+'&wikiVersion=3',route.replace('wikiVersion=2','wikiVersion=-1'),route.replace(id,'fake'),route+'#fragment','//evil.example/ops/review',route.replace('/ops/review','/visepanda')])assert.equal(safeReturnTo(bad),'/visepanda');
});
