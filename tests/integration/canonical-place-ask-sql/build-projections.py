from pathlib import Path
r=Path('artifacts/AGENT-005/canonical-place-sql-20261015');out=r/'after'
def write(n,s): (out/(n+'.sql')).write_text(s+';\n')
for n,alias in [('turn_data_private.source_v1','spec.relation_name'),('result_data_private.source_v1','spec.relation_name'),('conversation_data_private.source_v1','spec.relation_name')]:
 s=(r/'before'/(n+'.sql')).read_text();var='actual_n' if n.startswith('conversation') else 'v'
 # Insert projection immediately inside original source-row loop, before hashes/counts.
 lines=s.splitlines();done=0;i=0
 while i<len(lines):
  if ('for '+var+' in execute format(') in lines[i] and 'select to_jsonb(' in lines[i]:
   j=i
   while not lines[j].rstrip().endswith('loop'):j+=1
   rel=alias if done==0 else ('relation_n' if n.startswith('conversation') else 'rel')
   lines.insert(j+1,f"   {var}:=place_actions_private.ask_source_row_v1({rel},{var});")
   done+=1;i=j+1
  i+=1
 assert done,n
 write(n,'\n'.join(lines)+'\n')
n='turn_data_private.export_row_v1';s=(r/'before'/(n+'.sql')).read_text().replace('out_n jsonb:=v;begin','out_n jsonb:=place_actions_private.ask_source_row_v1(rel,v);begin');write(n,s)
n='turn_data_private.export_source_v1';s=(r/'before'/(n+'.sql')).read_text();old="if s.count_key='grounded' and (jsonb_typeof(v->'basis'->'publications') is distinct from 'array' or jsonb_array_length(v->'basis'->'publications')>0) then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;";assert old in s
new="""if s.count_key='grounded' then
    if v->'selected_place_request' is distinct from 'null'::jsonb and v ? 'selected_place_request' then
     if not place_actions_private.ask_proof_shape_v1(v->'selected_place_request') or not place_actions_private.ask_answer_basis_shape_v1(v->'basis')
      or v->'selected_place_request'->'originalReceipt'->'turnId' is distinct from v->'turn_id' or v->'selected_place_request'->'originalReceipt'->'serviceTaskId' is distinct from v->'task_id' then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;
    elsif jsonb_typeof(v->'basis'->'publications') is distinct from 'array' or jsonb_array_length(v->'basis'->'publications')>0 then raise exception 'TURN_SOURCE_UNAVAILABLE';end if;
   end if;"""
write(n,s.replace(old,new))
n='export_private.core_turn_page_v1';s=(r/'before'/(n+'.sql')).read_text();s=s.replace("'schemaVersion','turn-core-export/1'","'schemaVersion',case when exists(select 1 from jsonb_array_elements(src->'snapshot'->'sources') selected_group cross join lateral jsonb_array_elements(selected_group->'rows') selected_row where selected_group->>'relation'='turn_private.grounded_turns' and selected_row ? 'selected_place_request') then 'turn-core-export/3' else 'turn-core-export/1' end");write(n,s)
n='turn_data_private.guard_source_v1';s=(r/'before'/(n+'.sql')).read_text();s=s.replace('begin\n',"begin\n if rel='turn_private.grounded_turns' and tg_op='UPDATE' and ov->'selected_place_request' is distinct from nv->'selected_place_request' then raise exception 'IMMUTABLE_BINDING';end if;\n",1);write(n,s)
