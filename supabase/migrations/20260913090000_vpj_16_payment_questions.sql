-- Extend reviewed questions without publishing content or enabling any policy.
-- Existing snapshots, publication locks, auth, consent and dispatch barriers remain in force.
create function knowledge_review_private.question_definition(p_id text)
returns jsonb language sql immutable set search_path='' as $$
 select '{"rail_boarding_documents":{"scene":"rail","claims":[{"subjectId":"rail_eticket_boarding","predicate":"requires_document","objectId":"original_valid_booking_id"},{"subjectId":"rail_eticket_boarding","predicate":"requires_document","objectId":"valid_ticket_not_itinerary_or_receipt"}]},"payment_card_acceptance":{"scene":"payment","claims":[{"subjectId":"international_card_payment","predicate":"requires_action","objectId":"merchant_acceptance_check"}]},"payment_mobile_setup":{"scene":"payment","claims":[{"subjectId":"alipay_weixin_pay","predicate":"offers_procedure","objectId":"supported_card_merchant_qr_payment"}]},"payment_cash_access":{"scene":"payment","claims":[{"subjectId":"rmb_cash_access","predicate":"offers_procedure","objectId":"international_card_atm_withdrawal"},{"subjectId":"rmb_cash_access","predicate":"offers_procedure","objectId":"marked_currency_exchange"}]},"payment_getting_started":{"scene":"payment","claims":[{"subjectId":"international_card_payment","predicate":"requires_action","objectId":"merchant_acceptance_check"},{"subjectId":"alipay_weixin_pay","predicate":"offers_procedure","objectId":"supported_card_merchant_qr_payment"},{"subjectId":"rmb_cash_access","predicate":"offers_procedure","objectId":"international_card_atm_withdrawal"},{"subjectId":"rmb_cash_access","predicate":"offers_procedure","objectId":"marked_currency_exchange"}]},"payment_card_and_mobile":{"scene":"payment","claims":[{"subjectId":"international_card_payment","predicate":"requires_action","objectId":"merchant_acceptance_check"},{"subjectId":"alipay_weixin_pay","predicate":"offers_procedure","objectId":"supported_card_merchant_qr_payment"}]},"payment_card_and_cash":{"scene":"payment","claims":[{"subjectId":"international_card_payment","predicate":"requires_action","objectId":"merchant_acceptance_check"},{"subjectId":"rmb_cash_access","predicate":"offers_procedure","objectId":"international_card_atm_withdrawal"},{"subjectId":"rmb_cash_access","predicate":"offers_procedure","objectId":"marked_currency_exchange"}]},"payment_mobile_and_cash":{"scene":"payment","claims":[{"subjectId":"alipay_weixin_pay","predicate":"offers_procedure","objectId":"supported_card_merchant_qr_payment"},{"subjectId":"rmb_cash_access","predicate":"offers_procedure","objectId":"international_card_atm_withdrawal"},{"subjectId":"rmb_cash_access","predicate":"offers_procedure","objectId":"marked_currency_exchange"}]}}'::jsonb -> p_id
$$;
revoke all on function knowledge_review_private.question_definition(text) from public,anon,authenticated,service_role;

alter table turn_private.grounded_turns drop constraint grounded_turns_intent_check;
alter table turn_private.grounded_turns add constraint grounded_turns_intent_check
 check(intent in ('rail_boarding_documents','payment_card_acceptance','payment_mobile_setup','payment_cash_access','payment_getting_started','payment_card_and_mobile','payment_card_and_cash','payment_mobile_and_cash','clarification','unsupported','technical_failure','blocked'));
