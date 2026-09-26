import test from "node:test";
import assert from "node:assert/strict";
import { validatedSandboxPurchase } from "../../../lib/server/entitlements/storekit-sandbox.ts";
import { presentGrant } from "../../../lib/server/entitlements/grant-read.ts";

const owner = "443b36bd-7c43-4be4-9d4a-e58964549055";
const product = "space.go2china.VisePanda.journey-pass";
const now = Date.parse("2026-09-26T12:00:00Z");
const transaction = Object.freeze({
  environment: "Sandbox", bundleId: "space.go2china.VisePanda", transactionId: "2000000001",
  originalTransactionId: "2000000001", productId: product, type: "Non-Renewing Subscription",
  quantity: 1, appAccountToken: owner, inAppOwnershipType: "PURCHASED",
  purchaseDate: now - 60000,
});

test("same verified Sandbox transaction yields one catalog capacity snapshot", () => {
  const result = validatedSandboxPurchase(transaction, transaction, owner, product, now);
  assert.equal(result.transactionId, transaction.transactionId);
  assert.equal(result.purchaseAt, new Date(transaction.purchaseDate).toISOString());
  assert.equal(result.capacitySnapshot.period.hours, 720);
  assert.equal(result.capacitySnapshot.period.quantity, 80);
  assert.equal(result.environment, "Sandbox");
});

test("reject cross-account, mismatched receipt, unknown SKU, type, environment and future time", () => {
  const changes = [
    { appAccountToken: "1f83af92-28e3-44f7-a9d9-2b5cd211acb1" },
    { transactionId: "2000000002" }, { productId: "unknown" },
    { type: "Consumable" }, { environment: "Production" },
    { quantity: 2 }, { bundleId: "other.app" },
    { purchaseDate: now + 300001 }, { inAppOwnershipType: "FAMILY_SHARED" },
  ];
  for (const change of changes) {
    assert.throws(() => validatedSandboxPurchase(transaction, { ...transaction, ...change }, owner, product, now), /INVALID_TRANSACTION/);
  }
  assert.throws(() => validatedSandboxPurchase(transaction, transaction, "1f83af92-28e3-44f7-a9d9-2b5cd211acb1", product, now), /INVALID_TRANSACTION/);
});

test("revoked Apple state stays explicit and server clock excludes queued/expired intervals", () => {
  const revoked = validatedSandboxPurchase(transaction, { ...transaction, revocationDate: now }, owner, product, now);
  assert.equal(revoked.revokedAt, new Date(now).toISOString());
  const grant = { state: "active", starts_at: new Date(now).toISOString(), ends_at: new Date(now + 720 * 3600000).toISOString() };
  assert.equal(presentGrant(grant, now - 1).effective_state, "queued");
  assert.equal(presentGrant(grant, now).effective_state, "active");
  assert.equal(presentGrant(grant, now + 720 * 3600000).effective_state, "expired");
  assert.equal(presentGrant({ ...grant, state: "revoked" }, now).effective_state, "revoked");
});
