-- #236 F1. Corrected metadata only; original Proposal is the sole Trip writer.
-- No target enrollment or role grants. All feature entry points default deny.
create schema pdf_intake_private;
revoke all on schema pdf_intake_private from public,anon,authenticated,service_role;
alter default privileges in schema pdf_intake_private revoke execute on functions from public;

-- Compact key-sorted JSON, matching pdfCanonical for the closed ASCII-key wire.
-- Preserve non-ASCII string bytes and array order; normalize integral JSON numbers.
create function pdf_intake_private.canonical_v1(v jsonb) returns text
language plpgsql immutable set search_path='' as $$
declare result text;n text;
begin
 case jsonb_typeof(v)
 when 'object' then select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||pdf_intake_private.canonical_v1(value),',' order by key collate "C"),'')||'}' into result from jsonb_each(v);
 when 'array' then select '['||coalesce(string_agg(pdf_intake_private.canonical_v1(value),',' order by ordinality),'')||']' into result from jsonb_array_elements(v) with ordinality;
 when 'number' then n:=v::text;result:=case when position('.' in n)>0 then rtrim(rtrim(n,'0'),'.') else n end;
 else result:=v::text;
 end case;
 return result;
end $$;

create function pdf_intake_private.digest_v1(v jsonb) returns text language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(pdf_intake_private.canonical_v1(v),'UTF8')),'hex')
$$;
create function pdf_intake_private.utf16_length_v1(v text) returns integer language sql immutable set search_path='' as $$
 select coalesce(sum(case when ascii(c)>65535 then 2 else 1 end),0)::integer from regexp_split_to_table(v,'') c
$$;
create function pdf_intake_private.integer_v1(v jsonb,lo bigint,hi bigint) returns boolean language sql immutable set search_path='' as $$
 select case when jsonb_typeof(v)='number' then v::text::numeric=trunc(v::text::numeric) and v::text::numeric between lo and hi else false end
