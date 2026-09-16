import assert from "node:assert/strict";
import test from "node:test";
import {
  convertCoordinateSystem,
  InvalidSystemedCoordinateError,
  isValidSystemedCoordinate,
} from "../../../lib/server/maps/coordinate-conversion.ts";

// Guangzhou Tower, roughly -- well inside the GCJ02 obfuscation region.
const GZ_WGS84 = Object.freeze({ lat: 23.1066, lng: 113.3245, system: "wgs84" });
const GZ_GCJ02 = Object.freeze({ lat: 23.1066, lng: 113.3245, system: "gcj02" });

// New York -- outside the obfuscation region (out of China bbox).
const NY = Object.freeze({ lat: 40.7128, lng: -74.006, system: "wgs84" });

test("same-system request is a no-op: the offset formula is never reapplied", () => {
  const outcome = convertCoordinateSystem(GZ_WGS84, "wgs84");
  assert.equal(outcome.status, "noop_same_system");
  assert.deepEqual(outcome.result, GZ_WGS84);
});

test("gcj02 requested from gcj02 input is also a no-op", () => {
  const outcome = convertCoordinateSystem(GZ_GCJ02, "gcj02");
  assert.equal(outcome.status, "noop_same_system");
  assert.deepEqual(outcome.result, GZ_GCJ02);
});

test("wgs84 -> gcj02 inside China applies a bounded offset and tags the result gcj02", () => {
  const outcome = convertCoordinateSystem(GZ_WGS84, "gcj02");
  assert.equal(outcome.status, "converted");
  assert.equal(outcome.algorithm, "gcj02_offset_approx");
  assert.equal(outcome.result.system, "gcj02");
  const dLat = Math.abs(outcome.result.lat - GZ_WGS84.lat);
  const dLng = Math.abs(outcome.result.lng - GZ_WGS84.lng);
  // GCJ02's published obfuscation offset is on the order of 0-600m (~0-0.006deg);
  // bound it generously to catch a broken formula without pinning an exact value.
  assert.ok(dLat > 0 && dLat < 0.02, `lat offset ${dLat} out of expected bound`);
  assert.ok(dLng > 0 && dLng < 0.02, `lng offset ${dLng} out of expected bound`);
});

test("gcj02 -> wgs84 inside China applies the inverse offset and tags the result wgs84", () => {
  const outcome = convertCoordinateSystem(GZ_GCJ02, "wgs84");
  assert.equal(outcome.status, "converted");
  assert.equal(outcome.result.system, "wgs84");
  assert.notEqual(outcome.result.lat, GZ_GCJ02.lat);
  assert.notEqual(outcome.result.lng, GZ_GCJ02.lng);
});

test("round trip wgs84 -> gcj02 -> wgs84 stays within the algorithm's own sub-meter approximation error", () => {
  const toGcj = convertCoordinateSystem(GZ_WGS84, "gcj02");
  const back = convertCoordinateSystem({ ...toGcj.result }, "wgs84");
  assert.equal(back.status, "converted");
  const dLat = Math.abs(back.result.lat - GZ_WGS84.lat);
  const dLng = Math.abs(back.result.lng - GZ_WGS84.lng);
  // ~3e-5 degrees is roughly 3m at this latitude; this checks internal
  // consistency of the approximation, not agreement with a surveyed ground
  // truth (that comparison is UNRUN -- no authoritative fixture available).
  assert.ok(dLat < 3e-5, `round-trip lat drift ${dLat} too large`);
  assert.ok(dLng < 3e-5, `round-trip lng drift ${dLng} too large`);
});

test("round trip gcj02 -> wgs84 -> gcj02 also stays within the approximation error", () => {
  const toWgs = convertCoordinateSystem(GZ_GCJ02, "wgs84");
  const back = convertCoordinateSystem({ ...toWgs.result }, "gcj02");
  assert.equal(back.status, "converted");
  assert.ok(Math.abs(back.result.lat - GZ_GCJ02.lat) < 3e-5);
  assert.ok(Math.abs(back.result.lng - GZ_GCJ02.lng) < 3e-5);
});

test("a point outside China is passed through unchanged, only re-tagged", () => {
  const outcome = convertCoordinateSystem(NY, "gcj02");
  assert.equal(outcome.status, "unchanged_out_of_china");
  assert.equal(outcome.result.lat, NY.lat);
  assert.equal(outcome.result.lng, NY.lng);
  assert.equal(outcome.result.system, "gcj02");
});

test("an out-of-China point already in the target system is still just a same-system no-op", () => {
  const outcome = convertCoordinateSystem(NY, "wgs84");
  assert.equal(outcome.status, "noop_same_system");
});

// --- Runtime enforcement (#363: "坐标明确WGS/GCJ等来源与转换记录、经纬顺序") ---
// convertCoordinateSystem previously trusted every caller's `system` tag and
// numeric fields unconditionally. These tests exercise the runtime guard
// that now rejects a malformed SystemedCoordinate instead of silently
// passing it through or guessing a source system for it.

test("isValidSystemedCoordinate accepts well-formed gcj02/wgs84 coordinates", () => {
  assert.equal(isValidSystemedCoordinate(GZ_WGS84), true);
  assert.equal(isValidSystemedCoordinate(GZ_GCJ02), true);
  assert.equal(isValidSystemedCoordinate(NY), true);
});

test("isValidSystemedCoordinate rejects out-of-range, non-finite, swapped, or mistagged coordinates", () => {
  assert.equal(isValidSystemedCoordinate({ lat: 91, lng: 113, system: "gcj02" }), false, "lat > 90");
  assert.equal(isValidSystemedCoordinate({ lat: 23, lng: 181, system: "gcj02" }), false, "lng > 180");
  assert.equal(isValidSystemedCoordinate({ lat: NaN, lng: 113, system: "gcj02" }), false, "NaN lat");
  assert.equal(isValidSystemedCoordinate({ lat: 23, lng: Infinity, system: "gcj02" }), false, "Infinity lng");
  assert.equal(isValidSystemedCoordinate({ lat: 23, lng: 113, system: "bd09" }), false, "unrecognized system tag");
  assert.equal(isValidSystemedCoordinate({ lat: "23", lng: 113, system: "gcj02" }), false, "lat as string");
  assert.equal(isValidSystemedCoordinate(null), false);
  assert.equal(isValidSystemedCoordinate("23,113"), false, "not an object");
});

test("convertCoordinateSystem throws InvalidSystemedCoordinateError on an out-of-range input instead of silently converting it", () => {
  assert.throws(
    () => convertCoordinateSystem({ lat: 999, lng: 113.3245, system: "wgs84" }, "gcj02"),
    InvalidSystemedCoordinateError,
  );
});

test("convertCoordinateSystem throws on a non-finite input", () => {
  assert.throws(
    () => convertCoordinateSystem({ lat: NaN, lng: 113.3245, system: "wgs84" }, "gcj02"),
    InvalidSystemedCoordinateError,
  );
});

test("convertCoordinateSystem throws on an input whose system tag is outside the closed gcj02/wgs84 set", () => {
  assert.throws(
    () => convertCoordinateSystem({ lat: 23.1066, lng: 113.3245, system: "bd09" }, "gcj02"),
    InvalidSystemedCoordinateError,
  );
});

test("convertCoordinateSystem throws on an unrecognized targetSystem instead of returning a mistagged result", () => {
  assert.throws(
    () => convertCoordinateSystem(GZ_WGS84, "bd09"),
    InvalidSystemedCoordinateError,
  );
});
