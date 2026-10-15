-- AGENT-008: Trip objectives extend the original ServiceTask authority.
-- No new queue, grant, attempt ledger, sensitive content copy or live enablement.
alter table turn_private.service_task_capacity_settings add column trip_enabled boolean not null default false;
alter table turn_private.service_tasks add column trip_objective jsonb;
alter table turn_private.service_tasks drop constraint service_tasks_expected_result_check;
alter table turn_private.service_tasks add constraint service_tasks_expected_result_check
 check(expected_result in ('text_answer','reviewed_answer','trip_modification'));
alter table turn_private.service_tasks add constraint service_task_trip_objective_check
 check((expected_result='trip_modification')=(trip_objective is not null));
create unique index service_task_trip_operation on turn_private.service_tasks(owner_id,((trip_objective->>'operationId')))
 where trip_objective is not null;
create unique index service_task_trip_proposal on turn_private.service_tasks(((trip_objective->>'proposalId')))
 where trip_objective->>'proposalId' is not null;

-- Live canonical source qualification. The source IDs are references, never claims
-- of authority: joins validate owner, current consent, goal scope and exact link.
create function turn_private.trip_objective_current_v1(u uuid,b jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare g turn_private.assistant_goals%rowtype;m turn_private.assistant_messages%rowtype;
 c turn_private.assistant_conversations%rowtype;l turn_private.assistant_goal_trip_links%rowtype;
begin
 select * into c from turn_private.assistant_conversations where id=(b->>'conversationId')::uuid and owner_id=u for share;
 if not found or not turn_private.text_policy_current(c.policy_id) then return false;end if;
 perform 1 from turn_private.text_consents where owner_id=u and policy_id=c.policy_id and consent_id=c.consent_id and revoked_at is null for share;
 if not found then return false;end if;
 select * into g from turn_private.assistant_goals where id=(b->>'goalId')::uuid and owner_id=u and conversation_id=c.id for share;
 if not found or g.trip_terminal or g.scope_version is distinct from (b->>'goalVersion')::integer then return false;end if;
 select * into m from turn_private.assistant_messages where id=(b->>'messageId')::uuid and owner_id=u and conversation_id=c.id and goal_id=g.id;
 if not found or m.scope_version<>g.scope_version or m.sequence is distinct from (b->>'messageSequence')::bigint
 or m.policy_id<>c.policy_id or m.consent_id<>c.consent_id
 or exists(select 1 from turn_private.assistant_messages later where later.goal_id=g.id and later.sequence>m.sequence) then return false;end if;
 select * into l from turn_private.assistant_goal_trip_links where goal_id=g.id and owner_id=u for share;
 return found and not l.terminal_unlinked and l.source_kind='native_user_confirmed'
 and l.trip_id=(b->>'tripId')::uuid and l.trip_head_version=(b->>'baseVersion')::integer
 and l.goal_scope_version=g.scope_version and l.link_version=(b->>'linkVersion')::integer
 and l.operation_id=(b->>'linkOperationId')::uuid;
end $$;
revoke all on function turn_private.trip_objective_current_v1(uuid,jsonb) from public,anon,authenticated,service_role;

-- A Trip task is born as such, before Turn admission/reservation. There is no
-- authenticated RPC that converts an existing text/reviewed task into this type.
create function public.submit_trip_service_task_v1(p_trip_id uuid,p_input jsonb,p_goal jsonb)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare u uuid:=turn_private.text_owner();cfg scoped_edit_private.worker_settings_v1%rowtype;
 c scoped_edit_private.contexts_v1%rowtype;o scoped_edit_private.operations_v1%rowtype;
 s turn_private.service_tasks%rowtype;consent turn_private.text_consents%rowtype;
 settings turn_private.service_task_capacity_settings%rowtype;g turn_private.assistant_goals%rowtype;
 m turn_private.assistant_messages%rowtype;l turn_private.assistant_goal_trip_links%rowtype;
 task uuid:=gen_random_uuid();trn uuid:=gen_random_uuid();thread uuid:=gen_random_uuid();op uuid;basis jsonb;dig text;r jsonb;
begin
 if not scoped_edit_private.valid_mutation_v1(p_input) or p_input->>'action' is distinct from 'ask'
 or not recovery_private.exact_v1(p_goal,array['conversationId','goalId','goalVersion','messageId','messageSequence','linkVersion','linkOperationId'])
 then raise exception 'INVALID_INPUT';end if;
 op:=(p_input->>'operationId')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(u::text,34));
 perform pg_advisory_xact_lock(hashtextextended('scoped:'||u::text||':'||op::text,0));
 u:=recovery_private.actor_v1();
 basis:=p_goal||jsonb_build_object('tripId',p_trip_id,'baseVersion',p_input->'basis'->'baseVersion');
 -- Replay uses the original stored source, never the caller's new claim.
 if not turn_private.trip_objective_current_v1(u,basis) then raise exception 'STALE_BASIS';end if;
 -- Keep original actor/Trip locks and scope validation; no source text is inferred.
 perform recovery_private.trip_v1(u,p_trip_id);
 select * into c from scoped_edit_private.contexts_v1 where id=(p_input->'basis'->>'contextId')::uuid and owner_id=u and trip_id=p_trip_id;
 if not found or c.digest is distinct from p_input->'basis'->>'contextDigest'
 or c.base_version is distinct from (p_input->'basis'->>'baseVersion')::integer or not scoped_edit_private.current_v1(c) then raise exception 'STALE_BASIS';end if;
 dig:=scoped_edit_private.hash_v1(jsonb_build_array(p_trip_id,p_input,p_goal));
 select * into s from turn_private.service_tasks where owner_id=u and trip_objective->>'operationId'=op::text;
 if found then
 if s.trip_objective->>'requestDigest' is distinct from dig then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;
 select * into o from scoped_edit_private.operations_v1 where owner_id=u and operation_id=op;
 if o.cancelled then raise exception 'SERVICE_TASK_CANCELLED';end if;
 return jsonb_build_object('kind','trip_service_task/1','taskId',s.id,'turnId',s.goal_turn_id,'operationId',op,'capacityMode',case when s.capacity_enforced then 'development' else 'record_only' end,'reused',true);
 end if;
 if exists(select 1 from scoped_edit_private.operations_v1 where owner_id=u and operation_id=op)
 or exists(select 1 from turn_private.service_tasks where owner_id=u and trip_objective->>'goalId'=p_goal->>'goalId') then raise exception 'SERVICE_TASK_CONFLICT';end if;
 -- Explicit deployment gate distinct from capacity enforcement. Both default off.
 select * into settings from turn_private.service_task_capacity_settings where singleton for share;
 if not found or not settings.trip_enabled or settings.policy_version<>'service-task-development/1' then raise exception 'TRIP_SERVICE_TASK_DISABLED';end if;
 select * into cfg from scoped_edit_private.worker_settings_v1 where scoped_edit_private.worker_policy_v1(u,policy_id,scope_id) order by policy_id limit 1;
 if not found or c.expires_at>least(cfg.expires_at,(select least(expires_at,terms_recheck_at) from turn_private.text_policies where id=cfg.policy_id),(select expires_at from turn_private.planning_policies where id=cfg.planning_policy_id)) then raise exception 'DATA_POLICY_BLOCKED';end if;
 select * into consent from turn_private.text_consents where owner_id=u and policy_id=cfg.policy_id and revoked_at is null for share;
 if not found then raise exception 'DATA_POLICY_BLOCKED';end if;
 insert into scoped_edit_private.operations_v1(owner_id,operation_id,trip_id,mutation,digest,actor_basis,context_id)
 values(u,op,p_trip_id,p_input,scoped_edit_private.hash_v1(p_input),c.actor_basis,c.id);
 insert into public.chat_threads(id,owner_id,trip_id) values(thread,u,p_trip_id);
 basis:=basis||jsonb_build_object('operationId',op,'contextId',c.id,'contextDigest',c.digest,'requestDigest',dig,'outcome','pending');
 insert into turn_private.service_tasks(id,owner_id,thread_id,goal_turn_id,last_turn_id,policy_id,consent_id,scope_version,expected_result,goal_digest,trip_objective,capacity_enforced)
 values(task,u,thread,trn,trn,cfg.policy_id,consent.consent_id,1,'trip_modification',encode(sha256(convert_to(p_input->>'text','UTF8')),'hex'),basis,settings.enabled);
 insert into turn_private.service_task_turns(turn_id,task_id,owner_id,relationship,idempotency_key,request_digest)
 values(trn,task,u,'new_goal',op,dig);
 r:=public.start_text_turn(thread,trn,op,cfg.policy_id,c.input->>'locale',p_input->>'text');
 if r->>'kind' is distinct from 'accepted' or r->>'reused' is distinct from 'false' then raise exception 'SERVICE_TASK_CONFLICT';end if;
 -- Bind the already canonical message once; no dialogue/body copy is added.
 update turn_private.assistant_messages set task_id=task where id=(p_goal->>'messageId')::uuid and owner_id=u and task_id is null;
 if not found then raise exception 'SERVICE_TASK_CONFLICT';end if;
 update turn_private.work set execution_mode='scoped_trip_edit_v1' where turn_id=trn;
 insert into scoped_edit_private.work_v1(turn_id,owner_id,trip_id,task_id,operation_id,context_id,policy_id,scope_id)
 values(trn,u,p_trip_id,task,op,c.id,cfg.policy_id,cfg.scope_id);
 if settings.enabled then perform turn_private.reserve_service_task_capacity(task,u);end if;
 update scoped_edit_private.operations_v1 set receipt=jsonb_build_object('kind','scoped_edit_pending/1','operationId',op,'tripId',p_trip_id,'contextId',c.id,'contextDigest',c.digest,'baseVersion',c.base_version,'reason','queued','reused',false) where owner_id=u and operation_id=op;
 return jsonb_build_object('kind','trip_service_task/1','taskId',task,'turnId',trn,'operationId',op,'capacityMode',case when settings.enabled then 'development' else 'record_only' end,'reused',false);
