-- #235 J1. Internal only; append-only extension of the original RPC and ACL.
-- Disable settings.enabled for operational rollback. Preserve fences/tombstones.
alter table community_private.submissions
 add column content_kind text not null default 'unknown' check(content_kind in('experience','help','unknown')),
 add column benefit_disclosure text check(benefit_disclosure is null or length(benefit_disclosure)<=400),
 add column author_visible_note text,
 add column place_binding jsonb,
 add column review_anonymized boolean not null default false,
 add column review_decision text check(review_decision in('approve','reject'));
-- Trusted identity producer is independent of reviewer qualification and client text.
create table community_private.disclosures_j1(
 actor_id uuid primary key references auth.users(id) on delete cascade,
 disclosure text not null check(disclosure in('registered_user','community_reviewer','official','employee','unknown'))
);
create table community_private.operations_j1(
 owner_id uuid not null references auth.users(id) on delete cascade,
 operation_id uuid not null,session_id uuid not null,session_epoch bigint not null,
 input_digest text not null check(input_digest ~ '^[a-f0-9]{64}$'),
 action text not null check(action in('submit','review','withdraw','delete')),
 submission_id uuid,state text not null check(state in('committed','abandoned')),
 created_at timestamptz not null default clock_timestamp(),primary key(owner_id,operation_id)
);
alter table community_private.disclosures_j1 enable row level security;
alter table community_private.operations_j1 enable row level security;
revoke all on community_private.disclosures_j1,community_private.operations_j1 from public,anon,authenticated,service_role;
create index community_j1_author_id on community_private.submissions(author_id,id);
create index community_j1_pending_id on community_private.submissions(id) where status='pending';
create index community_j1_reviewer on community_private.submissions(reviewer_id,id) where reviewer_id is not null;
create index community_j1_audit_actor on community_private.audit(actor_id,id);
-- Permit explicit reviewed anonymization while retaining decision/version/time.
do $$declare c record;begin
 for c in select conname from pg_constraint where conrelid='community_private.submissions'::regclass and contype='c'
 and (pg_get_constraintdef(oid) like '%status%' or pg_get_constraintdef(oid) like '%reviewer_id%') loop
 execute format('alter table community_private.submissions drop constraint %I',c.conname);end loop;
end $$;
alter table community_private.submissions
 add check(status in('pending','published','rejected','withdrawn','deleted')),
 add check((status in('withdrawn','deleted') and title='' and content='' and withdrawn_at is not null and benefit_disclosure is null and place_binding is null)
 or (status not in('withdrawn','deleted') and length(btrim(title,E' \t\r\n'))>0 and length(btrim(content,E' \t\r\n'))>0 and withdrawn_at is null)),
 add check((reviewed_at is null and reviewer_id is null and review_note is null and not review_anonymized)
 or (reviewed_at is not null and ((review_anonymized and reviewer_id is null and review_note is null and author_visible_note is null)
 or (not review_anonymized and reviewer_id is not null and reviewer_id<>author_id and length(btrim(review_note,E' \t\r\n')) between 1 and 400)))),
 add check((status='pending' and version=1 and reviewed_at is null)
 or (status in('published','rejected') and version=2 and reviewed_at is not null)
 or (status in('withdrawn','deleted') and version in(2,3)));
alter table community_private.audit drop constraint audit_action_check;
alter table community_private.audit add check(action in('submitted','reviewed','published','rejected','withdrawn','deleted'));
alter table community_private.audit alter column actor_id drop not null;

