import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { subscriptionDevelopmentCatalog, subscriptionDevelopmentPresentation, subscriptionDevelopmentStoreKitConfiguration } from "./index.ts";

export function subscriptionDevelopmentOutputs() {
  return {
    "catalog.json": subscriptionDevelopmentCatalog,
    "presentation.en.json": subscriptionDevelopmentPresentation("en"),
    "presentation.zh.json": subscriptionDevelopmentPresentation("zh"),
    "monthly.storekit": subscriptionDevelopmentStoreKitConfiguration(),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).some((arg) => arg !== "--check")) throw new Error("Only --check is supported");
  const check = process.argv.includes("--check");
  for (const [name, value] of Object.entries(subscriptionDevelopmentOutputs())) {
    const target = new URL(`../../../../docs/commercial/subscription-development/${name}`, import.meta.url);
    const bytes = `${JSON.stringify(value, null, 2)}\n`;
    if (check) {
      if (readFileSync(target, "utf8") !== bytes) throw new Error(`Generated subscription development drift: ${name}`);
    } else writeFileSync(target, bytes);
  }
  console.log(check ? "Subscription development outputs match." : "Generated subscription development outputs.");
}
