import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AppStoreServerAPIClient, Environment, SignedDataVerifier, Type, type JWSTransactionDecodedPayload } from "@apple/app-store-server-library";
import { journeyPassCatalog } from "./journey-pass-catalog.ts";

const bundleId = "space.go2china.VisePanda";
const sandbox = Environment.SANDBOX;
const root = readFileSync(join(process.cwd(), "lib/server/entitlements/AppleRootCA-G3.cer"));

export type VerifiedSandboxPurchase = Readonly<{
  environment: "Sandbox";
  transactionId: string;
  ownerId: string;
  appAccountToken: string;
  productId: string;
  purchaseAt: string;
  revokedAt?: string;
  catalogVersion: number;
  policyVersion: string;
  capacitySnapshot: typeof journeyPassCatalog.serviceTaskCapacity.journeyPass;
}>;

export function validatedSandboxPurchase(device: JWSTransactionDecodedPayload, current: JWSTransactionDecodedPayload,
  ownerId: string, productId: string, now = Date.now()): VerifiedSandboxPurchase {
  const transactionId = device.transactionId;
  if (!transactionId || !/^\d{1,32}$/.test(transactionId)
      || device.environment !== sandbox || current.environment !== sandbox
      || device.bundleId !== bundleId || current.bundleId !== bundleId
      || current.transactionId !== transactionId || current.originalTransactionId !== device.originalTransactionId
      || current.productId !== productId || device.productId !== productId
      || current.type !== Type.NON_RENEWING_SUBSCRIPTION || device.type !== Type.NON_RENEWING_SUBSCRIPTION
      || current.quantity !== 1 || device.quantity !== 1
      || current.appAccountToken?.toLowerCase() !== ownerId.toLowerCase()
      || device.appAccountToken?.toLowerCase() !== ownerId.toLowerCase()
      || current.inAppOwnershipType !== "PURCHASED" || current.isUpgraded === true
      || current.purchaseDate !== device.purchaseDate || !current.purchaseDate
      || !Number.isSafeInteger(current.purchaseDate) || current.purchaseDate > now + 300_000) {
    throw new Error("INVALID_TRANSACTION");
  }
  return {
    environment: "Sandbox", transactionId, ownerId, appAccountToken: ownerId, productId,
    purchaseAt: new Date(current.purchaseDate).toISOString(),
    ...(current.revocationDate ? { revokedAt: new Date(current.revocationDate).toISOString() } : {}),
    catalogVersion: journeyPassCatalog.catalogVersion,
    policyVersion: journeyPassCatalog.policyVersion,
    capacitySnapshot: journeyPassCatalog.serviceTaskCapacity.journeyPass,
  };
}

/** Real Sandbox only. Xcode/local JWS and Production never issue a server grant. */
export async function verifySandboxPurchase(signedTransaction: string, ownerId: string): Promise<VerifiedSandboxPurchase> {
  const productId = journeyPassCatalog.products.journeyPass.storeKitProductId;
  const signingKey = process.env.VISEPANDA_STOREKIT_SANDBOX_SIGNING_KEY;
  const keyId = process.env.VISEPANDA_STOREKIT_SANDBOX_KEY_ID;
  const issuerId = process.env.VISEPANDA_STOREKIT_SANDBOX_ISSUER_ID;
  if (process.env.VISEPANDA_STOREKIT_SANDBOX_ENABLED !== "true" || !productId || !signingKey || !keyId || !issuerId) {
    throw new Error("STOREKIT_UNAVAILABLE");
  }
  if (signedTransaction.length < 100 || signedTransaction.length > 20000 || signedTransaction.split(".").length !== 3) {
    throw new Error("INVALID_TRANSACTION");
  }
  const verifier = new SignedDataVerifier([root], true, sandbox, bundleId);
  let device;
  try { device = await verifier.verifyAndDecodeTransaction(signedTransaction); }
  catch { throw new Error("INVALID_TRANSACTION"); }
  const transactionId = device.transactionId;
  if (!transactionId || !/^\d{1,32}$/.test(transactionId)) throw new Error("INVALID_TRANSACTION");

  // A previously signed, refunded JWS can be replayed. Read the current Apple
  // transaction before writing; unknown/revoked status fails closed.
  let current;
  try {
    const api = new AppStoreServerAPIClient(signingKey, keyId, issuerId, bundleId, sandbox);
    const response = await api.getTransactionInfo(transactionId);
    if (!response.signedTransactionInfo) throw new Error("missing Apple transaction");
    current = await verifier.verifyAndDecodeTransaction(response.signedTransactionInfo);
  } catch { throw new Error("STOREKIT_UNAVAILABLE"); }
  return validatedSandboxPurchase(device, current, ownerId, productId);
}
