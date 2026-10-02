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
 return w->>'outputDigest'=od and w->>'usageDigest'=ud;
exception when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then return false;
end $$;
revoke all on function turn_private.planning_v2_json_string_v1(text),turn_private.planning_v2_binding_bytes_v1(jsonb),turn_private.planning_v2_valid_ms_v1(jsonb),turn_private.planning_v2_integer_bytes_v1(jsonb,bigint,boolean),turn_private.serialize_planning_v2_request_v1(jsonb,uuid,jsonb),turn_private.validate_planning_v2_output_v1(jsonb,jsonb) from public,anon,authenticated,service_role;
