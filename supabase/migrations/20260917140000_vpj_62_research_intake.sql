-- Public research intake only. No account, Trip, knowledge or marketing-send grant.
create schema research_intake_private;
revoke all on schema research_intake_private from public, anon, authenticated, service_role;
create table research_intake_private.settings (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false,
 window_start timestamptz not null default clock_timestamp(), attempts integer not null default 0 check(attempts>=0),
 exit_window_start timestamptz not null default clock_timestamp(), exit_attempts integer not null default 0 check(exit_attempts>=0)
);
insert into research_intake_private.settings(singleton) values(true);
create table research_intake_private.applications (
 id uuid primary key default gen_random_uuid(),
 token_hash text not null unique,
 email text unique,
 locale text not null check(locale in ('zh','en')),
 policy_version text not null check(policy_version='research-intake/2026-09-17'),
 research_consent boolean not null,
 marketing_consent boolean not null,
 status text not null check(status in ('applied','enrolled','first_value','rejected','withdrawn')),
 created_at timestamptz not null default clock_timestamp(),
 withdrawn_at timestamptz,
 check((status='withdrawn' and email is null and not research_consent and not marketing_consent and withdrawn_at is not null)
    or (status<>'withdrawn' and email is not null and research_consent and withdrawn_at is null))
);
-- Receipt fences serialize withdrawal-before-submit without storing raw capability codes.
-- Duplicate email submissions get a separate receipt with no link to the original applicant.
create table research_intake_private.receipts (
 token_hash text primary key,
 input_hash text,
 withdrawn boolean not null default false,
 created_at timestamptz not null default clock_timestamp()
);
create table research_intake_private.events (
 id bigint generated always as identity primary key,
 application_id uuid not null references research_intake_private.applications(id),
 event text not null check(event in ('application','research_consent','marketing_consent','enrollment','first_value','rejection','withdrawal')),
 policy_version text not null,
 occurred_at timestamptz not null default clock_timestamp(),
 unique(application_id,event)
);
alter table research_intake_private.receipts enable row level security;
alter table research_intake_private.settings enable row level security;
alter table research_intake_private.applications enable row level security;
alter table research_intake_private.events enable row level security;
revoke all on all tables in schema research_intake_private from public, anon, authenticated, service_role;
revoke all on all sequences in schema research_intake_private from public, anon, authenticated, service_role;

