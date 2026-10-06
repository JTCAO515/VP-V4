-- VPJ-58 independent conversation data. This migration remains in development.
-- Sole fixed producer: 9a91fe36de00e6b6f0392e5f6373a08e80a9d316 (protocol 44c1d705).
-- No target grants, caller-set transaction authority, raw request/source bodies,
-- session cascade of tombstones, generic export enrollment or provider worker.
create schema conversation_data_private;
revoke all on schema conversation_data_private from public,anon,authenticated,service_role;
alter default privileges in schema conversation_data_private revoke execute on functions from public;

-- Finite, inspectable own operation state; retained session UUID is inert.
-- decision is the finite closed D, never a receipt or another operation row.
create table conversation_data_private.operations_v1 (
 request_id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,
 mobile_epoch bigint not null check(mobile_epoch between 1 and 9007199254740991),
 scope text not null check(scope in('conversation-sensitive-data/1','conversation-delete-progress/1')),
 root_kind text,root_id uuid,object_ids uuid[] not null,
 source_digest text not null check(source_digest ~ '^[a-f0-9]{64}$'),
 preview_digest text not null check(preview_digest ~ '^[a-f0-9]{64}$'),
 captured_at bigint not null check(captured_at>0),
 expires_at bigint not null check(expires_at=captured_at+30000),
 request_digest text check(request_digest ~ '^[a-f0-9]{64}$'),
 state text not null default 'previewed' check(state in('previewed','erased')),
 preview_erased boolean not null default false,
 graph jsonb,erase_counts jsonb,redact_counts jsonb,retain_counts jsonb,
 retained_references jsonb,conflicts jsonb,decision jsonb,
 check(((scope='conversation-sensitive-data/1' and root_kind in('conversation','thread') and root_id is not null and cardinality(object_ids)=0)
  or (scope='conversation-delete-progress/1' and root_kind is null and root_id is null and cardinality(object_ids) between 1 and 20 and not request_id=any(object_ids))) is true),
 check((state='previewed')=(request_digest is null)),
 check((state='previewed')=(decision is null)),
 check(state<>'erased' or preview_erased),
 check((preview_erased and graph is null and erase_counts is null and redact_counts is null and retain_counts is null and retained_references is null and conflicts is null)
  or (not preview_erased and graph is not null and erase_counts is not null and redact_counts is not null and retain_counts is not null and retained_references is not null and conflicts is not null))
);
create index conversation_data_owner_v1 on conversation_data_private.operations_v1(owner_id,request_id);
alter table conversation_data_private.operations_v1 enable row level security;
revoke all on conversation_data_private.operations_v1 from public,anon,authenticated,service_role;

-- Ephemeral authorization is private and bound to an actual PostgreSQL xid.
-- Executor must remove its proof before returning/committing; it is not a
-- second permanent fence inventory and stores no source/body/raw command.
create table conversation_data_private.transaction_proofs_v1 (
 transaction_id xid8 primary key,
 owner_id uuid not null,
 request_id uuid not null,
 source_digest text not null check(source_digest ~ '^[a-f0-9]{64}$'),
 graph jsonb not null,
 expires_at bigint not null
);
alter table conversation_data_private.transaction_proofs_v1 enable row level security;
revoke all on conversation_data_private.transaction_proofs_v1 from public,anon,authenticated,service_role;

create function conversation_data_private.digest_v1(v text) returns text language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(v,'UTF8')),'hex')
$$;
create function conversation_data_private.deadline_v1(c bigint,e bigint) returns bigint language plpgsql volatile set search_path='' as $$
declare n bigint:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
begin if n<c or n>=e then raise exception 'CONVERSATION_EXPIRED';end if;return n;end$$;

create function conversation_data_private.ids_v1(v jsonb,max_n integer) returns boolean language plpgsql immutable set search_path='' as $$
declare x jsonb;previous_n text;
begin
 if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)>max_n then return false;end if;
 for x in select value from jsonb_array_elements(v) loop
  if notification_private.uuid(x) is not true or previous_n>=x#>>'{}' then return false;end if;
  previous_n:=x#>>'{}';
 end loop;return true;
