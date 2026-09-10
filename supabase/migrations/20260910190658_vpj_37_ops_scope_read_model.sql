-- VPJ-37: one content-free, read-only snapshot of an explicitly selected scope.
-- No team identity, customer route, exporter or new ledger is activated.
create function public.read_ops_budget_scope_v1(p_scope_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with scope as materialized (
    select id, owner_id, currency, enabled, frozen, expires_at
    from public.model_budget_scopes where id = p_scope_id
  ), attempts as materialized (
    select a.task_id, a.provider, a.status, a.reserved_micros, a.actual_micros
    from public.model_budget_attempts a join scope s on s.id = a.scope_id
  ), provider_totals as (
    select provider, count(*) as total,
      count(*) filter (where status='reserved') as reserved,
      count(*) filter (where status='dispatched') as dispatched,
      count(*) filter (where status='pending') as pending,
      count(*) filter (where status='settled') as settled,
      count(*) filter (where status='released') as released,
      coalesce(sum(actual_micros) filter (where status='settled'),0) as settled_micros,
      coalesce(sum(reserved_micros) filter (where status in ('reserved','dispatched','pending')),0) as hold_micros
    from attempts group by provider
  ), totals as (
    select count(*) as total,
      count(*) filter (where status='reserved') as reserved,
      count(*) filter (where status='dispatched') as dispatched,
      count(*) filter (where status='pending') as pending,
      count(*) filter (where status='settled') as settled,
      count(*) filter (where status='released') as released,
      coalesce(sum(actual_micros) filter (where status='settled'),0) as settled_micros,
      coalesce(sum(reserved_micros) filter (where status in ('reserved','dispatched','pending')),0) as hold_micros
    from attempts
  ), task_ids as (select distinct task_id from attempts), task_rows as materialized (
    select i.task_id,
      case when t.id is null then 'missing' when t.owner_id<>s.owner_id then 'owner_mismatch' else 'linked' end as linkage,
      case when t.owner_id=s.owner_id then t.status end as technical_state,
      case when c.output_kind in ('answered','partial','clarification') and t.status='completed' then c.output_kind
        when c.output_kind='blocked' and t.status='unavailable' then c.output_kind
        when c.output_kind='technical_failure' and t.status='failed' then c.output_kind end as business_outcome,
      c.output_kind as recorded_outcome,
      case when t.owner_id=s.owner_id then (
        select count(*) from public.chat_turn_events e where e.turn_id=t.id and e.event_type='terminal'
      ) else 0 end as terminal_events
    from task_ids i cross join scope s
      left join public.turns t on t.id=i.task_id
      left join turn_private.text_content c on c.turn_id=t.id and c.owner_id=s.owner_id
        and t.owner_id=s.owner_id and c.hidden_at is null
  ), tasks as (
    select count(*) as total,
      count(*) filter (where linkage='linked') as linked,
      count(*) filter (where linkage='missing') as missing,
      count(*) filter (where linkage='owner_mismatch') as owner_mismatch,
      count(*) filter (where technical_state in ('accepted','planning','retrieving','generating','validating')) as active,
      count(*) filter (where technical_state='completed') as completed,
      count(*) filter (where technical_state='proposal_ready') as proposal_ready,
      count(*) filter (where technical_state='unavailable') as unavailable,
      count(*) filter (where technical_state='failed') as failed,
      count(*) filter (where technical_state='cancelled') as cancelled,
      count(*) filter (where technical_state is null or technical_state not in ('accepted','planning','retrieving','generating','validating','completed','proposal_ready','unavailable','failed','cancelled')) as unknown_state,
      count(*) filter (where business_outcome='answered') as answered,
      count(*) filter (where business_outcome='partial') as partial,
      count(*) filter (where business_outcome='clarification') as clarification,
      count(*) filter (where business_outcome='blocked') as blocked,
      count(*) filter (where business_outcome='technical_failure') as technical_failure,
      count(*) filter (where business_outcome is null) as unobserved,
      count(*) filter (where recorded_outcome is not null and business_outcome is null) as inconsistent_outcomes,
      count(*) filter (where terminal_events>1) as duplicate_terminals
    from task_rows
  )
  select coalesce((select jsonb_build_object(
    'kind','snapshot', 'schemaVersion','ops-budget-scope/v1', 'observedAt',statement_timestamp(),
    'scope',jsonb_build_object('currency',s.currency,'enabled',s.enabled,'frozen',s.frozen,'expired',s.expires_at<=statement_timestamp()),
    'attempts',jsonb_build_object('total',a.total,'reserved',a.reserved,'dispatched',a.dispatched,'pending',a.pending,'settled',a.settled,'released',a.released),
    'money',jsonb_build_object('settledMicros',a.settled_micros::text,'holdMicros',a.hold_micros::text,'exposureMicros',(a.settled_micros+a.hold_micros)::text),
    'providers',coalesce((select jsonb_agg(jsonb_build_object(
      'provider',p.provider,
      'attempts',jsonb_build_object('total',p.total,'reserved',p.reserved,'dispatched',p.dispatched,'pending',p.pending,'settled',p.settled,'released',p.released),
      'money',jsonb_build_object('settledMicros',p.settled_micros::text,'holdMicros',p.hold_micros::text,'exposureMicros',(p.settled_micros+p.hold_micros)::text)
    ) order by p.provider) from provider_totals p),'[]'::jsonb),
    'tasks',jsonb_build_object('total',t.total,'linkedTurns',t.linked,'missingTurns',t.missing,'ownerMismatch',t.owner_mismatch,
      'technical',jsonb_build_object('active',t.active,'completed',t.completed,'proposalReady',t.proposal_ready,'unavailable',t.unavailable,'failed',t.failed,'cancelled',t.cancelled,'unknown',t.unknown_state),
      'business',jsonb_build_object('answered',t.answered,'partial',t.partial,'clarification',t.clarification,'blocked',t.blocked,'technicalFailure',t.technical_failure,'unobserved',t.unobserved)),
    'integrity',jsonb_build_object('inconsistentOutcomeTasks',t.inconsistent_outcomes,'duplicateTerminalTasks',t.duplicate_terminals),
    'unobserved',jsonb_build_object('actualBilledMicros',null,'providerLatencyMs',null,'toolAttempts',null,'humanTimeMs',null,'semanticQuality',null,'serviceTaskCount',null)
  ) from scope s cross join totals a cross join tasks t),jsonb_build_object('kind','unavailable'));
$$;

revoke all on function public.read_ops_budget_scope_v1(uuid) from public, anon, authenticated;
grant execute on function public.read_ops_budget_scope_v1(uuid) to service_role;
notify pgrst, 'reload schema';
