-- A first-party, read-only answer to one explicitly selected question. No model,
-- text policy, ServiceTask, budget attempt or historical answer is created.
create function public.knowledge_answer_v1(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare scope jsonb; item record; frozen jsonb:='[]'; instant timestamptz; required text; candidates jsonb;
 eligible jsonb; reasons jsonb; claims jsonb:='[]'; rows jsonb:='[]'; variants integer;
begin
 if not knowledge_review_private.closed_object(p_input,array['questionId','questionVersion','city','locale'])
  or p_input->>'questionId' is distinct from 'rail_boarding_documents'
  or p_input->'questionVersion' is distinct from '1'::jsonb then raise exception 'INVALID_INPUT'; end if;
 scope:=jsonb_build_object('city',p_input->'city','scene','rail','locale',p_input->'locale');
 -- Existing identity/session and publication switch checks, including owner
 -- deletion barriers. Never impersonate an ordinary caller with a service key.
 perform public.knowledge_read_v1(scope);
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
 instant:=clock_timestamp();
 foreach required in array array['original_valid_booking_id','valid_ticket_not_itinerary_or_receipt'] loop
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
  if variants>1 then
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
 return jsonb_build_object('schemaVersion','knowledge-answer/1','evaluatedAt',instant,'scope',scope,
  'purpose','trip_planning','recipient','first_party','territory','CN-mainland',
  'status',case when jsonb_array_length(rows)>0 then 'available' else 'no_eligible_content' end,'statements',rows,
  'answer',jsonb_build_object('questionId','rail_boarding_documents','questionVersion',1,
   'outcome',case when not exists(select 1 from jsonb_array_elements(claims) x where x->>'status'<>'covered') then 'answered'
     when jsonb_array_length(rows)>0 then 'partial' else 'no_answer' end,'claims',claims));
end $$;
revoke all on function public.knowledge_answer_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.knowledge_answer_v1(jsonb) to authenticated;
notify pgrst,'reload schema';
