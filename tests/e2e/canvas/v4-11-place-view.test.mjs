import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("V4-11 shows only recorded place references and carries a canonical UUID into Ask scope", () => {
  const view = readFileSync("components/canvas/TripPlaceView.tsx", "utf8");
  const copy = readFileSync("lib/i18n.ts", "utf8");
  const askPage = readFileSync("app/visepanda/ask/[[...thread]]/page.tsx", "utf8");
  const workspace = readFileSync("components/chat/ChatThreadWorkspace.tsx", "utf8");
  assert.match(view, /\/api\/trips\/\$\{tripId\}\/places/);
  assert.match(view, /tripId=\$\{tripId\}&poiId=\$\{place\.canonicalPoiId\}/);
  assert.match(view, /tripPlaceCopy\[locale\]/);
  assert.match(view, /useEffect\(\(\) => \{ setPlaces\(null\); let active = true;/);
  assert.match(view, /const recorded = await response\.json\(\) as TripPlaceReference\[\]; if \(active\) setPlaces\(recorded\)/);
  assert.match(copy, /User reference — POI identity not inferred/);
  assert.match(copy, /no map provider or live route data/);
  assert.doesNotMatch(view, /latitude|longitude|coordinates|geocode/i);
  assert.doesNotMatch(view, /method:\s*["'](?:POST|PUT|PATCH|DELETE)/);
  assert.match(askPage, /tripId && poiId && isUuid\(tripId\) && isUuid\(poiId\)/);
  assert.match(workspace, /initialPlaceCandidate/);
  assert.match(workspace, /\/api\/trips\/\$\{initialPlaceCandidate\.tripId\}\/places/);
  assert.match(workspace, /place\.canonicalPoiId === initialPlaceCandidate\.poiId/);
  assert.match(workspace, /setExactPoiId\(null\);/);
  assert.match(workspace, /const places = await response\.json\(\)[\s\S]*?if \(!active\) return;[\s\S]*?places\.some/);
  assert.match(workspace, /does not submit a prompt or infer place facts/);
});
