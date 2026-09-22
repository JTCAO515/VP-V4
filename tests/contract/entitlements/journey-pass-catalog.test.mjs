import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  JOURNEY_PASS_CATALOG_SCHEMA, journeyPassCatalog as catalog,
  journeyPassDevelopmentPresentation, journeyPassStoreKitConfiguration,
} from "../../../lib/server/entitlements/index.ts";

const generated = new URL("../../../docs/commercial/journey-pass-development/", import.meta.url);

test("Free and Pass share consent-scoped benefits without enabling sales or legacy Ask capacity", () => {
  assert.equal(catalog.schemaVersion, JOURNEY_PASS_CATALOG_SCHEMA);
  assert.equal(catalog.saleState, "development_only");
  assert.equal(catalog.products.free.purchasable, false);
  assert.equal(catalog.products.journeyPass.purchasable, false);
  assert.equal(catalog.products.journeyPass.storeKitProductId, null);
  assert.equal(catalog.products.journeyPass.kind, "non_renewing");
  assert.deepEqual(catalog.products.free.sharedBenefits, catalog.products.journeyPass.sharedBenefits);
  assert.ok(catalog.products.free.sharedBenefits.includes("explicit_cross_trip_preferences"));
  assert.equal(catalog.serviceTaskCapacity.unit, "complete_service_task");
  assert.equal(catalog.serviceTaskCapacity.state, "development_policy_frozen_runtime_record_only");
  for (const tier of ["free", "journeyPass"]) {
    const { period, burst } = catalog.serviceTaskCapacity[tier];
    assert.ok(period.quantity > burst.quantity && burst.quantity > 0);
    assert.ok(period.hours > burst.hours && burst.hours > 0);
    for (const quantity of [period.quantity, burst.quantity]) assert.ok(![6, 30, 300, 60].includes(quantity));
  }
  assert.equal(catalog.serviceTaskCapacity.journeyPass.period.hours, catalog.products.journeyPass.durationHours);
  assert.equal(catalog.products.journeyPass.durationHours, 720);
});

test("price experiment changes exactly price, never duration, entitlement or SKU", () => {
  const reference = journeyPassStoreKitConfiguration();
  const alternative = journeyPassStoreKitConfiguration("alternative");
  assert.equal(reference.nonRenewingSubscriptions.length, 1);
  assert.deepEqual(reference.subscriptionGroups, []);
  assert.deepEqual(reference.products, []);
  assert.equal(reference.nonRenewingSubscriptions[0].type, "NonRenewingSubscription");
  assert.equal(reference.nonRenewingSubscriptions[0].displayPrice, "19.99");
  assert.equal(alternative.nonRenewingSubscriptions[0].displayPrice, "14.99");
  alternative.nonRenewingSubscriptions[0].displayPrice = reference.nonRenewingSubscriptions[0].displayPrice;
  assert.deepEqual(alternative, reference);
  assert.throws(() => journeyPassStoreKitConfiguration("production"), /Unsupported/);
  assert.throws(() => journeyPassStoreKitConfiguration("toString"), /Unsupported/);
});

test("localized presentation uses catalog inputs and never fabricates a storefront price or balance", () => {
  for (const locale of ["en", "zh"]) {
    const view = journeyPassDevelopmentPresentation(locale);
    assert.equal(view.price, null);
    assert.equal(view.purchaseEnabled, false);
    assert.equal(view.priceSource, "StoreKit.Product.displayPrice");
    assert.equal(view.policyVersion, catalog.policyVersion);
    assert.equal(view.free.developmentCapacity, catalog.serviceTaskCapacity.free);
    assert.equal(view.journeyPass.developmentCapacity, catalog.serviceTaskCapacity.journeyPass);
    assert.equal(view.mediaTrialLimits, catalog.mediaTrialLimits);
    assert.equal("remaining" in view.journeyPass, false);
    assert.equal("nextAvailableAt" in view.journeyPass, false);
    assert.deepEqual(view.promises, { unlimited: false, humanServiceIncluded: false });
  }
  assert.throws(() => journeyPassDevelopmentPresentation("es"), /Unsupported/);
});

test("generated native/development inputs cannot drift from the versioned authority", () => {
  const outputs = {
    "catalog.json": catalog,
    "presentation.en.json": journeyPassDevelopmentPresentation("en"),
    "presentation.zh.json": journeyPassDevelopmentPresentation("zh"),
    "reference.storekit": journeyPassStoreKitConfiguration("reference"),
    "alternative.storekit": journeyPassStoreKitConfiguration("alternative"),
  };
  for (const [file, value] of Object.entries(outputs)) {
    assert.deepEqual(JSON.parse(readFileSync(new URL(file, generated), "utf8")), value, file);
  }
});

test("policy snapshots cannot be mutated through nested configuration or display projections", () => {
  assert.throws(() => { catalog.serviceTaskCapacity.journeyPass.period.quantity = 300; }, TypeError);
  assert.throws(() => { catalog.products.journeyPass.sharedBenefits.push("unlimited"); }, TypeError);
  assert.throws(() => { journeyPassDevelopmentPresentation("en").mediaTrialLimits.pdfPages = 100; }, TypeError);
  // A caller may edit its local StoreKit document without changing the authority or next call.
  const config = journeyPassStoreKitConfiguration();
  config.nonRenewingSubscriptions[0].displayPrice = "0";
  assert.equal(journeyPassStoreKitConfiguration().nonRenewingSubscriptions[0].displayPrice, "19.99");
  assert.deepEqual(catalog.mediaTrialLimits, { voiceInputSeconds: 60, defaultGuideSeconds: 120, imageBytes: 10_000_000, pdfPages: 10, pdfBytes: 20_000_000 });
});
