import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { subscriptionDevelopmentCatalog as catalog, validateSubscriptionDevelopmentCatalog as validate, subscriptionDevelopmentPresentation as presentation, subscriptionDevelopmentStoreKitConfiguration as storekit } from "../../../lib/server/entitlements/subscription-development/index.ts";
import { subscriptionDevelopmentOutputs } from "../../../lib/server/entitlements/subscription-development/generate.mjs";
import { journeyPassCatalog as legacy } from "../../../lib/server/entitlements/journey-pass-catalog.ts";

const clone = () => structuredClone(catalog);

test("closed snapshot accepts reordered JSON but rejects every unknown/missing key and wrong type/value", () => {
  validate(clone());
  validate(JSON.parse(JSON.stringify(catalog)));
  const reordered = Object.fromEntries(Object.entries(clone()).reverse());
  validate(reordered);
  for (const bad of [null, [], {}, "subscription-development/1", 3]) assert.throws(() => validate(bad));
  function visit(value, path = []) {
    if (value === null || typeof value !== "object") return;
    const extra = clone();
    let at = extra;
    for (const key of path) at = at[key];
    at.unrecognized = true;
    assert.throws(() => validate(extra), path.join("."));
    for (const key of Object.keys(value)) {
      const missing = clone();
      let target = missing;
      for (const part of path) target = target[part];
      delete target[key];
      assert.throws(() => validate(missing), [...path, key].join("."));
      if (value[key] !== null && typeof value[key] === "object") visit(value[key], [...path, key]);
      else {
        for (const replacement of [null, true, "unknown", 999, {}]) {
          if (replacement === value[key]) continue;
          const altered = clone();
          let cursor = altered;
          for (const part of path) cursor = cursor[part];
          cursor[key] = replacement;
          assert.throws(() => validate(altered), [...path, key].join("."));
        }
      }
    }
  }
  visit(catalog);
});

test("closed input rejects hidden/symbol keys, accessors and non-plain objects without invoking getters", () => {
  let getterCalls = 0;
  const cases = [
    (input) => Object.defineProperty(input, "hidden", { value: true }),
    (input) => Object.defineProperty(input.products.subscription, "hidden", { value: true }),
    (input) => { input[Symbol("extra")] = true; },
    (input) => { input.researchOnly[Symbol("extra")] = true; },
    (input) => Object.defineProperty(input, "schemaVersion", { get() { getterCalls++; return catalog.schemaVersion; }, enumerable: true }),
    (input) => Object.defineProperty(input.products, "subscription", { get() { getterCalls++; return catalog.products.subscription; }, enumerable: true }),
    (input) => Object.defineProperty(input.researchOnly, "0", { get() { getterCalls++; return catalog.researchOnly[0]; }, enumerable: true }),
    (input) => Object.defineProperty(input, "schemaVersion", { value: catalog.schemaVersion, enumerable: false }),
    (input) => Object.defineProperty(input.researchOnly, "0", { value: catalog.researchOnly[0], enumerable: false }),
    (input) => Object.setPrototypeOf(input, { inherited: true }),
    (input) => Object.setPrototypeOf(input.products.subscription, Date.prototype),
    (input) => Object.setPrototypeOf(input.researchOnly, class CustomArray extends Array {}.prototype),
    (input) => { input.products.subscription.period = new Map(Object.entries(input.products.subscription.period)); },
    (input) => { input.researchOnly.length++; },
    (input) => { delete input.researchOnly[0]; },
  ];
  for (const change of cases) {
    const input = clone();
    change(input);
    assert.throws(() => validate(input));
    assert.throws(() => presentation("en", input));
    assert.throws(() => storekit(input));
  }
  assert.equal(getterCalls, 0);
});

test("closed input accepts plain/null-prototype JSON data and normal array length descriptors", () => {
  function nullPrototypes(value) {
    if (value === null || typeof value !== "object") return value;
    const output = Array.isArray(value) ? [] : Object.create(null);
    for (const [key, child] of Object.entries(value)) output[key] = nullPrototypes(child);
    return output;
  }
  validate(nullPrototypes(clone()));
  const nullArray = clone();
  Object.setPrototypeOf(nullArray.researchOnly, null);
  validate(nullArray);
  validate(Object.freeze(clone()));
  const input = clone();
  assert.deepEqual(Object.getOwnPropertyDescriptor(input.researchOnly, "length"), {
    value: catalog.researchOnly.length, writable: true, enumerable: false, configurable: false,
  });
  validate(input);
});

test("canonical graph is deeply immutable including all display projections", () => {
  function frozen(value) {
    if (value === null || typeof value !== "object") return;
    assert.ok(Object.isFrozen(value));
    for (const child of Object.values(value)) frozen(child);
  }
  frozen(catalog);
  frozen(presentation("zh"));
  frozen(presentation("en"));
  assert.throws(() => { catalog.products.subscription.purchasable = true; }, TypeError);
  assert.throws(() => { catalog.serviceTaskCapacity.subscription.period.quantity = 300; }, TypeError);
  assert.throws(() => { presentation("en").subscription.sharedBenefits.push("unlimited"); }, TypeError);
});

