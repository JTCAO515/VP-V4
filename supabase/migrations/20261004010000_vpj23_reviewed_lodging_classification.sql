-- #213/#505: typed classification only, default closed. No old validator/reader edits.
create schema lodging_classification_private;
revoke all on schema lodging_classification_private from public,anon,authenticated,service_role;
insert into knowledge_review_private.ontology_types(type_id,zh_label,en_label) values('lodging_kind','住宿分类','Lodging classification');
insert into knowledge_review_private.ontology_relations(predicate,domain_type,range_type,zh_label,en_label) values('classified_as','service_entity','lodging_kind','分类为','classified as');
create function lodging_classification_private.hash(v jsonb) returns text language sql immutable set search_path='' set timezone='UTC' as $$select encode(sha256(convert_to(v::text,'UTF8')),'hex')$$;
create function lodging_classification_private.statement_valid_v1(v jsonb) returns boolean language plpgsql immutable set search_path='' set timezone='UTC' as $$
declare normalized jsonb;
begin
 if v->>'schemaVersion' is distinct from 'knowledge-lodging-classification/1' or v->'assertion'->>'predicate' is distinct from 'classified_as' or v->'assertion'->>'objectId' is distinct from 'hotel' or v->'assertion'->'conditions' is distinct from '[]'::jsonb or v->'assertion'->'exclusions' is distinct from '["classification_only","no_price_or_inventory_claim","no_guest_eligibility_claim"]'::jsonb or v->'scope'->>'scene' is distinct from 'lodging_classification' or jsonb_typeof(v->'scope'->'cities') is distinct from 'array' then return false;end if;
 if jsonb_array_length(v->'scope'->'cities')<>1 then return false;end if;
 -- Structural/source reuse only. Stored payload remains the new typed assertion.
 normalized:=jsonb_set(jsonb_set(jsonb_set(v,'{schemaVersion}','"knowledge-statement/1"'),'{assertion,predicate}','"offers_procedure"'),'{scope,scene}','"accommodation"');
 return knowledge_review_private.statement_valid_v1(normalized);
end $$;
create table lodging_classification_private.statements (
 candidate_id uuid primary key references knowledge_review_private.statements(candidate_id),
 payload_hash text not null,source_digest text not null,reviewer_id uuid,reviewer_member_revision bigint,
 check(payload_hash~'^[a-f0-9]{64}$' and source_digest~'^[a-f0-9]{64}$')
);
create table lodging_classification_private.mappings (
 id uuid primary key default gen_random_uuid(),canonical_poi_id uuid not null references public.canonical_pois(id) on delete cascade,
 statement_id uuid not null references knowledge_review_private.statements(statement_id),author_id uuid not null,
 city text not null,source_digest text not null,rights_digest text not null,payload_hash text not null,
 canonical_hash text not null,provider_hash text not null,request_digest text not null,
 version integer not null default 1 check(version between 1 and 3),status text not null default 'pending' check(status in('pending','approved','rejected','revoked')),
 reviewer_id uuid,reviewer_member_revision bigint,reviewed_at timestamptz,
 check((version=1 and status='pending' and reviewer_id is null) or (version=2 and status in('approved','rejected') and reviewer_id is not null) or (version=3 and status='revoked' and reviewer_id is not null))
);
create index lodging_mapping_canonical on lodging_classification_private.mappings(canonical_poi_id,id);
create index lodging_mapping_statement on lodging_classification_private.mappings(statement_id);
create table lodging_classification_private.operations (
 actor_id uuid not null,operation_id uuid not null,input_digest text not null,receipt jsonb not null,primary key(actor_id,operation_id)
);
create table lodging_classification_private.mapping_audit (
 mapping_id uuid not null references lodging_classification_private.mappings(id) on delete cascade,version integer not null,actor_id uuid not null,action text not null,note text not null,created_at timestamptz not null default clock_timestamp(),primary key(mapping_id,version)
);
do $$declare n text;begin foreach n in array array['statements','mappings','operations','mapping_audit'] loop execute format('alter table lodging_classification_private.%I enable row level security',n);execute format('revoke all on lodging_classification_private.%I from public,anon,authenticated,service_role',n);end loop;end $$;
create function lodging_classification_private.provider_hash(poi uuid) returns text language sql stable security definer set search_path='' set timezone='UTC' as $$select lodging_classification_private.hash(coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]')) from public.provider_poi_mappings m where canonical_poi_id=poi$$;
-- Root fence protects qualified mapping-set/provider-set phantoms. No new locks on unrelated legacy writes.
create function lodging_classification_private.identity_fence() returns trigger language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare ids uuid[];
begin
 ids:=case when tg_op='INSERT' then array[new.canonical_poi_id] when tg_op='DELETE' then array[old.canonical_poi_id] else array[old.canonical_poi_id,new.canonical_poi_id] end;
 if tg_table_schema='lodging_classification_private' or exists(select 1 from lodging_classification_private.mappings where canonical_poi_id=any(ids)) then
 perform 1 from public.canonical_pois where id=any(ids) order by id for update nowait;end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