end$$;
create function conversation_data_private.graph_v1(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text;n integer:=0;
begin
 if notification_private.exact(v,array['conversationIds','threadIds','turnIds','taskIds','goalIds','messageIds','artifactIds']) is not true then return false;end if;
 foreach k in array array['conversationIds','threadIds','turnIds','taskIds','goalIds','messageIds','artifactIds'] loop
  if conversation_data_private.ids_v1(v->k,4100) is not true then return false;end if;
  n:=n+jsonb_array_length(v->k);
 end loop;return n<=4100;
end$$;
create function conversation_data_private.selection_v1(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
begin
 if notification_private.uuid(v->'requestId') is not true then return false;end if;
 if v->>'scope'='conversation-sensitive-data/1' then
  return coalesce(jsonb_typeof(v->'rootKind')='string' and v->>'rootKind' in('conversation','thread') and notification_private.uuid(v->'rootId') and v->'objectIds'='[]'::jsonb,false);
 elsif v->>'scope'='conversation-delete-progress/1' then
  return coalesce(v->'rootKind'='null'::jsonb and v->'rootId'='null'::jsonb and conversation_data_private.ids_v1(v->'objectIds',20)
   and jsonb_array_length(v->'objectIds')>0 and not(v->'objectIds' ? (v->>'requestId')),false);
 end if;return false;
end$$;
create function conversation_data_private.input_v1(v jsonb,a text,recovering boolean default false) returns boolean language plpgsql immutable set search_path='' as $$
declare keys_n text[]:=array['action','scope'];original_n jsonb;
begin
 if jsonb_typeof(v->'action') is distinct from 'string' or v->>'action' is distinct from a
  or jsonb_typeof(v->'scope') is distinct from 'string'
  or v->>'scope' not in('conversation-sensitive-data/1','conversation-delete-progress/1') then return false;end if;
 if a='list' then
  if notification_private.exact(v,keys_n||array['rootKind','cursor','limit']) is not true or v->'limit' is distinct from '20'::jsonb then return false;end if;
  if v->>'scope'='conversation-sensitive-data/1' then
   if (jsonb_typeof(v->'rootKind')='string' and v->>'rootKind' in('conversation','thread')) is not true then return false;end if;
  elsif v->'rootKind' is distinct from 'null'::jsonb then return false;end if;
  if v->'cursor' is distinct from 'null'::jsonb then
   if notification_private.exact(v->'cursor',array['sourceDigest','afterId']) is not true
    or (jsonb_typeof(v->'cursor'->'sourceDigest')='string' and v->'cursor'->>'sourceDigest' ~ '^[a-f0-9]{64}$') is not true
    or notification_private.uuid(v->'cursor'->'afterId') is not true then return false;end if;
  end if;return true;
 end if;
 keys_n:=keys_n||array['requestId','rootKind','rootId','objectIds'];
 if conversation_data_private.selection_v1(v) is not true then return false;end if;
 if a='erase' then
  keys_n:=keys_n||array['sourceDigest','previewDigest','confirmed'];
  if v->'confirmed' is distinct from 'true'::jsonb
   or (jsonb_typeof(v->'sourceDigest')='string' and v->>'sourceDigest' ~ '^[a-f0-9]{64}$') is not true
   or (jsonb_typeof(v->'previewDigest')='string' and v->>'previewDigest' ~ '^[a-f0-9]{64}$') is not true then return false;end if;
 elsif a='recover' then
  if recovering then return false;end if;
  keys_n:=keys_n||array['mutationBytes'];
  if jsonb_typeof(v->'mutationBytes') is distinct from 'string' or octet_length(v->>'mutationBytes')>8192 then return false;end if;
  begin original_n:=(v->>'mutationBytes')::jsonb;exception when others then return false;end;
  if conversation_data_private.input_v1(original_n,'erase',true) is not true
   or v->'scope' is distinct from original_n->'scope' or v->'requestId' is distinct from original_n->'requestId'
   or v->'rootKind' is distinct from original_n->'rootKind' or v->'rootId' is distinct from original_n->'rootId'
   or v->'objectIds' is distinct from original_n->'objectIds' then return false;end if;
 elsif a<>'preview' then return false;end if;
 return notification_private.exact(v,keys_n);
end$$;

-- Actor check is reusable only inside this default-denied source executor.
-- Original owner34 -> auth user -> mobile account -> session locks are retained.
create function conversation_data_private.actor_v1(expected_epoch bigint) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare u uuid:=auth.uid();s uuid;e bigint;n timestamptz:=clock_timestamp();
begin
 if u is null or auth.role() is distinct from 'authenticated' or auth.jwt()->>'role' is distinct from 'authenticated'
  or auth.jwt()->>'is_anonymous' is distinct from 'false' or notification_private.uuid(auth.jwt()->'session_id') is not true then raise exception 'UNAUTHENTICATED';end if;
 s:=(auth.jwt()->>'session_id')::uuid;
 if not pg_try_advisory_xact_lock(hashtextextended(u::text,34)) then raise lock_not_available using message='CONVERSATION_CONFLICT';end if;
 perform 1 from auth.users where id=u for key share nowait;if not found then raise exception 'UNAUTHENTICATED';end if;
 select epoch into e from identity_private.mobile_accounts where owner_id=u and session_id=s for update nowait;
 if not found or e is distinct from expected_epoch then raise exception 'SESSION_REPLACED';end if;
 perform 1 from auth.sessions where id=s and user_id=u for key share nowait;if not found then raise exception 'SESSION_REPLACED';end if;
 perform identity_private.guard_mobile_rpc_v2();
 if identity_private.mobile_access_v2() is not true or not exists(select 1 from identity_private.mobile_attempts where owner_id=u and session_id=s and epoch=e)
  then raise exception 'SESSION_REPLACED';end if;
 n:=clock_timestamp();
 if not exists(select 1 from auth.sessions where id=s and user_id=u and created_at between n-interval '5 minutes' and n)
  then raise exception 'REAUTHENTICATION_REQUIRED';end if;
 return jsonb_build_object('ownerId',u,'sessionId',s,'mobileEpoch',e);
end$$;

create function conversation_data_private.operation_row_v1(r conversation_data_private.operations_v1) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('requestId',r.request_id,'ownerId',r.owner_id,'sessionId',r.session_id,'mobileEpoch',r.mobile_epoch,
  'scope',r.scope,'rootKind',r.root_kind,'rootId',r.root_id,'objectIds',r.object_ids,
  'sourceDigest',r.source_digest,'previewDigest',r.preview_digest,'capturedAt',r.captured_at,'expiresAt',r.expires_at,
  'requestDigest',r.request_digest,'state',r.state,'previewErased',r.preview_erased,'graph',r.graph,
  'eraseCounts',r.erase_counts,'redactCounts',r.redact_counts,'retainCounts',r.retain_counts,
  'retainedReferences',r.retained_references,'conflicts',r.conflicts,'decision',r.decision)
$$;

revoke all on all functions in schema conversation_data_private from public,anon,authenticated,service_role;
-- Source closure/CAS, permanent entity/JSON fences, effects, receipt and public
-- RPC remain unwritten until the actual source-impact reverse-edge finding is
-- incorporated. Do not merge or activate this partial migration as a delivery.
