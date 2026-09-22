import { journeyPassCatalog as catalog } from "./journey-pass-catalog.ts";

export type PriceExperimentArm = "reference" | "alternative";
export type CatalogLocale = "en" | "zh";

/** Display input, not a balance, eligibility decision, or purchase authorization. */
export function journeyPassDevelopmentPresentation(locale: CatalogLocale) {
  if (locale !== "en" && locale !== "zh") throw new Error("Unsupported catalog locale");
  const zh = locale === "zh";
  return {
    schemaVersion: catalog.schemaVersion,
    catalogVersion: catalog.catalogVersion,
    policyVersion: catalog.policyVersion,
    locale,
    status: zh ? "开发中，尚不可购买" : "In development. Not available to purchase.",
    purchaseEnabled: false,
    price: null,
    priceSource: catalog.products.journeyPass.priceExperiment.storefrontPriceSource,
    free: {
      name: "Free",
      sharedBenefits: catalog.products.free.sharedBenefits,
      developmentCapacity: catalog.serviceTaskCapacity.free,
    },
    journeyPass: {
      name: "Journey Pass",
      durationHours: catalog.products.journeyPass.durationHours,
      sharedBenefits: catalog.products.journeyPass.sharedBenefits,
      developmentCapacity: catalog.serviceTaskCapacity.journeyPass,
      description: zh ? "30 天非自动续费；容量仅为开发试验值。" : "30 days, non-renewing. Capacity is for development testing only.",
    },
    mediaTrialLimits: catalog.mediaTrialLimits,
    promises: catalog.promises,
  } as const;
}

/** Local Xcode test data only; never use this ID to configure a real storefront. */
export function journeyPassStoreKitConfiguration(arm: PriceExperimentArm = "reference") {
  if (arm !== "reference" && arm !== "alternative") throw new Error("Unsupported price experiment arm");
  const pass = catalog.products.journeyPass;
  const price = arm === "reference" ? pass.priceExperiment.referenceMinor : pass.priceExperiment.alternativeMinor;
  return {
    identifier: "F0CCFEF5-9870-4F6C-AD14-90C49134C225",
    nonRenewingSubscriptions: [{
      displayPrice: (price / 100).toFixed(2),
      familyShareable: false,
      internalID: "22500001",
      localizations: [
        { description: "30-day non-renewing Journey Pass. Local development test only.", displayName: "Journey Pass (Development)", locale: "en_US" },
        { description: "30 天非自动续费 Journey Pass，仅限本地开发测试。", displayName: "Journey Pass（开发测试）", locale: "zh_CN" },
      ],
      productID: pass.localTestProductId,
      referenceName: "Journey Pass - Local Development",
      type: "NonRenewingSubscription",
    }],
    products: [],
    settings: { _failTransactionsEnabled: false, _locale: "en_US", _storefront: "USA" },
    subscriptionGroups: [],
    version: { major: 3, minor: 0 },
  };
}
