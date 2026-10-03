-- #228 bounded D5 existing entitlements, no financial writer/delete/GRANT.
do $$begin if to_regclass('export_private.memory_section_progress_v1') is null or to_regclass('public.storekit_grants') is null then raise exception 'D5_EXPORT_DEPENDENCY_MISSING';end if;end $$;
create table export_private.entitlement_source_revisions_v1(owner_id uuid primary key references auth.users(id) on delete cascade,revision bigint not null default 1 check(revision between 1 and 9007199254740990));
alter table export_private.entitlement_source_revisions_v1 enable row level security;
revoke all on export_private.entitlement_source_revisions_v1 from public,anon,authenticated,service_role;
alter table export_private.core_jobs_v1 add column entitlement_source_revision bigint check(entitlement_source_revision between 1 and 9007199254740990);
create table export_private.entitlement_page_progress_v1(request_id uuid not null references export_private.core_jobs_v1(request_id) on delete cascade,generation integer not null,lease_id uuid not null,source_revision bigint not null,pages integer not null,rows integer not null,last_cursor jsonb,last_limit integer,next_cursor jsonb,terminal boolean not null,primary key(request_id,generation));
alter table export_private.entitlement_page_progress_v1 enable row level security;
revoke all on export_private.entitlement_page_progress_v1 from public,anon,authenticated,service_role;
create function export_private.bump_entitlement_source_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare owners uuid[];u uuid;
begin
 owners:=case when tg_op='INSERT' then array[new.owner_id] when tg_op='DELETE' then array[old.owner_id] else array[old.owner_id,new.owner_id] end;
 for u in select distinct x from unnest(owners) x where x is not null order by x loop
  if not exists(select 1 from auth.users where id=u) then continue;end if;
  perform 1 from auth.users where id=u for key share nowait;perform 1 from identity_private.mobile_accounts where owner_id=u for update nowait;
  insert into export_private.entitlement_source_revisions_v1(owner_id) values(u) on conflict do nothing;
  update export_private.entitlement_source_revisions_v1 set revision=revision+1 where owner_id=u;
 end loop;if tg_op='DELETE' then return old;else return new;end if;
