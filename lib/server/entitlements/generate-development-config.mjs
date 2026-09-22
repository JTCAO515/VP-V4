import { readFile, writeFile, mkdir } from "node:fs/promises";
import { journeyPassCatalog } from "./journey-pass-catalog.ts";
import { journeyPassDevelopmentPresentation, journeyPassStoreKitConfiguration } from "./journey-pass-development.ts";

const directory = new URL("../../../docs/commercial/journey-pass-development/", import.meta.url);
const files = new Map([
  ["catalog.json", journeyPassCatalog],
  ["presentation.en.json", journeyPassDevelopmentPresentation("en")],
  ["presentation.zh.json", journeyPassDevelopmentPresentation("zh")],
  ["reference.storekit", journeyPassStoreKitConfiguration("reference")],
  ["alternative.storekit", journeyPassStoreKitConfiguration("alternative")],
]);
if (process.argv.includes("--check")) {
  for (const [name, data] of files) {
    if (await readFile(new URL(name, directory), "utf8") !== `${JSON.stringify(data, null, 2)}\n`) {
      throw new Error(`Stale Journey Pass development projection: ${name}`);
    }
  }
  console.log("Journey Pass development projections are current (5 files)");
} else {
  await mkdir(directory, { recursive: true });
  for (const [name, data] of files) await writeFile(new URL(name, directory), `${JSON.stringify(data, null, 2)}\n`);
}
