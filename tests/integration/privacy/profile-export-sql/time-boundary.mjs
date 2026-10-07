// One affected real-source boundary proof, not another full regression matrix.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { ensureFixture } from './fixture.mjs';
import { db } from '../profile-data-sql/replay.mjs';
import { exportCanonical } from '../../../../lib/server/privacy/export-dispatcher.ts';
import { decodeProfileExportPage } from '../../../../lib/server/privacy/profile-export/contract.ts';
const lit=x=>"'"+String(x).replaceAll("'","''")+"'";

export async function verifyTimeBoundary() {
  const owner=randomUUID(),session=randomUUID();
  await db(`insert into auth.users values('${owner}');insert into auth.sessions(id,user_id)values('${session}','${owner}');insert into identity_private.mobile_accounts(owner_id,session_id,epoch)values('${owner}','${session}',1);insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch)values('${owner}','${randomUUID()}','${session}',1);`);
  let item;
  for(const input of ['24:00:00','24:00:00.000000']) {
    await db(`begin;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${owner}';set request.jwt.claims='{"role":"authenticated","is_anonymous":false,"session_id":"${session}"}';set role authenticated;select * from public.save_user_profile('TIME endpoint','balanced','en','USD','mile','fahrenheit',${lit(input)}::time);commit;`);
    assert.equal(await db(`select default_departure_time::text from public.user_profiles where owner_id='${owner}'`),'24:00:00');
    item=JSON.parse(await db(`select export_private.profile_source_v1('${owner}')`));
    assert.equal(item.profile.profile.defaultDepartureTime,'24:00:00');
    const sourceDigest=await db(`select notification_private.hash(${lit(JSON.stringify({snapshot:[item]}))}::jsonb)`);
    assert.equal(sourceDigest,createHash('sha256').update(exportCanonical({snapshot:[item]}),'utf8').digest('hex'));
    const page={schemaVersion:'profile-core-export/1',section:'snapshot',sourceDigest,items:[item],hasMore:false,nextCursor:null,sectionComplete:true};
    assert.ok(decodeProfileExportPage(page,100,owner,Date.now()),'Requires the original Profile owner stable shared TIME endpoint validator');
    console.log('Actual writer/source/TS decoder/digest TIME endpoint PASS: '+input+' -> 24:00:00');
  }
  for(const invalid of ['24:01:00','24:00:00.1','24:00:00.000001','24:00:01','25:00:00']) {
    const row=structuredClone(item.profile);row.profile.defaultDepartureTime=invalid;
    assert.equal(await db(`select export_private.profile_row_valid_v1(${lit(JSON.stringify(row))}::jsonb,'${owner}')`),'f');
  }
  assert.equal(await db('select profile_data_private.schema_v1() and result_data_private.schema_supported_v1() and export_private.profile_hooks_valid_v1()'),'t');
  console.log('TIME negatives and strict source/schema/result/hook identities PASS');
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  assert.equal(process.env.VP_PROFILE_EXPORT_SQL,'1','Only the owned disposable PostgreSQL fixture is authorized');
  let cleanup;
  try {
    await ensureFixture({after(fn){cleanup=fn;}});
    await verifyTimeBoundary();
  } finally { if(cleanup)await cleanup(); }
}
