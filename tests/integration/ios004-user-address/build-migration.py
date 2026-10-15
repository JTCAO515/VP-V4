# Known source, never observed hash adoption. Emits only the Main-allocated unapplied slot.
import json, hashlib
from pathlib import Path
src=Path('supabase/migrations/20261005020000_scoped_edit.sql').read_text()
observed={r['signature']:r for r in json.loads(Path('artifacts/IOS-004/address-authority-20261016/original-functions.json').read_text())}
def original(name,sig):
 start=src.index('create or replace function public.'+name+'(');start_body=src.index('as $$',start)+5;end=src.index('$$;',start_body)
 body=src[start_body:end]
 assert body==observed[sig]['prosrc'],name+' accepted source mismatch'
 return src[start:end+3],hashlib.sha256(body.encode()).hexdigest()
snapshot,spinhash=original('trip_content_snapshot','trip_content_snapshot(uuid,text)')
patch,ppinhash=original('apply_trip_content_patch','apply_trip_content_patch(jsonb,jsonb)')
anchor="||case when i.manual_order is null then '{}'::jsonb else jsonb_build_object('manualOrder',i.manual_order) end"
assert snapshot.count(anchor)==1
snapshot=snapshot.replace(anchor,anchor+"\n ||case when a.value ? 'chineseAddress' then jsonb_build_object('chineseAddress',ios004_address_private.checked_value_v1(a.value->'chineseAddress')) else '{}'::jsonb end")
anchor="(select x.*, (row_number() over(order by x.item_id)-1)::integer legacy_slot from public.trip_items x where x.trip_id=d.trip_id and x.day_id=d.day_id) i)"
replace="""(select x.*, (row_number() over(order by x.item_id)-1)::integer legacy_slot from public.trip_items x where x.trip_id=d.trip_id and x.day_id=d.day_id) i
 left join lateral (
   select item.value from public.trips t join public.trip_version_snapshots s
   on s.trip_id=t.id and s.owner_id=t.owner_id and s.version=t.head_version,
   jsonb_array_elements(s.content->'days') day,
   jsonb_array_elements(day.value->'items') item
   where t.id=d.trip_id and t.owner_id=i.owner_id and day.value->>'id'=d.day_id and item.value->>'id'=i.item_id
 ) a on true)"""
assert snapshot.count(anchor)==1;snapshot=snapshot.replace(anchor,replace)
anchor="days:='[]';one_patch:="
branch="""if current_op->>'kind'='set_item_chinese_address' then
 if jsonb_typeof(p_patch->'expectedVersion') is distinct from 'number' or p_patch->>'expectedVersion' !~ '^[0-9]{1,9}$'
 or not recovery_private.exact_v1(current_op,array['kind','dayId','itemId','text'])
 or jsonb_typeof(current_op->'dayId') is distinct from 'string' or current_op->>'dayId' !~ '^[A-Za-z0-9_-]{1,64}$'
 or jsonb_typeof(current_op->'itemId') is distinct from 'string' or current_op->>'itemId' !~ '^[A-Za-z0-9_-]{1,64}$'
 or not(current_op->'text'='null'::jsonb or ios004_address_private.valid_text_v1(current_op->'text'))
 or not exists(select 1 from jsonb_array_elements(current->'days')dd,jsonb_array_elements(dd->'items')ii where dd->>'id'=current_op->>'dayId' and ii->>'id'=current_op->>'itemId') then raise exception 'INVALID_PATCH';end if;
 select jsonb_set(current,'{days}',coalesce(jsonb_agg(case when dd->>'id'=current_op->>'dayId' then
 jsonb_set(dd,'{items}',(select jsonb_agg(case when ii->>'id'=current_op->>'itemId' then
 case when current_op->'text'='null'::jsonb then ii-'chineseAddress' else ii||jsonb_build_object('chineseAddress',jsonb_build_object('text',current_op->'text','source','user_provided','verification','unverified')) end
 else ii end order by io) from jsonb_array_elements(dd->'items') with ordinality item(ii,io))) else dd end order by do_n),'[]'))
 into current from jsonb_array_elements(current->'days') with ordinality day(dd,do_n);
 continue;
 end if;
 days:='[]';one_patch:="""
