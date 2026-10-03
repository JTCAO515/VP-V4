-- Main-approved private local records. No trusted send/provider origin, API grant,
-- permit, ledger mutation, worker hook or completion. Full outbound prompt is not stored.
create function turn_private.planning_v2_json_string_v1(v text) returns text language sql immutable set search_path='' as $$select to_json(v)::text$$;
create function turn_private.planning_v2_binding_bytes_v1(t jsonb) returns text language plpgsql immutable set search_path='' as $$
declare k text;v text;parts text[]:=array[]::text[];i integer:=0;
begin
 if t is null or jsonb_typeof(t)<>'object' or t-array['owner','task','turn','lease','textPolicy','planningPolicy','scope','attempt','provider','model','priceVersion','intakeDigest','planningDigest']<>'{}'::jsonb or (select count(*) from jsonb_object_keys(t))<>13 then return null;end if;
 foreach k in array array['owner','task','turn','lease','textPolicy','planningPolicy','scope','attempt','provider','model','priceVersion','intakeDigest','planningDigest'] loop
  i:=i+1;v:=t->>k;if jsonb_typeof(t->k) is distinct from 'string' then return null;end if;
  if i<=8 and v !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null;end if;
  if i=9 and v<>'qwen' or i in (10,11) and v !~ '^[A-Za-z0-9._-]{1,100}$' or i>=12 and v !~ '^[a-f0-9]{64}$' then return null;end if;
  parts:=array_append(parts,turn_private.planning_v2_json_string_v1(v));
 end loop;
 if t->>'task'=t->>'turn' or t->>'intakeDigest'=t->>'planningDigest' then return null;end if;
 return '['||array_to_string(parts,',')||']';
