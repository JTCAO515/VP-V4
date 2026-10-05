import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NOTIFICATION_DATA_BOUNDARIES,NOTIFICATION_DATA_SCOPES,NOTIFICATION_DATA_LIMITS} from '../../../lib/server/privacy/notification-data/contract.ts';
const sql=readFileSync(new URL('../../../supabase/migrations/20261006030000_notification_data_exit.sql',import.meta.url),'utf8');
test('SQL accepted boundary JSON equals sole TS wire for every selected scope',()=>{
 for(const scope of NOTIFICATION_DATA_SCOPES){const escaped=scope.replaceAll('/','\\/');const match=sql.match(new RegExp("when '"+escaped+"' then '(\\{[^\\n]+\\})'::jsonb"));assert.ok(match,scope);assert.deepEqual(JSON.parse(match[1]),NOTIFICATION_DATA_BOUNDARIES[scope]);}
 assert.equal(NOTIFICATION_DATA_LIMITS.lifetimeMs,30000);assert.match(sql,/expires_at=captured_at\+30000/);
});
test('new authority defaults closed and no source bodies/credentials are persisted',()=>{
 assert.doesNotMatch(sql,/^\s*grant\s/im);assert.doesNotMatch(sql,/set_config|current_setting|disable (?:row level security|trigger)|pg_sleep|elapsedMs/i);
 const ddl=sql.slice(0,sql.indexOf('create function'));assert.doesNotMatch(ddl,/\b(token|reason|body|command|input_bytes|projection|endpoint)\s+(?:text|jsonb)/i);
 assert.match(sql,/revoke all on function public\.privacy_notification_data_v1\(text,text,bigint\),public\.privacy_notification_data_drain_v1\(text,jsonb\)/);
 assert.match(sql,/drain_nonce text/);assert.match(sql,/extensions\.gen_random_bytes\(32\)/);
});
test('permanent identities survive source cascades and old callable signatures are retained',()=>{
 const fences=sql.slice(sql.indexOf('create table notification_exit_private.fences'),sql.indexOf('create index notification_exit_fences_trip'));
 assert.doesNotMatch(fences,/references (?:public\.trips|notification_private)/);assert.match(fences,/primary key\(owner_id,kind,object_id\)/);
 for(const signature of ['public.travel_reminders_v1(uuid,text,jsonb)','public.travel_reminders_v2(uuid,text,jsonb)','public.dispatch_travel_notification_v2(uuid,text,jsonb)','public.poll_travel_notifications_v2(integer)'])assert.ok(sql.includes(signature));
 assert.match(sql,/NOTIFICATION_DATA_SEAM_MISMATCH/);assert.doesNotMatch(sql,/alter function|rename to|drop function/i);
 assert.ok(sql.indexOf("nf:=nf+notification_exit_private.add_fence(r.owner_id,'exit_request',r.request_id")<sql.indexOf('delete from notification_private.attempts'));
});
