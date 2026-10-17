import { subscriptionDevelopmentCatalog as catalog, validateSubscriptionDevelopmentCatalog } from "./catalog.ts";

/** Local StoreKitTest data only. 0.99 is a synthetic test price, never a storefront offer. */
export function subscriptionDevelopmentStoreKitConfiguration(input: unknown = catalog) {
  validateSubscriptionDevelopmentCatalog(input);
  const product = input.products.subscription;
  return {
    identifier: "22500003-0000-4000-8000-000000000003",
    nonRenewingSubscriptions: [],
    products: [],
    settings: { _failTransactionsEnabled: false, _locale: "en_US", _storefront: "USA" },
    subscriptionGroups: [{
      id: product.localSubscriptionGroupId,
      localizations: [],
      name: "Monthly subscription - Local Development",
      subscriptions: [{
        adHocOffers: [],
        codeOffers: [],
        displayPrice: "0.99",
        familyShareable: false,
        groupNumber: 1,
        internalID: "22500003",
        introductoryOffer: null,
        localizations: [
          { description: "Monthly auto-renewable subscription. Local development only; no sales offer.", displayName: "Monthly subscription (Development)", locale: "en_US" },
          { description: "月度自动续订，仅限本地开发测试，非销售商品。", displayName: "月订阅（开发测试）", locale: "zh_CN" },
        ],
        productID: product.localTestProductId,
        recurringSubscriptionPeriod: "P1M",
        referenceName: "Monthly subscription - Local Development",
        subscriptionGroupID: product.localSubscriptionGroupId,
        type: "RecurringSubscription",
      }],
    }],
    version: { major: 3, minor: 0 },
  };
}
