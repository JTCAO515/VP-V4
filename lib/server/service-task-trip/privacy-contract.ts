export const TRIP_PRIVATE_SOURCE_KEYS=['tripContexts','tripWork','tripRequests','tripOperations','tripLineage'] as const;
export const TRIP_OBJECTIVE_REDACTION_KEY='tripObjectives' as const;
export const TRIP_PRIVACY_SCHEMAS={turn:'turn-trip-data/1',conversation:'conversation-trip-data/1'} as const;
export const TRIP_BOUNDARY_ADDITIONS={eraseFields:'exclusive_trip_contexts_work_requests_operations_lineage',redactFields:'trip_objective_scope_request_and_producer_references',retained:'inert_trip_goal_and_proposal_fences'} as const;
