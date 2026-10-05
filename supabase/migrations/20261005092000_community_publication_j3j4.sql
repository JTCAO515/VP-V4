-- #235 J3 / #238 J4: controlled registered readers only; no public activation.
-- Operational rollback disables settings; terminal denial fences remain retained.
create schema community_publication_private;
revoke all on schema community_publication_private from public,anon,authenticated,service_role;
create table community_publication_private.settings(singleton boolean primary key default true check(singleton),enabled boolean not null default false);
insert into community_publication_private.settings(singleton) values(true);
create table community_publication_private.qualifications(
 actor_id uuid primary key references auth.users(id) on delete cascade,
 rights_reviewer boolean not null default false,publisher boolean not null default false
);
create table community_publication_private.publications(
 id uuid primary key,owner_id uuid references auth.users(id) on delete set null,submission_id uuid not null,
 submission_version integer not null check(submission_version>0),safety_version integer not null check(safety_version>=0),
 version integer not null default 1 check(version>0),state text not null default 'pending_rights'
 check(state in('pending_rights','rights_approved','rights_rejected','published','withdrawn','revoked','invalidated','erased')),
 preview_digest text check(preview_digest ~ '^[a-f0-9]{64}$'),consent text check(consent='controlled-preview-v1'),
 rights_declaration text check(rights_declaration='own-text-v1'),rights_note text check(rights_note is null or community_private.text_j1(to_jsonb(rights_note),400)),
 rights_actor uuid references auth.users(id) on delete set null,publisher_actor uuid references auth.users(id) on delete set null,
 j1_reviewer_fence text not null,rights_fence text,publisher_fence text,
 created_at timestamptz not null default clock_timestamp(),published_at timestamptz,ended_at timestamptz,
 check(state<>'published' or (published_at is not null and ended_at is null)),
 check(state not in('withdrawn','revoked','invalidated','erased') or ended_at is not null),
 check(state<>'erased' or (preview_digest is null and consent is null and rights_declaration is null and rights_note is null))
);
create table community_publication_private.references(
 id uuid primary key,owner_id uuid references auth.users(id) on delete set null,publication_id uuid,
 submission_version integer not null check(submission_version>0),safety_version integer not null check(safety_version>=0),publication_version integer not null check(publication_version>0),
 version integer not null default 1,state text not null default 'saved' check(state in('saved','unsaved','erased')),
 created_at timestamptz not null default clock_timestamp(),ended_at timestamptz,
 check((state='saved' and version=1 and ended_at is null) or (state<>'saved' and version>=2 and ended_at is not null)),
 check(state<>'erased' or publication_id is null)
);
create table community_publication_private.rights_reviews(
 id uuid primary key,actor_id uuid not null references auth.users(id) on delete cascade,publication_id uuid not null,
 decision text not null check(decision in('approve','reject')),note text check(note is null or community_private.text_j1(to_jsonb(note),400)),
 created_at timestamptz not null default clock_timestamp()
);
create table community_publication_private.operations(
 owner_id uuid not null references auth.users(id) on delete cascade,operation_id uuid not null,session_id uuid not null,session_epoch bigint not null,
 input_digest text not null check(input_digest ~ '^[a-f0-9]{64}$'),
 action text not null check(action in('requestPublication','rightsReview','publish','withdraw','revoke','save','unsave','delete')),
 record_id uuid,state text not null check(state in('committed','abandoned')),created_at timestamptz not null default clock_timestamp(),primary key(owner_id,operation_id)
);
create table community_publication_private.audit(
 id bigint generated always as identity primary key,actor_id uuid references auth.users(id) on delete set null,record_id uuid,
 action text not null check(action in('requestPublication','rightsReview','publish','withdraw','revoke','save','unsave','delete')),
 created_at timestamptz not null default clock_timestamp()
);
create index publication_source on community_publication_private.publications(submission_id,id);
create index publication_owner on community_publication_private.publications(owner_id,id);
create index publication_rights_actor on community_publication_private.publications(rights_actor,id);
create index publication_publisher_actor on community_publication_private.publications(publisher_actor,id);
create index publication_pending on community_publication_private.publications(id) where state in('pending_rights','rights_approved');
create index publication_reference_owner on community_publication_private.references(owner_id,id);
create index publication_reference_source on community_publication_private.references(publication_id,id);
create index publication_review_actor on community_publication_private.rights_reviews(actor_id,id);
create index publication_audit_actor on community_publication_private.audit(actor_id,id);
do $$declare t record;begin for t in select tablename from pg_tables where schemaname='community_publication_private' loop execute format('alter table community_publication_private.%I enable row level security',t.tablename);end loop;end $$;
revoke all on all tables in schema community_publication_private from public,anon,authenticated,service_role;
revoke all on all sequences in schema community_publication_private from public,anon,authenticated,service_role;