assert patch.count(anchor)==1;patch=patch.replace(anchor,branch)
anchor="if old_i ? 'manualOrder' then i:=i||jsonb_build_object('manualOrder',old_i->'manualOrder');end if;"
assert patch.count(anchor)==1;patch=patch.replace(anchor,anchor+"\n if old_i ? 'chineseAddress' then i:=i||jsonb_build_object('chineseAddress',ios004_address_private.checked_value_v1(old_i->'chineseAddress'));end if;")
# This exact explicit blank scalar set matches the shared TypeScript codec.
whitespace='\t\n\r \u0085\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'
helper="""create schema ios004_address_private;
revoke all on schema ios004_address_private from public,anon,authenticated,service_role;
create function ios004_address_private.valid_text_v1(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare t text; n integer; p integer;
begin
 if jsonb_typeof(v) is distinct from 'string' then return false;end if;t:=v#>>'{}';
 if char_length(t) not between 1 and 500 or octet_length(t)>1500 or char_length(btrim(t,%s))=0 then return false;end if;
 for n in 1..char_length(t) loop p:=ascii(substr(t,n,1));if p between 0 and 8 or p in(11,12) or p between 14 and 31 or p between 127 and 159 or p between 55296 and 57343 then return false;end if;end loop;return true;
end $$;
revoke all on function ios004_address_private.valid_text_v1(jsonb) from public,anon,authenticated,service_role;
"""% ("U&'"+"".join("\\"+format(ord(c),"04x") for c in whitespace)+"'")
helper+="""
create function ios004_address_private.checked_value_v1(v jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
begin
 if not recovery_private.exact_v1(v,array['text','source','verification']) or v->>'source' is distinct from 'user_provided'
 or v->>'verification' is distinct from 'unverified' or not ios004_address_private.valid_text_v1(v->'text') then raise exception 'SOURCE_UNAVAILABLE';end if;
 return v;
end $$;
revoke all on function ios004_address_private.checked_value_v1(jsonb) from public,anon,authenticated,service_role;
"""
export_src=Path('supabase/migrations/20261003170000_vpj36_core_export_d2.sql').read_text()
start=export_src.index('create function export_private.trip_content_v1(');start_body=export_src.index('as $$',start)+5;end=export_src.index('$$;',start_body)
export_body=export_src[start_body:end]
assert export_body==observed['export_private.trip_content_v1(jsonb)']['prosrc'],'accepted export source drift'
export_pin=hashlib.sha256(export_body.encode()).hexdigest()
export_definition=export_src[start:end+3].replace('create function','create or replace function',1)
anchor="case when i ? 'endsAt' then jsonb_build_object('endsAt',i->'endsAt') else '{}'::jsonb end);"
assert export_definition.count(anchor)==1
export_definition=export_definition.replace(anchor,"case when i ? 'endsAt' then jsonb_build_object('endsAt',i->'endsAt') else '{}'::jsonb end||case when i ? 'chineseAddress' then jsonb_build_object('chineseAddress',ios004_address_private.checked_value_v1(i->'chineseAddress')) else '{}'::jsonb end);")
# Destination equality must use the identical new-field omission as the existing TS prompt.
destination_src=src
start=destination_src.index('create function public.record_scoped_trip_edit_destination_v1(')
start_body=destination_src.index('as $$',start)+5;end=destination_src.index('$$;',start_body)
destination_body=destination_src[start_body:end]
old_prompt="'1a360f47407d9507f311fd9f25a3645d4e6b29de034a0682761a47409b873f7c'"
new_prompt="(case when exists(select 1 from turn_private.service_tasks where id=j.task_id and expected_result='trip_modification') then 'a5e60145946199b32c29187b78b83bc95a99d2693ce61a3eb1a06a112b991bd0' else '1a360f47407d9507f311fd9f25a3645d4e6b29de034a0682761a47409b873f7c' end)"
assert destination_body.count(old_prompt)==1
destination_body=destination_body.replace(old_prompt,new_prompt)
sig='record_scoped_trip_edit_destination_v1(jsonb,jsonb,text,text,text,text)'
assert destination_body==observed[sig]['prosrc'],'destination must match original scoped SQL plus exact accepted055708 system prompt change'
destination_definition=observed[sig]['definition']
anchor="'trip',input->'context'->'snapshot'"
assert destination_definition.count(anchor)==1
destination_definition=destination_definition.replace(anchor,"'trip',ios004_address_private.omit_online_addresses_v1(input->'context'->'snapshot')")
helper+="""
create function ios004_address_private.omit_online_addresses_v1(v jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_set(v,'{days}',coalesce((select jsonb_agg(case when d ? 'items' then jsonb_set(d,'{items}',coalesce((select jsonb_agg(i-'chineseAddress' order by io) from jsonb_array_elements(d->'items') with ordinality item(i,io)),'[]'::jsonb)) else d end order by do_n)
 from jsonb_array_elements(v->'days') with ordinality day(d,do_n)),'[]'::jsonb))
$$;
revoke all on function ios004_address_private.omit_online_addresses_v1(jsonb) from public,anon,authenticated,service_role;
"""
guard="""-- IOS-004 original confirmed Trip JSON only; no new data authority or source grant.
-- Known-before bodies are extracted from accepted 20261005020000_scoped_edit.sql;
-- disposable replay compares byte-for-byte, never adopts an observed hash.
do $$begin
 if encode(sha256(convert_to((select prosrc from pg_proc where oid='public.trip_content_snapshot(uuid,text)'::regprocedure),'UTF8')),'hex')<>%s
 or encode(sha256(convert_to((select prosrc from pg_proc where oid='public.apply_trip_content_patch(jsonb,jsonb)'::regprocedure),'UTF8')),'hex')<>%s
 or encode(sha256(convert_to((select prosrc from pg_proc where oid='export_private.trip_content_v1(jsonb)'::regprocedure),'UTF8')),'hex')<>%s then raise exception 'IOS004_SOURCE_DRIFT';end if;
end $$;
"""%("'"+spinhash+"'","'"+ppinhash+"'","'"+export_pin+"'")
runtime_guard=''
root=Path('artifacts/IOS-004/address-authority-20261016')
if (root/'runtime-guard.after.sql').exists():
 before=json.loads((root/'runtime-guard.changes.json').read_text())['beforeSourceSHA256']
 # The guard body is exact accepted canonical source; validate its metadata before trusting its result.
 guard+="""\ndo $before$declare f pg_proc;begin
 select * into f from pg_proc where oid='turn_private.trip_service_task_runtime_v1()'::regprocedure;
 if encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')<> '%s'
 or pg_get_userbyid(f.proowner)<>'postgres' or not f.prosecdef or f.prokind<>'f' or f.provolatile<>'s'
 or f.proconfig is distinct from array['search_path=""']::text[] or f.proacl::text is distinct from '{postgres=X/postgres}'
 then raise exception 'IOS004_RUNTIME_SOURCE_DRIFT';end if;
 if turn_private.trip_service_task_runtime_v1() is not true then raise exception 'IOS004_RUNTIME_METADATA_DRIFT';end if;
 select * into f from pg_proc where oid='export_private.trip_content_v1(jsonb)'::regprocedure;
 if pg_get_userbyid(f.proowner)<>'postgres' or f.prosecdef or f.prokind<>'f' or f.provolatile<>'i'
 or f.proconfig is distinct from array['search_path=""']::text[] or f.proacl::text is distinct from '{postgres=X/postgres}'
 then raise exception 'IOS004_EXPORT_METADATA_DRIFT';end if;
end $before$;\n"""%before
 runtime_guard=(root/'runtime-guard.after.sql').read_text()
Path('supabase/migrations/20261015161024_ios004_online_user_address.sql').write_text(guard+helper+'\n'+snapshot+'\n\n'+patch+'\n\n'+export_definition+'\n\n'+destination_definition.rstrip()+';\n'+runtime_guard.rstrip()+';'+'\n')
print('PASS authored accepted source-qualified migration')
