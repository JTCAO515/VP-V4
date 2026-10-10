import{readFileSync,writeFileSync}from'node:fs';import{sql}from'../../../tests/integration/cost/fixtures/postgres-rpc.mjs';
const root='artifacts/VPJ-08/assistant-events-sql-20261010/';
const original=JSON.parse(readFileSync(root+'guards-before.json','utf8'));const extra=JSON.parse(readFileSync(root+'guard-extra-before.json','utf8'));
async function q(text){const r=await sql('vpj08-events-sql-20261010',"set search_path='';"+text);if(r.code)throw Error(r.stderr);return r.stdout.trim();}
const catalog=readFileSync(root+'catalog.mjs','utf8').match(/const catalog=`([^`]+)`/)[1];
const hash=await q(`select result_data_private.digest_v1((${catalog})::text);`);
const schema=original['conversation_data_private.schema_supported_v1'];
const fkQuery=schema.slice(schema.indexOf(' select coalesce(jsonb_agg'),schema.indexOf(" return foreign_n="));
const fks=JSON.parse(await q(fkQuery.replace('into foreign_n ','').trim()));
const profile=extra['profile_data_private.schema_v1()'];const namesQuery="select array_agg(relation_name) from (select 'public.user_profiles'::text relation_name union all select relation_name from profile_data_private.sources_v1()) s";
const profileFks=JSON.parse(await q(`select coalesce(jsonb_agg(jsonb_build_array(conrelid::regclass::text,confrelid::regclass::text,conname,pg_get_constraintdef(oid)) order by conrelid::regclass::text,conname),'[]') from pg_constraint where contype='f' and (conrelid=any((${namesQuery})::regclass[]) or confrelid=any((${namesQuery})::regclass[]))`));
const profileTriggers=JSON.parse(await q(`select coalesce(jsonb_agg(jsonb_build_array(tgrelid::regclass::text,tgname,pg_get_triggerdef(oid),tgfoid::regprocedure::text) order by tgrelid::regclass::text,tgname),'[]') from pg_trigger where not tgisinternal and tgrelid=any((${namesQuery})::regclass[])`));
const addedFks=fks.filter(x=>x.from==='turn_private.assistant_events_v1'||x.from==='turn_private.assistant_event_heads_v1');
const addedTriggers=profileTriggers.filter(x=>x[1].startsWith('assistant_event_'));
writeFileSync(root+'pin-measurements.json',JSON.stringify({provenance:'measurements only; no pin accepted or replaced',applicationCatalogHash:hash,conversationFks:fks,profileFks,profileTriggers,addedConversationFks:addedFks,addedProfileTriggers:addedTriggers},null,2)+'\n');console.log(hash);console.log('new conversation FKs',addedFks.length,'profile hooks',addedTriggers.length);