create function community_publication_private.terminal(s text) returns boolean language sql immutable set search_path='' as $$select s in('rights_rejected','withdrawn','revoked','invalidated','erased')$$;
create function community_publication_private.valid(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare a text:=v->>'action';o jsonb;common text[]:=array['action','operationId','publicationId','expectedSubmissionVersion','expectedSafetyVersion'];begin
 if a in('session','export') then return community_private.exact_j1(v,array['action']);end if;
 if a in('mine','queue','saved') then return community_private.exact_j1(v,array['action','cursor']) and (v->'cursor'='null' or community_private.uuid_j1(v->'cursor'));end if;
 if a='list' then return community_private.exact_j1(v,array['action','cursor','query']) and (v->'cursor'='null' or community_private.uuid_j1(v->'cursor')) and community_private.text_j1(v->'query',160,true);end if;
 if a='preview' then return community_private.exact_j1(v,array['action','submissionId']) and community_private.uuid_j1(v->'submissionId');end if;
 if a in('detail','inspect') then return community_private.exact_j1(v,array['action','publicationId']) and community_private.uuid_j1(v->'publicationId');end if;
 if a='reference' then return community_private.exact_j1(v,array['action','referenceId']) and community_private.uuid_j1(v->'referenceId');end if;
 if community_private.uuid_j1(v->'operationId') is not true then return false;end if;
 if a in('operation','abandon') then
 if community_private.exact_j1(v,array['action','operationId','mutationBytes']) is not true or community_private.text_j1(v->'mutationBytes',10000) is not true or octet_length(v->>'mutationBytes')>24000 then return false;end if;
 begin o:=(v->>'mutationBytes')::jsonb;exception when others then return false;end;
 return o->>'action' in('requestPublication','rightsReview','publish','withdraw','revoke','save','unsave','delete') and o->'operationId'=v->'operationId' and community_publication_private.valid(o);end if;
 if a='delete' then return community_private.exact_j1(v,array['action','operationId','confirmed']) and v->'confirmed'='true';end if;
 if a='unsave' then return community_private.exact_j1(v,array['action','operationId','referenceId','expectedReferenceVersion']) and community_private.uuid_j1(v->'referenceId') and v->'expectedReferenceVersion'='1';end if;
 if community_private.uuid_j1(v->'publicationId') is not true then return false;end if;
 if a in('withdraw','revoke') then return community_private.exact_j1(v,array['action','operationId','publicationId','expectedPublicationVersion']) and place_actions_private.revision_v1(v->'expectedPublicationVersion') and v->'expectedPublicationVersion'<>'0';end if;
 if place_actions_private.revision_v1(v->'expectedSubmissionVersion') is not true or v->'expectedSubmissionVersion'='0' or place_actions_private.revision_v1(v->'expectedSafetyVersion') is not true then return false;end if;
 if a='requestPublication' then return community_private.exact_j1(v,common||array['submissionId','previewDigest','consent','rightsDeclaration']) and community_private.uuid_j1(v->'submissionId') and jsonb_typeof(v->'previewDigest')='string' and v->>'previewDigest' ~ '^[a-f0-9]{64}$' and v->>'consent'='controlled-preview-v1' and v->>'rightsDeclaration'='own-text-v1';end if;
 if place_actions_private.revision_v1(v->'expectedPublicationVersion') is not true or v->'expectedPublicationVersion'='0' then return false;end if;
 if a='rightsReview' then return community_private.exact_j1(v,common||array['expectedPublicationVersion','decision','note']) and v->>'decision' in('approve','reject') and community_private.text_j1(v->'note',400);end if;
 if a='publish' then return community_private.exact_j1(v,common||array['expectedPublicationVersion']);end if;
 return a='save' and community_private.exact_j1(v,common||array['expectedPublicationVersion','referenceId']) and community_private.uuid_j1(v->'referenceId');
end $$;
create function community_publication_private.qualified(u uuid,role_name text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform 1 from community_publication_private.qualifications where actor_id=u and case role_name when 'rights' then rights_reviewer when 'publisher' then publisher else rights_reviewer or publisher end for share nowait;return found;
end $$;
-- The actor qualification conveys no source-preview authority. Use lawful J2 reader separately.
create function community_publication_private.independent(u uuid,pid uuid,role_name text) returns boolean language plpgsql security definer set search_path='' as $$
declare p community_publication_private.publications%rowtype;begin
 if not community_publication_private.qualified(u,role_name) then return false;end if;
 select * into p from community_publication_private.publications where id=pid;
 if p.id is null or p.owner_id=u or community_safety_private.fence(u)=p.j1_reviewer_fence then return false;end if;
 if role_name='publisher' and community_safety_private.fence(u)=p.rights_fence then return false;end if;
 return community_safety_private.object_allowed(u,p.submission_id);
end $$;
create function community_publication_private.source_current(pid uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare p community_publication_private.publications%rowtype;c community_private.submissions%rowtype;st community_safety_private.states%rowtype;begin
 select * into p from community_publication_private.publications where id=pid;if p.id is null or community_publication_private.terminal(p.state) then return false;end if;
 select * into c from community_private.submissions where id=p.submission_id for share nowait;
 select * into st from community_safety_private.states where submission_id=p.submission_id for share nowait;
 return c.id is not null and c.status='published' and c.version=p.submission_version and c.content_kind in('experience','help') and not c.review_anonymized and c.reviewer_id is not null
 and st.submission_id is not null and st.j1_status='published' and not st.removed and st.safety_version=p.safety_version
 and st.j1_operator_fence=p.j1_reviewer_fence and p.consent='controlled-preview-v1' and p.rights_declaration='own-text-v1';
end $$;
create function community_publication_private.eligible(u uuid,pid uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare p community_publication_private.publications%rowtype;begin
 perform 1 from community_publication_private.settings where singleton and enabled for share nowait;if not found then return false;end if;
 if community_publication_private.source_current(pid) is not true then return false;end if;
 select * into p from community_publication_private.publications where id=pid for share nowait;
 return p.state='published' and p.rights_note is not null and p.rights_actor is not null and p.publisher_actor is not null
 and community_publication_private.qualified(p.rights_actor,'rights') and community_publication_private.qualified(p.publisher_actor,'publisher')
 and community_safety_private.object_allowed(u,p.submission_id);
end $$;
create function community_publication_private.preview_digest(u uuid,cid uuid) returns text language plpgsql security definer set search_path='' as $$
declare o jsonb;begin
 o:=community_safety_private.object_json(u,cid)-'expiresAt';
 return encode(sha256(convert_to((o||jsonb_build_object('audience','controlled_registered','purpose','controlled_experience_display','declarationPolicy','own-text-v1','consent','controlled-preview-v1'))::text,'UTF8')),'hex');
end $$;
create function community_publication_private.record_json(pid uuid) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare p community_publication_private.publications%rowtype;begin
 select * into p from community_publication_private.publications where id=pid;if not found then raise exception 'PUBLICATION_NOT_FOUND';end if;
 return jsonb_build_object('id',p.id,'submissionId',p.submission_id,'submissionVersion',p.submission_version,'safetyVersion',p.safety_version,'version',p.version,'state',p.state,'rightsDeclaration',p.rights_declaration,'rightsNote',p.rights_note,'createdAt',p.created_at,'publishedAt',p.published_at,'endedAt',p.ended_at,'audience','controlled_registered','publiclyVisible',false,'retrievalEligible',false);
end $$;
create function community_publication_private.experience_json(u uuid,pid uuid) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare p community_publication_private.publications%rowtype;o jsonb;j jsonb;place jsonb;begin
 if community_publication_private.eligible(u,pid) is not true then raise exception 'PUBLICATION_NOT_FOUND';end if;
 select * into p from community_publication_private.publications where id=pid;
 o:=community_safety_private.object_json(u,p.submission_id);
 -- Reuse original saved mapping authority. Never expose private Trip/reference IDs.
 j:=community_safety_private.retained_item_j1(p.submission_id)->'place';
 if j is not null and j<>'null'::jsonb and j->>'label' is not null then place:=jsonb_build_object('canonicalPoiId',j->'canonicalPoiId','mappingDigest',j->'mappingDigest','label',j->'label');end if;
 return (o-'id'-'visibility'-'copyright')||jsonb_build_object('id',p.id,'submissionId',p.submission_id,'publicationVersion',p.version,'copyright','author_declared_own_text_independently_reviewed','rightsPurpose','controlled_experience_display','audience','controlled_registered','place',place);
end $$;
create function community_publication_private.reference_json(u uuid,rid uuid,display boolean default true) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare r community_publication_private.references%rowtype;p community_publication_private.publications%rowtype;e jsonb;begin
 select * into r from community_publication_private.references where id=rid and owner_id=u;if not found then raise exception 'PUBLICATION_NOT_FOUND';end if;
 select * into p from community_publication_private.publications where id=r.publication_id;
 perform 1 from community_private.submissions where id=p.submission_id for share nowait;
 perform 1 from community_safety_private.states where submission_id=p.submission_id for share nowait;
 select * into p from community_publication_private.publications where id=r.publication_id for share nowait;
 select * into r from community_publication_private.references where id=rid and owner_id=u for share nowait;
 if display and r.state='saved' and p.version=r.publication_version and p.submission_version=r.submission_version and p.safety_version=r.safety_version and community_publication_private.eligible(u,p.id) then e:=community_publication_private.experience_json(u,p.id);end if;
 return jsonb_build_object('id',r.id,'publicationId',r.publication_id,'submissionVersion',r.submission_version,'safetyVersion',r.safety_version,'publicationVersion',r.publication_version,'version',r.version,'state',r.state,'availability',case when e is null then 'unavailable' else 'current' end,'experience',e,'createdAt',r.created_at,'endedAt',r.ended_at);
end $$;

-- No old publication can become live after any terminal frontier, even restoration.
create function community_publication_private.no_revive() returns trigger language plpgsql set search_path='' as $$
begin
 if community_publication_private.terminal(old.state) and new.state is distinct from old.state and new.state<>'erased' then raise exception 'PUBLICATION_CONFLICT';end if;
 return new;
end $$;
create trigger publication_terminal before update on community_publication_private.publications for each row execute function community_publication_private.no_revive();
create function community_publication_private.invalidate_source(cid uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from community_publication_private.publications where submission_id=cid order by id for update nowait;
 update community_publication_private.publications set state='invalidated',version=version+1,ended_at=clock_timestamp() where submission_id=cid and not community_publication_private.terminal(state);
end $$;
create function community_publication_private.source_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then perform community_publication_private.invalidate_source(old.id);return old;end if;
 if new.version is distinct from old.version or new.status is distinct from old.status or new.reviewer_id is distinct from old.reviewer_id or new.review_anonymized is distinct from old.review_anonymized
 or new.title is distinct from old.title or new.content is distinct from old.content or new.benefit_disclosure is distinct from old.benefit_disclosure or new.content_kind is distinct from old.content_kind or new.place_binding is distinct from old.place_binding then perform community_publication_private.invalidate_source(new.id);end if;
 return new;
end $$;
-- BEFORE physical source deletion keeps source->safety->publication lock order.
create function community_publication_private.source_deleting() returns trigger language plpgsql security definer set search_path='' as $$
begin perform 1 from community_safety_private.states where submission_id=old.id for update nowait;perform community_publication_private.invalidate_source(old.id);return old;end $$;
create trigger publication_source_delete before delete on community_private.submissions for each row execute function community_publication_private.source_deleting();
create trigger publication_source_change after update on community_private.submissions for each row execute function community_publication_private.source_changed();
create function community_publication_private.safety_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then perform community_publication_private.invalidate_source(old.submission_id);return old;end if;
 if new.submission_version is distinct from old.submission_version or new.j1_status is distinct from old.j1_status or new.safety_version is distinct from old.safety_version or new.removed is distinct from old.removed or new.j1_operator_fence is distinct from old.j1_operator_fence then perform community_publication_private.invalidate_source(new.submission_id);end if;return new;
end $$;
create trigger publication_safety_change after update or delete on community_safety_private.states for each row execute function community_publication_private.safety_changed();
create function community_publication_private.invalidate_actor(u uuid,rights_lost boolean,publisher_lost boolean,j1_lost boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare cid uuid;begin
 for cid in select distinct submission_id from community_publication_private.publications where rights_lost and rights_actor=u or publisher_lost and publisher_actor=u or j1_lost and j1_reviewer_fence=community_safety_private.fence(u) order by submission_id loop
 perform 1 from community_private.submissions where id=cid for update nowait;
 perform 1 from community_safety_private.states where submission_id=cid for update nowait;
 perform community_publication_private.invalidate_source(cid);
 end loop;
end $$;
create function community_publication_private.qualification_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then perform community_publication_private.invalidate_actor(old.actor_id,old.rights_reviewer,old.publisher);return old;end if;
 perform community_publication_private.invalidate_actor(old.actor_id,old.rights_reviewer and not new.rights_reviewer,old.publisher and not new.publisher);return new;
end $$;
create trigger publication_qualification_change before update or delete on community_publication_private.qualifications for each row execute function community_publication_private.qualification_changed();
create function community_publication_private.j1_qualification_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' or old.active and not new.active then perform community_publication_private.invalidate_actor(old.actor_id,false,false,true);end if;
 if TG_OP='DELETE' then return old;end if;return new;
end $$;
create trigger publication_j1_qualification_change before update or delete on community_private.reviewers for each row execute function community_publication_private.j1_qualification_changed();
-- Trusted disclosure is part of the author's exact preview consent.
create function community_publication_private.disclosure_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare u uuid;cid uuid;begin
 if TG_OP='UPDATE' and new.disclosure is not distinct from old.disclosure then return new;end if;
 if TG_OP='DELETE' then u:=old.actor_id;else u:=new.actor_id;end if;
 for cid in select id from community_private.submissions where author_id=u or reviewer_id=u order by id loop
 perform 1 from community_private.submissions where id=cid for update nowait;
 perform 1 from community_safety_private.states where submission_id=cid for update nowait;
 perform community_publication_private.invalidate_source(cid);
 end loop;
 if TG_OP='DELETE' then return old;end if;return new;
end $$;
create trigger publication_disclosure_change after insert or update or delete on community_private.disclosures_j1 for each row execute function community_publication_private.disclosure_changed();
create function community_publication_private.review_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare cid uuid;begin
 select submission_id into cid from community_publication_private.publications where id=old.publication_id;
 perform 1 from community_private.submissions where id=cid for update nowait;
 perform 1 from community_safety_private.states where submission_id=cid for update nowait;
 perform community_publication_private.invalidate_source(cid);
 if TG_OP='DELETE' then return old;end if;return new;
end $$;
create trigger publication_review_change before update or delete on community_publication_private.rights_reviews for each row execute function community_publication_private.review_changed();
create function community_publication_private.erase(u uuid) returns void language plpgsql security definer set search_path='' as $$
declare cid uuid;begin
 -- Caller already holds actor/account/session authority; account hook holds root deletion.
 for cid in select distinct submission_id from community_publication_private.publications where owner_id=u or rights_actor=u or publisher_actor=u order by submission_id loop
 perform 1 from community_private.submissions where id=cid for update nowait;
 perform 1 from community_safety_private.states where submission_id=cid for update nowait;
 perform community_publication_private.invalidate_source(cid);
 end loop;
 perform 1 from community_publication_private.publications where owner_id=u or rights_actor=u or publisher_actor=u order by id for update nowait;
 update community_publication_private.publications set state='erased',version=version+1,preview_digest=null,consent=null,rights_declaration=null,rights_note=null,rights_actor=null,publisher_actor=null,ended_at=coalesce(ended_at,clock_timestamp()) where owner_id=u and state<>'erased';
 update community_publication_private.publications set rights_actor=null,rights_note=null where rights_actor=u;
 update community_publication_private.publications set publisher_actor=null where publisher_actor=u;
 perform 1 from community_publication_private.references where owner_id=u order by id for update nowait;
 update community_publication_private.references set state='erased',version=greatest(version,2),publication_id=null,ended_at=coalesce(ended_at,clock_timestamp()) where owner_id=u;
 delete from community_publication_private.rights_reviews where actor_id=u;
 delete from community_publication_private.qualifications where actor_id=u;
 update community_publication_private.audit set actor_id=null where actor_id=u;
 -- Digest/session fences retain only idempotency denial; no mutation bytes or body snapshots.
end $$;
create function community_publication_private.account_erasure() returns trigger language plpgsql security definer set search_path='' as $$
begin perform community_publication_private.erase(old.id);return old;end $$;
create trigger community_publication_account_erasure before delete on auth.users for each row execute function community_publication_private.account_erasure();
create function community_publication_private.retained() returns jsonb language sql immutable set search_path='' as $$select jsonb_build_array('operation_fences','publication_tombstones','reference_tombstones','audit_metadata')$$;
create function community_publication_private.export_json(u uuid) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
begin
 if (select count(*) from (select 1 from community_publication_private.publications where owner_id=u limit 101) b)>100
 or (select count(*) from (select 1 from community_publication_private.references where owner_id=u limit 101) b)>100
 or (select count(*) from (select 1 from community_publication_private.rights_reviews where actor_id=u limit 101) b)>100
 or (select count(*) from (select 1 from community_publication_private.operations where owner_id=u limit 101) b)>100
 or (select count(*) from (select 1 from community_publication_private.audit where actor_id=u limit 101) b)>100 then raise exception 'PUBLICATION_CAPACITY';end if;
 return jsonb_build_object('scope','community_publication_module','coverage','complete_for_community_publication',
 'publications',coalesce((select jsonb_agg(community_publication_private.record_json(id) order by id) from community_publication_private.publications where owner_id=u),'[]'),
 'references',coalesce((select jsonb_agg(community_publication_private.reference_json(u,id,false) order by id) from community_publication_private.references where owner_id=u),'[]'),
 'authoredRightsReviews',coalesce((select jsonb_agg(jsonb_build_object('publicationId',publication_id,'decision',decision,'note',note,'createdAt',created_at) order by id) from community_publication_private.rights_reviews where actor_id=u),'[]'),
 'receipts',coalesce((select jsonb_agg(jsonb_build_object('operationId',operation_id,'recordId',record_id,'action',action,'state',state,'digest',input_digest) order by operation_id) from community_publication_private.operations where owner_id=u),'[]'),
 'audits',coalesce((select jsonb_agg(jsonb_build_object('recordId',record_id,'action',action,'createdAt',created_at) order by id) from community_publication_private.audit where actor_id=u),'[]'),
 'qualification',(select jsonb_build_object('rightsReviewer',rights_reviewer,'publisher',publisher) from community_publication_private.qualifications where actor_id=u),
 'retained',community_publication_private.retained());
end $$;
create function community_publication_private.workspace(envelope jsonb) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare u uuid;s uuid;epoch bigint;v jsonb;a text;o jsonb;oa text;raw text;digest text;op uuid;pid uuid;rid uuid;cid uuid;internal boolean;
 p community_publication_private.publications%rowtype;r community_publication_private.references%rowtype;receipt community_publication_private.operations%rowtype;
 c community_private.submissions%rowtype;st community_safety_private.states%rowtype;base jsonb;out jsonb;pub jsonb;ref jsonb;ids uuid[];j jsonb;begin
 -- ORIGINAL admission only, before reads, recovery, erasure or any other effect.
 u:=community_private.actor_j1();s:=(auth.jwt()->>'session_id')::uuid;
 select coalesce((select x.epoch from identity_private.mobile_accounts x where x.owner_id=u),0) into epoch;
 if community_private.exact_j1(envelope,array['protocol','command','mutationBytes']) is not true or envelope->>'protocol' is distinct from 'community-publication-j3j4/1' or community_publication_private.valid(envelope->'command') is not true then raise exception 'INVALID_INPUT';end if;
 v:=envelope->'command';a:=v->>'action';base:=jsonb_build_object('schemaVersion','community-publication-j3j4/1','actorId',u,'sessionId',s);
 o:=case when a in('operation','abandon') then (v->>'mutationBytes')::jsonb else v end;oa:=o->>'action';
 if a in('requestPublication','rightsReview','publish','withdraw','revoke','save','unsave','delete') then
 if community_private.text_j1(envelope->'mutationBytes',10000) is not true or octet_length(envelope->>'mutationBytes')>24000 then raise exception 'INVALID_INPUT';end if;
 raw:=envelope->>'mutationBytes';begin if raw::jsonb is distinct from v then raise exception 'INVALID_INPUT';end if;exception when others then raise exception 'INVALID_INPUT';end;
 else
 if envelope->'mutationBytes' is distinct from 'null'::jsonb then raise exception 'INVALID_INPUT';end if;
 raw:=case when a in('operation','abandon') then v->>'mutationBytes' else null end;
 end if;
 internal:=a='queue' or oa in('rightsReview','publish','revoke') or a='inspect' and not exists(select 1 from community_publication_private.publications where id=(v->>'publicationId')::uuid and owner_id=u);
 if internal and community_publication_private.qualified(u,case when oa='rightsReview' then 'rights' when oa in('publish','revoke') then 'publisher' else 'either' end) is not true then raise exception 'PUBLICATION_FORBIDDEN';end if;
 if a in('preview','list','detail','requestPublication','rightsReview','publish','save','queue','inspect') or internal then
 perform 1 from community_publication_private.settings where singleton and enabled for share nowait;if not found then raise exception 'PUBLICATION_DISABLED';end if;end if;
 if a='session' then return base||jsonb_build_object('kind','session');end if;
 if a='export' then return base||jsonb_build_object('kind','export')||community_publication_private.export_json(u);end if;
 if a='preview' then
 cid:=(v->>'submissionId')::uuid;
 select * into c from community_private.submissions where id=cid and author_id=u for share nowait;
 if c.id is null or c.status<>'published' or c.review_anonymized or c.reviewer_id is null or c.content_kind not in('experience','help') or community_safety_private.object_allowed(u,cid) is not true then raise exception 'PUBLICATION_NOT_FOUND';end if;
 j:=community_safety_private.object_json(u,cid);
 return base||jsonb_build_object('kind','preview','preview',jsonb_build_object('object',j,'previewDigest',community_publication_private.preview_digest(u,cid),'audience','controlled_registered','rightsDeclarationRequired','own-text-v1','expiresAt',j->'expiresAt'));end if;
 if a='detail' then return base||jsonb_build_object('kind','detail','experience',community_publication_private.experience_json(u,(v->>'publicationId')::uuid));end if;
 if a='inspect' then
 pid:=(v->>'publicationId')::uuid;
 if not exists(select 1 from community_publication_private.publications where id=pid and owner_id=u) and community_publication_private.independent(u,pid,'either') is not true then raise exception 'PUBLICATION_NOT_FOUND';end if;
 return base||jsonb_build_object('kind','publication','publication',community_publication_private.record_json(pid));end if;
 if a='reference' then return base||jsonb_build_object('kind','reference','reference',community_publication_private.reference_json(u,(v->>'referenceId')::uuid));end if;
 if a in('list','mine','queue','saved') then
 if a='saved' then select array_agg(id order by id) into ids from (select id from community_publication_private.references where owner_id=u and (v->'cursor'='null' or id>(v->>'cursor')::uuid) order by id limit 51) z;
 select coalesce(jsonb_agg(community_publication_private.reference_json(u,x) order by x),'[]') into out from unnest(ids[1:50]) x;
 return base||jsonb_build_object('kind','saved','references',out,'nextCursor',case when cardinality(ids)>50 then ids[50] else null end,'complete',coalesce(cardinality(ids),0)<=50);end if;
 select array_agg(id order by id) into ids from (select pubrow.id from community_publication_private.publications pubrow where (v->'cursor'='null' or pubrow.id>(v->>'cursor')::uuid)
 and (a='mine' and pubrow.owner_id=u or a='queue' and pubrow.state in('pending_rights','rights_approved') and community_publication_private.independent(u,pubrow.id,case pubrow.state when 'pending_rights' then 'rights' else 'publisher' end)
 or a='list' and community_publication_private.eligible(u,pubrow.id) and exists(select 1 from community_private.submissions sourcerow where sourcerow.id=pubrow.submission_id and (v->>'query'='' or strpos(lower(sourcerow.title||' '||sourcerow.content),lower(v->>'query'))>0))) order by pubrow.id limit 51) z;
 if a='list' then select coalesce(jsonb_agg(community_publication_private.experience_json(u,x) order by x),'[]') into out from unnest(ids[1:50]) x;
 else select coalesce(jsonb_agg(community_publication_private.record_json(x) order by x),'[]') into out from unnest(ids[1:50]) x;end if;
 return base||jsonb_build_object('kind',case when a='list' then 'list' else 'publications' end,case when a='list' then 'experiences' else 'publications' end,out,'nextCursor',case when cardinality(ids)>50 then ids[50] else null end,'complete',coalesce(cardinality(ids),0)<=50);end if;
 op:=(v->>'operationId')::uuid;pid:=(o->>'publicationId')::uuid;rid:=(o->>'referenceId')::uuid;
 if oa='requestPublication' then cid:=(o->>'submissionId')::uuid;
 elsif oa='unsave' then
 select * into r from community_publication_private.references where id=rid and owner_id=u;if r.id is null then raise exception 'PUBLICATION_NOT_FOUND';end if;
 pid:=r.publication_id;select submission_id into cid from community_publication_private.publications where id=pid;
 else select submission_id into cid from community_publication_private.publications where id=pid;end if;
 -- Source before safety before publication/reference before operation fences.
 if cid is not null then select * into c from community_private.submissions where id=cid for update nowait;select * into st from community_safety_private.states where submission_id=cid for update nowait;end if;
 if pid is not null then select * into p from community_publication_private.publications where id=pid for update nowait;end if;
 if oa='requestPublication' then
 if c.id is null or c.author_id<>u or community_safety_private.object_allowed(u,cid) is not true then raise exception 'PUBLICATION_NOT_FOUND';end if;
 if p.id is not null and p.owner_id is distinct from u then raise exception 'PUBLICATION_NOT_FOUND';end if;
 elsif oa='withdraw' then if p.id is null or p.owner_id is distinct from u then raise exception 'PUBLICATION_NOT_FOUND';end if;
 elsif oa in('rightsReview','publish','revoke') then
 if community_publication_private.independent(u,pid,case when oa='rightsReview' then 'rights' else 'publisher' end) is not true then raise exception 'PUBLICATION_NOT_FOUND';end if;
 elsif oa='save' then
 -- A committed own reference may be unavailable; receipt projection never conveys display authority.
 select * into r from community_publication_private.references where id=rid for update nowait;
 if r.id is not null and r.owner_id is distinct from u then raise exception 'PUBLICATION_NOT_FOUND';end if;
 if (r.id is null or r.publication_id is distinct from pid) and (r.state='erased' and exists(select 1 from community_publication_private.operations where owner_id=u and operation_id=op and action='save' and record_id=rid and input_digest=encode(sha256(convert_to(raw,'UTF8')),'hex'))) is not true and community_publication_private.eligible(u,pid) is not true then raise exception 'PUBLICATION_NOT_FOUND';end if;
 elsif oa='unsave' then select * into r from community_publication_private.references where id=rid and owner_id=u for update nowait;if not found then raise exception 'PUBLICATION_NOT_FOUND';end if;
 end if;
 digest:=encode(sha256(convert_to(raw,'UTF8')),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text||':'||op::text,484));
 select * into receipt from community_publication_private.operations where owner_id=u and operation_id=op for update;
 if found then
 if receipt.input_digest<>digest or receipt.session_id<>s or receipt.session_epoch<>epoch then raise exception 'PUBLICATION_CONFLICT';end if;
 if a not in('operation','abandon') and receipt.state='abandoned' then raise exception 'PUBLICATION_OPERATION_ABANDONED';end if;
 if oa='delete' and a='delete' then return base||jsonb_build_object('kind','deleted','operationId',op,'scope','community_publication_module','retained',community_publication_private.retained());end if;
 if receipt.state='committed' and receipt.record_id is not null then
 if oa in('save','unsave') then ref:=community_publication_private.reference_json(u,receipt.record_id);
 else pub:=community_publication_private.record_json(receipt.record_id);end if;end if;
 return base||jsonb_build_object('kind','operation','operationId',op,'state',receipt.state,'publication',pub,'reference',ref);end if;
 if a='operation' then return base||jsonb_build_object('kind','operation','operationId',op,'state','absent','publication',null,'reference',null);end if;
 if a='abandon' then
 insert into community_publication_private.operations(owner_id,operation_id,session_id,session_epoch,input_digest,action,record_id,state) values(u,op,s,epoch,digest,oa,case when oa in('save','unsave') then rid else pid end,'abandoned');
 return base||jsonb_build_object('kind','operation','operationId',op,'state','abandoned','publication',null,'reference',null);end if;
 if a='delete' then perform community_publication_private.erase(u);
 elsif a='unsave' then
 if r.state<>'saved' or r.version<>1 then raise exception 'PUBLICATION_CONFLICT';end if;
 update community_publication_private.references set state='unsaved',version=2,ended_at=clock_timestamp() where id=rid;
 elsif a in('withdraw','revoke') then
 if p.version<>(v->>'expectedPublicationVersion')::integer or community_publication_private.terminal(p.state) then raise exception 'PUBLICATION_CONFLICT';end if;
 update community_publication_private.publications set state=case a when 'withdraw' then 'withdrawn' else 'revoked' end,version=version+1,ended_at=clock_timestamp() where id=pid;
 else
 if a='requestPublication' then
 if c.status<>'published' or c.review_anonymized or c.reviewer_id is null or c.content_kind not in('experience','help') then raise exception 'PUBLICATION_NOT_FOUND';end if;
 if p.id is not null then raise exception 'PUBLICATION_CONFLICT';end if;
 if c.version<>(v->>'expectedSubmissionVersion')::integer or st.safety_version<>(v->>'expectedSafetyVersion')::integer or community_publication_private.preview_digest(u,cid) is distinct from v->>'previewDigest' then raise exception 'PUBLICATION_CONFLICT';end if;
 insert into community_publication_private.publications(id,owner_id,submission_id,submission_version,safety_version,preview_digest,consent,rights_declaration,j1_reviewer_fence) values(pid,u,cid,c.version,st.safety_version,v->>'previewDigest','controlled-preview-v1','own-text-v1',st.j1_operator_fence);
 else
 if community_publication_private.source_current(pid) is not true then raise exception 'PUBLICATION_NOT_FOUND';end if;
 if p.version<>(v->>'expectedPublicationVersion')::integer or p.submission_version<>(v->>'expectedSubmissionVersion')::integer or p.safety_version<>(v->>'expectedSafetyVersion')::integer then raise exception 'PUBLICATION_CONFLICT';end if;
 if a='rightsReview' then
 if p.state<>'pending_rights' then raise exception 'PUBLICATION_CONFLICT';end if;
 insert into community_publication_private.rights_reviews(id,actor_id,publication_id,decision,note) values(op,u,pid,v->>'decision',v->>'note');
 update community_publication_private.publications set state=case when v->>'decision'='approve' then 'rights_approved' else 'rights_rejected' end,version=version+1,rights_note=v->>'note',rights_actor=u,rights_fence=community_safety_private.fence(u) where id=pid;
 elsif a='publish' then
 if p.state<>'rights_approved' or p.rights_note is null or p.rights_actor is null or community_publication_private.qualified(p.rights_actor,'rights') is not true then raise exception 'PUBLICATION_CONFLICT';end if;
 update community_publication_private.publications set state='published',version=version+1,published_at=clock_timestamp(),publisher_actor=u,publisher_fence=community_safety_private.fence(u) where id=pid;
 else
 if community_publication_private.eligible(u,pid) is not true then raise exception 'PUBLICATION_NOT_FOUND';end if;
 if r.id is not null then raise exception 'PUBLICATION_CONFLICT';end if;
 insert into community_publication_private.references(id,owner_id,publication_id,submission_version,safety_version,publication_version) values(rid,u,pid,p.submission_version,p.safety_version,p.version);
 end if;end if;end if;
 insert into community_publication_private.operations(owner_id,operation_id,session_id,session_epoch,input_digest,action,record_id,state) values(u,op,s,epoch,digest,a,case when a in('save','unsave') then rid else pid end,'committed');
 insert into community_publication_private.audit(actor_id,record_id,action) values(u,case when a in('save','unsave') then rid else pid end,a);
 if a='delete' then return base||jsonb_build_object('kind','deleted','operationId',op,'scope','community_publication_module','retained',community_publication_private.retained());end if;
 if a in('save','unsave') then ref:=community_publication_private.reference_json(u,rid);else pub:=community_publication_private.record_json(pid);end if;
 return base||jsonb_build_object('kind','operation','operationId',op,'state','committed','publication',pub,'reference',ref);
end $$;

-- Preserve original signature, owner, ACL and all J1/J2/legacy body bytes.
do $$declare body text;begin
 select prosrc into body from pg_proc where oid='public.community_workspace(jsonb)'::regprocedure;
 if position('community-safety-j2/1' in body)=0 then raise exception 'PUBLICATION_DEPENDENCY_CHANGED';end if;
 if position('if p_input->>''protocol''=''community-safety-j2/1'' then' in body)=0 then raise exception 'PUBLICATION_DISPATCH_CHANGED';end if;
 body:=replace(body,'if p_input->>''protocol''=''community-safety-j2/1'' then',E'if p_input->>\'protocol\'=\'community-publication-j3j4/1\' then return community_publication_private.workspace(p_input);end if;\n  if p_input->>\'protocol\'=\'community-safety-j2/1\' then');
 execute format('create or replace function public.community_workspace(p_input jsonb) returns jsonb language plpgsql security definer set search_path=%L as %L','',body);
end $$;
revoke all on all functions in schema community_publication_private from public,anon,authenticated,service_role;
