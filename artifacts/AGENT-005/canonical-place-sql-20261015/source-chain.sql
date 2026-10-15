-- Exact post-auth source qualification bodies from original reader/helpers.
-- No new resolver and no identity substitution. Only called after original Root locks.
CREATE OR REPLACE FUNCTION place_actions_private.ask_knowledge_scope_v1(p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare instant timestamptz; result jsonb;
begin
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
;
revoke all on function place_actions_private.ask_knowledge_scope_v1(jsonb) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION place_actions_private.ask_claim_basis_v1(p_statement uuid, p_revision integer, p_hash text, p_city text, p_scene text, p_locale text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare st knowledge_review_private.statements%rowtype;p knowledge_review_private.publications%rowtype;c knowledge_review_private.candidates%rowtype;readback jsonb;found_fact jsonb;sources jsonb;
begin
 select * into st from knowledge_review_private.statements where statement_id=p_statement for share nowait;if not found or st.revision is distinct from p_revision or trip_support_private.hash(st.payload) is distinct from p_hash then return null;end if;
 select * into p from knowledge_review_private.publications where candidate_id=st.candidate_id for share nowait;if not found or p.state<>'published' or p.expires_at<=clock_timestamp() then return null;end if;
 select * into c from knowledge_review_private.candidates where id=st.candidate_id for share nowait;if not found or c.status<>'reviewed' then return null;end if;
 readback:=place_actions_private.ask_knowledge_scope_v1(jsonb_build_object('city',p_city,'scene',p_scene,'locale',p_locale));
 select x into found_fact from jsonb_array_elements(readback->'statements') x where x->>'factId'=p.fact_id::text and x->>'assertionId'=st.statement_id::text and x->>'assertionRevision'=st.revision::text;
 if found_fact is null then return null;end if;
 select coalesce(jsonb_agg(jsonb_build_object('sourceRevisionId',r.id,'revisionLabel',r.revision_label,'snippetHash',r.snippet_hash,'submittedBy',r.submitted_by) order by r.id),'[]'::jsonb) into sources from knowledge_review_private.statement_sources ss join knowledge_review_private.source_revisions r on r.id=ss.source_revision_id where ss.candidate_id=st.candidate_id and r.withdrawn_at is null;
 if jsonb_array_length(sources) not between 1 and 8 or jsonb_array_length(sources)<>(select count(*) from knowledge_review_private.statement_sources where candidate_id=st.candidate_id) then return null;end if;
 return jsonb_build_object('statementId',st.statement_id,'claimRevision',st.revision,'payloadHash',p_hash,'payload',st.payload,'sourceRefs',sources,'sourceDigest',trip_support_private.hash(sources),'receipt',jsonb_build_object('kind','fact','factId',p.fact_id,'version',p.version,'reviewedAt',c.reviewed_at,'expiresAt',p.expires_at));
exception when lock_not_available then return null;end $function$
;
revoke all on function place_actions_private.ask_claim_basis_v1(uuid,integer,text,text,text,text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION place_actions_private.ask_mapping_basis_v1(p_mapping uuid, p_require_approved boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m trip_support_private.entity_mappings%rowtype;p public.canonical_pois%rowtype;basis jsonb;member_revision bigint;
begin
 select * into m from trip_support_private.entity_mappings where id=p_mapping;if not found or p_require_approved and m.status<>'approved' then return null;end if;
 select * into p from public.canonical_pois where id=m.canonical_poi_id for share nowait;if not found or trip_support_private.hash(to_jsonb(p))<>m.canonical_hash then return null;end if;
 if p_require_approved then select revision into member_revision from knowledge_review_private.members where actor_id=m.reviewer_id and active for share nowait;if member_revision is distinct from m.reviewer_member_revision then return null;end if;end if;
 basis:=place_actions_private.ask_claim_basis_v1(m.statement_id,m.claim_revision,m.payload_hash,m.basis_metadata->>'city',m.basis_metadata->>'scene',m.basis_metadata->>'locale');if basis is null or basis->>'sourceDigest'<>m.source_digest or basis->'sourceRefs' is distinct from m.source_refs then return null;end if;
 return basis||jsonb_build_object('mappingId',m.id,'mappingVersion',m.version,'mappingDigest',m.request_digest,'canonicalPoiId',m.canonical_poi_id);
exception when lock_not_available then return null;end $function$
;
revoke all on function place_actions_private.ask_mapping_basis_v1(uuid,boolean) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION place_actions_private.ask_sources_v1(poi uuid, loc text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
declare m trip_support_private.entity_mappings%rowtype;b jsonb;c jsonb;scope text;rows jsonb:='[]';n integer:=0;expiry timestamptz:=clock_timestamp()+interval '30 seconds';
begin
 -- The publication reader being disabled is unavailable, not a complete empty result.
 perform 1 from knowledge_review_private.publication_settings where singleton and enabled for share;
 if not found then return jsonb_build_object('status','unavailable','entries','[]'::jsonb,'expiresAt',expiry);end if;
 for m in select * from trip_support_private.entity_mappings where canonical_poi_id=poi and status='approved' and basis_metadata->>'locale'=loc order by id limit 501 for share loop
  n:=n+1;if n>500 then return jsonb_build_object('status','unavailable','entries','[]'::jsonb,'expiresAt',expiry);end if;
  if m.version>2147483647 then return jsonb_build_object('status','unavailable','entries','[]'::jsonb,'expiresAt',expiry);end if;
  b:=place_actions_private.ask_mapping_basis_v1(m.id);if b is null then continue;end if;
  scope:=case b->'payload'->'assertion'->>'predicate' when 'located_at' then 'address_reference' when 'opens_during' then 'opening_window_reference' end;
  c:=trip_support_private.typed_claim(b,scope);if c is null then continue;end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('mappingId',m.id,'mappingVersion',m.version,'mappingDigest',m.request_digest,'statementId',m.statement_id,'claimRevision',m.claim_revision,'payloadHash',m.payload_hash,'sourceDigest',m.source_digest,'scope',scope,'claim',c,'city',m.basis_metadata->>'city','scene',m.basis_metadata->>'scene','locale',loc));
  expiry:=least(expiry,(b->'receipt'->>'expiresAt')::timestamptz);
  if jsonb_array_length(rows)>24 then return jsonb_build_object('status','unavailable','entries','[]'::jsonb,'expiresAt',expiry);end if;
 end loop;
 return jsonb_build_object('status','complete','entries',rows,'expiresAt',expiry);
exception when lock_not_available then return jsonb_build_object('status','unavailable','entries','[]'::jsonb,'expiresAt',expiry);end $function$
;
revoke all on function place_actions_private.ask_sources_v1(uuid,text) from public,anon,authenticated,service_role;
