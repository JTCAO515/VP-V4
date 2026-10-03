-- #211: explicit reports on existing Task/goal/confirmed Trip authority. Default closed.
create schema readiness_private;
revoke all on schema readiness_private from public,anon,authenticated,service_role;
create function readiness_private.valid_declaration_v1(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare stamp timestamptz;
begin
 if jsonb_typeof(v) is distinct from 'object' or not(v ?& array['scenario','city','locale','subjectId','applies','resourcesReady','conditionsChecked','checkAt']) or v-array['scenario','city','locale','subjectId','applies','resourcesReady','conditionsChecked','checkAt']<>'{}' then return false;end if;
 if coalesce(v->>'scenario','') not in ('connectivity','payment','admission','address','transport') or coalesce(v->>'city','') not in ('shanghai','beijing','guangzhou','chongqing') or coalesce(v->>'locale','') not in ('zh','en') then return false;end if;
 if v->'subjectId'<>'null'::jsonb and (jsonb_typeof(v->'subjectId') is distinct from 'string' or v->>'subjectId' !~ '^[a-z][a-z0-9_-]{0,127}$' or v->>'scenario' not in ('admission','address')) then return false;end if;
 if coalesce(v->>'applies','') not in ('unknown','yes','no') or coalesce(v->>'resourcesReady','') not in ('unknown','yes','no') or coalesce(v->>'conditionsChecked','') not in ('unknown','yes','no') or jsonb_typeof(v->'checkAt') is distinct from 'string' then return false;end if;
 if v->>'checkAt' not in ('now','unknown') then
 if char_length(v->>'checkAt')>40 or v->>'checkAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then return false;end if;
 stamp:=(v->>'checkAt')::timestamptz;if not isfinite(stamp) then return false;end if;end if;
 return true;
exception when others then return false;
end $$;
create table readiness_private.scopes_v1 (
 task_id uuid primary key references turn_private.service_tasks(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 trip_id uuid not null references public.trips(id) on delete cascade,
 conversation_id uuid not null references turn_private.assistant_conversations(id) on delete cascade,
 goal_id uuid not null references turn_private.assistant_goals(id) on delete cascade,
 source_message_id uuid not null references turn_private.assistant_messages(id) on delete cascade,
 thread_id uuid not null references public.chat_threads(id) on delete cascade,
 root_turn_id uuid not null references public.turns(id) on delete cascade,
 task_turn_id uuid not null references public.turns(id) on delete cascade,
 basis jsonb not null,revision bigint not null check(revision between 1 and 9007199254740990),
 declarations jsonb not null check(jsonb_typeof(declarations)='array' and jsonb_array_length(declarations) between 1 and 5),
 source_kind text not null default 'user_input' check(source_kind='user_input'),
 rule_version text not null default 'readiness-actions/1' check(rule_version='readiness-actions/1'),
 updated_at timestamptz not null default clock_timestamp()
);
create index readiness_owner_task on readiness_private.scopes_v1(owner_id,task_id);
create index readiness_scope_goal on readiness_private.scopes_v1(goal_id);
create index readiness_scope_conversation on readiness_private.scopes_v1(conversation_id);
create index readiness_scope_turn on readiness_private.scopes_v1(task_turn_id,root_turn_id);
create table readiness_private.operations_v1 (
 operation_id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,
 task_id uuid not null references readiness_private.scopes_v1(task_id) on delete cascade,
 trip_id uuid not null,input_digest text not null check(input_digest~'^[a-f0-9]{64}$'),
 resulting_revision bigint not null,receipt jsonb not null
);
alter table readiness_private.scopes_v1 enable row level security;
alter table readiness_private.operations_v1 enable row level security;
revoke all on readiness_private.scopes_v1,readiness_private.operations_v1 from public,anon,authenticated,service_role;
create function readiness_private.immutable_operation_v1() returns trigger language plpgsql set search_path='' as $$begin raise exception 'READINESS_OPERATION_IMMUTABLE';end $$;
create trigger readiness_operation_immutable before update on readiness_private.operations_v1 for each row execute function readiness_private.immutable_operation_v1();

create function readiness_private.actor_v1() returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid;s uuid;
begin
 if auth.role() is distinct from 'authenticated' or auth.jwt()->>'is_anonymous' is distinct from 'false' then raise exception 'UNAUTHENTICATED';end if;
 u:=turn_private.text_owner();s:=(auth.jwt()->>'session_id')::uuid;
 -- Ordinary Web sessions coexist; only enrolled native sessions use mobile epoch authority.
 if exists(select 1 from identity_private.mobile_attempts where session_id=s) or exists(select 1 from identity_private.mobile_login_proofs where session_id=s) then perform public.native_session_v2('session');end if;
 return u;
end $$;
create function readiness_private.source_v1(u uuid,trip uuid,task uuid) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare t public.trips%rowtype;s turn_private.service_tasks%rowtype;m turn_private.assistant_messages%rowtype;g turn_private.assistant_goals%rowtype;l turn_private.assistant_goal_trip_links%rowtype;c turn_private.assistant_conversations%rowtype;member jsonb;dates jsonb;basis jsonb;digest text;
begin
 select * into t from public.trips where id=trip and owner_id=u for share nowait;if not found then return null;end if;
 if exists(select 1 from public.trip_archives where trip_id=trip) or exists(select 1 from privacy_private.trip_deletions where trip_id=trip) then return null;end if;
 select * into s from turn_private.service_tasks where id=task and owner_id=u;if not found then return null;end if;
 select * into m from turn_private.assistant_messages where task_id=task and owner_id=u and goal_id is not null and relationship in ('follow_up','amendment') order by created_at desc,id desc limit 1;
 if not found or exists(select 1 from turn_private.assistant_messages x where x.task_id=task and x.owner_id=u and (x.conversation_id<>m.conversation_id or x.goal_id is distinct from m.goal_id)) then return null;end if;
 select * into c from turn_private.assistant_conversations where id=m.conversation_id and owner_id=u for share nowait;if not found then return null;end if;
 select * into l from turn_private.assistant_goal_trip_links where goal_id=m.goal_id and owner_id=u and conversation_id=c.id for share nowait;
 if not found or l.trip_id is distinct from trip or l.terminal_unlinked or l.source_kind<>'native_user_confirmed' then return null;end if;
 select * into g from turn_private.assistant_goals where id=m.goal_id and owner_id=u and conversation_id=c.id for share nowait;
 if not found or g.trip_terminal or g.scope_version<>m.scope_version or l.goal_scope_version<>g.scope_version then return null;end if;
 select * into s from turn_private.service_tasks where id=task and owner_id=u for share nowait;
 perform 1 from public.chat_threads where id=s.thread_id and owner_id=u and status='active' for share nowait;if not found then return null;end if;
 perform 1 from public.turns where id=any(array[s.goal_turn_id,s.last_turn_id]) and owner_id=u order by id for share nowait;
 perform 1 from turn_private.text_content where turn_id=any(array[s.goal_turn_id,s.last_turn_id]) and owner_id=u order by turn_id for share nowait;
 perform 1 from turn_private.assistant_messages where id=m.id for share nowait;
 perform 1 from turn_private.text_consents where owner_id=u and policy_id in (c.policy_id,s.policy_id) order by policy_id for share nowait;
 member:=turn_private.assistant_task_member_v1(u,c.id,m.id);if member is null then return null;end if;
 select coalesce(jsonb_agg(jsonb_build_array(to_char(trip_date,'YYYY-MM-DD'),time_zone) order by trip_date,day_id),'[]') into dates from public.trip_days where trip_id=trip and owner_id=u;
 digest:=encode(sha256(convert_to(jsonb_build_array(task,s.scope_version,s.thread_id,s.goal_turn_id,s.last_turn_id,s.policy_id,s.consent_id,c.id,c.policy_id,c.consent_id,m.id,m.sequence,m.scope_version,g.id,g.scope_version,l.operation_id,l.link_version,l.source_kind)::text,'UTF8')),'hex');
 basis:=jsonb_build_object('taskId',task,'taskTurnId',s.last_turn_id,'conversationId',c.id,'goalId',g.id,'goalVersion',g.scope_version,'tripId',trip,'tripVersion',t.head_version,'dateBasis',encode(sha256(convert_to(dates::text,'UTF8')),'hex'),'taskBasisDigest',digest);
 return jsonb_build_object('basis',basis,'threadId',s.thread_id,'rootTurnId',s.goal_turn_id,'sourceMessageId',m.id);
end $$;
create function readiness_private.reply_v1(b jsonb,s readiness_private.scopes_v1) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('kind','readiness_declarations','basis',b,'revision',coalesce(s.revision,0),'declarations',case when s.task_id is not null and s.basis=b then s.declarations else '[]'::jsonb end,'declarationBasis','explicit_user_report','state',case when s.task_id is null then 'empty' when s.basis=b then 'current' else 'stale' end,'ruleVersion','readiness-actions/1')
$$;
create function public.read_readiness_declarations_v1(p_trip_id uuid,p_task_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid;source jsonb;s readiness_private.scopes_v1%rowtype;
begin
 if p_trip_id is null or p_task_id is null then raise exception 'INVALID_INPUT';end if;
 u:=readiness_private.actor_v1();source:=readiness_private.source_v1(u,p_trip_id,p_task_id);if source is null then return jsonb_build_object('kind','unavailable');end if;
 select * into s from readiness_private.scopes_v1 where task_id=p_task_id and owner_id=u and trip_id=p_trip_id for share nowait;
 return readiness_private.reply_v1(source->'basis',s);
exception when lock_not_available then return jsonb_build_object('kind','unavailable');
end $$;
create function public.save_readiness_declaration_v1(p_trip_id uuid,p_task_id uuid,p_expected_basis jsonb,p_expected_revision bigint,p_operation_id uuid,p_declaration jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid;source jsonb;s readiness_private.scopes_v1%rowtype;op readiness_private.operations_v1%rowtype;digest text;items jsonb;answer jsonb;
begin
 if p_trip_id is null or p_task_id is null or p_operation_id is null or p_expected_revision is null or p_expected_revision not between 0 and 9007199254740989 or jsonb_typeof(p_expected_basis) is distinct from 'object' or not(p_expected_basis ?& array['taskId','taskTurnId','conversationId','goalId','goalVersion','tripId','tripVersion','dateBasis','taskBasisDigest']) or p_expected_basis-array['taskId','taskTurnId','conversationId','goalId','goalVersion','tripId','tripVersion','dateBasis','taskBasisDigest']<>'{}' or readiness_private.valid_declaration_v1(p_declaration) is distinct from true then raise exception 'INVALID_INPUT';end if;
 u:=readiness_private.actor_v1();source:=readiness_private.source_v1(u,p_trip_id,p_task_id);if source is null then return jsonb_build_object('kind','unavailable');end if;
 if source->'basis' is distinct from p_expected_basis then return jsonb_build_object('kind','conflict');end if;
 digest:=encode(sha256(convert_to(jsonb_build_array(u,p_trip_id,p_task_id,p_expected_basis,p_expected_revision,p_declaration)::text,'UTF8')),'hex');
 select * into s from readiness_private.scopes_v1 where task_id=p_task_id for update nowait;
 select * into op from readiness_private.operations_v1 where operation_id=p_operation_id;
 if found then
 if op.owner_id<>u or op.task_id<>p_task_id or op.trip_id<>p_trip_id or op.input_digest<>digest or s.basis is distinct from p_expected_basis or s.revision is distinct from op.resulting_revision then return jsonb_build_object('kind','conflict');end if;
 return op.receipt;end if;
 if s.task_id is not null and (s.owner_id<>u or s.trip_id<>p_trip_id) then return jsonb_build_object('kind','conflict');end if;
 if coalesce(s.revision,0)<>p_expected_revision then return jsonb_build_object('kind','conflict');end if;
 select coalesce(jsonb_agg(v order by array_position(array['connectivity','payment','admission','address','transport'],v->>'scenario')),'[]') into items from (
 select value v from jsonb_array_elements(case when s.basis=p_expected_basis then s.declarations else '[]'::jsonb end) where value->>'scenario'<>p_declaration->>'scenario'
 union all select p_declaration) q;
 if s.task_id is null then
 insert into readiness_private.scopes_v1(task_id,owner_id,trip_id,conversation_id,goal_id,source_message_id,thread_id,root_turn_id,task_turn_id,basis,revision,declarations) values(p_task_id,u,p_trip_id,(source->'basis'->>'conversationId')::uuid,(source->'basis'->>'goalId')::uuid,(source->>'sourceMessageId')::uuid,(source->>'threadId')::uuid,(source->>'rootTurnId')::uuid,(source->'basis'->>'taskTurnId')::uuid,p_expected_basis,1,items) returning * into s;
 else
 update readiness_private.scopes_v1 set basis=p_expected_basis,revision=revision+1,declarations=items,task_turn_id=(source->'basis'->>'taskTurnId')::uuid,source_message_id=(source->>'sourceMessageId')::uuid,updated_at=clock_timestamp() where task_id=p_task_id returning * into s;
 end if;
 answer:=readiness_private.reply_v1(p_expected_basis,s);
 insert into readiness_private.operations_v1(operation_id,owner_id,task_id,trip_id,input_digest,resulting_revision,receipt) values(p_operation_id,u,p_task_id,p_trip_id,digest,s.revision,answer);
 return answer;
exception when lock_not_available then return jsonb_build_object('kind','unavailable');
end $$;

-- New personal reports follow actual source loss, including retained Task tombstones.
create function readiness_private.cleanup_source_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb:=to_jsonb(new);owner uuid;policy uuid;
begin
 if tg_table_name='text_content' then
 if new.hidden_at is not null and old.hidden_at is null then delete from readiness_private.scopes_v1 where task_turn_id=new.turn_id or root_turn_id=new.turn_id;end if;
 elsif tg_table_name='text_consents' then
 if new.revoked_at is not null and old.revoked_at is null then
 delete from readiness_private.scopes_v1 d using turn_private.service_tasks t where d.task_id=t.id and t.owner_id=new.owner_id and t.policy_id=new.policy_id;
 delete from readiness_private.scopes_v1 d using turn_private.assistant_conversations c where d.conversation_id=c.id and c.owner_id=new.owner_id and c.policy_id=new.policy_id;end if;
 elsif tg_table_name='text_policies' then
 if new.revoked_at is not null and old.revoked_at is null then
 delete from readiness_private.scopes_v1 d using turn_private.service_tasks t where d.task_id=t.id and t.policy_id=new.id;
 delete from readiness_private.scopes_v1 d using turn_private.assistant_conversations c where d.conversation_id=c.id and c.policy_id=new.id;end if;
 elsif tg_table_name='assistant_goal_trip_links' then
 if new.trip_id is null or new.trip_id is distinct from old.trip_id or new.terminal_unlinked then delete from readiness_private.scopes_v1 where goal_id=new.goal_id;end if;
 elsif tg_table_name='assistant_goals' then
 if new.trip_terminal then delete from readiness_private.scopes_v1 where goal_id=new.id;end if;
 elsif tg_table_name='trip_archives' then delete from readiness_private.scopes_v1 where trip_id=new.trip_id;
 elsif tg_table_name='trip_deletions' then delete from readiness_private.scopes_v1 where trip_id=new.trip_id;
 end if;
 return new;
end $$;
create trigger readiness_hide_cleanup after update on turn_private.text_content for each row execute function readiness_private.cleanup_source_v1();
create trigger readiness_consent_cleanup after update on turn_private.text_consents for each row execute function readiness_private.cleanup_source_v1();
create trigger readiness_policy_cleanup after update on turn_private.text_policies for each row execute function readiness_private.cleanup_source_v1();
create trigger readiness_link_cleanup after update on turn_private.assistant_goal_trip_links for each row execute function readiness_private.cleanup_source_v1();
create trigger readiness_goal_cleanup after update on turn_private.assistant_goals for each row execute function readiness_private.cleanup_source_v1();
create trigger readiness_archive_cleanup after insert on public.trip_archives for each row execute function readiness_private.cleanup_source_v1();
create trigger readiness_trip_delete_cleanup after insert on privacy_private.trip_deletions for each row execute function readiness_private.cleanup_source_v1();

-- Private preparation seam only, NOT enrolled into the existing D2 module inventory.
create function readiness_private.export_metadata_v1(p_request_id uuid,p_lease_id uuid,p_generation integer,p_after_task_id uuid default null,p_limit integer default 100) returns jsonb language plpgsql security definer set search_path='' as $$
declare j export_private.core_jobs_v1%rowtype;rows jsonb;more boolean;cursor uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 if p_request_id is null or p_lease_id is null or p_generation is null or p_limit not between 1 and 100 then raise exception 'INVALID_INPUT';end if;
 j:=export_private.lock_job_v1(p_request_id,true);
 if j.request_id is null or export_private.live_lease_v1(j,p_lease_id,p_generation) is distinct from true then return jsonb_build_object('kind','unavailable');end if;
 if p_after_task_id is not null and not exists(select 1 from readiness_private.scopes_v1 where owner_id=j.owner_id and task_id=p_after_task_id) then raise exception 'INVALID_EXPORT_CURSOR';end if;
 with candidates as (select * from readiness_private.scopes_v1 where owner_id=j.owner_id and (p_after_task_id is null or task_id>p_after_task_id) order by task_id limit p_limit+1),delivered as(select * from candidates order by task_id limit p_limit)
 select coalesce((select jsonb_agg(jsonb_build_object('taskId',task_id,'tripId',trip_id,'conversationId',conversation_id,'goalId',goal_id,'sourceMessageId',source_message_id,'basis',basis,'revision',revision,'declarations',declarations,'declarationBasis','explicit_user_report','ruleVersion',rule_version,'historical',true) order by task_id) from delivered),'[]'),(select count(*)>p_limit from candidates),(select task_id from delivered order by task_id desc limit 1) into rows,more,cursor;
 return jsonb_build_object('schemaVersion','readiness-declarations-export/1','items',rows,'hasMore',more,'nextCursor',case when more then cursor else null end,'sectionComplete',not more,'enrolled',false);
end $$;
revoke all on function public.read_readiness_declarations_v1(uuid,uuid),public.save_readiness_declaration_v1(uuid,uuid,jsonb,bigint,uuid,jsonb) from public,anon,authenticated,service_role;
do $$declare f regprocedure;begin for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='readiness_private' loop execute 'revoke all on function '||f||' from public,anon,authenticated,service_role';end loop;end $$;
notify pgrst,'reload schema';
