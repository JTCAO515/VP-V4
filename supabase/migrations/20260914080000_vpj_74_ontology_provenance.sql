-- VPJ-74 slice 1: Ops-facing ontology relation/type registry and a read-only
-- provenance view for one published statement. Purely additive: no existing
-- column removed or renamed, no write-path function (ops_review_workspace,
-- knowledge_read_v1) changed. All predicates registered here are exactly the
-- closed set statement_valid_v1()/statement_valid() (v2 place statements)
-- already enforce; this migration documents that set formally, it does not
-- expand or relax it.

create table knowledge_review_private.ontology_types (
  type_id text primary key check(type_id ~ '^[a-z][a-z0-9_]{0,63}$'),
  zh_label text not null check(length(btrim(zh_label)) between 1 and 60),
  en_label text not null check(length(btrim(en_label)) between 1 and 60),
  schema_version integer not null default 1,
  registered_at timestamptz not null default clock_timestamp()
);

create table knowledge_review_private.ontology_relations (
  predicate text primary key check(predicate ~ '^[a-z][a-z0-9_]{0,63}$'),
  domain_type text not null references knowledge_review_private.ontology_types(type_id),
  range_type text not null references knowledge_review_private.ontology_types(type_id),
  zh_label text not null check(length(btrim(zh_label)) between 1 and 60),
  en_label text not null check(length(btrim(en_label)) between 1 and 60),
  schema_version integer not null default 1,
  registered_at timestamptz not null default clock_timestamp()
);

alter table knowledge_review_private.ontology_types enable row level security;
alter table knowledge_review_private.ontology_relations enable row level security;
revoke all on knowledge_review_private.ontology_types, knowledge_review_private.ontology_relations
  from public, anon, authenticated, service_role;

insert into knowledge_review_private.ontology_types(type_id, zh_label, en_label) values
  ('service_entity','服务实体','Service entity'),
  ('procedure','办理流程','Procedure'),
  ('payment_method','支付方式','Payment method'),
  ('document','证件','Document'),
  ('action','行动','Action'),
  ('contact_channel','联系方式','Contact channel'),
  ('admission_scope','入场范围','Admission scope'),
  ('postal_address','邮寄地址','Postal address'),
  ('opening_hours_window','开放时段','Opening hours window');

-- The 7 VPJ-15 predicates plus the 2 VPJ-16 place-statement predicates
-- (located_at/opens_during) — every predicate value statement_valid() can
-- currently accept. An unregistered predicate cannot reach this table (the
-- SQL check constraints already reject it before a statement is stored), so
-- ops_knowledge_provenance_read_v1 below naturally returns a null relation
-- for anything outside this set rather than fabricating one.
insert into knowledge_review_private.ontology_relations(predicate, domain_type, range_type, zh_label, en_label) values
  ('offers_procedure','service_entity','procedure','提供办理流程','offers procedure'),
  ('accepts_method','service_entity','payment_method','接受支付方式','accepts payment method'),
  ('requires_document','service_entity','document','需要证件','requires document'),
  ('requires_action','service_entity','action','需要采取行动','requires action'),
  ('connects_to','service_entity','service_entity','连接至','connects to'),
  ('provides_contact','service_entity','contact_channel','提供联系方式','provides contact'),
  ('permits_admission','service_entity','admission_scope','允许入场','permits admission'),
  ('located_at','service_entity','postal_address','位于','located at'),
  ('opens_during','service_entity','opening_hours_window','开放时段','opens during');

