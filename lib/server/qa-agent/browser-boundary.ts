/** Distinct browser domain boundary. Native endpoints/headers are never proxied. */
export function browserBoundary(request: Pick<Request, "url" | "method" | "headers">) {
  const url = new URL(request.url), origin = request.headers.get("origin"), site = request.headers.get("sec-fetch-site");
  return !url.search && !request.headers.has("authorization") && site !== "cross-site"
    && (request.method === "GET" ? origin === null || origin === url.origin : origin === url.origin)
    && ["GET", "POST"].includes(request.method);
}
