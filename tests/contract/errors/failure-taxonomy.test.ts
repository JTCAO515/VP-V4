import assert from "node:assert/strict";
import test from "node:test";
import { failureCopy, type Locale } from "../../../lib/i18n.ts";
import { FAILURE_CODES, FAILURE_TAXONOMY, getFailureSpec, isFailureCode } from "../../../lib/server/contracts/errors/index.ts";

test("freezes exactly the 21 registered failure codes with unique metric labels", () => {
  assert.equal(FAILURE_CODES.length, 21);
  assert.equal(Object.keys(FAILURE_TAXONOMY).length, 21);
  assert.equal(new Set(Object.values(FAILURE_TAXONOMY).map((item) => item.metricLabel)).size, 21);
  assert.equal(isFailureCode("PROVIDER_UNAVAILABLE"), true);
  assert.equal(isFailureCode("PROVIDER_ERROR"), false);
});

test("never retries policy or safety blocks through another provider", () => {
  for (const code of ["SAFETY_BLOCKED", "DATA_POLICY_BLOCKED"] as const) {
    const item = getFailureSpec(code);
    assert.equal(item.retryable, false);
    assert.equal(item.providerFallbackAllowed, false);
    assert.equal(item.sseEvent, "unavailable");
  }
});

test("has a non-empty snapshot for every code in all five locales, including RTL Arabic", () => {
  for (const locale of ["zh", "en", "es", "ru", "ar"] as const satisfies readonly Locale[]) {
    for (const code of FAILURE_CODES) {
      assert.ok(failureCopy[locale][code].trim(), `${locale}:${code} must have user copy`);
    }
  }
  assert.match(failureCopy.ar.DATA_POLICY_BLOCKED, /[\u0600-\u06FF]/);
});
