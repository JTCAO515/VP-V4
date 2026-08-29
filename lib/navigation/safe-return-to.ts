const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const PRIVATE_PATHS = [
  /^\/visepanda\/(?:ask|profile|copilot)$/,
  new RegExp(`^/visepanda/(?:ask|trips)/${UUID}$`, "i"),
] as const;

/** Only exact local private routes survive a post-auth return target. */
export function safeReturnTo(candidate: string | undefined): string {
  if (typeof candidate !== "string" || candidate !== candidate.trim() || !candidate.startsWith("/") || candidate.startsWith("//")) return "/visepanda";
  let parsed: URL;
  try { parsed = new URL(candidate, "https://visepanda.invalid"); } catch { return "/visepanda"; }
  if (parsed.origin !== "https://visepanda.invalid" || parsed.search || parsed.hash) return "/visepanda";
  return PRIVATE_PATHS.some((pattern) => pattern.test(parsed.pathname)) ? parsed.pathname : "/visepanda";
}

export function signInHref(returnTo: string | undefined): string {
  return `/auth/sign-in?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`;
}
