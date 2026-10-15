// Diagnostic validation on this owner's fresh PG17; no managed environment emulation.
import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {connect,root} from './db.mjs';
const c=await connect();const source=readFileSync('supabase/migrations/20261015083120_agent005_canonical_place_ask.sql','utf8');const results=[];
try{
 await c.query('begin');await c.query(source);await c.query('rollback');results.push({case:'normal native full append and rollback',result:'PASS'});
 const injected=source.replace('do $guards$',"alter function turn_private.trip_objective_source_erased_v1() cost 101;\ndo $guards$");assert.notEqual(injected,source);
 await c.query('begin');let message;try{await c.query(injected);assert.fail('known metadata drift must fail');}catch(error){message=error.message;assert.match(message,/^CANONICAL_PLACE_LIFECYCLE_GUARD_MISMATCH /);}finally{await c.query('rollback');}
 const detail=JSON.parse(message.slice(message.indexOf('{')));assert.equal(detail.guards.trip_runtime,false);for(const [key,value] of Object.entries(detail.guards))if(key!=='trip_runtime')assert.equal(value,true,key);
 assert.equal(detail.trip_failure.stage,'function_metadata');assert.equal(detail.trip_failure.differences.length,1);assert.equal(detail.trip_failure.differences[0].signature,'turn_private.trip_objective_source_erased_v1()');assert.equal(detail.trip_failure.differences[0].field,'definition');assert.match(detail.trip_failure.differences[0].actual_hash,/^[a-f0-9]{64}$/);assert.ok(message.length<4096);
 results.push({case:'ten true / only Trip runtime false, known cost drift',result:'PASS',details:detail});
 writeFileSync(root+'/ci-trip-diagnostic-local.json',JSON.stringify({results,unknownManagedHashAccepted:false,guardConditionsChanged:false,sourceBodyOrAclEmitted:false,managedSupabaseCause:'UNKNOWN pending official metadata diagnostic'},null,2)+'\n');console.log('TRIP_ONLY_FALSE_LIMITED_DIAGNOSTIC_PASS',JSON.stringify(detail));
}finally{await c.end();}
