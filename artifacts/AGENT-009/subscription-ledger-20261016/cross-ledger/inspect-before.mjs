import {createOwnedPg} from '../../../../tests/integration/ios004-user-address/owned-pg.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
const resource=createOwnedPg({bin:'/opt/homebrew/opt/postgresql@17/bin',module:'/Users/jtsm5p/Documents/Codex/2026-10-13/v10-main/agent008-pg-client-20261015/node_modules/pg/lib/index.js'});
try{
 resource.start();const db=await resource.connect();
 await db.query("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create function auth.uid() returns uuid language sql as 'select null::uuid'; create function auth.role() returns text language sql as 'select current_setting(''request.jwt.claim.role'',true)';");
 await db.query(readFileSync('supabase/migrations/20260926113804_vpj34_storekit_grants.sql','utf8'));
 const {rows}=await db.query(`select pg_get_functiondef(p.oid) as definition, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as source_sha256,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') as definition_sha256,
 jsonb_build_object('owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'language',l.lanname,'kind',p.prokind,'volatility',p.provolatile,'parallel',p.proparallel,'securityDefiner',p.prosecdef,'strict',p.proisstrict,'leakproof',p.proleakproof,'returnsSet',p.proretset,'result',pg_get_function_result(p.oid),'arguments',pg_get_function_arguments(p.oid),'identity',pg_get_function_identity_arguments(p.oid),'config',p.proconfig,'cost',p.procost,'rows',p.prorows,'support',p.prosupport::text,'binary',p.probin,'sqlBody',p.prosqlbody::text) as metadata from pg_proc p join pg_language l on l.oid=p.prolang where p.oid='public.storekit_apply_verified_v1(jsonb)'::regprocedure`);
 writeFileSync('artifacts/AGENT-009/subscription-ledger-20261016/cross-ledger/known-before.json',JSON.stringify(rows[0],null,2)+'\n');console.log(JSON.stringify({source:rows[0].source_sha256,definition:rows[0].definition_sha256,metadata:rows[0].metadata},null,2));
}finally{await resource.cleanup();}
