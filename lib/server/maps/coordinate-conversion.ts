/**
 * Explicit, no-double-convert GCJ02 (China's obfuscated "Mars coordinate")
 * <-> WGS84 conversion for #363 (VPJ-19 acceptance: "GCJ/WGS等坐标转换显式
 * 且不双转"). This module owns exactly one job: given a coordinate already
 * tagged with its source `CoordinateSystem` (see place-identity.ts), produce
 * a coordinate tagged with a requested target system, recording how that
 * happened -- and refusing to reapply the offset formula to a coordinate
 * that is already in the target system.
 *
 * Deliberately out of scope: this module never guesses a coordinate's
 * source system, never converts to/from Baidu's bd09 (not part of the
 * CoordinateSystem closed set in the migration), and never picks a building
 * centroid as a substitute for a missing entrance -- entrance provenance
 * stays owned by place-identity.ts's all-or-nothing `CanonicalPoiEntrance`.
 */

import type { CoordinateSystem } from "./place-identity";

/**
 * Named `lat`/`lng` fields, never a `[number, number]` tuple -- the closed
 * field names make the axis order unambiguous at every call site instead of
 * relying on callers to remember whether index 0 is latitude or longitude.
 */
export type SystemedCoordinate = Readonly<{ lat: number; lng: number; system: CoordinateSystem }>;

const COORDINATE_SYSTEMS: readonly CoordinateSystem[] = ["gcj02", "wgs84"];

/**
 * Runtime shape/range check for a `SystemedCoordinate` -- catches the case a
 * static type can't: a value that type-checks as `SystemedCoordinate` at a
 * call site (because the field names line up) but is actually malformed at
 * runtime (NaN/Infinity from a bad parse, a swapped/out-of-range lat or lng,
 * or a `system` tag that isn't one of the two closed values). This module
 * previously trusted every caller's `system` tag unconditionally; this is
 * the runtime enforcement #363's acceptance bullet ("坐标明确WGS/GCJ等来源与
 * 转换记录、经纬顺序") asks for, applied at this module's single entry point
 * rather than duplicated per adapter.
 */
export function isValidSystemedCoordinate(value: unknown): value is SystemedCoordinate {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.lat === "number" && Number.isFinite(v.lat) && Math.abs(v.lat) <= 90
    && typeof v.lng === "number" && Number.isFinite(v.lng) && Math.abs(v.lng) <= 180
    && COORDINATE_SYSTEMS.includes(v.system as CoordinateSystem);
}

/**
 * Thrown by `convertCoordinateSystem` when either its input or requested
 * target system fails runtime validation -- refusing to guess a source
 * system or silently pass through a malformed coordinate.
 */
export class InvalidSystemedCoordinateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSystemedCoordinateError";
  }
}

export type ConversionOutcome =
  /** Requested target system already matches the input -- the offset formula was never applied. */
  | Readonly<{ status: "noop_same_system"; result: SystemedCoordinate }>
  /** Outside GCJ02's obfuscated region (mainland China); WGS84 and GCJ02 coincide there, so only the tag changes. */
  | Readonly<{ status: "unchanged_out_of_china"; result: SystemedCoordinate }>
  /** The offset formula was applied once. */
  | Readonly<{ status: "converted"; result: SystemedCoordinate; algorithm: "gcj02_offset_approx" }>;

const PI = Math.PI;
const A = 6378245.0; // semi-major axis, Krasovsky 1940 ellipsoid (used by China's obfuscation algorithm)
const EE = 0.00669342162296594323; // eccentricity squared, same ellipsoid

/**
 * China's published obfuscation region check. Coordinates outside this
 * bounding box are never offset -- GCJ02 is only defined/applied within it.
 */
function isOutOfChina(lat: number, lng: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * PI) + 320 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

function transformLng(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
  return ret;
}

/** Offset applied to a WGS84 point to obtain its GCJ02 counterpart; delta = GCJ02 - WGS84. */
function wgs84ToGcj02Delta(wgsLat: number, wgsLng: number): { dLat: number; dLng: number } {
  const dLatRaw = transformLat(wgsLng - 105.0, wgsLat - 35.0);
  const dLngRaw = transformLng(wgsLng - 105.0, wgsLat - 35.0);
  const radLat = (wgsLat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  const dLat = (dLatRaw * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  const dLng = (dLngRaw * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
  return { dLat, dLng };
}

function wgs84ToGcj02(lat: number, lng: number): { lat: number; lng: number } {
  if (isOutOfChina(lat, lng)) return { lat, lng };
  const { dLat, dLng } = wgs84ToGcj02Delta(lat, lng);
  return { lat: lat + dLat, lng: lng + dLng };
}

/**
 * Standard non-iterative approximation: the offset is computed from the
 * GCJ02 point itself (rather than solving for the exact WGS84 origin) and
 * subtracted back off. This is the same approximation used by common public
 * gcj02<->wgs84 implementations; residual error is sub-meter for this
 * approximation's own round-trip (see coordinate-conversion.test.mjs), but
 * this module makes no claim of matching a surveyed geodetic ground truth --
 * that verification is explicitly UNRUN (no authoritative reference fixture
 * available in this environment).
 */
function gcj02ToWgs84(lat: number, lng: number): { lat: number; lng: number } {
  if (isOutOfChina(lat, lng)) return { lat, lng };
  const { dLat, dLng } = wgs84ToGcj02Delta(lat, lng);
  return { lat: lat - dLat, lng: lng - dLng };
}

/**
 * Convert `input` to `targetSystem`, explicitly recording what happened.
 * Never applies the offset formula twice: if `input.system` already equals
 * `targetSystem`, this is a no-op that returns the input unchanged.
 */
export function convertCoordinateSystem(input: SystemedCoordinate, targetSystem: CoordinateSystem): ConversionOutcome {
  if (!isValidSystemedCoordinate(input)) {
    throw new InvalidSystemedCoordinateError(
      "convertCoordinateSystem: input is not a valid SystemedCoordinate (lat/lng must be finite numbers within " +
        "[-90,90]/[-180,180] and system must be \"gcj02\" or \"wgs84\") -- refusing to guess or silently pass through",
    );
  }
  if (!COORDINATE_SYSTEMS.includes(targetSystem)) {
    throw new InvalidSystemedCoordinateError(`convertCoordinateSystem: targetSystem "${String(targetSystem)}" is not a recognized CoordinateSystem`);
  }
  if (input.system === targetSystem) {
    return Object.freeze({ status: "noop_same_system", result: input });
  }
  if (isOutOfChina(input.lat, input.lng)) {
    return Object.freeze({
      status: "unchanged_out_of_china",
      result: Object.freeze({ lat: input.lat, lng: input.lng, system: targetSystem }),
    });
  }
  const converted = input.system === "wgs84" && targetSystem === "gcj02"
    ? wgs84ToGcj02(input.lat, input.lng)
    : gcj02ToWgs84(input.lat, input.lng);
  return Object.freeze({
    status: "converted",
    algorithm: "gcj02_offset_approx",
    result: Object.freeze({ lat: converted.lat, lng: converted.lng, system: targetSystem }),
  });
}