create or replace function knowledge_review_private.resolve_question(p_input jsonb,p_basis jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare scope jsonb; item record; frozen jsonb:='[]'; instant timestamptz; required text; candidates jsonb;
 eligible jsonb; reasons jsonb; claims jsonb:='[]'; rows jsonb:='[]'; variants integer; basis jsonb; definition jsonb;
begin
 definition:=knowledge_review_private.question_definition(p_input->>'questionId');
 if not knowledge_review_private.closed_object(p_input,array['questionId','questionVersion','city','locale'])
  or definition is null
  or p_input->'questionVersion' is distinct from '1'::jsonb then raise exception 'INVALID_INPUT'; end if;
 scope:=jsonb_build_object('city',p_input->'city','scene',definition->'scene','locale',p_input->'locale');
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
   where s.payload->'scope'->'cities' ? (scope->>'city') and s.payload->'scope'->'scene'=definition->'scene'
    and exists(select 1 from jsonb_array_elements(definition->'claims') obligation
      where s.payload->'assertion'->'subjectId'=obligation->'subjectId'
       and s.payload->'assertion'->'predicate'=obligation->'predicate'
       and s.payload->'assertion'->'objectId'=obligation->'objectId')
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
 for required in select x->>'objectId' from jsonb_array_elements(definition->'claims') x loop
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
  'answer',jsonb_build_object('questionId',p_input->'questionId','questionVersion',1,
   'outcome',case when not exists(select 1 from jsonb_array_elements(claims) x where x->>'status'<>'covered') then 'answered'
     when jsonb_array_length(rows)>0 then 'partial' else 'no_answer' end,'claims',claims));
end $$;

create or replace function public.knowledge_answer_v1(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare definition jsonb:=knowledge_review_private.question_definition(p_input->>'questionId');
begin
 if not knowledge_review_private.closed_object(p_input,array['questionId','questionVersion','city','locale'])
  or definition is null
  or p_input->'questionVersion' is distinct from '1'::jsonb then raise exception 'INVALID_INPUT'; end if;
 -- Preserve the existing ordinary identity and base reader boundary.
 perform public.knowledge_read_v1(jsonb_build_object('city',p_input->'city','scene',definition->'scene','locale',p_input->'locale'));
 return knowledge_review_private.resolve_question(p_input)-'_basis';
end $$;

create or replace function public.complete_grounded_work(p_turn_id uuid,p_lease_token uuid,p_intent text,p_request_scope text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w turn_private.work%rowtype; g turn_private.grounded_turns%rowtype; answer jsonb; outcome text; failure text;
begin
 if p_intent is null or p_request_scope is null or not (
   (knowledge_review_private.question_definition(p_intent) is not null and p_request_scope in ('single','additional_needs'))
   or (p_intent in ('clarification','unsupported','technical_failure','blocked') and p_request_scope='unknown')) then raise exception 'INVALID_INPUT'; end if;
 if not turn_private.lock_text_work(p_turn_id,p_lease_token) then return jsonb_build_object('kind','blocked'); end if;
 select g0.* into g from turn_private.grounded_turns g0 join turn_private.text_content c on c.turn_id=g0.turn_id and c.owner_id=g0.owner_id
  join turn_private.text_policies p on p.id=c.policy_id and p.context_mode='knowledge_intent_v1' where g0.turn_id=p_turn_id;
 if not found or g.completed_at is not null then return jsonb_build_object('kind','blocked'); end if;
 if (knowledge_review_private.question_definition(p_intent) is not null or p_intent in ('clarification','unsupported'))
  and not exists(select 1 from turn_private.text_dispatches where lease_token=p_lease_token and turn_id=p_turn_id) then return jsonb_build_object('kind','blocked'); end if;
 if knowledge_review_private.question_definition(p_intent) is not null then
  begin
   answer:=knowledge_review_private.resolve_question(jsonb_build_object('questionId',p_intent,'questionVersion',1,'city',g.city,'locale',g.locale));
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

create or replace function public.read_grounded_turn(p_turn_id uuid)
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
 if knowledge_review_private.question_definition(g.intent) is not null then
  begin
   answer:=knowledge_review_private.resolve_question(jsonb_build_object('questionId',g.intent,'questionVersion',1,'city',g.city,'locale',g.locale),g.basis)-'_basis';
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