create trigger lodging_provider_identity_fence before insert or update or delete on public.provider_poi_mappings for each row execute function lodging_classification_private.identity_fence();
create trigger lodging_mapping_identity_fence before insert or update or delete on lodging_classification_private.mappings for each row execute function lodging_classification_private.identity_fence();
create function lodging_classification_private.source_basis(id uuid,reviewed boolean) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
#variable_conflict use_variable
declare s knowledge_review_private.statements%rowtype;c knowledge_review_private.candidates%rowtype;r lodging_classification_private.statements%rowtype;refs jsonb;member bigint;
begin
 select * into s from knowledge_review_private.statements where statement_id=id for share nowait;if not found or lodging_classification_private.statement_valid_v1(s.payload) is distinct from true then return null;end if;
 select * into r from lodging_classification_private.statements where candidate_id=s.candidate_id for share nowait;if not found or r.payload_hash<>lodging_classification_private.hash(s.payload) then return null;end if;
 select * into c from knowledge_review_private.candidates where knowledge_review_private.candidates.id=s.candidate_id for share nowait;if not found then return null;end if;
 perform sr.id from knowledge_review_private.source_revisions sr join knowledge_review_private.statement_sources ss on ss.source_revision_id=sr.id where ss.candidate_id=s.candidate_id order by sr.id for share of sr nowait;
 if exists(select 1 from knowledge_review_private.source_revisions sr join knowledge_review_private.statement_sources ss on ss.source_revision_id=sr.id where ss.candidate_id=s.candidate_id and (sr.withdrawn_at is not null or knowledge_review_private.source_valid(sr.declaration) is distinct from true)) then return null;end if;
 select coalesce(jsonb_agg(jsonb_build_object('sourceRevisionId',sr.id,'revisionLabel',sr.revision_label,'snippetHash',sr.snippet_hash,'declarationHash',lodging_classification_private.hash(sr.declaration),'submittedBy',sr.submitted_by) order by sr.id),'[]') into refs from knowledge_review_private.source_revisions sr join knowledge_review_private.statement_sources ss on ss.source_revision_id=sr.id where ss.candidate_id=s.candidate_id;
 if jsonb_array_length(refs) not between 1 and 3 or r.source_digest<>lodging_classification_private.hash(refs) then return null;end if;
 if reviewed then
 select revision into member from knowledge_review_private.members where actor_id=r.reviewer_id and active for share nowait;
 if c.status<>'reviewed' or c.version<>2 or r.reviewer_id is distinct from c.reviewer_id or member is distinct from r.reviewer_member_revision then return null;end if;end if;
 return jsonb_build_object('candidateId',c.id,'statementId',s.statement_id,'statementRevision',s.revision,'payloadHash',r.payload_hash,'sourceDigest',r.source_digest,'sourceRefs',refs,'payload',s.payload,'authorId',c.author_id,'reviewedAt',export_private.ms_v1(c.reviewed_at));
