-- CANDIDATE ONLY. Do not apply until current-owner release + precise Main lease.
-- This installs new source guards without replacing original source functions.
do $$declare rel text;begin
 for rel in select relation_name from turn_data_private.sources_v1() loop
  execute format('create trigger turn_data_parent_fence_v1 before insert or update or delete on %s for each row execute function turn_data_private.guard_source_v1()',rel);
 end loop;
 foreach rel in array array[
  'public.trip_proposals','turn_private.assistant_goal_trip_links','turn_private.assistant_goal_trip_receipts',
  'knowledge_review_private.source_impact_sets','knowledge_review_private.source_impact_items','knowledge_review_private.source_impact_pages',
  'knowledge_review_private.source_impact_outbox','knowledge_review_private.source_impact_projections','knowledge_review_private.source_impact_review_requests',
  'readiness_private.scopes_v1','readiness_private.operations_v1','guide_private.bindings_v1',
  'scoped_edit_private.work_v1','scoped_edit_private.requests_v1','scoped_edit_private.contexts_v1','scoped_edit_private.operations_v1',
  'notification_private.reminders','notification_private.watches','notification_private.dismissals',
  'service_brief_private.briefs','service_brief_private.previews','service_brief_private.operations'] loop
  execute format('create trigger turn_data_parent_fence_v1 before insert or update or delete on %s for each row execute function turn_data_private.guard_source_v1()',rel);
 end loop;
end$$;
