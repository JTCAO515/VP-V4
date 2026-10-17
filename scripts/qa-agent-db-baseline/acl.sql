-- Installation owner retains fixture seeding only; client has narrow original ports.
revoke all on all tables in schema public,auth,identity_private,turn_private from public,anon,authenticated,service_role;
revoke all on all functions in schema public,identity_private,turn_private from public,anon,authenticated,service_role;
revoke all on schema identity_private,turn_private from public,anon,authenticated,service_role;
grant usage on schema public,identity_private to authenticated;
grant usage on schema public,identity_private to service_role;
grant execute on function identity_private.prepare_mobile_v2(uuid,uuid,uuid),public.native_prepare_v2(uuid,uuid,uuid) to service_role;
grant execute on function identity_private.mobile_session_v2(text,uuid),identity_private.mobile_access_v2(),public.native_session_v2(text,uuid) to authenticated;
grant execute on function public.qa_native_session_v1(text,bigint,jsonb), public.qa_read_session_v1(uuid),public.qa_list_sessions_v1(integer),public.qa_read_policy_v1(uuid),public.qa_accept_policy_v1(uuid,text),public.read_text_turn(uuid),public.read_text_policy(uuid),public.accept_text_policy(uuid,text),public.withdraw_text_policy(uuid) to authenticated;
grant select,insert,update on public.chat_threads to authenticated;
grant select on public.turns,public.trips,public.user_profiles to authenticated;
alter table public.user_profiles enable row level security;
create policy baseline_profile_read on public.user_profiles for select to authenticated using(owner_id=(select auth.uid()));
alter table public.chat_threads enable row level security;
alter table public.turns enable row level security;
alter table public.trips enable row level security;
create policy baseline_thread_read on public.chat_threads for select to authenticated using(owner_id=(select auth.uid()));
create policy baseline_thread_insert on public.chat_threads for insert to authenticated with check(owner_id=(select auth.uid()) and (trip_id is null or exists(select 1 from public.trips where id=trip_id and owner_id=(select auth.uid()))));
create policy baseline_thread_update on public.chat_threads for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()) and (trip_id is null or exists(select 1 from public.trips where id=trip_id and owner_id=(select auth.uid()))));
create policy baseline_turn_read on public.turns for select to authenticated using(owner_id=(select auth.uid()));
create policy baseline_trip_read on public.trips for select to authenticated using(owner_id=(select auth.uid()));
do $$declare t record;begin
 for t in select c.relname,n.nspname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('identity_private','turn_private') and c.relkind='r' loop
 execute format('alter table %I.%I enable row level security',t.nspname,t.relname);
 end loop;
 for t in select tablename from pg_tables where schemaname='public' loop
 execute format('alter table public.%I enable row level security',t.tablename);
 execute format('create trigger native_mobile_write_v2 before insert or update or delete on public.%I for each row execute function identity_private.guard_mobile_write_v2()',t.tablename);
 execute format('create policy native_mobile_access_v2 on public.%I as restrictive to authenticated using(identity_private.mobile_access_v2()) with check(identity_private.mobile_access_v2())',t.tablename);
 end loop;
end$$;
create trigger immutable_text_policy before update or delete on turn_private.text_policies for each row execute function turn_private.immutable_text_policy();
alter table turn_private.text_content add constraint baseline_text_bounds check(turn_private.valid_text(input_text,4000) and (output_text is null or turn_private.valid_text(output_text,8000)));
