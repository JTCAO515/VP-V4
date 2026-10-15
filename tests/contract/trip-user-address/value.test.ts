import assert from "node:assert/strict";
import test from "node:test";
import { classifyChineseAddressLines, isUserAddressText, readUserProvidedAddress, userProvidedAddress } from "../../../lib/trip-user-address.ts";

test("manual value preserves supplied bytes and cannot acquire verified provenance", () => {
  const text = "  上海市示例路 1 号\nA 座  ";
  const value = userProvidedAddress(text);
  assert.equal(value.text, text);
  assert.equal(value.source, "user_provided");
  assert.equal(value.verification, "unverified");
  assert.ok(Object.isFrozen(value));
  assert.deepEqual(readUserProvidedAddress(value), { kind: "provided", address: value });
  for (const forged of [{ ...value, verification: "verified" }, { ...value, source: "grounded" }, { ...value, claim: {} }, { text }]) {
    assert.deepEqual(readUserProvidedAddress(forged), { kind: "unsupported" });
  }
  assert.deepEqual(readUserProvidedAddress(undefined), { kind: "missing" });
  assert.deepEqual(readUserProvidedAddress(null), { kind: "missing" });
  assert.deepEqual(readUserProvidedAddress("上海"), { kind: "unsupported" });
});

test("bounded address input rejects blank, controls, malformed Unicode and overflow without clipping", () => {
  assert.equal(isUserAddressText("中".repeat(500)), true);
  assert.equal(isUserAddressText("中".repeat(501)), false);
  assert.equal(isUserAddressText("😀".repeat(375)), true);
  assert.equal(isUserAddressText("😀".repeat(376)), false);
  for (const bad of ["", " \t\n\r　", "\u00a0\u2001", "中\u0000", "中\u0085", "中\ud800", 1, {}]) assert.equal(isUserAddressText(bad), false);
});

test("Chinese text observation uses only real address content and leaves ambiguous scripts unknown", () => {
  assert.equal(classifyChineseAddressLines(["上海市示例路 1 号", "A 座"]), "contains_chinese_text");
  assert.equal(classifyChineseAddressLines(["1 Example Road, China"]), "not_chinese");
  assert.equal(classifyChineseAddressLines(["上海 テスト"]), "unknown");
  assert.equal(classifyChineseAddressLines(["上海 한글"]), "unknown");
  assert.equal(classifyChineseAddressLines(["上海 Москва"]), "unknown");
  assert.equal(classifyChineseAddressLines(["上海\ud800"]), "unknown");
  assert.equal(classifyChineseAddressLines({ countryCode: "CN", title: "上海", lines: ["1 Example Road"] }), "unknown");
  assert.equal(classifyChineseAddressLines([]), "unknown");
});
