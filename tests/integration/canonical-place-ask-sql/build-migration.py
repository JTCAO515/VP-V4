from pathlib import Path
import json,re
r=Path('artifacts/AGENT-005/canonical-place-sql-20261015');pins=json.loads((r/'function-pins.json').read_text())+json.loads((r/'dependency-pins.json').read_text());parts=['source-chain.sql','shape.sql','private.sql','qualification.sql','binding.sql','history.sql','settlement.sql','worker.sql','schema.sql','source-row.sql'];new=[]
for f in parts:
 for n in re.findall(r'create or replace function ([^(]+)\(', (r/f).read_text(),re.I):
  if n not in new:new.append(n)
encoded=json.dumps(pins,separators=(',',':')).replace("'","''")
def guard(phase):
 check="""if p.oid is null or md5(pg_get_functiondef(p.oid)) is distinct from spec->>'%sMd5'
 or jsonb_build_object('owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'config',p.proconfig,'definer',p.prosecdef,'volatility',p.provolatile,'strict',p.proisstrict,'parallel',p.proparallel,'kind',p.prokind)
 is distinct from (spec-array['signature','beforeMd5','afterMd5']) then raise exception 'CANONICAL_PLACE_%s_DEFINITION_MISMATCH %%',spec->>'signature';end if;"""%(phase,phase.upper())
 return "do $pins$declare spec jsonb;p pg_proc;begin\n for spec in select value from jsonb_array_elements('"+encoded+"'::jsonb) loop\n select * into p from pg_proc where oid=to_regprocedure(spec->>'signature');\n "+check+"\n end loop;\nend $pins$;\n"
pre="""-- AGENT-005 canonical Place Ask; ordinary original Task admission and one atomic proof.
-- Authored against accepted QA ead1efc19f2f540d9056eb37ed90333388b0c8a9 (707).
-- No ordinary Place/Guide EXECUTE, new table, ledger, queue, or provider rights.
"""
pre+=guard('before')
pre+="do $absent$begin\n if exists(select 1 from pg_attribute where attrelid='turn_private.grounded_turns'::regclass and attname='selected_place_request' and not attisdropped) then raise exception 'CANONICAL_PLACE_SLOT_ALREADY_EXISTS';end if;\n"
pre+=" if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname||'.'||p.proname=any(array["+','.join("'"+x+"'" for x in new)+"])) then raise exception 'CANONICAL_PLACE_PRIVATE_FUNCTION_ALREADY_EXISTS';end if;\nend $absent$;\n"
sql=pre+'\n'.join((r/f).read_text() for f in parts)+'\n'+'\n'.join(p.read_text() for p in sorted((r/'after').glob('*.sql')))+'\n'+guard('after')
sql+="do $guards$begin\n if place_actions_private.ask_schema_v1() is not true or profile_data_private.schema_v1() is not true or result_data_private.infrastructure_supported_v1() is not true or result_data_private.schema_supported_v1() is not true or turn_data_private.schema_supported_v1() is not true or turn_data_private.runtime_supported_v1() is not true or conversation_data_private.schema_supported_v1() is not true or export_private.profile_hooks_valid_v1() is not true or turn_data_private.write_hooks_valid_v1() is not true or turn_data_private.hooks_valid_v1() is not true or turn_private.trip_service_task_runtime_v1() is not true then raise exception 'CANONICAL_PLACE_LIFECYCLE_GUARD_MISMATCH';end if;\nend $guards$;\n"
p=Path('supabase/migrations/20261015083120_agent005_canonical_place_ask.sql');assert p.exists();p.write_text(sql);print('AUTHORED_PRODUCT_MIGRATION',len(sql.encode()),'pinned existing functions',len(pins),'authored changes',sum(p['beforeMd5']!=p['afterMd5'] for p in pins),'new private',len(new))
