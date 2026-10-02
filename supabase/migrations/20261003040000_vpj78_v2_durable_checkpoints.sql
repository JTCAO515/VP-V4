-- Private durable protocol checkpoints. No claimer, permit, dispatch or completion authority.
create table turn_private.planning_v2_place_checkpoints (
 turn_id uuid primary key references turn_private.planning_comparisons(turn_id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 task_id uuid not null references turn_private.service_tasks(id) on delete cascade,
 claim_lease uuid not null,
 intake_digest text not null check(intake_digest ~ '^[a-f0-9]{64}$'),
 planning_digest text not null check(planning_digest ~ '^[a-f0-9]{64}$' and planning_digest<>intake_digest),
 state text not null check(state in ('started','unknown','completed')),
 started_at timestamptz not null default clock_timestamp(),
 observation jsonb,
 completed_at timestamptz,
 check((state='completed')=(observation is not null and completed_at is not null)),
 check(state='completed' or (observation is null and completed_at is null))
);
create index planning_v2_checkpoint_owner_keyset on turn_private.planning_v2_place_checkpoints(owner_id,turn_id);
alter table turn_private.planning_v2_place_checkpoints enable row level security;
revoke all on turn_private.planning_v2_place_checkpoints from public,anon,authenticated,service_role;

create function turn_private.guard_planning_v2_checkpoint_v1() returns trigger language plpgsql set search_path='' as $$
declare env text;
begin
 if TG_OP='INSERT' then
  if new.state<>'started' or not exists(select 1 from turn_private.planning_comparisons j where j.turn_id=new.turn_id and j.owner_id=new.owner_id and j.task_id=new.task_id)
   then raise exception 'CHECKPOINT_IDENTITY_CONFLICT';end if;
 else
  if (to_jsonb(new)-array['state','observation','completed_at']) is distinct from (to_jsonb(old)-array['state','observation','completed_at'])
   or old.state<>'started' or new.state not in ('unknown','completed') then raise exception 'IMMUTABLE_CHECKPOINT';end if;
 end if;
 if new.state='completed' then
  select p.environment into env from turn_private.planning_comparisons j join turn_private.planning_policies p on p.id=j.planning_policy_id where j.turn_id=new.turn_id;
  if not turn_private.valid_planning_v2_place_v1(new.observation,env) then raise exception 'INVALID_CHECKPOINT_OBSERVATION';end if;
 end if;
 return new;
end $$;
create trigger guard_planning_v2_checkpoint before insert or update on turn_private.planning_v2_place_checkpoints for each row execute function turn_private.guard_planning_v2_checkpoint_v1();
revoke all on function turn_private.guard_planning_v2_checkpoint_v1() from public,anon,authenticated,service_role;

create function turn_private.planning_v2_checkpoint_basis_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_intake_digest text,p_planning_digest text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q jsonb;
begin
 if p_owner is null or p_task is null or p_turn is null or p_lease is null or p_intake_digest is null or p_planning_digest is null
  or p_intake_digest !~ '^[a-f0-9]{64}$' or p_planning_digest !~ '^[a-f0-9]{64}$' or p_intake_digest=p_planning_digest then return null;end if;
 -- Existing helper holds auth/account/session/Turn/thread -> work, then current basis locks.
 -- Never use its queued + NULL lease admission preview branch here.
 q:=turn_private.read_planning_qualified_intake_v1(p_owner,p_turn,p_lease);
 if q->>'kind' is distinct from 'planning_intake_input' or q->>'ownerId' is distinct from p_owner::text or q->>'taskId' is distinct from p_task::text
  or q->>'turnId' is distinct from p_turn::text or q->>'intakeContextDigest' is distinct from p_intake_digest or q->>'planningContextDigest' is distinct from p_planning_digest
  or q->'executionAvailable' is distinct from 'false'::jsonb or q->'readyForProvider' is distinct from 'false'::jsonb then return null;end if;
 return q;
end $$;
revoke all on function turn_private.planning_v2_checkpoint_basis_v1(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;

create function turn_private.valid_planning_v2_place_v1(v jsonb,p_environment text) returns boolean language plpgsql stable set search_path='' as $$
declare observed timestamptz;area jsonb;ids text[]:=array[]::text[];
begin
 if v is null or jsonb_typeof(v)<>'object' or v-array['schemaVersion','source','observedAt','providerCalls','areas']<>'{}'::jsonb
  or (select count(*) from jsonb_object_keys(v))<>5 or v->>'schemaVersion' is distinct from 'planning-place/1'
  or p_environment not in ('local_synthetic','staging') or p_environment is null
  or v->>'source' is distinct from (case when p_environment='staging' then 'amap' else 'synthetic_fixture' end)
  or jsonb_typeof(v->'observedAt') is distinct from 'string' or length(v->>'observedAt')>40
  or (v->>'observedAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$'
  or jsonb_typeof(v->'providerCalls') is distinct from 'number' or (v->>'providerCalls') !~ '^(0|[1-9][0-9]*)$' or (v->>'providerCalls')::numeric>13
  or jsonb_typeof(v->'areas') is distinct from 'array' or jsonb_array_length(v->'areas')<>2 then return false;end if;
 observed:=(v->>'observedAt')::timestamptz;
 if observed<clock_timestamp()-interval '5 minutes' or observed>clock_timestamp()+interval '5 seconds' then return false;end if;
 for area in select value from jsonb_array_elements(v->'areas') loop
  if jsonb_typeof(area)<>'object' or area-array['id','label','railMinutes','transfers']<>'{}'::jsonb or (select count(*) from jsonb_object_keys(area))<>4
   or area->>'id' is null or area->>'id' not in ('jingan','peoples_square') or area->>'id'=any(ids)
   or jsonb_typeof(area->'label') is distinct from 'string' or (length(area->>'label')+(select count(*) from regexp_split_to_table(area->>'label','') c where ascii(c)>65535)) not between 1 and 80 or area->>'label'<>btrim(area->>'label') then return false;end if;
  ids:=array_append(ids,area->>'id');
  if area->'railMinutes' is distinct from 'null'::jsonb and (jsonb_typeof(area->'railMinutes') is distinct from 'number' or (area->>'railMinutes') !~ '^(0|[1-9][0-9]*)$' or (area->>'railMinutes')::numeric>180) then return false;end if;
  if area->'transfers' is distinct from 'null'::jsonb and (jsonb_typeof(area->'transfers') is distinct from 'number' or (area->>'transfers') !~ '^(0|[1-9][0-9]*)$' or (area->>'transfers')::numeric>5) then return false;end if;
 end loop;
 return true;
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation or numeric_value_out_of_range then return false;
end $$;
revoke all on function turn_private.valid_planning_v2_place_v1(jsonb,text) from public,anon,authenticated,service_role;

create function turn_private.planning_v2_model_attempt_v1(p_owner uuid,p_task uuid) returns text language sql stable security definer set search_path='' as $$
 select case when count(*)=0 then 'none' when count(*)<>1 or bool_or(s.owner_id is distinct from p_owner)
  or bool_or(a.scope_id is distinct from t.budget_scope_id) or bool_or(a.status not in ('released','reserved','dispatched','pending','settled')) then 'pending'
  else min(a.status) end
 from public.model_budget_attempts a left join public.model_budget_scopes s on s.id=a.scope_id left join turn_private.service_tasks t on t.id=p_task and t.owner_id=p_owner where a.task_id=p_task
$$;
revoke all on function turn_private.planning_v2_model_attempt_v1(uuid,uuid) from public,anon,authenticated,service_role;

create function turn_private.read_planning_v2_checkpoints_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_intake_digest text,p_planning_digest text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q jsonb;r turn_private.planning_v2_place_checkpoints%rowtype;place jsonb;env text;
begin
 q:=turn_private.planning_v2_checkpoint_basis_v1(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);if q is null then return jsonb_build_object('kind','blocked');end if;
 select * into r from turn_private.planning_v2_place_checkpoints where turn_id=p_turn for update;
 if not found then place:=jsonb_build_object('state','missing');
 else
  if r.owner_id<>p_owner or r.task_id<>p_task or r.intake_digest<>p_intake_digest or r.planning_digest<>p_planning_digest then return jsonb_build_object('kind','blocked');end if;
  if r.state='completed' then
   select environment into env from turn_private.planning_policies where id=(q->>'planningPolicyId')::uuid;
   if not turn_private.valid_planning_v2_place_v1(r.observation,env) then return jsonb_build_object('kind','blocked');end if;
   place:=jsonb_build_object('state','completed','observation',r.observation);
  else place:=jsonb_build_object('state',r.state);end if;
 end if;
 return jsonb_build_object('schemaVersion','planning-v2-checkpoints/1','ownerId',p_owner,'taskId',p_task,'turnId',p_turn,'intakeContextDigest',p_intake_digest,'planningContextDigest',p_planning_digest,'place',place,'modelAttempt',turn_private.planning_v2_model_attempt_v1(p_owner,p_task));
end $$;
revoke all on function turn_private.read_planning_v2_checkpoints_v1(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;

create function turn_private.claim_planning_v2_place_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_intake_digest text,p_planning_digest text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q jsonb;added uuid;snapshot jsonb;
begin
 q:=turn_private.planning_v2_checkpoint_basis_v1(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);if q is null then return jsonb_build_object('kind','blocked');end if;
 if turn_private.planning_v2_model_attempt_v1(p_owner,p_task) not in ('none','released') then return jsonb_build_object('kind','unknown');end if;
 insert into turn_private.planning_v2_place_checkpoints(turn_id,owner_id,task_id,claim_lease,intake_digest,planning_digest,state)
 values(p_turn,p_owner,p_task,p_lease,p_intake_digest,p_planning_digest,'started') on conflict(turn_id) do nothing returning turn_id into added;
 if added is not null then return jsonb_build_object('kind','claimed');end if;
 snapshot:=turn_private.read_planning_v2_checkpoints_v1(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);
 if snapshot->'place'->>'state'='unknown' then return jsonb_build_object('kind','unknown');end if;
 if snapshot->>'kind'='blocked' then return snapshot;end if;
 return jsonb_build_object('kind','duplicate');
end $$;
revoke all on function turn_private.claim_planning_v2_place_v1(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;

create function turn_private.save_planning_v2_place_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_intake_digest text,p_planning_digest text,p_observation jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare q jsonb;r turn_private.planning_v2_place_checkpoints%rowtype;env text;
begin
 q:=turn_private.planning_v2_checkpoint_basis_v1(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);if q is null then return false;end if;
 select * into r from turn_private.planning_v2_place_checkpoints where turn_id=p_turn for update;
 if not found or r.owner_id<>p_owner or r.task_id<>p_task or r.claim_lease<>p_lease or r.intake_digest<>p_intake_digest or r.planning_digest<>p_planning_digest or r.state<>'started' then return false;end if;
 select environment into env from turn_private.planning_policies where id=(q->>'planningPolicyId')::uuid;
 if not turn_private.valid_planning_v2_place_v1(p_observation,env) then return false;end if;
 update turn_private.planning_v2_place_checkpoints set state='completed',observation=p_observation,completed_at=clock_timestamp() where turn_id=p_turn;
 return true;
end $$;
revoke all on function turn_private.save_planning_v2_place_v1(uuid,uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;

create function turn_private.unknown_planning_v2_place_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_intake_digest text,p_planning_digest text)
returns boolean language plpgsql security definer set search_path='' as $$
declare q jsonb;r turn_private.planning_v2_place_checkpoints%rowtype;
begin
 q:=turn_private.planning_v2_checkpoint_basis_v1(p_owner,p_task,p_turn,p_lease,p_intake_digest,p_planning_digest);if q is null then return false;end if;
 select * into r from turn_private.planning_v2_place_checkpoints where turn_id=p_turn for update;
 if not found or r.owner_id<>p_owner or r.task_id<>p_task or r.claim_lease<>p_lease or r.intake_digest<>p_intake_digest or r.planning_digest<>p_planning_digest or r.state<>'started' then return false;end if;
 update turn_private.planning_v2_place_checkpoints set state='unknown' where turn_id=p_turn;return true;
end $$;
revoke all on function turn_private.unknown_planning_v2_place_v1(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;

-- Main explicitly authorized this bounded data-rights export only; no private execution grants.
create function public.planning_v2_checkpoint_export_owner_v1(p_owner uuid,p_after_turn_id uuid default null,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare items jsonb;more boolean;last_id uuid;
begin
 if (select auth.role()) is distinct from 'service_role' or p_owner is null then raise exception 'FORBIDDEN';end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'INVALID_INPUT';end if;
 if p_after_turn_id is not null and not exists(select 1 from turn_private.planning_v2_place_checkpoints where owner_id=p_owner and turn_id=p_after_turn_id) then raise exception 'INVALID_EXPORT_CURSOR';end if;
 with candidates as(select * from turn_private.planning_v2_place_checkpoints where owner_id=p_owner and (p_after_turn_id is null or turn_id>p_after_turn_id) order by turn_id limit p_limit+1),
 delivered as(select * from candidates order by turn_id limit p_limit)
 select coalesce((select jsonb_agg(jsonb_build_object('turnId',d.turn_id,'ownerId',d.owner_id,'taskId',d.task_id,'state',d.state,'startedAt',d.started_at,'completedAt',d.completed_at,'observation',d.observation) order by d.turn_id) from delivered d),'[]'),
 (select count(*)>p_limit from candidates),(select turn_id from delivered order by turn_id desc limit 1) into items,more,last_id;
 return jsonb_build_object('schemaVersion','planning-v2-checkpoint-export/1','items',items,'hasMore',more,'nextCursor',case when more then last_id else null end,'sectionComplete',not more);
end $$;
revoke all on function public.planning_v2_checkpoint_export_owner_v1(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.planning_v2_checkpoint_export_owner_v1(uuid,uuid,integer) to service_role;
notify pgrst,'reload schema';
