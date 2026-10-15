import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {db,catalog,relations,gates,output,root} from './kernel.mjs';
const results=[];
const before=await catalog(),tables=await relations();
assert.equal(await db(gates),'t|t|t|t|t');
for(const [label,mutation,expected] of [
 ['unknown Turn runtime function',"create function turn_data_private.ios001_unknown_v1() returns boolean language sql as $$select true$$",'t|t|t|t|f'],
 ['unknown source column',"alter table turn_private.service_tasks add column ios001_unknown text",'f|f|f|f|t'],

]){
 const actual=await db('begin;'+mutation+';'+gates+'rollback;');
 assert.equal(actual,expected,label+' must reject in the known guard');
 results.push({label,actual,result:'PASS'});
 assert.equal(await db(gates),'t|t|t|t|t');assert.deepEqual(await catalog(),before);assert.deepEqual(await relations(),tables);
}
// Tampering a pinned original runtime member is rejected, without adopting its digest.
const original=before.find(f=>f.signature==='turn_data_private.schema_supported_v1()');assert.ok(original);
const drift=original.definition.replace('declare actual_n jsonb;', 'declare actual_n jsonb; -- IOS001 drift\n');assert.notEqual(drift,original.definition);
const actual=await db('begin;'+drift+';'+gates+'rollback;');assert.ok(actual.endsWith('f'));results.push({label:'unknown original schema-function source',actual,result:'PASS'});
assert.deepEqual(await catalog(),before);assert.equal(await db(gates),'t|t|t|t|t');
// Reader body identity is checked against the fixed reviewed source, never a live-catalog adoption.
const names=['turn_private.goal_return_reference_v1(uuid,uuid,uuid,integer,uuid,bigint,bigint)','public.read_goal_return_reference_v1(uuid,uuid,uuid,integer,uuid,bigint,bigint)'];
const originalHashes={"public.read_goal_return_reference_v1(uuid,uuid,uuid,integer,uuid,bigint,bigint)": "01edbf5b8f0cdd9ed73230c6604925079d92d05e6d08ca6ae68267cc90420f7d", "turn_private.goal_return_reference_v1(uuid,uuid,uuid,integer,uuid,bigint,bigint)": "94e86001928c4e289e1034cb63db16b0901318801b27dd5b20faae79e6955532"};
for(const signature of names){const current=before.find(f=>f.signature===signature);assert.ok(current,signature);assert.equal(createHash('sha256').update(current.prosrc).digest('hex'),originalHashes[signature]);assert.equal(current.owner,'postgres');assert.equal(current.securityDefiner,true);assert.ok(current.config.includes('search_path=""'));}
const rolled=await db("begin;drop function public.read_goal_return_reference_v1(uuid,uuid,uuid,integer,uuid,bigint,bigint);drop function turn_private.goal_return_reference_v1(uuid,uuid,uuid,integer,uuid,bigint,bigint);"+gates+"rollback;");assert.equal(rolled,'t|t|t|t|t');assert.deepEqual(await catalog(),before);assert.deepEqual(await relations(),tables);results.push({label:'remove only new readers rollback preserves original guards and tables',result:'PASS'});
const diff=before.filter(f=>names.includes(f.signature));writeFileSync(output('new-functions.actual.json'),JSON.stringify(diff,null,2)+'\n');
writeFileSync(output('catalog-proof.json'),JSON.stringify({results,originalReaderExecutableBodies:'identical',newFunctions:diff.map(f=>({signature:f.signature,sha256:createHash('sha256').update(f.prosrc).digest('hex')})),tablesUnchanged:tables.length},null,2)+'\n');console.log(JSON.stringify(results));
