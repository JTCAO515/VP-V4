CREATE OR REPLACE FUNCTION turn_data_private.guard_source_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare rel text:=tg_table_schema||'.'||tg_table_name;nv jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;ov jsonb:=case when tg_op='INSERT' then to_jsonb(new) else to_jsonb(old) end;r record;owners uuid[];key_n jsonb;
begin
 if rel='turn_private.grounded_turns' and tg_op='UPDATE' and ov->'selected_place_request' is distinct from nv->'selected_place_request' then raise exception 'IMMUTABLE_BINDING';end if;
 owners:=turn_data_private.union_ids_v1(array[nullif(nv->>'owner_id','')::uuid,nullif(ov->>'owner_id','')::uuid]);
 if cardinality(owners)>0 and not exists(select 1 from auth.users where id=any(owners)) and tg_op='DELETE' then return old;end if;
 for key_n in select distinct k from(select turn_data_private.source_key_v1(rel,nv) k union select turn_data_private.source_key_v1(rel,ov) where tg_op='UPDATE' and ov is distinct from nv) a where k is not null loop
  if not pg_try_advisory_xact_lock_shared(hashtextextended('turn-data-source-key:'||rel||':'||turn_data_private.digest_v1(key_n::text),0)) then raise lock_not_available using message='TURN_CONFLICT';end if;
  if turn_data_private.source_key_fenced_v1(rel,key_n) then raise exception 'TURN_CONFLICT';end if;
 end loop;
 for r in select distinct kind collate "C" kind,entity_id from(select * from turn_data_private.writer_references_v1(rel,nv) union select * from turn_data_private.writer_references_v1(rel,ov) where tg_op='UPDATE' and ov is distinct from nv) a order by kind collate "C",entity_id loop
  if not pg_try_advisory_xact_lock_shared(hashtextextended('turn-data-entity:'||r.kind||':'||r.entity_id::text,0)) then raise lock_not_available using message='TURN_CONFLICT';end if;
  if turn_data_private.fenced_v1(r.kind,r.entity_id) then raise exception 'TURN_CONFLICT';end if;
 end loop;
 if tg_op='DELETE' then return old;else return new;end if;
end$function$
;
