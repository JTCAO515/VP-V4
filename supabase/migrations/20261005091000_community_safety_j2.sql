-- #238 J2 internal safety only. Append-only; no public UGC activation or role grants.
-- Operational rollback: settings.enabled=false; retain denial state and cleanup fences.
create schema community_safety_private;
revoke all on schema community_safety_private from public,anon,authenticated,service_role;
create table community_safety_private.settings(singleton boolean primary key default true check(singleton),enabled boolean not null default false);
insert into community_safety_private.settings(singleton) values(true);
create table community_safety_private.moderators(actor_id uuid primary key references auth.users(id) on delete cascade,active boolean not null default false);
create table community_safety_private.controlled_readers(
 actor_id uuid references auth.users(id) on delete cascade,submission_id uuid not null,submission_version integer not null check(submission_version>=1),
 expires_at timestamptz not null,revoked boolean not null default false,primary key(actor_id,submission_id)
);
-- No payload snapshots. Retained frontier remains after physical source deletion.
create table community_safety_private.states(
 submission_id uuid primary key,author_id uuid references auth.users(id) on delete set null,
 submission_version integer not null check(submission_version>=1),j1_status text not null check(j1_status in('pending','published','rejected','withdrawn','deleted')),
 safety_version integer not null default 0 check(safety_version between 0 and 2147483647),removed boolean not null default false,
 j1_operator_fence text,decision_id uuid,origin_operator uuid references auth.users(id) on delete set null,origin_reporter uuid references auth.users(id) on delete set null
);
create table community_safety_private.reports(
 id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,submission_id uuid not null,
 submission_version integer not null,safety_version integer not null,category text not null check(category in('abuse','rights','misleading','other')),
 details text check(details is null or community_private.text_j1(to_jsonb(details),1000)),
 state text not null default 'pending' check(state in('pending','dismissed','removed','erased')),version integer not null default 1,
 created_at timestamptz not null default clock_timestamp(),resolved_at timestamptz,decision_id uuid,
 check((state='pending' and version=1 and resolved_at is null and details is not null and decision_id is null) or (state<>'pending' and version>=2 and resolved_at is not null)),
 check(state<>'erased' or details is null)
);
create unique index safety_pending_report on community_safety_private.reports(owner_id,submission_id) where state='pending';
create table community_safety_private.appeals(
 id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,submission_id uuid not null,
 submission_version integer not null,safety_version integer not null,basis text not null check(basis in('j1_rejection','safety_removal')),
 statement text check(statement is null or community_private.text_j1(to_jsonb(statement),1000)),
 initial_operator uuid references auth.users(id) on delete set null,reporter_id uuid references auth.users(id) on delete set null,
 state text not null default 'pending' check(state in('pending','upheld','restored','erased')),version integer not null default 1,
 created_at timestamptz not null default clock_timestamp(),resolved_at timestamptz,decision_id uuid,
 check((state='pending' and version=1 and resolved_at is null and statement is not null and decision_id is null) or (state<>'pending' and version>=2 and resolved_at is not null)),
 check(state<>'erased' or statement is null)
);
create unique index safety_pending_appeal on community_safety_private.appeals(submission_id,submission_version,safety_version) where state='pending';
create table community_safety_private.blocks(
 id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,target_id uuid references auth.users(id) on delete set null,
 submission_id uuid,state text not null default 'blocked' check(state in('blocked','unblocked','erased')),version integer not null default 1,
 created_at timestamptz not null default clock_timestamp(),ended_at timestamptz,
 check((state='blocked' and version=1 and ended_at is null) or (state<>'blocked' and version>=2 and ended_at is not null)),
 check(state<>'erased' or (target_id is null and submission_id is null))
);
create unique index safety_active_block on community_safety_private.blocks(owner_id,target_id) where state='blocked';
-- Authored notes are retained data independent of foreign report/appeal bodies.
create table community_safety_private.decisions(
 id uuid primary key,actor_id uuid not null references auth.users(id) on delete cascade,record_id uuid not null,
 action text not null check(action in('disposition','appealReview')),decision text not null check(decision in('dismiss','remove','uphold','restore')),
 note text not null check(community_private.text_j1(to_jsonb(note),400)),created_at timestamptz not null default clock_timestamp()
);
create table community_safety_private.operations(
 owner_id uuid not null references auth.users(id) on delete cascade,operation_id uuid not null,session_id uuid not null,session_epoch bigint not null,
 input_digest text not null check(input_digest ~ '^[a-f0-9]{64}$'),action text not null check(action in('report','disposition','appeal','appealReview','block','unblock','delete')),
 record_id uuid,state text not null check(state in('committed','abandoned')),created_at timestamptz not null default clock_timestamp(),primary key(owner_id,operation_id)
);
create table community_safety_private.audit(
 id bigint generated always as identity primary key,actor_id uuid references auth.users(id) on delete set null,record_id uuid,
 action text not null check(action in('report','disposition','appeal','appealReview','block','unblock','delete')),created_at timestamptz not null default clock_timestamp()
);
create index safety_states_author on community_safety_private.states(author_id,submission_id);
create index safety_reports_owner on community_safety_private.reports(owner_id,id);
create index safety_reports_source on community_safety_private.reports(submission_id,id);
create index safety_reports_pending on community_safety_private.reports(id) where state='pending';
create index safety_appeals_owner on community_safety_private.appeals(owner_id,id);
create index safety_appeals_source on community_safety_private.appeals(submission_id,id);
create index safety_appeals_pending on community_safety_private.appeals(id) where state='pending';
create index safety_blocks_owner on community_safety_private.blocks(owner_id,id);
create index safety_blocks_source on community_safety_private.blocks(submission_id);
create index safety_decisions_actor on community_safety_private.decisions(actor_id,id);
create index safety_audit_actor on community_safety_private.audit(actor_id,id);
do $$declare t record;begin for t in select tablename from pg_tables where schemaname='community_safety_private' loop execute format('alter table community_safety_private.%I enable row level security',t.tablename);end loop;end $$;
revoke all on all tables in schema community_safety_private from public,anon,authenticated,service_role;
revoke all on all sequences in schema community_safety_private from public,anon,authenticated,service_role;