$$;
create function pdf_intake_private.uuid_v1(v jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='string' and v#>>'{}' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$',false)
$$;
create function pdf_intake_private.command_v1(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare f jsonb;l jsonb;seen text[]:='{}';s text;y integer;m integer;d integer;max_d integer;
begin
 if not recovery_private.exact_v1(v,array['operationId','expectedHeadVersion','contentHash','byteCount','pageCount','extraction','expiresAt','fields'])
 or not pdf_intake_private.uuid_v1(v->'operationId') or not pdf_intake_private.integer_v1(v->'expectedHeadVersion',0,999999999)
 or jsonb_typeof(v->'contentHash') is distinct from 'string' or v->>'contentHash' !~ '^[0-9a-f]{64}$'
 or not pdf_intake_private.integer_v1(v->'byteCount',1,20000000) or not pdf_intake_private.integer_v1(v->'pageCount',1,10)
 or v->>'extraction' is distinct from 'pdfkit_text' or jsonb_typeof(v->'expiresAt') is distinct from 'string'
 or v->>'expiresAt' !~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$'
 or export_private.ms_v1((v->>'expiresAt')::timestamptz)<>v->>'expiresAt'
 or jsonb_typeof(v->'fields') is distinct from 'array' or jsonb_array_length(v->'fields') not between 1 and 4 then return false;end if;
 for f in select value from jsonb_array_elements(v->'fields') loop
  l:=f->'locator';s:=f->>'value';
  if not recovery_private.exact_v1(f,array['kind','value','locator']) or jsonb_typeof(f->'kind') is distinct from 'string'
  or f->>'kind' not in ('date','amount','address','status') or f->>'kind'=any(seen)
  or jsonb_typeof(f->'value') is distinct from 'string' or pdf_intake_private.utf16_length_v1(s) not between 1 and 96
  or s ~ '[[:cntrl:]]' or left(s,1) ~ U&'[\0020\00a0\1680\2000-\200a\2028\2029\202f\205f\3000\feff]'
  or right(s,1) ~ U&'[\0020\00a0\1680\2000-\200a\2028\2029\202f\205f\3000\feff]'
  or not recovery_private.exact_v1(l,array['page','line','sourceTextHash'])
  or not pdf_intake_private.integer_v1(l->'page',1,(v->>'pageCount')::numeric::integer) or not pdf_intake_private.integer_v1(l->'line',1,1000)
  or jsonb_typeof(l->'sourceTextHash') is distinct from 'string' or l->>'sourceTextHash' !~ '^[0-9a-f]{64}$' then return false;end if;
  if f->>'kind'='date' then
   if s !~ '^\d{4}-\d\d-\d\d$' then return false;end if;
   y:=substring(s,1,4)::integer;m:=substring(s,6,2)::integer;d:=substring(s,9,2)::integer;
   if m not between 1 and 12 then return false;end if;
   max_d:=case when m=2 then case when y%4=0 and (y%100<>0 or y%400=0) then 29 else 28 end when m in (4,6,9,11) then 30 else 31 end;
   if y=0 or d not between 1 and max_d then return false;end if;
  end if;
  seen:=array_append(seen,f->>'kind');
 end loop;
 return 'date'=any(seen);
exception when others then return false;
end $$;

create function pdf_intake_private.preview_v1(t public.trips,c jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare snapshot jsonb;date_field jsonb;target jsonb;day_id text;g text;day_prefix text;field jsonb;fields jsonb:='[]';ordered_fields jsonb;
 ops jsonb:='[]';additions jsonb:='[]';item_prefix text;item_id text;title text;prior_count integer;same_item jsonb;same_day text;duplicate boolean;state text;
 patch jsonb;next_snapshot jsonb;before_day jsonb;after_day jsonb;before_item jsonb;after_item jsonb;old_ids jsonb;new_ids jsonb;cmd_digest text;
begin
 if t.head_version<>(c->>'expectedHeadVersion')::integer then raise exception 'STALE_TRIP_VERSION';end if;
 snapshot:=public.trip_content_snapshot(t.id,t.title);
 select value into date_field from jsonb_array_elements(c->'fields') where value->>'kind'='date';
 g:=left(pdf_intake_private.digest_v1(jsonb_build_array(t.id,c->>'contentHash')),16);day_prefix:='pdfd_'||g||'_';
 select value into target from jsonb_array_elements(snapshot->'days') where value->>'date'=date_field->>'value' limit 1;
 day_id:=coalesce(target->>'id',day_prefix||left(pdf_intake_private.digest_v1(date_field->'value'),16));
 if target is not null and target->>'date'<>date_field->>'value' then raise exception 'PROPOSAL_NOT_CONFIRMABLE';end if;
 if target is null then ops:=ops||jsonb_build_array(jsonb_build_object('kind','upsert_day','dayId',day_id,'date',date_field->'value'));end if;
 state:=case when exists(select 1 from jsonb_array_elements(snapshot->'days') d where (left(d->>'id',length(day_prefix))=day_prefix
 or exists(select 1 from jsonb_array_elements(d->'items') i where left(i->>'id',length('pdfi_'||g||'_'))='pdfi_'||g||'_')) and d->>'date'<>date_field->>'value') then 'conflict' when target is not null then 'duplicate' else 'added' end;
 fields:=fields||jsonb_build_array(date_field||jsonb_build_object('state',state));
 for field in select value from jsonb_array_elements(c->'fields') where value->>'kind'<>'date' loop
  item_prefix:='pdfi_'||g||'_'||(field->>'kind')||'_';
  item_id:=item_prefix||left(pdf_intake_private.digest_v1(jsonb_build_array(date_field->'value',field->'value',field->'locator')),16);
  title:='User-checked PDF P'||((field->'locator'->>'page')::integer)::text||' L'||((field->'locator'->>'line')::integer)::text||' · '||(field->>'kind')||': '||(field->>'value');
  if pdf_intake_private.utf16_length_v1(title)>160 then raise exception 'INVALID_INPUT';end if;
  select count(*) into prior_count from jsonb_array_elements(snapshot->'days')d,jsonb_array_elements(d->'items')i where left(i->>'id',length(item_prefix))=item_prefix;
  same_item:=null;same_day:=null;
  select i,d->>'id' into same_item,same_day from jsonb_array_elements(snapshot->'days')d,jsonb_array_elements(d->'items')i where i->>'id'=item_id limit 1;
  duplicate:=coalesce(same_day=day_id and same_item->>'title'=title and not same_item ? 'startsAt' and not same_item ? 'endsAt',false);
  state:=case when duplicate then 'duplicate' when prior_count>0 then 'conflict' else 'added' end;
  fields:=fields||jsonb_build_array(field||jsonb_build_object('state',state));
  if same_item is not null and not duplicate then raise exception 'PROPOSAL_NOT_CONFIRMABLE';end if;
  if not duplicate then
   ops:=ops||jsonb_build_array(jsonb_build_object('kind','upsert_item','itemId',item_id,'dayId',day_id,'title',title));
   additions:=additions||jsonb_build_array(item_id);
  end if;
 end loop;
 if jsonb_array_length(additions)>0 and coalesce(jsonb_array_length(target->'items'),0)>0 then
  select coalesce(jsonb_agg(value->'id' order by ordinality),'[]') into old_ids from jsonb_array_elements(target->'items') with ordinality;
  ops:=ops||jsonb_build_array(jsonb_build_object('kind','reorder_items','dayId',day_id,'itemIds',old_ids||additions));
 end if;
 if jsonb_array_length(ops)>0 then
  patch:=jsonb_build_object('expectedVersion',t.head_version,'operations',ops);
  next_snapshot:=public.apply_trip_content_patch(snapshot,patch);
  for before_day in select value from jsonb_array_elements(snapshot->'days') loop
   select value into after_day from jsonb_array_elements(next_snapshot->'days') where value->'id'=before_day->'id';
   if after_day is null or after_day->'date' is distinct from before_day->'date' or after_day->'timeZone' is distinct from before_day->'timeZone' then raise exception 'PROPOSAL_NOT_CONFIRMABLE';end if;
   select coalesce(jsonb_agg(value->'id' order by ordinality),'[]') into old_ids from jsonb_array_elements(before_day->'items') with ordinality;
   select coalesce(jsonb_agg(value->'id' order by ordinality),'[]') into new_ids from jsonb_array_elements(after_day->'items') with ordinality where old_ids @> jsonb_build_array(value->'id');
   if old_ids<>new_ids then raise exception 'PROPOSAL_NOT_CONFIRMABLE';end if;
   for before_item in select value from jsonb_array_elements(before_day->'items') loop
    select value into after_item from jsonb_array_elements(after_day->'items') where value->'id'=before_item->'id';
    if (before_item-array['manualOrder']) is distinct from (after_item-array['manualOrder']) then raise exception 'PROPOSAL_NOT_CONFIRMABLE';end if;
   end loop;
  end loop;
 end if;
 select jsonb_agg(f order by c.ordinality) into ordered_fields from jsonb_array_elements(c->'fields') with ordinality c cross join lateral
 (select value f from jsonb_array_elements(fields) where value->'kind'=c.value->'kind')x;
 cmd_digest:=pdf_intake_private.digest_v1(c);
 return jsonb_build_object('kind','pdf_intake_preview/1','operationId',c->'operationId','tripId',t.id,'headVersion',t.head_version,
 'commandDigest',cmd_digest,'previewDigest',pdf_intake_private.digest_v1(jsonb_build_array(t.id,cmd_digest,patch,ordered_fields)),
 'expiresAt',c->'expiresAt','relation',case when exists(select 1 from jsonb_array_elements(fields) f where f->>'state'='conflict') then 'conflict' when patch is not null then 'new' else 'duplicate' end,
 'fields',ordered_fields,'patch',patch,'requiresExplicitConfirmation',true,'evidenceTier','user_checked_local_pdf','sourceAvailability','local_only','orderVerification','unavailable');
end $$;

alter table public.trip_proposals add column pdf_intake boolean not null default false;
create table pdf_intake_private.operations_v1(
 owner_id uuid not null references auth.users(id) on delete cascade,operation_id uuid not null,
 trip_id uuid not null references public.trips(id) on delete cascade,session_id uuid not null,session_epoch bigint not null,
 request_digest text,command_digest text,preview_digest text,expires_at timestamptz,
 input_bytes text,command jsonb,proposal_id uuid references public.trip_proposals(id) on delete cascade,
 proposal_revision integer,base_version integer,proposal_digest text,patch_digest text,
 cancelled boolean not null default false,created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,operation_id),unique(proposal_id),check(expires_at is null or expires_at<=created_at+interval '24 hours')
);
create index pdf_intake_trip_v1 on pdf_intake_private.operations_v1(trip_id);
create index pdf_intake_expiry_v1 on pdf_intake_private.operations_v1(expires_at) where input_bytes is not null;
alter table pdf_intake_private.operations_v1 enable row level security;
revoke all on pdf_intake_private.operations_v1 from public,anon,authenticated,service_role;

-- The marker survives payload erasure, preventing ordinary revisions from shedding TTL.
create function pdf_intake_private.proposal_guard_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' then
  if NEW.pdf_intake or exists(select 1 from public.trip_proposals p where p.id=NEW.parent_proposal_id and p.pdf_intake) then raise exception 'PDF_SUCCESSOR_FORBIDDEN';end if;
 elsif OLD.pdf_intake then
  if NEW.patch='{}'::jsonb and NEW.status in ('expired','rejected') and OLD.status<>'applied'
   and (to_jsonb(NEW)-array['status','patch']) is not distinct from (to_jsonb(OLD)-array['status','patch'])
   and exists(select 1 from pdf_intake_private.operations_v1 o where o.proposal_id=OLD.id and o.input_bytes is null and o.command is null
    and (o.cancelled or o.expires_at<=clock_timestamp() or not exists(select 1 from identity_private.mobile_accounts a where a.owner_id=o.owner_id and a.epoch=o.session_epoch and a.session_id=o.session_id))) then return NEW;end if;
  if (to_jsonb(NEW)-'status') is distinct from (to_jsonb(OLD)-'status') then raise exception 'PDF_PROPOSAL_IMMUTABLE';end if;
 elsif NEW.pdf_intake then
  if (to_jsonb(NEW)-array['pdf_intake','expires_at']) is distinct from (to_jsonb(OLD)-array['pdf_intake','expires_at'])
  or not exists(select 1 from pdf_intake_private.operations_v1 o where o.proposal_id=OLD.id and o.owner_id=OLD.owner_id
   and o.trip_id=OLD.trip_id and o.proposal_revision=OLD.revision and o.base_version=OLD.base_trip_version
   and o.expires_at=NEW.expires_at and o.patch_digest=pdf_intake_private.digest_v1(OLD.patch) and not o.cancelled) then raise exception 'PDF_MARKER_FORBIDDEN';end if;
 end if;
 return NEW;
end $$;
create trigger pdf_intake_proposal_guard_v1 before insert or update on public.trip_proposals for each row execute function pdf_intake_private.proposal_guard_v1();

create function pdf_intake_private.actor_v1(expected bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid;actor jsonb;
begin
 if auth.role() is distinct from 'authenticated' or expected is null or expected not between 1 and 9007199254740991 then raise exception 'UNAUTHENTICATED';end if;
 u:=trip_lifecycle_private.actor_v1();actor:=public.native_session_v2('session');
 if actor->>'subject' is distinct from u::text or (actor->>'mobileEpoch')::bigint is distinct from expected
 or actor->>'sessionId' is distinct from auth.jwt()->>'session_id' then raise exception 'SESSION_REPLACED';end if;
 return actor;
end $$;

-- An applied status alone cannot manufacture a recovery receipt.
create function pdf_intake_private.confirmation_v1(o pdf_intake_private.operations_v1) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('confirmationEventId',e.id,'resultingVersion',e.resulting_version)
 from public.trip_events e join public.trip_proposals p on p.id=e.proposal_id
 join public.trip_version_snapshots s on s.trip_id=e.trip_id and s.version=e.resulting_version and s.owner_id=e.owner_id
 where e.proposal_id=o.proposal_id and e.trip_id=o.trip_id and e.owner_id=o.owner_id and e.event_type='proposal_applied'
 and e.resulting_version=o.base_version+1 and p.pdf_intake and p.status='applied' and p.revision=o.proposal_revision
 and p.base_trip_version=o.base_version and pdf_intake_private.digest_v1(p.patch)=o.patch_digest
 and exists(select 1 from public.trip_idempotency i where i.owner_id=o.owner_id and i.proposal_id=p.id and i.digest=o.proposal_digest and i.outcome='applied' and i.resulting_version=e.resulting_version)
$$;
create function pdf_intake_private.receipt_v1(o pdf_intake_private.operations_v1,t public.trips) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare confirmation jsonb;state text;p public.trip_proposals%rowtype;
begin
 confirmation:=pdf_intake_private.confirmation_v1(o);
 select * into p from public.trip_proposals where id=o.proposal_id;
 state:=case when confirmation is not null then 'confirmed' when o.cancelled then 'cancelled'
 when o.expires_at<=clock_timestamp() then 'expired'
 when p.id is null or p.status<>'pending' or p.base_trip_version<>t.head_version then 'rejected' else 'pending' end;
 return jsonb_build_object('kind','pdf_intake_operation/1','operationId',o.operation_id,'tripId',o.trip_id,'sessionEpoch',o.session_epoch,'state',state,
 'requestDigest',o.request_digest,'commandDigest',o.command_digest,'previewDigest',o.preview_digest,'expiresAt',export_private.ms_v1(o.expires_at),
 'proposalId',o.proposal_id,'proposalRevision',o.proposal_revision,'baseTripVersion',o.base_version,
 'confirmationEventId',confirmation->'confirmationEventId','resultingVersion',confirmation->'resultingVersion');
end $$;

create function public.pdf_intake_v1(p_action text,p_trip_id uuid,p_input_bytes text,p_expected_epoch bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v jsonb;c jsonb;actor jsonb;u uuid;op uuid;t public.trips%rowtype;o pdf_intake_private.operations_v1%rowtype;
 preview jsonb;created record;result jsonb;req_digest text;cmd_digest text;expiry timestamptz;
begin
 if p_trip_id is null or p_input_bytes is null or octet_length(p_input_bytes) not between 1 and 8192
 or p_action is null or p_action not in ('preview','proposal','operation','cancel') then raise exception 'INVALID_INPUT';end if;
 begin v:=p_input_bytes::jsonb;exception when others then raise exception 'INVALID_INPUT';end;
 if p_action='proposal' then
  if not recovery_private.exact_v1(v,array['command','reviewedPreviewDigest']) or jsonb_typeof(v->'reviewedPreviewDigest') is distinct from 'string'
   or v->>'reviewedPreviewDigest' !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_INPUT';end if;c:=v->'command';
 elsif p_action='preview' then c:=v;
 else if not recovery_private.exact_v1(v,array['operationId']) or not pdf_intake_private.uuid_v1(v->'operationId') then raise exception 'INVALID_INPUT';end if;end if;
 if c is not null then c:=pdf_intake_private.canonical_v1(c)::jsonb;if not pdf_intake_private.command_v1(c) then raise exception 'INVALID_INPUT';end if;op:=(c->>'operationId')::uuid;
 else op:=(v->>'operationId')::uuid;end if;
 actor:=pdf_intake_private.actor_v1(p_expected_epoch);u:=auth.uid();
 -- Original writer locks account -> proposal -> Trip. NOWAIT makes inverse
 -- trusted lifecycle/worker row contention an abort, never a deadlock wait.
 perform 1 from public.trip_proposals where trip_id=p_trip_id and owner_id=u for update nowait;
 t:=recovery_private.trip_v1(u,p_trip_id);if t.id is null then raise exception 'FORBIDDEN';end if;
 select * into o from pdf_intake_private.operations_v1 where owner_id=u and operation_id=op for update nowait;
 if found and (o.trip_id<>t.id or o.session_id::text<>actor->>'sessionId' or o.session_epoch<>p_expected_epoch) then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;
 if p_action='preview' then
  if o.cancelled then raise exception 'CANCELLED';end if;
  if o.owner_id is not null and o.command_digest is distinct from pdf_intake_private.digest_v1(c) then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;
  expiry:=(c->>'expiresAt')::timestamptz;
  if expiry<=clock_timestamp() or expiry>clock_timestamp()+interval '24 hours' then raise exception 'DATA_EXPIRED';end if;
  return pdf_intake_private.preview_v1(t,c);
 end if;
 if p_action='operation' then
  if o.owner_id is null then return jsonb_build_object('kind','pdf_intake_operation/1','operationId',op,'tripId',t.id,'sessionEpoch',p_expected_epoch,'state','absent',
   'requestDigest',null,'commandDigest',null,'previewDigest',null,'expiresAt',null,'proposalId',null,'proposalRevision',null,'baseTripVersion',null,'confirmationEventId',null,'resultingVersion',null);end if;
  result:=pdf_intake_private.receipt_v1(o,t);
  if result->>'state' in ('expired','cancelled','confirmed') then perform pdf_intake_private.erase_v1(u,op,false);end if;
  return result;
 end if;
 if p_action='cancel' then
  if o.owner_id is null then
   insert into pdf_intake_private.operations_v1(owner_id,operation_id,trip_id,session_id,session_epoch,cancelled)
   values(u,op,t.id,(actor->>'sessionId')::uuid,p_expected_epoch,true) returning * into o;
  elsif pdf_intake_private.confirmation_v1(o) is null then
   if exists(select 1 from public.trip_proposals where id=o.proposal_id and status='pending') then perform public.reject_trip_proposal_v2(o.proposal_id);end if;
   perform pdf_intake_private.erase_v1(u,op,true);select * into o from pdf_intake_private.operations_v1 where owner_id=u and operation_id=op;
  end if;
  return pdf_intake_private.receipt_v1(o,t);
 end if;
 req_digest:=encode(sha256(convert_to(p_input_bytes,'UTF8')),'hex');cmd_digest:=pdf_intake_private.digest_v1(c);
 if o.owner_id is not null then
  if o.cancelled then raise exception 'CANCELLED';end if;
  if o.request_digest is distinct from req_digest or o.command_digest is distinct from cmd_digest then raise exception 'IDEMPOTENCY_KEY_REUSE';end if;
  result:=pdf_intake_private.receipt_v1(o,t);if result->>'state' not in ('pending','confirmed') then raise exception 'PROPOSAL_NOT_CONFIRMABLE';end if;
  return jsonb_build_object('kind','pdf_intake_proposal/1','operationId',op,'tripId',t.id,'sessionEpoch',p_expected_epoch,'requestDigest',o.request_digest,
   'commandDigest',o.command_digest,'previewDigest',o.preview_digest,'proposalId',o.proposal_id,'proposalRevision',o.proposal_revision,'baseTripVersion',o.base_version,'reused',true);
 end if;
 expiry:=(c->>'expiresAt')::timestamptz;if expiry<=clock_timestamp() or expiry>clock_timestamp()+interval '24 hours' then raise exception 'DATA_EXPIRED';end if;
 preview:=pdf_intake_private.preview_v1(t,c);
 if preview->>'previewDigest'<>v->>'reviewedPreviewDigest' then raise exception 'PDF_PREVIEW_MISMATCH';end if;
 if preview->'patch'='null'::jsonb then raise exception 'PROPOSAL_NOT_CONFIRMABLE';end if;
 select * into created from public.create_trip_proposal_patch(t.id,preview->'patch');
 insert into pdf_intake_private.operations_v1(owner_id,operation_id,trip_id,session_id,session_epoch,request_digest,command_digest,preview_digest,expires_at,input_bytes,command,proposal_id,proposal_revision,base_version,patch_digest)
 values(u,op,t.id,(actor->>'sessionId')::uuid,p_expected_epoch,req_digest,cmd_digest,preview->>'previewDigest',expiry,p_input_bytes,c,created.proposal_id,created.revision,created.base_trip_version,pdf_intake_private.digest_v1(preview->'patch'));
 update public.trip_proposals set expires_at=expiry,pdf_intake=true where id=created.proposal_id;
 update pdf_intake_private.operations_v1 set proposal_digest=(select digest from public.read_trip_proposal_v2(created.proposal_id)) where owner_id=u and operation_id=op returning * into o;
 return jsonb_build_object('kind','pdf_intake_proposal/1','operationId',op,'tripId',t.id,'sessionEpoch',p_expected_epoch,'requestDigest',req_digest,'commandDigest',cmd_digest,
  'previewDigest',o.preview_digest,'proposalId',o.proposal_id,'proposalRevision',o.proposal_revision,'baseTripVersion',o.base_version,'reused',false);
end $$;
revoke all on function public.pdf_intake_v1(text,uuid,text,bigint) from public,anon,authenticated,service_role;

create table pdf_intake_private.confirm_proofs_v1(
 transaction_id xid8 not null,proposal_id uuid primary key references public.trip_proposals(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,expected_content_digest text not null
);
alter table pdf_intake_private.confirm_proofs_v1 enable row level security;
revoke all on pdf_intake_private.confirm_proofs_v1 from public,anon,authenticated,service_role;
create function pdf_intake_private.prewrite_v1(pid uuid,dig text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.trip_proposals%rowtype;o pdf_intake_private.operations_v1%rowtype;t public.trips%rowtype;actor jsonb;actual text;
begin
 select * into p from public.trip_proposals where id=pid;
 if not p.pdf_intake then return;end if;
 select * into o from pdf_intake_private.operations_v1 where proposal_id=pid for update nowait;
 if o.owner_id is null then raise exception 'PDF_CONFIRM_GUARD';end if;
 actor:=pdf_intake_private.actor_v1(o.session_epoch);t:=recovery_private.trip_v1(o.owner_id,o.trip_id);
 select digest into actual from public.read_trip_proposal_v2(pid);
 if t.id is null or p.owner_id is distinct from auth.uid() or p.owner_id<>o.owner_id or p.trip_id<>o.trip_id
 or p.status<>'pending' or o.cancelled or o.input_bytes is null or o.command is null
 or o.session_id::text is distinct from actor->>'sessionId' or o.expires_at<=clock_timestamp()
 or p.expires_at is distinct from o.expires_at or p.revision<>o.proposal_revision or p.base_trip_version<>o.base_version or t.head_version<>o.base_version
 or p.parent_proposal_id is not null or p.rollback_snapshot_version is not null
 or actual is distinct from o.proposal_digest or actual is distinct from dig or pdf_intake_private.digest_v1(p.patch) is distinct from o.patch_digest
 or pdf_intake_private.digest_v1(o.command) is distinct from o.command_digest
 or encode(sha256(convert_to(o.input_bytes,'UTF8')),'hex') is distinct from o.request_digest then raise exception 'PDF_CONFIRM_GUARD';end if;
 if (pdf_intake_private.preview_v1(t,o.command)->>'previewDigest') is distinct from o.preview_digest then raise exception 'PDF_CONFIRM_GUARD';end if;
 insert into pdf_intake_private.confirm_proofs_v1(transaction_id,proposal_id,owner_id,expected_content_digest)
 values(pg_current_xact_id(),pid,o.owner_id,pdf_intake_private.digest_v1(public.apply_trip_content_patch(public.trip_content_snapshot(t.id,t.title),p.patch)));
end $$;
create function pdf_intake_private.confirm_event_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare o pdf_intake_private.operations_v1%rowtype;p public.trip_proposals%rowtype;proof pdf_intake_private.confirm_proofs_v1%rowtype;t public.trips%rowtype;actor jsonb;
begin
 select * into p from public.trip_proposals where id=NEW.proposal_id;if not p.pdf_intake then return null;end if;
 select * into o from pdf_intake_private.operations_v1 where proposal_id=p.id for update nowait;
 select * into proof from pdf_intake_private.confirm_proofs_v1 where proposal_id=p.id and transaction_id=pg_current_xact_id();
 if o.owner_id is null or proof.proposal_id is null then raise exception 'PDF_CONFIRM_GUARD';end if;
 actor:=pdf_intake_private.actor_v1(o.session_epoch);t:=recovery_private.trip_v1(o.owner_id,o.trip_id);
 if t.id is null or o.cancelled or o.expires_at<=clock_timestamp() or o.session_id::text is distinct from actor->>'sessionId'
 or t.head_version<>o.base_version+1 or NEW.owner_id<>o.owner_id or NEW.trip_id<>o.trip_id or NEW.resulting_version<>o.base_version+1
 or pdf_intake_private.confirmation_v1(o) is null
 or proof.expected_content_digest is distinct from pdf_intake_private.digest_v1(public.trip_content_snapshot(t.id,t.title)) then raise exception 'PDF_CONFIRM_GUARD';end if;
 delete from pdf_intake_private.confirm_proofs_v1 where proposal_id=p.id;
 update pdf_intake_private.operations_v1 set input_bytes=null,command=null where owner_id=o.owner_id and operation_id=o.operation_id;
 return null;
end $$;
create constraint trigger pdf_intake_confirm_event_v1 after insert on public.trip_events deferrable initially deferred
 for each row execute function pdf_intake_private.confirm_event_v1();

-- Add only a prewrite guard to the installed writer. Assert exact source/ACL
-- round-trip so drift or a second writer cannot be silently installed.
do $hook$declare f record;anchor text:='  update public.trips set title = next_title, head_version = next_version, updated_at = now() where id = trip.id and head_version = proposal.base_trip_version;';
 hook text:='  PERFORM pdf_intake_private.prewrite_v1(proposal.id,expected_digest);'||chr(10);
begin
 select prosrc,pg_get_functiondef(oid) definition,proacl,prosecdef into f from pg_proc where oid='public.confirm_and_apply_trip_proposal(uuid,text,text)'::regprocedure;
 if not f.prosecdef or (length(f.prosrc)-length(replace(f.prosrc,anchor,'')))/length(anchor)<>1 or position(hook in f.prosrc)>0 then raise exception 'PDF_WRITER_HOOK_DRIFT';end if;
 execute replace(f.definition,anchor,hook||anchor);
 if (select proacl from pg_proc where oid='public.confirm_and_apply_trip_proposal(uuid,text,text)'::regprocedure) is distinct from f.proacl
 or (select replace(prosrc,hook,'') from pg_proc where oid='public.confirm_and_apply_trip_proposal(uuid,text,text)'::regprocedure) is distinct from f.prosrc then raise exception 'PDF_WRITER_HOOK_DRIFT';end if;
end $hook$;

create function pdf_intake_private.operation_guard_v1() returns trigger language plpgsql set search_path='' as $$
begin
 if (to_jsonb(NEW)-array['input_bytes','command','cancelled','proposal_digest']) is distinct from (to_jsonb(OLD)-array['input_bytes','command','cancelled','proposal_digest'])
 or NEW.input_bytes is not null and NEW.input_bytes is distinct from OLD.input_bytes or NEW.command is not null and NEW.command is distinct from OLD.command
 or OLD.cancelled and not NEW.cancelled or OLD.proposal_digest is not null and NEW.proposal_digest is distinct from OLD.proposal_digest then raise exception 'PDF_OPERATION_IMMUTABLE';end if;
 return NEW;
end $$;
create trigger pdf_intake_operation_guard_v1 before update on pdf_intake_private.operations_v1 for each row execute function pdf_intake_private.operation_guard_v1();
create function pdf_intake_private.erase_v1(u uuid,op uuid,cancel boolean) returns void
language plpgsql security definer set search_path='' as $$
declare o pdf_intake_private.operations_v1%rowtype;
begin
 select * into o from pdf_intake_private.operations_v1 where owner_id=u and operation_id=op for update nowait;if not found then return;end if;
 update pdf_intake_private.operations_v1 set input_bytes=null,command=null,cancelled=cancelled or cancel where owner_id=u and operation_id=op and (input_bytes is not null or command is not null or cancel and not cancelled);
 -- Applied history is original Trip data. Only unconfirmed temporary candidates
 -- lose their corrected fields; retain hashes/IDs as the denial receipt.
 if o.proposal_id is not null and (cancel or o.expires_at<=clock_timestamp() or not exists(select 1 from identity_private.mobile_accounts a where a.owner_id=u and a.epoch=o.session_epoch and a.session_id=o.session_id)) then
  update public.trip_proposals set patch='{}',status=case when status='rejected' then 'rejected' else 'expired' end
   where id=o.proposal_id and pdf_intake and status<>'applied' and patch<>'{}';
 end if;
end $$;

-- Session replacement/logout erases old temporary material immediately while
-- retaining owner+operation replay denial. Account/Trip erasure cascades records.
create function pdf_intake_private.session_erasure_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare o record;
begin
 if TG_OP='UPDATE' and NEW.epoch is not distinct from OLD.epoch and NEW.session_id is not distinct from OLD.session_id then return NEW;end if;
 for o in select owner_id,operation_id from pdf_intake_private.operations_v1 where owner_id=OLD.owner_id and (input_bytes is not null or command is not null) order by operation_id loop
  perform pdf_intake_private.erase_v1(o.owner_id,o.operation_id,false);
 end loop;
 if TG_OP='DELETE' then return OLD;else return NEW;end if;
end $$;
create trigger pdf_intake_session_erasure_v1 after update or delete on identity_private.mobile_accounts for each row execute function pdf_intake_private.session_erasure_v1();
create function pdf_intake_private.auth_session_erasure_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare o record;
begin
 for o in select owner_id,operation_id from pdf_intake_private.operations_v1 where session_id=OLD.id and (input_bytes is not null or command is not null) order by owner_id,operation_id loop
  perform pdf_intake_private.erase_v1(o.owner_id,o.operation_id,true);
 end loop;
 return OLD;
end $$;
create trigger pdf_intake_auth_session_erasure_v1 after delete on auth.sessions for each row execute function pdf_intake_private.auth_session_erasure_v1();
create function pdf_intake_private.trip_erasure_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare o record;
begin
 for o in select owner_id,operation_id from pdf_intake_private.operations_v1 where trip_id=NEW.trip_id order by operation_id loop
  perform pdf_intake_private.erase_v1(o.owner_id,o.operation_id,true);
 end loop;
 return NEW;
end $$;
-- Erase before admission establishes the original immutable deletion/archive
-- fence; a failed admission rolls this erasure back with the whole transaction.
create trigger pdf_intake_trip_deleted_v1 before insert on privacy_private.trip_deletions for each row execute function pdf_intake_private.trip_erasure_v1();
create trigger pdf_intake_trip_archived_v1 before insert on public.trip_archives for each row execute function pdf_intake_private.trip_erasure_v1();

-- Bounded retention worker, disabled until explicitly enrolled. It takes the
-- installed account lock and NOWAIT rows in the same order as ordinary paths.
create function public.pdf_intake_prune_v1(p_limit integer) returns integer
language plpgsql security definer set search_path='' as $$
declare candidate record;n integer:=0;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'INVALID_INPUT';end if;
 for candidate in select owner_id,operation_id,proposal_id,trip_id from pdf_intake_private.operations_v1 where input_bytes is not null
 and (expires_at<=clock_timestamp() or not exists(select 1 from identity_private.mobile_accounts a where a.owner_id=operations_v1.owner_id and a.epoch=operations_v1.session_epoch and a.session_id=operations_v1.session_id)) order by owner_id,operation_id limit p_limit loop
  begin
   perform trip_lifecycle_private.lock_owner_v1(candidate.owner_id);
   perform 1 from public.trip_proposals where id=candidate.proposal_id for update nowait;
   perform 1 from public.trips where id=candidate.trip_id for update nowait;
   perform pdf_intake_private.erase_v1(candidate.owner_id,candidate.operation_id,false);n:=n+1;
  exception when lock_not_available then continue;
  end;
 end loop;
 return n;
end $$;
revoke all on function public.pdf_intake_prune_v1(integer) from public,anon,authenticated,service_role;

create table pdf_intake_private.source_revisions_v1(
 owner_id uuid primary key references auth.users(id) on delete cascade,revision bigint not null default 1
);
create table pdf_intake_private.export_version_v1(
 version text primary key check(version='pdf-intake-export/1'),created_at timestamptz not null default clock_timestamp()
);
insert into pdf_intake_private.export_version_v1(version) values('pdf-intake-export/1');
create table pdf_intake_private.export_progress_v1(
 request_id uuid not null references export_private.core_jobs_v1(request_id) on delete cascade,
 generation integer not null,lease_id uuid not null,source_revision bigint not null,
 pages integer not null,rows integer not null,last_cursor uuid,last_limit integer,next_cursor uuid,terminal boolean not null,
 primary key(request_id,generation)
);
alter table export_private.core_jobs_v1 add column pdf_export_version text;
alter table export_private.core_jobs_v1 add column pdf_source_revision bigint;
alter table export_private.core_jobs_v1 add column pdf_material_valid_until timestamptz;
do $$declare t text;begin foreach t in array array['source_revisions_v1','export_version_v1','export_progress_v1'] loop
 execute format('alter table pdf_intake_private.%I enable row level security',t);
 execute format('revoke all on pdf_intake_private.%I from public,anon,authenticated,service_role',t);
end loop;end $$;
create function pdf_intake_private.source_changed_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare u uuid:=case when TG_OP='DELETE' then OLD.owner_id else NEW.owner_id end;
begin
 if exists(select 1 from auth.users where id=u) then
  perform trip_lifecycle_private.lock_owner_v1(u);
  insert into pdf_intake_private.source_revisions_v1(owner_id) values(u) on conflict do nothing;
  update pdf_intake_private.source_revisions_v1 set revision=revision+1 where owner_id=u;
 end if;
 if TG_OP='DELETE' then return OLD;else return NEW;end if;
end $$;
create trigger pdf_intake_source_changed_v1 before insert or update or delete on pdf_intake_private.operations_v1
 for each row execute function pdf_intake_private.source_changed_v1();
create function pdf_intake_private.export_current_v1(j export_private.core_jobs_v1) returns boolean
language plpgsql security definer set search_path='' as $$
declare rev bigint;
begin
 if j.pdf_export_version is null then return true;end if;
 select revision into rev from pdf_intake_private.source_revisions_v1 where owner_id=j.owner_id for share nowait;
 return coalesce(j.pdf_export_version='pdf-intake-export/1' and rev=j.pdf_source_revision
  and (j.pdf_material_valid_until is null or j.pdf_material_valid_until>clock_timestamp()),false);
exception when lock_not_available then return false;
end $$;

-- New explicit handler uses the existing exact owner/request/policy/session/job
-- lease. No p_owner, alternate export authority, or retrofit of completed jobs.
create function public.pdf_intake_export_v1(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare j export_private.core_jobs_v1;progress pdf_intake_private.export_progress_v1%rowtype;
 req uuid;lease uuid;gen integer;cursor uuid;lim integer;rev bigint;page jsonb;more boolean;last_id uuid;n integer;replay boolean:=false;deadline timestamptz;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'FORBIDDEN';end if;
 if not recovery_private.exact_v1(p_input,array['version','requestId','leaseId','generation','cursor','limit'])
 or p_input->>'version' is distinct from 'pdf-intake-export/1' or not pdf_intake_private.uuid_v1(p_input->'requestId')
 or not pdf_intake_private.uuid_v1(p_input->'leaseId') or not pdf_intake_private.integer_v1(p_input->'generation',1,3)
 or not pdf_intake_private.integer_v1(p_input->'limit',1,100)
 or p_input->'cursor'<>'null'::jsonb and not pdf_intake_private.uuid_v1(p_input->'cursor') then raise exception 'INVALID_INPUT';end if;
 req:=(p_input->>'requestId')::uuid;lease:=(p_input->>'leaseId')::uuid;gen:=(p_input->>'generation')::numeric::integer;
 cursor:=(p_input->>'cursor')::uuid;lim:=(p_input->>'limit')::numeric::integer;
 j:=export_private.lock_job_v1(req,true);
 if j.request_id is null or not export_private.live_lease_v1(j,lease,gen)
 or j.created_at<(select created_at from pdf_intake_private.export_version_v1 where version='pdf-intake-export/1') then return jsonb_build_object('kind','unavailable');end if;
 if lim>(j.policy_snapshot->>'page_size')::integer then raise exception 'INVALID_INPUT';end if;
 insert into pdf_intake_private.source_revisions_v1(owner_id) values(j.owner_id) on conflict do nothing;
 select revision into rev from pdf_intake_private.source_revisions_v1 where owner_id=j.owner_id for share nowait;
 if j.pdf_export_version is null then
  select min(expires_at) into deadline from pdf_intake_private.operations_v1 where owner_id=j.owner_id and command is not null and not cancelled and expires_at>clock_timestamp();
  update export_private.core_jobs_v1 set pdf_export_version='pdf-intake-export/1',pdf_source_revision=rev,pdf_material_valid_until=deadline where request_id=req returning * into j;
 elsif not pdf_intake_private.export_current_v1(j) then return jsonb_build_object('kind','unavailable');end if;
 select * into progress from pdf_intake_private.export_progress_v1 where request_id=req and generation=gen for update nowait;
 if found then
  if progress.lease_id<>lease or progress.source_revision<>rev then raise exception 'EXPORT_SOURCE_CHANGED';end if;
  if progress.last_cursor is not distinct from cursor then if progress.last_limit<>lim then raise exception 'EXPORT_SOURCE_CURSOR_CONFLICT';end if;replay:=true;
  elsif progress.terminal or progress.next_cursor is distinct from cursor then raise exception 'INVALID_EXPORT_CURSOR';end if;
 elsif cursor is not null then raise exception 'INVALID_EXPORT_CURSOR';end if;
 if cursor is not null and not exists(select 1 from pdf_intake_private.operations_v1 where owner_id=j.owner_id and operation_id=cursor) then raise exception 'INVALID_EXPORT_CURSOR';end if;
 with candidates as(select * from pdf_intake_private.operations_v1 o where owner_id=j.owner_id and (cursor is null or operation_id>cursor) order by operation_id limit lim+1),
 delivered as(select * from candidates order by operation_id limit lim)
 select coalesce((select jsonb_agg(jsonb_build_object('operationId',operation_id,'tripId',trip_id,'sessionEpoch',session_epoch,'requestDigest',request_digest,
  'commandDigest',command_digest,'previewDigest',preview_digest,'proposalId',proposal_id,'proposalRevision',proposal_revision,'baseTripVersion',base_version,
  'expiresAt',export_private.ms_v1(expires_at),'cancelled',cancelled,
  'fields',case when not cancelled and expires_at>clock_timestamp() and session_id=j.session_id and session_epoch=j.session_epoch then command->'fields' else null end,
  'contentHash',case when not cancelled and expires_at>clock_timestamp() and session_id=j.session_id and session_epoch=j.session_epoch then command->'contentHash' else null end,
  'rawPdfIncluded',false,'fullTextIncluded',false,'evidenceTier','user_checked_local_pdf','sourceAvailability','local_only','orderVerification','unavailable') order by operation_id) from delivered),'[]'),
 (select count(*)>lim from candidates),(select operation_id from delivered order by operation_id desc limit 1),(select count(*) from delivered) into page,more,last_id,n;
 if not replay then
  if coalesce(progress.pages,0)>=(j.policy_snapshot->>'max_pages')::integer then raise exception 'EXPORT_PAGE_LIMIT';end if;
  insert into pdf_intake_private.export_progress_v1(request_id,generation,lease_id,source_revision,pages,rows,last_cursor,last_limit,next_cursor,terminal)
  values(req,gen,lease,rev,1,n,cursor,lim,case when more then last_id else null end,not more)
  on conflict on constraint export_progress_v1_pkey do update set pages=export_progress_v1.pages+1,rows=export_progress_v1.rows+n,last_cursor=cursor,last_limit=lim,next_cursor=case when more then last_id else null end,terminal=not more;
 end if;
 return jsonb_build_object('schemaVersion','pdf-intake-export/1','section','user_artifact','sourceRevision',rev,'items',page,'hasMore',more,'nextCursor',case when more then last_id else null end,'sectionComplete',not more,'allUserDataCompleted',false);
end $$;
revoke all on function public.pdf_intake_export_v1(jsonb) from public,anon,authenticated,service_role;
create function pdf_intake_private.export_commit_v1(j export_private.core_jobs_v1,modules jsonb,lease uuid,gen integer) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare m jsonb;p pdf_intake_private.export_progress_v1%rowtype;
begin
 select value into m from jsonb_array_elements(modules) where value->>'module'='user_artifact';if m is null then return false;end if;
 select * into p from pdf_intake_private.export_progress_v1 where request_id=j.request_id and generation=gen and lease_id=lease and source_revision=j.pdf_source_revision;
 if j.pdf_export_version is null then return m->>'status' in ('unavailable','failed','partial') and m->>'reason' in ('HANDLER_MISSING','SOURCE_UNAVAILABLE','BOUNDED_LIMIT') and (m->>'pages')::integer=0 and (m->>'rows')::integer=0;end if;
 if not pdf_intake_private.export_current_v1(j) or p.request_id is null or m->'pages'<>to_jsonb(p.pages) or m->'rows'<>to_jsonb(p.rows) then return false;end if;
 if m->>'status'='complete' or m->>'reason'='LIVE_TRAVERSAL' then return p.terminal;end if;
 return m->>'status'='partial' and m->>'reason' in ('SOURCE_UNAVAILABLE','BOUNDED_LIMIT');
end $$;
do $$declare f text;anchor text:=' return j;';begin
 f:=pg_get_functiondef('export_private.lock_job_v1(uuid,boolean)'::regprocedure);
 if (length(f)-length(replace(f,anchor,'')))/length(anchor)<>1 then raise exception 'PDF_EXPORT_LOCK_DRIFT';end if;
 execute replace(f,anchor,E' if pdf_intake_private.export_current_v1(j) is distinct from true then return null;end if;\n return j;');
 f:=pg_get_functiondef('public.privacy_core_export_v1(text,jsonb)'::regprocedure);anchor:='artifact:=p_input->''artifact'';';
 if (length(f)-length(replace(f,anchor,'')))/length(anchor)<>1 then raise exception 'PDF_EXPORT_COMMIT_DRIFT';end if;
 execute replace(f,anchor,E'if pdf_intake_private.export_commit_v1(j,p_input->''modules'',lease,gen) is distinct from true then raise exception ''INVALID_OUTPUT'';end if;\n  artifact:=p_input->''artifact'';');
end $$;

revoke all on all functions in schema pdf_intake_private from public,anon,authenticated,service_role;
revoke all on all tables in schema pdf_intake_private from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
