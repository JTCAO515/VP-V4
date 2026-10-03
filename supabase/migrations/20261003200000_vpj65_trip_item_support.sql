-- Support sidecar only. Never a second Trip writer, new source publisher,
-- role/grant, supplier fetch/fee or implicit ordinary-confirm support issuer.
create schema trip_support_private;
revoke all on schema trip_support_private from public,anon,authenticated,service_role;
create table trip_support_private.entity_mappings(
 id uuid primary key default gen_random_uuid(),operation_id uuid unique not null,request_digest text not null,
 canonical_poi_id uuid not null references public.canonical_pois(id) on delete cascade,
 statement_id uuid not null references knowledge_review_private.statements(statement_id),claim_revision integer not null,payload_hash text not null,source_digest text not null,
 source_refs jsonb not null,canonical_hash text not null,basis_metadata jsonb not null,author_id uuid not null,
 version bigint not null default 1,status text not null default 'pending' check(status in('pending','approved','rejected')),
 reviewer_id uuid,reviewer_member_revision bigint,reviewed_at timestamptz,created_at timestamptz not null default clock_timestamp(),
 check(version>0 and claim_revision>0 and payload_hash ~ '^[a-f0-9]{64}$' and source_digest ~ '^[a-f0-9]{64}$'),
 check(jsonb_typeof(source_refs)='array' and jsonb_array_length(source_refs) between 1 and 8)
);
create table trip_support_private.preparations(
 id uuid primary key default gen_random_uuid(),operation_id uuid not null,owner_id uuid not null references auth.users(id) on delete cascade,
 trip_id uuid not null references public.trips(id) on delete cascade,proposal_id uuid not null references public.trip_proposals(id) on delete cascade,
 place_reference_id uuid not null references public.trip_place_references(id) on delete cascade,mapping_id uuid not null references trip_support_private.entity_mappings(id),mapping_version bigint not null,
 proposal_revision integer not null,base_version integer not null,proposal_digest text not null,day_id text not null,item_id text not null,item_digest text not null,
 scope text not null check(scope in('address_reference','opening_window_reference')),applicability text not null check(applicability in('unverified','matched')),
 city text not null,scene text not null,locale text not null,statement_id uuid not null,claim_revision integer not null,payload_hash text not null,
 source_digest text not null,source_refs jsonb not null,request_digest text not null,
 version bigint not null default 1,status text not null default 'prepared' check(status in('prepared','revoked','consumed')),expires_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),
 unique(owner_id,operation_id),check(day_id ~ '^[A-Za-z0-9_-]{1,64}$' and item_id ~ '^[A-Za-z0-9_-]{1,64}$')
);
create table trip_support_private.confirm_proofs(
 transaction_id xid8 not null,owner_id uuid not null references auth.users(id) on delete cascade,
 trip_id uuid not null references public.trips(id) on delete cascade,proposal_id uuid not null references public.trip_proposals(id) on delete cascade,
 proposal_revision integer not null,base_version integer not null,proposal_digest text not null,selection jsonb not null,
 primary key(transaction_id,proposal_id),check(jsonb_typeof(selection)='array' and jsonb_array_length(selection) between 1 and 8)
);
create table trip_support_private.item_supports(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 trip_id uuid not null references public.trips(id) on delete cascade,proposal_id uuid not null references public.trip_proposals(id) on delete cascade,
 event_id uuid not null references public.trip_events(id) on delete cascade,receipt_id uuid unique not null references trip_support_private.preparations(id) on delete cascade,
 resulting_trip_version integer not null,day_id text not null,item_id text not null,item_digest text not null,
 scope text not null,applicability text not null,status text not null check(status in('reference_current','recheck_required','blocked','revoked')),
 version bigint not null default 1,provenance_version bigint not null default 1,claim_revision integer not null,payload_hash text not null,source_digest text not null,source_refs jsonb not null,
 created_at timestamptz not null default clock_timestamp(),check(day_id ~ '^[A-Za-z0-9_-]{1,64}$' and item_id ~ '^[A-Za-z0-9_-]{1,64}$')
);
create table trip_support_private.confirmation_receipts(
 owner_id uuid not null references auth.users(id) on delete cascade,trip_id uuid not null references public.trips(id) on delete cascade,proposal_id uuid not null references public.trip_proposals(id) on delete cascade,
 idempotency_key text not null,proposal_digest text not null,selection_digest text not null,receipt jsonb not null,primary key(owner_id,idempotency_key)
);
create table trip_support_private.support_receipts(
 id uuid primary key default gen_random_uuid(),support_id uuid not null references trip_support_private.item_supports(id) on delete cascade,
 version bigint not null,action text not null check(action in('bound','recheck','renewed','revoked')),source_digest text not null,
 created_at timestamptz not null default clock_timestamp(),unique(support_id,version)
);
do $$declare t text;begin foreach t in array array['entity_mappings','preparations','confirm_proofs','item_supports','support_receipts','confirmation_receipts'] loop execute format('alter table trip_support_private.%I enable row level security',t);execute format('revoke all on trip_support_private.%I from public,anon,authenticated,service_role',t);end loop;end $$;

create function trip_support_private.hash(p_value jsonb) returns text language sql immutable set search_path='' as $$select encode(sha256(convert_to(p_value::text,'UTF8')),'hex')$$;
create function trip_support_private.owner() returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();sess uuid:=(auth.jwt()->>'session_id')::uuid;
begin
 if u is null or sess is null then raise exception 'UNAUTHENTICATED';end if;
 perform 1 from auth.users where id=u for key share nowait;if not found then raise exception 'UNAUTHENTICATED';end if;
 perform identity_private.guard_mobile_rpc_v2();perform 1 from auth.sessions where id=sess and user_id=u for share nowait;if not found then raise exception 'UNAUTHENTICATED';end if;return u;
end $$;
-- Mint from currently qualified real publication, never caller C0 JSON/boolean.
create function trip_support_private.claim_basis(p_statement uuid,p_revision integer,p_hash text,p_city text,p_scene text,p_locale text) returns jsonb language plpgsql security definer set search_path='' as $$
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
exception when lock_not_available then return null;end $$;
revoke all on function trip_support_private.hash(jsonb),trip_support_private.owner(),trip_support_private.claim_basis(uuid,integer,text,text,text,text) from public,anon,authenticated,service_role;