test("monthly policy preserves Free source and complete-task semantics without inheriting legacy 720h", () => {
  assert.equal(catalog.schemaVersion, "subscription-development/1");
  assert.equal(catalog.catalogVersion, 3);
  assert.equal(catalog.policyVersion, "subscription-development-policy/1");
  assert.equal(catalog.saleState, "development_only");
  const product = catalog.products.subscription;
  assert.equal(product.kind, "auto_renewing");
  assert.deepEqual(product.period, { unit: "month", value: 1 });
  assert.equal(product.durationAuthority, "apple_verified_period");
  assert.equal(product.price, null);
  assert.equal(product.storeKitProductId, null);
  assert.equal(product.purchasable, false);
  assert.equal(catalog.products.free, legacy.products.free);
  assert.equal(catalog.serviceTaskCapacity.free, legacy.serviceTaskCapacity.free);
  assert.equal(product.sharedBenefits, legacy.products.free.sharedBenefits);
  assert.deepEqual(catalog.serviceTaskCapacity.subscription, {
    period: { kind: "per_verified_period", quantity: 80 },
    burst: { kind: "account_rolling", hours: 24, quantity: 12 },
  });
  assert.equal(catalog.serviceTaskCapacity.unit, "complete_service_task");
  assert.ok(!JSON.stringify(catalog).includes("720"));
  assert.deepEqual(catalog.promises, { unlimited: false, humanServiceIncluded: false });
  assert.match(catalog.periodRules.restoration, /no_new_capacity/);
  assert.match(catalog.periodRules.repeatedPeriod, /no_refill/);
  assert.match(catalog.periodRules.snapshot, /immutable/);
  assert.equal(legacy.products.journeyPass.kind, "non_renewing");
  assert.equal(legacy.products.journeyPass.durationHours, 720);
});

test("all consumers fail closed for unknown catalog versions or sales enabling input", () => {
  for (const key of ["schemaVersion", "catalogVersion", "policyVersion", "saleState"]) {
    const input = clone();
    input[key] = "future";
    assert.throws(() => presentation("en", input));
    assert.throws(() => storekit(input));
  }
  const input = clone();
  input.products.subscription.purchasable = true;
  assert.throws(() => storekit(input));
  assert.throws(() => presentation("zh", input));
  for (const locale of ["es", "toString", null, undefined]) assert.throws(() => presentation(locale));
});

test("zh/en display contains no policy numbers, balances, real SKU or sales price", () => {
  for (const locale of ["zh", "en"]) {
    const view = presentation(locale);
    assert.equal(view.saleState, "development_only");
    assert.equal(view.purchaseEnabled, false);
    assert.equal(view.price, null);
    assert.equal(view.storeKitProductId, null);
    assert.equal(view.subscription.durationAuthority, "apple_verified_period");
    assert.doesNotMatch(JSON.stringify(view), /"(?:quantity|remaining|balance|developmentCapacity|subscribed|hours)"|\b80\b|\b12\b/);
  }
});

test("StoreKit local monthly auto-renewable configuration is isolated and generated reproducibly", () => {
  const config = storekit();
  assert.deepEqual(config.nonRenewingSubscriptions, []);
  assert.deepEqual(config.products, []);
  assert.equal(config.subscriptionGroups.length, 1);
  const group = config.subscriptionGroups[0];
  assert.equal(group.id, catalog.products.subscription.localSubscriptionGroupId);
  assert.equal(group.subscriptions.length, 1);
  const product = group.subscriptions[0];
  assert.equal(product.type, "RecurringSubscription");
  assert.equal(product.recurringSubscriptionPeriod, "P1M");
  assert.equal(product.productID, "dev.visepanda.subscription.monthly");
  assert.equal(product.subscriptionGroupID, group.id);
  product.displayPrice = "999";
  assert.equal(storekit().subscriptionGroups[0].subscriptions[0].displayPrice, "0.99");
  for (const [name, value] of Object.entries(subscriptionDevelopmentOutputs())) {
    const path = new URL(`../../../docs/commercial/subscription-development/${name}`, import.meta.url);
    assert.equal(readFileSync(path, "utf8"), `${JSON.stringify(value, null, 2)}\n`, name);
  }
});

test("legacy catalog/generator/outputs retain pinned base bytes", () => {
  const pins = JSON.parse(readFileSync(new URL("../../../artifacts/AGENT-018/subscription-development-20261016/legacy-sha256.json", import.meta.url), "utf8"));
  for (const [path, digest] of Object.entries(pins.files)) {
    const bytes = readFileSync(new URL(`../../../${path}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), digest, path);
  }
});
