import assert from "node:assert/strict";
import test from "node:test";
import { failureCopy, type Locale } from "../../../lib/i18n.ts";
import { FAILURE_CODES, FAILURE_TAXONOMY, getFailureSpec, isFailureCode } from "../../../lib/server/contracts/errors/index.ts";

test("freezes exactly the 26 registered failure codes with unique metric labels", () => {
  assert.equal(FAILURE_CODES.length, 26);
  assert.equal(Object.keys(FAILURE_TAXONOMY).length, 26);
  assert.equal(new Set(Object.values(FAILURE_TAXONOMY).map((item) => item.metricLabel)).size, 26);
  assert.equal(isFailureCode("PROVIDER_UNAVAILABLE"), true);
  assert.equal(isFailureCode("PROVIDER_ERROR"), false);
});

test("never retries policy or safety blocks through another provider", () => {
  for (const code of ["SAFETY_BLOCKED", "DATA_POLICY_BLOCKED", "OPS_CONTROL_DISABLED", "OPS_SCOPE_UNAVAILABLE"] as const) {
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

test("preserves positional legacy copy when registering operational refusals", () => {
  assert.equal(failureCopy.en.INVALID_INPUT, "Check your input and try again.");
  assert.equal(failureCopy.en.INTERNAL_ERROR, "An unexpected error occurred. Please try again.");
  assert.equal(failureCopy.zh.PROVIDER_UNAVAILABLE, "服务暂时不可用，请稍后重试。");
  for (const code of ["OPS_CONTROL_DISABLED", "OPS_SCOPE_UNAVAILABLE"] as const) {
    assert.match(failureCopy.en[code], /read saved content/);
    assert.doesNotMatch(failureCopy.en[code], /retry|try again/i);
    assert.equal(getFailureSpec(code).httpStatus, 503);
  }
});
