-- VPJ-11: versioned Undo for one explicitly created Memory Profile.
-- Existing Memory/Profile authorities and prior lifecycle RPCs remain intact.
alter table public.memory_profiles
  add column revision bigint not null default 1
  check (revision between 1 and 9007199254740990);

create schema if not exists memory_private;
revoke all on schema memory_private from public, anon, authenticated;

create function memory_private.bump_profile_revision_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.revision >= 9007199254740990 then raise exception 'MEMORY_REVISION_EXHAUSTED'; end if;
  new.revision := old.revision + 1;
  return new;
end $$;
revoke all on function memory_private.bump_profile_revision_v1() from public, anon, authenticated, service_role;
create trigger memory_profile_revision_v1 before update on public.memory_profiles
  for each row execute function memory_private.bump_profile_revision_v1();

-- Keep the old create RPC wire compatible. Its row lock/insert is held until this
-- wrapper returns, so the returned source receipt and revision describe that write.
create function public.create_explicit_memory_profile_v2(
  p_memory_id uuid, p_receipt_id uuid, p_consent_id uuid,
  p_constraint_kind text, p_summary text
)
returns table(memory_id uuid, state text, reused boolean, revision bigint, source_receipt_id uuid)
language plpgsql security definer set search_path = '' as $$
declare created record; current_profile public.memory_profiles%rowtype; current_consent text;
begin
  perform identity_private.guard_mobile_rpc_v2();
  select * into created from public.create_explicit_memory_profile(
    p_memory_id, p_receipt_id, p_consent_id, p_constraint_kind, p_summary);
  select * into current_profile from public.memory_profiles
    where id = created.memory_id and owner_id = (select auth.uid()) for update;
  if not found or current_profile.source_receipt_id is distinct from p_receipt_id
    or current_profile.state is distinct from 'explicit' then
    raise exception 'MEMORY_CONFLICT';
  end if;
  select status into current_consent from public.memory_consents
    where id = current_profile.consent_id and owner_id = (select auth.uid()) for update;
  if not found or current_consent is distinct from 'granted' then
    raise exception 'CONSENT_REQUIRED';
  end if;
  return query select created.memory_id, created.state, created.reused,
    current_profile.revision, current_profile.source_receipt_id;
end $$;
revoke all on function public.create_explicit_memory_profile_v2(uuid,uuid,uuid,text,text)
  from public, anon, service_role;
grant execute on function public.create_explicit_memory_profile_v2(uuid,uuid,uuid,text,text)
  to authenticated;

-- A successful Undo tombstones only the exact newly created revision. Replaying
-- the same operation reports its existing deleted receipt; newer changes or a
-- different operation never restore or overwrite Memory data.
create function public.undo_explicit_memory_create_v1(
  p_memory_id uuid, p_source_receipt_id uuid,
  p_expected_revision bigint, p_operation_id uuid
)
returns table(memory_id uuid, state text, reused boolean, revision bigint)
language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid());
declare current_profile public.memory_profiles%rowtype;
declare prior_receipt public.memory_receipts%rowtype;
begin
  perform identity_private.guard_mobile_rpc_v2();
  if actor is null then raise exception 'FORBIDDEN'; end if;
  if p_memory_id is null or p_source_receipt_id is null or p_operation_id is null
    or p_expected_revision is distinct from 1 then raise exception 'INVALID_INPUT'; end if;
  select * into current_profile from public.memory_profiles
    where id = p_memory_id and owner_id = actor for update;
  if not found then raise exception 'FORBIDDEN'; end if;

  select * into prior_receipt from public.memory_receipts where id = p_operation_id;
  if found then
    if prior_receipt.owner_id <> actor then raise exception 'FORBIDDEN'; end if;
    if prior_receipt.memory_id = p_memory_id
      and prior_receipt.event_state = 'deleted'
      and current_profile.source_receipt_id = p_source_receipt_id
      and current_profile.state = 'deleted'
      and current_profile.revision = p_expected_revision + 1 then
      return query select p_memory_id, 'deleted'::text, true, current_profile.revision;
      return;
    end if;
    raise exception 'MEMORY_OPERATION_REUSE';
  end if;

  if current_profile.source_receipt_id is distinct from p_source_receipt_id
    or current_profile.state is distinct from 'explicit'
    or current_profile.revision is distinct from p_expected_revision then
    raise exception 'MEMORY_CONFLICT';
  end if;
  update public.memory_profiles set state = 'deleted', summary = null,
    updated_at = clock_timestamp() where id = p_memory_id returning * into current_profile;
  insert into public.memory_receipts(id, owner_id, memory_id, event_state, source_kind)
    values (p_operation_id, actor, p_memory_id, 'deleted', 'user_confirmed');
  return query select p_memory_id, 'deleted'::text, false, current_profile.revision;
end $$;
revoke all on function public.undo_explicit_memory_create_v1(uuid,uuid,bigint,uuid)
  from public, anon, service_role;
grant execute on function public.undo_explicit_memory_create_v1(uuid,uuid,bigint,uuid)
  to authenticated;