-- Additive lineage columns. This slice does not touch the write path
-- (ops_review_workspace's submit_statement branch), so every existing row
-- AND every new row stays 'legacy' with null fetched_at/effective_at until a
-- later slice teaches the write path to stamp real fetch/effective time —
-- honestly unknown is safer than a fabricated timestamp.
alter table knowledge_review_private.source_revisions
  add column fetched_at timestamptz,
  add column effective_at timestamptz,
  add column lineage_status text not null default 'legacy' check(lineage_status in ('legacy','tracked'));

-- Ops-only, read-only. Reuses knowledge_review_private.current_actor(), the
-- existing VPJ-14 gate (live session + active knowledge_review_private.members
-- row); an inactive member or unauthenticated caller never reaches the query.
create function public.ops_knowledge_provenance_read_v1(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; fid uuid; result jsonb;
begin
  u:=knowledge_review_private.current_actor();
  if p_input is null or jsonb_typeof(p_input) is distinct from 'object'
    or not knowledge_review_private.closed_object(p_input,array['factId'])
    or jsonb_typeof(p_input->'factId') is distinct from 'string'
    or (p_input->>'factId')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then raise exception 'INVALID_INPUT'; end if;
  fid:=(p_input->>'factId')::uuid;
  select jsonb_build_object(
    'schemaVersion','knowledge-provenance/1',
    'factId',pub.fact_id,
    'state',pub.state,
    'publicationVersion',pub.version,
    'assertion',s.payload->'assertion',
    'relation',case when r.predicate is null then null else jsonb_build_object(
      'predicate',r.predicate,'domainType',r.domain_type,'rangeType',r.range_type,
      'zhLabel',r.zh_label,'enLabel',r.en_label,'schemaVersion',r.schema_version) end,
    'sources',(select coalesce(jsonb_agg(jsonb_build_object(
        'sourceRevisionId',sr.id,'sourceKey',sr.source_key,'revisionLabel',sr.revision_label,
        'snippetHash',sr.snippet_hash,'publisher',sr.declaration->>'publisher','uri',sr.declaration->>'uri',
        'locator',sr.declaration->>'locator','fetchedAt',sr.fetched_at,'effectiveAt',sr.effective_at,
        'lineageStatus',sr.lineage_status) order by sr.source_key,sr.revision_label),'[]'::jsonb)
      from knowledge_review_private.statement_sources ss join knowledge_review_private.source_revisions sr on sr.id=ss.source_revision_id
      where ss.candidate_id=s.candidate_id),
    -- Every revision ever recorded under the same source_key as one of this
    -- statement's sources, so an ops reviewer can compare old vs new
    -- revisions of the same source side by side (source_revisions rows are
    -- immutable per revision_label; a "new version" is a new revision_label).
    'sourceHistory',(select coalesce(jsonb_agg(jsonb_build_object(
        'sourceRevisionId',h.id,'sourceKey',h.source_key,'revisionLabel',h.revision_label,'createdAt',h.created_at,
        'fetchedAt',h.fetched_at,'effectiveAt',h.effective_at,'lineageStatus',h.lineage_status) order by h.source_key,h.created_at),'[]'::jsonb)
      from knowledge_review_private.source_revisions h
      where h.source_key in (select sr2.source_key from knowledge_review_private.statement_sources ss2
        join knowledge_review_private.source_revisions sr2 on sr2.id=ss2.source_revision_id where ss2.candidate_id=s.candidate_id)),
    'auditTrail',(select coalesce(jsonb_agg(jsonb_build_object(
        'version',pa.version,'action',pa.action,'note',pa.note,'createdAt',pa.created_at) order by pa.version),'[]'::jsonb)
      from knowledge_review_private.publication_audit pa where pa.candidate_id=pub.candidate_id)
  ) into result
  from knowledge_review_private.publications pub
  join knowledge_review_private.statements s on s.candidate_id=pub.candidate_id
  left join knowledge_review_private.ontology_relations r on r.predicate=(s.payload->'assertion'->>'predicate')
  where pub.fact_id=fid;
  if result is null then raise exception 'OPS_NOT_FOUND'; end if;
  return result;
end $$;
revoke all on function public.ops_knowledge_provenance_read_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ops_knowledge_provenance_read_v1(jsonb) to authenticated;