create function community_private.exact_j1(v jsonb,k text[]) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='object' and v ?& k and v-k='{}',false)$$;
create function community_private.uuid_j1(v jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='string' and v#>>'{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false)$$;
create function community_private.text_j1(v jsonb,n integer,empty_ok boolean default false) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='string' and place_actions_private.utf16_length_v1(v#>>'{}')<=n
 and (empty_ok or length(btrim(v#>>'{}',E' \t\r\n\v\f'||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)))>0),false)$$;
create function community_private.valid_j1(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare a text:=v->>'action';original jsonb;begin
 if a in('mine','queue') then return community_private.exact_j1(v,array['action','cursor']) and (v->'cursor'='null' or community_private.uuid_j1(v->'cursor'));end if;
 if a in('read','inspect') then return community_private.exact_j1(v,array['action','submissionId']) and community_private.uuid_j1(v->'submissionId');end if;
 if a in('export','session') then return community_private.exact_j1(v,array['action']);end if;
 if not community_private.uuid_j1(v->'operationId') then return false;end if;
 if a in('operation','abandon') then
 if not community_private.exact_j1(v,array['action','operationId','mutationBytes']) or not community_private.text_j1(v->'mutationBytes',10000) or octet_length(v->>'mutationBytes')>24000 then return false;end if;
 begin original:=(v->>'mutationBytes')::jsonb;exception when others then return false;end;
 return original->>'action' in('submit','review','withdraw','delete') and original->'operationId'=v->'operationId' and community_private.valid_j1(original);
 end if;
 if a='delete' then return community_private.exact_j1(v,array['action','operationId','confirmed']) and v->'confirmed'='true';end if;
 if not community_private.uuid_j1(v->'submissionId') then return false;end if;
 if a='submit' then return community_private.exact_j1(v,array['action','operationId','submissionId','contentKind','title','content','benefitDisclosure','place','consent'])
 and v->>'contentKind' in('experience','help') and community_private.text_j1(v->'title',160) and community_private.text_j1(v->'content',4000)
 and community_private.text_j1(v->'benefitDisclosure',400,true) and v->>'consent'='internal-review-v1'
 and (v->'place'='null' or community_private.exact_j1(v->'place',array['tripId','placeReferenceId','expectedTripVersion','mappingDigest']) and community_private.uuid_j1(v->'place'->'tripId') and community_private.uuid_j1(v->'place'->'placeReferenceId') and place_actions_private.revision_v1(v->'place'->'expectedTripVersion') and jsonb_typeof(v->'place'->'mappingDigest')='string' and v->'place'->>'mappingDigest' ~ '^[a-f0-9]{64}$');end if;
 if a='withdraw' then return community_private.exact_j1(v,array['action','operationId','submissionId','expectedVersion']) and v->'expectedVersion' in('1'::jsonb,'2'::jsonb);end if;
 return a='review' and community_private.exact_j1(v,array['action','operationId','submissionId','expectedVersion','decision','note']) and v->'expectedVersion'='1' and v->>'decision' in('approve','reject') and community_private.text_j1(v->'note',400);
end $$;

-- Lock existing auth root, account, live session, then module/operation/submission.
-- No cleanup or lazy identity creation precedes this authorization.
create function community_private.actor_j1() returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();s uuid:=(auth.jwt()->>'session_id')::uuid;ma identity_private.mobile_accounts%rowtype;
begin
 if u is null or s is null or auth.jwt()->>'role' is distinct from 'authenticated' or auth.jwt()->>'is_anonymous' is distinct from 'false' then raise exception 'UNAUTHENTICATED';end if;
 perform 1 from auth.users where id=u and not coalesce(is_anonymous,false) for update nowait;if not found then raise exception 'UNAUTHENTICATED';end if;
 select * into ma from identity_private.mobile_accounts where owner_id=u for update nowait;
 -- A never-enrolled Web user has epoch 0. Native must have the existing exact generation.
 perform identity_private.guard_mobile_rpc_v2();
 perform 1 from auth.sessions where id=s and user_id=u for share nowait;if not found then raise exception 'UNAUTHENTICATED';end if;
 if exists(select 1 from identity_private.mobile_attempts where session_id=s) and not exists(select 1 from identity_private.mobile_attempts where owner_id=u and session_id=s and epoch=ma.epoch and ma.session_id=s) then raise exception 'SESSION_REPLACED';end if;
 return u;
end $$;

create function community_private.item_j1(p_id uuid) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare c community_private.submissions%rowtype;b jsonb;label text;saved place_actions_private.saved_places%rowtype;begin
 select * into c from community_private.submissions where id=p_id;if not found then raise exception 'COMMUNITY_NOT_FOUND';end if;
 if c.place_binding is not null then
 select * into saved from place_actions_private.saved_places where owner_id=c.author_id and trip_id=(c.place_binding->>'tripId')::uuid and reference_id=(c.place_binding->>'placeReferenceId')::uuid and canonical_poi_id=(c.place_binding->>'canonicalPoiId')::uuid and status='saved' for share nowait;
 if found and saved.mapping_digest=c.place_binding->>'mappingDigest' then
 b:=place_actions_private.mapping_v1(saved.selection);
 if b->>'digest'=c.place_binding->>'mappingDigest' and exists(select 1 from public.trip_place_references r where r.id=saved.reference_id and r.trip_id=saved.trip_id and r.owner_id=c.author_id and r.canonical_poi_id=saved.canonical_poi_id and r.freshness='current')
 and not exists(select 1 from privacy_private.trip_deletions d where d.trip_id=saved.trip_id) and not exists(select 1 from public.trip_archives ar where ar.trip_id=saved.trip_id) then
 label:=coalesce(b->>'en',b->>'zh');if not community_private.text_j1(to_jsonb(label),160) then label:=null;end if;end if;end if;end if;
 return jsonb_build_object('id',c.id,'title',c.title,'content',c.content,'contentKind',c.content_kind,'benefitDisclosure',c.benefit_disclosure,
 'authorDisclosure',coalesce((select disclosure from community_private.disclosures_j1 where actor_id=c.author_id),'unknown'),
 'reviewerDisclosure',case when c.reviewed_at is null or c.review_anonymized then null else coalesce((select disclosure from community_private.disclosures_j1 where actor_id=c.reviewer_id),'unknown') end,
 'status',c.status,'version',c.version,'createdAt',c.created_at,'reviewedAt',c.reviewed_at,'withdrawnAt',c.withdrawn_at,'reviewNote',c.author_visible_note,
 'place',case when c.place_binding is null then null else c.place_binding||jsonb_build_object('label',label) end,
 'history',coalesce((select jsonb_agg(jsonb_build_object('action',a.action,'version',a.version,'createdAt',a.created_at) order by a.id) from community_private.audit a where a.submission_id=c.id),'[]'::jsonb),
 'visibility','internal','publiclyVisible',false,'retrievalEligible',false);
end $$;

create function community_private.erase_j1(u uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 -- Ordered row locks avoid inverse owner/reviewer bulk-cleanup acquisition.
 perform 1 from community_private.submissions where author_id=u or reviewer_id=u order by id for update nowait;
 insert into community_private.audit(submission_id,actor_id,action,version)
 select id,u,'deleted',least(version+1,3) from community_private.submissions where author_id=u and status<>'deleted' on conflict do nothing;
 update community_private.submissions set title='',content='',benefit_disclosure=null,place_binding=null,status='deleted',version=least(version+1,3),withdrawn_at=coalesce(withdrawn_at,clock_timestamp()),author_visible_note=null,review_note=null,reviewer_id=null,review_anonymized=(reviewed_at is not null) where author_id=u and status<>'deleted';
 update community_private.submissions set reviewer_id=null,review_note=null,author_visible_note=null,review_anonymized=true where reviewer_id=u;
 update community_private.audit set actor_id=null where actor_id=u;
 delete from community_private.disclosures_j1 where actor_id=u;
 delete from community_private.reviewers where actor_id=u;
end $$;
create function community_private.account_erasure_j1() returns trigger language plpgsql security definer set search_path='' as $$
begin perform community_private.erase_j1(old.id);return old;end $$;
create trigger community_j1_account_erasure before delete on auth.users for each row execute function community_private.account_erasure_j1();

create function community_private.workspace_j1(envelope jsonb) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare u uuid;s uuid;epoch bigint;v jsonb;a text;original jsonb;raw text;digest text;op uuid;cid uuid;internal boolean;
 r community_private.operations_j1%rowtype;c community_private.submissions%rowtype;base jsonb;out jsonb;next_id uuid;binding jsonb;b jsonb;ref public.trip_place_references%rowtype;saved place_actions_private.saved_places%rowtype;counts integer[];
begin
 u:=community_private.actor_j1();s:=(auth.jwt()->>'session_id')::uuid;
 select coalesce((select x.epoch from identity_private.mobile_accounts x where x.owner_id=u),0) into epoch;
 if not community_private.exact_j1(envelope,array['protocol','command','mutationBytes']) or envelope->>'protocol' is distinct from 'community-j1/1' or not community_private.valid_j1(envelope->'command') then raise exception 'INVALID_INPUT';end if;
 v:=envelope->'command';a:=v->>'action';base:=jsonb_build_object('schemaVersion','community-j1/1','actorId',u,'sessionId',s);
 if a='session' then if envelope->'mutationBytes' is distinct from 'null'::jsonb then raise exception 'INVALID_INPUT';end if;return base||jsonb_build_object('kind','session');end if;
 original:=case when a in('operation','abandon') then (v->>'mutationBytes')::jsonb else v end;
 internal:=a in('queue','inspect','review') or original->>'action'='review';
 if internal then perform 1 from community_private.reviewers where actor_id=u and active for share nowait;if not found then raise exception 'COMMUNITY_FORBIDDEN';end if;end if;
 -- Owner data exits and exact receipt resolution remain possible when disabled.
 if a in('submit','queue','inspect','review') or internal then perform 1 from community_private.settings where singleton and enabled for share nowait;if not found then raise exception 'COMMUNITY_DISABLED';end if;end if;
 if a in('submit','review','withdraw','delete') then
 if not community_private.text_j1(envelope->'mutationBytes',10000) or octet_length(envelope->>'mutationBytes')>24000 then raise exception 'INVALID_INPUT';end if;
 raw:=envelope->>'mutationBytes';begin if raw::jsonb is distinct from v then raise exception 'INVALID_INPUT';end if;exception when invalid_text_representation then raise exception 'INVALID_INPUT';end;
 else
 if envelope->'mutationBytes' is distinct from 'null'::jsonb then raise exception 'INVALID_INPUT';end if;
 raw:=case when a in('operation','abandon') then v->>'mutationBytes' else null end;
 end if;
 if a in('mine','queue') then
 select x.id into next_id from community_private.submissions x where (a='mine' and x.author_id=u or a='queue' and x.status='pending') and (v->'cursor'='null' or x.id>(v->>'cursor')::uuid) order by x.id offset 50 limit 1;
 select coalesce(jsonb_agg(community_private.item_j1(x.id) order by x.id),'[]') into out from (select id from community_private.submissions where (a='mine' and author_id=u or a='queue' and status='pending') and (v->'cursor'='null' or id>(v->>'cursor')::uuid) order by id limit 50) x;
 return base||jsonb_build_object('kind','page','submissions',out,'nextCursor',case when next_id is null then null else out->-1->>'id' end,'complete',next_id is null);
 elsif a in('read','inspect') then
 cid:=(v->>'submissionId')::uuid;perform 1 from community_private.submissions where id=cid and (a='inspect' or author_id=u) for share nowait;if not found then raise exception 'COMMUNITY_NOT_FOUND';end if;
 return base||jsonb_build_object('kind','item','submission',community_private.item_j1(cid));
 elsif a='export' then
 counts:=array[(select count(*) from community_private.submissions where author_id=u),(select count(*) from community_private.submissions where reviewer_id=u),(select count(*) from community_private.operations_j1 where owner_id=u)+(select count(*) from community_private.receipts where actor_id=u),(select count(*) from community_private.audit where actor_id=u or submission_id in(select id from community_private.submissions where author_id=u))];
 if 100<any(counts) then raise exception 'COMMUNITY_CAPACITY';end if;
 return base||jsonb_build_object('kind','export','scope','community_module','coverage','complete_for_community',
 'submissions',coalesce((select jsonb_agg(community_private.item_j1(id) order by id) from community_private.submissions where author_id=u),'[]'),
 'reviews',coalesce((select jsonb_agg(jsonb_build_object('submissionId',id,'decision',coalesce(review_decision,case when exists(select 1 from community_private.audit a where a.submission_id=submissions.id and a.action='rejected') then 'reject' else 'approve' end),'note',author_visible_note,'createdAt',reviewed_at) order by id) from community_private.submissions where reviewer_id=u),'[]'),
 'receipts',coalesce((select jsonb_agg(j order by j->>'operationId') from (select jsonb_build_object('operationId',operation_id,'submissionId',submission_id,'action',action,'state',state,'digest',input_digest) j from community_private.operations_j1 where owner_id=u union all select jsonb_build_object('operationId',operation_id,'submissionId',submission_id,'action','unknown','state','committed','digest',input_digest) from community_private.receipts where actor_id=u) z),'[]'),
 'audits',coalesce((select jsonb_agg(jsonb_build_object('submissionId',submission_id,'action',action,'version',version,'createdAt',created_at) order by id) from community_private.audit where actor_id=u or submission_id in(select id from community_private.submissions where author_id=u)),'[]'),
 'reviewerQualification',(select jsonb_build_object('active',active) from community_private.reviewers where actor_id=u),'trustedDisclosure',(select disclosure from community_private.disclosures_j1 where actor_id=u),
 'retained',jsonb_build_array('operation_fences','submission_tombstones','audit_metadata'));
 end if;
 op:=(v->>'operationId')::uuid;cid:=(original->>'submissionId')::uuid;
 if original->>'action'='review' and exists(select 1 from community_private.submissions where id=cid and author_id=u) then raise exception 'COMMUNITY_SELF_REVIEW';end if;
 digest:=encode(sha256(convert_to(raw,'UTF8')),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text||':'||op::text,48));
 if exists(select 1 from community_private.receipts where actor_id=u and operation_id=op) then raise exception 'COMMUNITY_CONFLICT';end if;
 select * into r from community_private.operations_j1 where owner_id=u and operation_id=op for update;
 if found then
 if r.input_digest<>digest or r.session_id<>s or r.session_epoch<>epoch then raise exception 'COMMUNITY_CONFLICT';end if;
 if r.action='review' and exists(select 1 from community_private.submissions where id=r.submission_id and author_id=u) then raise exception 'COMMUNITY_SELF_REVIEW';end if;
 if a in('operation','abandon') then return base||jsonb_build_object('kind','operation','operationId',op,'state',r.state,'submission',case when r.state='committed' and r.submission_id is not null then community_private.item_j1(r.submission_id) else null end);end if;
 if r.state='abandoned' then raise exception 'COMMUNITY_OPERATION_ABANDONED';end if;
 if a='delete' then return base||jsonb_build_object('kind','deleted','operationId',op,'scope','community_module','retained',jsonb_build_array('operation_fences','submission_tombstones','audit_metadata'));end if;
 return base||jsonb_build_object('kind','operation','operationId',op,'state','committed','submission',community_private.item_j1(r.submission_id));
 end if;
 if a='operation' then return base||jsonb_build_object('kind','operation','operationId',op,'state','absent','submission',null);end if;
 if a='abandon' then
 if original->>'action'='review' and exists(select 1 from community_private.submissions where id=cid and author_id=u) then raise exception 'COMMUNITY_SELF_REVIEW';end if;
 insert into community_private.operations_j1(owner_id,operation_id,session_id,session_epoch,input_digest,action,submission_id,state) values(u,op,s,epoch,digest,original->>'action',cid,'abandoned');
 return base||jsonb_build_object('kind','operation','operationId',op,'state','abandoned','submission',null);
 end if;
 if a='delete' then perform community_private.erase_j1(u);
 elsif a='submit' then
 if exists(select 1 from community_private.submissions where id=cid) then raise exception 'COMMUNITY_CONFLICT';end if;
 if v->'place'<>'null'::jsonb then
 perform 1 from public.trips where id=(v->'place'->>'tripId')::uuid and owner_id=u and head_version=(v->'place'->>'expectedTripVersion')::numeric and not exists(select 1 from privacy_private.trip_deletions d where d.trip_id=trips.id) and not exists(select 1 from public.trip_archives ar where ar.trip_id=trips.id) for share nowait;if not found then raise exception 'COMMUNITY_PLACE_UNAVAILABLE';end if;
 select * into ref from public.trip_place_references where id=(v->'place'->>'placeReferenceId')::uuid and trip_id=(v->'place'->>'tripId')::uuid and owner_id=u and reference_kind='canonical' and freshness='current' for share nowait;if not found then raise exception 'COMMUNITY_PLACE_UNAVAILABLE';end if;
 select * into saved from place_actions_private.saved_places where owner_id=u and trip_id=ref.trip_id and reference_id=ref.id and canonical_poi_id=ref.canonical_poi_id and status='saved' and mapping_digest=v->'place'->>'mappingDigest' for share nowait;
 if not found then raise exception 'COMMUNITY_PLACE_UNAVAILABLE';end if;
 b:=place_actions_private.mapping_v1(saved.selection);
 if b is null or b->>'digest' is distinct from v->'place'->>'mappingDigest' then raise exception 'COMMUNITY_PLACE_UNAVAILABLE';end if;
 binding:=jsonb_build_object('tripId',ref.trip_id,'placeReferenceId',ref.id,'canonicalPoiId',ref.canonical_poi_id,'mappingDigest',b->>'digest');
 end if;
 insert into community_private.submissions(id,author_id,title,content,consent,author_identity,content_kind,benefit_disclosure,place_binding) values(cid,u,v->>'title',v->>'content','internal-review-v1','registered_user',v->>'contentKind',v->>'benefitDisclosure',binding);
 insert into community_private.audit(submission_id,actor_id,action,version) values(cid,u,'submitted',1);
 else
 select * into c from community_private.submissions where id=cid for update nowait;if not found or a='withdraw' and c.author_id<>u then raise exception 'COMMUNITY_NOT_FOUND';end if;
 if a='review' and c.author_id=u then raise exception 'COMMUNITY_SELF_REVIEW';end if;
 if c.version<>(v->>'expectedVersion')::integer or c.status in('withdrawn','deleted') then raise exception 'COMMUNITY_CONFLICT';end if;
 if a='review' then
 if c.status<>'pending' then raise exception 'COMMUNITY_CONFLICT';end if;
 update community_private.submissions set status=case when v->>'decision'='approve' then 'published' else 'rejected' end,version=2,review_decision=v->>'decision',reviewer_id=u,review_note=v->>'note',author_visible_note=v->>'note',reviewed_at=clock_timestamp() where id=cid;
 insert into community_private.audit(submission_id,actor_id,action,version) values(cid,u,'reviewed',2),(cid,u,case when v->>'decision'='approve' then 'published' else 'rejected' end,2);
 else
 update community_private.submissions set status='withdrawn',version=version+1,title='',content='',benefit_disclosure=null,place_binding=null,withdrawn_at=clock_timestamp() where id=cid;
 insert into community_private.audit(submission_id,actor_id,action,version) values(cid,u,'withdrawn',c.version+1);
 end if;end if;
 insert into community_private.operations_j1(owner_id,operation_id,session_id,session_epoch,input_digest,action,submission_id,state) values(u,op,s,epoch,digest,a,cid,'committed');
 if a='delete' then return base||jsonb_build_object('kind','deleted','operationId',op,'scope','community_module','retained',jsonb_build_array('operation_fences','submission_tombstones','audit_metadata'));end if;
 return base||jsonb_build_object('kind','operation','operationId',op,'state','committed','submission',community_private.item_j1(cid));
end $$;

-- Preserve the original function signature, owner, ACL and every legacy body byte.
-- Only the dispatch prefix is inserted; no second public entry or new GRANT.
do $$declare old_body text;new_body text;begin
 select prosrc into old_body from pg_proc where oid='public.community_workspace(jsonb)'::regprocedure;
 if old_body not like '%u:=community_private.current_actor();%' then raise exception 'COMMUNITY_LEGACY_BODY_CHANGED';end if;
 new_body:=replace(old_body,'u:=community_private.current_actor();',E'if p_input ? \'protocol\' then return community_private.workspace_j1(p_input);end if;\n  u:=community_private.actor_j1();\n  if p_input ? \'operationId\' and community_private.uuid_j1(p_input->\'operationId\') then\n    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text||\':\'||(p_input->>\'operationId\'),48));\n    if exists(select 1 from community_private.operations_j1 where owner_id=auth.uid() and operation_id=(p_input->>\'operationId\')::uuid) then raise exception \'COMMUNITY_CONFLICT\';end if;\n  end if;\n  u:=community_private.current_actor();');
 execute format('create or replace function public.community_workspace(p_input jsonb) returns jsonb language plpgsql security definer set search_path=%L as %L','',''||new_body);
end $$;
revoke all on all functions in schema community_private from public,anon,authenticated,service_role;