-- Anonymous capability RPC: withdrawal requires 256 random bits, stored only as SHA-256.
-- Validation and rate limits live here too, so direct REST calls cannot bypass them.
create function public.research_intake_v1(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a research_intake_private.applications%rowtype; s research_intake_private.settings%rowtype;
 v_token_hash text; v_input_hash text; mail text; marketing boolean; action text; ts timestamptz:=clock_timestamp();
begin
 if p_input is null or jsonb_typeof(p_input)<>'object'
   or jsonb_typeof(p_input->'token') is distinct from 'string'
   or (p_input->>'token') !~ '^[a-f0-9]{64}$' then return '{"kind":"invalid_input"}'; end if;
 action:=p_input->>'action';
 v_token_hash:=encode(sha256(convert_to(p_input->>'token','UTF8')),'hex');
 if action='withdraw' then
   if (select count(*) from jsonb_object_keys(p_input))<>2 then return '{"kind":"invalid_input"}'; end if;
   -- Same lock order for all paths, including withdrawal-before-first-submit.
   select * into s from research_intake_private.settings where singleton for update;
   if not exists(select 1 from research_intake_private.receipts r where r.token_hash=v_token_hash) then
     -- Bound anonymous unknown-token fences separately; known receipts always remain withdrawable.
     if ts>=s.exit_window_start+interval '1 hour' then
       update research_intake_private.settings set exit_window_start=ts,exit_attempts=1 where singleton;
     elsif s.exit_attempts>=100 then return '{"kind":"rate_limited"}';
     else update research_intake_private.settings set exit_attempts=exit_attempts+1 where singleton; end if;
   end if;
   insert into research_intake_private.receipts(token_hash,withdrawn) values(v_token_hash,true)
     on conflict(token_hash) do update set withdrawn=true,input_hash=null;
   select * into a from research_intake_private.applications t where t.token_hash=v_token_hash for update;
   if found and a.status<>'withdrawn' then
     update research_intake_private.applications set email=null,research_consent=false,marketing_consent=false,status='withdrawn',withdrawn_at=ts where id=a.id;
     insert into research_intake_private.events(application_id,event,policy_version) values(a.id,'withdrawal',a.policy_version);
   end if;
   return '{"kind":"withdrawn"}';
 end if;
 if action is distinct from 'apply' or (select count(*) from jsonb_object_keys(p_input))<>8
   or jsonb_typeof(p_input->'email') is distinct from 'string' or length(p_input->>'email')>254
   or btrim(p_input->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
   or (p_input->>'locale') is null or (p_input->>'locale') not in ('zh','en')
   or (p_input->'researchConsent') is distinct from 'true'::jsonb
   or jsonb_typeof(p_input->'marketingConsent') is distinct from 'boolean'
   or (p_input->>'policyVersion') is distinct from 'research-intake/2026-09-17'
   or jsonb_typeof(p_input->'website') is distinct from 'string' or length(p_input->>'website')>200
 then return '{"kind":"invalid_input"}'; end if;
 mail:=lower(btrim(p_input->>'email')); marketing:=(p_input->>'marketingConsent')::boolean;
 -- This locked singleton bounds all callers without trusting forwarded IP headers or retaining IPs.
 select * into s from research_intake_private.settings where singleton for update;
 if not s.enabled then return '{"kind":"unavailable"}'; end if;
 if exists(select 1 from research_intake_private.receipts r where r.token_hash=v_token_hash and r.withdrawn)
   then return '{"kind":"receipt_conflict"}'; end if;
 v_input_hash:=encode(sha256(convert_to((p_input||jsonb_build_object('email',mail))::text,'UTF8')),'hex');
 if exists(select 1 from research_intake_private.receipts r where r.token_hash=v_token_hash) then
   if exists(select 1 from research_intake_private.receipts r where r.token_hash=v_token_hash and r.input_hash=v_input_hash)
     then return '{"kind":"received"}'; end if;
   return '{"kind":"receipt_conflict"}';
 end if;
 if ts>=s.window_start+interval '1 hour' then
   update research_intake_private.settings set window_start=ts,attempts=1 where singleton;
 elsif s.attempts>=100 then return '{"kind":"rate_limited"}';
 else update research_intake_private.settings set attempts=attempts+1 where singleton; end if;
 if p_input->>'website'<>'' then return '{"kind":"request_not_accepted"}'; end if;
 insert into research_intake_private.receipts(token_hash,input_hash) values(v_token_hash,v_input_hash);
 if exists(select 1 from research_intake_private.applications where email=mail)
   then return '{"kind":"received"}'; end if;
 insert into research_intake_private.applications(token_hash,email,locale,policy_version,research_consent,marketing_consent,status)
 values(v_token_hash,mail,p_input->>'locale',p_input->>'policyVersion',true,marketing,'applied') returning * into a;
 insert into research_intake_private.events(application_id,event,policy_version)
 values(a.id,'application',a.policy_version),(a.id,'research_consent',a.policy_version);
 if marketing then insert into research_intake_private.events(application_id,event,policy_version) values(a.id,'marketing_consent',a.policy_version); end if;
 return '{"kind":"received"}';
end $$;
revoke all on function public.research_intake_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.research_intake_v1(jsonb) to anon,authenticated;

-- Explicit service operation only; browser users and ordinary Ops membership gain no access.
-- No automatic enrollment or first-value claim. Caller records an actually observed event.
create function public.research_intake_record_event_v1(p_id uuid,p_event text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a research_intake_private.applications%rowtype; target text;
begin
 target:=case p_event when 'enrollment' then 'enrolled' when 'first_value' then 'first_value' when 'rejection' then 'rejected' else null end;
 if target is null then return '{"kind":"invalid_input"}'; end if;
 select * into a from research_intake_private.applications where id=p_id for update;
 if not found or not a.research_consent then return '{"kind":"not_available"}'; end if;
 if a.status=target then return '{"kind":"recorded"}'; end if;
 if not ((a.status='applied' and target in ('enrolled','rejected')) or (a.status='enrolled' and target in ('first_value','rejected')))
   then return '{"kind":"invalid_transition"}'; end if;
 update research_intake_private.applications set status=target where id=a.id;
 insert into research_intake_private.events(application_id,event,policy_version) values(a.id,p_event,a.policy_version);
 return '{"kind":"recorded"}';
end $$;
revoke all on function public.research_intake_record_event_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.research_intake_record_event_v1(uuid,text) to service_role;
