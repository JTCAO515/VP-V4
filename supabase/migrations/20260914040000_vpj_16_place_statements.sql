-- Extend the existing immutable statement/review/publication path. No content,
-- grants to application tables, policy activation, or historical row rewrite.
alter function knowledge_review_private.statement_valid(jsonb) rename to statement_valid_v1;

create function knowledge_review_private.place_text(v jsonb, maximum integer)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(knowledge_review_private.bounded_text(v,maximum)
  and v#>>'{}'=btrim(v#>>'{}') and (v#>>'{}')!~'[[:cntrl:]]',false)
$$;

create function knowledge_review_private.statement_valid(v jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare a jsonb:=v->'assertion'; p jsonb:=v->'place'; x jsonb:=v->'value'; start_time timestamptz; end_time timestamptz; normalized jsonb;
begin
 if v->>'schemaVersion' is distinct from 'knowledge-statement/2' then
  return knowledge_review_private.statement_valid_v1(v);
 end if;
 if not knowledge_review_private.closed_object(v,array['schemaVersion','assertion','scope','expressions','sources','place','value'])
  or not knowledge_review_private.closed_object(p,array['names'])
  or not knowledge_review_private.closed_object(p->'names',array['en','zh'])
  or not knowledge_review_private.place_text(p->'names'->'en',160)
  or not knowledge_review_private.place_text(p->'names'->'zh',160)
  or v->'scope'->>'scene' is distinct from 'attraction'
  or jsonb_typeof(v->'scope'->'cities') is distinct from 'array' then return false; end if;
 if jsonb_array_length(v->'scope'->'cities')<>1 then return false; end if;
 if a->>'predicate'='located_at' and a->>'objectId'='place_address' then
  if not knowledge_review_private.closed_object(x,case when x ? 'locality' then array['lines','locality','countryCode'] else array['lines','countryCode'] end)
   or x->>'countryCode' is distinct from 'CN' or jsonb_typeof(x->'lines') is distinct from 'array' then return false; end if;
  if jsonb_array_length(x->'lines') not between 1 and 3
   or exists(select 1 from jsonb_array_elements(x->'lines') line where not knowledge_review_private.place_text(line,160))
   or (x ? 'locality' and not knowledge_review_private.place_text(x->'locality',120)) then return false; end if;
 elsif a->>'predicate'='opens_during' and a->>'objectId'='opening_hours' then
  if not knowledge_review_private.closed_object(x,array['startsAt','endsAt','timeZone'])
   or x->>'timeZone' is distinct from 'Asia/Shanghai'
   or coalesce(x->>'startsAt','')!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$'
   or coalesce(x->>'endsAt','')!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$' then return false; end if;
  begin
   start_time:=(x->>'startsAt')::timestamptz; end_time:=(x->>'endsAt')::timestamptz;
  exception when datetime_field_overflow or invalid_datetime_format then return false; end;
  if to_char(start_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')<>x->>'startsAt'
   or to_char(end_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')<>x->>'endsAt'
   or end_time<=start_time or end_time-start_time>interval '24 hours' then return false; end if;
 else return false;
 end if;
 -- Reuse the exact legacy structural/source/qualifier validator after checking
 -- the new relation. This normalization is only validation; storage keeps v2.
 normalized:=jsonb_set(jsonb_set(v-'place'-'value','{schemaVersion}','"knowledge-statement/1"'),'{assertion,predicate}','"offers_procedure"');
 return knowledge_review_private.statement_valid_v1(normalized);
end $$;

create function knowledge_review_private.place_name(v text)
returns text language sql immutable set search_path='' as $$
 select translate(regexp_replace(btrim(v),' +',' ','g'),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')
$$;

-- A name is a lookup request, never a grant or model-selected fact identifier.
-- Completion must hold its worker lease, and revalidate publication eligibility
-- again before saving. This private helper cannot be called by ordinary roles.
create function knowledge_review_private.place_subject(p_name text,p_city text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ids text[];
begin
 if p_name is null or length(p_name) not between 1 and 160 or p_name~'[[:cntrl:]]'
  or p_city is null or p_city not in ('shanghai','beijing','guangzhou','chongqing') then raise exception 'INVALID_INPUT'; end if;
 if not exists(select 1 from knowledge_review_private.publication_settings where enabled) then raise exception 'KNOWLEDGE_DISABLED'; end if;
 select array_agg(distinct s.payload->'assertion'->>'subjectId') into ids
 from knowledge_review_private.statements s
 join knowledge_review_private.publications p on p.candidate_id=s.candidate_id
 join knowledge_review_private.candidates c on c.id=s.candidate_id
 where s.payload->>'schemaVersion'='knowledge-statement/2' and s.payload->'scope'->'cities' ? p_city
  and s.payload->'scope'->>'scene'='attraction' and c.status='reviewed' and p.state='published' and p.expires_at>clock_timestamp()
  and knowledge_review_private.place_name(p_name) in (knowledge_review_private.place_name(s.payload->'place'->'names'->>'en'),knowledge_review_private.place_name(s.payload->'place'->'names'->>'zh'));
 return case when cardinality(ids)=1 then jsonb_build_object('kind','matched','subjectId',ids[1])
  when cardinality(ids)>1 then jsonb_build_object('kind','ambiguous') else jsonb_build_object('kind','unavailable') end;
end $$;

revoke all on function knowledge_review_private.place_text(jsonb,integer),knowledge_review_private.statement_valid(jsonb),
 knowledge_review_private.place_name(text),knowledge_review_private.place_subject(text,text) from public,anon,authenticated,service_role;
notify pgrst, 'reload schema';
