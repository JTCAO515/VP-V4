import { freezeDeep, subscriptionDevelopmentCatalog as catalog, validateSubscriptionDevelopmentCatalog } from "./catalog.ts";

export type SubscriptionDevelopmentLocale = "en" | "zh";

/** Typed display input intentionally excludes capacity, balances and subscribed status. */
export function subscriptionDevelopmentPresentation(locale: SubscriptionDevelopmentLocale, input: unknown = catalog) {
  validateSubscriptionDevelopmentCatalog(input);
  if (locale !== "en" && locale !== "zh") throw new Error("Unsupported subscription development locale");
  const zh = locale === "zh";
  return freezeDeep({
    schemaVersion: input.schemaVersion,
    catalogVersion: input.catalogVersion,
    policyVersion: input.policyVersion,
    locale,
    saleState: input.saleState,
    purchaseEnabled: false,
    price: null,
    storeKitProductId: null,
    status: zh ? "月订阅开发配置，尚不可购买。" : "Monthly subscription development configuration. Not available to purchase.",
    free: {
      name: "Free",
      sharedBenefits: input.products.free.sharedBenefits,
      description: zh ? "保留基础记忆、纠错、导出删除与可用首值。" : "Basic memory, correction, export, deletion and usable first value remain available.",
    },
    subscription: {
      name: zh ? "月订阅（开发中）" : "Monthly subscription (in development)",
      kind: input.products.subscription.kind,
      period: input.products.subscription.period,
      durationAuthority: input.products.subscription.durationAuthority,
      sharedBenefits: input.products.subscription.sharedBenefits,
      description: zh ? "仅用于验证月度自动续订开发链路；周期以 Apple 可信交易为准，尚未提供销售权益或余额。" : "For development testing of monthly auto-renewal only. Periods require verified Apple transactions; no sales entitlement or balance is offered.",
    },
    promises: input.promises,
  } as const);
}

export type SubscriptionDevelopmentPresentation = ReturnType<typeof subscriptionDevelopmentPresentation>;
