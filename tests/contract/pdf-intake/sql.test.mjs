import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../../supabase/migrations/20261005070000_pdf_intake.sql',import.meta.url),'utf8');
test('PDF migration exposes only disabled closed RPCs and retains original writer hook',()=>{
 assert.doesNotMatch(source,/^\s*grant\s/im);
 assert.match(source,/public\.pdf_intake_v1\(p_action text,p_trip_id uuid,p_input_bytes text,p_expected_epoch bigint\)/);
 assert.match(source,/revoke all on function public\.pdf_intake_v1\(text,uuid,text,bigint\) from public,anon,authenticated,service_role/);
 assert.match(source,/public\.create_trip_proposal_patch\(t\.id,preview->'patch'\)/);
 assert.doesNotMatch(source,/create(?: or replace)? function public\.confirm_and_apply_trip_proposal/);
 assert.match(source,/PDF_WRITER_HOOK_DRIFT/);
});
test('PDF lineage stays marked through expiry, erased payload and ordinary successor rejection',()=>{
 assert.match(source,/PDF_SUCCESSOR_FORBIDDEN/);assert.match(source,/PDF_PROPOSAL_IMMUTABLE/);
 assert.match(source,/create constraint trigger pdf_intake_confirm_event_v1/);
 assert.match(source,/before insert on privacy_private\.trip_deletions/);
 assert.match(source,/after delete on auth\.sessions/);
 assert.match(source,/create table pdf_intake_private\.operations_v1/);
 assert.match(source,/revoke all on all tables in schema pdf_intake_private/);
});
test('PDF export stays on exact existing lease/source and enforces unenrolled partial',()=>{
 assert.match(source,/j:=export_private\.lock_job_v1\(req,true\)/);
 assert.match(source,/export_private\.live_lease_v1\(j,lease,gen\)/);
 assert.match(source,/pdf_material_valid_until>clock_timestamp\(\)/);
 assert.match(source,/pdf_intake_private\.export_commit_v1\(j,p_input->''modules'',lease,gen\)/);
 assert.match(source,/'allUserDataCompleted',false/);
 assert.doesNotMatch(source,/set_config|current_setting|alter .*disable (?:row level security|trigger)/i);
});