create function community_safety_private.valid(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare a text:=v->>'action';o jsonb;begin
 if a in('session','export') then return community_private.exact_j1(v,array['action']);end if;
 if a in('object','eligibility') then return community_private.exact_j1(v,array['action','submissionId']) and community_private.uuid_j1(v->'submissionId');end if;
 if a='objects' then return community_private.exact_j1(v,array['action','cursor']) and (v->'cursor'='null' or community_private.uuid_j1(v->'cursor'));end if;
 if a in('mine','queue') then return community_private.exact_j1(v,array['action','collection','cursor']) and (v->'cursor'='null' or community_private.uuid_j1(v->'cursor')) and (v->>'collection' in('reports','appeals') or a='mine' and v->>'collection' in('dispositions','blocks'));end if;
 if a in('read','inspect') then return community_private.exact_j1(v,array['action','collection','id']) and community_private.uuid_j1(v->'id') and (v->>'collection' in('reports','appeals') or a='read' and v->>'collection' in('dispositions','blocks'));end if;
 if not community_private.uuid_j1(v->'operationId') then return false;end if;
 if a in('operation','abandon') then
 if not community_private.exact_j1(v,array['action','operationId','mutationBytes']) or not community_private.text_j1(v->'mutationBytes',10000) or octet_length(v->>'mutationBytes')>24000 then return false;end if;
 begin o:=(v->>'mutationBytes')::jsonb;exception when others then return false;end;
 return o->>'action' in('report','disposition','appeal','appealReview','block','unblock','delete') and o->'operationId'=v->'operationId' and community_safety_private.valid(o);end if;
 if a='delete' then return community_private.exact_j1(v,array['action','operationId','confirmed']) and v->'confirmed'='true';end if;
 if a='unblock' then return community_private.exact_j1(v,array['action','operationId','blockId','expectedVersion']) and community_private.uuid_j1(v->'blockId') and v->'expectedVersion'='1';end if;
 if not place_actions_private.revision_v1(v->'expectedSubmissionVersion') or v->'expectedSubmissionVersion'='0' or not place_actions_private.revision_v1(v->'expectedSafetyVersion') then return false;end if;
 if a='report' then return community_private.exact_j1(v,array['action','operationId','reportId','submissionId','expectedSubmissionVersion','expectedSafetyVersion','category','details','consent']) and community_private.uuid_j1(v->'reportId') and community_private.uuid_j1(v->'submissionId') and v->>'category' in('abuse','rights','misleading','other') and community_private.text_j1(v->'details',1000) and v->>'consent'='internal-safety-v1';end if;
 if a='disposition' then return community_private.exact_j1(v,array['action','operationId','reportId','expectedReportVersion','expectedSubmissionVersion','expectedSafetyVersion','decision','note']) and community_private.uuid_j1(v->'reportId') and v->'expectedReportVersion'='1' and v->>'decision' in('dismiss','remove') and community_private.text_j1(v->'note',400);end if;
 if a='appeal' then return community_private.exact_j1(v,array['action','operationId','appealId','submissionId','expectedSubmissionVersion','expectedSafetyVersion','basis','statement','consent']) and community_private.uuid_j1(v->'appealId') and community_private.uuid_j1(v->'submissionId') and v->>'basis' in('j1_rejection','safety_removal') and community_private.text_j1(v->'statement',1000) and v->>'consent'='internal-safety-v1';end if;
 if a='appealReview' then return community_private.exact_j1(v,array['action','operationId','appealId','expectedAppealVersion','expectedSubmissionVersion','expectedSafetyVersion','decision','note']) and community_private.uuid_j1(v->'appealId') and v->'expectedAppealVersion'='1' and v->>'decision' in('uphold','restore') and community_private.text_j1(v->'note',400);end if;
 return a='block' and community_private.exact_j1(v,array['action','operationId','blockId','submissionId','expectedSubmissionVersion','expectedSafetyVersion']) and community_private.uuid_j1(v->'blockId') and community_private.uuid_j1(v->'submissionId');
end $$;

-- Synchronize the authoritative J1 frontier without storing any content bytes.
insert into community_safety_private.states(submission_id,author_id,submission_version,j1_status)
 select id,author_id,version,status from community_private.submissions;
update community_safety_private.states st set j1_operator_fence=encode(sha256(convert_to(c.reviewer_id::text,'UTF8')),'hex') from community_private.submissions c where c.id=st.submission_id and c.reviewer_id is not null;
create function community_safety_private.source_frontier() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then
 update community_safety_private.states set author_id=null,j1_status='deleted',submission_version=greatest(submission_version,old.version) where submission_id=old.id;
 update community_safety_private.controlled_readers set revoked=true where submission_id=old.id;
 return old;end if;
 insert into community_safety_private.states(submission_id,author_id,submission_version,j1_status) values(new.id,new.author_id,new.version,new.status)
 on conflict(submission_id) do update set author_id=excluded.author_id,submission_version=excluded.submission_version,j1_status=excluded.j1_status;
 if new.reviewer_id is not null then update community_safety_private.states set j1_operator_fence=encode(sha256(convert_to(new.reviewer_id::text,'UTF8')),'hex') where submission_id=new.id;end if;
 if new.status in('withdrawn','deleted') then update community_safety_private.controlled_readers set revoked=true where submission_id=new.id;end if;
 return new;
end $$;
create trigger community_safety_source_frontier after insert or update or delete on community_private.submissions for each row execute function community_safety_private.source_frontier();

create function community_safety_private.blocked(u uuid,author uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from community_safety_private.blocks where owner_id=u and target_id=author and state='blocked')$$;
-- J1 author/reviewer authority is separate from J2 moderation authority.
create function community_safety_private.source_reader(u uuid,cid uuid,controlled boolean default true) returns boolean language plpgsql security definer set search_path='' as $$
declare c community_private.submissions%rowtype;begin
 select * into c from community_private.submissions where id=cid for share nowait;if not found then return false;end if;
 if community_safety_private.blocked(u,c.author_id) then return false;end if;
 if c.author_id=u then return true;end if;
 perform 1 from community_private.reviewers where actor_id=u and active for share nowait;if found then return true;end if;
 if controlled then perform 1 from community_safety_private.controlled_readers where actor_id=u and submission_id=cid and submission_version=c.version and not revoked and expires_at>clock_timestamp() for share nowait;return found;end if;
 return false;
end $$;
create function community_safety_private.object_allowed(u uuid,cid uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform 1 from community_safety_private.settings where singleton and enabled for share nowait;if not found then return false;end if;
 perform 1 from community_private.settings where singleton and enabled for share nowait;if not found then return false;end if;
 if not community_safety_private.source_reader(u,cid) then return false;end if;
 perform 1 from community_safety_private.states where submission_id=cid and j1_status not in('withdrawn','deleted') and not removed for share nowait;return found;
end $$;
create function community_safety_private.j1_allowed(u uuid,cid uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not community_safety_private.source_reader(u,cid,false) then return false;end if;
 perform 1 from community_safety_private.states where submission_id=cid and (not removed or j1_status in('withdrawn','deleted')) for share nowait;return found;
end $$;
create function community_safety_private.moderator(u uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin perform 1 from community_safety_private.moderators where actor_id=u and active for share nowait;return found;end $$;
create function community_safety_private.independent(u uuid,col text,rid uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare cid uuid;owner uuid;initial uuid;reporter uuid;author uuid;begin
 if not community_safety_private.moderator(u) then return false;end if;
 if col='reports' then select submission_id,owner_id into cid,owner from community_safety_private.reports where id=rid;reporter:=owner;
 else select submission_id,owner_id,initial_operator,reporter_id into cid,owner,initial,reporter from community_safety_private.appeals where id=rid;end if;
 if cid is null then return false;end if;
 select author_id into author from community_safety_private.states where submission_id=cid;
 return u is distinct from author and u is distinct from owner and u is distinct from reporter and u is distinct from initial;
end $$;
create function community_safety_private.object_json(u uuid,cid uuid) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare c community_private.submissions%rowtype;st community_safety_private.states%rowtype;expiry timestamptz;begin
 if not community_safety_private.object_allowed(u,cid) then raise exception 'SAFETY_NOT_FOUND';end if;
 select * into c from community_private.submissions where id=cid;select * into st from community_safety_private.states where submission_id=cid;
 expiry:=clock_timestamp()+interval '30 seconds';
 if c.author_id<>u and not exists(select 1 from community_private.reviewers where actor_id=u and active) then select least(expiry,expires_at) into expiry from community_safety_private.controlled_readers where actor_id=u and submission_id=cid;end if;
 return jsonb_build_object('id',cid,'submissionVersion',c.version,'safetyVersion',st.safety_version,'title',c.title,'content',c.content,'contentKind',c.content_kind,'benefitDisclosure',c.benefit_disclosure,
 'authorDisclosure',coalesce((select disclosure from community_private.disclosures_j1 where actor_id=c.author_id),'unknown'),
 'reviewerDisclosure',case when c.reviewed_at is null or c.review_anonymized then null else coalesce((select disclosure from community_private.disclosures_j1 where actor_id=c.reviewer_id),'unknown') end,
 'source',case c.content_kind when 'experience' then 'user_experience' when 'help' then 'user_help' else 'unknown' end,'copyright','unknown','visibility','internal','publiclyVisible',false,'retrievalEligible',false,'canReport',true,'canBlock',u<>c.author_id,'expiresAt',expiry);
end $$;
create function community_safety_private.record_json(col text,rid uuid) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare r community_safety_private.reports%rowtype;p community_safety_private.appeals%rowtype;b community_safety_private.blocks%rowtype;st community_safety_private.states%rowtype;n text;begin
 if col='dispositions' then
 select * into st from community_safety_private.states where submission_id=rid;if not found then raise exception 'SAFETY_NOT_FOUND';end if;
 select note into n from community_safety_private.decisions where id=st.decision_id;
 return jsonb_build_object('kind','disposition','id',rid,'submissionId',rid,'submissionVersion',st.submission_version,'safetyVersion',st.safety_version,
 'state',case when st.j1_status in('withdrawn','deleted') then 'unavailable' when st.removed then 'removed' else 'clear' end,'j1Status',st.j1_status,'note',case when st.j1_status in('withdrawn','deleted') then null else n end,
 'appealable',st.j1_status not in('withdrawn','deleted') and (st.removed or st.j1_status='rejected'));
 elsif col='blocks' then
 select * into b from community_safety_private.blocks where id=rid;if not found then raise exception 'SAFETY_NOT_FOUND';end if;
 return jsonb_build_object('kind','block','id',rid,'submissionId',case when b.target_id is null or not exists(select 1 from community_private.submissions where id=b.submission_id and status not in('withdrawn','deleted')) or exists(select 1 from community_safety_private.states where submission_id=b.submission_id and removed) then null else b.submission_id end,'state',b.state,'version',b.version,'createdAt',b.created_at,'endedAt',b.ended_at);
 elsif col='reports' then
 select * into r from community_safety_private.reports where id=rid;if not found then raise exception 'SAFETY_NOT_FOUND';end if;
 select * into st from community_safety_private.states where submission_id=r.submission_id;select note into n from community_safety_private.decisions where id=r.decision_id;
 return jsonb_build_object('kind','report','id',rid,'submissionId',r.submission_id,'submissionVersion',coalesce(st.submission_version,r.submission_version),'safetyVersion',coalesce(st.safety_version,r.safety_version),'category',r.category,'details',r.details,'state',r.state,'version',r.version,'createdAt',r.created_at,'resolvedAt',r.resolved_at,'note',case when r.state='erased' then null else n end);
 else
 select * into p from community_safety_private.appeals where id=rid;if not found then raise exception 'SAFETY_NOT_FOUND';end if;
 select * into st from community_safety_private.states where submission_id=p.submission_id;select note into n from community_safety_private.decisions where id=p.decision_id;
 return jsonb_build_object('kind','appeal','id',rid,'submissionId',p.submission_id,'submissionVersion',coalesce(st.submission_version,p.submission_version),'safetyVersion',coalesce(st.safety_version,p.safety_version),'basis',p.basis,'statement',p.statement,'state',p.state,'version',p.version,'createdAt',p.created_at,'resolvedAt',p.resolved_at,'note',case when p.state='erased' then null else n end);
 end if;
end $$;
create function community_safety_private.own_ids(u uuid,col text) returns setof uuid language sql stable security definer set search_path='' as $$
 select id from community_safety_private.reports where col='reports' and owner_id=u union all
 select submission_id from community_safety_private.states where col='dispositions' and author_id=u union all
 select id from community_safety_private.appeals where col='appeals' and owner_id=u union all
 select id from community_safety_private.blocks where col='blocks' and owner_id=u$$;
create function community_safety_private.erase_sources(u uuid) returns setof uuid language sql stable security definer set search_path='' as $$
 select submission_id from community_safety_private.reports where owner_id=u union
 select submission_id from community_safety_private.appeals where owner_id=u union
 select submission_id from community_safety_private.blocks where owner_id=u union
 select submission_id from community_safety_private.states where origin_operator=u or origin_reporter=u union
 select r.submission_id from community_safety_private.reports r join community_safety_private.decisions d on d.record_id=r.id where d.actor_id=u union
 select p.submission_id from community_safety_private.appeals p join community_safety_private.decisions d on d.record_id=p.id where d.actor_id=u
$$;
create function community_safety_private.erase(u uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 -- Same actor root -> ordered original submissions -> safety rows as J1 mutation/erasure.
 perform 1 from community_private.submissions c where c.id in(select x from community_safety_private.erase_sources(u) x) order by c.id for update nowait;
 perform 1 from community_safety_private.states st where st.submission_id in(select x from community_safety_private.erase_sources(u) x) order by st.submission_id for update nowait;
 update community_private.submissions c set reviewer_id=null,review_note=null,author_visible_note=null,review_anonymized=true
 where reviewer_id=u and exists(select 1 from community_safety_private.appeals p join community_safety_private.decisions d on d.record_id=p.id where p.submission_id=c.id and p.basis='j1_rejection' and d.actor_id=u and d.action='appealReview' and d.decision='restore');
 perform 1 from community_safety_private.reports where owner_id=u order by id for update nowait;
 perform 1 from community_safety_private.appeals where owner_id=u order by id for update nowait;
 perform 1 from community_safety_private.blocks where owner_id=u order by id for update nowait;
 update community_safety_private.reports set details=null,state='erased',version=greatest(version,2),resolved_at=coalesce(resolved_at,clock_timestamp()),decision_id=null where owner_id=u;
 update community_safety_private.appeals set statement=null,state='erased',version=greatest(version,2),resolved_at=coalesce(resolved_at,clock_timestamp()),decision_id=null,initial_operator=null,reporter_id=null where owner_id=u;
 update community_safety_private.blocks set state='erased',version=greatest(version,2),target_id=null,submission_id=null,ended_at=coalesce(ended_at,clock_timestamp()) where owner_id=u;
 delete from community_safety_private.decisions where actor_id=u;
 update community_safety_private.states set origin_operator=null where origin_operator=u;
 update community_safety_private.states set origin_reporter=null where origin_reporter=u;
 update community_safety_private.appeals set initial_operator=null where initial_operator=u;
 update community_safety_private.appeals set reporter_id=null where reporter_id=u;
 update community_safety_private.audit set actor_id=null where actor_id=u;
 delete from community_safety_private.controlled_readers where actor_id=u;
 delete from community_safety_private.moderators where actor_id=u;
end $$;
create function community_safety_private.account_erasure() returns trigger language plpgsql security definer set search_path='' as $$
begin perform community_safety_private.erase(old.id);return old;end $$;
create trigger community_safety_account_erasure before delete on auth.users for each row execute function community_safety_private.account_erasure();

-- Pseudonymous independence fences survive scoped note erasure/re-enrollment.
alter table community_safety_private.states add column operator_fence text,add column reporter_fence text;
alter table community_safety_private.appeals add column operator_fence text,add column reporter_fence text;
create function community_safety_private.fence(u uuid) returns text language sql immutable set search_path='' as $$select encode(sha256(convert_to(u::text,'UTF8')),'hex')$$;
create or replace function community_safety_private.independent(u uuid,col text,rid uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare cid uuid;owner uuid;initial text;reporter text;author uuid;begin
 if not community_safety_private.moderator(u) then return false;end if;
 if col='reports' then select submission_id,owner_id into cid,owner from community_safety_private.reports where id=rid;reporter:=community_safety_private.fence(owner);
 else select submission_id,owner_id,operator_fence,reporter_fence into cid,owner,initial,reporter from community_safety_private.appeals where id=rid;end if;
 if cid is null then return false;end if;
 select author_id into author from community_safety_private.states where submission_id=cid;
 return u is distinct from author and u is distinct from owner and community_safety_private.fence(u) is distinct from reporter and community_safety_private.fence(u) is distinct from initial;
end $$;
create function community_safety_private.export_json(u uuid) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare col text;out jsonb:='{}';rows jsonb;n integer;begin
 foreach col in array array['reports','dispositions','appeals','blocks'] loop
 select count(*) into n from (select x from community_safety_private.own_ids(u,col) x limit 101) bounded;if n>100 then raise exception 'SAFETY_CAPACITY';end if;
 select coalesce(jsonb_agg(community_safety_private.record_json(col,x) order by x),'[]') into rows from community_safety_private.own_ids(u,col) x;out:=out||jsonb_build_object(col,rows);end loop;
 if (select count(*) from (select 1 from community_safety_private.operations where owner_id=u limit 101) z)>100
 or (select count(*) from (select 1 from community_safety_private.audit where actor_id=u limit 101) z)>100
 or (select count(*) from (select 1 from community_safety_private.decisions where actor_id=u limit 101) z)>100
 or (select count(*) from (select 1 from community_safety_private.controlled_readers where actor_id=u limit 101) z)>100 then raise exception 'SAFETY_CAPACITY';end if;
 return out||jsonb_build_object('scope','community_safety_module','coverage','complete_for_community_safety',
 'receipts',coalesce((select jsonb_agg(jsonb_build_object('operationId',operation_id,'recordId',record_id,'action',action,'state',state,'digest',input_digest) order by operation_id) from community_safety_private.operations where owner_id=u),'[]'),
 'audits',coalesce((select jsonb_agg(jsonb_build_object('recordId',record_id,'action',action,'createdAt',created_at) order by id) from community_safety_private.audit where actor_id=u),'[]'),
 'authoredDecisions',coalesce((select jsonb_agg(jsonb_build_object('recordId',record_id,'kind',case when action='disposition' then 'report' else 'appeal' end,'decision',decision,'note',note,'createdAt',created_at) order by id) from community_safety_private.decisions where actor_id=u),'[]'),
 'readerGrants',coalesce((select jsonb_agg(jsonb_build_object('submissionId',submission_id,'submissionVersion',submission_version,'expiresAt',expires_at,'revoked',revoked) order by submission_id) from community_safety_private.controlled_readers where actor_id=u),'[]'),
 'qualification',(select jsonb_build_object('active',active) from community_safety_private.moderators where actor_id=u),
 'retained',jsonb_build_array('operation_fences','record_tombstones','audit_metadata'));
end $$;

create function community_safety_private.workspace(envelope jsonb) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare u uuid;s uuid;epoch bigint;v jsonb;a text;o jsonb;oa text;raw text;digest text;op uuid;rid uuid;cid uuid;col text;internal boolean;
 c community_private.submissions%rowtype;st community_safety_private.states%rowtype;r community_safety_private.reports%rowtype;p community_safety_private.appeals%rowtype;b community_safety_private.blocks%rowtype;receipt community_safety_private.operations%rowtype;
 base jsonb;out jsonb;ids uuid[];decision_id uuid;next_id uuid;begin
 -- Existing root performs no writes; no admission copy or caller-controlled GUC.
 u:=community_private.actor_j1();s:=(auth.jwt()->>'session_id')::uuid;
 select coalesce((select x.epoch from identity_private.mobile_accounts x where x.owner_id=u),0) into epoch;
 if not community_private.exact_j1(envelope,array['protocol','command','mutationBytes']) or envelope->>'protocol' is distinct from 'community-safety-j2/1' or not community_safety_private.valid(envelope->'command') then raise exception 'INVALID_INPUT';end if;
 v:=envelope->'command';a:=v->>'action';base:=jsonb_build_object('schemaVersion','community-safety-j2/1','actorId',u,'sessionId',s);
 o:=case when a in('operation','abandon') then (v->>'mutationBytes')::jsonb else v end;oa:=o->>'action';internal:=a in('queue','inspect') or oa in('disposition','appealReview');
 if a in('report','disposition','appeal','appealReview','block','unblock','delete') then
 if not community_private.text_j1(envelope->'mutationBytes',10000) or octet_length(envelope->>'mutationBytes')>24000 then raise exception 'INVALID_INPUT';end if;
 raw:=envelope->>'mutationBytes';begin if raw::jsonb is distinct from v then raise exception 'INVALID_INPUT';end if;exception when others then raise exception 'INVALID_INPUT';end;
 else if envelope->'mutationBytes' is distinct from 'null'::jsonb then raise exception 'INVALID_INPUT';end if;raw:=case when a in('operation','abandon') then v->>'mutationBytes' else null end;end if;
 if internal and not community_safety_private.moderator(u) then raise exception 'SAFETY_FORBIDDEN';end if;
 if a in('objects','object','eligibility','report','block','disposition','appealReview','queue','inspect') or internal then
 perform 1 from community_safety_private.settings where singleton and enabled for share nowait;if not found then raise exception 'SAFETY_DISABLED';end if;end if;
 if a='session' then return base||jsonb_build_object('kind','session');end if;
 if a='export' then return base||jsonb_build_object('kind','export')||community_safety_private.export_json(u);end if;
 if a in('object','eligibility') then cid:=(v->>'submissionId')::uuid;out:=community_safety_private.object_json(u,cid);
 if a='object' then return base||jsonb_build_object('kind','object','object',out);end if;
 return base||jsonb_build_object('kind','eligibility','submissionId',cid,'publicationEnabled',false,'publiclyVisible',false,'retrievalEligible',false,'reason','public_disabled');end if;
 if a='objects' then
 select array_agg(id order by id) into ids from (select id from community_private.submissions where (v->'cursor'='null' or id>(v->>'cursor')::uuid) and community_safety_private.object_allowed(u,id) order by id limit 51) x;
 select coalesce(jsonb_agg(community_safety_private.object_json(u,x) order by x),'[]') into out from unnest(ids[1:50]) x;
 return base||jsonb_build_object('kind','objects','objects',out,'nextCursor',case when cardinality(ids)>50 then ids[50] else null end,'complete',coalesce(cardinality(ids),0)<=50);end if;
 col:=v->>'collection';
 if a in('read','inspect') then
 rid:=(v->>'id')::uuid;
 if a='read' then if not exists(select 1 from community_safety_private.own_ids(u,col) x where x=rid) then raise exception 'SAFETY_NOT_FOUND';end if;
 else if not community_safety_private.independent(u,col,rid) then raise exception 'SAFETY_NOT_FOUND';end if;end if;
 return base||jsonb_build_object('kind','record','record',community_safety_private.record_json(col,rid));end if;
 if a in('mine','queue') then
 if a='mine' then select array_agg(x order by x) into ids from (select x from community_safety_private.own_ids(u,col) x where v->'cursor'='null' or x>(v->>'cursor')::uuid order by x limit 51) z;
 else select array_agg(id order by id) into ids from (select id from (select id from community_safety_private.reports where col='reports' and state='pending' union all select id from community_safety_private.appeals where col='appeals' and state='pending') candidates where (v->'cursor'='null' or id>(v->>'cursor')::uuid) and community_safety_private.independent(u,col,id) order by id limit 51) z;
 select array_agg(x order by x) into ids from (select x from unnest(ids) x order by x limit 51) bounded;end if;
 select coalesce(jsonb_agg(community_safety_private.record_json(col,x) order by x),'[]') into out from unnest(ids[1:50]) x;
 return base||jsonb_build_object('kind','page','collection',col,'records',out,'nextCursor',case when cardinality(ids)>50 then ids[50] else null end,'complete',coalesce(cardinality(ids),0)<=50);end if;
 op:=(v->>'operationId')::uuid;
 rid:=coalesce((o->>'reportId')::uuid,(o->>'appealId')::uuid,(o->>'blockId')::uuid);
 col:=case oa when 'report' then 'reports' when 'disposition' then 'reports' when 'appeal' then 'appeals' when 'appealReview' then 'appeals' else 'blocks' end;
 cid:=(o->>'submissionId')::uuid;
 if oa='disposition' then select submission_id into cid from community_safety_private.reports where id=rid;
 elsif oa='appealReview' then select submission_id into cid from community_safety_private.appeals where id=rid;end if;
 -- Original source row precedes every safety row, including replay and review.
 if cid is not null then select * into c from community_private.submissions where id=cid for update nowait;select * into st from community_safety_private.states where submission_id=cid for update nowait;end if;
 if oa in('disposition','appealReview') then
 if not community_safety_private.independent(u,col,rid) then raise exception 'SAFETY_FORBIDDEN';end if;
 if not community_safety_private.source_reader(u,cid) then raise exception 'SAFETY_NOT_FOUND';end if;
 perform 1 from community_private.settings where singleton and enabled for share nowait;if not found then raise exception 'SAFETY_DISABLED';end if;end if;
 digest:=encode(sha256(convert_to(raw,'UTF8')),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text||':'||op::text,64));
 select * into receipt from community_safety_private.operations where owner_id=u and operation_id=op for update;
 if found then
 if receipt.input_digest<>digest or receipt.session_id<>s or receipt.session_epoch<>epoch then raise exception 'SAFETY_CONFLICT';end if;
 if a not in('operation','abandon') and receipt.state='abandoned' then raise exception 'SAFETY_OPERATION_ABANDONED';end if;
 if oa='delete' and a='delete' then return base||jsonb_build_object('kind','deleted','operationId',op,'scope','community_safety_module','retained',jsonb_build_array('operation_fences','record_tombstones','audit_metadata'));end if;
 return base||jsonb_build_object('kind','operation','operationId',op,'state',receipt.state,'record',case when receipt.state='committed' and receipt.record_id is not null then community_safety_private.record_json(col,receipt.record_id) else null end);end if;
 if a='operation' then return base||jsonb_build_object('kind','operation','operationId',op,'state','absent','record',null);end if;
 if a='abandon' then
 insert into community_safety_private.operations(owner_id,operation_id,session_id,session_epoch,input_digest,action,record_id,state) values(u,op,s,epoch,digest,oa,rid,'abandoned');
 return base||jsonb_build_object('kind','operation','operationId',op,'state','abandoned','record',null);end if;
 if a='delete' then perform community_safety_private.erase(u);
 elsif a='unblock' then
 select * into b from community_safety_private.blocks where id=rid and owner_id=u for update nowait;if not found then raise exception 'SAFETY_NOT_FOUND';end if;
 if b.version<>(v->>'expectedVersion')::integer or b.state<>'blocked' then raise exception 'SAFETY_CONFLICT';end if;
 update community_safety_private.blocks set state='unblocked',version=2,ended_at=clock_timestamp() where id=rid;
 else
 if c.id is null or c.status in('withdrawn','deleted') then raise exception 'SAFETY_NOT_FOUND';end if;
 if c.version<>(v->>'expectedSubmissionVersion')::integer or st.safety_version<>(v->>'expectedSafetyVersion')::integer or st.safety_version=2147483647 then raise exception 'SAFETY_CONFLICT';end if;
 if a in('report','block') and not community_safety_private.object_allowed(u,cid) then raise exception 'SAFETY_NOT_FOUND';end if;
 if a='report' then
 if exists(select 1 from community_safety_private.reports where id=rid or owner_id=u and submission_id=cid and state='pending') then raise exception 'SAFETY_CONFLICT';end if;
 insert into community_safety_private.reports(id,owner_id,submission_id,submission_version,safety_version,category,details) values(rid,u,cid,c.version,st.safety_version,v->>'category',v->>'details');
 elsif a='block' then
 if c.author_id=u then raise exception 'SAFETY_FORBIDDEN';end if;
 if exists(select 1 from community_safety_private.blocks where id=rid or owner_id=u and target_id=c.author_id and state='blocked') then raise exception 'SAFETY_CONFLICT';end if;
 insert into community_safety_private.blocks(id,owner_id,target_id,submission_id) values(rid,u,c.author_id,cid);
 elsif a='appeal' then
 if c.author_id<>u then raise exception 'SAFETY_NOT_FOUND';end if;
 if not (v->>'basis'='j1_rejection' and c.status='rejected' or v->>'basis'='safety_removal' and st.removed) then raise exception 'SAFETY_CONFLICT';end if;
 if exists(select 1 from community_safety_private.appeals where id=rid or submission_id=cid and submission_version=c.version and safety_version=st.safety_version and state='pending') then raise exception 'SAFETY_CONFLICT';end if;
 insert into community_safety_private.appeals(id,owner_id,submission_id,submission_version,safety_version,basis,statement,initial_operator,reporter_id,operator_fence,reporter_fence)
 values(rid,u,cid,c.version,st.safety_version,v->>'basis',v->>'statement',case when v->>'basis'='j1_rejection' then c.reviewer_id else st.origin_operator end,case when v->>'basis'='safety_removal' then st.origin_reporter else null end,
 case when v->>'basis'='j1_rejection' then st.j1_operator_fence else st.operator_fence end,case when v->>'basis'='safety_removal' then st.reporter_fence else null end);
 else
 decision_id:=op;
 if a='disposition' then
 select * into r from community_safety_private.reports where id=rid for update nowait;
 if r.state<>'pending' or r.version<>1 or st.removed then raise exception 'SAFETY_CONFLICT';end if;
 insert into community_safety_private.decisions(id,actor_id,record_id,action,decision,note) values(decision_id,u,rid,a,v->>'decision',v->>'note');
 update community_safety_private.reports set state=case when v->>'decision'='remove' then 'removed' else 'dismissed' end,version=2,resolved_at=clock_timestamp(),decision_id=op where id=rid;
 update community_safety_private.states set safety_version=safety_version+1,removed=(v->>'decision'='remove'),decision_id=op,origin_operator=u,origin_reporter=r.owner_id,operator_fence=community_safety_private.fence(u),reporter_fence=community_safety_private.fence(r.owner_id) where submission_id=cid;
 else
 select * into p from community_safety_private.appeals where id=rid for update nowait;
 if p.state<>'pending' or p.version<>1 or p.submission_version<>c.version or p.safety_version<>st.safety_version or not(p.basis='j1_rejection' and c.status='rejected' or p.basis='safety_removal' and st.removed) then raise exception 'SAFETY_CONFLICT';end if;
 if v->>'decision'='restore' and p.basis='j1_rejection' then
 perform 1 from community_private.reviewers where actor_id=u and active for share nowait;if not found then raise exception 'SAFETY_FORBIDDEN';end if;
 -- Preserve existing J1 version2 constraint. J2 audit owns this distinct transition.
 update community_private.submissions set status='published',review_decision='approve',reviewer_id=u,review_note=v->>'note',author_visible_note=v->>'note',review_anonymized=false,reviewed_at=clock_timestamp() where id=cid;
 end if;
 insert into community_safety_private.decisions(id,actor_id,record_id,action,decision,note) values(decision_id,u,rid,a,v->>'decision',v->>'note');
 update community_safety_private.appeals set state=case when v->>'decision'='restore' then 'restored' else 'upheld' end,version=2,resolved_at=clock_timestamp(),decision_id=op where id=rid;
 update community_safety_private.states set safety_version=safety_version+1,removed=case when v->>'decision'='restore' and p.basis='safety_removal' then false else removed end,decision_id=op where submission_id=cid;
 end if;end if;end if;
 insert into community_safety_private.operations(owner_id,operation_id,session_id,session_epoch,input_digest,action,record_id,state) values(u,op,s,epoch,digest,a,rid,'committed');
 insert into community_safety_private.audit(actor_id,record_id,action) values(u,rid,a);
 if a='delete' then return base||jsonb_build_object('kind','deleted','operationId',op,'scope','community_safety_module','retained',jsonb_build_array('operation_fences','record_tombstones','audit_metadata'));end if;
 return base||jsonb_build_object('kind','operation','operationId',op,'state','committed','record',community_safety_private.record_json(col,rid));
end $$;

-- Extend ORIGINAL public signature/owner/ACL. Preserve byte-exact original body
-- in revoked helpers; insert only explicit safety checks and list predicates.
do $$declare body text;begin
 select prosrc into body from pg_proc where oid='community_private.item_j1(uuid)'::regprocedure;
 execute format('create function community_safety_private.retained_item_j1(p_id uuid) returns jsonb language plpgsql security definer set search_path=%L set timezone=%L as %L','','UTC',body);
 select prosrc into body from pg_proc where oid='community_private.submission_json(uuid,boolean)'::regprocedure;
 execute format('create function community_safety_private.retained_submission_json(p_id uuid,p_internal boolean) returns jsonb language sql security definer set search_path=%L as %L','',body);
end $$;
create or replace function community_private.item_j1(p_id uuid) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
begin
 if not community_safety_private.j1_allowed(auth.uid(),p_id) then raise exception 'COMMUNITY_NOT_FOUND';end if;
 return community_safety_private.retained_item_j1(p_id);
end $$;
create or replace function community_private.submission_json(p_id uuid,p_internal boolean) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not community_safety_private.j1_allowed(auth.uid(),p_id) then raise exception 'COMMUNITY_NOT_FOUND';end if;
 return community_safety_private.retained_submission_json(p_id,p_internal);
end $$;
do $$declare old_body text;body text;begin
 select prosrc into old_body from pg_proc where oid='community_private.workspace_j1(jsonb)'::regprocedure;
 body:=replace(old_body,'(a=''mine'' and x.author_id=u or a=''queue'' and x.status=''pending'')','(a=''mine'' and x.author_id=u or a=''queue'' and x.status=''pending'') and community_safety_private.j1_allowed(u,x.id)');
 body:=replace(body,'(a=''mine'' and author_id=u or a=''queue'' and status=''pending'')','(a=''mine'' and author_id=u or a=''queue'' and status=''pending'') and community_safety_private.j1_allowed(u,id)');
 -- Owner data export remains complete even when visibility is denied. It is
 -- authorized by actor_j1 and the original author_id=u filter, never a live read.
 body:=replace(body,'jsonb_agg(community_private.item_j1(id) order by id) from community_private.submissions where author_id=u','jsonb_agg(community_safety_private.retained_item_j1(id) order by id) from community_private.submissions where author_id=u');
 if body=old_body then raise exception 'SAFETY_J1_SEAM_CHANGED';end if;
 execute format('create or replace function community_private.workspace_j1(envelope jsonb) returns jsonb language plpgsql security definer set search_path=%L set timezone=%L as %L','','UTC',body);
 select prosrc into old_body from pg_proc where oid='public.community_workspace(jsonb)'::regprocedure;
 body:=replace(old_body,'if p_input ? ''protocol'' then return community_private.workspace_j1(p_input);end if;',E'if p_input->>\'protocol\'=\'community-safety-j2/1\' then return community_safety_private.workspace(p_input);end if;\n  if p_input ? \'protocol\' then return community_private.workspace_j1(p_input);end if;');
 body:=replace(body,'where (action=''mine'' and author_id=u) or (action=''queue'' and status=''pending'')','where ((action=''mine'' and author_id=u) or (action=''queue'' and status=''pending'')) and community_safety_private.j1_allowed(u,id)');
 if body=old_body then raise exception 'SAFETY_LEGACY_SEAM_CHANGED';end if;
 execute format('create or replace function public.community_workspace(p_input jsonb) returns jsonb language plpgsql security definer set search_path=%L as %L','',body);
end $$;
revoke all on all functions in schema community_safety_private from public,anon,authenticated,service_role;
revoke all on all functions in schema community_private from public,anon,authenticated,service_role;