end $$;
revoke all on function public.submit_trip_service_task_v1(uuid,jsonb,jsonb) from public,anon,service_role;
grant execute on function public.submit_trip_service_task_v1(uuid,jsonb,jsonb) to authenticated;

-- Versioned replacement: preserve the exact U1 restriction unless the task was
-- born with a qualified Trip objective. Owner/thread/type never become mutable.
create or replace function turn_private.guard_text_capacity_scope()
returns trigger language plpgsql security definer set search_path='' as $$
declare s turn_private.service_tasks%rowtype;h public.chat_threads%rowtype;tid uuid;
begin
 select thread_id into tid from turn_private.service_tasks where id=new.task_id;
 select * into h from public.chat_threads where id=tid for share;
 select * into s from turn_private.service_tasks where id=new.task_id for share;
 if s.id is null or s.owner_id is distinct from new.owner_id or h.owner_id is distinct from new.owner_id
 or not ((s.expected_result='text_answer' and h.trip_id is null and s.trip_objective is null)
 or (s.expected_result='trip_modification' and h.trip_id=(s.trip_objective->>'tripId')::uuid))
 then raise exception 'SERVICE_TASK_CAPACITY_SCOPE_CONFLICT';end if;return new;
end $$;
create or replace function turn_private.guard_metered_task_type()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (old.trip_objective is not null or exists(select 1 from turn_private.service_task_capacity where task_id=new.id))
 and (new.expected_result is distinct from old.expected_result or new.owner_id is distinct from old.owner_id or new.thread_id is distinct from old.thread_id)
 then raise exception 'SERVICE_TASK_CAPACITY_SCOPE_CONFLICT';end if;
 if old.trip_objective is null and new.trip_objective is not null then raise exception 'SERVICE_TASK_CAPACITY_SCOPE_CONFLICT';end if;
 if old.trip_objective is not null and (new.trip_objective-array['proposalId','proposalRevision','proposalDigest','producerBinding','outcome','settledVersion'])
 is distinct from (old.trip_objective-array['proposalId','proposalRevision','proposalDigest','producerBinding','outcome','settledVersion']) then raise exception 'SERVICE_TASK_CAPACITY_SCOPE_CONFLICT';end if;
 return new;
