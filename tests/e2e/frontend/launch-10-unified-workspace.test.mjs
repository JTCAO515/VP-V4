import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("LAUNCH-10 makes /visepanda the canonical thread workspace instead of the preview", () => {
  const page = read("app/visepanda/page.tsx");

  assert.match(page, /ChatThreadWorkspace/);
  assert.doesNotMatch(page, /VisePandaChatWorkspace/);
  assert.equal(existsSync("components/VisePandaChatWorkspace.tsx"), false);
});

test("LAUNCH-10 preserves valid legacy Ask links by redirecting them to the canonical workspace", () => {
  const askPage = read("app/visepanda/ask/[[...thread]]/page.tsx");

  assert.match(askPage, /redirect\(/);
  assert.match(askPage, /\/visepanda\?\$\{query\.toString\(\)\}/);
  assert.match(askPage, /query\.set\("thread"/);
});

test("LAUNCH-10 exposes only a truthful unavailable composer and creates threads with an owner-visible Trip scope", () => {
  const workspace = read("components/chat/ChatThreadWorkspace.tsx");

  assert.match(workspace, /useSearchParams/);
  assert.match(workspace, /useMemo/);
  assert.match(workspace, /const effectivePlaceCandidate = useMemo/);
  assert.match(workspace, /fetch\("\/api\/trips"/);
  assert.match(workspace, /selectedTripId/);
  assert.match(workspace, /JSON\.stringify\(selectedTripId \? \{ tripId: selectedTripId \} : \{\}\)/);
  assert.match(workspace, /<textarea[\s\S]*disabled/);
  assert.match(workspace, /returnTo=\/visepanda/);
  assert.doesNotMatch(workspace, /returnTo=\/visepanda\/ask/);
  assert.doesNotMatch(workspace, /setSubmitted|preview input received/i);
});

test("LAUNCH-10 localizes canonical POI and memory labels, including the Arabic workspace title", () => {
  const workspace = read("components/chat/ChatThreadWorkspace.tsx");
  const copy = read("lib/i18n.ts");

  assert.match(workspace, /document\.title = `\$\{copy\.title\} \| VisePanda`/);
  assert.match(workspace, /copy\.exactPlaceScope\.replace\("\{poiId\}", exactPoiId\)/);
  assert.match(workspace, /<summary>\{copy\.memoryProvenance\}<\/summary>/);
  assert.match(workspace, /copy\.hardConstraint/);
  assert.match(workspace, /copy\.memorySource/);
  assert.match(copy, /chatThreadWorkspaceCopy/);
  assert.match(copy, /تحديد المكان الدقيق/);
  assert.match(copy, /مصدر الذاكرة/);
});
