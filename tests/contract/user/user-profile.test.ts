import assert from "node:assert/strict";
import test from "node:test";
import { isUserProfileInput } from "../../../lib/server/identity/request-guards.ts";

const validProfile = {
  displayName: "Ada",
  travelPace: "balanced",
  locale: "zh",
  currency: "CNY",
  distanceUnit: "kilometre",
  temperatureUnit: "celsius",
  defaultDepartureTime: "09:00",
};

test("V4-16 accepts only a complete, bounded explicit Profile preference payload", () => {
  assert.equal(isUserProfileInput(validProfile), true);
  assert.equal(isUserProfileInput({ ...validProfile, displayName: " " }), true);
  assert.equal(isUserProfileInput({ ...validProfile, locale: "fr" }), false);
  assert.equal(isUserProfileInput({ ...validProfile, defaultDepartureTime: "24:00" }), false);
  assert.equal(isUserProfileInput({ ...validProfile, inferredMemory: true }), false);
  assert.equal(isUserProfileInput({ ...validProfile, displayName: "x".repeat(81) }), false);
});
