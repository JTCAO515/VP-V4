/**
 * The development-time source of truth for Journey Pass presentation and its
 * future grant semantics.  This is deliberately not a StoreKit adapter and
 * does not admit a purchase, create a grant, or debit task capacity.
 * VPJ-34 owns transaction verification/grants; VPJ-35 owns task consumption.
 */
export const JOURNEY_PASS_CATALOG_SCHEMA = "journey-pass-catalog/1" as const;

export type JourneyPassCatalog = Readonly<{
  schemaVersion: typeof JOURNEY_PASS_CATALOG_SCHEMA;
  catalogVersion: 1;
  saleState: "development_only";
  products: Readonly<{
    free: Readonly<{
      kind: "free";
      purchasable: false;
      sharedBenefits: readonly ["explicit_cross_trip_preferences", "trip_and_data_controls"];
    }>;
    journeyPass: Readonly<{
      kind: "non_renewing";
      purchasable: false;
      storeKitProductId: null;
      durationHours: 720;
      priceExperiment: Readonly<{
        currency: "USD";
        referenceMinor: 1999;
        alternativeMinor: 1499;
        assignment: "single_variable_only";
        storefrontPriceSource: "StoreKit_at_release";
      }>;
    }>;
  }>;
  grantRules: Readonly<{
    startsAt: "trusted_purchase_time";
    earlyPurchase: "queue_after_existing_non_refunded_grants";
    expiry: "unused_capacity_does_not_carry";
    restoration: "restores_original_grant_without_new_capacity";
    refund: "revoke_only_matching_grant";
    reconciliation: "trusted_purchase_time_orders_out_of_order_transactions";
  }>;
  serviceTaskCapacity: Readonly<{
    state: "record_only_pending_decision";
    quantity: null;
    partialPolicy: "undecided";
    amendmentPolicy: "undecided";
    waitingTtlPolicy: "undecided";
    crossPeriodPolicy: "undecided";
  }>;
  mediaTrialLimits: Readonly<{
    voiceInputSeconds: 60;
    defaultGuideSeconds: 120;
    imageBytes: 10_000_000;
    pdfPages: 10;
    pdfBytes: 20_000_000;
  }>;
}>;

export const journeyPassCatalog: JourneyPassCatalog = Object.freeze({
  schemaVersion: JOURNEY_PASS_CATALOG_SCHEMA,
  catalogVersion: 1,
  saleState: "development_only",
  products: Object.freeze({
    free: Object.freeze({
      kind: "free",
      purchasable: false,
      sharedBenefits: Object.freeze(["explicit_cross_trip_preferences", "trip_and_data_controls"] as const),
    }),
    journeyPass: Object.freeze({
      kind: "non_renewing",
      purchasable: false,
      storeKitProductId: null,
      durationHours: 720,
      priceExperiment: Object.freeze({
        currency: "USD",
        referenceMinor: 1999,
        alternativeMinor: 1499,
        assignment: "single_variable_only",
        storefrontPriceSource: "StoreKit_at_release",
      }),
    }),
  }),
  grantRules: Object.freeze({
    startsAt: "trusted_purchase_time",
    earlyPurchase: "queue_after_existing_non_refunded_grants",
    expiry: "unused_capacity_does_not_carry",
    restoration: "restores_original_grant_without_new_capacity",
    refund: "revoke_only_matching_grant",
    reconciliation: "trusted_purchase_time_orders_out_of_order_transactions",
  }),
  serviceTaskCapacity: Object.freeze({
    state: "record_only_pending_decision",
    quantity: null,
    partialPolicy: "undecided",
    amendmentPolicy: "undecided",
    waitingTtlPolicy: "undecided",
    crossPeriodPolicy: "undecided",
  }),
  mediaTrialLimits: Object.freeze({
    voiceInputSeconds: 60,
    defaultGuideSeconds: 120,
    imageBytes: 10_000_000,
    pdfPages: 10,
    pdfBytes: 20_000_000,
  }),
});
