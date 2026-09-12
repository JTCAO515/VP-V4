-- Versioned grounded turns: current-input model intent, first-party facts only.
-- No policy, consent, budget scope, worker or user billing is activated.
alter table turn_private.text_policies drop constraint text_policies_context_mode_check;
alter table turn_private.text_policies add constraint text_policies_context_mode_check
 check(context_mode in ('current_input_v1','task_history_v1','knowledge_intent_v1'));

create table turn_private.grounded_turns (
 turn_id uuid primary key references turn_private.text_content(turn_id) deferrable initially deferred,
 owner_id uuid not null,
 task_id uuid not null references turn_private.service_tasks(id) deferrable initially deferred,
 city text not null check(city in ('shanghai','beijing','guangzhou','chongqing')),
 locale text not null check(locale in ('zh','en')),
 scope_version integer not null default 1 check(scope_version=1),
 intent text check(intent in ('rail_boarding_documents','clarification','unsupported','technical_failure','blocked')),
 request_scope text check(request_scope in ('single','additional_needs','unknown')),
 original_outcome text check(original_outcome in ('answered','partial','clarification','blocked','technical_failure')),
 basis jsonb,
 completed_at timestamptz,
 check((intent is null)=(completed_at is null)),
 check((intent is null)=(original_outcome is null)),
 check((intent is null)=(request_scope is null)),
 check(basis is null or jsonb_typeof(basis)='object')
);
alter table turn_private.grounded_turns enable row level security;
revoke all on turn_private.grounded_turns from public,anon,authenticated,service_role;

create function knowledge_review_private.resolve_question(p_input jsonb,p_basis jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare scope jsonb; item record; frozen jsonb:='[]'; instant timestamptz; required text; candidates jsonb;
 eligible jsonb; reasons jsonb; claims jsonb:='[]'; rows jsonb:='[]'; variants integer; basis jsonb;
begin
 if not knowledge_review_private.closed_object(p_input,array['questionId','questionVersion','city','locale'])
  or p_input->>'questionId' is distinct from 'rail_boarding_documents'
  or p_input->'questionVersion' is distinct from '1'::jsonb then raise exception 'INVALID_INPUT'; end if;
 scope:=jsonb_build_object('city',p_input->'city','scene','rail','locale',p_input->'locale');
 -- Callers must establish owner/session or worker lease authority before this
 -- private resolver. No ordinary role or service key can execute it directly.
 if coalesce(scope->>'city','') not in ('shanghai','beijing','guangzhou','chongqing')
  or coalesce(scope->>'locale','') not in ('zh','en') then raise exception 'INVALID_INPUT'; end if;
 perform 1 from knowledge_review_private.publication_settings where singleton and enabled for share;
 if not found then raise exception 'KNOWLEDGE_DISABLED'; end if;
 -- Freeze this answer's own locked publication set. A later publication must
 -- not enter an answer unless its revocation barrier was acquired here.
 for item in select s.candidate_id,s.payload,p.state,c.status as review_state,
    p.fact_id,s.statement_id,s.revision,c.reviewed_at,p.published_at,p.expires_at
   from knowledge_review_private.statements s join knowledge_review_private.candidates c on c.id=s.candidate_id
   join knowledge_review_private.publications p on p.candidate_id=s.candidate_id
   where s.payload->'scope'->'cities' ? (scope->>'city') and s.payload->'scope'->>'scene'='rail'
    and s.payload->'assertion'->>'subjectId'='rail_eticket_boarding'
    and s.payload->'assertion'->>'predicate'='requires_document'
    and s.payload->'assertion'->>'objectId' in ('original_valid_booking_id','valid_ticket_not_itinerary_or_receipt')
   order by p.candidate_id for share of p loop
  frozen:=frozen||jsonb_build_array(to_jsonb(item));
  if jsonb_array_length(frozen)>50 then raise exception 'KNOWLEDGE_CAPACITY'; end if;
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('factId',x->'fact_id','assertionId',x->'statement_id',
   'revision',x->'revision','payloadHash',encode(pg_catalog.sha256(convert_to((x->'payload')::text,'UTF8')),'hex')) order by x->>'fact_id'),'[]')
  into basis from jsonb_array_elements(frozen) x;
 if p_basis is not null and exists(select 1 from jsonb_array_elements(basis) x join jsonb_array_elements(p_basis->'publications') b
   on b->>'factId'=x->>'factId' where x is distinct from b) then raise exception 'KNOWLEDGE_SNAPSHOT_CHANGED'; end if;
 instant:=clock_timestamp();
 foreach required in array array['original_valid_booking_id','valid_ticket_not_itinerary_or_receipt'] loop
  -- A historical gap is not permission to deliver new evidence on a later read.
  -- Keep completion-time coverage distinct from all observed candidate references.
  if p_basis is not null and exists(select 1 from jsonb_array_elements(p_basis->'claims') b where b->>'id'=required and b->>'status'<>'covered') then
   claims:=claims||(select jsonb_build_array(b) from jsonb_array_elements(p_basis->'claims') b where b->>'id'=required);
   continue;
  end if;
  -- Resolve actual publication IDs at request time. Review alone is not
  -- publication. Missing/expired/revoked and unresolved variants are distinct.
  select coalesce(jsonb_agg(jsonb_build_object('candidateId',x->'candidate_id',
    'state',case when x->>'state'='revoked' then 'revoked' when x->>'review_state'<>'reviewed' then 'unreviewed'
      when (x->>'expires_at')::timestamptz<=instant then 'expired' else 'eligible' end,
    'payload',x->'payload','factId',x->'fact_id','assertionId',x->'statement_id','assertionRevision',x->'revision',
    'reviewedAt',x->'reviewed_at','publishedAt',x->'published_at','expiresAt',x->'expires_at') order by x->>'candidate_id'),'[]')
   into candidates from jsonb_array_elements(frozen) x where x->'payload'->'assertion'->>'objectId'=required;
  if jsonb_array_length(candidates)>50 then raise exception 'KNOWLEDGE_CAPACITY'; end if;
  select coalesce(jsonb_agg(x order by x->>'factId'),'[]'),
    count(distinct jsonb_build_array(x->'payload'->'assertion',x->'payload'->'expressions'))
   into eligible,variants from jsonb_array_elements(candidates) x where x->>'state'='eligible';
  -- Historical reads keep the original evidence set. New publications may expose
  -- a current conflict, but never silently replace or complete a saved result.
  if p_basis is not null then
   select coalesce(jsonb_agg(x order by x->>'factId'),'[]') into candidates from jsonb_array_elements(candidates) x
    where exists(select 1 from jsonb_array_elements(p_basis->'claims') b where b->>'id'=required and b->'factIds' ? (x->>'factId'));
   select coalesce(jsonb_agg(x order by x->>'factId'),'[]') into eligible from jsonb_array_elements(candidates) x where x->>'state'='eligible';
  end if;
  if variants>1 and (p_basis is null or jsonb_array_length(eligible)>0) then
   -- Different wording/qualifiers are not ranked away or declared equivalent.
   claims:=claims||jsonb_build_array(jsonb_build_object('id',required,'status','unresolved_variants','reasons',jsonb_build_array('unresolved_variants'),'factIds','[]'::jsonb));
  elsif jsonb_array_length(eligible)=0 then
   select coalesce(jsonb_agg(distinct x->'state'),'["missing"]'::jsonb) into reasons from jsonb_array_elements(candidates) x;
   claims:=claims||jsonb_build_array(jsonb_build_object('id',required,'status','unavailable','reasons',reasons,'factIds','[]'::jsonb));
  else
   claims:=claims||jsonb_build_array(jsonb_build_object('id',required,'status','covered','reasons','[]'::jsonb,
    'factIds',(select jsonb_agg(x->'factId' order by x->>'factId') from jsonb_array_elements(eligible) x)));
   -- Preserve each corroborating publication and all source locators, with no
   -- raw source snippets, editor notes, model-generated text or inferred facts.
   select rows||coalesce(jsonb_agg(jsonb_build_object('factId',x->'factId','version',1,
    'assertionId',x->'assertionId','assertionRevision',x->'assertionRevision',
    'assertion',x->'payload'->'assertion','scope',x->'payload'->'scope',
    'text',x->'payload'->'expressions'->(scope->>'locale')->'text',
    'conditions',x->'payload'->'expressions'->(scope->>'locale')->'conditions',
    'exclusions',x->'payload'->'expressions'->(scope->>'locale')->'exclusions',
    'reviewedAt',x->'reviewedAt','publishedAt',x->'publishedAt','expiresAt',x->'expiresAt',
    'sources',(select jsonb_agg(jsonb_build_object('sourceRevisionId',r.id,'sourceKey',r.source_key,
      'revisionLabel',r.revision_label,'publisher',r.declaration->>'publisher','uri',r.declaration->>'uri','locator',r.declaration->>'locator')
      order by r.source_key,r.revision_label) from knowledge_review_private.statement_sources ss
      join knowledge_review_private.source_revisions r on r.id=ss.source_revision_id where ss.candidate_id=(x->>'candidateId')::uuid)
    ) order by x->>'factId'),'[]') into rows from jsonb_array_elements(eligible) x;
  end if;
 end loop;
 if jsonb_array_length(rows)>50 then raise exception 'KNOWLEDGE_CAPACITY'; end if;
 return jsonb_build_object('schemaVersion','knowledge-answer/1','evaluatedAt',instant,'scope',scope,'_basis',coalesce(p_basis,jsonb_build_object('publications',basis,'claims',claims)),
  'purpose','trip_planning','recipient','first_party','territory','CN-mainland',
  'status',case when jsonb_array_length(rows)>0 then 'available' else 'no_eligible_content' end,'statements',rows,
  'answer',jsonb_build_object('questionId','rail_boarding_documents','questionVersion',1,
   'outcome',case when not exists(select 1 from jsonb_array_elements(claims) x where x->>'status'<>'covered') then 'answered'
     when jsonb_array_length(rows)>0 then 'partial' else 'no_answer' end,'claims',claims));