end $$;
create trigger entitlement_export_source_v1 before insert or update or delete on public.storekit_grants for each row execute function export_private.bump_entitlement_source_v1();
create function export_private.entitlement_source_current_v1(j export_private.core_jobs_v1) returns boolean language plpgsql security definer set search_path='' as $$
declare source bigint;
begin if j.entitlement_source_revision is null then return true;end if;select revision into source from export_private.entitlement_source_revisions_v1 where owner_id=j.owner_id for share nowait;return coalesce(source=j.entitlement_source_revision,false);exception when lock_not_available then return false;end $$;
create function export_private.entitlement_page_v1(v jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare req uuid;lease uuid;gen integer;j export_private.core_jobs_v1;progress export_private.entitlement_page_progress_v1%rowtype;cursor jsonb;limit_n integer;revision bigint;page jsonb;more boolean;next_cursor jsonb;n integer;replay boolean:=false;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 if jsonb_typeof(v) is distinct from 'object' or not(v ?& array['requestId','leaseId','generation','cursor','limit']) or v-array['requestId','leaseId','generation','cursor','limit']<>'{}' or jsonb_typeof(v->'requestId') is distinct from 'string' or v->>'requestId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or jsonb_typeof(v->'leaseId') is distinct from 'string' or v->>'leaseId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or jsonb_typeof(v->'generation') is distinct from 'number' or v->>'generation' !~ '^[1-3]$' or jsonb_typeof(v->'limit') is distinct from 'number' or v->>'limit' !~ '^[1-9][0-9]{0,2}$' then raise exception 'INVALID_INPUT';end if;
 req:=(v->>'requestId')::uuid;lease:=(v->>'leaseId')::uuid;gen:=(v->>'generation')::integer;limit_n:=(v->>'limit')::integer;
 cursor:=v->'cursor';if cursor<>'null'::jsonb and (jsonb_typeof(cursor) is distinct from 'object' or not(cursor ?& array['environment','transactionId']) or cursor-array['environment','transactionId']<>'{}' or cursor->>'environment' is distinct from 'Sandbox' or jsonb_typeof(cursor->'transactionId') is distinct from 'string' or length(cursor->>'transactionId') not between 1 and 128) then raise exception 'INVALID_INPUT';end if;
 j:=export_private.lock_job_v1(req,true);if j.request_id is null or not export_private.live_lease_v1(j,lease,gen) then return jsonb_build_object('kind','unavailable');end if;if limit_n>(j.policy_snapshot->>'page_size')::integer or limit_n>100 then raise exception 'INVALID_INPUT';end if;
 insert into export_private.entitlement_source_revisions_v1(owner_id) values(j.owner_id) on conflict do nothing;select s.revision into revision from export_private.entitlement_source_revisions_v1 s where s.owner_id=j.owner_id for share nowait;
 if j.entitlement_source_revision is null then update export_private.core_jobs_v1 set entitlement_source_revision=revision where request_id=req returning * into j;elsif j.entitlement_source_revision<>revision then return jsonb_build_object('kind','unavailable');end if;
 select * into progress from export_private.entitlement_page_progress_v1 where request_id=req and generation=gen for update;
 if found then
  if progress.lease_id<>lease or progress.source_revision<>revision then raise exception 'EXPORT_SOURCE_CHANGED';end if;
  if progress.last_cursor=cursor then if progress.last_limit<>limit_n then raise exception 'EXPORT_SOURCE_CURSOR_CONFLICT';end if;replay:=true;
  elsif progress.terminal or progress.next_cursor is distinct from cursor then raise exception 'INVALID_EXPORT_CURSOR';end if;
 elsif cursor<>'null'::jsonb then raise exception 'INVALID_EXPORT_CURSOR';end if;
 if cursor<>'null'::jsonb and not exists(select 1 from public.storekit_grants where owner_id=j.owner_id and environment=cursor->>'environment' and transaction_id=cursor->>'transactionId') then raise exception 'INVALID_EXPORT_CURSOR';end if;
 with candidates as(select environment,transaction_id,jsonb_build_object('environment',environment,'transactionId',transaction_id,'productId',product_id,'purchaseAt',export_private.ms_v1(purchase_at),'startsAt',export_private.ms_v1(starts_at),'endsAt',export_private.ms_v1(ends_at),'catalogVersion',catalog_version,'policyVersion',policy_version,'capacitySnapshot',capacity_snapshot,'state',state,'revokedAt',export_private.ms_v1(revoked_at)) item from public.storekit_grants where owner_id=j.owner_id and (cursor='null'::jsonb or (environment collate "C",transaction_id collate "C")>(cursor->>'environment' collate "C",cursor->>'transactionId' collate "C")) order by environment collate "C",transaction_id collate "C" limit limit_n+1),delivered as(select * from candidates order by environment collate "C",transaction_id collate "C" limit limit_n)
 select coalesce((select jsonb_agg(item order by environment collate "C",transaction_id collate "C") from delivered),'[]'),(select count(*)>limit_n from candidates),(select jsonb_build_object('environment',environment,'transactionId',transaction_id) from delivered order by environment collate "C" desc,transaction_id collate "C" desc limit 1),(select count(*) from delivered) into page,more,next_cursor,n;
 if not replay then if coalesce(progress.pages,0)+coalesce((select sum(p.pages) from export_private.memory_section_progress_v1 p where p.request_id=req and p.generation=gen),0)>=(j.policy_snapshot->>'max_pages')::integer then raise exception 'EXPORT_PAGE_LIMIT';end if;insert into export_private.entitlement_page_progress_v1 values(req,gen,lease,revision,1,n,cursor,limit_n,case when more then next_cursor else null end,not more) on conflict on constraint entitlement_page_progress_v1_pkey do update set pages=entitlement_page_progress_v1.pages+1,rows=entitlement_page_progress_v1.rows+n,last_cursor=cursor,last_limit=limit_n,next_cursor=case when more then next_cursor else null end,terminal=not more;end if;
 return jsonb_build_object('schemaVersion','entitlements-core-export/1','section','grants','sourceRevision',revision,'items',page,'hasMore',more,'nextCursor',case when more then next_cursor else null end,'sectionComplete',not more);
end $$;
create function export_private.entitlement_commit_progress_v1(j export_private.core_jobs_v1,v jsonb,l uuid,g integer) returns boolean language plpgsql stable security definer set search_path='' as $$
declare m jsonb;p export_private.entitlement_page_progress_v1%rowtype;
begin
 if jsonb_typeof(v) is distinct from 'array' then return false;end if;select x into m from jsonb_array_elements(v) x where x->>'module'='entitlements';if m is null then return false;end if;
 select * into p from export_private.entitlement_page_progress_v1 where request_id=j.request_id and generation=g and lease_id=l and source_revision=j.entitlement_source_revision;
 if not found then return j.entitlement_source_revision is null and m->'pages'='0'::jsonb and m->'rows'='0'::jsonb and m->>'status' in ('unavailable','failed','partial') and m->>'reason' in ('HANDLER_MISSING','SOURCE_UNAVAILABLE','BOUNDED_LIMIT');end if;
 if m->'pages' is distinct from to_jsonb(p.pages) or m->'rows' is distinct from to_jsonb(p.rows) or export_private.entitlement_source_current_v1(j) is distinct from true then return false;end if;
 if m->>'status'='complete' or m->>'reason'='LIVE_TRAVERSAL' then return p.terminal;end if;return m->>'status'='partial' and m->>'reason' in ('BOUNDED_LIMIT','SOURCE_UNAVAILABLE');
end $$;
do $$declare definition text;needle text;begin
 definition:=pg_get_functiondef('export_private.lock_job_v1(uuid,boolean)'::regprocedure);needle:=E'if export_private.memory_source_current_v1(j) is distinct from true then return null;end if;\n return j;';
 if position(needle in definition)=0 or position('entitlement_source_current_v1' in definition)>0 then raise exception 'D5_LOCK_JOB_DEPENDENCY_CHANGED';end if;
 execute replace(definition,needle,E'if export_private.memory_source_current_v1(j) is distinct from true then return null;end if;\n if export_private.entitlement_source_current_v1(j) is distinct from true then return null;end if;\n return j;');
end $$;
do $$declare definition text;needle text;begin
 definition:=pg_get_functiondef('public.privacy_core_export_v1(text,jsonb)'::regprocedure);needle:='if p_action=''memory_page'' then return export_private.core_memory_page_v1(p_input);end if;';
 if position(needle in definition)=0 or position('entitlement_page_v1' in definition)>0 or position('artifact:=p_input->''artifact'';' in definition)=0 then raise exception 'D5_EXPORT_ENTRY_DEPENDENCY_CHANGED';end if;
 definition:=replace(definition,needle,needle||E'\n if p_action=''entitlement_page'' then return export_private.entitlement_page_v1(p_input);end if;');
 definition:=replace(definition,'artifact:=p_input->''artifact'';',E'if export_private.entitlement_commit_progress_v1(j,p_input->''modules'',lease,gen) is distinct from true then raise exception ''INVALID_OUTPUT'';end if;\n  artifact:=p_input->''artifact'';');execute definition;
end $$;
do $$declare f regprocedure;begin for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='export_private' and p.proname like '%entitlement%' loop execute 'revoke all on function '||f||' from public,anon,authenticated,service_role';end loop;end $$;
notify pgrst,'reload schema';