end $$;
create function turn_private.planning_v2_valid_ms_v1(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare ts timestamptz;
begin
 if jsonb_typeof(v) is distinct from 'string' or v#>>'{}' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then return false;end if;
 ts:=(v#>>'{}')::timestamptz;return to_char(ts at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')=v#>>'{}';
exception when invalid_datetime_format or datetime_field_overflow then return false;end $$;
create function turn_private.planning_v2_integer_bytes_v1(v jsonb,max_value bigint,nullable boolean default false) returns text language plpgsql immutable set search_path='' as $$
declare n numeric;
begin
 if nullable and v='null'::jsonb then return 'null';end if;
 if jsonb_typeof(v) is distinct from 'number' then return null;end if;n:=(v#>>'{}')::numeric;
 if n<0 or n>max_value or trunc(n)<>n then return null;end if;return n::bigint::text;
exception when numeric_value_out_of_range or invalid_text_representation then return null;end $$;

create function turn_private.serialize_planning_v2_request_v1(t jsonb,p_request uuid,p_payload jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare tuple_bytes text;body text;input text;max_tokens text;pd text;rd text;
 prompt text:=$prompt$You are selecting which of two Shanghai stay-area options deserves attention based only on the supplied current goal, explicit memories and observed rail-access metrics.
Return exactly one JSON object: {"highlight":"jingan"}, {"highlight":"peoples_square"}, or {"highlight":"none"}.
Do not invent hotel prices, availability, safety, walking access, bookings, sources, or Trip changes. Missing or conflicting evidence means "none". This selection is advisory; domain code will construct the factual comparison.$prompt$;
begin
 tuple_bytes:=turn_private.planning_v2_binding_bytes_v1(t);if tuple_bytes is null or p_request is null or t->>'model'<>'qwen3.7-plus-2026-05-26' then return null;end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or p_payload-array['model','messages','stream','max_tokens','enable_thinking','response_format']<>'{}'::jsonb or (select count(*) from jsonb_object_keys(p_payload))<>6
  or p_payload->'model' is distinct from t->'model' or p_payload->'stream' is distinct from 'false'::jsonb or p_payload->'enable_thinking' is distinct from 'false'::jsonb or p_payload->'response_format' is distinct from '{"type":"json_object"}'::jsonb
  or jsonb_typeof(p_payload->'messages') is distinct from 'array' or jsonb_array_length(p_payload->'messages')<>2 then return null;end if;
 if p_payload->'messages'->0 is distinct from jsonb_build_object('role','system','content',prompt)
  or jsonb_typeof(p_payload->'messages'->1)<>'object' or (p_payload->'messages'->1)-array['role','content']<>'{}'::jsonb or (select count(*) from jsonb_object_keys(p_payload->'messages'->1))<>2
  or p_payload->'messages'->1->>'role' is distinct from 'user' or jsonb_typeof(p_payload->'messages'->1->'content') is distinct from 'string' then return null;end if;
 input:=p_payload->'messages'->1->>'content';
 if btrim(input,E' \t\n\r\f'||chr(11)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279))='' or length(input)+(select count(*) from regexp_split_to_table(input,'') c where ascii(c)>65535)>32768 then return null;end if;
 max_tokens:=turn_private.planning_v2_integer_bytes_v1(p_payload->'max_tokens',8192);if max_tokens is null or max_tokens='0' then return null;end if;
 body:='{"model":'||turn_private.planning_v2_json_string_v1(t->>'model')||',"messages":[{"role":"system","content":'||turn_private.planning_v2_json_string_v1(prompt)||'},{"role":"user","content":'||turn_private.planning_v2_json_string_v1(input)||'}],"stream":false,"max_tokens":'||max_tokens||',"enable_thinking":false,"response_format":{"type":"json_object"}}';
 if octet_length(body)>65536 then return null;end if;
 pd:=encode(sha256(convert_to(body,'UTF8')),'hex');rd:=encode(sha256(convert_to('["planning-v2-model-request/1",'||tuple_bytes||','||turn_private.planning_v2_json_string_v1(p_request::text)||','||turn_private.planning_v2_json_string_v1(pd)||']','UTF8')),'hex');
 return jsonb_build_object('schemaVersion','planning-v2-model-request/1','binding',t,'requestId',p_request,'body',body,'payloadDigest',pd,'requestDigest',rd,'executionAvailable',false);
end $$;

create function turn_private.validate_planning_v2_output_v1(w jsonb,t jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare tb text;u jsonb;a jsonb;tokens jsonb;out_bytes text;usage_bytes text;od text;ud text;input_n text;output_n text;total_n text;cached text;uncached text;reasoning text;reserved text;timeout text;actual text;
begin
 tb:=turn_private.planning_v2_binding_bytes_v1(t);if tb is null or w is null or jsonb_typeof(w)<>'object' or w-array['schemaVersion','binding','usageReceipt','output','observedAt','outputDigest','usageDigest','executionAvailable','readyForPublication']<>'{}'::jsonb or (select count(*) from jsonb_object_keys(w))<>9
  or jsonb_typeof(w->'outputDigest') is distinct from 'string' or jsonb_typeof(w->'usageDigest') is distinct from 'string' or (w->>'outputDigest') !~ '^[a-f0-9]{64}$' or (w->>'usageDigest') !~ '^[a-f0-9]{64}$'
  or w->>'schemaVersion' is distinct from 'planning-v2-model-output/1' or w->'binding' is distinct from t or w->'executionAvailable' is distinct from 'false'::jsonb or w->'readyForPublication' is distinct from 'false'::jsonb or not turn_private.planning_v2_valid_ms_v1(w->'observedAt') then return false;end if;
 if jsonb_typeof(w->'output') is distinct from 'object' or (w->'output')-'highlight'<>'{}'::jsonb or jsonb_typeof(w->'output'->'highlight') is distinct from 'string' or w->'output'->>'highlight' not in ('jingan','peoples_square','none') then return false;end if;
 u:=w->'usageReceipt';a:=u->'attempt';tokens:=u->'usage';
 if u is null or jsonb_typeof(u)<>'object' or u-array['schemaVersion','turnId','policyId','attempt','usage','actualMicros','observedAt']<>'{}'::jsonb or (select count(*) from jsonb_object_keys(u))<>7 or u->>'schemaVersion' is distinct from 'validated-planning-usage/1'
  or u->>'turnId' is distinct from t->>'turn' or u->>'policyId' is distinct from t->>'planningPolicy' or not turn_private.planning_v2_valid_ms_v1(u->'observedAt') then return false;end if;
 if a is null or jsonb_typeof(a)<>'object' or a-array['scopeId','ownerId','taskId','attemptId','provider','model','priceVersion','reservedMicros','timeoutMs']<>'{}'::jsonb or (select count(*) from jsonb_object_keys(a))<>9
  or a->>'scopeId' is distinct from t->>'scope' or a->>'ownerId' is distinct from t->>'owner' or a->>'taskId' is distinct from t->>'task' or a->>'attemptId' is distinct from t->>'attempt'
  or a->'provider' is distinct from t->'provider' or a->'model' is distinct from t->'model' or a->'priceVersion' is distinct from t->'priceVersion' then return false;end if;
 reserved:=turn_private.planning_v2_integer_bytes_v1(a->'reservedMicros',1000000000000);timeout:=turn_private.planning_v2_integer_bytes_v1(a->'timeoutMs',300000);actual:=turn_private.planning_v2_integer_bytes_v1(u->'actualMicros',1000000000000);
 if reserved is null or reserved='0' or timeout is null or timeout='0' or actual is null then return false;end if;
 if tokens is null or jsonb_typeof(tokens)<>'object' or tokens-array['inputTokens','outputTokens','totalTokens','cachedInputTokens','uncachedInputTokens','reasoningTokens','cost']<>'{}'::jsonb or (select count(*) from jsonb_object_keys(tokens))<>7 or tokens->>'cost' is distinct from 'unknown' or jsonb_typeof(tokens->'cost')<>'string' then return false;end if;
 input_n:=turn_private.planning_v2_integer_bytes_v1(tokens->'inputTokens',9007199254740991);output_n:=turn_private.planning_v2_integer_bytes_v1(tokens->'outputTokens',9007199254740991);total_n:=turn_private.planning_v2_integer_bytes_v1(tokens->'totalTokens',9007199254740991);
 cached:=turn_private.planning_v2_integer_bytes_v1(tokens->'cachedInputTokens',9007199254740991,true);uncached:=turn_private.planning_v2_integer_bytes_v1(tokens->'uncachedInputTokens',9007199254740991,true);reasoning:=turn_private.planning_v2_integer_bytes_v1(tokens->'reasoningTokens',9007199254740991,true);
 if input_n is null or output_n is null or total_n is null or cached is null or uncached is null or reasoning is null or input_n::numeric+output_n::numeric<>total_n::numeric
  or cached<>'null' and cached::numeric>input_n::numeric or uncached<>'null' and uncached::numeric>input_n::numeric or cached<>'null' and uncached<>'null' and cached::numeric+uncached::numeric<>input_n::numeric or reasoning<>'null' and reasoning::numeric>output_n::numeric then return false;end if;
 out_bytes:='{"highlight":'||turn_private.planning_v2_json_string_v1(w->'output'->>'highlight')||'}';
 usage_bytes:='{"schemaVersion":"validated-planning-usage/1","turnId":'||turn_private.planning_v2_json_string_v1(t->>'turn')||',"policyId":'||turn_private.planning_v2_json_string_v1(t->>'planningPolicy')||',"attempt":{"scopeId":'||turn_private.planning_v2_json_string_v1(t->>'scope')||',"ownerId":'||turn_private.planning_v2_json_string_v1(t->>'owner')||',"taskId":'||turn_private.planning_v2_json_string_v1(t->>'task')||',"attemptId":'||turn_private.planning_v2_json_string_v1(t->>'attempt')||',"provider":"qwen","model":'||turn_private.planning_v2_json_string_v1(t->>'model')||',"priceVersion":'||turn_private.planning_v2_json_string_v1(t->>'priceVersion')||',"reservedMicros":'||reserved||',"timeoutMs":'||timeout||'},"usage":{"inputTokens":'||input_n||',"outputTokens":'||output_n||',"totalTokens":'||total_n||',"cachedInputTokens":'||cached||',"uncachedInputTokens":'||uncached||',"reasoningTokens":'||reasoning||',"cost":"unknown"},"actualMicros":'||actual||',"observedAt":'||turn_private.planning_v2_json_string_v1(u->>'observedAt')||'}';
 od:=encode(sha256(convert_to('["planning-v2-model-output/1",'||tb||','||turn_private.planning_v2_json_string_v1(w->>'observedAt')||','||out_bytes||']','UTF8')),'hex');
 ud:=encode(sha256(convert_to('["planning-v2-model-output-usage/1",'||tb||','||turn_private.planning_v2_json_string_v1(w->>'observedAt')||','||usage_bytes||']','UTF8')),'hex');
 return coalesce(w->>'outputDigest'=od and w->>'usageDigest'=ud,false);
exception when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then return false;
end $$;
revoke all on function turn_private.planning_v2_json_string_v1(text),turn_private.planning_v2_binding_bytes_v1(jsonb),turn_private.planning_v2_valid_ms_v1(jsonb),turn_private.planning_v2_integer_bytes_v1(jsonb,bigint,boolean),turn_private.serialize_planning_v2_request_v1(jsonb,uuid,jsonb),turn_private.validate_planning_v2_output_v1(jsonb,jsonb) from public,anon,authenticated,service_role;

create table turn_private.planning_v2_model_local_journal (
 request_id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 task_id uuid not null references turn_private.service_tasks(id) on delete cascade,
 turn_id uuid unique not null references turn_private.planning_comparisons(turn_id) on delete cascade,
 scope_id uuid not null,attempt_id uuid not null,
 binding jsonb not null,payload_digest text not null check(payload_digest ~ '^[a-f0-9]{64}$'),
 request_digest text unique not null check(request_digest ~ '^[a-f0-9]{64}$'),
 phase text not null check(phase in ('intent_saved','send_ack_recorded','response_recorded')),
 revision bigint not null check(revision between 1 and 2147483647),
 intent_at timestamptz not null default clock_timestamp(),send_at timestamptz,response_at timestamptz,unknown_at timestamptz,
 send_observation jsonb,response_observation jsonb,output_wire jsonb,unknown_reason text,
 unique(scope_id,attempt_id),foreign key(scope_id,attempt_id) references public.model_budget_attempts(scope_id,attempt_id) on delete cascade,
 check((send_at is null)=(send_observation is null)),check((response_at is null)=(response_observation is null)),check((response_at is null)=(output_wire is null)),
 check((unknown_at is null)=(unknown_reason is null)),
 check((phase='intent_saved' and send_at is null and response_at is null) or (phase='send_ack_recorded' and send_at is not null and response_at is null) or (phase='response_recorded' and send_at is not null and response_at is not null))
);
alter table turn_private.planning_v2_model_local_journal enable row level security;
revoke all on turn_private.planning_v2_model_local_journal from public,anon,authenticated,service_role;
create index planning_v2_local_journal_owner on turn_private.planning_v2_model_local_journal(owner_id,request_id);
create function turn_private.planning_v2_server_ms_v1(v timestamptz) returns text language sql immutable set search_path='' as $$select case when v is null then null else to_char(date_trunc('milliseconds',v) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end$$;
create function turn_private.planning_v2_journal_wire_v1(r turn_private.planning_v2_model_local_journal) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('kind','model_request_journal','schemaVersion','planning-v2-model-journal/1','binding',r.binding,'requestId',r.request_id,'requestDigest',r.request_digest,'payloadDigest',r.payload_digest,'phase',r.phase,'revision',r.revision,
  'intentRecordedAt',turn_private.planning_v2_server_ms_v1(r.intent_at),'sendAckRecordedAt',turn_private.planning_v2_server_ms_v1(r.send_at),'responseRecordedAt',turn_private.planning_v2_server_ms_v1(r.response_at),'unknownAt',turn_private.planning_v2_server_ms_v1(r.unknown_at),
  'sendAckObservation',r.send_observation,'responseObservation',r.response_observation,'outputWire',r.output_wire,'providerOriginVerified',false,'executionAvailable',false,'readyForPublication',false,'reconciliationRequired',true)
$$;
create function turn_private.planning_v2_local_observation_v1(v jsonb,p_kind text,p_request uuid,p_digest text) returns boolean language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(v) is distinct from 'object' then return false;end if;
 return coalesce(v-array['schemaVersion','source','kind','requestId','requestDigest','observedAt']='{}'::jsonb and (select count(*) from jsonb_object_keys(v))=6
  and v->>'schemaVersion'='planning-v2-local-observation/1' and v->>'source'='local_observation' and v->>'kind'=p_kind
  and v->>'requestId'=p_request::text and v->>'requestDigest'=p_digest and turn_private.planning_v2_valid_ms_v1(v->'observedAt'),false);
end $$;
create function turn_private.guard_planning_v2_local_journal_v1() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='INSERT' then
  if new.phase<>'intent_saved' or new.revision<>1 or new.unknown_at is not null or turn_private.planning_v2_binding_bytes_v1(new.binding) is null
   or new.binding->>'owner'<>new.owner_id::text or new.binding->>'task'<>new.task_id::text or new.binding->>'turn'<>new.turn_id::text or new.binding->>'scope'<>new.scope_id::text or new.binding->>'attempt'<>new.attempt_id::text
   or not exists(select 1 from turn_private.planning_v2_model_attempt_bindings b where b.turn_id=new.turn_id and b.owner_id=new.owner_id and b.task_id=new.task_id and b.scope_id=new.scope_id and b.attempt_id=new.attempt_id and b.claim_lease::text=new.binding->>'lease') then raise exception 'JOURNAL_IDENTITY_CONFLICT';end if;
 else
  if (to_jsonb(new)-array['phase','revision','send_at','response_at','unknown_at','send_observation','response_observation','output_wire','unknown_reason']) is distinct from (to_jsonb(old)-array['phase','revision','send_at','response_at','unknown_at','send_observation','response_observation','output_wire','unknown_reason'])
   or new.revision<>old.revision+1 or old.unknown_at is not null then raise exception 'IMMUTABLE_LOCAL_JOURNAL';end if;
  if new.unknown_at is not null then
   if new.phase<>old.phase or new.send_observation is distinct from old.send_observation or new.response_observation is distinct from old.response_observation or new.output_wire is distinct from old.output_wire or new.send_at is distinct from old.send_at or new.response_at is distinct from old.response_at or new.unknown_at>clock_timestamp() or new.unknown_reason not in ('timeout','disconnected','ack_lost','uncertain_local_effect') then raise exception 'IMMUTABLE_LOCAL_JOURNAL';end if;
  elsif old.phase='intent_saved' and new.phase='send_ack_recorded' then
   if not turn_private.planning_v2_local_observation_v1(new.send_observation,'send_ack',new.request_id,new.request_digest) then raise exception 'INVALID_LOCAL_OBSERVATION';end if;
  elsif old.phase='send_ack_recorded' and new.phase='response_recorded' then
   if new.send_observation is distinct from old.send_observation or not turn_private.planning_v2_local_observation_v1(new.response_observation,'response_received',new.request_id,new.request_digest) or turn_private.validate_planning_v2_output_v1(new.output_wire,new.binding) is distinct from true then raise exception 'INVALID_LOCAL_OUTPUT';end if;
  else raise exception 'IMMUTABLE_LOCAL_JOURNAL';end if;
 end if;
 return new;
end $$;
create trigger guard_planning_v2_local_journal before insert or update on turn_private.planning_v2_model_local_journal for each row execute function turn_private.guard_planning_v2_local_journal_v1();

create function turn_private.create_planning_v2_request_intent_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_text_policy uuid,p_planning_policy uuid,p_scope uuid,p_attempt uuid,p_provider text,p_model text,p_price_version text,p_intake_digest text,p_planning_digest text,p_request_id uuid,p_payload_text text,p_payload_digest text,p_request_digest text,p_expected_revision bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare q jsonb;t jsonb;v jsonb;r turn_private.planning_v2_model_local_journal%rowtype;live jsonb;
begin
 q:=turn_private.read_planning_v2_model_binding_v1(p_owner,p_task,p_turn,p_lease,p_text_policy,p_planning_policy,p_scope,p_attempt,p_provider,p_model,p_price_version,p_intake_digest,p_planning_digest);if q->>'kind' is distinct from 'model_attempt_binding' then return jsonb_build_object('kind','blocked');end if;t:=jsonb_build_object('owner',p_owner,'task',p_task,'turn',p_turn,'lease',p_lease,'textPolicy',p_text_policy,'planningPolicy',p_planning_policy,'scope',p_scope,'attempt',p_attempt,'provider',p_provider,'model',p_model,'priceVersion',p_price_version,'intakeDigest',p_intake_digest,'planningDigest',p_planning_digest);
 if p_request_id is null or p_payload_text is null or octet_length(p_payload_text)>65536 or p_expected_revision is null or p_payload_digest is null or p_request_digest is null then return jsonb_build_object('kind','blocked');end if;
 v:=turn_private.serialize_planning_v2_request_v1(t,p_request_id,p_payload_text::jsonb);
 if v is null or v->>'body' is distinct from p_payload_text or v->>'payloadDigest' is distinct from p_payload_digest or v->>'requestDigest' is distinct from p_request_digest then return jsonb_build_object('kind','blocked');end if;
 select * into r from turn_private.planning_v2_model_local_journal where request_id=p_request_id for update nowait;
 if found then
  if r.binding is distinct from t or r.payload_digest<>p_payload_digest or r.request_digest<>p_request_digest or r.phase<>'intent_saved' or r.unknown_at is not null or q->'unknown'='true'::jsonb or p_expected_revision<>0 then return jsonb_build_object('kind','conflict');end if;
  return turn_private.planning_v2_journal_wire_v1(r)||jsonb_build_object('reused',true);
 end if;
 live:=turn_private.planning_v2_model_binding_basis_v1(p_owner,p_task,p_turn,p_lease,p_text_policy,p_planning_policy,p_scope,p_attempt,p_provider,p_model,p_price_version,p_intake_digest,p_planning_digest);
 if p_expected_revision<>0 or q->>'ledgerStatus'<>'reserved' or q->'unknown'='true'::jsonb or live->'scopeLive' is distinct from 'true'::jsonb then return jsonb_build_object('kind','blocked');end if;
 insert into turn_private.planning_v2_model_local_journal(request_id,owner_id,task_id,turn_id,scope_id,attempt_id,binding,payload_digest,request_digest,phase,revision) values(p_request_id,p_owner,p_task,p_turn,p_scope,p_attempt,t,p_payload_digest,p_request_digest,'intent_saved',1) returning * into r;
 return turn_private.planning_v2_journal_wire_v1(r)||jsonb_build_object('reused',false);
exception when lock_not_available or unique_violation then return jsonb_build_object('kind','conflict');when data_exception then return jsonb_build_object('kind','blocked');
end $$;
revoke all on function turn_private.create_planning_v2_request_intent_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,uuid,text,text,text,bigint) from public,anon,authenticated,service_role;

create function turn_private.read_planning_v2_request_journal_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_text_policy uuid,p_planning_policy uuid,p_scope uuid,p_attempt uuid,p_provider text,p_model text,p_price_version text,p_intake_digest text,p_planning_digest text,p_request_id uuid,p_request_digest text,p_expected_output_digest text,p_expected_usage_digest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare q jsonb;t jsonb;r turn_private.planning_v2_model_local_journal%rowtype;
begin
 q:=turn_private.read_planning_v2_model_binding_v1(p_owner,p_task,p_turn,p_lease,p_text_policy,p_planning_policy,p_scope,p_attempt,p_provider,p_model,p_price_version,p_intake_digest,p_planning_digest);if q->>'kind' is distinct from 'model_attempt_binding' then return jsonb_build_object('kind','blocked');end if;t:=jsonb_build_object('owner',p_owner,'task',p_task,'turn',p_turn,'lease',p_lease,'textPolicy',p_text_policy,'planningPolicy',p_planning_policy,'scope',p_scope,'attempt',p_attempt,'provider',p_provider,'model',p_model,'priceVersion',p_price_version,'intakeDigest',p_intake_digest,'planningDigest',p_planning_digest);
 select * into r from turn_private.planning_v2_model_local_journal where request_id=p_request_id for share nowait;
 if not found or r.binding is distinct from t or r.request_digest is distinct from p_request_digest then return jsonb_build_object('kind','blocked');end if;
 if q->'unknown'='true'::jsonb or (q->>'ledgerStatus'='settled' and r.output_wire is not null and q->'actualMicros' is distinct from r.output_wire->'usageReceipt'->'actualMicros') then return jsonb_build_object('kind','blocked');end if;
 if (p_expected_output_digest is null)<>(p_expected_usage_digest is null) then return jsonb_build_object('kind','blocked');end if;
 if p_expected_output_digest is not null and (r.output_wire is null or r.output_wire->>'outputDigest' is distinct from p_expected_output_digest or r.output_wire->>'usageDigest' is distinct from p_expected_usage_digest) then return jsonb_build_object('kind','conflict');end if;
 return turn_private.planning_v2_journal_wire_v1(r);
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
revoke all on function turn_private.read_planning_v2_request_journal_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,uuid,text,text,text) from public,anon,authenticated,service_role;

create function turn_private.record_planning_v2_send_ack_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_text_policy uuid,p_planning_policy uuid,p_scope uuid,p_attempt uuid,p_provider text,p_model text,p_price_version text,p_intake_digest text,p_planning_digest text,p_request_id uuid,p_request_digest text,p_expected_revision bigint,p_local_observation jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare q jsonb;t jsonb;r turn_private.planning_v2_model_local_journal%rowtype;
begin
 q:=turn_private.read_planning_v2_model_binding_v1(p_owner,p_task,p_turn,p_lease,p_text_policy,p_planning_policy,p_scope,p_attempt,p_provider,p_model,p_price_version,p_intake_digest,p_planning_digest);if q->>'kind' is distinct from 'model_attempt_binding' then return jsonb_build_object('kind','blocked');end if;t:=jsonb_build_object('owner',p_owner,'task',p_task,'turn',p_turn,'lease',p_lease,'textPolicy',p_text_policy,'planningPolicy',p_planning_policy,'scope',p_scope,'attempt',p_attempt,'provider',p_provider,'model',p_model,'priceVersion',p_price_version,'intakeDigest',p_intake_digest,'planningDigest',p_planning_digest);
 if p_expected_revision is null or not turn_private.planning_v2_local_observation_v1(p_local_observation,'send_ack',p_request_id,p_request_digest) then return jsonb_build_object('kind','blocked');end if;

 select * into r from turn_private.planning_v2_model_local_journal where request_id=p_request_id for update nowait;
 if not found or r.binding is distinct from t or r.request_digest is distinct from p_request_digest then return jsonb_build_object('kind','blocked');end if;
 if r.unknown_at is not null or q->'unknown'='true'::jsonb then return jsonb_build_object('kind','blocked');end if;
 if r.phase='send_ack_recorded' and r.send_observation=p_local_observation and p_expected_revision=r.revision-1 then return turn_private.planning_v2_journal_wire_v1(r)||jsonb_build_object('reused',true);end if;
 if r.phase<>'intent_saved' or r.revision<>p_expected_revision then return jsonb_build_object('kind','conflict');end if;
 if q->>'ledgerStatus' not in ('dispatched','pending') then return jsonb_build_object('kind','blocked');end if;
 update turn_private.planning_v2_model_local_journal set phase='send_ack_recorded',send_observation=p_local_observation,send_at=clock_timestamp(),revision=revision+1 where request_id=p_request_id returning * into r;
 return turn_private.planning_v2_journal_wire_v1(r)||jsonb_build_object('reused',false);
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
revoke all on function turn_private.record_planning_v2_send_ack_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,uuid,text,bigint,jsonb) from public,anon,authenticated,service_role;

create function turn_private.record_planning_v2_response_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_text_policy uuid,p_planning_policy uuid,p_scope uuid,p_attempt uuid,p_provider text,p_model text,p_price_version text,p_intake_digest text,p_planning_digest text,p_request_id uuid,p_request_digest text,p_expected_revision bigint,p_local_observation jsonb,p_output_wire jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare q jsonb;t jsonb;r turn_private.planning_v2_model_local_journal%rowtype;
begin
 q:=turn_private.read_planning_v2_model_binding_v1(p_owner,p_task,p_turn,p_lease,p_text_policy,p_planning_policy,p_scope,p_attempt,p_provider,p_model,p_price_version,p_intake_digest,p_planning_digest);if q->>'kind' is distinct from 'model_attempt_binding' then return jsonb_build_object('kind','blocked');end if;t:=jsonb_build_object('owner',p_owner,'task',p_task,'turn',p_turn,'lease',p_lease,'textPolicy',p_text_policy,'planningPolicy',p_planning_policy,'scope',p_scope,'attempt',p_attempt,'provider',p_provider,'model',p_model,'priceVersion',p_price_version,'intakeDigest',p_intake_digest,'planningDigest',p_planning_digest);
 if p_expected_revision is null or not turn_private.planning_v2_local_observation_v1(p_local_observation,'response_received',p_request_id,p_request_digest) then return jsonb_build_object('kind','blocked');end if;
 if turn_private.validate_planning_v2_output_v1(p_output_wire,t) is distinct from true or (q->>'ledgerStatus'='settled' and q->'actualMicros' is distinct from p_output_wire->'usageReceipt'->'actualMicros') then return jsonb_build_object('kind','blocked');end if;
 select * into r from turn_private.planning_v2_model_local_journal where request_id=p_request_id for update nowait;
 if not found or r.binding is distinct from t or r.request_digest is distinct from p_request_digest then return jsonb_build_object('kind','blocked');end if;
 if r.unknown_at is not null or q->'unknown'='true'::jsonb then return jsonb_build_object('kind','blocked');end if;
 if r.phase='response_recorded' and r.response_observation=p_local_observation and r.output_wire=p_output_wire and p_expected_revision=r.revision-1 then return turn_private.planning_v2_journal_wire_v1(r)||jsonb_build_object('reused',true);end if;
 if r.phase<>'send_ack_recorded' or r.revision<>p_expected_revision then return jsonb_build_object('kind','conflict');end if;
 if q->>'ledgerStatus' not in ('dispatched','pending','settled') then return jsonb_build_object('kind','blocked');end if;
 update turn_private.planning_v2_model_local_journal set phase='response_recorded',response_observation=p_local_observation,output_wire=p_output_wire,response_at=clock_timestamp(),revision=revision+1 where request_id=p_request_id returning * into r;
 return turn_private.planning_v2_journal_wire_v1(r)||jsonb_build_object('reused',false);
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
revoke all on function turn_private.record_planning_v2_response_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,uuid,text,bigint,jsonb,jsonb) from public,anon,authenticated,service_role;

create function turn_private.unknown_planning_v2_request_v1(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_text_policy uuid,p_planning_policy uuid,p_scope uuid,p_attempt uuid,p_provider text,p_model text,p_price_version text,p_intake_digest text,p_planning_digest text,p_request_id uuid,p_request_digest text,p_expected_revision bigint,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare q jsonb;t jsonb;r turn_private.planning_v2_model_local_journal%rowtype;
begin
 q:=turn_private.read_planning_v2_model_binding_v1(p_owner,p_task,p_turn,p_lease,p_text_policy,p_planning_policy,p_scope,p_attempt,p_provider,p_model,p_price_version,p_intake_digest,p_planning_digest);if q->>'kind' is distinct from 'model_attempt_binding' then return jsonb_build_object('kind','blocked');end if;t:=jsonb_build_object('owner',p_owner,'task',p_task,'turn',p_turn,'lease',p_lease,'textPolicy',p_text_policy,'planningPolicy',p_planning_policy,'scope',p_scope,'attempt',p_attempt,'provider',p_provider,'model',p_model,'priceVersion',p_price_version,'intakeDigest',p_intake_digest,'planningDigest',p_planning_digest);
 if p_expected_revision is null or p_reason is null or p_reason not in ('timeout','disconnected','ack_lost','uncertain_local_effect') then return jsonb_build_object('kind','blocked');end if;
 select * into r from turn_private.planning_v2_model_local_journal where request_id=p_request_id for update nowait;
 if not found or r.binding is distinct from t or r.request_digest is distinct from p_request_digest then return jsonb_build_object('kind','blocked');end if;
 if r.unknown_at is not null then
  if r.unknown_reason<>p_reason or p_expected_revision<>r.revision-1 then return jsonb_build_object('kind','conflict');end if;
  return turn_private.planning_v2_journal_wire_v1(r)||jsonb_build_object('reused',true);
 end if;
 if r.revision<>p_expected_revision then return jsonb_build_object('kind','conflict');end if;
 update turn_private.planning_v2_model_local_journal set unknown_at=clock_timestamp(),unknown_reason=p_reason,revision=revision+1 where request_id=p_request_id returning * into r;
 return turn_private.planning_v2_journal_wire_v1(r)||jsonb_build_object('reused',false);
exception when lock_not_available then return jsonb_build_object('kind','blocked');end $$;
revoke all on function turn_private.unknown_planning_v2_request_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,uuid,text,bigint,text) from public,anon,authenticated,service_role;
revoke all on function turn_private.planning_v2_server_ms_v1(timestamptz),turn_private.planning_v2_journal_wire_v1(turn_private.planning_v2_model_local_journal),turn_private.planning_v2_local_observation_v1(jsonb,text,uuid,text),turn_private.guard_planning_v2_local_journal_v1() from public,anon,authenticated,service_role;