exception when lock_not_available then return null;
end $$;
create function lodging_classification_private.publication_basis(id uuid,require_enabled boolean default true) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
#variable_conflict use_variable
declare b jsonb;p knowledge_review_private.publications%rowtype;rights text;
begin
 b:=lodging_classification_private.source_basis(id,true);if b is null then return null;end if;
 if require_enabled then perform 1 from knowledge_review_private.publication_settings where singleton and enabled for share nowait;if not found then return null;end if;end if;
 select * into p from knowledge_review_private.publications where candidate_id=(b->>'candidateId')::uuid for share nowait;
 if not found or p.state<>'published' or p.version<>1 or p.expires_at<=clock_timestamp() or p.published_by is distinct from (select reviewer_id from knowledge_review_private.candidates where knowledge_review_private.candidates.id=p.candidate_id) or p.use_basis not in('original_factual_summary','explicit_licence') or char_length(btrim(p.use_note)) not between 1 and 1000 then return null;end if;
 rights:=lodging_classification_private.hash(jsonb_build_array(p.fact_id,p.version,p.use_basis,encode(sha256(convert_to(p.use_note,'UTF8')),'hex'),p.expires_at,b->'sourceRefs'));
 return b||jsonb_build_object('factId',p.fact_id,'publicationVersion',p.version,'rightsDigest',rights,'expiresAt',export_private.ms_v1(p.expires_at));
exception when lock_not_available then return null;
end $$;
create function lodging_classification_private.mapping_basis(id uuid) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
#variable_conflict use_variable
declare m lodging_classification_private.mappings%rowtype;p public.canonical_pois%rowtype;b jsonb;member bigint;
begin
 select * into m from lodging_classification_private.mappings where lodging_classification_private.mappings.id=id;if not found or m.status<>'approved' or m.version<>2 then return null;end if;
 select * into p from public.canonical_pois where public.canonical_pois.id=m.canonical_poi_id for share nowait;if not found or m.canonical_hash<>lodging_classification_private.hash(to_jsonb(p)) or m.provider_hash<>lodging_classification_private.provider_hash(p.id) then return null;end if;
 select revision into member from knowledge_review_private.members where actor_id=m.reviewer_id and active for share nowait;if member is distinct from m.reviewer_member_revision then return null;end if;
 b:=lodging_classification_private.publication_basis(m.statement_id);if b is null or b->>'sourceDigest'<>m.source_digest or b->>'rightsDigest'<>m.rights_digest or b->>'payloadHash'<>m.payload_hash or not(b->'payload'->'scope'->'cities' ? m.city) then return null;end if;
 return b||jsonb_build_object('canonicalPoiId',p.id,'mappingId',m.id,'mappingVersion',m.version,'mappingDigest',m.request_digest,'city',m.city);
exception when lock_not_available then return null;
end $$;
create function lodging_classification_private.candidate_reply(op uuid,cid uuid) returns jsonb language sql stable security definer set search_path='' set timezone='UTC' as $$
 select jsonb_build_object('kind','lodging_classification_candidate','operationId',op,'candidateId',c.id,'statementId',s.statement_id,'statementRevision',s.revision,'payloadHash',r.payload_hash,'sourceDigest',r.source_digest,'status',c.status,'version',c.version,'reviewerMemberRevision',r.reviewer_member_revision) from knowledge_review_private.candidates c join knowledge_review_private.statements s on s.candidate_id=c.id join lodging_classification_private.statements r on r.candidate_id=c.id where c.id=cid
