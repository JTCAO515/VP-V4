-- VPJ-74 slice 2: teach the existing submit_statement write path to stamp a
-- real fetch time on NEW source_revisions rows. Slice 1
-- (20260914080000_vpj_74_ontology_provenance.sql) deliberately left every
-- row 'legacy' rather than touch this function; this is that deferred
-- change, applied as a body-only create-or-replace so existing grants are
-- untouched. No column, validation rule, or any other branch changes.
--
-- effective_at is intentionally still not set here: "effective time" is a
-- business fact about the underlying source (e.g. when a price took
-- effect), not the moment an ops reviewer happened to type it in — setting
-- it to submission time would be a fabricated fact, not a real one. It
-- stays null/legacy until a later slice has an actual basis for it.
create or replace function knowledge_review_private.ops_review_workspace_publication_v1(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; op uuid; cid uuid; act text; v jsonb; src jsonb; sid uuid; prior jsonb; out jsonb; expiry timestamptz;
 c knowledge_review_private.candidates%rowtype; receipt knowledge_review_private.receipts%rowtype; pub knowledge_review_private.publications%rowtype;
begin
 act:=p_input->>'action';
 if act is null or act not in ('submit_statement','publish_statement','revoke_statement') then return knowledge_review_private.ops_review_workspace_source_v1(p_input); end if;
 u:=knowledge_review_private.current_actor();
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>24000
 or jsonb_typeof(p_input->'operationId') is distinct from 'string' or (p_input->>'operationId')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 or jsonb_typeof(p_input->'candidateId') is distinct from 'string' or (p_input->>'candidateId')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'INVALID_INPUT'; end if;
 op:=(p_input->>'operationId')::uuid; cid:=(p_input->>'candidateId')::uuid;
 if act='submit_statement' then
  if not knowledge_review_private.closed_object(p_input,array['action','operationId','candidateId','title','statement']) or knowledge_review_private.bounded_text(p_input->'title',160) is distinct from true or not knowledge_review_private.statement_valid(p_input->'statement') then raise exception 'INVALID_INPUT'; end if;
 elsif act='publish_statement' then
  if not knowledge_review_private.closed_object(p_input,array['action','operationId','candidateId','expectedVersion','expiresAt','useBasis','useNote']) or p_input->'expectedVersion' is distinct from '2'::jsonb
   or coalesce(p_input->>'useBasis','') not in ('original_factual_summary','explicit_licence') or knowledge_review_private.bounded_text(p_input->'useNote',1000) is distinct from true
   or jsonb_typeof(p_input->'expiresAt') is distinct from 'string' or (p_input->>'expiresAt')!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$' then raise exception 'INVALID_INPUT'; end if;
  begin expiry:=(p_input->>'expiresAt')::timestamptz; exception when invalid_datetime_format or datetime_field_overflow then raise exception 'INVALID_INPUT'; end;
 else
  if not knowledge_review_private.closed_object(p_input,array['action','operationId','candidateId','expectedPublicationVersion','note']) or p_input->'expectedPublicationVersion' is distinct from '1'::jsonb or knowledge_review_private.bounded_text(p_input->'note',400) is distinct from true then raise exception 'INVALID_INPUT'; end if;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text||':'||op::text,14));
 select * into receipt from knowledge_review_private.receipts where actor_id=u and operation_id=op;
 if found then
  if receipt.input<>p_input then raise exception 'OPS_CONFLICT'; end if;
  return receipt.result;
 end if;
 if act='submit_statement' then
  v:=p_input->'statement';
  perform knowledge_review_private.ops_review_workspace(jsonb_build_object('action','submit','operationId',op,'candidateId',cid,'title',p_input->>'title','content',v->'expressions'->'en'->>'text'));
  insert into knowledge_review_private.statements(candidate_id,payload) values(cid,v);
  for src in select x from jsonb_array_elements(v->'sources') x order by x->>'sourceKey',x->>'revisionLabel' loop
   -- Only this INSERT changed from the prior version: a brand-new source
   -- revision now records the real moment it was fetched (i.e. submitted)
   -- and is marked 'tracked'; an existing revision (ON CONFLICT DO NOTHING)
   -- keeps whatever lineage state it already had.
   insert into knowledge_review_private.source_revisions(source_key,revision_label,declaration,snippet_hash,submitted_by,fetched_at,lineage_status)
   values(src->>'sourceKey',src->>'revisionLabel',src,encode(extensions.digest(convert_to(src->>'snippet','UTF8'),'sha256'),'hex'),u,clock_timestamp(),'tracked') on conflict(source_key,revision_label) do nothing;
   select id,declaration into sid,prior from knowledge_review_private.source_revisions where source_key=src->>'sourceKey' and revision_label=src->>'revisionLabel' for share;
   if prior is distinct from src then raise exception 'OPS_CONFLICT'; end if;
   insert into knowledge_review_private.statement_sources(candidate_id,source_revision_id) values(cid,sid);
  end loop;
  out:=knowledge_review_private.candidate_json(cid);
  update knowledge_review_private.receipts set input=p_input,result=out where actor_id=u and operation_id=op;
  return out;
 end if;
 select * into c from knowledge_review_private.candidates where id=cid for update;
 if not found or not exists(select 1 from knowledge_review_private.statements where candidate_id=cid) then raise exception 'OPS_NOT_FOUND'; end if;
 select * into pub from knowledge_review_private.publications where candidate_id=cid for update;
 if act='publish_statement' then
  if c.author_id=u then raise exception 'OPS_SELF_REVIEW'; end if;
  if c.status<>'reviewed' or c.version<>2 or c.reviewer_id<>u or pub.candidate_id is not null then raise exception 'OPS_CONFLICT'; end if;
  if expiry<=clock_timestamp() or expiry>clock_timestamp()+interval '90 days' then raise exception 'INVALID_INPUT'; end if;
  insert into knowledge_review_private.publications(candidate_id,state,version,published_by,expires_at,use_basis,use_note) values(cid,'published',1,u,expiry,p_input->>'useBasis',p_input->>'useNote');
  insert into knowledge_review_private.publication_audit(candidate_id,version,actor_id,action,note) values(cid,1,u,'published',p_input->>'useNote');
  out:=jsonb_build_object('operationId',op,'candidateId',cid,'operationOutcome','published','publicationVersion',1);
 else
  if pub.candidate_id is null or pub.state<>'published' or pub.version<>1 then raise exception 'OPS_CONFLICT'; end if;
  update knowledge_review_private.publications set state='revoked',version=2,revoked_at=clock_timestamp() where candidate_id=cid;
  insert into knowledge_review_private.publication_audit(candidate_id,version,actor_id,action,note) values(cid,2,u,'revoked',p_input->>'note');
  out:=jsonb_build_object('operationId',op,'candidateId',cid,'operationOutcome','revoked','publicationVersion',2);
 end if;
 insert into knowledge_review_private.receipts(actor_id,operation_id,input,result) values(u,op,p_input,out);
 return out;
end $$;
