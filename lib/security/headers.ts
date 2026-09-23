/**
 * Response security headers for every Web route (consumed by next.config.ts `headers()`).
 *
 * Kept dependency-free so contract tests can import it directly.
 *
 * Policy shape:
 * - Every route gets the base CSP: same-origin only, no plugins, no framing, no foreign forms.
 * - `/places` (the only page that loads AMap JS 2.0, and only after explicit user consent) gets a
 *   route-scoped CSP that adds AMap/AutoNavi origins, `blob:` workers and `'unsafe-eval'`, which
 *   AMap JS 2.0 is reported to require. It also carries a Report-Only candidate without
 *   `'unsafe-eval'` so a real-key browser session can show whether that relaxation can be dropped.
 *
 * Why script-src keeps `'unsafe-inline'`: Next.js App Router streams RSC payloads as inline
 * `<script>` tags. Removing it requires per-request nonces (a proxy that forces every page to
 * render dynamically) — tracked as a follow-up decision, not attempted here.
 * Why style-src keeps `'unsafe-inline'`: React `style={{...}}` attributes and AMap-injected styles.
 */

export type SecurityHeader = { key: string; value: string };
export type HeaderRule = { source: string; headers: SecurityHeader[] };
export type SecurityHeaderOptions = { dev?: boolean; vercelEnv?: string | undefined };

type Directives = Record<string, string[]>;

const AMAP_ORIGINS = ["https://*.amap.com", "https://*.autonavi.com"];
// Vercel preview deployments inject the feedback toolbar from vercel.live.
const VERCEL_LIVE = ["https://vercel.live"];

function serialize(directives: Directives): string {
  return Object.entries(directives)
    .map(([name, values]) => (values.length ? `${name} ${values.join(" ")}` : name))
    .join("; ");
}

function baseDirectives({ dev = false, vercelEnv }: SecurityHeaderOptions): Directives {
  const preview = vercelEnv === "preview";
  return {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), ...(preview ? VERCEL_LIVE : [])],
    "style-src": ["'self'", "'unsafe-inline'", ...(preview ? VERCEL_LIVE : [])],
    "img-src": ["'self'", "data:", "blob:", ...(preview ? VERCEL_LIVE : [])],
    "font-src": ["'self'", ...(preview ? VERCEL_LIVE : [])],
    "connect-src": ["'self'", ...(preview ? [...VERCEL_LIVE, "wss://ws-us3.pusher.com"] : [])],
    "media-src": ["'self'"],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "frame-src": preview ? VERCEL_LIVE : ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
}

function withAmap(directives: Directives, { unsafeEval }: { unsafeEval: boolean }): Directives {
  const add = (name: string, values: string[]) => [...new Set([...(directives[name] ?? []), ...values])];
  const scripts = add("script-src", AMAP_ORIGINS);
  return {
    ...directives,
    "script-src": unsafeEval && !scripts.includes("'unsafe-eval'") ? [...scripts, "'unsafe-eval'"] : scripts,
    "style-src": add("style-src", AMAP_ORIGINS),
    "img-src": add("img-src", AMAP_ORIGINS),
    "font-src": add("font-src", AMAP_ORIGINS),
    "connect-src": add("connect-src", AMAP_ORIGINS),
    "worker-src": add("worker-src", ["blob:"]),
  };
}

export function contentSecurityPolicy(options: SecurityHeaderOptions = {}): string {
  return serialize(baseDirectives(options));
}

export function mapContentSecurityPolicy(options: SecurityHeaderOptions = {}, { unsafeEval = true } = {}): string {
  return serialize(withAmap(baseDirectives(options), { unsafeEval }));
}

const STATIC_HEADERS: SecurityHeader[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), hid=(), midi=(), browsing-topics=(), clipboard-write=(self)",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

/**
 * Next.js applies every matching rule; for a duplicated key the later rule wins, so the
 * `/places` rule must stay after the catch-all.
 */
export function securityHeaderRules(options: SecurityHeaderOptions = {}): HeaderRule[] {
  return [
    {
      source: "/:path*",
      headers: [...STATIC_HEADERS, { key: "Content-Security-Policy", value: contentSecurityPolicy(options) }],
    },
    {
      source: "/places",
      headers: [
        { key: "Content-Security-Policy", value: mapContentSecurityPolicy(options) },
        { key: "Content-Security-Policy-Report-Only", value: mapContentSecurityPolicy(options, { unsafeEval: options.dev === true }) },
      ],
    },
  ];
}
