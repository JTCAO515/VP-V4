-- Append-only compatibility candidate; no migration slot or activation yet.
create or replace function conversation_data_private.guard_source_v1() returns trigger language plpgsql volatile security definer set search_path='' as $$
declare relation_n text:=tg_table_schema||'.'||tg_table_name;new_n jsonb;old_n jsonb;all_n jsonb;ref record;owner_n uuid;owner_ids uuid[]:=array[]::uuid[];
begin
 new_n:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 old_n:=case when tg_op='INSERT' then new_n else to_jsonb(old) end;
 owner_ids:=conversation_data_private.union_ids_v1(array[nullif(new_n->>'owner_id','')::uuid,nullif(old_n->>'owner_id','')::uuid]);
 -- Preserve original owner-account cascade (retained text deliberately has no
 -- auth-user FK). No deleted session can clear operations/tombstones.
 if cardinality(owner_ids)>0 and not exists(select 1 from auth.users where id=any(owner_ids)) then
  if tg_op='DELETE' then return old;else return new;end if;
 end if;
 for owner_n in select unnest(owner_ids) loop
  -- Retain D4's real account barrier/error before the entity fence for
  -- Memory-bearing and queued-cleanup writers. Its original guard still runs.
  if exists(select 1 from privacy_private.memory_delete_jobs_v1 where owner_id=owner_n and state='queued')
   or jsonb_typeof(new_n->'memory_basis')='array' and jsonb_array_length(new_n->'memory_basis')>0
   or jsonb_typeof(old_n->'memory_basis')='array' and jsonb_array_length(old_n->'memory_basis')>0
   or relation_n in('turn_private.result_artifacts','turn_private.result_revisions') and exists(select 1 from turn_private.result_revisions historical where historical.artifact_id in
    (nullif(new_n->>'artifact_id','')::uuid,nullif(old_n->>'artifact_id','')::uuid,nullif(new_n->>'id','')::uuid,nullif(old_n->>'id','')::uuid)
    and jsonb_array_length(historical.memory_basis)>0) then
   perform 1 from auth.users where id=owner_n for key share nowait;
   perform 1 from identity_private.mobile_accounts where owner_id=owner_n for update nowait;
  end if;
 end loop;
 for ref in select distinct p.kind collate "C" kind,p.entity_id from (
  select * from conversation_data_private.parents_v1(relation_n,new_n)
  union select * from conversation_data_private.parents_v1(relation_n,old_n)) p order by p.kind collate "C",p.entity_id loop
  if not pg_try_advisory_xact_lock_shared(hashtextextended('conversation-data-entity:'||ref.kind||':'||ref.entity_id::text,0)) then raise lock_not_available using message='CONVERSATION_CONFLICT';end if;
  case ref.kind
   when 'conversationIds' then perform 1 from turn_private.assistant_conversations where id=ref.entity_id for key share nowait;
   when 'threadIds' then perform 1 from public.chat_threads where id=ref.entity_id for key share nowait;
   when 'turnIds' then perform 1 from public.turns where id=ref.entity_id for key share nowait;
   when 'taskIds' then
    -- A Guide invalidation changes no entity/parent identity. Its original
    -- source-withdrawal path must coexist with a canonical budget reservation.
    -- The shared advisory entity lock above and permanent fence below remain.
    if relation_n='guide_private.bindings_v1' and tg_op='UPDATE'
     and new_n->'invalidated'='true'::jsonb and new_n->'completed_ids'='[]'::jsonb
     and new_n-'invalidated'-'completed_ids'=old_n-'invalidated'-'completed_ids' then
     perform 1 from turn_private.service_tasks where id=ref.entity_id;
    else
     perform 1 from turn_private.service_tasks where id=ref.entity_id for key share nowait;
    end if;
   when 'goalIds' then perform 1 from turn_private.assistant_goals where id=ref.entity_id for key share nowait;
   when 'messageIds' then perform 1 from turn_private.assistant_messages where id=ref.entity_id for key share nowait;
   when 'artifactIds' then perform 1 from turn_private.result_artifacts where id=ref.entity_id for key share nowait;
   else raise exception 'CONVERSATION_SOURCE_UNAVAILABLE';
  end case;
  if conversation_data_private.fenced_v1(ref.kind,ref.entity_id) then
   owner_n:=nullif(new_n->>'owner_id','')::uuid;
   if owner_n is null or not conversation_data_private.proof_v1(owner_n,ref.kind,ref.entity_id) then raise exception 'CONVERSATION_CONFLICT';end if;
   if relation_n='turn_private.text_content' and tg_op<>'DELETE'
    and (new_n->>'input_text' is distinct from '[deleted by scoped conversation request]' or new_n->>'output_kind' is not null or new_n->>'output_text' is not null or new_n->>'hidden_at' is null)
    then raise exception 'CONVERSATION_CONFLICT';end if;
   if relation_n='turn_private.service_tasks' and tg_op<>'DELETE'
    and new_n->>'goal_digest' is distinct from conversation_data_private.digest_v1('[deleted by scoped conversation request]') then raise exception 'CONVERSATION_CONFLICT';end if;
  end if;
 end loop;
 if tg_op='DELETE' then return old;else return new;end if;
end$$;

