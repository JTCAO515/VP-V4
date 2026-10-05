import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const original=readFileSync(new URL('../../../../supabase/migrations/20261005060000_traveler_brief.sql',import.meta.url),'utf8');
const migration=readFileSync(new URL('../../../../supabase/migrations/20261005081000_traveler_brief_export_clock.sql',import.meta.url),'utf8');
test('appended export correction changes only the lease clock observation and preserves the original body',()=>{
 const start=original.indexOf('create function service_brief_private.export(owner uuid,sess uuid,req uuid)');
 const end=original.indexOf('\nend $$;',start)+'\nend $$;'.length;
 const expected=original.slice(start,end)
  .replace('create function service_brief_private.export(','create or replace function service_brief_private.export(')
  .replace("basis jsonb:='[]';n integer;","basis jsonb:='[]';n integer;lease_captured_at timestamptz;")
  .replace(" insert into service_brief_private.export_leases values(owner,sess,req,clock_timestamp(),clock_timestamp()+interval '30 seconds',dig) returning * into lease;", " lease_captured_at:=clock_timestamp();\n insert into service_brief_private.export_leases values(owner,sess,req,lease_captured_at,lease_captured_at+interval '30 seconds',dig) returning * into lease;");
 assert.equal(migration.replace(/^--.*\n/gm,'').trim(),expected);
 assert.match(original,/check\(expires_at-captured_at<=interval '30 seconds'\)/);
 assert.doesNotMatch(migration.replace(/^--.*\n/gm,''),/\b(?:alter|drop|grant|revoke)\b/i);
});