create function public.submit_trip_support_entity_mapping_v1(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=knowledge_review_private.current_actor();basis jsonb;poi public.canonical_pois%rowtype;m trip_support_private.entity_mappings%rowtype;digest text;
begin
 if not knowledge_review_private.closed_object(p_input,array['operationId','canonicalPoiId','statementId','expectedClaimRevision','expectedPayloadHash','expectedSourceDigest','basisMetadata']) or not knowledge_review_private.closed_object(p_input->'basisMetadata',array['city','scene','locale','sourceRefs']) then return jsonb_build_object('kind','blocked');end if;
 select * into poi from public.canonical_pois where id=(p_input->>'canonicalPoiId')::uuid for share nowait;if not found then return jsonb_build_object('kind','blocked');end if;
 basis:=trip_support_private.claim_basis((p_input->>'statementId')::uuid,(p_input->>'expectedClaimRevision')::integer,p_input->>'expectedPayloadHash',p_input->'basisMetadata'->>'city',p_input->'basisMetadata'->>'scene',p_input->'basisMetadata'->>'locale');
 if basis is null or basis->>'sourceDigest' is distinct from p_input->>'expectedSourceDigest' or basis->'sourceRefs' is distinct from p_input->'basisMetadata'->'sourceRefs' or basis->'payload'->'assertion'->>'predicate' not in('located_at','opens_during') then return jsonb_build_object('kind','stale');end if;
 digest:=trip_support_private.hash(p_input);select * into m from trip_support_private.entity_mappings where operation_id=(p_input->>'operationId')::uuid for update nowait;
 if found then if m.author_id<>u or m.request_digest<>digest then return jsonb_build_object('kind','conflict');end if;return jsonb_build_object('kind','mapping_candidate','mappingId',m.id,'version',m.version,'digest',m.request_digest,'status',m.status);end if;
 insert into trip_support_private.entity_mappings(operation_id,request_digest,canonical_poi_id,statement_id,claim_revision,payload_hash,source_digest,source_refs,canonical_hash,basis_metadata,author_id)
 values((p_input->>'operationId')::uuid,digest,poi.id,(p_input->>'statementId')::uuid,(p_input->>'expectedClaimRevision')::integer,p_input->>'expectedPayloadHash',p_input->>'expectedSourceDigest',basis->'sourceRefs',trip_support_private.hash(to_jsonb(poi)),p_input->'basisMetadata',u) returning * into m;
 return jsonb_build_object('kind','mapping_candidate','mappingId',m.id,'version',m.version,'digest',m.request_digest,'status',m.status);
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
create function trip_support_private.mapping_basis(p_mapping uuid,p_require_approved boolean default true) returns jsonb language plpgsql security definer set search_path='' as $$
declare m trip_support_private.entity_mappings%rowtype;p public.canonical_pois%rowtype;basis jsonb;member_revision bigint;
begin
 select * into m from trip_support_private.entity_mappings where id=p_mapping;if not found or p_require_approved and m.status<>'approved' then return null;end if;
 select * into p from public.canonical_pois where id=m.canonical_poi_id for share nowait;if not found or trip_support_private.hash(to_jsonb(p))<>m.canonical_hash then return null;end if;
 if p_require_approved then select revision into member_revision from knowledge_review_private.members where actor_id=m.reviewer_id and active for share nowait;if member_revision is distinct from m.reviewer_member_revision then return null;end if;end if;
 basis:=trip_support_private.claim_basis(m.statement_id,m.claim_revision,m.payload_hash,m.basis_metadata->>'city',m.basis_metadata->>'scene',m.basis_metadata->>'locale');if basis is null or basis->>'sourceDigest'<>m.source_digest or basis->'sourceRefs' is distinct from m.source_refs then return null;end if;
 return basis||jsonb_build_object('mappingId',m.id,'mappingVersion',m.version,'mappingDigest',m.request_digest,'canonicalPoiId',m.canonical_poi_id);
exception when lock_not_available then return null;end $$;
create function public.review_trip_support_entity_mapping_v1(p_mapping uuid,p_expected_version bigint,p_expected_digest text,p_decision text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=knowledge_review_private.current_actor();m trip_support_private.entity_mappings%rowtype;basis jsonb;member_revision bigint;
begin
 if p_decision is null or p_decision not in('approve','reject') then return jsonb_build_object('kind','blocked');end if;
 select * into m from trip_support_private.entity_mappings where id=p_mapping for update nowait;if not found or m.author_id=u or exists(select 1 from jsonb_array_elements(m.source_refs) x where x->>'submittedBy'=u::text) then return jsonb_build_object('kind','blocked');end if;
 if m.status<>'pending' or m.version is distinct from p_expected_version or m.request_digest is distinct from p_expected_digest then return jsonb_build_object('kind','conflict');end if;
 basis:=trip_support_private.mapping_basis(m.id,false);if basis is null then return jsonb_build_object('kind','stale');end if;
 select revision into member_revision from knowledge_review_private.members where actor_id=u and active for share nowait;
 update trip_support_private.entity_mappings set status=case p_decision when 'approve' then 'approved' else 'rejected' end,version=version+1,reviewer_id=u,reviewer_member_revision=member_revision,reviewed_at=clock_timestamp() where id=m.id returning * into m;
 return jsonb_build_object('kind','mapping_reviewed','mappingId',m.id,'version',m.version,'digest',m.request_digest,'status',m.status);
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
-- Extract an exact user-created case-sensitive item; never infer a place from title.
create function trip_support_private.item(p_content jsonb,p_day text,p_item text) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('day',d-'items','item',i
 ||case when i->>'startsAt' is not null then jsonb_build_object('startsAt',to_char((i->>'startsAt')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) else '{}'::jsonb end
 ||case when i->>'endsAt' is not null then jsonb_build_object('endsAt',to_char((i->>'endsAt')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) else '{}'::jsonb end)
 from jsonb_array_elements(p_content->'days') d cross join lateral jsonb_array_elements(d->'items') i where d->>'id'=p_day and i->>'id'=p_item
$$;
create function trip_support_private.typed_claim(p_basis jsonb,p_scope text) returns jsonb language plpgsql immutable set search_path='' as $$
declare payload jsonb:=p_basis->'payload';kind text;value jsonb;
begin
 if p_scope='address_reference' and payload->'assertion'->>'predicate'='located_at' and payload->'assertion'->>'objectId'='place_address' then kind:='address';
 elsif p_scope='opening_window_reference' and payload->'assertion'->>'predicate'='opens_during' and payload->'assertion'->>'objectId'='opening_hours' then kind:='time_window';else return null;end if;
 value:=payload->'value';if jsonb_typeof(value) is distinct from 'object' then return null;end if;
 if trip_support_private.valid_typed_value(kind,value) is distinct from true then return null;end if;
 return jsonb_build_object('claimType',kind,'subjectId',payload->'assertion'->>'subjectId','value',value,'asOf',p_basis->'receipt'->'reviewedAt','evidence',jsonb_build_array(p_basis->'receipt'));
end $$;
revoke all on function public.submit_trip_support_entity_mapping_v1(jsonb),public.review_trip_support_entity_mapping_v1(uuid,bigint,text,text),trip_support_private.mapping_basis(uuid,boolean),trip_support_private.item(jsonb,text,text),trip_support_private.typed_claim(jsonb,text) from public,anon,authenticated,service_role;

create function public.prepare_trip_item_support_v1(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=trip_support_private.owner();t public.trips%rowtype;p public.trip_proposals%rowtype;r public.trip_place_references%rowtype;m trip_support_private.entity_mappings%rowtype;s trip_support_private.preparations%rowtype;basis jsonb;content jsonb;item jsonb;claim jsonb;fingerprint text;request_hash text;
begin
 if not knowledge_review_private.closed_object(p_input,array['operationId','tripId','placeReferenceId','dayId','itemId','proposalId','expectedProposalRevision','expectedBaseVersion','expectedProposalDigest','expectedItemDigest','mappingId','expectedMappingVersion','expectedMappingDigest','city','scene','locale','scope','expectedClaimRevision','expectedPayloadHash','expectedSourceDigest']) or p_input->>'dayId' !~ '^[A-Za-z0-9_-]{1,64}$' or p_input->>'itemId' !~ '^[A-Za-z0-9_-]{1,64}$' or p_input->>'scope' not in('address_reference','opening_window_reference') then return jsonb_build_object('kind','blocked');end if;
 select * into t from public.trips where id=(p_input->>'tripId')::uuid and owner_id=u for update nowait;if not found then return jsonb_build_object('kind','blocked');end if;
 select * into p from public.trip_proposals where id=(p_input->>'proposalId')::uuid and trip_id=t.id and owner_id=u for update nowait;
 if not found or p.status<>'pending' or p.expires_at<=clock_timestamp() or p.revision is distinct from (p_input->>'expectedProposalRevision')::integer or p.base_trip_version is distinct from (p_input->>'expectedBaseVersion')::integer or t.head_version<>p.base_trip_version then return jsonb_build_object('kind','stale');end if;
 select digest into fingerprint from public.read_trip_proposal_v2(p.id);if fingerprint is distinct from p_input->>'expectedProposalDigest' then return jsonb_build_object('kind','stale');end if;
 select * into r from public.trip_place_references where id=(p_input->>'placeReferenceId')::uuid and trip_id=t.id and owner_id=u and reference_kind='canonical' for share nowait;if not found then return jsonb_build_object('kind','blocked');end if;
 select * into m from trip_support_private.entity_mappings where id=(p_input->>'mappingId')::uuid and canonical_poi_id=r.canonical_poi_id;
 if not found or m.version is distinct from (p_input->>'expectedMappingVersion')::bigint or m.request_digest is distinct from p_input->>'expectedMappingDigest' or m.claim_revision is distinct from (p_input->>'expectedClaimRevision')::integer or m.payload_hash is distinct from p_input->>'expectedPayloadHash' or m.source_digest is distinct from p_input->>'expectedSourceDigest' then return jsonb_build_object('kind','stale');end if;
 basis:=trip_support_private.mapping_basis(m.id);if basis is null then return jsonb_build_object('kind','stale');end if;claim:=trip_support_private.typed_claim(basis,p_input->>'scope');if claim is null then return jsonb_build_object('kind','blocked');end if;
 if p.rollback_snapshot_version is not null then select snapshot.content into content from public.trip_version_snapshots snapshot where snapshot.trip_id=t.id and snapshot.version=p.rollback_snapshot_version;
 else content:=public.apply_trip_content_patch(public.trip_content_snapshot(t.id,t.title),p.patch);end if;
 item:=trip_support_private.item(content,p_input->>'dayId',p_input->>'itemId');if item is null or trip_support_private.hash(item) is distinct from p_input->>'expectedItemDigest' then return jsonb_build_object('kind','stale');end if;
 request_hash:=trip_support_private.hash(p_input);select * into s from trip_support_private.preparations where owner_id=u and operation_id=(p_input->>'operationId')::uuid for update nowait;
 if found then if s.request_digest<>request_hash or s.status<>'prepared' then return jsonb_build_object('kind','conflict');end if;
 else
 insert into trip_support_private.preparations(operation_id,owner_id,trip_id,proposal_id,place_reference_id,mapping_id,mapping_version,proposal_revision,base_version,proposal_digest,day_id,item_id,item_digest,scope,applicability,city,scene,locale,statement_id,claim_revision,payload_hash,source_digest,source_refs,request_digest,expires_at)
 values((p_input->>'operationId')::uuid,u,t.id,p.id,r.id,m.id,m.version,p.revision,p.base_trip_version,fingerprint,p_input->>'dayId',p_input->>'itemId',p_input->>'expectedItemDigest',p_input->>'scope',trip_support_private.applicability(item,p_input->>'scope',claim),p_input->>'city',p_input->>'scene',p_input->>'locale',m.statement_id,m.claim_revision,m.payload_hash,m.source_digest,m.source_refs,request_hash,least(p.expires_at,(basis->'receipt'->>'expiresAt')::timestamptz)) returning * into s;
 end if;
 return jsonb_build_object('kind','prepared','receiptId',s.id,'version',s.version,'tripId',s.trip_id,'proposalId',s.proposal_id,'proposalRevision',s.proposal_revision,'baseVersion',s.base_version,'dayId',s.day_id,'itemId',s.item_id,'scope',s.scope,'applicability',s.applicability,'claim',claim,'sourceDigest',s.source_digest,'expiresAt',s.expires_at);
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
create function public.revoke_trip_item_support_preparation_v1(p_receipt uuid,p_expected_version bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=trip_support_private.owner();s trip_support_private.preparations%rowtype;
begin
 select * into s from trip_support_private.preparations where id=p_receipt and owner_id=u for update nowait;if not found then return jsonb_build_object('kind','blocked');end if;
 if s.version is distinct from p_expected_version or s.status<>'prepared' then return jsonb_build_object('kind','conflict');end if;
 update trip_support_private.preparations set status='revoked',version=version+1 where id=s.id returning * into s;return jsonb_build_object('kind','revoked','receiptId',s.id,'version',s.version);
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
create function trip_support_private.bind_confirmed_event() returns trigger language plpgsql security definer set search_path='' as $$
declare proof trip_support_private.confirm_proofs%rowtype;p public.trip_proposals%rowtype;s trip_support_private.preparations%rowtype;selected jsonb;content jsonb;item jsonb;current_basis jsonb;support uuid;state text;
begin
 select * into proof from trip_support_private.confirm_proofs where transaction_id=pg_current_xact_id() and proposal_id=NEW.proposal_id;if not found then return null;end if;
 select * into p from public.trip_proposals where id=NEW.proposal_id;if p.owner_id<>proof.owner_id or p.trip_id<>proof.trip_id or p.revision<>proof.proposal_revision or p.base_trip_version<>proof.base_version or NEW.resulting_version<>proof.base_version+1 then raise exception 'SUPPORT_CONFIRM_IDENTITY';end if;
 select snap.content into content from public.trip_version_snapshots snap where snap.trip_id=NEW.trip_id and snap.version=NEW.resulting_version and snap.owner_id=NEW.owner_id;if content is null then raise exception 'SUPPORT_SNAPSHOT_MISSING';end if;
 for selected in select value from jsonb_array_elements(proof.selection) loop
  select * into s from trip_support_private.preparations where id=(selected->>'receiptId')::uuid for update nowait;
  if not found or s.owner_id<>NEW.owner_id or s.proposal_id<>p.id or s.proposal_revision<>p.revision or s.base_version<>p.base_trip_version or s.version is distinct from (selected->>'version')::bigint or s.source_digest is distinct from selected->>'sourceDigest' or s.status<>'prepared' then raise exception 'SUPPORT_SELECTION_MISMATCH';end if;
  item:=trip_support_private.item(content,s.day_id,s.item_id);if item is null or trip_support_private.hash(item)<>s.item_digest then raise exception 'SUPPORT_ITEM_CHANGED';end if;
  current_basis:=trip_support_private.mapping_basis(s.mapping_id);state:=case when current_basis is not null and current_basis->>'mappingVersion'=s.mapping_version::text and current_basis->>'sourceDigest'=s.source_digest and s.expires_at>clock_timestamp() then 'reference_current' else 'recheck_required' end;
  insert into trip_support_private.item_supports(owner_id,trip_id,proposal_id,event_id,receipt_id,resulting_trip_version,day_id,item_id,item_digest,scope,applicability,status,claim_revision,payload_hash,source_digest,source_refs)
  values(NEW.owner_id,NEW.trip_id,p.id,NEW.id,s.id,NEW.resulting_version,s.day_id,s.item_id,s.item_digest,s.scope,s.applicability,state,s.claim_revision,s.payload_hash,s.source_digest,s.source_refs) returning id into support;
  insert into trip_support_private.support_receipts(support_id,version,action,source_digest) values(support,1,'bound',s.source_digest);
  update trip_support_private.preparations set status='consumed' where id=s.id;
 end loop;return null;
end $$;
create constraint trigger trip_support_confirmed_event after insert on public.trip_events deferrable initially deferred for each row execute function trip_support_private.bind_confirmed_event();
create function public.confirm_and_apply_supported_trip_proposal_v1(p_proposal_id uuid,p_idempotency_key text,p_digest text,p_support_selection jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=trip_support_private.owner();p public.trip_proposals%rowtype;t public.trips%rowtype;s trip_support_private.preparations%rowtype;chosen jsonb;result record;supports jsonb;prior trip_support_private.confirmation_receipts%rowtype;answer jsonb;
begin
 if jsonb_typeof(p_support_selection) is distinct from 'array' or jsonb_array_length(p_support_selection) not between 1 and 8 or (select count(distinct x->>'receiptId') from jsonb_array_elements(p_support_selection) x)<>jsonb_array_length(p_support_selection) then return jsonb_build_object('kind','blocked');end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||':'||p_idempotency_key,0));
 select * into prior from trip_support_private.confirmation_receipts where owner_id=u and idempotency_key=p_idempotency_key;
 if found then if prior.proposal_id is distinct from p_proposal_id or prior.proposal_digest is distinct from p_digest or prior.selection_digest is distinct from trip_support_private.hash(p_support_selection) then return jsonb_build_object('kind','conflict');end if;return prior.receipt;end if;
 if exists(select 1 from public.trip_idempotency where owner_id=u and idempotency_key=p_idempotency_key) then return jsonb_build_object('kind','conflict');end if;
 select * into p from public.trip_proposals where id=p_proposal_id and owner_id=u and status='pending';if not found then return jsonb_build_object('kind','blocked');end if;
 select * into t from public.trips where id=p.trip_id and owner_id=u for update nowait;select * into p from public.trip_proposals where id=p_proposal_id and owner_id=u for update nowait;
 for chosen in select value from jsonb_array_elements(p_support_selection) order by value->>'receiptId' loop
  if not knowledge_review_private.closed_object(chosen,array['receiptId','version','sourceDigest']) then return jsonb_build_object('kind','blocked');end if;
  select * into s from trip_support_private.preparations where id=(chosen->>'receiptId')::uuid and owner_id=u for update nowait;
  if not found or s.proposal_id<>p.id or s.trip_id<>t.id or s.proposal_revision<>p.revision or s.base_version<>p.base_trip_version or s.proposal_digest is distinct from p_digest or s.version is distinct from (chosen->>'version')::bigint or s.source_digest is distinct from chosen->>'sourceDigest' or s.status not in('prepared','consumed') then return jsonb_build_object('kind','stale');end if;
 end loop;
 insert into trip_support_private.confirm_proofs(transaction_id,owner_id,trip_id,proposal_id,proposal_revision,base_version,proposal_digest,selection) values(pg_current_xact_id(),u,t.id,p.id,p.revision,p.base_trip_version,p_digest,p_support_selection);
 select * into result from public.confirm_and_apply_trip_proposal(p_proposal_id,p_idempotency_key,p_digest);
 set constraints public.trip_support_confirmed_event immediate;
 select coalesce(jsonb_agg(jsonb_build_object('supportId',id,'receiptId',receipt_id,'version',version,'status',status) order by id),'[]'::jsonb) into supports from trip_support_private.item_supports where proposal_id=p.id and owner_id=u;
 answer:=jsonb_build_object('kind','confirmed','outcome',result.outcome,'tripId',t.id,'proposalId',p.id,'resultingVersion',result.resulting_version,'supports',supports,'selectionDigest',trip_support_private.hash(p_support_selection));
 insert into trip_support_private.confirmation_receipts values(u,t.id,p.id,p_idempotency_key,p_digest,trip_support_private.hash(p_support_selection),answer);return answer;
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
revoke all on function public.prepare_trip_item_support_v1(jsonb),public.revoke_trip_item_support_preparation_v1(uuid,bigint),trip_support_private.bind_confirmed_event(),public.confirm_and_apply_supported_trip_proposal_v1(uuid,text,text,jsonb) from public,anon,authenticated,service_role;

create function public.read_trip_item_support_v1(p_trip uuid,p_expected_trip_version integer,p_day text,p_item text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=trip_support_private.owner();t public.trips%rowtype;content jsonb;item jsonb;s trip_support_private.item_supports%rowtype;r trip_support_private.preparations%rowtype;basis jsonb;entries jsonb:='[]';status text;
begin
 if p_day is null or p_item is null or p_day !~ '^[A-Za-z0-9_-]{1,64}$' or p_item !~ '^[A-Za-z0-9_-]{1,64}$' then return jsonb_build_object('kind','blocked');end if;
 select * into t from public.trips where id=p_trip and owner_id=u for share nowait;if not found then return jsonb_build_object('kind','blocked');end if;
 if t.head_version is distinct from p_expected_trip_version then return jsonb_build_object('kind','stale');end if;
 select snap.content into content from public.trip_version_snapshots snap where snap.trip_id=t.id and snap.owner_id=u and snap.version=t.head_version;item:=trip_support_private.item(content,p_day,p_item);if item is null then return jsonb_build_object('kind','blocked');end if;
 for s in select * from trip_support_private.item_supports where trip_id=t.id and owner_id=u and day_id=p_day and item_id=p_item order by created_at desc,id limit 8 loop
  select * into r from trip_support_private.preparations where id=s.receipt_id;
  basis:=trip_support_private.mapping_basis(r.mapping_id);status:=s.status;
  if status='reference_current' and (basis is null or basis->>'mappingVersion' is distinct from r.mapping_version::text or basis->>'sourceDigest' is distinct from s.source_digest or trip_support_private.hash(item)<>s.item_digest or r.expires_at<=clock_timestamp()) then status:='recheck_required';end if;
  entries:=entries||jsonb_build_array(jsonb_build_object('supportId',s.id,'receiptId',r.id,'placeReferenceId',r.place_reference_id,'version',s.version,'scope',s.scope,'applicability',s.applicability,'status',status,'claimRevision',s.claim_revision,'payloadHash',s.payload_hash,'sourceDigest',s.source_digest,'sourceRefs',(select coalesce(jsonb_agg(x-'submittedBy' order by x->>'sourceRevisionId'),'[]'::jsonb) from jsonb_array_elements(s.source_refs) x),'claim',case when status='reference_current' then trip_support_private.typed_claim(basis,s.scope) else null end));
 end loop;return jsonb_build_object('kind','support','tripId',t.id,'tripVersion',t.head_version,'dayId',p_day,'itemId',p_item,'entries',entries);
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
create function public.apply_trip_item_source_impact_v1(p_support uuid,p_expected_version bigint,p_source uuid,p_expected_source_digest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=trip_support_private.owner();s trip_support_private.item_supports%rowtype;receipt uuid;
begin
 select * into s from trip_support_private.item_supports where id=p_support and owner_id=u for update nowait;
 if not found or s.version is distinct from p_expected_version or s.source_digest is distinct from p_expected_source_digest or not exists(select 1 from jsonb_array_elements(s.source_refs) x where x->>'sourceRevisionId'=p_source::text) then return jsonb_build_object('kind','blocked');end if;
 if not exists(select 1 from knowledge_review_private.source_revisions where id=p_source and withdrawn_at is not null) then return jsonb_build_object('kind','stale');end if;
 if s.status='recheck_required' then select id into receipt from trip_support_private.support_receipts where support_id=s.id and version=s.version;return jsonb_build_object('kind','rechecked','supportId',s.id,'version',s.version,'receiptId',receipt);end if;
 update trip_support_private.item_supports set status='recheck_required',version=version+1 where id=s.id returning * into s;
 insert into trip_support_private.support_receipts(support_id,version,action,source_digest) values(s.id,s.version,'recheck',s.source_digest) returning id into receipt;
 return jsonb_build_object('kind','rechecked','supportId',s.id,'version',s.version,'receiptId',receipt);
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
create function public.renew_trip_item_support_v1(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=trip_support_private.owner();s trip_support_private.item_supports%rowtype;r trip_support_private.preparations%rowtype;t public.trips%rowtype;m trip_support_private.entity_mappings%rowtype;basis jsonb;content jsonb;item jsonb;receipt uuid;new_receipt uuid;new_applicability text;
begin
 if not knowledge_review_private.closed_object(p_input,array['operationId','supportId','expectedVersion','tripVersion','dayId','itemId','mappingId','expectedMappingVersion','expectedMappingDigest','expectedClaimRevision','expectedPayloadHash','expectedSourceDigest']) then return jsonb_build_object('kind','blocked');end if;
 select trip_id into t.id from trip_support_private.item_supports where id=(p_input->>'supportId')::uuid and owner_id=u;
 select * into t from public.trips where id=t.id and owner_id=u for update nowait;if not found or t.head_version is distinct from (p_input->>'tripVersion')::integer then return jsonb_build_object('kind','stale');end if;
 select * into s from trip_support_private.item_supports where id=(p_input->>'supportId')::uuid and owner_id=u for update nowait;
 if not found or s.version is distinct from (p_input->>'expectedVersion')::bigint or s.day_id is distinct from p_input->>'dayId' or s.item_id is distinct from p_input->>'itemId' then return jsonb_build_object('kind','conflict');end if;
 select * into r from trip_support_private.preparations where id=s.receipt_id;
 select * into m from trip_support_private.entity_mappings where id=(p_input->>'mappingId')::uuid;
 if not found or m.version is distinct from (p_input->>'expectedMappingVersion')::bigint or m.request_digest is distinct from p_input->>'expectedMappingDigest' or m.claim_revision is distinct from (p_input->>'expectedClaimRevision')::integer or m.payload_hash is distinct from p_input->>'expectedPayloadHash' or m.source_digest is distinct from p_input->>'expectedSourceDigest' or m.canonical_poi_id is distinct from (select canonical_poi_id from public.trip_place_references where id=r.place_reference_id and owner_id=u and trip_id=t.id) then return jsonb_build_object('kind','stale');end if;
 basis:=trip_support_private.mapping_basis(m.id);if basis is null or trip_support_private.typed_claim(basis,s.scope) is null then return jsonb_build_object('kind','stale');end if;
 select snap.content into content from public.trip_version_snapshots snap where snap.trip_id=t.id and snap.version=t.head_version;item:=trip_support_private.item(content,s.day_id,s.item_id);if item is null or trip_support_private.hash(item)<>s.item_digest then return jsonb_build_object('kind','stale');end if;
 new_applicability:=trip_support_private.applicability(item,s.scope,trip_support_private.typed_claim(basis,s.scope));
 -- A reviewed current replacement receipt renews support only, never Trip content.
 update trip_support_private.item_supports set version=version+1,provenance_version=provenance_version+1,status='reference_current',applicability=new_applicability,claim_revision=m.claim_revision,payload_hash=m.payload_hash,source_digest=m.source_digest,source_refs=m.source_refs where id=s.id returning * into s;
 insert into trip_support_private.preparations(operation_id,owner_id,trip_id,proposal_id,place_reference_id,mapping_id,mapping_version,proposal_revision,base_version,proposal_digest,day_id,item_id,item_digest,scope,applicability,city,scene,locale,statement_id,claim_revision,payload_hash,source_digest,source_refs,request_digest,status,expires_at)
 values((p_input->>'operationId')::uuid,u,r.trip_id,r.proposal_id,r.place_reference_id,m.id,m.version,r.proposal_revision,r.base_version,r.proposal_digest,r.day_id,r.item_id,r.item_digest,r.scope,new_applicability,r.city,r.scene,r.locale,m.statement_id,m.claim_revision,m.payload_hash,m.source_digest,m.source_refs,trip_support_private.hash(p_input),'consumed',(basis->'receipt'->>'expiresAt')::timestamptz) returning id into new_receipt;
 update trip_support_private.item_supports set receipt_id=new_receipt where id=s.id;
 insert into trip_support_private.support_receipts(support_id,version,action,source_digest) values(s.id,s.version,'renewed',s.source_digest) returning id into receipt;
 return jsonb_build_object('kind','renewed','supportId',s.id,'version',s.version,'receiptId',receipt);
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
revoke all on function public.read_trip_item_support_v1(uuid,integer,text,text),public.apply_trip_item_source_impact_v1(uuid,bigint,uuid,text),public.renew_trip_item_support_v1(jsonb) from public,anon,authenticated,service_role;


create function trip_support_private.applicability(p_item jsonb,p_scope text,p_claim jsonb) returns text language plpgsql immutable set search_path='' as $$
declare value jsonb:=p_claim->'value';first_at timestamptz;last_at timestamptz;zone text;
begin
 -- Entity linkage is already independently reviewed and explicitly selected.
 if trip_support_private.valid_typed_value(p_claim->>'claimType',value) is distinct from true then return 'unverified';end if;
 if p_scope='address_reference' then return 'matched';end if;
 if p_scope<>'opening_window_reference' or p_item->'day'->>'date' is null or p_item->'day'->>'timeZone' is null or p_item->'item'->>'startsAt' is null or p_item->'item'->>'endsAt' is null then return 'unverified';end if;
 zone:=value->>'timeZone';if zone is distinct from p_item->'day'->>'timeZone' or zone<>'Asia/Shanghai' then return 'unverified';end if;
 first_at:=(p_item->'item'->>'startsAt')::timestamptz;last_at:=(p_item->'item'->>'endsAt')::timestamptz;
 if last_at<=first_at or first_at<(value->>'startsAt')::timestamptz or last_at>(value->>'endsAt')::timestamptz or (first_at at time zone zone)::date::text is distinct from p_item->'day'->>'date' then return 'unverified';end if;return 'matched';
exception when invalid_datetime_format or datetime_field_overflow then return 'unverified';end $$;
revoke all on function trip_support_private.applicability(jsonb,text,jsonb) from public,anon,authenticated,service_role;


create function trip_support_private.valid_typed_value(p_kind text,p_value jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare first_at timestamptz;last_at timestamptz;
begin
 if jsonb_typeof(p_value) is distinct from 'object' then return false;end if;
 if p_kind='address' then
  if p_value-array['lines','countryCode','locality']<>'{}'::jsonb or jsonb_typeof(p_value->'lines') is distinct from 'array' or jsonb_array_length(p_value->'lines') not between 1 and 3 or p_value->>'countryCode' is distinct from 'CN' then return false;end if;
  if exists(select 1 from jsonb_array_elements(p_value->'lines') line where jsonb_typeof(line) is distinct from 'string' or char_length(line#>>'{}') not between 1 and 160 or btrim(line#>>'{}') is distinct from line#>>'{}') then return false;end if;
  if p_value ? 'locality' and (jsonb_typeof(p_value->'locality') is distinct from 'string' or char_length(p_value->>'locality') not between 1 and 120) then return false;end if;return true;
 end if;
 if p_kind<>'time_window' or not knowledge_review_private.closed_object(p_value,array['startsAt','endsAt','timeZone']) or jsonb_typeof(p_value->'startsAt') is distinct from 'string' or jsonb_typeof(p_value->'endsAt') is distinct from 'string' or p_value->>'timeZone' is distinct from 'Asia/Shanghai' then return false;end if;
 if p_value->>'startsAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$' or p_value->>'endsAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$' then return false;end if;
 first_at:=(p_value->>'startsAt')::timestamptz;last_at:=(p_value->>'endsAt')::timestamptz;
 return last_at>first_at and last_at-first_at<=interval '1 day';
exception when invalid_datetime_format or datetime_field_overflow then return false;end $$;
revoke all on function trip_support_private.valid_typed_value(text,jsonb) from public,anon,authenticated,service_role;


-- Minimal owner metadata only; no copied typed body, source text or staff audit.
-- Not yet a D2 delivery-module enrollment; handler dependency remains explicit.
create function public.trip_item_support_owner_metadata_v1(p_trip uuid,p_after uuid default null,p_limit integer default 50) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=trip_support_private.owner();rows jsonb;next_id uuid;has_more boolean;
begin
 if p_limit is null or p_limit not between 1 and 100 or not exists(select 1 from public.trips where id=p_trip and owner_id=u) then return jsonb_build_object('kind','blocked');end if;
 if p_after is not null and not exists(select 1 from trip_support_private.preparations where id=p_after and trip_id=p_trip and owner_id=u) then return jsonb_build_object('kind','blocked');end if;
 select coalesce(jsonb_agg(jsonb_build_object('receiptId',id,'version',version,'proposalId',proposal_id,'dayId',day_id,'itemId',item_id,'scope',scope,'applicability',applicability,'status',status,'claimRevision',claim_revision,'payloadHash',payload_hash,'sourceDigest',source_digest,'createdAt',created_at) order by id),'[]'::jsonb) into rows from(select * from trip_support_private.preparations where owner_id=u and trip_id=p_trip and (p_after is null or id>p_after) order by id limit p_limit) r;
 select (x->>'receiptId')::uuid into next_id from jsonb_array_elements(rows) x order by x->>'receiptId' desc limit 1;
 has_more:=next_id is not null and exists(select 1 from trip_support_private.preparations where owner_id=u and trip_id=p_trip and id>next_id);
 return jsonb_build_object('kind','metadata','tripId',p_trip,'rows',rows,'nextCursor',case when has_more then next_id else null end);
end $$;
revoke all on function public.trip_item_support_owner_metadata_v1(uuid,uuid,integer) from public,anon,authenticated,service_role;

-- Guard the exact merged180 graph body before extending its reviewed target universe.
do $$begin if encode(sha256(convert_to((select prosrc from pg_proc where oid='knowledge_review_private.impact_graph(uuid)'::regprocedure),'UTF8')),'hex')<>'0de0d0f0284dab2ab940feb5c6061687c55d3d8814ccceee34c75757d3e458ff' then raise exception 'SOURCE_IMPACT_GRAPH_DEPENDENCY';end if;end $$;
alter function knowledge_review_private.impact_graph(uuid) rename to impact_graph_before_support_v1;
create function knowledge_review_private.impact_graph(p_source uuid) returns jsonb language sql security definer set search_path='' as $$
 with targets as(
 select x->>'key' key,x->'target' target from jsonb_array_elements(knowledge_review_private.impact_graph_before_support_v1(p_source)) x
 union all
 select 'trip_item_support:'||s.id||':'||s.provenance_version,jsonb_build_object('kind','trip_item_support','id',s.id,'version',s.provenance_version,'payloadHash',trip_support_private.hash(jsonb_build_object('receiptId',s.receipt_id,'scope',s.scope,'claimRevision',s.claim_revision,'sourceDigest',s.source_digest,'itemDigest',s.item_digest)),'claimRefs','[]'::jsonb)
 from trip_support_private.item_supports s where s.source_refs @> jsonb_build_array(jsonb_build_object('sourceRevisionId',p_source))
 ),bounded as(select * from targets order by key limit 1001)
 select coalesce(jsonb_agg(jsonb_build_object('key',key,'target',target) order by key),'[]'::jsonb) from bounded
$$;
-- Enroll only the real support consumer for an actual support target. Legacy
-- knowledge/caches keep their original capabilities; no new shadow queue.
create function trip_support_private.enroll_source_delivery() returns trigger language plpgsql security definer set search_path='' as $$
declare target jsonb;
begin
 select i.target into target from knowledge_review_private.source_impact_items i where i.id=NEW.item_id;
 if target->>'kind'='trip_item_support' then NEW.state:=case when NEW.consumer='trip_item_support' then 'queued' else 'unsupported' end;end if;return NEW;
end $$;
create trigger enroll_actual_trip_support before insert on knowledge_review_private.source_impact_outbox for each row execute function trip_support_private.enroll_source_delivery();
create table trip_support_private.impact_claims(
 delivery_id uuid not null references knowledge_review_private.source_impact_outbox(id) on delete cascade,attempt integer not null,lease_token uuid not null,
 support_id uuid not null references trip_support_private.item_supports(id) on delete cascade,provenance_version bigint not null,state_before bigint not null,state_after bigint,effect_receipt uuid references trip_support_private.support_receipts(id) on delete cascade,
 primary key(delivery_id,attempt)
);
alter table trip_support_private.impact_claims enable row level security;revoke all on trip_support_private.impact_claims from public,anon,authenticated,service_role;
create function public.claim_trip_support_impact_delivery_v1(p_limit integer default 1,p_lease_ms integer default 15000) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=knowledge_review_private.current_actor();o knowledge_review_private.source_impact_outbox%rowtype;target jsonb;support trip_support_private.item_supports%rowtype;
begin
 if p_limit is distinct from 1 or p_lease_ms is null or p_lease_ms not between 1 and 15000 then return jsonb_build_object('kind','blocked');end if;
 for o in select * from knowledge_review_private.source_impact_outbox where consumer='trip_item_support' and attempt<8 and ((state in('queued','failed') and next_attempt_at<=clock_timestamp()) or state='leased' and expires_at<=clock_timestamp()) order by next_attempt_at,id limit 100 for update skip locked loop
  if not knowledge_review_private.impact_review_current(o.set_id) then continue;end if;
  select i.target into target from knowledge_review_private.source_impact_items i where i.id=o.item_id;if target->>'kind'<>'trip_item_support' then continue;end if;
  update knowledge_review_private.source_impact_outbox set state='leased',attempt=attempt+1,lease_token=gen_random_uuid(),expires_at=clock_timestamp()+p_lease_ms*interval '1 millisecond',error_code=null where id=o.id returning * into o;
  select * into support from trip_support_private.item_supports where id=(target->>'id')::uuid for update nowait;if not found or support.provenance_version::text is distinct from target->>'version' then return jsonb_build_object('kind','stale');end if;
  insert into trip_support_private.impact_claims values(o.id,o.attempt,o.lease_token,support.id,support.provenance_version,support.version,null,null);
  return jsonb_build_object('kind','leased','deliveryId',o.id,'setId',o.set_id,'reviewVersion',o.review_version,'sourceDigest',o.digest,'target',target,'leaseToken',o.lease_token,'attempt',o.attempt);
 end loop;return jsonb_build_object('kind','idle');
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
create function public.apply_reviewed_trip_support_delivery_v1(p_delivery uuid,p_lease uuid,p_expected_attempt integer,p_expected_digest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=knowledge_review_private.current_actor();o knowledge_review_private.source_impact_outbox%rowtype;setrow knowledge_review_private.source_impact_sets%rowtype;target jsonb;s trip_support_private.item_supports%rowtype;receipt uuid;claim trip_support_private.impact_claims%rowtype;
begin
 select * into o from knowledge_review_private.source_impact_outbox where id=p_delivery for update nowait;
 if not found or o.consumer<>'trip_item_support' or o.attempt is distinct from p_expected_attempt or o.lease_token is distinct from p_lease or o.digest is distinct from p_expected_digest then return jsonb_build_object('kind','blocked');end if;
 select * into claim from trip_support_private.impact_claims where delivery_id=o.id and attempt=o.attempt and lease_token=o.lease_token;if not found then return jsonb_build_object('kind','blocked');end if;
 -- Read-only exact committed receipt can resolve a lost ACK, never grants a new effect.
 if o.state='acked' and o.receipt_id is not null and claim.effect_receipt=o.receipt_id then return jsonb_build_object('kind','applied','deliveryId',o.id,'receiptId',o.receipt_id,'digest',o.digest);end if;
 if o.state<>'leased' or o.expires_at<=clock_timestamp() or not knowledge_review_private.impact_review_current(o.set_id) then return jsonb_build_object('kind','stale');end if;
 select * into setrow from knowledge_review_private.source_impact_sets where id=o.set_id;if setrow.status<>'approved' or setrow.version<>o.review_version or setrow.digest<>o.digest then return jsonb_build_object('kind','stale');end if;
 select i.target into target from knowledge_review_private.source_impact_items i where i.id=o.item_id;
 select * into s from trip_support_private.item_supports where id=(target->>'id')::uuid for update nowait;
 if not found or s.version<>claim.state_before or s.provenance_version<>claim.provenance_version or target->>'kind'<>'trip_item_support' or target->>'version' is distinct from s.provenance_version::text or target->>'payloadHash' is distinct from trip_support_private.hash(jsonb_build_object('receiptId',s.receipt_id,'scope',s.scope,'claimRevision',s.claim_revision,'sourceDigest',s.source_digest,'itemDigest',s.item_digest)) or not exists(select 1 from jsonb_array_elements(s.source_refs) r where r->>'sourceRevisionId'=setrow.source_id::text) then return jsonb_build_object('kind','stale');end if;
 -- Only recheck metadata crosses owner scope under the independently reviewed
 -- source action. No owner impersonation or private typed value is returned.
 update trip_support_private.item_supports set status='recheck_required',version=version+1 where id=s.id returning * into s;
 insert into trip_support_private.support_receipts(support_id,version,action,source_digest) values(s.id,s.version,'recheck',s.source_digest) returning id into receipt;
 update trip_support_private.impact_claims set state_after=s.version,effect_receipt=receipt where delivery_id=o.id and attempt=o.attempt;
 update knowledge_review_private.source_impact_outbox set state='acked',receipt_id=receipt,acked_at=clock_timestamp() where id=o.id;
 return jsonb_build_object('kind','applied','deliveryId',o.id,'receiptId',receipt,'digest',o.digest);
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
revoke all on function knowledge_review_private.impact_graph_before_support_v1(uuid),knowledge_review_private.impact_graph(uuid),trip_support_private.enroll_source_delivery(),public.claim_trip_support_impact_delivery_v1(integer,integer),public.apply_reviewed_trip_support_delivery_v1(uuid,uuid,integer,text) from public,anon,authenticated,service_role;
create function public.read_reviewed_trip_support_delivery_v1(p_delivery uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=knowledge_review_private.current_actor();o knowledge_review_private.source_impact_outbox%rowtype;c trip_support_private.impact_claims%rowtype;
begin
 select * into o from knowledge_review_private.source_impact_outbox where id=p_delivery and consumer='trip_item_support';if not found then return jsonb_build_object('kind','blocked');end if;
 if not knowledge_review_private.impact_review_current(o.set_id) then return jsonb_build_object('kind','stale');end if;
 select * into c from trip_support_private.impact_claims where delivery_id=o.id and attempt=o.attempt and lease_token=o.lease_token;
 if o.state='acked' and (c.effect_receipt is distinct from o.receipt_id or not exists(select 1 from trip_support_private.support_receipts where id=c.effect_receipt and support_id=c.support_id and version=c.state_after)) then return jsonb_build_object('kind','blocked');end if;
 return knowledge_review_private.impact_delivery_wire(o.id);
end $$;
create function public.fail_reviewed_trip_support_delivery_v1(p_delivery uuid,p_lease uuid,p_expected_attempt integer,p_expected_digest text,p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=knowledge_review_private.current_actor();o knowledge_review_private.source_impact_outbox%rowtype;
begin
 select * into o from knowledge_review_private.source_impact_outbox where id=p_delivery and consumer='trip_item_support' for update nowait;if not found or o.state<>'leased' or o.lease_token is distinct from p_lease or o.attempt is distinct from p_expected_attempt or o.digest is distinct from p_expected_digest or not knowledge_review_private.impact_review_current(o.set_id) or p_code not in('apply_ack_unknown','transient_error') then return jsonb_build_object('kind','blocked');end if;
 update knowledge_review_private.source_impact_outbox set state=case when attempt=8 then 'exhausted' else 'failed' end,error_code=p_code,next_attempt_at=clock_timestamp()+least(power(2,attempt-1),3600)*interval '1 second' where id=o.id returning * into o;
 return jsonb_build_object('kind','failed','deliveryId',o.id,'nextAttemptAt',o.next_attempt_at);
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
revoke all on function public.read_reviewed_trip_support_delivery_v1(uuid),public.fail_reviewed_trip_support_delivery_v1(uuid,uuid,integer,text,text) from public,anon,authenticated,service_role;

create function public.read_trip_item_support_candidates_v1(p_trip uuid,p_expected_trip_version integer,p_place_reference uuid,p_city text,p_scene text,p_locale text,p_cursor jsonb default null,p_limit integer default 50) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=trip_support_private.owner();t public.trips%rowtype;r public.trip_place_references%rowtype;m trip_support_private.entity_mappings%rowtype;basis jsonb;claim jsonb;all_rows jsonb:='[]';page jsonb;context text;after_id text;next_id text;visited integer:=0;has_more boolean;
begin
 if p_limit is null or p_limit not between 1 and 50 then return jsonb_build_object('kind','blocked');end if;
 select * into t from public.trips where id=p_trip and owner_id=u for share nowait;if not found then return jsonb_build_object('kind','blocked');end if;if t.head_version is distinct from p_expected_trip_version then return jsonb_build_object('kind','stale');end if;
 select * into r from public.trip_place_references where id=p_place_reference and trip_id=t.id and owner_id=u for share nowait;if not found or r.reference_kind<>'canonical' then return jsonb_build_object('kind','unavailable','reason','canonical_reference_required');end if;
 for m in select * from trip_support_private.entity_mappings where canonical_poi_id=r.canonical_poi_id and status='approved' order by id limit 501 loop
  visited:=visited+1;if visited>500 then return jsonb_build_object('kind','unavailable','reason','capacity');end if;
  if m.basis_metadata->>'city' is distinct from p_city or m.basis_metadata->>'scene' is distinct from p_scene or m.basis_metadata->>'locale' is distinct from p_locale then continue;end if;
  basis:=trip_support_private.mapping_basis(m.id);if basis is null then continue;end if;
  claim:=trip_support_private.typed_claim(basis,case basis->'payload'->'assertion'->>'predicate' when 'located_at' then 'address_reference' when 'opens_during' then 'opening_window_reference' end);if claim is null then continue;end if;
  all_rows:=all_rows||jsonb_build_array(jsonb_build_object('mappingId',m.id,'mappingVersion',m.version,'mappingDigest',m.request_digest,'statementId',m.statement_id,'claimRevision',m.claim_revision,'payloadHash',m.payload_hash,'sourceDigest',m.source_digest,'scope',case claim->>'claimType' when 'address' then 'address_reference' else 'opening_window_reference' end,'claim',claim));
 end loop;
 context:=trip_support_private.hash(jsonb_build_object('ownerId',u,'sessionId',auth.jwt()->>'session_id','tripId',t.id,'tripVersion',t.head_version,'placeReferenceId',r.id,'canonicalPoiId',r.canonical_poi_id,'city',p_city,'scene',p_scene,'locale',p_locale,'rows',all_rows));
 if p_cursor is not null then
  if not knowledge_review_private.closed_object(p_cursor,array['contextDigest','afterMappingId']) or p_cursor->>'contextDigest' is distinct from context or not exists(select 1 from jsonb_array_elements(all_rows) x where x->>'mappingId'=p_cursor->>'afterMappingId') then return jsonb_build_object('kind','stale');end if;after_id:=p_cursor->>'afterMappingId';
 end if;
 select coalesce(jsonb_agg(x order by x->>'mappingId'),'[]'::jsonb) into page from(select value x from jsonb_array_elements(all_rows) a(value) where after_id is null or value->>'mappingId'>after_id order by value->>'mappingId' limit p_limit) q;
 select x->>'mappingId' into next_id from jsonb_array_elements(page) x order by x->>'mappingId' desc limit 1;has_more:=next_id is not null and exists(select 1 from jsonb_array_elements(all_rows) x where x->>'mappingId'>next_id);
 return jsonb_build_object('kind','candidates','tripId',t.id,'tripVersion',t.head_version,'placeReferenceId',r.id,'contextDigest',context,'entries',page,'nextCursor',case when has_more then jsonb_build_object('contextDigest',context,'afterMappingId',next_id) else null end);
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
create function public.read_supported_trip_confirmation_receipt_v1(p_idempotency_key text,p_proposal_id uuid,p_proposal_digest text,p_support_selection jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=trip_support_private.owner();r trip_support_private.confirmation_receipts%rowtype;
begin
 if jsonb_typeof(p_support_selection) is distinct from 'array' or jsonb_array_length(p_support_selection) not between 1 and 8 or exists(select 1 from jsonb_array_elements(p_support_selection) x where not knowledge_review_private.closed_object(x,array['receiptId','version','sourceDigest'])) or (select count(distinct x->>'receiptId') from jsonb_array_elements(p_support_selection) x)<>jsonb_array_length(p_support_selection) then return jsonb_build_object('kind','blocked');end if;
 select * into r from trip_support_private.confirmation_receipts where owner_id=u and idempotency_key=p_idempotency_key and proposal_id=p_proposal_id;
 if not found or r.proposal_digest is distinct from p_proposal_digest or r.selection_digest is distinct from trip_support_private.hash(p_support_selection) or not exists(select 1 from public.trips where id=r.trip_id and owner_id=u) then return jsonb_build_object('kind','blocked');end if;
 return jsonb_build_object('kind','confirmation_receipt','receipt',r.receipt,'historicalOnly',true,'currentEligibilityRequiresRead',true);
end $$;
revoke all on function public.read_trip_item_support_candidates_v1(uuid,integer,uuid,text,text,text,jsonb,integer),public.read_supported_trip_confirmation_receipt_v1(text,uuid,text,jsonb) from public,anon,authenticated,service_role;

create function public.read_trip_item_support_context_v1(p_trip uuid,p_expected_trip_version integer,p_proposal uuid,p_expected_proposal_revision integer,p_day text,p_item text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=trip_support_private.owner();t public.trips%rowtype;p public.trip_proposals%rowtype;content jsonb;item jsonb;digest text;refs jsonb;count_refs integer;
begin
 if p_day is null or p_item is null or p_day !~ '^[A-Za-z0-9_-]{1,64}$' or p_item !~ '^[A-Za-z0-9_-]{1,64}$' then return jsonb_build_object('kind','blocked');end if;
 select * into t from public.trips where id=p_trip and owner_id=u for share nowait;if not found then return jsonb_build_object('kind','blocked');end if;
 select * into p from public.trip_proposals where id=p_proposal and trip_id=t.id and owner_id=u for share nowait;
 if not found or t.head_version is distinct from p_expected_trip_version or p.revision is distinct from p_expected_proposal_revision or p.base_trip_version<>t.head_version or p.status<>'pending' or p.expires_at<=clock_timestamp() then return jsonb_build_object('kind','stale');end if;
 select r.digest into digest from public.read_trip_proposal_v2(p.id) r;
 if p.rollback_snapshot_version is not null then select s.content into content from public.trip_version_snapshots s where s.trip_id=t.id and s.version=p.rollback_snapshot_version;
 else content:=public.apply_trip_content_patch(public.trip_content_snapshot(t.id,t.title),p.patch);end if;
 item:=trip_support_private.item(content,p_day,p_item);if item is null then return jsonb_build_object('kind','blocked');end if;
 select count(*) into count_refs from(select id from public.trip_place_references where trip_id=t.id and owner_id=u and reference_kind='canonical' order by id limit 101) x;
 if count_refs>100 then return jsonb_build_object('kind','unavailable','reason','capacity');end if;
 select coalesce(jsonb_agg(jsonb_build_object('referenceId',r.id,'canonicalPoiId',r.canonical_poi_id,'display',jsonb_build_object('en',poi.primary_name_en,'zh',poi.primary_name_zh)) order by r.id),'[]'::jsonb) into refs from public.trip_place_references r join public.canonical_pois poi on poi.id=r.canonical_poi_id where r.trip_id=t.id and r.owner_id=u and r.reference_kind='canonical';
 return jsonb_build_object('kind','support_context','tripId',t.id,'tripVersion',t.head_version,'proposalId',p.id,'proposalRevision',p.revision,'baseVersion',p.base_trip_version,'proposalDigest',digest,'itemDigest',trip_support_private.hash(item),'dayId',p_day,'itemId',p_item,'canonicalPlaceReferences',refs);
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
revoke all on function public.read_trip_item_support_context_v1(uuid,integer,uuid,integer,text,text) from public,anon,authenticated,service_role;

-- New private support identifiers in reviewed graphs follow real support/Trip
-- deletion; bounded NOWAIT lock conflicts abort for retry, never skip cleanup.
create function trip_support_private.clear_deleted_support_impact() returns trigger language plpgsql security definer set search_path='' as $$
declare setrow knowledge_review_private.source_impact_sets%rowtype;graph jsonb;
begin
 for setrow in select * from knowledge_review_private.source_impact_sets where exists(select 1 from jsonb_array_elements(graph_snapshot) x where x->'target'->>'kind'='trip_item_support' and x->'target'->>'id'=OLD.id::text) order by id for update nowait loop
  perform 1 from knowledge_review_private.source_impact_outbox o join knowledge_review_private.source_impact_items i on i.id=o.item_id where o.set_id=setrow.id and i.target->>'kind'='trip_item_support' and i.target->>'id'=OLD.id::text order by o.id for update of o nowait;
  delete from knowledge_review_private.source_impact_review_requests r using knowledge_review_private.source_impact_outbox o,knowledge_review_private.source_impact_items i where r.delivery_id=o.id and o.item_id=i.id and o.set_id=setrow.id and i.target->>'id'=OLD.id::text and i.target->>'kind'='trip_item_support';
  delete from knowledge_review_private.source_impact_projections p using knowledge_review_private.source_impact_outbox o,knowledge_review_private.source_impact_items i where p.delivery_id=o.id and o.item_id=i.id and o.set_id=setrow.id and i.target->>'id'=OLD.id::text and i.target->>'kind'='trip_item_support';
  delete from knowledge_review_private.source_impact_outbox o using knowledge_review_private.source_impact_items i where o.item_id=i.id and o.set_id=setrow.id and i.target->>'kind'='trip_item_support' and i.target->>'id'=OLD.id::text;
  delete from knowledge_review_private.source_impact_items where set_id=setrow.id and target->>'kind'='trip_item_support' and target->>'id'=OLD.id::text;
  delete from knowledge_review_private.source_impact_pages where set_id=setrow.id;
  select coalesce(jsonb_agg(x order by x->>'key'),'[]'::jsonb) into graph from jsonb_array_elements(setrow.graph_snapshot) x where not(x->'target'->>'kind'='trip_item_support' and x->'target'->>'id'=OLD.id::text);
  update knowledge_review_private.source_impact_sets set graph_snapshot=graph,digest=knowledge_review_private.impact_hash(jsonb_build_object('source',source_snapshot,'kind',signal_kind,'graph',graph)),version=version+1,status='invalidated',complete=false,next_cursor=null,item_count=(select count(*) from knowledge_review_private.source_impact_items where set_id=setrow.id) where id=setrow.id;
  update knowledge_review_private.source_impact_outbox set state='stale',lease_token=null,expires_at=null,error_code='private_support_removed' where set_id=setrow.id and state<>'acked';
 end loop;return null;
end $$;
create trigger clear_source_impact_support_after_delete after delete on trip_support_private.item_supports for each row execute function trip_support_private.clear_deleted_support_impact();
revoke all on function trip_support_private.clear_deleted_support_impact() from public,anon,authenticated,service_role;
