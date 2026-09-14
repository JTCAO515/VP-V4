const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const PRIVATE_PATHS = [
  /^\/journey\/knowledge$/,
  /^\/ops\/review$/,
  /^\/ops\/wiki$/,
  /^\/visepanda\/(?:ask|profile|copilot)$/,
  new RegExp(`^/visepanda/(?:ask|trips)/${UUID}$`, "i"),
] as const;

/** Only exact local private routes survive a post-auth return target. */
export function safeReturnTo(candidate: string | undefined): string {
  if (typeof candidate !== "string" || candidate !== candidate.trim() || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) return "/visepanda";
  let parsed: URL;
  try { parsed = new URL(candidate, "https://visepanda.invalid"); } catch { return "/visepanda"; }
  if (parsed.origin !== "https://visepanda.invalid" || parsed.hash) return "/visepanda";
  if (parsed.search) {
    const q = parsed.searchParams;
    if (parsed.pathname !== "/ops/review" || (q.size !== 3 && !(q.size === 4 && q.has("wikiProposalIndex")))
      || !["wikiPageKey", "wikiRevisionId", "wikiVersion"].every(key => q.has(key))
      || (q.has("wikiProposalIndex") && !/^[0-4]$/.test(q.get("wikiProposalIndex") ?? ""))
      || !new RegExp(`^${UUID}$`, "i").test(q.get("wikiRevisionId") ?? "")
      || !/^[1-9][0-9]{0,9}$/.test(q.get("wikiVersion") ?? "")
      || Number(q.get("wikiVersion")) > 2147483647) return "/visepanda";
    const pageKey = q.get("wikiPageKey");
    if (!pageKey || pageKey.trim() !== pageKey || pageKey.length > 200) return "/visepanda";
    return `${parsed.pathname}?${q.toString()}`;
  }
  return PRIVATE_PATHS.some((pattern) => pattern.test(parsed.pathname)) ? parsed.pathname : "/visepanda";
}

export function signInHref(returnTo: string | undefined): string {
  return `/auth/sign-in?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`;
}
