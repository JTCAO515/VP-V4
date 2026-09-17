import assert from "node:assert/strict";
import test from "node:test";
import { JOURNEY_PASS_CATALOG_SCHEMA, journeyPassCatalog } from "../../../lib/server/entitlements/index.ts";

test("VPJ-33 has one development-only catalog for Free and the 30-day non-renewing Pass", () => {
  assert.equal(journeyPassCatalog.schemaVersion, JOURNEY_PASS_CATALOG_SCHEMA);
  assert.equal(journeyPassCatalog.saleState, "development_only");
  assert.equal(journeyPassCatalog.products.free.purchasable, false);
  assert.deepEqual(journeyPassCatalog.products.free.sharedBenefits, ["explicit_cross_trip_preferences", "trip_and_data_controls"]);
  assert.deepEqual(journeyPassCatalog.products.journeyPass, {
    kind: "non_renewing", purchasable: false, storeKitProductId: null, durationHours: 720,
    priceExperiment: { currency: "USD", referenceMinor: 1999, alternativeMinor: 1499, assignment: "single_variable_only", storefrontPriceSource: "StoreKit_at_release" },
  });
});

test("VPJ-33 leaves ServiceTask capacity disabled until its policy is decided", () => {
  const capacity = journeyPassCatalog.serviceTaskCapacity;
  assert.equal(capacity.state, "record_only_pending_decision");
  assert.equal(capacity.quantity, null);
  for (const policy of [capacity.partialPolicy, capacity.amendmentPolicy, capacity.waitingTtlPolicy, capacity.crossPeriodPolicy]) assert.equal(policy, "undecided");
});

test("VPJ-33 preserves grant sequencing and bounded media trial inputs", () => {
  assert.deepEqual(journeyPassCatalog.grantRules, {
    startsAt: "trusted_purchase_time", earlyPurchase: "queue_after_existing_non_refunded_grants", expiry: "unused_capacity_does_not_carry",
    restoration: "restores_original_grant_without_new_capacity", refund: "revoke_only_matching_grant", reconciliation: "trusted_purchase_time_orders_out_of_order_transactions",
  });
  assert.deepEqual(journeyPassCatalog.mediaTrialLimits, { voiceInputSeconds: 60, defaultGuideSeconds: 120, imageBytes: 10_000_000, pdfPages: 10, pdfBytes: 20_000_000 });
  assert.throws(() => { journeyPassCatalog.saleState = "live"; }, TypeError);
});
