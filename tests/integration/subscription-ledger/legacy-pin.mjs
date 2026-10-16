import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export const pins=JSON.parse(readFileSync(new URL('../../../lib/server/entitlements/subscription-ledger/cross-ledger-pins.json',import.meta.url),'utf8'));
export async function legacyPin(db){
 return (await db.query(`select pg_get_functiondef(p.oid) as definition,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as source_sha256,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') as definition_sha256,
 jsonb_build_object('owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'language',l.lanname,'kind',p.prokind,'volatility',p.provolatile,'parallel',p.proparallel,'securityDefiner',p.prosecdef,'strict',p.proisstrict,'leakproof',p.proleakproof,'returnsSet',p.proretset,'result',pg_get_function_result(p.oid),'arguments',pg_get_function_arguments(p.oid),'identity',pg_get_function_identity_arguments(p.oid),'config',p.proconfig,'cost',p.procost,'rows',p.prorows,'support',p.prosupport::text,'binary',p.probin,'sqlBody',p.prosqlbody::text) as metadata
 from pg_proc p join pg_language l on l.oid=p.prolang where p.oid='public.storekit_apply_verified_v1(jsonb)'::regprocedure`)).rows[0];
}
export async function assertLegacyPin(db,phase){assert.deepEqual(await legacyPin(db),pins[phase]);}
