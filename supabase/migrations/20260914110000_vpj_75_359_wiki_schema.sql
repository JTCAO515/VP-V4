-- VPJ-75 slice 1 (#359): wiki page/revision/job data model only. No RPC, no
-- worker, no LLM call yet -- this slice is schema/idempotency plumbing so a
-- later slice can wire the actual generation dispatcher on top of it.
-- Private ops-only schema, same as knowledge_review_private's existing
-- tables; reuses the schema's existing `receipts` table for RPC-level
-- idempotency once a dispatcher RPC is added -- these tables carry job-
-- level state, not request-level idempotency.

create table knowledge_review_private.wiki_pages (
  id uuid primary key default gen_random_uuid(),
  page_type text not null check (page_type in ('source_summary', 'entity_procedure', 'topic', 'comparison_gap')),
  page_key text not null check (char_length(btrim(page_key)) between 1 and 200),
  version integer not null default 0 check (version >= 0),
  created_at timestamptz not null default clock_timestamp(),
  unique (page_key)
);

-- One row per (page_key, input_digest): a retried or resumed job for the
-- identical input always updates this same row instead of inserting a new
-- one, which is what makes "same input never rebuilds a page" true by
-- construction rather than by an application-level check.
create table knowledge_review_private.wiki_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  page_key text not null check (char_length(btrim(page_key)) between 1 and 200),
  input_digest text not null check (input_digest ~ '^[0-9a-f]{64}$'),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  started_at timestamptz,
  finished_at timestamptz,
  cost_tokens integer check (cost_tokens is null or cost_tokens >= 0),
  cost_unknown boolean not null default true,
  error_code text check (error_code is null or char_length(error_code) between 1 and 60),
  created_at timestamptz not null default clock_timestamp(),
  unique (page_key, input_digest),
  check ((status = 'queued') = (started_at is null)),
  check ((status in ('succeeded', 'failed', 'cancelled')) = (finished_at is not null)),
  check (status <> 'failed' or error_code is not null),
  check (status = 'failed' or error_code is null),
  -- A settled cost (cost_unknown = false) always carries a token count;
  -- an unsettled/crashed job may finish without ever learning its cost.
  check (cost_unknown or cost_tokens is not null)
);

create table knowledge_review_private.wiki_page_revisions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references knowledge_review_private.wiki_pages(id) on delete cascade,
  version integer not null check (version >= 1),
  -- array_length() returns NULL (not 0) for an empty array, which a CHECK
  -- constraint treats as passing -- verified this actually admits an empty
  -- array against a real local Postgres before switching to cardinality().
  source_revision_ids uuid[] not null check (cardinality(source_revision_ids) >= 1),
  statement_refs uuid[] not null default '{}',
  job_id uuid not null references knowledge_review_private.wiki_generation_jobs(id) on delete restrict,
  prompt_version text not null check (char_length(btrim(prompt_version)) between 1 and 60),
  config_digest text not null check (config_digest ~ '^[0-9a-f]{64}$'),
  input_digest text not null check (input_digest ~ '^[0-9a-f]{64}$'),
  generated_at timestamptz not null,
  validation_status text not null default 'draft' check (validation_status in ('draft', 'validated', 'rejected')),
  change_note text not null check (char_length(btrim(change_note)) between 1 and 400),
  created_at timestamptz not null default clock_timestamp(),
  unique (page_id, version)
);

create index wiki_page_revisions_page_idx on knowledge_review_private.wiki_page_revisions(page_id, version);
create index wiki_generation_jobs_status_idx on knowledge_review_private.wiki_generation_jobs(status) where status in ('queued', 'running');

alter table knowledge_review_private.wiki_pages enable row level security;
alter table knowledge_review_private.wiki_generation_jobs enable row level security;
alter table knowledge_review_private.wiki_page_revisions enable row level security;
-- Same defense-in-depth stance as the rest of this schema: no direct grants
-- to anon/authenticated/service_role. A future dispatcher RPC (security
-- definer, like ops_review_workspace) is the only intended access path.
revoke all on knowledge_review_private.wiki_pages from anon, authenticated, service_role;
revoke all on knowledge_review_private.wiki_generation_jobs from anon, authenticated, service_role;
revoke all on knowledge_review_private.wiki_page_revisions from anon, authenticated, service_role;
