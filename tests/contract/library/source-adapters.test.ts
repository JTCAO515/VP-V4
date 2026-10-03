import assert from 'node:assert/strict';
import test from 'node:test';
import {missingSource,projectLibraryMetadata,librarySourceCursor,parseLibrarySourceCursor} from '../../../lib/server/library/source-contract.ts';
import {libraryNativeSourceHTTP} from '../../../lib/server/library/native-sources-http.ts';
const id='12345678-1234-4234-8234-123456789abc';
test('real results/translations metadata projections are bounded; unavailable domains expose no fabricated title/count',()=>{
 assert.equal(missingSource('materials').items,null);assert.equal(missingSource('orders').reason,'DOMAIN_READER_MISSING');
 const results=projectLibraryMetadata('results',{version:2,data:{kind:'result_search',results:[{artifactId:id,revision:2,title:'Result',summary:'Owned',tripId:null}],nextCursor:null}});assert.equal(results?.items?.[0].id,id);assert.equal(results?.items?.[0].revision,2);
 const translation=projectLibraryMetadata('translations',{version:2,kind:'translations',phrases:[{state:'translated',turnId:id,translation:'上海'}],nextCursor:null});assert.equal(translation?.items?.[0].title,'上海');assert.equal(translation?.items?.[0].revision,null);
 assert.equal(projectLibraryMetadata('results',{version:2,data:{kind:'unavailable'}})?.items,null);
});
test('malformed rows/duplicate IDs/leaking cursors cannot leave metadata page',()=>{
 const row={artifactId:id,revision:1,title:'R',summary:'S',tripId:null};for(const bad of [{...row,artifactId:'foreign-string'},{...row,tripId:'notUUID'},{...row,title:'x'.repeat(121)}])assert.equal(projectLibraryMetadata('results',{version:2,data:{kind:'result_search',results:[bad],nextCursor:null}}),null);
 assert.equal(projectLibraryMetadata('results',{version:2,data:{kind:'result_search',results:[row,row],nextCursor:null}}),null);assert.equal(projectLibraryMetadata('results',{version:2,data:{kind:'result_search',results:[row],nextCursor:id}}),null);
});
test('library read surface rejects invalid/extra references and cookies before any outgoing request',async()=>{
 const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('must not call');};try{for(const suffix of ['?source=unknown','?source=results&source=translations','?source=results&ownerId='+id])assert.equal((await libraryNativeSourceHTTP(new Request('http://localhost/library'+suffix))).status,400);assert.equal((await libraryNativeSourceHTTP(new Request('http://localhost/library?source=translations&id='+id+'&revision=1'),true)).status,400);assert.equal((await libraryNativeSourceHTTP(new Request('http://localhost/library?source=results',{headers:{cookie:'unsafe'}}))).status,400);assert.equal(calls,0);}finally{globalThis.fetch=old;}
});

test('source/query-bound opaque cursors cannot be reused for another group or changed query',()=>{
 const c=librarySourceCursor('results','上海',id);assert.equal(parseLibrarySourceCursor(c,'results','上海'),id);assert.equal(parseLibrarySourceCursor(c,'translations','上海'),null);assert.equal(parseLibrarySourceCursor(c,'results','北京'),null);assert.equal(parseLibrarySourceCursor(id,'results','上海'),null);
});
