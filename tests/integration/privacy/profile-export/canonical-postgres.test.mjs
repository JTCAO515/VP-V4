// Actual isolated PostgreSQL canonicalization only; not Profile migration/worker/Auth evidence.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { command, sql } from '../../cost/fixtures/postgres-rpc.mjs';
import { exportCanonical } from '../../../../lib/server/privacy/export-dispatcher.ts';
import { decodeProfileExportPage } from '../../../../lib/server/privacy/profile-export/contract.ts';
import { owner, id, now, snapshot, page, operation } from './fixtures.mjs';

const enabled = process.env.VP_TURN_DB_TEST === '1';
const container = 'vp-profile-export-canonical-' + randomUUID().slice(0,8);
let created = false;
const literal = v => "'" + JSON.stringify(v).replaceAll("'", "''") + "'::jsonb";
const db = async q => { const r = await sql(container,q); assert.equal(r.code,0,r.stderr); return r.stdout.trim(); };
before(async () => {
  if (!enabled) return;
  const r = await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh',
    'public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
  assert.equal(r.code,0,r.stderr); created = true;
  for (let n=0;n<100;n++) { if ((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0) break; await new Promise(r=>setTimeout(r,100)); }
  const source = readFileSync('supabase/migrations/20261005030000_reminder_delivery.sql','utf8');
  const original = source.match(/create function notification_private\.canonical\(v jsonb\)[\s\S]*?end \$\$;/)?.[0];
  assert.ok(original,'Actual existing canonical helper must exist');
  await db('create schema notification_private;' + original);
});
after(async () => { if (created) assert.equal((await command('docker',['rm','-f',container])).code,0,'Owned canonical container cleanup'); });
const run = (name, fn) => test(name,{skip:!enabled,timeout:30000},fn);
async function compare(s) {
  assert.ok(decodeProfileExportPage(page(s),100,owner,now()),'Fixture must satisfy actual production source decoder');
  const sections = {snapshot:[s]}, expected = exportCanonical(sections);
  const actual = await db(`select notification_private.canonical(${literal(sections)});`);
  assert.equal(actual,expected);
  assert.equal(createHash('sha256').update(actual,'utf8').digest('hex'),page(s).sourceDigest);
}
run('actual original PG helper matches full owner snapshot including all eleven Profile fields and floors',async()=>{ await compare(snapshot()); });
run('actual PG UTF8 values include supplementary, combining, controls, JSON escapes and every original locale',async()=>{
  for (const displayName of ['汉字😀𐐷e\u0301\u2028\u2029', '\b\f\n\r\t\u0001\u000b\u001f"\\/', '😀'.repeat(80)]) {
    const s=snapshot();s.profile.profile.displayName=displayName;await compare(s);
  }
  for(const locale of ['zh','en','es','ru','ar']) {const s=snapshot();s.profile.profile.locale=locale;await compare(s);}
});
run('actual PG time strings and safe integer boundary retain exact sections digest',async()=>{
  for(const time of ['00:00:00','23:59:59','08:31:02.1','08:31:02.123456']) {const s=snapshot();s.profile.profile.defaultDepartureTime=time;await compare(s);}
  const s=snapshot();Object.assign(s.watermark,{profileRevision:9007199254740990,paceRevision:9007199254740990,profileErasureFloor:9007199254740989,paceErasureFloor:9007199254740989});
  Object.assign(s.profile.summary,s.watermark);delete s.profile.summary.ownerId;s.profile.profile.paceRequest.expectedRevision=9007199254740989;
  await compare(s);
});
run('actual PG captures all stored pace action/state forms and original nullable or absent sources',async()=>{
  for(const action of ['save','pause','revoke','undo']) {
    const s=snapshot(),p=s.profile.profile;
    if(action!=='save') {p.paceRequest={action,operationId:p.paceOperation,expectedRevision:4};p.paceUndo=null;
      s.profile.summary.presentFields=s.profile.summary.presentFields.filter(f=>f!=='pace_undo');s.profile.summary.hasPaceUndo=false;}
    if(action==='pause')s.profile.summary.paceState='paused';
    if(['revoke','undo'].includes(action)) {p.paceNotice=null;s.profile.summary.paceState=action==='revoke'?'revoked':'unset';
      s.profile.summary.presentFields=s.profile.summary.presentFields.filter(f=>f!=='pace_notice');}
    await compare(s);
  }
  const s=snapshot();s.profile=null;s.sourceRows.profiles=0;await compare(s);
  s.watermark=null;s.operations=[];s.sourceRows={profiles:0,watermarks:0,operations:0};await compare(s);
});
run('actual PG covers original operation preview, minimal erase decision and progress selection metadata',async()=>{
  const s=snapshot(),o=operation(12),copies={briefPreviews:[],sharedBriefs:[],scopedEditContexts:[],scopedEditWork:[],recoveryContexts:[],coreExports:[]};
  Object.assign(o,{previewErased:false,summary:s.profile.summary,copies,conflicts:[]});s.operations=[o];s.sourceRows.operations=1;await compare(s);
  const erased=operation(12),decidedAt=erased.capturedAt+100;
  Object.assign(erased,{state:'erased',requestDigest:'d'.repeat(64),decision:{requestDigest:'d'.repeat(64),decidedAt,beforeProfileRevision:8,afterProfileRevision:9,beforePaceRevision:5,afterPaceRevision:6,
    erasedFields:['display_name','travel_pace','locale','currency','distance_unit','temperature_unit','default_departure_time','pace_notice','pace_operation','pace_request','pace_undo'],
    briefCasesInvalidated:[id(30)],retainedCopies:{...copies,coreExports:[id(31)]},clearedPreviews:0,retainedFences:1,sourceProfile:'cleared',paceConsent:'revoked',
    account:'not_modified',sourceTrip:'not_modified',explicitMemory:'not_modified',financialProvider:'not_modified',externalCopies:'not_erased'}});
  s.operations=[erased];await compare(s);
  const progress={...operation(12),scope:'profile-delete-progress/1',profileId:null,objectIds:[id(10)],previewErased:false,summary:null,copies,conflicts:[]};
  s.operations=[progress];await compare(s);
});
run('actual PG raw decimal JSON requires typed normalization; accepted integer projections match TS',async()=>{
  const sections={snapshot:[snapshot()]};
  const raw=JSON.stringify(sections).replace('"expectedRevision":4','"expectedRevision":4.0');
  const value="'"+raw.replaceAll("'","''")+"'::jsonb";
  const unnormalized=await db(`select notification_private.canonical(${value});`);
  assert.notEqual(unnormalized,exportCanonical(sections),'Do not assume numeric scale already equals TS JSON');
  const normalized=await db(`select notification_private.canonical(jsonb_set(v,'{snapshot,0,profile,profile,paceRequest,expectedRevision}',to_jsonb((v#>>'{snapshot,0,profile,profile,paceRequest,expectedRevision}')::numeric::bigint),false)) from (select ${value} v) s;`);
  assert.equal(normalized,exportCanonical(sections));
});
