import { journeyPassCatalog as legacy } from "../journey-pass-catalog.ts";

/** This immutable snapshot is development policy input, never a grant or sales authority. */
export const SUBSCRIPTION_DEVELOPMENT_SCHEMA = "subscription-development/1" as const;

export function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

export const subscriptionDevelopmentCatalog = freezeDeep({
  schemaVersion: SUBSCRIPTION_DEVELOPMENT_SCHEMA,
  catalogVersion: 3,
  policyVersion: "subscription-development-policy/1",
  saleState: "development_only",
  products: {
    free: legacy.products.free,
    subscription: {
      kind: "auto_renewing",
      period: { unit: "month", value: 1 },
      durationAuthority: "apple_verified_period",
      storeKitProductId: null,
      price: null,
      purchasable: false,
      localTestProductId: "dev.visepanda.subscription.monthly",
      localSubscriptionGroupId: "dev.visepanda.subscription",
      sharedBenefits: legacy.products.free.sharedBenefits,
    },
  },
  serviceTaskCapacity: {
    state: "development_baseline_not_balance_or_sales_promise",
    unit: legacy.serviceTaskCapacity.unit,
    free: legacy.serviceTaskCapacity.free,
    subscription: {
      period: { kind: "per_verified_period", quantity: 80 },
      burst: { kind: "account_rolling", hours: 24, quantity: 12 },
    },
    windowPolicy: legacy.serviceTaskCapacity.windowPolicy,
    windowBoundary: legacy.serviceTaskCapacity.windowBoundary,
    tierPolicy: "verified_active_subscription_else_free_no_stacking_or_exhaustion_fallback",
    settlement: legacy.serviceTaskCapacity.settlement,
    clarificationAndRepair: legacy.serviceTaskCapacity.clarificationAndRepair,
    partialPolicy: legacy.serviceTaskCapacity.partialPolicy,
    amendmentPolicy: legacy.serviceTaskCapacity.amendmentPolicy,
    waitingTtlHours: legacy.serviceTaskCapacity.waitingTtlHours,
    waitingTtlPolicy: "from_first_wait_not_extended_by_retries_clamped_to_verified_period_end",
    crossPeriodPolicy: "expire_reservation_revalidate_with_explicit_resume_no_automatic_next_period_debit",
    resumePolicy: legacy.serviceTaskCapacity.resumePolicy,
    cancellationPolicy: legacy.serviceTaskCapacity.cancellationPolicy,
    repairAfterDelivery: legacy.serviceTaskCapacity.repairAfterDelivery,
    unknownCostPolicy: legacy.serviceTaskCapacity.unknownCostPolicy,
  },
  periodRules: {
    authority: "ledger_owner_verified_apple_purchase_and_expires",
    interval: "verified_purchase_inclusive_verified_expires_exclusive",
    clock: "trusted_server_and_verified_apple_never_device_calendar",
    identity: "ledger_owner_environment_account_subscription_and_verified_period",
    snapshot: "immutable_catalog_version_policy_version_and_capacity_per_period",
    renewal: "only_distinct_verified_period_may_allocate_capacity",
    earlyRenewal: "no_capacity_before_verified_period_start_no_legacy_queue_arithmetic",
    restoration: "original_period_and_consumption_no_new_capacity",
    refund: "revoke_matching_period_no_reallocation_or_other_period_mutation",
    expiry: "unused_capacity_does_not_carry",
    repeatedPeriod: "idempotent_no_refill_including_restore_refund_and_renewal_replay",
    legacy: "non_renewing_pass_remains_separate_unchanged",
  },
  commercialPolicy: {
    paidScope: ["pre_trip_research", "constraint_checks", "complex_coordination", "ongoing_tasks"],
    freeScope: ["basic_memory", "correction", "export_and_delete", "usable_first_value"],
    ranking: "same_fit_rules_commission_never_boosts_organic_rank",
    disclosure: "commercial_exits_and_candidate_coverage",
    externalBooking: "independent_assistant_value_preserved",
    release: "verify_real_sku_storefront_price_tax_contract_and_cost_before_sales",
    annualSubscription: "research_requires_repeat_travel_value_cost_and_responsibility_evidence",
  },
  promises: legacy.promises,
  researchOnly: legacy.researchOnly,
} as const);

export type SubscriptionDevelopmentCatalog = typeof subscriptionDevelopmentCatalog;

/** Closed snapshot validator: unknown keys, versions, altered values and types fail closed.
 * Future policy changes require another explicit version; never rewrite a persisted snapshot.
 */
export function validateSubscriptionDevelopmentCatalog(value: unknown): asserts value is SubscriptionDevelopmentCatalog {
  function match(actual: unknown, expected: unknown, path: string): void {
    if (expected === null || typeof expected !== "object") {
      if (actual !== expected) throw new Error(`Invalid subscription development catalog at ${path}`);
      return;
    }
    if (actual === null || typeof actual !== "object" || Array.isArray(actual) !== Array.isArray(expected)) {
      throw new Error(`Invalid subscription development catalog at ${path}`);
    }
    const prototype = Object.getPrototypeOf(actual);
    const allowedPrototype = Array.isArray(expected) ? Array.prototype : Object.prototype;
    if (prototype !== null && prototype !== allowedPrototype) {
      throw new Error(`Invalid subscription development catalog prototype at ${path}`);
    }
    // Include symbols and non-enumerable keys; arrays also have their own length.
    const keys = Reflect.ownKeys(expected);
    const actualKeys = Reflect.ownKeys(actual);
    if (actualKeys.length !== keys.length || actualKeys.some((key) => !keys.includes(key))) {
      throw new Error(`Unexpected subscription development catalog keys at ${path}`);
    }
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(actual, key);
      const expectedDescriptor = Object.getOwnPropertyDescriptor(expected, key)!;
      // Read only data descriptors: never evaluate a supplied accessor. Enumerable
      // JSON fields and the non-enumerable array length retain their JSON shape.
      if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== expectedDescriptor.enumerable) {
        throw new Error(`Invalid subscription development catalog descriptor at ${path}.${String(key)}`);
      }
      match(descriptor.value, expectedDescriptor.value, `${path}.${String(key)}`);
    }
  }
  match(value, subscriptionDevelopmentCatalog, "$catalog");
}
