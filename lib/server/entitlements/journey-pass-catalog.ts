/**
 * VPJ-33 policy input only. VPJ-34 owns verified transactions/grants;
 * VPJ-35 owns atomic admission, capacity and settlement. No sales are enabled.
 * A version is immutable: persist its version and capacity on each grant.
 */
export const JOURNEY_PASS_CATALOG_SCHEMA = "journey-pass-catalog/2" as const;

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

const sharedBenefits = ["explicit_cross_trip_preferences", "trip_and_data_controls"] as const;

export const journeyPassCatalog = freezeDeep({
  schemaVersion: JOURNEY_PASS_CATALOG_SCHEMA,
  catalogVersion: 2,
  policyVersion: "service-task-development/1",
  decision: { issue: 225, date: "2026-09-22", authority: "agent_development_values_only" },
  saleState: "development_only",
  products: {
    free: { kind: "free", purchasable: false, sharedBenefits },
    journeyPass: {
      kind: "non_renewing",
      purchasable: false,
      sharedBenefits,
      storeKitProductId: null,
      localTestProductId: "dev.visepanda.journey-pass.30-day",
      durationHours: 720,
      priceExperiment: {
        currency: "USD",
        referenceMinor: 1999,
        alternativeMinor: 1499,
        assignment: "single_variable_only",
        variable: "price_only",
        defaultArm: "reference",
        storefrontPriceSource: "StoreKit.Product.displayPrice",
      },
    },
  },
  grantRules: {
    identity: "environment_and_verified_transaction_id_bound_to_account",
    snapshot: "catalog_version_policy_version_and_capacity",
    startsAt: "max_trusted_purchase_time_and_preceding_grant_end",
    earlyPurchase: "queue_preserving_refunded_grant_intervals",
    duration: "elapsed_hours_not_calendar_days",
    interval: "startsAt_inclusive_endsAt_exclusive",
    capacityAvailableAt: "startsAt",
    expiry: "unused_capacity_does_not_carry",
    restoration: "restores_original_grant_without_new_capacity",
    refund: "revoke_only_matching_grant_preserve_all_other_intervals",
    reconciliation: "trusted_purchase_time_then_transaction_id_before_grant_finalization",
    lateTransaction: "reconcile_unfinalized_queue_without_moving_finalized_intervals_or_double_granting",
    clock: "server_and_verified_store_transaction_never_device",
    rollingWindow: "account_history_survives_purchase_restore_refund_and_tier_change",
  },
  serviceTaskCapacity: {
    state: "development_policy_frozen_runtime_record_only",
    unit: "complete_service_task",
    free: {
      period: { kind: "account_rolling", hours: 168, quantity: 4 },
      burst: { kind: "account_rolling", hours: 24, quantity: 2 },
    },
    journeyPass: {
      period: { kind: "per_grant", hours: 720, quantity: 80 },
      burst: { kind: "account_rolling", hours: 24, quantity: 12 },
    },
    windowPolicy: "count_all_tiers_committed_and_live_reservations_by_original_admission_time",
    windowBoundary: "exclude_at_or_before_now_minus_window",
    tierPolicy: "active_pass_else_free_never_stack_or_fallback_when_exhausted",
    settlement: "one_unit_only_on_validated_durable_agreed_outcome",
    clarificationAndRepair: "same_task_no_extra_unit_preserve_cumulative_internal_budget",
    partialPolicy: "retain_partial_release_reservation_no_unit_until_agreed_outcome_complete",
    amendmentPolicy: "new_scope_requires_explicit_new_goal_and_fresh_admission_not_automatic_charge",
    waitingTtlHours: 24,
    waitingTtlPolicy: "from_first_wait_not_extended_by_retries_clamped_to_grant_end",
    crossPeriodPolicy: "expire_reservation_revalidate_capacity_with_explicit_resume_no_automatic_next_grant_debit",
    resumePolicy: "same_task_scope_and_internal_budget_one_lifetime_settlement",
    cancellationPolicy: "before_delivery_release_after_delivery_no_automatic_refund",
    repairAfterDelivery: "no_new_unit_existing_budget_and_current_authorization_required",
    unknownCostPolicy: "separate_attempt_reconciliation_never_assume_zero_or_charge_extra_unit",
  },
  mediaTrialLimits: {
    voiceInputSeconds: 60,
    defaultGuideSeconds: 120,
    imageBytes: 10_000_000,
    pdfPages: 10,
    pdfBytes: 20_000_000,
  },
  promises: { unlimited: false, humanServiceIncluded: false },
  researchOnly: ["arrival_activation", "post_purchase_activation", "esim", "payment_channels"],
} as const);

export type JourneyPassCatalog = typeof journeyPassCatalog;
