// Test-only, failure-only allowlisted diagnostics. Never read raw messages,
// headers, cookies, request/response bodies, query, fragment or URL credentials.
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const ERROR_NAMES = new Set(['Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'URIError', 'EvalError', 'AssertionError']);
const PHASES = new Set(['setup', 'author_login', 'author_form', 'submit', 'reviewer_login', 'review', 'desktop', 'mobile', 'rtl']);
const PATHS = new Set(['/auth/sign-in', '/auth/sign-out', '/ops/review', '/api/ops/review', '/favicon.ico', '/_next/image', '/_next/webpack-hmr']);
const errorClass = error => ERROR_NAMES.has(error?.name) ? error.name : 'other_error';
function resourceLocation(value, origin) {
  try {
    const url = new URL(value);
    if (url.origin !== origin) return { scope: ['http:', 'https:'].includes(url.protocol) ? 'external_origin' : 'non_http_resource' };
    // Ops paths and static build assets are safe to locate. Unknown private
    // routes or credential-looking path segments are redacted, not decoded.
    const path = url.pathname;
    const staticAsset = path.startsWith('/_next/static/') && /^\/[A-Za-z0-9/._-]+$/.test(path)
      && path.split('/').every(segment => segment.length <= 80 && !/(token|secret|authorization|bearer|cookie|password|reset|session)/i.test(segment));
    return { scope: 'same_origin', pathname: path.length <= 320 && (PATHS.has(path) || staticAsset) ? path : '[redacted_path]' };
  } catch { return { scope: 'invalid_resource' }; }
}

export function browserFailureDiagnostics(page, { origin, errors, emit }) {
  const site = new URL(origin).origin, records = [];
  let phase = 'setup', dropped = 0;
  const add = value => { if (records.length < 32) records.push({ phase, ...value }); else dropped++; };
  const resource = (request, status, event) => {
    const method = request.method();
    add({ event, method: METHODS.has(method) ? method : 'OTHER',
      ...resourceLocation(request.url(), site), ...(status === undefined ? {} : { status }) });
  };
  const handlers = {
    pageerror: error => { const classification = errorClass(error); errors.push('pageerror:' + classification); add({ event: 'pageerror', classification }); },
    console: message => { if (message.type() === 'error') { errors.push('console:error'); add({ event: 'console_error' }); } },
    response: response => { const status = response.status(); if (Number.isInteger(status) && status >= 400 && status <= 599) resource(response.request(), status, 'http_failure'); },
    requestfailed: request => resource(request, undefined, 'request_failed'),
  };
  for (const [event, handler] of Object.entries(handlers)) page.on(event, handler);
  return {
    setPhase(value) { phase = PHASES.has(value) ? value : 'unknown_phase'; },
    reportFailure(error) { emit({ schemaVersion: 'browser-failure/1', phase, failure: errorClass(error), events: records.map(record => ({ ...record })), droppedEvents: dropped }); },
    dispose() { for (const [event, handler] of Object.entries(handlers)) page.off(event, handler); },
  };
}
