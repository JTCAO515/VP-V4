import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("LAUNCH-09 exposes a protected Trip list that creates through the private route then opens Canvas", () => {
  const page = readFileSync("app/visepanda/trips/page.tsx", "utf8");
  const workspace = readFileSync("components/trips/TripListWorkspace.tsx", "utf8");
  assert.match(page, /requireClosedBetaSession\("\/visepanda\/trips"\)/);
  assert.match(workspace, /state === "loading"/);
  assert.match(workspace, /state === "unavailable"/);
  assert.match(workspace, /trips\.length === 0/);
  assert.match(workspace, /crypto\.randomUUID\(\)/);
  assert.match(workspace, /router\.push\(`\/visepanda\/trips\/\$\{data\.trip\.id\}`\)/);
  assert.match(workspace, /getLocaleAttributes\(locale\)/);
  assert.doesNotMatch(workspace, /\.from\("trips"|SUPABASE/i);
});
