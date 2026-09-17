-- Session v2: server-owned mobile generation, independent of Web sessions.
create schema if not exists identity_private;
revoke all on schema identity_private from public, anon, authenticated;
create table identity_private.mobile_accounts (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  epoch bigint not null default 0,
  session_id uuid
);
create table identity_private.mobile_attempts (
  owner_id uuid not null references auth.users(id) on delete cascade,
  attempt_id uuid not null,
  session_id uuid not null unique,
  epoch bigint not null,
  primary key(owner_id, attempt_id)
);
create table identity_private.mobile_login_proofs (
  session_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  attempt_id uuid not null,
  expires_at timestamptz not null
);
alter table identity_private.mobile_login_proofs enable row level security;
alter table identity_private.mobile_accounts enable row level security;
alter table identity_private.mobile_attempts enable row level security;

-- Trusted credential-exchange seam only. Ordinary users cannot manufacture a pending proof.
create function identity_private.prepare_mobile_v2(p_owner uuid,p_session uuid,p_attempt uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.jwt()->>'role' is distinct from 'service_role' or p_attempt is null or not exists(
    select 1 from auth.sessions where id=p_session and user_id=p_owner and created_at>now()-interval '2 minutes'
  ) or exists(select 1 from identity_private.mobile_attempts where session_id=p_session) then raise exception 'UNAUTHENTICATED'; end if;
  insert into identity_private.mobile_login_proofs values(p_session,p_owner,p_attempt,now()+interval '2 minutes') on conflict do nothing;
  if not exists(select 1 from identity_private.mobile_login_proofs where session_id=p_session and owner_id=p_owner and attempt_id=p_attempt) then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
end $$;
revoke all on function identity_private.prepare_mobile_v2(uuid,uuid,uuid) from public,anon,authenticated;
grant usage on schema identity_private to service_role;
grant execute on function identity_private.prepare_mobile_v2(uuid,uuid,uuid) to service_role;
create function public.native_prepare_v2(p_owner uuid,p_session uuid,p_attempt uuid)
returns void language sql security invoker set search_path='' as $$
  select identity_private.prepare_mobile_v2(p_owner,p_session,p_attempt);
$$;
revoke all on function public.native_prepare_v2(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.native_prepare_v2(uuid,uuid,uuid) to service_role;

create function identity_private.mobile_session_v2(p_action text, p_attempt uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  s uuid := (auth.jwt()->>'session_id')::uuid;
  a identity_private.mobile_accounts%rowtype;
  prior identity_private.mobile_attempts%rowtype;
begin
  if u is null or s is null or auth.jwt()->>'role' is distinct from 'authenticated'
     or (auth.jwt()->>'is_anonymous')::boolean is distinct from false
     or not exists(select 1 from auth.sessions where id=s and user_id=u) then
    raise exception 'UNAUTHENTICATED';
  end if;
  if p_action = 'login' then
    if p_attempt is null then raise exception 'INVALID_INPUT'; end if;
    insert into identity_private.mobile_accounts(owner_id) values(u) on conflict do nothing;
  end if;
  select * into a from identity_private.mobile_accounts where owner_id=u for update;
  if not found then raise exception 'UNAUTHENTICATED'; end if;
  -- Recheck after acquiring the shared serialization lock.
  if not exists(select 1 from auth.sessions where id=s and user_id=u) then raise exception 'SESSION_REPLACED'; end if;
  if p_action = 'login' then
    select * into prior from identity_private.mobile_attempts where owner_id=u and attempt_id=p_attempt;
    if found then
      if prior.session_id <> s then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
      if a.session_id is distinct from s or a.epoch <> prior.epoch then raise exception 'SESSION_REPLACED'; end if;
    else
      if not exists(select 1 from identity_private.mobile_login_proofs where session_id=s and owner_id=u and attempt_id=p_attempt and expires_at>now()) then raise exception 'UNAUTHENTICATED'; end if;
      if exists(select 1 from identity_private.mobile_attempts where session_id=s) then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
      -- Only the previous MOBILE session is revoked. Other Auth sessions are Web and coexist.
      delete from auth.sessions where id=a.session_id and user_id=u;
      update identity_private.mobile_accounts set epoch=epoch+1, session_id=s where owner_id=u returning * into a;
      insert into identity_private.mobile_attempts values(u,p_attempt,s,a.epoch);
    end if;
  elsif p_action in ('session','logout') then
    if a.session_id is distinct from s then raise exception 'SESSION_REPLACED'; end if;
    if p_action='logout' then
      update identity_private.mobile_accounts set session_id=null where owner_id=u;
      delete from auth.sessions where id=s and user_id=u;
    end if;
  else raise exception 'INVALID_INPUT';
  end if;
  return jsonb_build_object('version',2,'subject',u,'sessionId',s,'mobileEpoch',a.epoch);
end $$;
revoke all on function identity_private.mobile_session_v2(text,uuid) from public,anon,authenticated;
grant usage on schema identity_private to authenticated;
grant execute on function identity_private.mobile_session_v2(text,uuid) to authenticated;
create function public.native_session_v2(p_action text,p_attempt uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
  select identity_private.mobile_session_v2(p_action,p_attempt);
$$;
revoke all on function public.native_session_v2(text,uuid) from public,anon;
grant execute on function public.native_session_v2(text,uuid) to authenticated;

-- Existing direct Data API and definer writes must not bypass mobile revocation.
-- Web sessions (never entered in mobile_attempts) keep their existing policies.
create function identity_private.mobile_access_v2()
returns boolean language plpgsql security definer set search_path='' as $$
declare u uuid := auth.uid(); s uuid := (auth.jwt()->>'session_id')::uuid; a identity_private.mobile_accounts%rowtype;
begin
  if s is not null and u is not null and not exists(select 1 from auth.sessions where id=s and user_id=u) then return false; end if;
  if not exists(select 1 from identity_private.mobile_attempts where session_id=s) and not exists(select 1 from identity_private.mobile_login_proofs where session_id=s) then return true; end if;
  select * into a from identity_private.mobile_accounts where owner_id=u;
  return coalesce(a.session_id=s and exists(select 1 from auth.sessions where id=s and user_id=u),false);
end $$;
revoke all on function identity_private.mobile_access_v2() from public,anon;
grant execute on function identity_private.mobile_access_v2() to authenticated;
create function identity_private.guard_mobile_write_v2()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform 1 from identity_private.mobile_accounts where owner_id=auth.uid() for update;
  if not identity_private.mobile_access_v2() then raise exception 'SESSION_REPLACED'; end if;
  if TG_OP='DELETE' then return OLD; else return NEW; end if;
end $$;
revoke all on function identity_private.guard_mobile_write_v2() from public,anon,authenticated;
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('create trigger native_mobile_write_v2 before insert or update or delete on public.%I for each row execute function identity_private.guard_mobile_write_v2()', t.tablename);
    if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=t.tablename and c.relrowsecurity) then
      execute format('create policy native_mobile_access_v2 on public.%I as restrictive to authenticated using (identity_private.mobile_access_v2()) with check (identity_private.mobile_access_v2())',t.tablename);
    end if;
  end loop;
end $$;

-- Definer RPCs can return on replay/read branches without touching a table. Guard their entry
-- as well as table writes. Preserve their exact current signatures, ownership checks and bodies.
create function identity_private.guard_mobile_rpc_v2()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from identity_private.mobile_accounts where owner_id=auth.uid() for update;
  if not identity_private.mobile_access_v2() then raise exception 'SESSION_REPLACED'; end if;
end $$;
revoke all on function identity_private.guard_mobile_rpc_v2() from public,anon,authenticated;
-- Fresh-bootstrap correction: these two public SECURITY DEFINER functions are not
-- ordinary mobile RPCs. The first is a service worker writer and the second is a
-- trigger implementation. Explicit role grants from the older baseline otherwise
-- make both look like unreviewed authenticated RPCs below.
revoke all on function public.append_chat_turn_event(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.append_chat_turn_event(uuid,text,text,text) to service_role;
revoke all on function public.capture_initial_trip_version() from public,anon,authenticated;
do $$ declare expected record; f record; definition text; revised text; guarded integer:=0; begin
  for expected in select * from (values
    ('public.cancel_chat_turn(uuid)', '1047fd7accd4b7d031caab4a67f49acb'),
    ('public.confirm_and_apply_trip_proposal(uuid, text, text)', '2223a4a456f540165527a74c53227c20'),
    ('public.create_explicit_memory_profile(uuid, uuid, uuid, text, text)', 'fb56ebf5702edce2354a5e3da994de11'),
    ('public.create_memory_retrieval_consent()', '096c3dff64c238aca0ab97fc59ab1e6b'),
    ('public.create_trip_proposal_patch(uuid, jsonb)', 'a1573ec20d80b9a7f325789a726aa9e1'),
    ('public.create_trip_rollback_proposal(uuid, integer)', 'a83551ae0bb597826ef9045d5b1438fc'),
    ('public.grant_memory_retrieval_consent(uuid)', '59286a2b6580cce68d774cad65e4ca01'),
    ('public.record_turn_feedback(uuid, text, text)', '12581f7a8040230dc69cae741e27717e'),
    ('public.request_privacy_action(uuid, text)', 'e85e9b071c7cda38295e0323b03ead9d'),
    ('public.revise_trip_proposal(uuid, text)', '2fea11769e534fde8dd144da879c6e08'),
    ('public.revise_trip_proposal_patch(uuid, jsonb)', '4393d84571ea21a626a04556d61d2141'),
    ('public.revoke_memory_retrieval_consent(uuid)', '590a4ceb93e0cc7c05fa47d4688df80b'),
    ('public.save_user_profile(text, text, text, text, text, text, time without time zone)', 'deb86f1261ef54d7de33a7dcecfd85f4'),
    ('public.start_chat_turn(uuid, uuid, uuid, text)', '48f5cc4d47632ba5c60c83d30788bf35'),
    ('public.transition_memory_profile(uuid, text)', 'a169637ebc8adf63a33134a42ebb6932')
  ) as frozen(signature, source_md5) loop
    select p.oid,p.prosrc,p.prosecdef,l.lanname into f from pg_proc p
      join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure(expected.signature);
    if not found or not f.prosecdef or f.lanname <> 'plpgsql'
      or not has_function_privilege('authenticated',f.oid,'EXECUTE')
      or md5(f.prosrc) <> expected.source_md5 then raise exception 'Unreviewed definer RPC baseline: %', expected.signature; end if;
    if f.prosrc !~* '\mBEGIN\M' then raise exception 'Unreviewed definer RPC body'; end if;
    revised := regexp_replace(f.prosrc, '(\mBEGIN\M)', '\1 PERFORM identity_private.guard_mobile_rpc_v2();', 'i');
    if md5(replace(revised,' PERFORM identity_private.guard_mobile_rpc_v2();','')) <> expected.source_md5 then raise exception 'Definer RPC body preservation failed'; end if;
    definition := replace(pg_get_functiondef(f.oid),f.prosrc,revised);
    execute definition;
    guarded:=guarded+1;
  end loop;
  if guarded <> (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and has_function_privilege('authenticated',p.oid,'EXECUTE')) then
    raise exception 'Unreviewed definer RPC inventory';
  end if;
end $$;
