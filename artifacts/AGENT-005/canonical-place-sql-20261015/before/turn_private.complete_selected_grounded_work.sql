CREATE OR REPLACE FUNCTION turn_private.complete_selected_grounded_work(p_turn_id uuid, p_lease_token uuid, p_intent text, p_request_scope text, p_subject text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w turn_private.work%rowtype; g turn_private.grounded_turns%rowtype; answer jsonb; outcome text; failure text;
begin
 if exists(select 1 from guide_private.bindings_v1 where turn_id=p_turn_id) and guide_private.bound_v1(p_turn_id,p_lease_token) is null then return jsonb_build_object('kind','blocked');end if;
 if exists(select 1 from guide_private.bindings_v1 where turn_id=p_turn_id) and knowledge_review_private.question_definition(p_intent) is not null and guide_private.answer_basis_v1(p_turn_id,p_lease_token,p_intent,p_subject) is null then return jsonb_build_object('kind','blocked');end if;
 if p_intent is null or p_request_scope is null or not (
   (knowledge_review_private.question_definition(p_intent) is not null and p_request_scope in ('single','additional_needs'))
   or (p_intent in ('clarification','unsupported','technical_failure','blocked') and p_request_scope='unknown')) then raise exception 'INVALID_INPUT'; end if;
 if (p_intent in ('place_address','place_opening_hours','place_address_and_hours')) <> (p_subject is not null) then raise exception 'INVALID_INPUT'; end if;
 if (exists(select 1 from guide_private.bindings_v1 where turn_id=p_turn_id) and guide_private.bound_v1(p_turn_id,p_lease_token) is null) or not turn_private.lock_text_work(p_turn_id,p_lease_token) then return jsonb_build_object('kind','blocked'); end if;
 select g0.* into g from turn_private.grounded_turns g0 join turn_private.text_content c on c.turn_id=g0.turn_id and c.owner_id=g0.owner_id
  join turn_private.text_policies p on p.id=c.policy_id and p.context_mode='knowledge_intent_v1' where g0.turn_id=p_turn_id;
 if not found or g.completed_at is not null then return jsonb_build_object('kind','blocked'); end if;
 if (knowledge_review_private.question_definition(p_intent) is not null or p_intent in ('clarification','unsupported'))
  and not exists(select 1 from turn_private.text_dispatches where lease_token=p_lease_token and turn_id=p_turn_id) then return jsonb_build_object('kind','blocked'); end if;
 if knowledge_review_private.question_definition(p_intent) is not null then
  begin
   answer:=knowledge_review_private.resolve_question(knowledge_review_private.selected_question_input(p_intent,g.city,g.locale,p_subject),case when exists(select 1 from guide_private.bindings_v1 where turn_id=p_turn_id) then guide_private.answer_basis_v1(p_turn_id,p_lease_token,p_intent,p_subject) else null end);
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
 if (exists(select 1 from guide_private.bindings_v1 where turn_id=p_turn_id) and guide_private.bound_v1(p_turn_id,p_lease_token) is null) or not turn_private.lock_text_work(p_turn_id,p_lease_token) then return jsonb_build_object('kind','blocked'); end if;
 select * into w from turn_private.work where turn_id=p_turn_id;
 update turn_private.grounded_turns set intent=p_intent,request_scope=p_request_scope,original_outcome=outcome,
  basis=answer->'_basis',place_subject_id=case when answer is not null then p_subject end,completed_at=clock_timestamp() where turn_id=p_turn_id;
 -- The generic output column never contains evidence, factual prose or source text.
 update turn_private.text_content set output_kind=outcome,output_text='reviewed-answer-v1' where turn_id=p_turn_id;
 perform turn_private.terminal(p_turn_id,case when outcome='technical_failure' then 'failed' when outcome='blocked' then 'unavailable' else 'completed' end,w.attempt);
 return jsonb_build_object('kind','finished');
end $function$