end $$;

-- The ORIGINAL candidate selector proves output/cost/completion and publishes
-- the original Proposal. This hook records the immutable source tuple there.
alter function scoped_edit_private.select_v1(scoped_edit_private.contexts_v1,uuid,jsonb) rename to select_without_trip_task_v1;
create function scoped_edit_private.select_v1(c scoped_edit_private.contexts_v1,op uuid,m jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;j scoped_edit_private.work_v1%rowtype;s turn_private.service_tasks%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended(c.owner_id::text,34));
 select * into j from scoped_edit_private.work_v1 where owner_id=c.owner_id and operation_id=(m->>'askOperationId')::uuid;
 select * into s from turn_private.service_tasks where id=j.task_id;
 if s.trip_objective is not null and (s.trip_objective->>'outcome'<>'pending' or not turn_private.trip_objective_current_v1(s.owner_id,s.trip_objective)) then raise exception 'STALE_BASIS';end if;
 r:=scoped_edit_private.select_without_trip_task_v1(c,op,m);
 if s.trip_objective is not null then
 if s.trip_objective->>'proposalId' is not null then raise exception 'SERVICE_TASK_CONFLICT';end if;
 update turn_private.service_tasks set trip_objective=trip_objective||jsonb_build_object('proposalId',r->'proposalId','proposalRevision',r->'proposalRevision','proposalDigest',r->'proposalDigest','producerBinding',j.binding) where id=s.id;
 end if;return r;
end $$;
revoke all on function scoped_edit_private.select_v1(scoped_edit_private.contexts_v1,uuid,jsonb),scoped_edit_private.select_without_trip_task_v1(scoped_edit_private.contexts_v1,uuid,jsonb) from public,anon,authenticated,service_role;

