import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  isTripCreateInput,
  parseTripListInput,
} from "../../../lib/server/identity/request-guards.ts";

test("LAUNCH-09 closes the Trip-create input boundary", () => {
  const guards = readFileSync("lib/server/identity/request-guards.ts", "utf8");

  assert.match(guards, /export function isTripCreateInput/);
  assert.match(guards, /export function parseTripListInput/);
});

test("LAUNCH-09 rejects malformed creates and unbounded Trip-list ranges", () => {
  const tripId = "d9b2c74d-1e90-4a4f-a30b-0a2d580dc59a";
  assert.equal(isTripCreateInput({ tripId, title: "  Beijing  " }), true);
  assert.equal(isTripCreateInput({ tripId: 1, title: "Beijing" }), false);
  assert.equal(isTripCreateInput({ tripId, title: "" }), false);
  assert.equal(isTripCreateInput({ tripId, title: "Trip", extra: true }), false);
  assert.deepEqual(parseTripListInput(new URLSearchParams()), { limit: 20 });
  assert.deepEqual(parseTripListInput(new URLSearchParams("limit=50")), { limit: 50 });
  assert.equal(parseTripListInput(new URLSearchParams("limit=0")), null);
  assert.equal(parseTripListInput(new URLSearchParams("limit=51")), null);
  assert.equal(parseTripListInput(new URLSearchParams("limit=1&limit=2")), null);
});

test("LAUNCH-09 keeps Trip creation and recency reads inside the owner adapter", () => {
  const adapter = readFileSync("lib/server/identity/user-data-adapter.ts", "utf8");

  assert.match(adapter, /const listTrips = async/);
  assert.match(adapter, /const createTrip = async/);
  assert.match(adapter, /\.order\("updated_at", \{ ascending: false \}\)/);
  assert.match(adapter, /owner_id: actor\.data/);
});

test("LAUNCH-09 exposes a private, same-origin Trip collection route", () => {
  assert.equal(existsSync("app/api/trips/route.ts"), true);
  const route = readFileSync("app/api/trips/route.ts", "utf8");
  assert.match(route, /parseTripListInput/);
  assert.match(route, /isSameOriginMutation\(request\)/);
  assert.match(route, /adapter\.listTrips/);
  assert.match(route, /adapter\.createTrip/);
  assert.match(route, /Cache-Control.*private, no-store/);
});

test("LAUNCH-09 gives signed-in users a Trip entry route without a client table write", () => {
  assert.equal(existsSync("app/visepanda/trips/page.tsx"), true);
  const page = readFileSync("app/visepanda/trips/page.tsx", "utf8");
  const workspace = readFileSync("components/trips/TripListWorkspace.tsx", "utf8");
  assert.match(page, /requireClosedBetaSession\("\/visepanda\/trips"\)/);
  assert.match(workspace, /fetch\("\/api\/trips"/);
  assert.match(workspace, /crypto\.randomUUID\(\)/);
  assert.doesNotMatch(workspace, /supabase|\.from\("trips"/i);
});
