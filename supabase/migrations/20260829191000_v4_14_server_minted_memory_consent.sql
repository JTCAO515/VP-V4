-- V4-14 forward repair: only the database may mint an initial Memory consent ID.
-- Re-granting remains owner-scoped, while unknown and foreign IDs both fail closed.
create or replace function public.grant_memory_retrieval_consent(p_consent_id uuid)
returns table(consent_id uuid, status text, reused boolean)
language plpgsql
security definer
set search_path = public, auth
as $$
declare previous public.memory_consents%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'FORBIDDEN'; end if;
  select * into previous from public.memory_consents where id = p_consent_id and owner_id = (select auth.uid()) for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  if previous.status = 'granted' then return query select previous.id, previous.status, true; return; end if;
  update public.memory_consents set status = 'granted', updated_at = now() where id = previous.id;
  return query select previous.id, 'granted'::text, false;
end;
$$;

create function public.create_memory_retrieval_consent()
returns table(consent_id uuid, status text, reused boolean)
language plpgsql
security definer
set search_path = public, auth
as $$
declare created_id uuid := gen_random_uuid();
begin
  if (select auth.uid()) is null then raise exception 'FORBIDDEN'; end if;
  insert into public.memory_consents(id, owner_id, status)
    values (created_id, (select auth.uid()), 'granted');
  return query select created_id, 'granted'::text, false;
end;
$$;

revoke all on function public.create_memory_retrieval_consent() from public;
grant execute on function public.create_memory_retrieval_consent() to authenticated;
