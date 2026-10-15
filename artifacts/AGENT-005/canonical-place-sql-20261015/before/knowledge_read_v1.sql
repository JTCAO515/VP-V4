CREATE OR REPLACE FUNCTION public.knowledge_read_v1(p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); sess uuid:=(auth.jwt()->>'session_id')::uuid; instant timestamptz; result jsonb;
begin
 if u is null or sess is null then raise exception 'UNAUTHENTICATED'; end if;
 perform 1 from auth.users where id=u for key share nowait;
 if not found then raise exception 'UNAUTHENTICATED'; end if;
 insert into identity_private.mobile_accounts(owner_id) values(u) on conflict do nothing;
 perform identity_private.guard_mobile_rpc_v2();
 perform 1 from auth.sessions where id=sess and user_id=u for key share;
 if not found then raise exception 'UNAUTHENTICATED'; end if;
 if not knowledge_review_private.closed_object(p_input,array['city','scene','locale'])
  or coalesce(p_input->>'city','') not in ('shanghai','beijing','guangzhou','chongqing')
  or coalesce(p_input->>'scene','') not in ('arrival','airport_transport','payment','connectivity','public_transport','taxi','rail','attraction','accommodation','emergency')
  or coalesce(p_input->>'locale','') not in ('zh','en') then raise exception 'INVALID_INPUT'; end if;
 perform 1 from knowledge_review_private.publication_settings where singleton and enabled for share;
 if not found then raise exception 'KNOWLEDGE_DISABLED'; end if;
 -- Serialize each read with a committed revocation; a receipt is never permanent eligibility.
 perform p.candidate_id from knowledge_review_private.publications p join knowledge_review_private.statements s on s.candidate_id=p.candidate_id
 where p.state='published' and s.payload->'scope'->'cities' ? (p_input->>'city') and s.payload->'scope'->>'scene'=p_input->>'scene' order by p.candidate_id for share of p;
 instant:=clock_timestamp();
 select coalesce(jsonb_agg(x.row order by x.id),'[]'::jsonb) into result from (
  select p.fact_id id,jsonb_build_object('factId',p.fact_id,'version',1,'assertionId',s.statement_id,'assertionRevision',s.revision,
   'assertion',s.payload->'assertion','scope',s.payload->'scope','text',s.payload->'expressions'->(p_input->>'locale')->>'text',
   'conditions',s.payload->'expressions'->(p_input->>'locale')->'conditions','exclusions',s.payload->'expressions'->(p_input->>'locale')->'exclusions',
   'reviewedAt',c.reviewed_at,'publishedAt',p.published_at,'expiresAt',p.expires_at,
   'sources',(select jsonb_agg(jsonb_build_object('sourceRevisionId',r.id,'sourceKey',r.source_key,'revisionLabel',r.revision_label,'publisher',r.declaration->>'publisher','uri',r.declaration->>'uri','locator',r.declaration->>'locator') order by r.source_key,r.revision_label) from knowledge_review_private.statement_sources ss join knowledge_review_private.source_revisions r on r.id=ss.source_revision_id where ss.candidate_id=c.id)) row
  from knowledge_review_private.publications p join knowledge_review_private.statements s on s.candidate_id=p.candidate_id join knowledge_review_private.candidates c on c.id=p.candidate_id
  where p.state='published' and p.expires_at>instant and c.status='reviewed' and s.payload->'scope'->'cities' ? (p_input->>'city') and s.payload->'scope'->>'scene'=p_input->>'scene'
  order by p.fact_id limit 50
 ) x;
 return jsonb_build_object('schemaVersion','knowledge-read/1','evaluatedAt',instant,'scope',p_input,
  'purpose','trip_planning','recipient','first_party','territory','CN-mainland','status',case when jsonb_array_length(result)>0 then 'available' else 'no_eligible_content' end,'statements',result);
end $function$
