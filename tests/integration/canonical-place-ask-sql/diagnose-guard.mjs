// Explicit self-owned fixture diagnostic; no default test discovery or target connection.
import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {connect,root} from './db.mjs';
const c=await connect();const source=readFileSync('supabase/migrations/20261015083120_agent005_canonical_place_ask.sql','utf8');
try{
 await c.query('begin');await c.query(source);await c.query('rollback');
 const injected=source.replace('do $guards$begin',"alter table turn_private.grounded_turns drop constraint grounded_selected_place_request_shape;\ndo $guards$begin");assert.notEqual(injected,source);
 await c.query('begin');let message;try{await c.query(injected);assert.fail('known invalid schema must not pass');}catch(error){message=error.message;assert.match(message,/^CANONICAL_PLACE_LIFECYCLE_GUARD_MISMATCH /);}finally{await c.query('rollback');}
 const detail=JSON.parse(message.slice(message.indexOf('{')));const names=['selected_schema','profile_schema','result_infrastructure','result_schema','turn_schema','turn_runtime','conversation_schema','export_hooks','turn_write_hooks','turn_hooks','trip_runtime'];assert.deepEqual(Object.keys(detail.guards).sort(),names.sort());assert.equal(detail.guards.selected_schema,false);assert.equal(detail.guards.trip_runtime,false);assert.ok(Object.values(detail.guards).every(v=>v===true||v===false||v===null));
 assert.equal((await c.query("select count(*)::int n from pg_attribute where attrelid='turn_private.grounded_turns'::regclass and attname='selected_place_request' and not attisdropped")).rows[0].n,0);
 writeFileSync(root+'/ci-diagnostic-local.json',JSON.stringify({normalNativeAppendAndRollback:'PASS',knownMissingCheckStillRejected:'PASS',diagnosticContent:'guard names/booleans and server_version only',details:detail,supabaseFailureCause:'UNKNOWN pending official CI vector'},null,2)+'\n');console.log('STRICT_CONTENT_FREE_GUARD_DIAGNOSTIC_PASS',JSON.stringify(detail));
}finally{await c.end();}
