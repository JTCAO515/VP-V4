CREATE OR REPLACE FUNCTION trip_support_private.claim_basis(p_statement uuid, p_revision integer, p_hash text, p_city text, p_scene text, p_locale text)
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
 readback:=public.knowledge_read_v1(jsonb_build_object('city',p_city,'scene',p_scene,'locale',p_locale));
 select x into found_fact from jsonb_array_elements(readback->'statements') x where x->>'factId'=p.fact_id::text and x->>'assertionId'=st.statement_id::text and x->>'assertionRevision'=st.revision::text;
 if found_fact is null then return null;end if;
 select coalesce(jsonb_agg(jsonb_build_object('sourceRevisionId',r.id,'revisionLabel',r.revision_label,'snippetHash',r.snippet_hash,'submittedBy',r.submitted_by) order by r.id),'[]'::jsonb) into sources from knowledge_review_private.statement_sources ss join knowledge_review_private.source_revisions r on r.id=ss.source_revision_id where ss.candidate_id=st.candidate_id and r.withdrawn_at is null;
 if jsonb_array_length(sources) not between 1 and 8 or jsonb_array_length(sources)<>(select count(*) from knowledge_review_private.statement_sources where candidate_id=st.candidate_id) then return null;end if;
 return jsonb_build_object('statementId',st.statement_id,'claimRevision',st.revision,'payloadHash',p_hash,'payload',st.payload,'sourceRefs',sources,'sourceDigest',trip_support_private.hash(sources),'receipt',jsonb_build_object('kind','fact','factId',p.fact_id,'version',p.version,'reviewedAt',c.reviewed_at,'expiresAt',p.expires_at));
exception when lock_not_available then return null;end $function$
