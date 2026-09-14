import { writeFileSync } from "node:fs";
import { PLACES } from "./full-matrix-places.mjs";

// #362 full acceptance: "each city 10 places x zh/en/pinyin = 120 search
// queries" and "each city 10 routes = 40 routes". Deterministic generator
// so the fixture files are reviewable as data, not hand-typed 160 times.

const searchFixtures = [];
const routeFixtures = [];

for (const [city, places] of Object.entries(PLACES)) {
  if (places.length !== 10) throw new Error(`${city} must have exactly 10 places, has ${places.length}`);
  for (const place of places) {
    for (const [variant, query] of [["zh", place.zh], ["en", place.en], ["pinyin", place.pinyin]]) {
      searchFixtures.push({ city, category: place.category, variant, query, operations: ["search"] });
    }
  }
  for (const place of places) {
    // A short synthetic offset (~300-500m), not a second real landmark —
    // AMap's walking API rejects OVER_DIRECTION_RANGE past a real distance
    // ceiling, so pairing two far-apart real places (e.g. an airport and a
    // downtown attraction) is not a valid walking-route test. Same pattern
    // as the earlier pilot's single-place routes.
    routeFixtures.push({
      city, category: place.category,
      from: { lat: place.lat, lng: place.lng }, to: { lat: place.lat + 0.004, lng: place.lng + 0.004 },
      operations: ["walking"],
    });
  }
}

if (searchFixtures.length !== 120) throw new Error(`expected 120 search fixtures, got ${searchFixtures.length}`);
if (routeFixtures.length !== 40) throw new Error(`expected 40 route fixtures, got ${routeFixtures.length}`);

writeFileSync(new URL("./full-matrix-search-120.json", import.meta.url), JSON.stringify(searchFixtures, null, 2) + "\n");
writeFileSync(new URL("./full-matrix-routes-40.json", import.meta.url), JSON.stringify(routeFixtures, null, 2) + "\n");
console.log(JSON.stringify({ searchFixtures: searchFixtures.length, routeFixtures: routeFixtures.length }));
