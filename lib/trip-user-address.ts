// Shared value contract only: neither a Trip writer nor a source-eligibility grant.
export type UserProvidedChineseAddress = Readonly<{
  text: string;
  source: "user_provided";
  verification: "unverified";
}>;

export const USER_ADDRESS_MAX_SCALARS = 500;
export const USER_ADDRESS_MAX_UTF8_BYTES = 1500;
// Explicit scalar set keeps the server, SQL and Native blank checks reproducible.
export const ADDRESS_WHITESPACE = "\t\n\r \u0085\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";
const whitespace = new Set(ADDRESS_WHITESPACE);
const forbiddenControl = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;

export function isUserAddressText(value: unknown): value is string {
  if (typeof value !== "string" || forbiddenControl.test(value)) return false;
  const scalars = [...value];
  if (scalars.length === 0 || scalars.length > USER_ADDRESS_MAX_SCALARS
    || new TextEncoder().encode(value).length > USER_ADDRESS_MAX_UTF8_BYTES
    || !scalars.some(scalar => !whitespace.has(scalar))) return false;
  return scalars.every(scalar => {
    const point = scalar.codePointAt(0)!;
    return point < 0xd800 || point > 0xdfff;
  });
}

export function userProvidedAddress(text: string): UserProvidedChineseAddress {
  if (!isUserAddressText(text)) throw new Error("INVALID_USER_ADDRESS");
  return Object.freeze({ text, source: "user_provided", verification: "unverified" });
}

export type UserAddressRead =
  | Readonly<{ kind: "missing" }>
  | Readonly<{ kind: "unsupported" }>
  | Readonly<{ kind: "provided"; address: UserProvidedChineseAddress }>;

export function readUserProvidedAddress(value: unknown): UserAddressRead {
  if (value === undefined || value === null) return { kind: "missing" };
  if (typeof value !== "object" || Array.isArray(value)) return { kind: "unsupported" };
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 3 || !["text", "source", "verification"].every(key => Object.hasOwn(record, key))
    || record.source !== "user_provided" || record.verification !== "unverified" || !isUserAddressText(record.text)) return { kind: "unsupported" };
  return { kind: "provided", address: userProvidedAddress(record.text) };
}

export type ChineseAddressText = "contains_chinese_text" | "not_chinese" | "unknown";
/** Content/script observation only; never translation, geocoding or source qualification. */
export function classifyChineseAddressLines(lines: unknown): ChineseAddressText {
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 16
    || !lines.every(line => typeof line === "string" && line.length > 0)) return "unknown";
  const text = lines.join("\n");
  if (new TextEncoder().encode(text).length > 4096 || forbiddenControl.test(text)
    || /[\u3040-\u30ff\u31f0-\u31ff\uff66-\uff9d\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/u.test(text)) return "unknown";
  const han = (point: number) => (point >= 0x3400 && point <= 0x4dbf)
    || (point >= 0x4e00 && point <= 0x9fff) || (point >= 0xf900 && point <= 0xfaff);
  // A known Han character cannot bless unsupported surrounding scripts or broken Unicode.
  if ([...text].some(scalar => {
    const point = scalar.codePointAt(0)!;
    return point > 0x024f && !han(point) && !whitespace.has(scalar)
      && !(point >= 0x2000 && point <= 0x206f) && !(point >= 0x3000 && point <= 0x303f)
      && !(point >= 0xff01 && point <= 0xff65);
  })) return "unknown";
  if ([...text].some(scalar => han(scalar.codePointAt(0)!))) return "contains_chinese_text";
  return "not_chinese";
}
