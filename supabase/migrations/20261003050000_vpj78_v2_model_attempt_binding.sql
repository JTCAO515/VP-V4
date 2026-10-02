-- Private correlation of one existing reserved model attempt and exact v2 basis.
-- No reserve, dispatch, settlement, model output, permit, completion or API grant.
create table turn_private.planning_v2_model_attempt_bindings (
 turn_id uuid primary key references turn_private.planning_comparisons(turn_id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 task_id uuid not null references turn_private.service_tasks(id) on delete cascade,
 claim_lease uuid not null,
 text_policy_id uuid not null references turn_private.text_policies(id),
 planning_policy_id uuid not null references turn_private.planning_policies(id),
 scope_id uuid not null,
 attempt_id uuid not null,
 provider text not null check(provider='qwen'),
 model text not null check(model ~ '^[A-Za-z0-9._-]{1,100}$'),
 price_version text not null check(price_version ~ '^[A-Za-z0-9._-]{1,100}$'),
 intake_digest text not null check(intake_digest ~ '^[a-f0-9]{64}$'),
 planning_digest text not null check(planning_digest ~ '^[a-f0-9]{64}$' and planning_digest<>intake_digest),
 bound_at timestamptz not null default clock_timestamp(),
 unknown_at timestamptz,
 unique(scope_id,attempt_id),
 foreign key(scope_id,attempt_id) references public.model_budget_attempts(scope_id,attempt_id) on delete cascade
);
create index planning_v2_model_binding_owner on turn_private.planning_v2_model_attempt_bindings(owner_id,turn_id);
alter table turn_private.planning_v2_model_attempt_bindings enable row level security;
revoke all on turn_private.planning_v2_model_attempt_bindings from public,anon,authenticated,service_role;

create function turn_private.guard_planning_v2_model_binding_v1() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='INSERT' then
  if new.unknown_at is not null or not exists(select 1 from turn_private.planning_comparisons j
   join turn_private.service_tasks t on t.id=j.task_id
   join public.model_budget_attempts a on a.scope_id=new.scope_id and a.attempt_id=new.attempt_id
   join public.model_budget_scopes s on s.id=a.scope_id
   where j.turn_id=new.turn_id and j.owner_id=new.owner_id and j.task_id=new.task_id and j.planning_policy_id=new.planning_policy_id
    and t.owner_id=new.owner_id and t.policy_id=new.text_policy_id and t.budget_scope_id=new.scope_id
    and a.task_id=new.task_id and a.status='reserved' and s.owner_id=new.owner_id
    and a.provider=new.provider and a.model=new.model and a.price_version=new.price_version)
   then raise exception 'MODEL_BINDING_IDENTITY_CONFLICT';end if;
 else
  if (to_jsonb(new)-'unknown_at') is distinct from (to_jsonb(old)-'unknown_at') or old.unknown_at is not null or new.unknown_at is null or new.unknown_at>clock_timestamp()
   then raise exception 'IMMUTABLE_MODEL_BINDING';end if;
 end if;
 return new;
end $$;
create trigger guard_planning_v2_model_binding before insert or update on turn_private.planning_v2_model_attempt_bindings for each row execute function turn_private.guard_planning_v2_model_binding_v1();
revoke all on function turn_private.guard_planning_v2_model_binding_v1() from public,anon,authenticated,service_role;

create function turn_private.planning_v2_model_binding_basis_v1(
 p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_text_policy uuid,p_planning_policy uuid,p_scope uuid,p_attempt uuid,p_provider text,p_model text,p_price_version text,p_intake_digest text,p_planning_digest text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare q jsonb;t turn_private.service_tasks%rowtype;s public.model_budget_scopes%rowtype;a public.model_budget_attempts%rowtype;l public.model_budget_provider_limits%rowtype;
begin
 if p_owner is null or p_task is null or p_turn is null or p_lease is null or p_text_policy is null or p_planning_policy is null or p_scope is null or p_attempt is null
  or p_provider is distinct from 'qwen' or p_model is null or p_model !~ '^[A-Za-z0-9._-]{1,100}$' or p_price_version is null or p_price_version !~ '^[A-Za-z0-9._-]{1,100}$'
  or p_intake_digest is null or p_planning_digest is null or p_intake_digest !~ '^[a-f0-9]{64}$' or p_planning_digest !~ '^[a-f0-9]{64}$' or p_intake_digest=p_planning_digest then return null;end if;
 -- Final Main-approved order: actor prelude -> same-owner Task -> existing
 -- qualified read (reentrant actor/session/Turn/thread/work/basis) -> scope/attempt -> binding.
 perform 1 from auth.users where id=p_owner for key share nowait;if not found then return null;end if;
 perform 1 from identity_private.mobile_accounts where owner_id=p_owner for update;if not found then return null;end if;
 select * into t from turn_private.service_tasks where id=p_task and owner_id=p_owner for update nowait;
 if not found or t.policy_id<>p_text_policy or t.budget_scope_id is distinct from p_scope or t.last_turn_id<>p_turn
  or not exists(select 1 from turn_private.planning_policies p where p.id=p_planning_policy and p.text_policy_id=p_text_policy) then return null;end if;
 q:=turn_private.read_planning_qualified_intake_v1(p_owner,p_turn,p_lease);
 if q->>'kind' is distinct from 'planning_intake_input' or q->>'ownerId' is distinct from p_owner::text or q->>'taskId' is distinct from p_task::text or q->>'turnId' is distinct from p_turn::text
  or q->>'planningPolicyId' is distinct from p_planning_policy::text or q->>'provider' is distinct from p_provider
  or q->>'intakeContextDigest' is distinct from p_intake_digest or q->>'planningContextDigest' is distinct from p_planning_digest
  or q->'executionAvailable' is distinct from 'false'::jsonb or q->'readyForProvider' is distinct from 'false'::jsonb then return null;end if;
 select * into s from public.model_budget_scopes where id=p_scope for share nowait;
 if not found or s.owner_id<>p_owner then return null;end if;
 select * into a from public.model_budget_attempts where scope_id=p_scope and attempt_id=p_attempt for share nowait;
 if not found or a.task_id<>p_task or a.provider<>p_provider or a.model<>p_model or a.price_version<>p_price_version
  or a.status not in ('reserved','dispatched','pending','settled','released') or (a.status='settled') is distinct from (a.actual_micros is not null) then return null;end if;
 -- Ambiguous/foreign-scope attempts cannot hide behind a later released row or selected identity.
 if (select count(*) from public.model_budget_attempts where task_id=p_task)<>1 then return null;end if;
 select * into l from public.model_budget_provider_limits where scope_id=p_scope and provider=p_provider for share nowait;
 if not found or l.model<>p_model or l.price_version<>p_price_version then return null;end if;
 return jsonb_build_object('status',a.status,'reservedMicros',a.reserved_micros,'actualMicros',a.actual_micros,
  'scopeLive',s.enabled and not s.frozen and s.expires_at>clock_timestamp() and l.enabled);
exception when lock_not_available then return null;
end $$;
revoke all on function turn_private.planning_v2_model_binding_basis_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text) from public,anon,authenticated,service_role;

create function turn_private.read_planning_v2_model_binding_v1(
 p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_text_policy uuid,p_planning_policy uuid,p_scope uuid,p_attempt uuid,p_provider text,p_model text,p_price_version text,p_intake_digest text,p_planning_digest text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare q jsonb;b turn_private.planning_v2_model_attempt_bindings%rowtype;
begin
 q:=turn_private.planning_v2_model_binding_basis_v1(p_owner,p_task,p_turn,p_lease,p_text_policy,p_planning_policy,p_scope,p_attempt,p_provider,p_model,p_price_version,p_intake_digest,p_planning_digest);
 if q is null then return jsonb_build_object('kind','blocked');end if;
 select * into b from turn_private.planning_v2_model_attempt_bindings where turn_id=p_turn for share nowait;
 if not found or b.owner_id<>p_owner or b.task_id<>p_task or b.claim_lease<>p_lease or b.text_policy_id<>p_text_policy or b.planning_policy_id<>p_planning_policy
  or b.scope_id<>p_scope or b.attempt_id<>p_attempt or b.provider<>p_provider or b.model<>p_model or b.price_version<>p_price_version or b.intake_digest<>p_intake_digest or b.planning_digest<>p_planning_digest then return jsonb_build_object('kind','blocked');end if;
 return jsonb_build_object('kind','model_attempt_binding','schemaVersion','planning-v2-model-binding/1','ownerId',p_owner,'taskId',p_task,'turnId',p_turn,'textPolicyId',p_text_policy,'planningPolicyId',p_planning_policy,
  'scopeId',p_scope,'attemptId',p_attempt,'provider',p_provider,'model',p_model,'priceVersion',p_price_version,'intakeContextDigest',p_intake_digest,'planningContextDigest',p_planning_digest,
  'ledgerStatus',q->'status','reservedMicros',q->'reservedMicros','actualMicros',q->'actualMicros','unknown',b.unknown_at is not null,
  'reconciliationRequired',b.unknown_at is not null or q->>'status' in ('dispatched','pending','settled'),
  'executionAllowed',false,'executionAvailable',false,'readyForProvider',false);
exception when lock_not_available then return jsonb_build_object('kind','blocked');
end $$;
revoke all on function turn_private.read_planning_v2_model_binding_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text) from public,anon,authenticated,service_role;

create function turn_private.bind_planning_v2_model_attempt_v1(
 p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_text_policy uuid,p_planning_policy uuid,p_scope uuid,p_attempt uuid,p_provider text,p_model text,p_price_version text,p_intake_digest text,p_planning_digest text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare q jsonb;b turn_private.planning_v2_model_attempt_bindings%rowtype;readback jsonb;
begin
 q:=turn_private.planning_v2_model_binding_basis_v1(p_owner,p_task,p_turn,p_lease,p_text_policy,p_planning_policy,p_scope,p_attempt,p_provider,p_model,p_price_version,p_intake_digest,p_planning_digest);
 if q is null then return jsonb_build_object('kind','blocked');end if;
 select * into b from turn_private.planning_v2_model_attempt_bindings where turn_id=p_turn for update nowait;
 if found then
  readback:=turn_private.read_planning_v2_model_binding_v1(p_owner,p_task,p_turn,p_lease,p_text_policy,p_planning_policy,p_scope,p_attempt,p_provider,p_model,p_price_version,p_intake_digest,p_planning_digest);
  if readback->>'kind' is distinct from 'model_attempt_binding' then return jsonb_build_object('kind','blocked');end if;
  return readback||jsonb_build_object('reused',true);
 end if;
 if q->>'status'<>'reserved' or q->'scopeLive' is distinct from 'true'::jsonb then return jsonb_build_object('kind','blocked');end if;
 insert into turn_private.planning_v2_model_attempt_bindings(turn_id,owner_id,task_id,claim_lease,text_policy_id,planning_policy_id,scope_id,attempt_id,provider,model,price_version,intake_digest,planning_digest)
 values(p_turn,p_owner,p_task,p_lease,p_text_policy,p_planning_policy,p_scope,p_attempt,p_provider,p_model,p_price_version,p_intake_digest,p_planning_digest);
 readback:=turn_private.read_planning_v2_model_binding_v1(p_owner,p_task,p_turn,p_lease,p_text_policy,p_planning_policy,p_scope,p_attempt,p_provider,p_model,p_price_version,p_intake_digest,p_planning_digest);
 if readback->>'kind' is distinct from 'model_attempt_binding' then raise exception 'MODEL_BINDING_READBACK_FAILED';end if;
 return readback||jsonb_build_object('reused',false);
exception when lock_not_available or unique_violation then return jsonb_build_object('kind','blocked');
end $$;
revoke all on function turn_private.bind_planning_v2_model_attempt_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text) from public,anon,authenticated,service_role;

create function turn_private.unknown_planning_v2_model_attempt_v1(
 p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_text_policy uuid,p_planning_policy uuid,p_scope uuid,p_attempt uuid,p_provider text,p_model text,p_price_version text,p_intake_digest text,p_planning_digest text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare q jsonb;b turn_private.planning_v2_model_attempt_bindings%rowtype;receipt jsonb;
begin
 q:=turn_private.planning_v2_model_binding_basis_v1(p_owner,p_task,p_turn,p_lease,p_text_policy,p_planning_policy,p_scope,p_attempt,p_provider,p_model,p_price_version,p_intake_digest,p_planning_digest);
 if q is null then return jsonb_build_object('kind','blocked');end if;
 select * into b from turn_private.planning_v2_model_attempt_bindings where turn_id=p_turn for update nowait;
 if not found then return jsonb_build_object('kind','blocked');end if;
 receipt:=turn_private.read_planning_v2_model_binding_v1(p_owner,p_task,p_turn,p_lease,p_text_policy,p_planning_policy,p_scope,p_attempt,p_provider,p_model,p_price_version,p_intake_digest,p_planning_digest);
 if receipt->>'kind' is distinct from 'model_attempt_binding' then return jsonb_build_object('kind','blocked');end if;
 if b.unknown_at is null then update turn_private.planning_v2_model_attempt_bindings set unknown_at=clock_timestamp() where turn_id=p_turn;end if;
 return jsonb_build_object('kind','unknown','reused',b.unknown_at is not null,'executionAllowed',false);
exception when lock_not_available then return jsonb_build_object('kind','blocked');
end $$;
revoke all on function turn_private.unknown_planning_v2_model_attempt_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text) from public,anon,authenticated,service_role;
