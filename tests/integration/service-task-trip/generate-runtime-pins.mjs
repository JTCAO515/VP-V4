// Fixed runtime metadata generation in a private fresh fixture, never at deployment.
import {nativeDatabase} from './native-db.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const file='supabase/migrations/20261015034446_agent008_trip_service_task_settlement_current.sql',marker='-- AGENT008_RUNTIME_PINS_BEGIN';
const cleanups=[];const sha=s=>createHash('sha256').update(s).digest('hex'),lit=s=>"'"+s.replaceAll("'","''")+"'";
try{
 const {db:raw,upgrade}=await nativeDatabase({after:f=>cleanups.push(f)});const db=q=>raw("set search_path='';"+q);
 const read=()=>db("select p.oid::regprocedure::text signature,n.nspname schema,p.proname,pg_get_functiondef(p.oid) definition,p.prosrc,pg_get_userbyid(p.proowner) owner,p.prosecdef secdef,p.proacl::text acl,p.proconfig config,p.prokind::text kind,l.lanname language from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where n.nspname in('public','turn_private','scoped_edit_private','conversation_data_private','turn_data_private','profile_data_private','result_data_private','export_private') order by signature");
 const before=new Map((await read()).map(f=>[f.signature,f]));
 await db('begin;'+upgrade.split(marker)[0]+'commit;');
 const after=await read(),affected=after.filter(f=>f.proname!=='trip_service_task_runtime_v1'&&(!before.has(f.signature)||f.definition!==before.get(f.signature).definition||f.acl!==before.get(f.signature).acl));
 const expected=Object.fromEntries(affected.map(f=>[f.signature,{source:sha(f.prosrc),definition:sha(f.definition),owner:f.owner,secdef:f.secdef,acl:f.acl,config:f.config,kind:f.kind,language:f.language}]));
 const namespaces=after.filter(f=>['turn_private','scoped_edit_private'].includes(f.schema)).map(f=>f.signature).sort();
 const sql=`${marker}
create or replace function turn_private.trip_service_task_runtime_v1() returns boolean language plpgsql stable security definer set search_path='' as $$
declare spec record;actual jsonb;names jsonb;begin
 if not(conversation_data_private.schema_supported_v1() and profile_data_private.schema_v1() and result_data_private.schema_supported_v1() and result_data_private.infrastructure_supported_v1() and turn_data_private.schema_supported_v1() and turn_data_private.runtime_supported_v1() and turn_data_private.write_hooks_valid_v1()) then return false;end if;
 select jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text collate "C") into names from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname in('turn_private','scoped_edit_private');
 if names is distinct from ${lit(JSON.stringify(namespaces))}::jsonb then return false;end if;
 for spec in select key signature,value expected from jsonb_each(${lit(JSON.stringify(expected))}::jsonb) loop
 if to_regprocedure(spec.signature) is null then return false;end if;
 select jsonb_build_object('source',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),'definition',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'owner',pg_get_userbyid(p.proowner),'secdef',p.prosecdef,'acl',p.proacl::text,'config',p.proconfig,'kind',p.prokind::text,'language',l.lanname) into actual from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang where p.oid=spec.signature::regprocedure;
 if actual is distinct from spec.expected then return false;end if;
 end loop;return true;
end $$;
revoke all on function turn_private.trip_service_task_runtime_v1() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
`;
 await db(sql);assert.equal((await db('select turn_private.trip_service_task_runtime_v1() v'))[0].v,true);
 writeFileSync(file,upgrade.split(marker)[0]+sql);
 writeFileSync('artifacts/AGENT-008/trip-settlement-20261015/runtime-source.audit.json',JSON.stringify({namespaces,functions:expected},null,2)+'\n');
 console.log('Fixed new Trip runtime function metadata and namespace inventory PASS',affected.length);
}finally{for(const f of cleanups)await f();}