end $$;
revoke all on function knowledge_review_private.resolve_question(jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.knowledge_answer_v1(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not knowledge_review_private.closed_object(p_input,array['questionId','questionVersion','city','locale'])
  or p_input->>'questionId' is distinct from 'rail_boarding_documents'
  or p_input->'questionVersion' is distinct from '1'::jsonb then raise exception 'INVALID_INPUT'; end if;
 -- Preserve the existing ordinary identity and base reader boundary.
 perform public.knowledge_read_v1(jsonb_build_object('city',p_input->'city','scene','rail','locale',p_input->'locale'));
 return knowledge_review_private.resolve_question(p_input)-'_basis';
end $$;

alter table turn_private.service_tasks drop constraint service_tasks_expected_result_check;
alter table turn_private.service_tasks add constraint service_tasks_expected_result_check
 check(expected_result in ('text_answer','reviewed_answer'));

create or replace function public.submit_service_task_turn(
  p_thread_id uuid,p_turn_id uuid,p_idempotency_key uuid,p_policy_id uuid,p_locale text,p_text text,
  p_task_id uuid,p_scope_version integer,p_relationship text,p_parent_turn_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); c turn_private.text_consents%rowtype;
  s turn_private.service_tasks%rowtype; prior turn_private.service_task_turns%rowtype;
  parent turn_private.text_content%rowtype; digest text; result jsonb;
begin
  if p_thread_id is null or p_turn_id is null or p_task_id is null or p_turn_id=p_task_id
    or p_idempotency_key is null or p_scope_version is distinct from 1
    or p_relationship is null or p_relationship not in ('new_goal','clarification','repair')
    or ((p_relationship='new_goal') is distinct from (p_parent_turn_id is null))
    or p_locale is null or p_locale not in ('zh','en','es','ru','ar')
    or not turn_private.valid_text(p_text,4000) then raise exception 'INVALID_INPUT'; end if;
  if exists(select 1 from turn_private.text_policies where id=p_policy_id and context_mode='knowledge_intent_v1') then raise exception 'DATA_POLICY_BLOCKED'; end if;
  if not turn_private.text_policy_current(p_policy_id) then raise exception 'DATA_POLICY_BLOCKED'; end if;
  select * into c from turn_private.text_consents where owner_id=u and policy_id=p_policy_id and revoked_at is null for share;
  if not found then raise exception 'DATA_POLICY_BLOCKED'; end if;
  digest:=encode(pg_catalog.sha256(convert_to(jsonb_build_array(p_thread_id,p_turn_id,p_idempotency_key,p_policy_id,p_locale,p_text,p_task_id,p_scope_version,p_relationship,p_parent_turn_id)::text,'UTF8')),'hex');
  -- Shared identity locks precede thread locks; acquire the pair in UUID order.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('service-task-identity:'||least(p_task_id,p_turn_id)::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('service-task-identity:'||greatest(p_task_id,p_turn_id)::text,0));
  if p_relationship='new_goal' then
    insert into public.chat_threads(id,owner_id) values(p_thread_id,u) on conflict do nothing;
  end if;
  perform 1 from public.chat_threads where id=p_thread_id and owner_id=u and status='active' and trip_id is null for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into s from turn_private.service_tasks where id=p_task_id for update;
  if found then
    if s.owner_id<>u or s.thread_id<>p_thread_id or s.policy_id<>p_policy_id or s.consent_id<>c.consent_id
      or s.scope_version<>p_scope_version then raise exception 'SERVICE_TASK_CONFLICT'; end if;
    perform 1 from turn_private.text_content g join public.turns t on t.id=g.turn_id and t.owner_id=u
      where g.turn_id=s.goal_turn_id and g.owner_id=u and g.hidden_at is null;
    if not found then raise exception 'DATA_POLICY_BLOCKED'; end if;
    select * into prior from turn_private.service_task_turns where owner_id=u and task_id=s.id and idempotency_key=p_idempotency_key;
    if found then
      if prior.request_digest<>digest then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
      -- Existing admission rechecks original content visibility/consent and never enqueues again.
      result:=public.start_text_turn(p_thread_id,p_turn_id,p_idempotency_key,p_policy_id,p_locale,p_text);
      if result->>'kind'<>'accepted' then raise exception 'DATA_POLICY_BLOCKED'; end if;
      return result||jsonb_build_object('serviceTaskId',s.id,'scopeVersion',s.scope_version,'relationship',prior.relationship,'parentTurnId',prior.parent_turn_id);
    end if;
    if p_relationship='new_goal' or s.last_turn_id is distinct from p_parent_turn_id then raise exception 'SERVICE_TASK_CONFLICT'; end if;
    select g.* into parent from turn_private.text_content g join public.turns t on t.id=g.turn_id and t.owner_id=u
      where g.turn_id=p_parent_turn_id and g.owner_id=u and g.thread_id=p_thread_id and g.hidden_at is null
      and t.status in ('completed','failed');
    if not found or parent.policy_id<>p_policy_id or parent.consent_id<>c.consent_id
      or (p_relationship='clarification' and parent.output_kind is distinct from 'clarification')
      or (p_relationship='repair' and parent.output_kind is distinct from 'technical_failure') then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  else
    if p_relationship<>'new_goal' or exists(select 1 from public.turns where thread_id=p_thread_id)
      or exists(select 1 from public.turns where id=p_task_id)
      or exists(select 1 from turn_private.text_content where thread_id=p_thread_id or turn_id=p_task_id)
      or exists(select 1 from public.model_budget_attempts where task_id=p_task_id)
      or exists(select 1 from turn_private.service_tasks where thread_id=p_thread_id)
      then raise exception 'SERVICE_TASK_CONFLICT'; end if;
    insert into turn_private.service_tasks(id,owner_id,thread_id,goal_turn_id,last_turn_id,policy_id,consent_id,scope_version,goal_digest)
      values(p_task_id,u,p_thread_id,p_turn_id,p_turn_id,p_policy_id,c.consent_id,p_scope_version,
        encode(pg_catalog.sha256(convert_to(p_text,'UTF8')),'hex'));
  end if;
  if exists(select 1 from turn_private.service_tasks where id=p_turn_id)
    or exists(select 1 from public.turns where id=p_turn_id)
    or exists(select 1 from turn_private.text_content where turn_id=p_turn_id)
    then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  insert into turn_private.service_task_turns(turn_id,task_id,owner_id,parent_turn_id,relationship,idempotency_key,request_digest)
    values(p_turn_id,p_task_id,u,p_parent_turn_id,p_relationship,p_idempotency_key,digest);
  result:=public.start_text_turn(p_thread_id,p_turn_id,p_idempotency_key,p_policy_id,p_locale,p_text);
  if result->>'kind'<>'accepted' or result->>'reused'<>'false' then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  update turn_private.service_tasks set last_turn_id=p_turn_id where id=p_task_id;
  return result||jsonb_build_object('serviceTaskId',p_task_id,'scopeVersion',p_scope_version,'relationship',p_relationship,'parentTurnId',p_parent_turn_id);
end $$;
create function public.submit_grounded_turn(
  p_thread_id uuid,p_turn_id uuid,p_idempotency_key uuid,p_policy_id uuid,p_locale text,p_text text,
  p_task_id uuid,p_scope_version integer,p_relationship text,p_parent_turn_id uuid,p_city text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); c turn_private.text_consents%rowtype;
  s turn_private.service_tasks%rowtype; prior turn_private.service_task_turns%rowtype;
  parent turn_private.text_content%rowtype; digest text; result jsonb;
begin
  if p_city is null or p_city not in ('shanghai','beijing','guangzhou','chongqing') or p_locale is null or p_locale not in ('zh','en') then raise exception 'INVALID_INPUT'; end if;
  if not exists(select 1 from turn_private.text_policies where id=p_policy_id and context_mode='knowledge_intent_v1') then raise exception 'DATA_POLICY_BLOCKED'; end if;
  if p_thread_id is null or p_turn_id is null or p_task_id is null or p_turn_id=p_task_id
    or p_idempotency_key is null or p_scope_version is distinct from 1
    or p_relationship is null or p_relationship not in ('new_goal','clarification','repair')
    or ((p_relationship='new_goal') is distinct from (p_parent_turn_id is null))
    or p_locale is null or p_locale not in ('zh','en','es','ru','ar')
    or not turn_private.valid_text(p_text,4000) then raise exception 'INVALID_INPUT'; end if;
  if not turn_private.text_policy_current(p_policy_id) then raise exception 'DATA_POLICY_BLOCKED'; end if;
  select * into c from turn_private.text_consents where owner_id=u and policy_id=p_policy_id and revoked_at is null for share;
  if not found then raise exception 'DATA_POLICY_BLOCKED'; end if;
  digest:=encode(pg_catalog.sha256(convert_to(jsonb_build_array(p_thread_id,p_turn_id,p_idempotency_key,p_policy_id,p_locale,p_text,p_task_id,p_scope_version,p_relationship,p_parent_turn_id,p_city)::text,'UTF8')),'hex');
  -- Shared identity locks precede thread locks; acquire the pair in UUID order.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('service-task-identity:'||least(p_task_id,p_turn_id)::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('service-task-identity:'||greatest(p_task_id,p_turn_id)::text,0));
  if p_relationship='new_goal' then
    insert into public.chat_threads(id,owner_id) values(p_thread_id,u) on conflict do nothing;
  end if;
  perform 1 from public.chat_threads where id=p_thread_id and owner_id=u and status='active' and trip_id is null for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into s from turn_private.service_tasks where id=p_task_id for update;
  if found then
    if s.owner_id<>u or s.thread_id<>p_thread_id or s.policy_id<>p_policy_id or s.consent_id<>c.consent_id
      or s.scope_version<>p_scope_version or s.expected_result<>'reviewed_answer' then raise exception 'SERVICE_TASK_CONFLICT'; end if;
    perform 1 from turn_private.text_content g join public.turns t on t.id=g.turn_id and t.owner_id=u
      where g.turn_id=s.goal_turn_id and g.owner_id=u and g.hidden_at is null;
    if not found then raise exception 'DATA_POLICY_BLOCKED'; end if;
    select * into prior from turn_private.service_task_turns where owner_id=u and task_id=s.id and idempotency_key=p_idempotency_key;
    if found then
      if prior.request_digest<>digest then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
      -- Existing admission rechecks original content visibility/consent and never enqueues again.
      result:=public.start_text_turn(p_thread_id,p_turn_id,p_idempotency_key,p_policy_id,p_locale,p_text);
      if result->>'kind'<>'accepted' then raise exception 'DATA_POLICY_BLOCKED'; end if;
      return result||jsonb_build_object('serviceTaskId',s.id,'scopeVersion',s.scope_version,'relationship',prior.relationship,'parentTurnId',prior.parent_turn_id);
    end if;
    if (select count(*) from turn_private.service_task_turns where task_id=s.id)>=4 then raise exception 'SERVICE_TASK_CONFLICT'; end if;
    if not exists(select 1 from turn_private.grounded_turns g where g.turn_id=s.goal_turn_id and g.city=p_city and g.locale=p_locale) then raise exception 'SERVICE_TASK_CONFLICT'; end if;
    if p_relationship='new_goal' or s.last_turn_id is distinct from p_parent_turn_id then raise exception 'SERVICE_TASK_CONFLICT'; end if;
    select g.* into parent from turn_private.text_content g join public.turns t on t.id=g.turn_id and t.owner_id=u
      where g.turn_id=p_parent_turn_id and g.owner_id=u and g.thread_id=p_thread_id and g.hidden_at is null
      and t.status in ('completed','failed');
    if not found or parent.policy_id<>p_policy_id or parent.consent_id<>c.consent_id
      or (p_relationship='clarification' and parent.output_kind is distinct from 'clarification')
      or (p_relationship='repair' and parent.output_kind is distinct from 'technical_failure') then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  else
    if p_relationship<>'new_goal' or exists(select 1 from public.turns where thread_id=p_thread_id)
      or exists(select 1 from public.turns where id=p_task_id)
      or exists(select 1 from turn_private.text_content where thread_id=p_thread_id or turn_id=p_task_id)
      or exists(select 1 from public.model_budget_attempts where task_id=p_task_id)
      or exists(select 1 from turn_private.service_tasks where thread_id=p_thread_id)
      then raise exception 'SERVICE_TASK_CONFLICT'; end if;
    insert into turn_private.service_tasks(id,owner_id,thread_id,goal_turn_id,last_turn_id,policy_id,consent_id,scope_version,expected_result,goal_digest)
      values(p_task_id,u,p_thread_id,p_turn_id,p_turn_id,p_policy_id,c.consent_id,p_scope_version,'reviewed_answer',
        encode(pg_catalog.sha256(convert_to(p_text,'UTF8')),'hex'));
  end if;
  if exists(select 1 from turn_private.service_tasks where id=p_turn_id)
    or exists(select 1 from public.turns where id=p_turn_id)
    or exists(select 1 from turn_private.text_content where turn_id=p_turn_id)
    then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  insert into turn_private.service_task_turns(turn_id,task_id,owner_id,parent_turn_id,relationship,idempotency_key,request_digest)
    values(p_turn_id,p_task_id,u,p_parent_turn_id,p_relationship,p_idempotency_key,digest);
  insert into turn_private.grounded_turns(turn_id,owner_id,task_id,city,locale) values(p_turn_id,u,p_task_id,p_city,p_locale);
  result:=public.start_text_turn(p_thread_id,p_turn_id,p_idempotency_key,p_policy_id,p_locale,p_text);
  if result->>'kind'<>'accepted' or result->>'reused'<>'false' then raise exception 'SERVICE_TASK_CONFLICT'; end if;
  update turn_private.service_tasks set last_turn_id=p_turn_id where id=p_task_id;
  return result||jsonb_build_object('serviceTaskId',p_task_id,'scopeVersion',p_scope_version,'relationship',p_relationship,'parentTurnId',p_parent_turn_id);
end $$;
revoke all on function public.submit_grounded_turn(uuid,uuid,uuid,uuid,text,text,uuid,integer,text,uuid,text) from public,anon,service_role;
grant execute on function public.submit_grounded_turn(uuid,uuid,uuid,uuid,text,text,uuid,integer,text,uuid,text) to authenticated;

create or replace function turn_private.lock_text_work(p_turn uuid,p_token uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare w turn_private.work%rowtype; c turn_private.text_content%rowtype;
begin
  select * into w from turn_private.work where turn_id=p_turn;
  if not found or p_token is null or not turn_private.lock_turn(w.turn_id,w.owner_id,w.session_id) then return false; end if;
  select * into w from turn_private.work where turn_id=p_turn for update;
  if not found or w.state<>'leased' or w.lease_token is distinct from p_token or w.expires_at<=clock_timestamp()
    or not exists(select 1 from public.turns where id=p_turn and status not in ('completed','proposal_ready','unavailable','failed','cancelled')) then return false; end if;
  select * into c from turn_private.text_content where turn_id=p_turn and owner_id=w.owner_id and hidden_at is null;
  if not found or not turn_private.text_policy_current(c.policy_id) then return false; end if;
  if exists(select 1 from turn_private.service_task_turns where turn_id=p_turn)
    and not exists(select 1 from turn_private.service_task_turns l
      join turn_private.service_tasks s on s.id=l.task_id and s.owner_id=c.owner_id and s.thread_id=c.thread_id
      join turn_private.text_content g on g.turn_id=s.goal_turn_id and g.hidden_at is null
      join public.turns t on t.id=g.turn_id and t.owner_id=c.owner_id
      where l.turn_id=p_turn and s.policy_id=c.policy_id and s.consent_id=c.consent_id)
    then return false; end if;
  perform 1 from turn_private.text_consents where owner_id=c.owner_id and policy_id=c.policy_id and consent_id=c.consent_id and revoked_at is null for share;
  return found and w.expires_at>clock_timestamp() and (
    (select context_mode from turn_private.text_policies where id=c.policy_id) in ('current_input_v1','knowledge_intent_v1')
    or turn_private.task_history(p_turn) is not null);
end $$;

create or replace function turn_private.task_history(p_turn uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s turn_private.service_tasks%rowtype; l turn_private.service_task_turns%rowtype;
  c turn_private.text_content%rowtype; cursor_id uuid:=p_turn; seen uuid[]:='{}'; result jsonb:='[]'; state text;
begin
  select t.* into s from turn_private.service_tasks t join turn_private.service_task_turns x on x.task_id=t.id where x.turn_id=p_turn;
  if not found or exists(select 1 from turn_private.text_policies where id=s.policy_id and context_mode='knowledge_intent_v1') then return null; end if;
  loop
    if cursor_id is null or cursor_id=any(seen) or cardinality(seen)>=4 then return null; end if;
    seen:=array_append(seen,cursor_id);
    select * into l from turn_private.service_task_turns where turn_id=cursor_id and task_id=s.id and owner_id=s.owner_id;
    if not found then return null; end if;
    select * into c from turn_private.text_content where turn_id=cursor_id and owner_id=s.owner_id and thread_id=s.thread_id
      and policy_id=s.policy_id and consent_id=s.consent_id and hidden_at is null;
    if not found then return null; end if;
    select status into state from public.turns where id=cursor_id and owner_id=s.owner_id and thread_id=s.thread_id;
    if not found then return null; end if;
    if cursor_id<>p_turn then
      if state not in ('completed','failed') or c.output_kind not in ('clarification','technical_failure') or c.output_text is null then return null; end if;
      result:=jsonb_build_array(jsonb_build_object('role','user','content',c.input_text),
        jsonb_build_object('role','assistant','content',c.output_text))||result;
    end if;
    if l.parent_turn_id is null then
      if cursor_id<>s.goal_turn_id or l.relationship<>'new_goal' then return null; end if;
      return result;
    end if;
    cursor_id:=l.parent_turn_id;
  end loop;
end $$;

create or replace function public.claim_turn_work()
returns jsonb language plpgsql security definer set search_path='' as $$
declare candidate record; w turn_private.work%rowtype; turn_state text;
begin
  -- Advisory locks keep competing claimers off one candidate without reversing
  -- the account/Turn lock order used by cancellation and admission. Once any
  -- entity lock is acquired, handle only that candidate and return. Continuing
  -- would accumulate locks across owners and allow opposite-order deadlocks.
  -- An empty result may mean one stale candidate was cleaned; callers poll again.
  for candidate in select turn_id,owner_id,session_id from turn_private.work q
    where (state='queued' or (state='leased' and expires_at<=clock_timestamp()))
      and not exists(select 1 from turn_private.text_content c join turn_private.text_policies p on p.id=c.policy_id
        where c.turn_id=q.turn_id and p.context_mode in ('task_history_v1','knowledge_intent_v1')) order by created_at,turn_id limit 100 loop
    if not pg_try_advisory_xact_lock(hashtextextended(candidate.turn_id::text,195)) then continue; end if;
    if not turn_private.lock_turn(candidate.turn_id,candidate.owner_id,candidate.session_id) then
      update turn_private.work set state='cancelled',lease_token=null,expires_at=null where turn_id=candidate.turn_id and state in ('queued','leased');
      return jsonb_build_object('kind','empty');
    end if;
    select * into w from turn_private.work where turn_id=candidate.turn_id for update;
    if not found or w.state not in ('queued','leased') or (w.state='leased' and w.expires_at>clock_timestamp()) then return jsonb_build_object('kind','empty'); end if;
    select status into turn_state from public.turns where id=w.turn_id;
    if turn_state in ('completed','proposal_ready','unavailable','failed','cancelled') then perform turn_private.terminal(w.turn_id,'cancelled',w.attempt); return jsonb_build_object('kind','empty'); end if;
    if w.attempt>=w.max_attempts then perform turn_private.terminal(w.turn_id,'quarantined',w.attempt); return jsonb_build_object('kind','empty'); end if;
    update turn_private.work set state='leased',attempt=attempt+1,lease_token=gen_random_uuid(),expires_at=clock_timestamp()+w.lease_ms*interval '1 millisecond' where turn_id=w.turn_id returning * into w;
    return jsonb_build_object('kind','leased','turnId',w.turn_id,'ownerId',w.owner_id,'attempt',w.attempt,'leaseToken',w.lease_token,'leaseMs',w.lease_ms);
  end loop;
  return jsonb_build_object('kind','empty');
end $$;

create or replace function turn_private.require_text_task()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from turn_private.text_policies where id=NEW.policy_id and context_mode in ('task_history_v1','knowledge_intent_v1'))
    and not exists(select 1 from turn_private.service_task_turns l join turn_private.service_tasks s on s.id=l.task_id
      where l.turn_id=NEW.turn_id and l.owner_id=NEW.owner_id and s.owner_id=NEW.owner_id and s.thread_id=NEW.thread_id
        and s.policy_id=NEW.policy_id and s.consent_id=NEW.consent_id) then raise exception 'DATA_POLICY_BLOCKED'; end if;
  if exists(select 1 from turn_private.text_policies where id=NEW.policy_id and context_mode='knowledge_intent_v1')
    and not exists(select 1 from turn_private.grounded_turns g where g.turn_id=NEW.turn_id and g.owner_id=NEW.owner_id and g.locale=NEW.locale) then raise exception 'DATA_POLICY_BLOCKED'; end if;
  return NEW;
end $$;

create or replace function public.read_text_work(p_turn_id uuid,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c turn_private.text_content%rowtype; p turn_private.text_policies%rowtype; history jsonb; payload jsonb;
begin
  if not turn_private.lock_text_work(p_turn_id,p_lease_token) then return jsonb_build_object('kind','blocked'); end if;
  select * into c from turn_private.text_content where turn_id=p_turn_id;
  select * into p from turn_private.text_policies where id=c.policy_id;
  if p.context_mode='knowledge_intent_v1' then return jsonb_build_object('kind','blocked'); end if;
  if p.context_mode='task_history_v1' then
    history:=turn_private.task_history(p_turn_id);
    if history is null then return jsonb_build_object('kind','blocked'); end if;
    payload:=jsonb_build_object('kind','task_input','text',c.input_text,'locale',c.locale,'policyId',p.id,'provider',p.provider,'endpoint',p.endpoint,'history',history);
    return payload||jsonb_build_object('contextDigest',encode(pg_catalog.sha256(convert_to(payload::text,'UTF8')),'hex'));
  end if;
  return jsonb_build_object('kind','input','text',c.input_text,'locale',c.locale,'policyId',p.id,'provider',p.provider,'endpoint',p.endpoint);
end $$;

create function public.claim_grounded_work(p_owner_id uuid,p_policy_id uuid)
returns jsonb language sql security definer set search_path='' as $$
 select turn_private.claim_text_mode(p_owner_id,p_policy_id,'knowledge_intent_v1')
$$;
revoke all on function public.claim_grounded_work(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_grounded_work(uuid,uuid) to service_role;

create function public.read_grounded_work(p_turn_id uuid,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c turn_private.text_content%rowtype; p turn_private.text_policies%rowtype; g turn_private.grounded_turns%rowtype; payload jsonb;
begin
 if not turn_private.lock_text_work(p_turn_id,p_lease_token) then return jsonb_build_object('kind','blocked'); end if;
 select * into c from turn_private.text_content where turn_id=p_turn_id;
 select * into p from turn_private.text_policies where id=c.policy_id and context_mode='knowledge_intent_v1';
 if not found then return jsonb_build_object('kind','blocked'); end if;
 select * into g from turn_private.grounded_turns where turn_id=c.turn_id and owner_id=c.owner_id and locale=c.locale;
 if not found then return jsonb_build_object('kind','blocked'); end if;
 payload:=jsonb_build_object('kind','intent_input','text',c.input_text,'locale',c.locale,'policyId',p.id,'provider',p.provider,'endpoint',p.endpoint);
 return payload||jsonb_build_object('contextDigest',encode(pg_catalog.sha256(convert_to(jsonb_build_array(payload,g.city,g.scope_version)::text,'UTF8')),'hex'));
end $$;
revoke all on function public.read_grounded_work(uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_grounded_work(uuid,uuid) to service_role;

create function public.authorize_grounded_dispatch(p_turn_id uuid,p_lease_token uuid,p_policy_id uuid,p_provider text,p_context_digest text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare payload jsonb; c turn_private.text_content%rowtype;
begin
 payload:=public.read_grounded_work(p_turn_id,p_lease_token);
 if payload->>'kind' is distinct from 'intent_input' or payload->>'policyId' is distinct from p_policy_id::text
   or payload->>'provider' is distinct from p_provider or payload->>'contextDigest' is distinct from p_context_digest then return jsonb_build_object('kind','blocked'); end if;
 select * into c from turn_private.text_content where turn_id=p_turn_id;
 insert into turn_private.text_dispatches(lease_token,turn_id,consent_id,policy_id) values(p_lease_token,p_turn_id,c.consent_id,c.policy_id) on conflict do nothing;
 if not found then return jsonb_build_object('kind','blocked'); end if;
 return jsonb_build_object('kind','authorized');
end $$;
revoke all on function public.authorize_grounded_dispatch(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.authorize_grounded_dispatch(uuid,uuid,uuid,text,text) to service_role;

create or replace function public.complete_text_work(p_turn_id uuid,p_lease_token uuid,p_kind text,p_text text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w turn_private.work%rowtype;
begin
  if exists(select 1 from turn_private.text_content guarded_content join turn_private.text_policies guarded_policy on guarded_policy.id=guarded_content.policy_id where guarded_content.turn_id=p_turn_id and guarded_policy.context_mode='knowledge_intent_v1') then return jsonb_build_object('kind','unavailable'); end if;
  if p_kind is null or p_kind not in ('answered','partial','clarification','blocked','technical_failure') or not turn_private.valid_text(p_text,8000) then raise exception 'INVALID_INPUT'; end if;
  if not turn_private.lock_text_work(p_turn_id,p_lease_token) then return jsonb_build_object('kind','blocked'); end if;
  if p_kind in ('answered','partial','clarification') and not exists(select 1 from turn_private.text_dispatches where lease_token=p_lease_token and turn_id=p_turn_id) then return jsonb_build_object('kind','blocked'); end if;
  select * into w from turn_private.work where turn_id=p_turn_id;
  update turn_private.text_content set output_kind=p_kind,output_text=p_text where turn_id=p_turn_id;
  perform turn_private.terminal(p_turn_id,case when p_kind='blocked' then 'unavailable' when p_kind='technical_failure' then 'failed' else 'completed' end,w.attempt);
  return jsonb_build_object('kind','finished');
end $$;

create or replace function public.read_text_turn(p_turn_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); c turn_private.text_content%rowtype;
begin
  if exists(select 1 from turn_private.text_content guarded_content join turn_private.text_policies guarded_policy on guarded_policy.id=guarded_content.policy_id where guarded_content.turn_id=p_turn_id and guarded_policy.context_mode='knowledge_intent_v1') then return jsonb_build_object('kind','unavailable'); end if;
  if not turn_private.lock_turn(p_turn_id,u,(auth.jwt()->>'session_id')::uuid) then return jsonb_build_object('kind','unavailable'); end if;
  select * into c from turn_private.text_content where turn_id=p_turn_id and owner_id=u and hidden_at is null;
  if not found or not turn_private.text_policy_current(c.policy_id) or not exists(select 1 from turn_private.text_consents where owner_id=u and policy_id=c.policy_id and consent_id=c.consent_id and revoked_at is null) then return jsonb_build_object('kind','unavailable'); end if;
  return jsonb_build_object('kind','text','schemaVersion','text-turn-v1','turnId',c.turn_id,'locale',c.locale,'input',c.input_text,'outcome',c.output_kind,'output',c.output_text);
end $$;

create or replace function public.list_text_turns(p_policy_id uuid,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); rows jsonb;
begin
  if exists(select 1 from turn_private.text_policies where id=p_policy_id and context_mode='knowledge_intent_v1') then return jsonb_build_object('kind','unavailable'); end if;
  if p_limit is null or p_limit not between 1 and 20 then raise exception 'INVALID_INPUT'; end if;
  if not turn_private.text_policy_current(p_policy_id) then return jsonb_build_object('kind','unavailable'); end if;
  select coalesce(jsonb_agg(row.value order by row.created_at desc,row.turn_id),'[]'::jsonb) into rows from (
    select c.created_at,c.turn_id,jsonb_build_object('turnId',c.turn_id,'threadId',c.thread_id,'locale',c.locale,
      'input',c.input_text,'outcome',c.output_kind,'output',c.output_text,'status',t.status,'createdAt',c.created_at) as value
    from turn_private.text_content c
      join public.turns t on t.id=c.turn_id and t.owner_id=u
      join public.chat_threads h on h.id=c.thread_id and h.owner_id=u and h.status='active'
      join turn_private.text_consents g on g.owner_id=u and g.policy_id=c.policy_id and g.consent_id=c.consent_id and g.revoked_at is null
    where c.owner_id=u and c.policy_id=p_policy_id and c.hidden_at is null
    order by c.created_at desc,c.turn_id limit p_limit
  ) row;
  return jsonb_build_object('kind','history','turns',rows);
end $$;

create function public.complete_grounded_work(p_turn_id uuid,p_lease_token uuid,p_intent text,p_request_scope text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w turn_private.work%rowtype; g turn_private.grounded_turns%rowtype; answer jsonb; outcome text; failure text;
begin
 if p_intent is null or p_request_scope is null or not (
   (p_intent='rail_boarding_documents' and p_request_scope in ('single','additional_needs'))
   or (p_intent in ('clarification','unsupported','technical_failure','blocked') and p_request_scope='unknown')) then raise exception 'INVALID_INPUT'; end if;
 if not turn_private.lock_text_work(p_turn_id,p_lease_token) then return jsonb_build_object('kind','blocked'); end if;
 select g0.* into g from turn_private.grounded_turns g0 join turn_private.text_content c on c.turn_id=g0.turn_id and c.owner_id=g0.owner_id
  join turn_private.text_policies p on p.id=c.policy_id and p.context_mode='knowledge_intent_v1' where g0.turn_id=p_turn_id;
 if not found or g.completed_at is not null then return jsonb_build_object('kind','blocked'); end if;
 if p_intent in ('rail_boarding_documents','clarification','unsupported')
  and not exists(select 1 from turn_private.text_dispatches where lease_token=p_lease_token and turn_id=p_turn_id) then return jsonb_build_object('kind','blocked'); end if;
 if p_intent='rail_boarding_documents' then
  begin
   answer:=knowledge_review_private.resolve_question(jsonb_build_object('questionId','rail_boarding_documents','questionVersion',1,'city',g.city,'locale',g.locale));
  exception when raise_exception then
   get stacked diagnostics failure=MESSAGE_TEXT;
   if failure not in ('KNOWLEDGE_DISABLED','KNOWLEDGE_CAPACITY','KNOWLEDGE_SNAPSHOT_CHANGED') then raise; end if;
   p_intent:='technical_failure';p_request_scope:='unknown';
  end;
 end if;
 outcome:=case when p_intent='technical_failure' then 'technical_failure'
  when p_intent in ('blocked','unsupported') then 'blocked' when p_intent='clarification' then 'clarification'
  when answer->'answer'->>'outcome'='no_answer' then 'blocked'
  when p_request_scope='additional_needs' or answer->'answer'->>'outcome'='partial' then 'partial' else 'answered' end;
 -- The resolver can wait on publication locks. Recheck wall-clock lease and
 -- authorization after every such wait, before committing the immutable result.
 if not turn_private.lock_text_work(p_turn_id,p_lease_token) then return jsonb_build_object('kind','blocked'); end if;
 select * into w from turn_private.work where turn_id=p_turn_id;
 update turn_private.grounded_turns set intent=p_intent,request_scope=p_request_scope,original_outcome=outcome,
  basis=answer->'_basis',completed_at=clock_timestamp() where turn_id=p_turn_id;
 -- The generic output column never contains evidence, factual prose or source text.
 update turn_private.text_content set output_kind=outcome,output_text='reviewed-answer-v1' where turn_id=p_turn_id;
 perform turn_private.terminal(p_turn_id,case when outcome='technical_failure' then 'failed' when outcome='blocked' then 'unavailable' else 'completed' end,w.attempt);
 return jsonb_build_object('kind','finished');
end $$;
revoke all on function public.complete_grounded_work(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.complete_grounded_work(uuid,uuid,text,text) to service_role;

create function public.read_grounded_policy(p_policy_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from turn_private.text_policies where id=p_policy_id and context_mode='knowledge_intent_v1') then return jsonb_build_object('kind','unavailable'); end if;
 return public.read_text_policy(p_policy_id);
end $$;
revoke all on function public.read_grounded_policy(uuid) from public,anon,service_role;
grant execute on function public.read_grounded_policy(uuid) to authenticated;

create function public.read_grounded_turn(p_turn_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); g turn_private.grounded_turns%rowtype; c turn_private.text_content%rowtype;
 s turn_private.service_tasks%rowtype; l turn_private.service_task_turns%rowtype; answer jsonb; failure text; projection text;
begin
 if not turn_private.lock_turn(p_turn_id,u,(auth.jwt()->>'session_id')::uuid) then return jsonb_build_object('kind','unavailable'); end if;
 select * into c from turn_private.text_content where turn_id=p_turn_id and owner_id=u and hidden_at is null;
 if not found or not turn_private.text_policy_current(c.policy_id) then return jsonb_build_object('kind','unavailable'); end if;
 perform 1 from turn_private.text_consents where owner_id=u and policy_id=c.policy_id and consent_id=c.consent_id and revoked_at is null for share;
 if not found then return jsonb_build_object('kind','unavailable'); end if;
 select * into g from turn_private.grounded_turns where turn_id=p_turn_id and owner_id=u;
 if not found then return jsonb_build_object('kind','unavailable'); end if;
 select * into s from turn_private.service_tasks where id=g.task_id and owner_id=u and policy_id=c.policy_id and consent_id=c.consent_id and expected_result='reviewed_answer';
 if not found or not exists(select 1 from turn_private.text_content x join public.turns t on t.id=x.turn_id and t.owner_id=u where x.turn_id=s.goal_turn_id and x.hidden_at is null) then return jsonb_build_object('kind','unavailable'); end if;
 select * into l from turn_private.service_task_turns where turn_id=p_turn_id and task_id=s.id and owner_id=u;
 if not found then return jsonb_build_object('kind','unavailable'); end if;
 projection:=case when g.completed_at is null then 'pending' else 'current' end;
 if g.intent='rail_boarding_documents' then
  begin
   answer:=knowledge_review_private.resolve_question(jsonb_build_object('questionId','rail_boarding_documents','questionVersion',1,'city',g.city,'locale',g.locale),g.basis)-'_basis';
  exception when raise_exception then
   get stacked diagnostics failure=MESSAGE_TEXT;
   if failure not in ('KNOWLEDGE_DISABLED','KNOWLEDGE_CAPACITY','KNOWLEDGE_SNAPSHOT_CHANGED') then raise; end if;
   projection:='unavailable';answer:=null;
  end;
 end if;
 return jsonb_build_object('kind','grounded_turn','schemaVersion','grounded-turn/1','turnId',c.turn_id,'threadId',c.thread_id,
  'locale',c.locale,'input',c.input_text,'outcome',c.output_kind,'output',c.output_text,'status',(select status from public.turns where id=c.turn_id),'createdAt',c.created_at,
  'serviceTaskId',s.id,'scopeVersion',s.scope_version,'relationship',l.relationship,'parentTurnId',l.parent_turn_id,
  'result',jsonb_build_object('type','reviewed_answer','city',g.city,'intent',g.intent,'requestScope',g.request_scope,
    'originalOutcome',g.original_outcome,'completedAt',g.completed_at,'projection',projection,'knowledge',answer));
end $$;
revoke all on function public.read_grounded_turn(uuid) from public,anon,service_role;
grant execute on function public.read_grounded_turn(uuid) to authenticated;

create function public.list_grounded_turns(p_policy_id uuid,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=turn_private.text_owner(); item record; value jsonb; rows jsonb:='[]';
begin
 if p_limit is null or p_limit not between 1 and 20 then raise exception 'INVALID_INPUT'; end if;
 if (public.read_grounded_policy(p_policy_id))->>'kind' is distinct from 'policy' then return jsonb_build_object('kind','unavailable'); end if;
 for item in select c.turn_id from turn_private.text_content c join turn_private.grounded_turns g on g.turn_id=c.turn_id and g.owner_id=u
  where c.owner_id=u and c.policy_id=p_policy_id and c.hidden_at is null order by c.created_at desc,c.turn_id limit p_limit loop
  value:=public.read_grounded_turn(item.turn_id);
  if value->>'kind'='grounded_turn' then rows:=rows||jsonb_build_array(value); end if;
 end loop;
 return jsonb_build_object('kind','grounded_history','turns',rows);
end $$;
revoke all on function public.list_grounded_turns(uuid,integer) from public,anon,service_role;
grant execute on function public.list_grounded_turns(uuid,integer) to authenticated;
notify pgrst,'reload schema';
