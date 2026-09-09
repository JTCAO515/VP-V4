import assert from "node:assert/strict";
import test from "node:test";
import { getLocaleAttributes, getLocaleSelectionOptions, localeOptions } from "../../../lib/i18n.ts";
import { createWorkspaceEntryContext, parseLocale } from "../../../lib/navigation/workspace-entry.ts";

test("release discovery retains only the currently selected legacy locale without changing payload metadata", () => {
  for (const option of localeOptions) {
    const selection = getLocaleSelectionOptions(option.value);
    assert.deepEqual(selection.map(({ value }) => value), option.value === "zh" || option.value === "en" ? ["zh", "en"] : ["zh", "en", option.value]);
    assert.strictEqual(selection.find(({ value }) => value === option.value), option);
    assert.equal(parseLocale(option.value), option.value);
    assert.equal(createWorkspaceEntryContext({ locale: option.value }).locale, option.value);
    assert.ok(option.currencySymbol);
  }
  assert.equal(parseLocale("unsupported"), "zh");
  assert.deepEqual(getLocaleAttributes("ar"), { lang: "ar", dir: "rtl" });
});
