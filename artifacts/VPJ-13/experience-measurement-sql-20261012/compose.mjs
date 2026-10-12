// Derive fixed after literals exclusively from pinned unchanged before + exact
// five compiled candidate tables. Never accept an unknown runtime schema hash.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {db,owned,catalog} from './kernel.mjs';
const out=new URL('.',import.meta.url);const read=f=>readFileSync(new URL(f,out),'utf8');const write=(f,s)=>writeFileSync(new URL(f,out),s);
const lit=s=>"'"+s.replaceAll("'","''")+"'";const md5=s=>createHash('md5').update(s).digest('hex');
await owned();const before=JSON.parse(read('catalog-before.json'));const tb=JSON.parse(read('catalog-relations-before.json'));
const ta=JSON.parse(read('catalog-relations-after.json'));for(const t of tb)assert.deepEqual(ta.find(a=>a.relation===t.relation),t);
const extra=ta.filter(a=>!tb.some(t=>t.relation===a.relation));assert.deepEqual(extra.map(t=>t.relation).sort(),['admissions_v1','configuration_v1','consents_v1','copy_obligations_v1','erasure_receipts_v1','journals_v1','recovery_controls_v1','reports_v1'].map(t=>'journey_measurement_private.'+t));
const skip=new Set(['pg_catalog','information_schema','extensions','auth','result_data_private','storage','realtime','_realtime','vault','supabase_functions','supabase_migrations']);
const schema=ts=>ts.filter(t=>!skip.has(t.relation.split('.')[0])).sort((a,b)=>a.relation.localeCompare(b.relation,'en')).map(t=>({relation:t.relation,columns:t.columns.map(a=>[a.name,a.type,a.notNull]),constraints:t.constraints?.map(c=>c[1])??null}));
const oldHash=await db(`select result_data_private.digest_v1(${lit(JSON.stringify(schema(tb)))}::jsonb::text)`);assert.equal(oldHash,'0ec0fcfc206909a38756272a65a877c6ab857c00fd114178d135837da951c73a');
const newHash=await db(`select result_data_private.digest_v1(${lit(JSON.stringify(schema([...tb,...extra])))}::jsonb::text)`);
const moduleFunctions=JSON.parse(read('catalog-after.json')).filter(f=>f.signature.startsWith('journey_measurement_private.')||f.signature.startsWith('public.native_journey_measurement_v1(')||f.signature.startsWith('public.purge_journey_measurement_v1('));
const specs=Object.fromEntries(moduleFunctions.map(f=>[f.signature,{definitionMd5:md5(f.definition),owner:f.owner,acl:f.acl,config:f.config,volatility:f.volatility,securityDefiner:f.securityDefiner,strict:f.strict,parallel:f.parallel,kind:f.kind,language:f.language}]));
const runtimeDefinition=`create function journey_measurement_private.module_supported_v1() returns boolean language plpgsql stable security definer set search_path='' as $runtime$
declare s record;p pg_proc;actual_n jsonb;
begin
 if (select count(*) from pg_proc f join pg_namespace n on n.oid=f.pronamespace where n.nspname='journey_measurement_private')<>${moduleFunctions.filter(f=>f.signature.startsWith('journey_measurement_private.')).length+1} then return false;end if;
 for s in select key,value from jsonb_each(${lit(JSON.stringify(specs))}::jsonb) loop
  if to_regprocedure(s.key) is null then return false;end if;
  select * into p from pg_proc where oid=s.key::regprocedure;
  actual_n:=jsonb_build_object('definitionMd5',md5(pg_get_functiondef(p.oid)),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'config',p.proconfig,
   'volatility',p.provolatile,'securityDefiner',p.prosecdef,'strict',p.proisstrict,'parallel',p.proparallel,'kind',p.prokind,'language',(select lanname from pg_language where oid=p.prolang));
  if actual_n is distinct from s.value then return false;end if;
 end loop;
 if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='journey_measurement_private' and c.relkind='r')<>8 then return false;end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='journey_measurement_private' and c.relkind='r' and
  (not c.relrowsecurity or has_table_privilege('authenticated',c.oid,'SELECT') or has_table_privilege('service_role',c.oid,'SELECT') or has_table_privilege('anon',c.oid,'SELECT'))) then return false;end if;
 return true;
exception when others then return false;end $runtime$;
revoke all on function journey_measurement_private.module_supported_v1() from public,anon,authenticated,service_role;`;
write('module-runtime-pins.candidate.sql',runtimeDefinition);await db(runtimeDefinition);
const runtimeActual=JSON.parse(await db("select jsonb_build_object('definition',pg_get_functiondef(oid),'prosrc',prosrc) from pg_proc where oid='journey_measurement_private.module_supported_v1()'::regprocedure"));
const fixed={};for(const sig of ['export_private.core_profile_page_v1(jsonb)','export_private.profile_commit_qualifies_v1(export_private.core_jobs_v1,jsonb,uuid,integer)','export_private.record_profile_provenance_v1(export_private.core_jobs_v1,timestamp with time zone)','export_private.profile_source_current_v1(export_private.core_jobs_v1)']){
 const file=sig.split('(')[0]+'.after.candidate.sql';let definition=read(file);if(definition.endsWith('\n\n'))definition=definition.slice(0,-1);fixed[sig]=definition;
}
const sourceFile=read('profile-request-suffix.new.candidate.sql');const newDefinition=sourceFile.slice(0,sourceFile.lastIndexOf(';\nrevoke'));
await db(sourceFile);
const hooks=before.find(f=>f.signature==='export_private.profile_hooks_valid_v1()');let hooksAfter=hooks.definition;
for(const [sig,definition] of Object.entries(fixed)){const old=before.find(f=>f.signature===sig);const key=JSON.stringify(sig)+':'+JSON.stringify(md5(old.definition));assert.equal(hooksAfter.split(key).length-1,1);hooksAfter=hooksAfter.replace(key,JSON.stringify(sig)+':'+JSON.stringify(md5(definition)));}
const hooksLiteral=hooksAfter.match(/jsonb_each\('((?:[^']|'')*)'::jsonb\)/);assert.ok(hooksLiteral);
const expectedHooks=JSON.parse(hooksLiteral[1].replaceAll("''","'"));expectedHooks['export_private.profile_source_v1(uuid,uuid)']=md5(newDefinition);expectedHooks['journey_measurement_private.module_supported_v1()']=md5(runtimeActual.definition);
hooksAfter=hooksAfter.replace(hooksLiteral[0],"jsonb_each("+lit(JSON.stringify(expectedHooks))+"::jsonb)");
fixed[hooks.signature]=hooksAfter;
const newFks=extra.flatMap(t=>t.constraints.filter(c=>c[1].startsWith('FOREIGN KEY')).map(c=>({from:t.relation,to:c[1].match(/REFERENCES ([^ (]+)/)[1],name:c[0],definition:c[1]})));
const conv=before.find(f=>f.signature==='conversation_data_private.schema_supported_v1()');let convAfter=conv.definition;
const foreignMatch=convAfter.match(/return foreign_n='((?:[^']|'')*)'::jsonb/);assert.ok(foreignMatch);let foreign=JSON.parse(foreignMatch[1].replaceAll("''","'"));
const convNames=JSON.parse(await db("select jsonb_agg(relation_name order by relation_name) from conversation_data_private.sources_v1()"));
foreign=[...foreign,...newFks.filter(f=>convNames.includes(f.from)||convNames.includes(f.to)).map(f=>({...f,definition:f.definition.replaceAll('public.','')}))].sort((a,b)=>a.from<b.from?-1:a.from>b.from?1:a.name<b.name?-1:a.name>b.name?1:0);
convAfter=convAfter.replace(foreignMatch[0],"return foreign_n="+lit(JSON.stringify(foreign))+"::jsonb");fixed[conv.signature]=convAfter;
const profile=before.find(f=>f.signature==='profile_data_private.schema_v1()');let profileAfter=profile.definition.replace(oldHash,newHash);
const profileMatch=profileAfter.match(/if fk is distinct from '((?:[^']|'')*)'::jsonb/);assert.ok(profileMatch);let pf=JSON.parse(profileMatch[1].replaceAll("''","'"));
const profileNames=['public.user_profiles','turn_private.assistant_directions_intakes_v1','turn_private.directions_operations_v1','turn_private.directions_result_sources_v1',...JSON.parse(await db("select jsonb_agg(relation_name order by relation_name) from profile_data_private.sources_v1()"))];
pf=[...pf,...newFks.filter(f=>profileNames.includes(f.from)||profileNames.includes(f.to)).map(f=>[f.from,f.to,f.name,f.definition])].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[2]<b[2]?-1:a[2]>b[2]?1:0);
profileAfter=profileAfter.replace(profileMatch[0],'if fk is distinct from '+lit(JSON.stringify(pf))+'::jsonb');
const key=JSON.stringify(hooks.signature)+':'+JSON.stringify(md5(hooks.prosrc));assert.equal(profileAfter.split(key).length-1,1);
const newHookBody=hooksAfter.split('AS $function$')[1].split('$function$')[0];profileAfter=profileAfter.replace(key,JSON.stringify(hooks.signature)+':'+JSON.stringify(md5(newHookBody)));
fixed[profile.signature]=profileAfter;
for(const sig of ['result_data_private.schema_supported_v1()','turn_data_private.schema_supported_v1()']){
 const f=before.find(f=>f.signature===sig);assert.equal(f.definition.split(oldHash).length-1,1);fixed[sig]=f.definition.replace(oldHash,newHash);
}
const turnRuntime=before.find(f=>f.signature==='turn_data_private.runtime_supported_v1()');let turnRuntimeAfter=turnRuntime.definition;
for(const [sig,definition] of Object.entries(fixed)){
 const old=before.find(f=>f.signature===sig);const key=JSON.stringify(sig)+':'+JSON.stringify(md5(old.definition));
 if(turnRuntimeAfter.includes(key))turnRuntimeAfter=turnRuntimeAfter.replace(key,JSON.stringify(sig)+':'+JSON.stringify(md5(definition)));
}
fixed[turnRuntime.signature]=turnRuntimeAfter;
const manifest=[];for(const [sig,after] of Object.entries(fixed)){
 const f=before.find(f=>f.signature===sig);write(sig.split('(')[0]+'.composed.after.sql',after);manifest.push({signature:sig,beforeDefinitionSha256:createHash('sha256').update(f.definition).digest('hex'),afterDefinitionSha256:createHash('sha256').update(after).digest('hex'),oldACL:f.acl,oldConfig:f.config,oldOwner:f.owner});
}
const composed=Object.values(fixed).join(';\n')+';';write('profile-static-composition.candidate.sql',composed);
await db('begin;'+composed+'\nrollback;');await db('begin;'+composed+'\ncommit;');
const guards=await db('select profile_data_private.schema_v1(),conversation_data_private.schema_supported_v1(),result_data_private.schema_supported_v1(),turn_data_private.schema_supported_v1(),turn_data_private.runtime_supported_v1(),journey_measurement_private.module_supported_v1();');
write('static-composition-proof.json',JSON.stringify({pinnedCandidateSha256:createHash('sha256').update(read('measurement.candidate.sql')).digest('hex'),oldApplicationHash:oldHash,staticallyComposedApplicationHash:newHash,oldTablesUnchanged:tb.length,exactNewTables:extra.map(t=>t.relation),manifest,guards,actual:guards==='t|t|t|t|t|t'?'PASS':'FAIL',product:'NOT_APPLIED'},null,2)+'\n');
assert.equal(guards,'t|t|t|t|t|t');await catalog('composed');console.log('Exact eight-table/Profile+recovery+copy composition PASS; original schema/runtime/module guards PASS');
