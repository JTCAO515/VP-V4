import test from "node:test";
import assert from "node:assert/strict";
import { safeReturnTo, signInHref } from "../../../lib/navigation/safe-return-to.ts";

const session = "11111111-1111-4111-8111-111111111111";

test("QA sign-in returns to the same bounded session and selected locale", () => {
  for (const target of ["/qa", "/qa?locale=zh", "/qa?locale=en", `/qa?session=${session}`, `/qa?session=${session}&locale=en`]) {
    assert.equal(safeReturnTo(target), target);
    const login = new URL(signInHref(target), "https://visepanda.invalid");
    assert.equal(login.pathname, "/auth/sign-in");
    assert.equal(safeReturnTo(login.searchParams.get("returnTo")!), target);
  }
  assert.equal(safeReturnTo(`/qa?locale=zh&session=${session}`), `/qa?session=${session}&locale=zh`);
});

test("QA return queries cannot introduce alternate destinations or unbounded identities", () => {
  const rejected = [
    "https://other.invalid/qa", "//other.invalid/qa", "/qa#session", "/qa\\other",
    "/qa?locale=es", "/qa?locale=", "/qa?session=", "/qa?session=other-owner",
    "/qa?session=https%3A%2F%2Fother.invalid", "/qa?returnTo=%2Fops%2Freview",
    "/qa?next=https%3A%2F%2Fother.invalid", "/qa?locale=en&locale=zh",
    `/qa?session=${session}&session=${session}`, `/qa?session=${session}&%73ession=${session}`,
    `/qa?session=${session}&locale=en&extra=1`, "/qa?locale=en&public=1",
    "/qa?locale=en&locale=en", "/qa?locale[]=en", "/qa?locale=en%0A", "/qa?session=%2F%2Fother.invalid",
  ];
  for (const target of rejected) assert.equal(safeReturnTo(target), "/visepanda", target);
});
