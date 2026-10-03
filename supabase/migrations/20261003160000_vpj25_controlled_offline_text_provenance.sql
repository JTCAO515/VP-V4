-- #215: controlled user text submission, not copyright/authorship verification.
-- Default closed. No roles, grants, enabled policies, signer keys or target activation.
create schema if not exists offline_private;
revoke all on schema offline_private from public,anon,authenticated,service_role;
create table offline_private.trip_text_state_v1 (
 trip_id uuid primary key references public.trips(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 generation bigint not null default 1 check(generation between 1 and 9007199254740990)
);
create table offline_private.text_commands_v1 (
 operation_id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,
 trip_id uuid not null references public.trips(id) on delete cascade,
 input_digest text not null check(input_digest ~ '^[a-f0-9]{64}$'),
 action text not null check(action in ('submit','revoke')),
 session_epoch bigint not null,generation bigint not null,
 proposal_id uuid references public.trip_proposals(id) on delete cascade,
 proposal_revision integer,base_version integer,patch_digest text,
 receipt jsonb not null,created_at timestamptz not null default clock_timestamp()
);
create table offline_private.text_sources_v1 (
 id uuid primary key default gen_random_uuid(),operation_id uuid not null references offline_private.text_commands_v1(operation_id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,trip_id uuid not null references public.trips(id) on delete cascade,
 proposal_id uuid not null references public.trip_proposals(id) on delete cascade,proposal_revision integer not null,
 base_version integer not null,patch_digest text not null,
 field text not null check(field in ('days.date','days.items.title')),day_id text not null,item_id text,
 field_key text not null,value_digest text not null check(value_digest ~ '^[a-f0-9]{64}$'),
 purpose text not null default 'offline_cache' check(purpose='offline_cache'),
 session_epoch bigint not null,generation bigint not null,
 unique(operation_id,field_key),check((field='days.date')=(item_id is null))
);
create table offline_private.text_version_bindings_v1 (
 owner_id uuid not null references auth.users(id) on delete cascade,
 trip_id uuid not null,version integer not null,field_key text not null,
 source_id uuid not null references offline_private.text_sources_v1(id) on delete cascade,
 primary key(trip_id,version,field_key),
 foreign key(trip_id,version) references public.trip_version_snapshots(trip_id,version) on delete cascade
);
alter table offline_private.trip_text_state_v1 enable row level security;
alter table offline_private.text_commands_v1 enable row level security;
alter table offline_private.text_sources_v1 enable row level security;
alter table offline_private.text_version_bindings_v1 enable row level security;
revoke all on offline_private.trip_text_state_v1,offline_private.text_commands_v1,offline_private.text_sources_v1,offline_private.text_version_bindings_v1 from public,anon,authenticated,service_role;
create index offline_text_source_owner_trip on offline_private.text_sources_v1(owner_id,trip_id,id);
create function offline_private.immutable_text_receipt_v1() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'IMMUTABLE_OFFLINE_SOURCE';end $$;
revoke all on function offline_private.immutable_text_receipt_v1() from public,anon,authenticated,service_role;
create trigger immutable_offline_command before update on offline_private.text_commands_v1 for each row execute function offline_private.immutable_text_receipt_v1();
create trigger immutable_offline_source before update on offline_private.text_sources_v1 for each row execute function offline_private.immutable_text_receipt_v1();
create trigger immutable_offline_binding before update on offline_private.text_version_bindings_v1 for each row execute function offline_private.immutable_text_receipt_v1();

create function offline_private.current_actor_v1() returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor uuid:=auth.uid();s jsonb;
begin
 if actor is null or auth.role() is distinct from 'authenticated' then raise exception 'UNAUTHENTICATED';end if;
 perform 1 from auth.users where id=actor for key share nowait;if not found then raise exception 'UNAUTHENTICATED';end if;
 perform identity_private.guard_mobile_rpc_v2();s:=public.native_session_v2('session');
 if s->>'subject' is distinct from actor::text or s->>'sessionId' is distinct from auth.jwt()->>'session_id' or jsonb_typeof(s->'mobileEpoch') is distinct from 'number' or (s->>'mobileEpoch')::bigint<1 then raise exception 'UNAUTHENTICATED';end if;
 return s;
end $$;
revoke all on function offline_private.current_actor_v1() from public,anon,authenticated,service_role;
create function offline_private.field_digest_v1(p_field text,p_day text,p_item text,p_value text) returns text language sql immutable set search_path='' as $$
 select case when p_value is null then null else encode(sha256(convert_to('['||turn_private.planning_v2_json_string_v1(p_field)||','||turn_private.planning_v2_json_string_v1(p_day)||','||case when p_item is null then 'null' else turn_private.planning_v2_json_string_v1(p_item) end||','||turn_private.planning_v2_json_string_v1(p_value)||']','UTF8')),'hex') end;
$$;
revoke all on function offline_private.field_digest_v1(text,text,text,text) from public,anon,authenticated,service_role;
create function offline_private.field_value_v1(p_content jsonb,p_field text,p_day text,p_item text) returns text language sql immutable set search_path='' as $$
 select case when p_field='days.date' then d->>'date' else (select i->>'title' from jsonb_array_elements(d->'items') i where i->>'id'=p_item) end
 from jsonb_array_elements(p_content->'days') d where d->>'id'=p_day;
$$;
revoke all on function offline_private.field_value_v1(jsonb,text,text,text) from public,anon,authenticated,service_role;
create function offline_private.canonical_v1(p_value jsonb) returns text language plpgsql immutable set search_path='' as $$
#variable_conflict use_variable
declare out_text text;
begin
 case jsonb_typeof(p_value)
 when 'object' then select '{'||coalesce(string_agg(turn_private.planning_v2_json_string_v1(key)||':'||offline_private.canonical_v1(value),',' order by key collate "C"),'')||'}' into out_text from jsonb_each(p_value);
 when 'array' then select '['||coalesce(string_agg(offline_private.canonical_v1(value),',' order by n),'')||']' into out_text from jsonb_array_elements(p_value) with ordinality a(value,n);
 when 'string' then out_text:=turn_private.planning_v2_json_string_v1(p_value#>>'{}');
 else out_text:=p_value::text;end case;
 return out_text;
end $$;
revoke all on function offline_private.canonical_v1(jsonb) from public,anon,authenticated,service_role;

create function public.submit_offline_trip_text_proposal_v1(p_trip_id uuid,p_operation_id uuid,p_expected_head_version integer,p_date text,p_title text,p_save_offline boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor jsonb;owner_id uuid;epoch bigint;trip public.trips%rowtype;state offline_private.trip_text_state_v1%rowtype;
 previous offline_private.text_commands_v1%rowtype;content jsonb;title text;day_id text;item_id text;patch jsonb;digest text;patch_digest text;r record;receipt jsonb;parsed_date date;
begin
 actor:=offline_private.current_actor_v1();owner_id:=(actor->>'subject')::uuid;epoch:=(actor->>'mobileEpoch')::bigint;
 if p_trip_id is null or p_operation_id is null or p_expected_head_version is null or p_expected_head_version not between 0 and 999999999 or p_save_offline is distinct from true or p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' or p_title is null or octet_length(p_title)>2048 then raise exception 'INVALID_INPUT';end if;
 begin parsed_date:=p_date::date;exception when others then raise exception 'INVALID_INPUT';end;
 if to_char(parsed_date,'YYYY-MM-DD')<>p_date then raise exception 'INVALID_INPUT';end if;
 title:=btrim(p_title,E' \t\n\r\f'||chr(11)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279));
 if length(title)+(select count(*) from regexp_split_to_table(title,'') c where ascii(c)>65535) not between 1 and 160 then raise exception 'INVALID_INPUT';end if;
 select * into trip from public.trips where id=p_trip_id and public.trips.owner_id=owner_id for update;
 if not found then raise exception 'FORBIDDEN';end if;
 if exists(select 1 from public.trip_archives where trip_id=p_trip_id) or exists(select 1 from privacy_private.trip_deletions where trip_id=p_trip_id) then raise exception 'PROPOSAL_NOT_CONFIRMABLE';end if;
 digest:=encode(sha256(convert_to(jsonb_build_array(owner_id,p_trip_id,p_operation_id,p_expected_head_version,p_date,title,true,'offline-text-submit/1')::text,'UTF8')),'hex');
 select * into previous from offline_private.text_commands_v1 where operation_id=p_operation_id;
 if found then
  if previous.owner_id<>owner_id then raise exception 'FORBIDDEN';end if;
  if previous.input_digest<>digest then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;
  return previous.receipt||jsonb_build_object('reused',true);
 end if;
 if trip.head_version<>p_expected_head_version then raise exception 'STALE_TRIP_VERSION';end if;
 select s.content into content from public.trip_version_snapshots s where s.trip_id=p_trip_id and s.owner_id=owner_id and s.version=p_expected_head_version;
 if content is null or content->>'title' is distinct from trip.title then raise exception 'PROJECTION_LAG';end if;
 day_id:='ofd_'||replace(p_operation_id::text,'-','');item_id:='ofi_'||replace(p_operation_id::text,'-','');
 if exists(select 1 from jsonb_array_elements(content->'days') d where d->>'date'=p_date) then raise exception 'OFFLINE_DATE_EXISTS';end if;
 if exists(select 1 from jsonb_array_elements(content->'days') d where d->>'id'=day_id or exists(select 1 from jsonb_array_elements(d->'items') i where i->>'id'=item_id)) then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;
 patch:=jsonb_build_object('expectedVersion',p_expected_head_version,'operations',jsonb_build_array(jsonb_build_object('kind','upsert_day','dayId',day_id,'date',p_date),jsonb_build_object('kind','upsert_item','dayId',day_id,'itemId',item_id,'title',title)));
 select * into r from public.create_trip_proposal_patch(p_trip_id,patch);
 insert into offline_private.trip_text_state_v1(trip_id,owner_id) values(p_trip_id,owner_id) on conflict do nothing;
 select * into state from offline_private.trip_text_state_v1 where trip_id=p_trip_id for update;
 if state.owner_id<>owner_id then raise exception 'FORBIDDEN';end if;
 patch_digest:=encode(sha256(convert_to(patch::text,'UTF8')),'hex');
 receipt:=jsonb_build_object('kind','offline_text_proposal/1','operationId',p_operation_id,'proposalId',r.proposal_id,'proposalRevision',r.revision,'baseTripVersion',r.base_trip_version,'sessionEpoch',epoch,'dayId',day_id,'itemId',item_id,'provenanceState','candidate','reused',false);
 insert into offline_private.text_commands_v1(operation_id,owner_id,trip_id,input_digest,action,session_epoch,generation,proposal_id,proposal_revision,base_version,patch_digest,receipt) values(p_operation_id,owner_id,p_trip_id,digest,'submit',epoch,state.generation,r.proposal_id,r.revision,r.base_trip_version,patch_digest,receipt);
 insert into offline_private.text_sources_v1(operation_id,owner_id,trip_id,proposal_id,proposal_revision,base_version,patch_digest,field,day_id,item_id,field_key,value_digest,session_epoch,generation)
 values(p_operation_id,owner_id,p_trip_id,r.proposal_id,r.revision,r.base_trip_version,patch_digest,'days.date',day_id,null,'date:'||day_id,offline_private.field_digest_v1('days.date',day_id,null,p_date),epoch,state.generation),
 (p_operation_id,owner_id,p_trip_id,r.proposal_id,r.revision,r.base_trip_version,patch_digest,'days.items.title',day_id,item_id,'title:'||day_id||':'||item_id,offline_private.field_digest_v1('days.items.title',day_id,item_id,title),epoch,state.generation);
 perform offline_private.current_actor_v1();return receipt;
end $$;
revoke all on function public.submit_offline_trip_text_proposal_v1(uuid,uuid,integer,text,text,boolean) from public,anon,authenticated,service_role;

create function offline_private.bind_confirmed_text_v1() returns trigger language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare p public.trip_proposals%rowtype;s public.trip_version_snapshots%rowtype;state offline_private.trip_text_state_v1%rowtype;
 account identity_private.mobile_accounts%rowtype;candidate offline_private.text_sources_v1%rowtype;expected_digest text;value text;native_match boolean;
begin
 if new.proposal_id is null then return new;end if;
 select * into p from public.trip_proposals where id=new.proposal_id and owner_id=new.owner_id;
 -- Legacy/unbound idempotency receipts never acquire new provenance.
 if not found or p.status<>'applied' or new.outcome<>'applied' or new.resulting_version<>p.base_trip_version+1 then return new;end if;
 if p.rollback_snapshot_version is not null then return new;end if;
 select * into state from offline_private.trip_text_state_v1 where trip_id=p.trip_id and owner_id=p.owner_id for update;
 if not found then return new;end if;
 select * into s from public.trip_version_snapshots where trip_id=p.trip_id and owner_id=p.owner_id and version=new.resulting_version;
 if not found or not exists(select 1 from public.trip_events where trip_id=p.trip_id and owner_id=p.owner_id and resulting_version=s.version and proposal_id=p.id and event_type='proposal_applied') then raise exception 'OFFLINE_SOURCE_BINDING_MISMATCH';end if;
 select * into account from identity_private.mobile_accounts where owner_id=p.owner_id;
 native_match:=auth.uid()=p.owner_id and auth.role()='authenticated' and account.session_id::text=auth.jwt()->>'session_id' and exists(select 1 from auth.sessions where id=account.session_id and user_id=p.owner_id);
 expected_digest:='trip-v2:'||encode(sha256(convert_to(jsonb_build_object('id',p.id,'owner_id',p.owner_id,'trip_id',p.trip_id,'revision',p.revision,'base_trip_version',p.base_trip_version,'patch',p.patch,'rollback_snapshot_version',p.rollback_snapshot_version,'parent_proposal_id',p.parent_proposal_id,'expires_at',p.expires_at,'created_at',p.created_at)::text,'UTF8')),'hex');
 if expected_digest is distinct from new.digest then return new;end if;
 -- Inherit only the exact still-eligible field, never all contents of a Trip.
 insert into offline_private.text_version_bindings_v1(owner_id,trip_id,version,field_key,source_id)
 select p.owner_id,p.trip_id,s.version,b.field_key,c.id from offline_private.text_version_bindings_v1 b
 join offline_private.text_sources_v1 c on c.id=b.source_id and c.owner_id=p.owner_id and c.trip_id=p.trip_id
 where b.trip_id=p.trip_id and b.version=p.base_trip_version and b.owner_id=p.owner_id and c.purpose='offline_cache'
 and c.session_epoch=account.epoch and c.generation=state.generation
 and offline_private.field_digest_v1(c.field,c.day_id,c.item_id,offline_private.field_value_v1(s.content,c.field,c.day_id,c.item_id))=c.value_digest;
 if native_match is not true then return new;end if;
 for candidate in select * from offline_private.text_sources_v1 where proposal_id=p.id and owner_id=p.owner_id loop
  if candidate.trip_id<>p.trip_id or candidate.proposal_revision<>p.revision or candidate.base_version<>p.base_trip_version
   or candidate.patch_digest<>encode(sha256(convert_to(p.patch::text,'UTF8')),'hex') then raise exception 'OFFLINE_SOURCE_BINDING_MISMATCH';end if;
  if candidate.session_epoch<>account.epoch or candidate.generation<>state.generation then continue;end if;
  value:=offline_private.field_value_v1(s.content,candidate.field,candidate.day_id,candidate.item_id);
  if offline_private.field_digest_v1(candidate.field,candidate.day_id,candidate.item_id,value) is distinct from candidate.value_digest then raise exception 'OFFLINE_SOURCE_BINDING_MISMATCH';end if;
  insert into offline_private.text_version_bindings_v1(owner_id,trip_id,version,field_key,source_id) values(p.owner_id,p.trip_id,s.version,candidate.field_key,candidate.id);
 end loop;
 return new;
end $$;
revoke all on function offline_private.bind_confirmed_text_v1() from public,anon,authenticated,service_role;
create trigger bind_confirmed_offline_text_v1 after insert on public.trip_idempotency for each row execute function offline_private.bind_confirmed_text_v1();

create function public.read_offline_trip_text_provenance_v1(p_trip_id uuid,p_expected_head_version integer,p_expected_epoch bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor jsonb;owner_id uuid;epoch bigint;t public.trips%rowtype;s public.trip_version_snapshots%rowtype;state offline_private.trip_text_state_v1%rowtype;
 day jsonb;item jsonb;days jsonb:='[]';items jsonb;fields jsonb:='[]';source offline_private.text_sources_v1%rowtype;payload jsonb;excluded_days integer:=0;excluded_items integer:=0;
begin
 actor:=offline_private.current_actor_v1();owner_id:=(actor->>'subject')::uuid;epoch:=(actor->>'mobileEpoch')::bigint;
 if p_trip_id is null or p_expected_head_version is null or p_expected_head_version not between 1 and 999999999 or p_expected_epoch is distinct from epoch then return jsonb_build_object('kind','unavailable','reason','STALE_BASIS');end if;
 select * into t from public.trips where id=p_trip_id and public.trips.owner_id=owner_id for share nowait;
 if not found then raise exception 'FORBIDDEN';end if;
 if t.head_version<>p_expected_head_version or exists(select 1 from public.trip_archives where trip_id=p_trip_id) or exists(select 1 from privacy_private.trip_deletions where trip_id=p_trip_id) then return jsonb_build_object('kind','unavailable','reason','STALE_BASIS');end if;
 select * into s from public.trip_version_snapshots where trip_id=p_trip_id and public.trip_version_snapshots.owner_id=owner_id and version=p_expected_head_version;
 if not found or s.title<>t.title or not exists(select 1 from public.trip_events e join public.trip_proposals p on p.id=e.proposal_id and p.owner_id=e.owner_id join public.trip_idempotency r on r.proposal_id=p.id and r.owner_id=p.owner_id and r.resulting_version=e.resulting_version where e.trip_id=p_trip_id and e.owner_id=owner_id and e.resulting_version=p_expected_head_version and p.status='applied' and p.base_trip_version+1=e.resulting_version) then return jsonb_build_object('kind','unavailable','reason','NO_PROVENANCE');end if;
 select * into state from offline_private.trip_text_state_v1 where trip_id=p_trip_id and offline_private.trip_text_state_v1.owner_id=owner_id for share nowait;
 if not found then return jsonb_build_object('kind','unavailable','reason','NO_PROVENANCE');end if;
 for day in select value from jsonb_array_elements(s.content->'days') order by value->>'date',value->>'id' collate "C" loop
  select c.* into source from offline_private.text_version_bindings_v1 b join offline_private.text_sources_v1 c on c.id=b.source_id
   where b.trip_id=p_trip_id and b.version=p_expected_head_version and b.owner_id=owner_id and c.owner_id=owner_id and c.trip_id=p_trip_id and c.field='days.date' and c.day_id=day->>'id' and c.purpose='offline_cache' and c.session_epoch=epoch and c.generation=state.generation and c.value_digest=offline_private.field_digest_v1('days.date',day->>'id',null,day->>'date');
  if not found then excluded_days:=excluded_days+1;excluded_items:=excluded_items+jsonb_array_length(day->'items');continue;end if;
  fields:=fields||jsonb_build_array(jsonb_build_object('field',source.field,'dayId',source.day_id,'itemId',null,'sourceReceiptId',source.id,'valueDigest',source.value_digest));items:='[]';
  for item in select value from jsonb_array_elements(day->'items') order by value->>'id' collate "C" loop
   select c.* into source from offline_private.text_version_bindings_v1 b join offline_private.text_sources_v1 c on c.id=b.source_id
    where b.trip_id=p_trip_id and b.version=p_expected_head_version and b.owner_id=owner_id and c.owner_id=owner_id and c.trip_id=p_trip_id and c.field='days.items.title' and c.day_id=day->>'id' and c.item_id=item->>'id' and c.purpose='offline_cache' and c.session_epoch=epoch and c.generation=state.generation and c.value_digest=offline_private.field_digest_v1('days.items.title',day->>'id',item->>'id',item->>'title');
   if not found then excluded_items:=excluded_items+1;continue;end if;
   items:=items||jsonb_build_array(jsonb_build_object('id',item->'id','title',item->'title'));
   fields:=fields||jsonb_build_array(jsonb_build_object('field',source.field,'dayId',source.day_id,'itemId',source.item_id,'sourceReceiptId',source.id,'valueDigest',source.value_digest));
  end loop;
  if jsonb_array_length(items)>100 then return jsonb_build_object('kind','unavailable','reason','NO_PROVENANCE');end if;
  days:=days||jsonb_build_array(jsonb_build_object('id',day->'id','date',day->'date','items',items));
 end loop;
 if days='[]'::jsonb or jsonb_array_length(days)>60 then return jsonb_build_object('kind','unavailable','reason','NO_PROVENANCE');end if;
 payload:=jsonb_build_object('days',days);
 if octet_length(offline_private.canonical_v1(payload))>128000 then return jsonb_build_object('kind','unavailable','reason','NO_PROVENANCE');end if;
 perform offline_private.current_actor_v1();
 return jsonb_build_object('kind','offline_text_provenance/1','sourceSemantics','controlled_user_text_submission','subject',owner_id,'sessionEpoch',epoch,'tripId',p_trip_id,'headVersion',p_expected_head_version,'purpose','offline_cache','generation',state.generation,'qualifiedPayload',payload,'qualifiedPayloadDigest',encode(sha256(convert_to(offline_private.canonical_v1(payload),'UTF8')),'hex'),'fields',fields,'coverage',jsonb_build_object('kind',case when excluded_days+excluded_items=0 then 'full' else 'partial' end,'excludedDays',excluded_days,'excludedItems',excluded_items));
end $$;
revoke all on function public.read_offline_trip_text_provenance_v1(uuid,integer,bigint) from public,anon,authenticated,service_role;

create function public.revoke_offline_trip_text_provenance_v1(p_trip_id uuid,p_expected_epoch bigint,p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor jsonb;owner_id uuid;epoch bigint;state offline_private.trip_text_state_v1%rowtype;previous offline_private.text_commands_v1%rowtype;digest text;receipt jsonb;
begin
 actor:=offline_private.current_actor_v1();owner_id:=(actor->>'subject')::uuid;epoch:=(actor->>'mobileEpoch')::bigint;
 if p_trip_id is null or p_operation_id is null or p_expected_epoch is distinct from epoch then raise exception 'INVALID_INPUT';end if;
 perform 1 from public.trips where id=p_trip_id and public.trips.owner_id=owner_id for update;if not found then raise exception 'FORBIDDEN';end if;
 digest:=encode(sha256(convert_to(jsonb_build_array('offline-text-revoke/1',owner_id,p_trip_id,epoch,p_operation_id)::text,'UTF8')),'hex');
 select * into previous from offline_private.text_commands_v1 where operation_id=p_operation_id;
 if found then
  if previous.owner_id<>owner_id then raise exception 'FORBIDDEN';end if;
  if previous.input_digest<>digest then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;
  return previous.receipt||jsonb_build_object('reused',true);
 end if;
 insert into offline_private.trip_text_state_v1(trip_id,owner_id) values(p_trip_id,owner_id) on conflict do nothing;
 update offline_private.trip_text_state_v1 set generation=generation+1 where trip_id=p_trip_id and offline_private.trip_text_state_v1.owner_id=owner_id returning * into state;
 receipt:=jsonb_build_object('kind','offline_text_revoked/1','tripId',p_trip_id,'sessionEpoch',epoch,'generation',state.generation,'operationId',p_operation_id,'reused',false);
 insert into offline_private.text_commands_v1(operation_id,owner_id,trip_id,input_digest,action,session_epoch,generation,receipt) values(p_operation_id,owner_id,p_trip_id,digest,'revoke',epoch,state.generation,receipt);
 return receipt;
end $$;
revoke all on function public.revoke_offline_trip_text_provenance_v1(uuid,bigint,uuid) from public,anon,authenticated,service_role;

-- Bounded metadata-only lifecycle helper. Not an API permission or cache grant.
create function offline_private.export_trip_text_sources_v1(p_owner uuid,p_after uuid default null,p_limit integer default 100) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('scope','offline_text_source_metadata/1','items',coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]'::jsonb)) from
 (select id,operation_id,trip_id,proposal_id,proposal_revision,base_version,field,day_id,item_id,field_key,value_digest,purpose,session_epoch,generation from offline_private.text_sources_v1 where owner_id=p_owner and (p_after is null or id>p_after) order by id limit least(greatest(p_limit,1),100)) s;
$$;
revoke all on function offline_private.export_trip_text_sources_v1(uuid,uuid,integer) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';

-- Independent export module, still default-revoked; existing assistant exports unchanged.
alter table offline_private.text_version_bindings_v1 add column id uuid not null default gen_random_uuid() unique;
create function public.export_offline_trip_text_metadata_v1(p_owner uuid,p_section text,p_after_id uuid default null,p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare page jsonb;more boolean;cursor uuid;
begin
 if auth.role() is distinct from 'service_role' or p_owner is null then raise exception 'FORBIDDEN';end if;
 if p_section is null or p_section not in ('commands','sources','bindings','state') or p_limit is null or p_limit not between 1 and 100 then raise exception 'INVALID_INPUT';end if;
 if p_after_id is not null and not exists(
  select 1 from offline_private.text_commands_v1 where p_section='commands' and owner_id=p_owner and operation_id=p_after_id
  union all select 1 from offline_private.text_sources_v1 where p_section='sources' and owner_id=p_owner and id=p_after_id
  union all select 1 from offline_private.text_version_bindings_v1 where p_section='bindings' and owner_id=p_owner and id=p_after_id
  union all select 1 from offline_private.trip_text_state_v1 where p_section='state' and owner_id=p_owner and trip_id=p_after_id
 ) then raise exception 'INVALID_EXPORT_CURSOR';end if;
 with candidates as (
  select operation_id as id,jsonb_build_object('operationId',c.operation_id,'tripId',c.trip_id,'inputDigest',c.input_digest,'action',c.action,'sessionEpoch',c.session_epoch,'generation',c.generation,'proposalId',c.proposal_id,'proposalRevision',c.proposal_revision,'baseTripVersion',c.base_version,'patchDigest',c.patch_digest,'createdAt',c.created_at,'receipt',case when c.action='submit' then jsonb_build_object('kind',c.receipt->'kind','operationId',c.operation_id,'proposalId',c.proposal_id,'proposalRevision',c.proposal_revision,'baseTripVersion',c.base_version,'sessionEpoch',c.session_epoch,'dayId',c.receipt->'dayId','itemId',c.receipt->'itemId','provenanceState',c.receipt->'provenanceState','reused',c.receipt->'reused') else jsonb_build_object('kind',c.receipt->'kind','tripId',c.trip_id,'sessionEpoch',c.session_epoch,'generation',c.generation,'operationId',c.operation_id,'reused',c.receipt->'reused') end) as item from offline_private.text_commands_v1 c where p_section='commands' and owner_id=p_owner and (p_after_id is null or operation_id>p_after_id)
  union all select id,jsonb_build_object('id',s.id,'operationId',s.operation_id,'tripId',s.trip_id,'proposalId',s.proposal_id,'proposalRevision',s.proposal_revision,'baseTripVersion',s.base_version,'patchDigest',s.patch_digest,'field',s.field,'dayId',s.day_id,'itemId',s.item_id,'fieldKey',s.field_key,'valueDigest',s.value_digest,'purpose',s.purpose,'sessionEpoch',s.session_epoch,'generation',s.generation) as item from offline_private.text_sources_v1 s where p_section='sources' and owner_id=p_owner and (p_after_id is null or id>p_after_id)
  union all select id,jsonb_build_object('id',b.id,'tripId',b.trip_id,'version',b.version,'fieldKey',b.field_key,'sourceReceiptId',b.source_id) as item from offline_private.text_version_bindings_v1 b where p_section='bindings' and owner_id=p_owner and (p_after_id is null or id>p_after_id)
  union all select trip_id as id,jsonb_build_object('tripId',t.trip_id,'generation',t.generation) as item from offline_private.trip_text_state_v1 t where p_section='state' and owner_id=p_owner and (p_after_id is null or trip_id>p_after_id)
 ), windowed as(select * from candidates order by id limit p_limit+1),delivered as(select * from windowed order by id limit p_limit)
 select coalesce((select jsonb_agg(item order by id) from delivered),'[]'),(select count(*)>p_limit from windowed),(select id from delivered order by id desc limit 1) into page,more,cursor;
 return jsonb_build_object('schemaVersion','offline-trip-text-export/1','section',p_section,'items',page,'hasMore',more,'nextCursor',case when more then cursor else null end,'sectionComplete',not more,'cachePermission',false);
end $$;
revoke all on function public.export_offline_trip_text_metadata_v1(uuid,text,uuid,integer) from public,anon,authenticated,service_role;

create index offline_text_command_owner_cursor on offline_private.text_commands_v1(owner_id,operation_id);
create index offline_text_source_owner_cursor on offline_private.text_sources_v1(owner_id,id);
create index offline_text_binding_owner_cursor on offline_private.text_version_bindings_v1(owner_id,id);
