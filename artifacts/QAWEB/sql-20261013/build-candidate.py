from pathlib import Path
import re,hashlib,json
root=Path('supabase/migrations'); out=Path('artifacts/QAWEB/sql-20261013')
def fn(file,name):
 s=(root/file).read_text(); m=re.search(r'create (?:or replace )?function '+re.escape(name)+r'\(.*?\nend \$\$;',s,re.S); assert m,name; return m.group()
admit=fn('20260911200339_vpj_07_service_task_records.sql','public.submit_service_task_turn')
admit=admit.replace('public.submit_service_task_turn','public.qa_submit_turn_v1').replace("('new_goal','clarification','repair')","('new_goal','qa_followup','qa_correction')")
admit=admit.replace("if not turn_private.text_policy_current(p_policy_id)","if not exists(select 1 from turn_private.text_policies where id=p_policy_id and context_mode='qa_session_history_v1') or not turn_private.text_policy_current(p_policy_id)")
admit=admit.replace("or (p_relationship='clarification' and parent.output_kind is distinct from 'clarification')\n      or (p_relationship='repair' and parent.output_kind is distinct from 'technical_failure')", "or parent.output_kind not in ('answered','partial','clarification','technical_failure')\n      or parent.output_text is null")
admit=admit.replace("  if exists(select 1 from turn_private.service_tasks where id=p_turn_id)","  if exists(select 1 from turn_private.service_tasks where id=p_task_id) and p_relationship<>'new_goal' then\n    if turn_private.qa_history_v1(p_parent_turn_id) is null or octet_length(((turn_private.qa_history_v1(p_parent_turn_id)->'history')||jsonb_build_array(jsonb_build_object('turnId',p_parent_turn_id,'role','user','content',parent.input_text),jsonb_build_object('turnId',p_parent_turn_id,'role','assistant','content',parent.output_text)))::text)>65536 or (select count(*) from turn_private.service_task_turns where task_id=p_task_id)>=8 then raise exception 'QA_CONTEXT_LIMIT'; end if;\n  end if;\n  if exists(select 1 from turn_private.service_tasks where id=p_turn_id)")
# Replay remains ahead of the new continuation window gate; denied new turns
# never reach service_task_turns/start_text_turn/work/last_turn_id writes.
admit=admit.replace("  if p_thread_id is null", "  if p_text is not null and (select coalesce(sum(case when ascii(ch)>65535 then 2 else 1 end),0) from regexp_split_to_table(p_text,'') ch)>4000 then raise exception 'QA_CONTEXT_LIMIT';end if;\n  if p_thread_id is null",1)
admit=admit.replace("    insert into turn_private.service_tasks(id,owner_id", "    if not turn_private.qa_consumer_window_v1('[]'::jsonb,p_text) then raise exception 'QA_CONTEXT_LIMIT';end if;\n    insert into turn_private.service_tasks(id,owner_id",1)
admit=admit.replace("  if exists(select 1 from turn_private.service_tasks where id=p_task_id) and p_relationship<>'new_goal' then", "  if p_relationship<>'new_goal' and not turn_private.qa_consumer_window_v1((turn_private.qa_history_v1(p_parent_turn_id)->'history')||jsonb_build_array(jsonb_build_object('turnId',p_parent_turn_id,'role','user','content',parent.input_text),jsonb_build_object('turnId',p_parent_turn_id,'role','assistant','content',parent.output_text)),p_text) then raise exception 'QA_CONTEXT_LIMIT';end if;\n  if exists(select 1 from turn_private.service_tasks where id=p_task_id) and p_relationship<>'new_goal' then",1)
claim=fn('20260911205200_vpj_07_task_context.sql','turn_private.claim_text_mode').replace('turn_private.claim_text_mode','public.qa_claim_work_v1').replace('p_owner_id uuid,p_policy_id uuid,p_context_mode text','p_owner_id uuid,p_policy_id uuid').replace('p.context_mode=p_context_mode',"p.context_mode='qa_session_history_v1'")
claim=claim.replace("      update turn_private.work set state='cancelled'","      perform turn_private.cancel_unclaimable_turn_v1(candidate.turn_id,candidate.owner_id);\n      update turn_private.work set state='cancelled'")
claim=claim.replace("    select status into turn_state from public.turns where id=w.turn_id;","    if exists(select 1 from turn_private.text_dispatches d where d.turn_id=w.turn_id) then return jsonb_build_object('kind','reconciliation_required','turnId',w.turn_id); end if;\n    select status into turn_state from public.turns where id=w.turn_id;")
claim=claim.replace("    -- A slow policy/consent", "    if turn_private.qa_history_v1(w.turn_id) is null then return jsonb_build_object('kind','empty'); end if;\n    -- A slow policy/consent")
claim=claim.replace("      and (q.state='queued' or (q.state='leased' and q.expires_at<=clock_timestamp()))", "      and not exists(select 1 from turn_private.text_dispatches d where d.turn_id=q.turn_id)\n      and (q.state='queued' or (q.state='leased' and q.expires_at<=clock_timestamp()))")
claim=claim.replace("  return jsonb_build_object('kind','empty');\nend $$;", """  select q.turn_id into candidate from turn_private.work q
   join turn_private.text_content x on x.turn_id=q.turn_id and x.owner_id=q.owner_id
   join turn_private.text_policies p on p.id=x.policy_id
   where q.owner_id=p_owner_id and x.policy_id=p_policy_id and p.context_mode='qa_session_history_v1'
    and q.state in ('queued','leased') and (q.state='queued' or q.expires_at<=clock_timestamp())
    and exists(select 1 from turn_private.text_dispatches d where d.turn_id=q.turn_id)
   order by q.created_at,q.turn_id limit 1;
  if found then return jsonb_build_object('kind','reconciliation_required','turnId',candidate.turn_id);end if;
  return jsonb_build_object('kind','empty');
end $$;""")
global_before=re.search(r'^CREATE OR REPLACE FUNCTION public\.claim_turn_work\(\).*?^end \$function\$\n;', (root/'20261010020000_assistant_events.sql').read_text(),re.S|re.M).group()
global_after=global_before.replace("('task_history_v1','knowledge_intent_v1')","('task_history_v1','knowledge_intent_v1','qa_session_history_v1')")
(out/'claim-before.sql').write_text(global_before+'\n');(out/'claim-after.sql').write_text(global_after+'\n')
(out/'source-pins.json').write_text(json.dumps({'base':'daa7bae44a660381fb3295d0d2afc327ea98d3ba','globalClaimBeforeSHA256':hashlib.sha256(global_before.encode()).hexdigest(),'globalClaimAfterSHA256':hashlib.sha256(global_after.encode()).hexdigest(),'policyNoticeActivation':'NONE','newTables':[]},indent=2)+'\n')
base='''-- REVIEW CANDIDATE ONLY. No target apply / no policy or budget activation.
-- Shared deltas only after Main checks actual holders and exact source pins.
alter table turn_private.text_policies drop constraint text_policies_context_mode_check;
alter table turn_private.text_policies add constraint text_policies_context_mode_check check(context_mode in ('current_input_v1','task_history_v1','knowledge_intent_v1','qa_session_history_v1'));
alter table turn_private.service_task_turns drop constraint service_task_turns_relationship_check;
alter table turn_private.service_task_turns add constraint service_task_turns_relationship_check check(relationship in ('new_goal','clarification','repair','qa_followup','qa_correction'));

create function turn_private.qa_link_mode_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare mode_n text;
begin
 select p.context_mode into mode_n from turn_private.service_tasks s join turn_private.text_policies p on p.id=s.policy_id where s.id=NEW.task_id;
 if (NEW.relationship in ('qa_followup','qa_correction') and mode_n is distinct from 'qa_session_history_v1')
 or (mode_n='qa_session_history_v1' and NEW.relationship not in ('new_goal','qa_followup','qa_correction')) then raise exception 'QA_MODE_CONFLICT';end if;
 return NEW;
end $$;
create trigger qa_link_mode_v1 before insert or update on turn_private.service_task_turns for each row execute function turn_private.qa_link_mode_v1();

-- Entire finite chain, persisted parent order; no truncation or unqualified fallback.
create function turn_private.qa_history_v1(p_turn uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s turn_private.service_tasks%rowtype; l turn_private.service_task_turns%rowtype;
 c turn_private.text_content%rowtype; cursor_n uuid:=p_turn;seen uuid[]:='{}';hist jsonb:='[]';state_n text;
begin
 select x.* into s from turn_private.service_tasks x join turn_private.service_task_turns a on a.task_id=x.id where a.turn_id=p_turn;
 if not found or not exists(select 1 from turn_private.text_policies where id=s.policy_id and context_mode='qa_session_history_v1')
 or not turn_private.text_policy_current(s.policy_id) then return null;end if;
 perform 1 from turn_private.text_consents where owner_id=s.owner_id and policy_id=s.policy_id and consent_id=s.consent_id and revoked_at is null for share;
 if not found then return null;end if;
 perform 1 from public.chat_threads where id=s.thread_id and owner_id=s.owner_id and status='active' and trip_id is null for share;
 if not found then return null;end if;
 loop
  if cursor_n is null or cursor_n=any(seen) or cardinality(seen)>=8 then return null;end if;
  seen:=array_append(seen,cursor_n);
  select * into l from turn_private.service_task_turns where turn_id=cursor_n and task_id=s.id and owner_id=s.owner_id for share;
  if not found then return null;end if;
  select * into c from turn_private.text_content where turn_id=cursor_n and owner_id=s.owner_id and thread_id=s.thread_id and policy_id=s.policy_id and consent_id=s.consent_id and hidden_at is null for share;
  if not found then return null;end if;
  select status into state_n from public.turns where id=cursor_n and owner_id=s.owner_id and thread_id=s.thread_id for share;
  if not found then return null;end if;
  if cursor_n<>p_turn then
   if state_n not in ('completed','failed') or c.output_text is null or c.output_kind not in ('answered','partial','clarification','technical_failure') then return null;end if;
   hist:=jsonb_build_array(jsonb_build_object('turnId',cursor_n,'role','user','content',c.input_text),jsonb_build_object('turnId',cursor_n,'role','assistant','content',c.output_text))||hist;
   if octet_length(hist::text)>65536 then return null;end if;
  end if;
  if l.parent_turn_id is null then
   if cursor_n<>s.goal_turn_id or l.relationship<>'new_goal' then return null;end if;
   return jsonb_build_object('history',hist,'sourceTurnIds',to_jsonb(seen));
  end if;
  if l.relationship not in ('qa_followup','qa_correction') then return null;end if;
  cursor_n:=l.parent_turn_id;
 end loop;
end $$;

create function turn_private.qa_lock_work_v1(p_turn uuid,p_token uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare w turn_private.work%rowtype;
begin
 select * into w from turn_private.work where turn_id=p_turn;
 if not found or p_token is null or not turn_private.lock_turn(w.turn_id,w.owner_id,w.session_id) then return false;end if;
 select * into w from turn_private.work where turn_id=p_turn for update;
 if not found or w.state<>'leased' or w.lease_token is distinct from p_token or w.expires_at<=clock_timestamp()
 or not exists(select 1 from public.turns where id=p_turn and status not in ('completed','proposal_ready','unavailable','failed','cancelled')) then return false;end if;
 return turn_private.qa_history_v1(p_turn) is not null and w.expires_at>clock_timestamp();
end $$;

create function public.qa_read_work_v1(p_turn_id uuid,p_lease_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c turn_private.text_content%rowtype;p turn_private.text_policies%rowtype;s turn_private.service_tasks%rowtype;w turn_private.work%rowtype;h jsonb;payload jsonb;
begin
 if not turn_private.qa_lock_work_v1(p_turn_id,p_lease_token) then return jsonb_build_object('kind','blocked');end if;
 select * into w from turn_private.work where turn_id=p_turn_id;
 select * into c from turn_private.text_content where turn_id=p_turn_id;
 select * into p from turn_private.text_policies where id=c.policy_id;
 select x.* into s from turn_private.service_tasks x join turn_private.service_task_turns l on l.task_id=x.id where l.turn_id=p_turn_id;
 h:=turn_private.qa_history_v1(p_turn_id);if h is null then return jsonb_build_object('kind','blocked');end if;
 payload:=jsonb_build_object('kind','qa_input','schemaVersion','qa-context/1','contextMode','qa_session_history_v1','ownerId',w.owner_id,'authSessionId',w.session_id,'turnId',p_turn_id,'threadId',c.thread_id,'serviceTaskId',s.id,'policyId',p.id,'consentId',c.consent_id,'provider',p.provider,'endpoint',p.endpoint,'text',c.input_text,'locale',c.locale,'history',h->'history','sourceTurnIds',h->'sourceTurnIds');
 return payload||jsonb_build_object('contextDigest',encode(sha256(convert_to(payload::text,'UTF8')),'hex'));
end $$;

create function public.qa_authorize_dispatch_v1(p_turn_id uuid,p_lease_token uuid,p_scope_id uuid,p_policy_id uuid,p_provider text,p_context_digest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare payload jsonb;fresh_n jsonb;r jsonb;task_n uuid;
begin
 payload:=public.qa_read_work_v1(p_turn_id,p_lease_token);
 if payload->>'kind' is distinct from 'qa_input' or payload->>'policyId' is distinct from p_policy_id::text or payload->>'provider' is distinct from p_provider or payload->>'contextDigest' is distinct from p_context_digest then return jsonb_build_object('kind','blocked');end if;
 task_n:=(payload->>'serviceTaskId')::uuid;
 if not exists(select 1 from public.model_budget_attempts a join public.model_budget_scopes b on b.id=a.scope_id
 join turn_private.service_tasks s on s.id=a.task_id and s.budget_scope_id=a.scope_id and s.owner_id=b.owner_id
 where a.scope_id=p_scope_id and a.attempt_id=p_lease_token and a.task_id=task_n and a.provider=p_provider and a.status='reserved'
 and b.owner_id=(select owner_id from turn_private.text_content where turn_id=p_turn_id))
 or exists(select 1 from turn_private.text_dispatches where lease_token=p_lease_token) then return jsonb_build_object('kind','blocked');end if;
 -- The original budget RPC may wait on its scope row. Roll back THIS dispatch
 -- if the lease or any locked source expires while that lock is awaited.
 begin
  r:=public.dispatch_model_budget(p_scope_id,(select owner_id from turn_private.text_content where turn_id=p_turn_id),p_lease_token);
  if r->>'kind' is distinct from 'dispatched' then return jsonb_build_object('kind','blocked');end if;
  fresh_n:=public.qa_read_work_v1(p_turn_id,p_lease_token);
  if fresh_n->>'kind' is distinct from 'qa_input' or fresh_n->>'policyId' is distinct from p_policy_id::text
   or fresh_n->>'provider' is distinct from p_provider or fresh_n->>'contextDigest' is distinct from p_context_digest
   then raise exception using errcode='PQA01',message='QA_DISPATCH_SOURCE_EXPIRED';end if;
  insert into turn_private.text_dispatches(lease_token,turn_id,consent_id,policy_id) values(p_lease_token,p_turn_id,(fresh_n->>'consentId')::uuid,p_policy_id);
 exception when sqlstate 'PQA01' then
  return jsonb_build_object('kind','blocked');
 end;
 return jsonb_build_object('kind','authorized');
end $$;

create function public.qa_complete_work_v1(p_turn_id uuid,p_lease_token uuid,p_kind text,p_text text) returns jsonb language plpgsql security definer set search_path='' as $$
declare w turn_private.work%rowtype;task_n uuid;
begin
 if p_kind is null or p_kind not in ('answered','partial','clarification','blocked','technical_failure') or not turn_private.valid_text(p_text,8000) then raise exception 'INVALID_INPUT';end if;
 if not turn_private.qa_lock_work_v1(p_turn_id,p_lease_token) then return jsonb_build_object('kind','blocked');end if;
 select task_id into task_n from turn_private.service_task_turns where turn_id=p_turn_id;
 if p_kind in ('answered','partial','clarification') and (not exists(select 1 from turn_private.text_dispatches where lease_token=p_lease_token and turn_id=p_turn_id)
 or not exists(select 1 from public.model_budget_attempts a join turn_private.service_tasks s on s.id=a.task_id and s.budget_scope_id=a.scope_id where a.attempt_id=p_lease_token and a.task_id=task_n and a.status='settled')) then return jsonb_build_object('kind','blocked');end if;
 select * into w from turn_private.work where turn_id=p_turn_id;
 update turn_private.text_content set output_kind=p_kind,output_text=p_text where turn_id=p_turn_id;
 perform turn_private.terminal(p_turn_id,case when p_kind='blocked' then 'unavailable' when p_kind='technical_failure' then 'failed' else 'completed' end,w.attempt);
 return jsonb_build_object('kind','finished');
end $$;

create function public.qa_read_session_v1(p_thread_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner();s turn_private.service_tasks%rowtype;r record;messages jsonb:='[]';v jsonb;
begin
 perform 1 from public.chat_threads where id=p_thread_id and owner_id=u and status='active' and trip_id is null for update;
 if not found then return jsonb_build_object('kind','unavailable');end if;
 select a.* into s from turn_private.service_tasks a join turn_private.text_policies p on p.id=a.policy_id where a.thread_id=p_thread_id and a.owner_id=u and p.context_mode='qa_session_history_v1';
 if not found then
  if exists(select 1 from public.turns where thread_id=p_thread_id) or exists(select 1 from turn_private.text_content where thread_id=p_thread_id) or exists(select 1 from turn_private.service_tasks where thread_id=p_thread_id) then return jsonb_build_object('kind','unavailable');end if;
  return jsonb_build_object('kind','session','schemaVersion','qa-session/1','threadId',p_thread_id,'serviceTaskId',null,'lastTurnId',null,'policyId',null,'messages','[]'::jsonb);
 end if;
 if turn_private.qa_history_v1(s.last_turn_id) is null then return jsonb_build_object('kind','unavailable');end if;
 for r in select value::uuid as turn_id from jsonb_array_elements_text(turn_private.qa_history_v1(s.last_turn_id)->'sourceTurnIds') with ordinality a(value,ord) order by ord desc loop
  if jsonb_array_length(messages)>=8 then return jsonb_build_object('kind','unavailable');end if;
  v:=public.read_text_turn(r.turn_id);if v->>'kind' is distinct from 'text' then return jsonb_build_object('kind','unavailable');end if;
  messages:=messages||jsonb_build_array(v||jsonb_build_object('status',(select status from public.turns where id=r.turn_id and owner_id=u),'createdAt',(select created_at from public.turns where id=r.turn_id and owner_id=u)));
 end loop;
 return jsonb_build_object('kind','session','schemaVersion','qa-session/1','threadId',p_thread_id,'serviceTaskId',s.id,'lastTurnId',s.last_turn_id,'policyId',s.policy_id,'messages',messages);
end $$;

create function public.qa_list_sessions_v1(p_limit integer default 20) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner();r record;v jsonb;rows_n jsonb:='[]';
begin
 if p_limit is null or p_limit not between 1 and 20 then raise exception 'INVALID_INPUT';end if;
 for r in select h.id from public.chat_threads h left join turn_private.service_tasks s on s.thread_id=h.id and s.owner_id=u left join turn_private.text_policies p on p.id=s.policy_id where h.owner_id=u and h.status='active' and h.trip_id is null and (p.context_mode='qa_session_history_v1' or (s.id is null and not exists(select 1 from public.turns where thread_id=h.id) and not exists(select 1 from turn_private.text_content where thread_id=h.id))) order by h.updated_at desc,h.id limit p_limit loop
  v:=public.qa_read_session_v1(r.id);if v->>'kind'='session' then rows_n:=rows_n||jsonb_build_array(v-'messages');end if;
 end loop;
 return jsonb_build_object('kind','sessions','sessions',rows_n);
end $$;
'''
lock_before=fn('20260912190000_vpj_16_grounded_turn.sql','turn_private.lock_text_work')
lock_after=lock_before.replace("if not found or not turn_private.text_policy_current(c.policy_id) then return false; end if;", "if not found or not turn_private.text_policy_current(c.policy_id) or exists(select 1 from turn_private.text_policies where id=c.policy_id and context_mode='qa_session_history_v1') then return false; end if;")
assert lock_after!=lock_before
(out/'lock-text-before.sql').write_text(lock_before+'\n');(out/'lock-text-after.sql').write_text(lock_after+'\n')
wrapper='''
-- Server supplies stable IDs; DB selects persisted original request parent on retry.
create function public.qa_submit_message_v1(p_thread_id uuid,p_turn_id uuid,p_idempotency_key uuid,p_policy_id uuid,p_locale text,p_text text,p_task_id uuid,p_relationship text default 'qa_followup')
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner();s turn_private.service_tasks%rowtype;l turn_private.service_task_turns%rowtype;rel text;parent_n uuid;
begin
 if p_thread_id is null or p_turn_id is null or p_task_id is null or p_idempotency_key is null or p_relationship is null or p_relationship not in ('qa_followup','qa_correction') then raise exception 'INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtextextended('service-task-identity:'||least(p_task_id,p_turn_id)::text,0));
 perform pg_advisory_xact_lock(hashtextextended('service-task-identity:'||greatest(p_task_id,p_turn_id)::text,0));
 insert into public.chat_threads(id,owner_id) values(p_thread_id,u) on conflict do nothing;
 perform 1 from public.chat_threads where id=p_thread_id and owner_id=u and status='active' and trip_id is null for update;
 if not found then raise exception 'FORBIDDEN';end if;
 select * into s from turn_private.service_tasks where id=p_task_id for update;
 if found then
  select * into l from turn_private.service_task_turns where owner_id=u and task_id=p_task_id and idempotency_key=p_idempotency_key;
  if found then
   if l.turn_id is distinct from p_turn_id or (l.relationship<>'new_goal' and l.relationship is distinct from p_relationship) then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;
   rel:=l.relationship;parent_n:=l.parent_turn_id;
  else rel:=p_relationship;parent_n:=s.last_turn_id;end if;
 else rel:='new_goal';parent_n:=null;end if;
 return public.qa_submit_turn_v1(p_thread_id,p_turn_id,p_idempotency_key,p_policy_id,p_locale,p_text,p_task_id,1,rel,parent_n);
end $$;
'''
policy='''
create function public.qa_read_policy_v1(p_policy_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner();r jsonb;
begin
 if not exists(select 1 from turn_private.text_policies where id=p_policy_id and context_mode='qa_session_history_v1') then return jsonb_build_object('kind','unavailable');end if;
 r:=public.read_text_policy(p_policy_id);
 if r->>'kind' is distinct from 'policy' then return r;end if;
 return jsonb_set(r,'{policy}',(r->'policy')||jsonb_build_object('contextMode','qa_session_history_v1','maxTurns',8,'maxHistoryPairs',7,'maxHistoryBytes',65536));
end $$;
create function public.qa_accept_policy_v1(p_policy_id uuid,p_notice_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner();
begin
 if not exists(select 1 from turn_private.text_policies where id=p_policy_id and context_mode='qa_session_history_v1') then return jsonb_build_object('kind','blocked');end if;
 return public.accept_text_policy(p_policy_id,p_notice_hash);
end $$;
'''
message='''
create function public.qa_read_message_v1(p_thread_id uuid,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner();s jsonb;turn_n uuid;v jsonb;
begin
 s:=public.qa_read_session_v1(p_thread_id);if s->>'kind' is distinct from 'session' then return jsonb_build_object('kind','unavailable');end if;
 select turn_id into turn_n from public.chat_turn_idempotency where owner_id=u and thread_id=p_thread_id and idempotency_key=p_request_id::text;
 if not found then return jsonb_build_object('kind','unavailable');end if;
 select value into v from jsonb_array_elements(s->'messages') where value->>'turnId'=turn_n::text;
 if not found then return jsonb_build_object('kind','unavailable');end if;
 return v||jsonb_build_object('requestId',p_request_id,'threadId',p_thread_id,'serviceTaskId',s->'serviceTaskId');
end $$;
'''
reconciliation='''
-- Accounting metadata only: no input/output/history or permission to retry.
create function public.qa_read_reconciliation_v1(p_owner_id uuid,p_policy_id uuid,p_turn_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c turn_private.text_content%rowtype;s turn_private.service_tasks%rowtype;attempts_n jsonb;
begin
 select * into c from turn_private.text_content where turn_id=p_turn_id and owner_id=p_owner_id and policy_id=p_policy_id;
 if not found or not exists(select 1 from turn_private.text_policies where id=p_policy_id and context_mode='qa_session_history_v1') then return jsonb_build_object('kind','unavailable');end if;
 select t.* into s from turn_private.service_tasks t join turn_private.service_task_turns l on l.task_id=t.id and l.owner_id=t.owner_id where l.turn_id=p_turn_id and t.owner_id=p_owner_id and t.thread_id=c.thread_id and t.policy_id=p_policy_id and t.consent_id=c.consent_id;
 if not found then return jsonb_build_object('kind','unavailable');end if;
 select coalesce(jsonb_agg(jsonb_build_object('attemptId',d.lease_token,'scopeId',a.scope_id,'status',a.status,'provider',a.provider,'model',a.model,'priceVersion',a.price_version,'reservedMicros',a.reserved_micros,'actualMicros',a.actual_micros,'dispatchedAt',d.dispatched_at) order by d.dispatched_at,d.lease_token),'[]'::jsonb) into attempts_n
 from turn_private.text_dispatches d join public.model_budget_attempts a on a.attempt_id=d.lease_token and a.task_id=s.id and a.scope_id=s.budget_scope_id
 join public.model_budget_scopes b on b.id=a.scope_id and b.owner_id=p_owner_id
 where d.turn_id=p_turn_id and d.policy_id=p_policy_id and d.consent_id=c.consent_id;
 if jsonb_array_length(attempts_n)=0 then return jsonb_build_object('kind','unavailable');end if;
 return jsonb_build_object('kind','reconciliation','schemaVersion','qa-reconciliation/1','ownerId',p_owner_id,'policyId',p_policy_id,'turnId',p_turn_id,'threadId',c.thread_id,'serviceTaskId',s.id,'attempts',attempts_n);
end $$;
'''
parts=[base,(out/'consumer-window.sql').read_text(),policy,admit,wrapper,message,reconciliation,claim,global_after,lock_after]
acl='''
revoke all on function turn_private.qa_link_mode_v1(),turn_private.qa_history_v1(uuid),turn_private.qa_lock_work_v1(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.qa_read_policy_v1(uuid),public.qa_accept_policy_v1(uuid,text),public.qa_submit_message_v1(uuid,uuid,uuid,uuid,text,text,uuid,text),public.qa_submit_turn_v1(uuid,uuid,uuid,uuid,text,text,uuid,integer,text,uuid),public.qa_read_session_v1(uuid),public.qa_read_message_v1(uuid,uuid),public.qa_list_sessions_v1(integer) from public,anon,service_role;
grant execute on function public.qa_read_policy_v1(uuid),public.qa_accept_policy_v1(uuid,text),public.qa_submit_message_v1(uuid,uuid,uuid,uuid,text,text,uuid,text),public.qa_submit_turn_v1(uuid,uuid,uuid,uuid,text,text,uuid,integer,text,uuid),public.qa_read_session_v1(uuid),public.qa_read_message_v1(uuid,uuid),public.qa_list_sessions_v1(integer) to authenticated;
revoke all on function public.qa_read_reconciliation_v1(uuid,uuid,uuid),public.qa_claim_work_v1(uuid,uuid),public.qa_read_work_v1(uuid,uuid),public.qa_authorize_dispatch_v1(uuid,uuid,uuid,uuid,text,text),public.qa_complete_work_v1(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.qa_read_reconciliation_v1(uuid,uuid,uuid),public.qa_claim_work_v1(uuid,uuid),public.qa_read_work_v1(uuid,uuid),public.qa_authorize_dispatch_v1(uuid,uuid,uuid,uuid,text,text),public.qa_complete_work_v1(uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';
'''
body=lambda f:re.search(r'\bAS\s+(\$\w*\$)(.*?)\1',f,re.S|re.I).group(2)
corepins=json.loads((out/'source-pins.json').read_text())
corepins.update({'globalClaimBeforeProsrcMD5':hashlib.md5(body(global_before).encode()).hexdigest(),'globalClaimAfterProsrcMD5':hashlib.md5(body(global_after).encode()).hexdigest(),'legacyLockBeforeProsrcMD5':hashlib.md5(body(lock_before).encode()).hexdigest(),'legacyLockAfterProsrcMD5':hashlib.md5(body(lock_after).encode()).hexdigest()})
(out/'source-pins.json').write_text(json.dumps(corepins,indent=2)+'\n')
guards="do $$begin\n if (select md5(prosrc) from pg_proc where oid='public.claim_turn_work()'::regprocedure)<>"+"'"+corepins['globalClaimBeforeProsrcMD5']+"'"+" or (select md5(prosrc) from pg_proc where oid='turn_private.lock_text_work(uuid,uuid)'::regprocedure)<>"+"'"+corepins['legacyLockBeforeProsrcMD5']+"'"+" then raise exception 'QA_SHARED_SOURCE_CONFLICT';end if;\nend$$;\n"
original_checks=json.loads((out/'constraints-before.json').read_text())
check_guards=[]
for relation,name in [('turn_private.text_policies','text_policies_context_mode_check'),('turn_private.service_task_turns','service_task_turns_relationship_check')]:
 value=original_checks[name];q=lambda v:"'"+v.replace("'","''")+"'"
 check_guards.append("(select pg_get_constraintdef(oid) from pg_constraint where conrelid="+q(relation)+"::regclass and conname="+q(name)+") is distinct from "+q(value))
corepins['originalCheckDefinitions']={n:original_checks[n]for n in ['text_policies_context_mode_check','service_task_turns_relationship_check']}
(out/'source-pins.json').write_text(json.dumps(corepins,indent=2)+'\n')
constraint_guard="do $$begin\n if "+'\n or '.join(check_guards)+" then raise exception 'QA_SHARED_CONSTRAINT_CONFLICT';end if;\nend$$;\n"
(out/'candidate.sql').write_text('-- Main-reviewed source pins required; apply as one transaction.\n'+guards+constraint_guard+'\n\n'.join(parts)+acl)