$$;
create function lodging_classification_private.mapping_reply(op uuid,m lodging_classification_private.mappings) returns jsonb language sql immutable set search_path='' set timezone='UTC' as $$select jsonb_build_object('kind','lodging_classification_mapping','operationId',op,'mappingId',m.id,'canonicalPoiId',m.canonical_poi_id,'statementId',m.statement_id,'version',m.version,'status',m.status,'digest',m.request_digest,'sourceDigest',m.source_digest,'rightsDigest',m.rights_digest)$$;
create function public.ops_lodging_classification_v1(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
#variable_conflict use_variable
declare u uuid;op uuid;act text;keys text[];cid uuid;sid uuid;src jsonb;v jsonb;b jsonb;refs jsonb;digest text;answer jsonb;prior lodging_classification_private.operations%rowtype;c knowledge_review_private.candidates%rowtype;m lodging_classification_private.mappings%rowtype;poi public.canonical_pois%rowtype;p knowledge_review_private.publications%rowtype;member bigint;
begin
 act:=p_input->>'action';keys:=case act
 when 'submit' then array['action','operationId','candidateId','title','statement']
 when 'review' then array['action','operationId','candidateId','expectedVersion','decision','note']
 when 'publish' then array['action','operationId','candidateId','expectedVersion','expiresAt','useBasis','useNote']
 when 'revoke' then array['action','operationId','candidateId','expectedPublicationVersion','note']
 when 'submit_mapping' then array['action','operationId','canonicalPoiId','statementId','expectedStatementRevision','expectedPayloadHash','expectedSourceDigest','expectedPublicationVersion','expectedRightsDigest','city']
 when 'review_mapping' then array['action','operationId','mappingId','expectedVersion','expectedDigest','decision','note']
 when 'revoke_mapping' then array['action','operationId','mappingId','expectedVersion','note'] end;
 if keys is null or knowledge_review_private.closed_object(p_input,keys) is distinct from true or octet_length(p_input::text)>24000 or exists(select 1 from unnest(keys) k where k in('operationId','candidateId','statementId','mappingId','canonicalPoiId') and (jsonb_typeof(p_input->k) is distinct from 'string' or p_input->>k !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')) then raise exception 'INVALID_INPUT';end if;
 u:=knowledge_review_private.current_actor();select revision into member from knowledge_review_private.members where actor_id=u and active for share nowait;if member not between 1 and 9007199254740990 then return jsonb_build_object('kind','blocked');end if;
 op:=(p_input->>'operationId')::uuid;cid:=(p_input->>'candidateId')::uuid;digest:=lodging_classification_private.hash(p_input);
 perform pg_advisory_xact_lock(hashtextextended('lodging:'||u||':'||op,23));
 select * into prior from lodging_classification_private.operations where actor_id=u and operation_id=op;
 if found then
 if prior.input_digest<>digest then return jsonb_build_object('kind','conflict');end if;
 if act in ('publish','review_mapping') then
 if act='publish' then select statement_id into sid from knowledge_review_private.statements where candidate_id=cid;if lodging_classification_private.publication_basis(sid,false) is null then return jsonb_build_object('kind','stale');end if;
 elsif lodging_classification_private.mapping_basis((p_input->>'mappingId')::uuid) is null then return jsonb_build_object('kind','stale');end if;end if;
 return prior.receipt;end if;
 if act='submit' then
 if lodging_classification_private.statement_valid_v1(p_input->'statement') is distinct from true or knowledge_review_private.bounded_text(p_input->'title',160) is distinct from true then raise exception 'INVALID_INPUT';end if;
 v:=p_input->'statement';perform knowledge_review_private.ops_review_workspace(jsonb_build_object('action','submit','operationId',op,'candidateId',cid,'title',p_input->'title','content',v->'expressions'->'en'->>'text'));
 insert into knowledge_review_private.statements(candidate_id,payload) values(cid,v) returning statement_id into sid;
 for src in select value from jsonb_array_elements(v->'sources') order by value->>'sourceKey',value->>'revisionLabel' loop
 insert into knowledge_review_private.source_revisions(source_key,revision_label,declaration,snippet_hash,submitted_by,fetched_at,lineage_status) values(src->>'sourceKey',src->>'revisionLabel',src,encode(sha256(convert_to(src->>'snippet','UTF8')),'hex'),u,clock_timestamp(),'tracked') on conflict(source_key,revision_label) do nothing;
 select id,declaration into sid,b from knowledge_review_private.source_revisions where source_key=src->>'sourceKey' and revision_label=src->>'revisionLabel' for share nowait;if b is distinct from src then raise exception 'OPS_CONFLICT';end if;
 insert into knowledge_review_private.statement_sources(candidate_id,source_revision_id) values(cid,sid);end loop;
 select lodging_classification_private.hash(coalesce(jsonb_agg(jsonb_build_object('sourceRevisionId',sr.id,'revisionLabel',sr.revision_label,'snippetHash',sr.snippet_hash,'declarationHash',lodging_classification_private.hash(sr.declaration),'submittedBy',sr.submitted_by) order by sr.id),'[]')) into digest from knowledge_review_private.source_revisions sr join knowledge_review_private.statement_sources ss on ss.source_revision_id=sr.id where ss.candidate_id=cid;
 insert into lodging_classification_private.statements(candidate_id,payload_hash,source_digest) values(cid,lodging_classification_private.hash(v),digest);
 answer:=lodging_classification_private.candidate_reply(op,cid);
 elsif act in ('review','publish','revoke') then
 select * into c from knowledge_review_private.candidates where knowledge_review_private.candidates.id=cid for update nowait;if not found then return jsonb_build_object('kind','blocked');end if;
 select statement_id into sid from knowledge_review_private.statements where candidate_id=cid;
 if not exists(select 1 from lodging_classification_private.statements where candidate_id=cid) then return jsonb_build_object('kind','blocked');end if;
 b:=lodging_classification_private.source_basis(sid,act<>'review');if b is null and act<>'revoke' then return jsonb_build_object('kind','stale');end if;
 if act='review' then
 if p_input->'expectedVersion'<>'1' or p_input->>'decision' not in('reviewed','rejected') or knowledge_review_private.bounded_text(p_input->'note',400) is distinct from true then raise exception 'INVALID_INPUT';end if;
 if c.author_id=u or exists(select 1 from jsonb_array_elements(b->'sourceRefs') x where x->>'submittedBy'=u::text) then return jsonb_build_object('kind','blocked');end if;
 perform knowledge_review_private.ops_review_workspace(p_input-'statement'||jsonb_build_object('action','review'));
 update lodging_classification_private.statements set reviewer_id=u,reviewer_member_revision=member where candidate_id=cid;
 answer:=lodging_classification_private.candidate_reply(op,cid);
 elsif act='publish' then
 perform knowledge_review_private.ops_review_workspace_publication_v1(p_input||jsonb_build_object('action','publish_statement'));
 b:=lodging_classification_private.publication_basis(sid,false);if b is null then raise exception 'LODGING_SOURCE_CHANGED';end if;
 answer:=jsonb_build_object('kind','lodging_classification_publication','operationId',op,'candidateId',cid,'statementId',sid,'statementRevision',1,'factId',b->'factId','publicationVersion',1,'state','published','sourceDigest',b->'sourceDigest','rightsDigest',b->'rightsDigest','expiresAt',b->'expiresAt');
 else
 if p_input->'expectedPublicationVersion'<>'1' then raise exception 'INVALID_INPUT';end if;
 select * into p from knowledge_review_private.publications where candidate_id=cid;
 perform knowledge_review_private.ops_review_workspace_publication_v1(p_input||jsonb_build_object('action','revoke_statement'));
 answer:=jsonb_build_object('kind','lodging_classification_publication','operationId',op,'candidateId',cid,'statementId',sid,'statementRevision',1,'factId',p.fact_id,'publicationVersion',2,'state','revoked','sourceDigest',(select source_digest from lodging_classification_private.statements where candidate_id=cid),'rightsDigest',lodging_classification_private.hash(jsonb_build_array(p.use_basis,p.use_note,p.version)),'expiresAt',export_private.ms_v1(p.expires_at));end if;
 else
 if act='submit_mapping' then
 if p_input->'expectedStatementRevision'<>'1' or p_input->'expectedPublicationVersion'<>'1' or coalesce(p_input->>'city','') not in('shanghai','beijing','guangzhou','chongqing') or exists(select 1 from unnest(array['expectedPayloadHash','expectedSourceDigest','expectedRightsDigest']) k where jsonb_typeof(p_input->k) is distinct from 'string' or p_input->>k !~ '^[a-f0-9]{64}$') then raise exception 'INVALID_INPUT';end if;
 select * into poi from public.canonical_pois where id=(p_input->>'canonicalPoiId')::uuid for update nowait;if not found then return jsonb_build_object('kind','blocked');end if;
 b:=lodging_classification_private.publication_basis((p_input->>'statementId')::uuid);if b is null or b->>'payloadHash'<>p_input->>'expectedPayloadHash' or b->>'sourceDigest'<>p_input->>'expectedSourceDigest' or b->>'rightsDigest'<>p_input->>'expectedRightsDigest' or not(b->'payload'->'scope'->'cities' ? (p_input->>'city')) then return jsonb_build_object('kind','stale');end if;
 insert into lodging_classification_private.mappings(canonical_poi_id,statement_id,author_id,city,source_digest,rights_digest,payload_hash,canonical_hash,provider_hash,request_digest) values(poi.id,(p_input->>'statementId')::uuid,u,p_input->>'city',b->>'sourceDigest',b->>'rightsDigest',b->>'payloadHash',lodging_classification_private.hash(to_jsonb(poi)),lodging_classification_private.provider_hash(poi.id),lodging_classification_private.hash(p_input)) returning * into m;
 else
 select * into m from lodging_classification_private.mappings where id=(p_input->>'mappingId')::uuid;if not found then return jsonb_build_object('kind','blocked');end if;
 perform 1 from public.canonical_pois where id=m.canonical_poi_id for update nowait;
 select * into m from lodging_classification_private.mappings where id=m.id for update nowait;
 if m.version::text is distinct from p_input->>'expectedVersion' then return jsonb_build_object('kind','conflict');end if;
 if knowledge_review_private.bounded_text(p_input->'note',400) is distinct from true then raise exception 'INVALID_INPUT';end if;
 if act='review_mapping' then
 if coalesce(p_input->>'decision','') not in('approved','rejected') or p_input->'expectedVersion'<>'1' or p_input->>'expectedDigest' is distinct from m.request_digest then return jsonb_build_object('kind','conflict');end if;
 b:=lodging_classification_private.publication_basis(m.statement_id);
 if b is null or b->>'sourceDigest'<>m.source_digest or b->>'rightsDigest'<>m.rights_digest or b->>'payloadHash'<>m.payload_hash or m.canonical_hash<>(select lodging_classification_private.hash(to_jsonb(poi_row)) from public.canonical_pois poi_row where id=m.canonical_poi_id) or m.provider_hash<>lodging_classification_private.provider_hash(m.canonical_poi_id) then return jsonb_build_object('kind','stale');end if;
 if m.author_id=u or b->>'authorId'=u::text or exists(select 1 from jsonb_array_elements(b->'sourceRefs') x where x->>'submittedBy'=u::text) then return jsonb_build_object('kind','blocked');end if;
 update lodging_classification_private.mappings set status=p_input->>'decision',version=2,reviewer_id=u,reviewer_member_revision=member,reviewed_at=clock_timestamp() where id=m.id returning * into m;
 else
 if p_input->'expectedVersion'<>'2' or m.status<>'approved' then return jsonb_build_object('kind','conflict');end if;
 update lodging_classification_private.mappings set status='revoked',version=3 where id=m.id returning * into m;end if;
 end if;
 insert into lodging_classification_private.mapping_audit(mapping_id,version,actor_id,action,note) values(m.id,m.version,u,act,coalesce(p_input->>'note','Explicit reviewed identity candidate'));
 answer:=lodging_classification_private.mapping_reply(op,m);
 end if;
 insert into lodging_classification_private.operations(actor_id,operation_id,input_digest,receipt) values(u,op,lodging_classification_private.hash(p_input),answer);
 return answer;
exception when lock_not_available then return jsonb_build_object('kind','blocked');when unique_violation then return jsonb_build_object('kind','conflict');
end $$;
create function public.read_reviewed_lodging_classifications_v1(p_trip_id uuid,p_expected_trip_version integer,p_city text,p_locale text,p_canonical_poi_ids uuid[]) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare u uuid;t public.trips%rowtype;poi uuid;entry record;b jsonb;chosen jsonb;items jsonb:='[]';n integer;examined integer;instant timestamptz:=clock_timestamp();refs jsonb;
begin
 if p_trip_id is null or p_expected_trip_version is null or p_expected_trip_version<0 or p_city is null or p_city not in('shanghai','beijing','guangzhou','chongqing') or p_locale is null or p_locale not in('zh','en') or p_canonical_poi_ids is null or cardinality(p_canonical_poi_ids) not between 1 and 20 or exists(select 1 from unnest(p_canonical_poi_ids) x where x is null) or (select count(distinct x) from unnest(p_canonical_poi_ids) x)<>cardinality(p_canonical_poi_ids) then raise exception 'INVALID_INPUT';end if;
 if auth.role() is distinct from 'authenticated' or auth.jwt()->>'is_anonymous' is distinct from 'false' then raise exception 'UNAUTHENTICATED';end if;
 u:=turn_private.text_owner();select * into t from public.trips where id=p_trip_id and owner_id=u for share nowait;if not found or exists(select 1 from public.trip_archives where trip_id=t.id) or exists(select 1 from privacy_private.trip_deletions where trip_id=t.id) then return jsonb_build_object('kind','unavailable');end if;
 if t.head_version<>p_expected_trip_version then return jsonb_build_object('kind','conflict');end if;
 for poi in select distinct x from unnest(p_canonical_poi_ids) x order by x loop
 perform 1 from public.canonical_pois where id=poi for share nowait;if not found then continue;end if;
 n:=0;examined:=0;chosen:=null;
 for entry in select id from lodging_classification_private.mappings where canonical_poi_id=poi and city=p_city and status='approved' order by id limit 51 loop
 examined:=examined+1;if examined>50 then n:=2;exit;end if;
 b:=lodging_classification_private.mapping_basis(entry.id);if b is not null then n:=n+1;chosen:=b;if n>1 then exit;end if;end if;end loop;
 if n<>1 then continue;end if;
 select jsonb_agg(jsonb_build_object('sourceRevisionId',sr.id,'revisionLabel',sr.revision_label,'snippetHash',sr.snippet_hash,'publisher',sr.declaration->>'publisher','uri',sr.declaration->>'uri','locator',sr.declaration->>'locator') order by sr.id) into refs from knowledge_review_private.source_revisions sr join knowledge_review_private.statement_sources ss on ss.source_revision_id=sr.id where ss.candidate_id=(chosen->>'candidateId')::uuid;
 items:=items||jsonb_build_array(jsonb_build_object('canonicalPoiId',poi,'classification','hotel','mappingId',chosen->'mappingId','mappingVersion',chosen->'mappingVersion','mappingDigest',chosen->'mappingDigest','statementId',chosen->'statementId','statementRevision',chosen->'statementRevision','payloadHash',chosen->'payloadHash','factId',chosen->'factId','publicationVersion',chosen->'publicationVersion','sourceDigest',chosen->'sourceDigest','sourceRefs',refs,'rightsDigest',chosen->'rightsDigest','reviewedAt',chosen->'reviewedAt','expiresAt',export_private.ms_v1(least((chosen->>'expiresAt')::timestamptz,instant+interval '30 seconds'))));
 end loop;
 perform identity_private.guard_mobile_rpc_v2();if not exists(select 1 from auth.sessions where id=(auth.jwt()->>'session_id')::uuid and user_id=u) then raise exception 'UNAUTHENTICATED';end if;
 return jsonb_build_object('kind','lodging_classifications','schemaVersion','reviewed-lodging-classification/1','tripId',t.id,'tripVersion',t.head_version,'city',p_city,'locale',p_locale,'evaluatedAt',export_private.ms_v1(instant),'items',items);
exception when lock_not_available then return jsonb_build_object('kind','unavailable');
end $$;
revoke all on function public.ops_lodging_classification_v1(jsonb),public.read_reviewed_lodging_classifications_v1(uuid,integer,text,text,uuid[]) from public,anon,authenticated,service_role;
do $$declare f regprocedure;begin for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='lodging_classification_private' loop execute 'revoke all on function '||f||' from public,anon,authenticated,service_role';end loop;end $$;
notify pgrst,'reload schema';
