-- VPJ-35 U2 preparation: U1 capacity is exclusively for text-answer tasks.
-- A Trip confirmation receipt alone is never an authority to reserve or settle it.
-- Keep this guard until a separately admitted, producer-bound Trip task has its
-- own atomic confirmation/settlement contract. No existing row is changed.
create function turn_private.guard_text_capacity_scope()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_thread_id uuid; v_task turn_private.service_tasks%rowtype; v_thread public.chat_threads%rowtype;
begin
  -- Match U1 admission's thread -> task order. Plain SELECTs here would let
  -- concurrent task relabeling or Trip rebinding commit against an unseen row.
  select s.thread_id into v_thread_id from turn_private.service_tasks s where s.id=new.task_id;
  if not found then raise exception 'SERVICE_TASK_CAPACITY_SCOPE_CONFLICT'; end if;
  select * into v_thread from public.chat_threads h where h.id=v_thread_id for share;
  if not found then raise exception 'SERVICE_TASK_CAPACITY_SCOPE_CONFLICT'; end if;
  select * into v_task from turn_private.service_tasks s where s.id=new.task_id for share;
  if not found or v_task.owner_id is distinct from new.owner_id
    or v_task.thread_id is distinct from v_thread.id
    or v_task.expected_result<>'text_answer' or v_thread.owner_id is distinct from new.owner_id
    or v_thread.trip_id is not null
  then raise exception 'SERVICE_TASK_CAPACITY_SCOPE_CONFLICT'; end if;
  return new;
end $$;
revoke all on function turn_private.guard_text_capacity_scope() from public,anon,authenticated,service_role;
create trigger guard_text_capacity_scope before insert or update on turn_private.service_task_capacity
for each row execute function turn_private.guard_text_capacity_scope();

-- A later task-type change cannot reclassify an already reserved or settled
-- text goal as a Trip result. This also protects record-only to enforced upgrades.
create function turn_private.guard_metered_task_type()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from turn_private.service_task_capacity c where c.task_id=new.id)
    and (new.expected_result<>'text_answer' or new.owner_id<>old.owner_id
      or new.thread_id<>old.thread_id)
  then raise exception 'SERVICE_TASK_CAPACITY_SCOPE_CONFLICT'; end if;
  return new;
end $$;
revoke all on function turn_private.guard_metered_task_type() from public,anon,authenticated,service_role;
create trigger guard_metered_task_type before update on turn_private.service_tasks
for each row execute function turn_private.guard_metered_task_type();

create function turn_private.guard_metered_thread_trip()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.trip_id is distinct from old.trip_id and exists (
    select 1 from turn_private.service_tasks s
    join turn_private.service_task_capacity c on c.task_id=s.id
    where s.thread_id=old.id and s.owner_id=old.owner_id
  ) then raise exception 'SERVICE_TASK_CAPACITY_SCOPE_CONFLICT'; end if;
  return new;
end $$;
revoke all on function turn_private.guard_metered_thread_trip() from public,anon,authenticated,service_role;
create trigger guard_metered_thread_trip before update of trip_id on public.chat_threads
for each row execute function turn_private.guard_metered_thread_trip();
