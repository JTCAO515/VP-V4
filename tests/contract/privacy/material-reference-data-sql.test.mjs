import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../../../supabase/migrations/20261006020000_material_reference_data.sql',import.meta.url),'utf8');
test('selected material RPC ships disabled without rewriting original writer/service lease authority',()=>{
 assert.doesNotMatch(src,/^\s*grant\s/im);
 assert.match(src,/revoke all on function public\.privacy_material_reference_v1\(text,text,bigint\) from public,anon,authenticated,service_role/);
 assert.doesNotMatch(src,/create(?: or replace)? function (?:public\.(?:confirm_and_apply_trip_proposal|confirm_reservation_reference)|pdf_intake_private\.(?:erase|receipt))/i);
 assert.doesNotMatch(src,/set_config|current_setting|disable (?:row level security|trigger)|live_lease_v1|export_private\.lock_job_v1/i);
 assert.match(src,/perform pdf_intake_private\.erase_v1\(u,id_n,true\)/);
});
test('all new source-free retained tables are inventoried; business fences precede source erase',()=>{
 for(const field of ['input_bytes text','command jsonb','fields jsonb','title text','token text','provider text'])assert.ok(!src.slice(0,src.indexOf('create function')).includes(field));
 assert.match(src,/'material-exit-progress\/1'/);
 assert.match(src,/'referenceOperationIds',r\.reference_operation_ids/);
 assert.ok(src.indexOf("select u,'operation',x,req")<src.indexOf('delete from reservation_private.current_v1'));
 assert.match(src,/before insert or update on reservation_private\.current_v1/);
 assert.match(src,/before insert or update on reservation_private\.operations_v1/);
});
test('actual paired wire is explicit; recovery hashes exact UTF8 and preserves immutable original expiry',()=>{
 assert.match(src,/sha256\(convert_to\(v->>'mutationBytes','UTF8'\)\)/);
 assert.match(src,/sha256\(convert_to\(p_input_bytes,'UTF8'\)\)/);
 assert.match(src,/least\(now_ms\+30000,\(sources->>'deadline'\)::bigint\)/);
 assert.match(src,/jsonb_build_array\(to_jsonb\(o\),to_jsonb\(p\),confirmation/);
 assert.match(src,/'allUserDataCompleted',false/);
 assert.match(src,/r\.decided_at>r\.expires_at/);
});