-- Enter before the original writer's Proposal lock. Account capacity/grant lock
-- covers confirmation and original intent validation; the original writer still
-- owns digest, proposal status, head CAS, Patch and readable snapshot creation.
create function turn_private.trip_confirmation_enter_v1(pid uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s turn_private.service_tasks%rowtype;u uuid;
begin
 select * into s from turn_private.service_tasks where trip_objective->>'proposalId'=pid::text;
 if not found then return;end if;
 u:=turn_private.text_owner();if s.owner_id<>u then raise exception 'FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,34));
 if s.trip_objective->>'outcome'='settled' then return;end if;
 if s.trip_objective->>'outcome'<>'pending' or not turn_private.trip_objective_current_v1(u,s.trip_objective) then raise exception 'STALE_BASIS';end if;
end $$;
revoke all on function turn_private.trip_confirmation_enter_v1(uuid) from public,anon,authenticated,service_role;

-- Immediate AFTER event: all original writes and this settlement roll back as
-- one transaction. Deferred original scope/source guards remain installed.
create function turn_private.settle_trip_service_task_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare s turn_private.service_tasks%rowtype;p public.trip_proposals%rowtype;
 c turn_private.service_task_capacity%rowtype;j scoped_edit_private.work_v1%rowtype;
begin
 select * into s from turn_private.service_tasks where trip_objective->>'proposalId'=new.proposal_id::text for update;
 if not found then return null;end if;
 select * into p from public.trip_proposals where id=new.proposal_id;
 select * into j from scoped_edit_private.work_v1 where task_id=s.id and turn_id=s.last_turn_id;
 if new.event_type<>'proposal_applied' or new.owner_id<>s.owner_id or new.trip_id<>(s.trip_objective->>'tripId')::uuid
 or new.resulting_version<>(s.trip_objective->>'baseVersion')::integer+1
 or p.revision<>(s.trip_objective->>'proposalRevision')::integer
 or s.trip_objective->>'outcome'<>'pending'
 or j.binding is distinct from s.trip_objective->'producerBinding' or j.completion->>'kind' is distinct from 'candidate_saved'
 or j.candidate_patch is distinct from p.patch or j.paused_reason is not null
 or not exists(select 1 from public.turns where id=j.turn_id and owner_id=s.owner_id and status='completed')
 or not turn_private.trip_objective_current_v1(s.owner_id,s.trip_objective)
 or not exists(select 1 from turn_private.text_content where turn_id=s.goal_turn_id and owner_id=s.owner_id and hidden_at is null)
 or not turn_private.text_policy_current(s.policy_id)
 or not exists(select 1 from turn_private.text_consents where owner_id=s.owner_id and policy_id=s.policy_id and consent_id=s.consent_id and revoked_at is null)
 or not exists(select 1 from public.trip_version_snapshots where trip_id=new.trip_id and owner_id=s.owner_id and version=new.resulting_version and content is not null)
 then raise exception 'SERVICE_TASK_RESULT_UNREADABLE';end if;
 select * into c from turn_private.service_task_capacity where task_id=s.id for update;
 if s.capacity_enforced then
 if c.task_id is null or c.state<>'reserved' then raise exception 'SERVICE_TASK_CAPACITY_CONFLICT';end if;
 if c.tier='journey_pass' and not exists(select 1 from public.storekit_grants where owner_id=s.owner_id and environment=c.grant_environment and transaction_id=c.grant_transaction_id and state='active' and starts_at<=c.admitted_at and ends_at>clock_timestamp()) then raise exception 'SERVICE_TASK_GRANT_UNAVAILABLE';end if;
 update turn_private.service_task_capacity set state='settled',settled_turn_id=s.last_turn_id,settled_at=clock_timestamp() where task_id=s.id;
 elsif c.task_id is not null then raise exception 'SERVICE_TASK_CAPACITY_CONFLICT';end if;
 update turn_private.service_tasks set trip_objective=trip_objective||jsonb_build_object('outcome','settled','settledVersion',new.resulting_version) where id=s.id;
 return null;
end $$;
revoke all on function turn_private.settle_trip_service_task_v1() from public,anon,authenticated,service_role;
create trigger settle_trip_service_task after insert on public.trip_events for each row execute function turn_private.settle_trip_service_task_v1();

-- Exact guarded edit of the installed writer, preserving all prior source,
-- support, recovery, mobile-session and visible intent protections and ACLs.
do $hook$
declare f record;anchor text:='begin';hook text:=E'begin\n  PERFORM turn_private.trip_confirmation_enter_v1(p_proposal_id);';changed text;
begin
 select p.prosrc,pg_get_functiondef(p.oid) definition,p.proacl into f from pg_proc p where p.oid='public.confirm_and_apply_trip_proposal(uuid,text,text)'::regprocedure;
 if position('trip_confirmation_enter_v1' in f.prosrc)>0 or position('expected_digest' in f.prosrc)=0
 or position('scoped_edit_private.prewrite_v1' in f.prosrc)=0 then raise exception 'TRIP_SETTLEMENT_WRITER_DRIFT';end if;
 -- Only the first block opener; never replace nested BEGINs.
 changed:=overlay(f.definition placing hook from position(anchor in f.definition) for length(anchor));
 execute changed;
 if (select p.proacl from pg_proc p where p.oid='public.confirm_and_apply_trip_proposal(uuid,text,text)'::regprocedure) is distinct from f.proacl
 or (select replace(p.prosrc,hook,anchor) from pg_proc p where p.oid='public.confirm_and_apply_trip_proposal(uuid,text,text)'::regprocedure) is distinct from f.prosrc then raise exception 'TRIP_SETTLEMENT_WRITER_DRIFT';end if;
end $hook$;

-- Original rejection/abandon paths retain their semantics. No cancellation can
-- pretend to undo a committed Trip. Release only an uncommitted objective.
create function turn_private.release_trip_objective_v1(task uuid,reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
 update turn_private.service_tasks set trip_objective=trip_objective||jsonb_build_object('outcome',reason)
 where id=task and trip_objective->>'outcome'='pending';
 if found then update turn_private.service_task_capacity set state='released',released_at=clock_timestamp() where task_id=task and state='reserved';end if;
end $$;
revoke all on function turn_private.release_trip_objective_v1(uuid,text) from public,anon,authenticated,service_role;
create function turn_private.trip_proposal_terminal_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare s turn_private.service_tasks%rowtype;
begin
 if new.status in ('rejected','expired','conflicted') and new.status is distinct from old.status then
 select * into s from turn_private.service_tasks where trip_objective->>'proposalId'=new.id::text;
 if found then perform turn_private.release_trip_objective_v1(s.id,new.status);end if;
 end if;return new;
end $$;
revoke all on function turn_private.trip_proposal_terminal_v1() from public,anon,authenticated,service_role;
create trigger trip_proposal_terminal after update of status on public.trip_proposals for each row execute function turn_private.trip_proposal_terminal_v1();

create function public.cancel_trip_service_task_v1(p_task_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner();s turn_private.service_tasks%rowtype;p public.trip_proposals%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,34));
 select * into s from turn_private.service_tasks where id=p_task_id and owner_id=u and trip_objective is not null;
 if not found then raise exception 'FORBIDDEN';end if;
 if s.trip_objective->>'proposalId' is not null then
 select * into p from public.trip_proposals where id=(s.trip_objective->>'proposalId')::uuid for update;
 if p.status='applied' then return jsonb_build_object('kind','committed','taskId',s.id);end if;
 if p.status='pending' then perform public.reject_trip_proposal_v2(p.id);end if;
 else
 perform public.cancel_chat_turn(s.last_turn_id);
 update scoped_edit_private.operations_v1 set cancelled=true where owner_id=u and operation_id=(s.trip_objective->>'operationId')::uuid and proposal_id is null;
 end if;
 perform turn_private.release_trip_objective_v1(s.id,'cancelled');
 return jsonb_build_object('kind','cancelled','taskId',s.id);
end $$;
revoke all on function public.cancel_trip_service_task_v1(uuid) from public,anon,service_role;
grant execute on function public.cancel_trip_service_task_v1(uuid) to authenticated;
notify pgrst,'reload schema';

-- An old text worker/admission may not reinterpret a Trip objective. Keep its
-- documented original boundary even after adding the new type to the schema.
alter function public.complete_text_work(uuid,uuid,text,text) rename to complete_text_work_before_trip_v1;
create function public.complete_text_work(p_turn_id uuid,p_lease_token uuid,p_kind text,p_text text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from turn_private.service_task_turns l join turn_private.service_tasks s on s.id=l.task_id where l.turn_id=p_turn_id and s.trip_objective is not null) then raise exception 'SERVICE_TASK_SCOPE_CONFLICT';end if;
 return public.complete_text_work_before_trip_v1(p_turn_id,p_lease_token,p_kind,p_text);
end $$;
revoke all on function public.complete_text_work_before_trip_v1(uuid,uuid,text,text),public.complete_text_work(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.complete_text_work(uuid,uuid,text,text) to service_role;
alter function public.submit_service_task_turn(uuid,uuid,uuid,uuid,text,text,uuid,integer,text,uuid) rename to submit_service_task_turn_before_trip_v1;
create function public.submit_service_task_turn(p_thread_id uuid,p_turn_id uuid,p_idempotency_key uuid,p_policy_id uuid,p_locale text,p_text text,p_task_id uuid,p_scope_version integer,p_relationship text,p_parent_turn_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from turn_private.service_tasks where id=p_task_id and trip_objective is not null) then raise exception 'SERVICE_TASK_SCOPE_CONFLICT';end if;
 return public.submit_service_task_turn_before_trip_v1(p_thread_id,p_turn_id,p_idempotency_key,p_policy_id,p_locale,p_text,p_task_id,p_scope_version,p_relationship,p_parent_turn_id);
end $$;
revoke all on function public.submit_service_task_turn_before_trip_v1(uuid,uuid,uuid,uuid,text,text,uuid,integer,text,uuid),public.submit_service_task_turn(uuid,uuid,uuid,uuid,text,text,uuid,integer,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.submit_service_task_turn(uuid,uuid,uuid,uuid,text,text,uuid,integer,text,uuid) to authenticated;

-- All real worker effect gates now also recheck the canonical goal. This adds
-- no goal/history text to the original provider payload or retained request.
alter function scoped_edit_private.work_current_v1(jsonb) rename to work_current_before_trip_v1;
create function scoped_edit_private.work_current_v1(b jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare s turn_private.service_tasks%rowtype;
begin
 select * into s from turn_private.service_tasks where id=(b->>'taskId')::uuid;
 if s.trip_objective is not null and (s.trip_objective->>'outcome'<>'pending' or not turn_private.trip_objective_current_v1(s.owner_id,s.trip_objective)) then return false;end if;
 return scoped_edit_private.work_current_before_trip_v1(b);
end $$;
revoke all on function scoped_edit_private.work_current_v1(jsonb),scoped_edit_private.work_current_before_trip_v1(jsonb) from public,anon,authenticated,service_role;

create function turn_private.trip_rejection_enter_v1(pid uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner();s turn_private.service_tasks%rowtype;
begin
 select * into s from turn_private.service_tasks where trip_objective->>'proposalId'=pid::text;
 if not found then return;end if;
 if s.owner_id<>u then raise exception 'FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,34));
end $$;
revoke all on function turn_private.trip_rejection_enter_v1(uuid) from public,anon,authenticated,service_role;

-- Serialize selection/rejection BEFORE the old code obtains Trip/Proposal locks.
-- No capacity lock is acquired below an original Trip lock for metered tasks.
do $hook$
declare f record;hook text;changed text;
begin
 select p.prosrc,pg_get_functiondef(p.oid) definition,p.proacl into f from pg_proc p where p.oid='public.submit_scoped_trip_edit_v1(uuid,jsonb)'::regprocedure;
 hook:=E'begin\n if p_input->>''action''=''select_candidate'' and exists(select 1 from turn_private.service_tasks s where s.owner_id=auth.uid() and s.trip_objective->>''operationId''=p_input->>''askOperationId'') then perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,34));end if;';
 changed:=overlay(f.definition placing hook from position('begin' in f.definition) for 5);execute changed;
 if (select replace(p.prosrc,hook,'begin') from pg_proc p where p.oid='public.submit_scoped_trip_edit_v1(uuid,jsonb)'::regprocedure) is distinct from f.prosrc then raise exception 'TRIP_SELECTION_HOOK_DRIFT';end if;
 select p.prosrc,pg_get_functiondef(p.oid) definition,p.proacl into f from pg_proc p where p.oid='public.reject_trip_proposal_v2(uuid)'::regprocedure;
 hook:=E'begin\n PERFORM turn_private.trip_rejection_enter_v1(p_proposal_id);';
 changed:=overlay(f.definition placing hook from position('begin' in f.definition) for 5);execute changed;
 if (select replace(p.prosrc,hook,'begin') from pg_proc p where p.oid='public.reject_trip_proposal_v2(uuid)'::regprocedure) is distinct from f.prosrc then raise exception 'TRIP_REJECTION_HOOK_DRIFT';end if;
end $hook$;

create function turn_private.trip_worker_terminal_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.paused_reason is not null then perform turn_private.release_trip_objective_v1(new.task_id,'blocked');end if;
 return new;
end $$;
revoke all on function turn_private.trip_worker_terminal_v1() from public,anon,authenticated,service_role;
create trigger trip_worker_terminal after update of paused_reason on scoped_edit_private.work_v1 for each row execute function turn_private.trip_worker_terminal_v1();

-- Narrow role enrollment. Legacy scoped RPC ACLs remain byte-for-byte revoked.
create function public.trip_service_task_owner_v1(p_trip_id uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner();s turn_private.service_tasks%rowtype;b jsonb;r jsonb;op uuid;
begin
 u:=recovery_private.actor_v1();
 if p_action='context' then
 if not exists(select 1 from turn_private.service_task_capacity_settings where singleton and trip_enabled) then raise exception 'TRIP_SERVICE_TASK_DISABLED';end if;
 if not recovery_private.exact_v1(p_input,array['goal','context']) then raise exception 'INVALID_INPUT';end if;
 b:=p_input->'goal'||jsonb_build_object('tripId',p_trip_id,'baseVersion',p_input->'context'->'expectedHeadVersion');
 if not turn_private.trip_objective_current_v1(u,b) then raise exception 'STALE_BASIS';end if;
 return public.prepare_scoped_trip_edit_v1(p_trip_id,p_input->'context');
 end if;
 if p_action='select' then op:=(p_input->>'askOperationId')::uuid;
 elsif p_action in('read','cancel') then
 if not recovery_private.exact_v1(p_input,array['operationId']) then raise exception 'INVALID_INPUT';end if;
 op:=(p_input->>'operationId')::uuid;
 else raise exception 'INVALID_INPUT';end if;
 select * into s from turn_private.service_tasks where owner_id=u and trip_objective->>'tripId'=p_trip_id::text
 and (trip_objective->>'operationId'=op::text or trip_objective->>'proposalId' in(select proposal_id::text from scoped_edit_private.operations_v1 where owner_id=u and operation_id=op));
 if not found then raise exception 'FORBIDDEN';end if;
 if p_action='cancel' then return public.cancel_trip_service_task_v1(s.id);end if;
 if p_action='select' then
 if not exists(select 1 from turn_private.service_task_capacity_settings where singleton and trip_enabled) then raise exception 'TRIP_SERVICE_TASK_DISABLED';end if;
 return public.submit_scoped_trip_edit_v1(p_trip_id,p_input);
 end if;
 r:=public.read_scoped_trip_edit_operation_v1(p_trip_id,op);
 return r;
end $$;
revoke all on function public.trip_service_task_owner_v1(uuid,text,jsonb) from public,anon,service_role;
grant execute on function public.trip_service_task_owner_v1(uuid,text,jsonb) to authenticated;

-- Same queue and lease mechanics; filter before claiming so this capability
-- cannot lease a legacy text/manual scoped-edit task as a side effect.
create function turn_private.claim_trip_service_work_v1(u uuid,pid uuid,sid uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w turn_private.work%rowtype;j scoped_edit_private.work_v1%rowtype;c scoped_edit_private.contexts_v1%rowtype;cfg scoped_edit_private.worker_settings_v1%rowtype;b jsonb;s turn_private.service_tasks%rowtype;
begin
 if not scoped_edit_private.worker_policy_v1(u,pid,sid) then return jsonb_build_object('kind','pending');end if;
 for j in select q.* from scoped_edit_private.work_v1 q join turn_private.service_tasks t on t.id=q.task_id
 where q.owner_id=u and q.policy_id=pid and q.scope_id=sid and q.paused_reason is null and t.expected_result='trip_modification' and t.trip_objective->>'outcome'='pending' order by q.turn_id loop
 select * into s from turn_private.service_tasks where id=j.task_id;
 if not turn_private.trip_objective_current_v1(u,s.trip_objective) then continue;end if;
 select * into c from scoped_edit_private.contexts_v1 where id=j.context_id;
 if not found or not scoped_edit_private.service_current_v1(c) then continue;end if;
 if not turn_private.lock_turn(j.turn_id,j.owner_id,(c.actor_basis->>'sessionId')::uuid) then continue;end if;
 select * into w from turn_private.work where turn_id=j.turn_id and execution_mode='scoped_trip_edit_v1' and(state='queued' or state='leased' and expires_at<=clock_timestamp()) for update skip locked;
 if not found or w.attempt>=w.max_attempts then continue;end if;
 select * into cfg from scoped_edit_private.worker_settings_v1 where policy_id=j.policy_id;
 update turn_private.work set state='leased',attempt=attempt+1,lease_token=gen_random_uuid(),expires_at=least(clock_timestamp()+lease_ms*interval '1 millisecond',c.expires_at) where turn_id=w.turn_id returning * into w;
 b:=jsonb_build_object('ownerId',j.owner_id,'taskId',j.task_id,'turnId',j.turn_id,'leaseToken',w.lease_token,'operationId',j.operation_id,'contextId',c.id,'contextDigest',c.digest,'sourceDigest',c.source_basis->'sourceDigest','tripId',c.trip_id,'baseVersion',c.base_version,'policyId',j.policy_id,'scopeId',j.scope_id,'attemptId',j.attempt_id,'provider','qwen','model',cfg.model,'priceVersion',cfg.price_version);
 update scoped_edit_private.work_v1 set binding=b,completion=case when completion is null then null else completion||jsonb_build_object('binding',b) end where turn_id=j.turn_id;
 return jsonb_build_object('kind','leased','ownerId',u,'turnId',j.turn_id,'attempt',w.attempt,'leaseToken',w.lease_token,'leaseMs',w.lease_ms);
 end loop;return jsonb_build_object('kind','idle');
end $$;
revoke all on function turn_private.claim_trip_service_work_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function public.trip_service_task_worker_v1(p_method text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j scoped_edit_private.work_v1%rowtype;s turn_private.service_tasks%rowtype;b jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 if not exists(select 1 from turn_private.service_task_capacity_settings where singleton and trip_enabled) then return jsonb_build_object('kind','pending');end if;
 if p_method='claim' then
 if not recovery_private.exact_v1(p_input,array['p_owner_id','p_policy_id','p_scope_id']) then raise exception 'INVALID_INPUT';end if;
 return turn_private.claim_trip_service_work_v1((p_input->>'p_owner_id')::uuid,(p_input->>'p_policy_id')::uuid,(p_input->>'p_scope_id')::uuid);
 end if;
 if p_method='read_scoped_trip_edit_work_v1' then
 select * into j from scoped_edit_private.work_v1 where turn_id=(p_input->>'p_turn_id')::uuid and binding->>'leaseToken'=p_input->>'p_lease_token';
 else select * into j from scoped_edit_private.work_v1 where binding=p_input->'p_binding';end if;
 select * into s from turn_private.service_tasks where id=j.task_id and owner_id=j.owner_id and expected_result='trip_modification';
 if s.id is null or not turn_private.trip_objective_current_v1(s.owner_id,s.trip_objective) then return jsonb_build_object('kind','pending');end if;
 case p_method
 when 'read_scoped_trip_edit_work_v1' then
 if not recovery_private.exact_v1(p_input,array['p_turn_id','p_lease_token']) then raise exception 'INVALID_INPUT';end if;
 return public.read_scoped_trip_edit_work_v1((p_input->>'p_turn_id')::uuid,(p_input->>'p_lease_token')::uuid);
 when 'authorize_scoped_trip_edit_effect_v1' then
 if not recovery_private.exact_v1(p_input,array['p_binding','p_effect']) then raise exception 'INVALID_INPUT';end if;
 return public.authorize_scoped_trip_edit_effect_v1(p_input->'p_binding',(p_input->>'p_effect')::text);
 when 'scoped_trip_edit_budget_v1' then
 if not recovery_private.exact_v1(p_input,array['p_binding','p_effect','p_reserved_micros','p_actual_micros','p_outcome']) then raise exception 'INVALID_INPUT';end if;
 return public.scoped_trip_edit_budget_v1(p_input->'p_binding',(p_input->>'p_effect')::text,(p_input->>'p_reserved_micros')::bigint,(p_input->>'p_actual_micros')::bigint,(p_input->>'p_outcome')::text);
 when 'record_scoped_trip_edit_output_v1' then
 if not recovery_private.exact_v1(p_input,array['p_binding','p_output','p_usage','p_actual_micros']) then raise exception 'INVALID_INPUT';end if;
 return public.record_scoped_trip_edit_output_v1(p_input->'p_binding',p_input->'p_output',p_input->'p_usage',(p_input->>'p_actual_micros')::bigint);
 when 'read_scoped_trip_edit_output_v1' then
 if not recovery_private.exact_v1(p_input,array['p_binding']) then raise exception 'INVALID_INPUT';end if;
 return public.read_scoped_trip_edit_output_v1(p_input->'p_binding');
 when 'pause_scoped_trip_edit_work_v1' then
 if not recovery_private.exact_v1(p_input,array['p_binding','p_reason']) then raise exception 'INVALID_INPUT';end if;
 return public.pause_scoped_trip_edit_work_v1(p_input->'p_binding',(p_input->>'p_reason')::text);
 when 'complete_scoped_trip_edit_work_v1' then
 if not recovery_private.exact_v1(p_input,array['p_binding','p_patch']) then raise exception 'INVALID_INPUT';end if;
 return public.complete_scoped_trip_edit_work_v1(p_input->'p_binding',p_input->'p_patch');
 when 'read_scoped_trip_edit_completion_v1' then
 if not recovery_private.exact_v1(p_input,array['p_binding']) then raise exception 'INVALID_INPUT';end if;
 return public.read_scoped_trip_edit_completion_v1(p_input->'p_binding');
 when 'record_scoped_trip_edit_destination_v1' then
 if not recovery_private.exact_v1(p_input,array['p_binding','p_destination','p_request_id','p_request_digest','p_payload_digest','p_payload_text']) then raise exception 'INVALID_INPUT';end if;
 return public.record_scoped_trip_edit_destination_v1(p_input->'p_binding',p_input->'p_destination',(p_input->>'p_request_id')::text,(p_input->>'p_request_digest')::text,(p_input->>'p_payload_digest')::text,(p_input->>'p_payload_text')::text);
 when 'record_scoped_trip_edit_usage_v1' then
 if not recovery_private.exact_v1(p_input,array['p_binding','p_usage','p_actual_micros','p_outcome']) then raise exception 'INVALID_INPUT';end if;
 return public.record_scoped_trip_edit_usage_v1(p_input->'p_binding',p_input->'p_usage',(p_input->>'p_actual_micros')::bigint,coalesce((p_input->>'p_outcome')::text,'protocol_validated'));
 when 'read_scoped_trip_edit_usage_v1' then
 if not recovery_private.exact_v1(p_input,array['p_binding']) then raise exception 'INVALID_INPUT';end if;
 return public.read_scoped_trip_edit_usage_v1(p_input->'p_binding');
 else raise exception 'INVALID_INPUT';end case;
end $$;
revoke all on function public.trip_service_task_worker_v1(text,jsonb) from public,anon,authenticated;
grant execute on function public.trip_service_task_worker_v1(text,jsonb) to service_role;
notify pgrst,'reload schema';
