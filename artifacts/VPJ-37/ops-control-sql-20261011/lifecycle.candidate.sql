-- New persistent metadata lifecycle, PRIVATE FULL-SOURCE CANDIDATE only.
-- No public/service export or restore grant. Existing qualified export calls this leaf.
create function ops_control_private.export_actor_operations_v1(u uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r ops_control_private.operations_v1%rowtype;items jsonb:='[]';n integer:=0;item jsonb;
begin
 if u is null or not exists(select 1 from auth.users where id=u) then raise exception 'PROFILE_SOURCE_UNAVAILABLE';end if;
 for r in select * from ops_control_private.operations_v1 where actor_id=u and not retired
  order by operation_id limit 10001 for share nowait loop
  n:=n+1;if n>10000 then raise exception 'PROFILE_SCOPE_TOO_LARGE';end if;
  item:=r.receipt||jsonb_build_object('ownerId',u,'kind','ops_control_operation/1');
  if item->>'operationId' is distinct from r.operation_id::text or item->>'action' is distinct from r.action
   or(item->>'revision')::bigint<>r.revision then raise exception 'PROFILE_SOURCE_UNAVAILABLE';end if;
  items:=items||jsonb_build_array(item);
  if octet_length(items::text)>1000000 then raise exception 'PROFILE_SCOPE_TOO_LARGE';end if;
 end loop;
 return items;
end $$;

-- Inputs are supplied by the existing K1 operator after independent sealed-journal
-- coverage/recency/deletion checks. A backup cannot certify its own latest watermark.
-- Reconcile always stops controls/budgets; only a later fresh Ops CAS can resume.
create function ops_control_private.reconcile_restore_v1(v jsonb,p_expected_manifest_digest text) returns void
language plpgsql security definer set search_path='' as $$
declare x jsonb;s public.model_budget_scopes%rowtype;revision_n bigint;digest_n text;
begin
 if session_user<>'postgres' or current_setting('role')<>'none' then raise exception 'OPS_FORBIDDEN';end if;
 if ops_control_private.exact_v1(v,array['schemaVersion','revision','controls','budgets','retiredOperations','erasedActors']) is not true
  or v->>'schemaVersion' is distinct from 'ops-control-restore/1' or ops_control_private.revision_v1(v->'revision') is not true
  or jsonb_typeof(v->'controls') is distinct from 'array' or jsonb_array_length(v->'controls')<>12
  or jsonb_typeof(v->'budgets') is distinct from 'array' or jsonb_array_length(v->'budgets')>10000
  or jsonb_typeof(v->'retiredOperations') is distinct from 'array' or jsonb_array_length(v->'retiredOperations')>10000
  or jsonb_typeof(v->'erasedActors') is distinct from 'array' or jsonb_array_length(v->'erasedActors')>10000
  then raise exception 'OPS_INVALID_INPUT';end if;
 digest_n:=encode(sha256(convert_to(v::text,'UTF8')),'hex');
 if p_expected_manifest_digest is null or digest_n<>p_expected_manifest_digest then raise exception 'OPS_UNAVAILABLE';end if;
 if(select count(distinct(e.value->'scope')::text) from jsonb_array_elements(v->'controls') e(value))<>12
  or(select count(distinct e.value->>'scopeId') from jsonb_array_elements(v->'budgets') e(value))<>jsonb_array_length(v->'budgets')
  or(select count(distinct e.value->>'operationId') from jsonb_array_elements(v->'retiredOperations') e(value))<>jsonb_array_length(v->'retiredOperations')
  or(select count(distinct e.value::text) from jsonb_array_elements(v->'erasedActors') e(value))<>jsonb_array_length(v->'erasedActors')
  then raise exception 'OPS_INVALID_INPUT';end if;
 for x in select value from jsonb_array_elements(v->'controls') loop
  if ops_control_private.exact_v1(x,array['scope','stopRevision']) is not true
   or ops_control_private.exact_v1(x->'scope',array['kind','key']) is not true
   or ops_control_private.revision_v1(x->'stopRevision') is not true
   or not exists(select 1 from ops_control_private.controls_v1 where kind=x->'scope'->>'kind' and key=x->'scope'->>'key')
   or(x->>'stopRevision')::bigint>(v->>'revision')::bigint then raise exception 'OPS_INVALID_INPUT';end if;
 end loop;
 for x in select value from jsonb_array_elements(v->'budgets') loop
  if ops_control_private.exact_v1(x,array['scopeId','scopeCreatedAt','revision','stopRevision','retired']) is not true
   or ops_control_private.uuid_v1(x->'scopeId') is not true or jsonb_typeof(x->'scopeCreatedAt') is distinct from 'string'
   or(x->>'scopeCreatedAt')::timestamptz is null or jsonb_typeof(x->'retired') is distinct from 'boolean'
   or ops_control_private.revision_v1(x->'revision') is not true or ops_control_private.revision_v1(x->'stopRevision') is not true
   or(x->>'stopRevision')::bigint>(x->>'revision')::bigint then raise exception 'OPS_INVALID_INPUT';end if;
 end loop;
 for x in select value from jsonb_array_elements(v->'retiredOperations') loop
  if ops_control_private.exact_v1(x,array['operationId','action','revision','appliedAt']) is not true
   or ops_control_private.uuid_v1(x->'operationId') is not true or coalesce(x->>'action','') not in('set','budget_resume')
   or ops_control_private.revision_v1(x->'revision') is not true or(x->>'revision')::bigint<1
   or jsonb_typeof(x->'appliedAt') is distinct from 'string' or(x->>'appliedAt')::timestamptz is null
   then raise exception 'OPS_INVALID_INPUT';end if;
 end loop;
 for x in select value from jsonb_array_elements(v->'erasedActors') loop
  if ops_control_private.uuid_v1(x) is not true then raise exception 'OPS_INVALID_INPUT';end if;
 end loop;
 -- Strict installed metadata is generated from the exact verified full-body package.
 -- Missing/unknown implementation cannot open a restore fence.
 if ops_control_private.installed_supported_v1() is not true then raise exception 'OPS_UNAVAILABLE';end if;
 -- Preserve existing budget-before-control order. Every late lock is NOWAIT.
 perform 1 from public.model_budget_scopes order by id for update nowait;
 perform 1 from ops_control_private.budget_fences_v1 order by scope_id for update nowait;
 perform 1 from ops_control_private.operations_v1 order by operation_id for update nowait;
 perform 1 from ops_control_private.root_v1 where singleton for update nowait;
 if not found then raise exception 'OPS_UNAVAILABLE';end if;
 for x in select value from jsonb_array_elements(v->'budgets') loop
  select * into s from public.model_budget_scopes where id=(x->>'scopeId')::uuid;
  if not found or s.created_at is distinct from(x->>'scopeCreatedAt')::timestamptz or(x->>'retired')::boolean then
   insert into ops_control_private.budget_fences_v1(scope_id,scope_created_at,revision,stop_revision,retired)
    values((x->>'scopeId')::uuid,(x->>'scopeCreatedAt')::timestamptz,(x->>'revision')::bigint,(x->>'stopRevision')::bigint,true)
   on conflict(scope_id) do update set retired=true,owner_id=null,
    revision=greatest(ops_control_private.budget_fences_v1.revision,excluded.revision),
    stop_revision=greatest(ops_control_private.budget_fences_v1.stop_revision,excluded.stop_revision);
  else
   update ops_control_private.budget_fences_v1 set revision=greatest(revision,(x->>'revision')::bigint),
    stop_revision=greatest(stop_revision,(x->>'stopRevision')::bigint) where scope_id=s.id;
  end if;
 end loop;
 for s in select * from public.model_budget_scopes order by id loop
  perform public.stop_model_budget(s.id,s.owner_id);
 end loop;
 for x in select value from jsonb_array_elements(v->'retiredOperations') loop
  update ops_control_private.operations_v1 set retired=true,actor_id=null,input=null,receipt=null
   where operation_id=(x->>'operationId')::uuid and not retired;
  insert into ops_control_private.operations_v1(operation_id,action,revision,applied_at,retired)
   values((x->>'operationId')::uuid,x->>'action',(x->>'revision')::bigint,(x->>'appliedAt')::timestamptz,true)
   on conflict(operation_id) do nothing;
 end loop;
 update ops_control_private.operations_v1 set retired=true,actor_id=null,input=null,receipt=null
  where not retired and actor_id in(select(e.value#>>'{}')::uuid from jsonb_array_elements(v->'erasedActors') e(value));
 update ops_control_private.budget_fences_v1 set retired=true,owner_id=null,revision=revision+1
  where not retired and owner_id in(select(e.value#>>'{}')::uuid from jsonb_array_elements(v->'erasedActors') e(value));
 select greatest(revision,(v->>'revision')::bigint)+1 into revision_n from ops_control_private.root_v1 where singleton;
 if revision_n>9007199254740990 then raise exception 'OPS_UNAVAILABLE';end if;
 for x in select value from jsonb_array_elements(v->'controls') loop
  update ops_control_private.controls_v1 set state='disabled',revision=revision_n,
   stop_revision=greatest(stop_revision,(x->>'stopRevision')::bigint,revision_n)
   where kind=x->'scope'->>'kind' and key=x->'scope'->>'key';
 end loop;
 update ops_control_private.root_v1 set revision=revision_n,recovery_boot=pg_postmaster_start_time(),
  recovery_database_oid=(select oid from pg_database where datname=current_database()),recovery_manifest=digest_n where singleton;
end $$;
revoke all on function ops_control_private.export_actor_operations_v1(uuid),
 ops_control_private.reconcile_restore_v1(jsonb,text) from public,anon,authenticated,service_role;
