-- Bound to consumer-window-pins.json: current TEXT_TASK_SYSTEM_PROMPT serializes
-- to 3775 UTF-8 bytes as one compact {role,content} JSON object (3777 with []).
-- PostgreSQL text contains Unicode scalars, never unpaired JS surrogate halves.
-- Construct compact role/content objects explicitly: jsonb::text adds spaces.
create function turn_private.qa_consumer_window_v1(p_history jsonb,p_text text)
returns boolean language plpgsql immutable set search_path='' as $$
declare n integer;i integer;item jsonb;body_n text;role_n text;
 content_n integer:=octet_length(p_text);prompt_n integer;
begin
 if not turn_private.valid_text(p_text,4000) or jsonb_typeof(p_history) is distinct from 'array' then return false;end if;
 n:=jsonb_array_length(p_history);
 if n>14 or n%2<>0 then return false;end if;
 prompt_n:=2+3775+1+octet_length('{"role":"user","content":'||to_json(p_text)::text||'}');
 for i in 0..n-1 loop
  item:=p_history->i;body_n:=item->>'content';role_n:=case when i%2=0 then 'user' else 'assistant' end;
  if item->>'role' is distinct from role_n or not turn_private.valid_text(body_n,case when i%2=0 then 4000 else 8000 end) then return false;end if;
  -- Explicit JS UTF-16 units for every upstream message, including older pairs
  -- outside the selected window. valid_text also enforces this on source rows.
  if (select coalesce(sum(case when ascii(ch)>65535 then 2 else 1 end),0) from regexp_split_to_table(body_n,'') ch)
   > (case when i%2=0 then 4000 else 8000 end) then return false;end if;
  if i>=greatest(0,n-6) then
   content_n:=content_n+octet_length(body_n);
   prompt_n:=prompt_n+1+octet_length('{"role":'||to_json(role_n)::text||',"content":'||to_json(body_n)::text||'}');
  end if;
 end loop;
 return content_n<=16384 and prompt_n<=32768;
end $$;
revoke all on function turn_private.qa_consumer_window_v1(jsonb,text) from public,anon,authenticated,service_role;
