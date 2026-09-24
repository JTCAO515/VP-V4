import { test, expect } from '@playwright/test';

// Built app under `next start`: every main page must render with the enforced CSP and produce no
// enforced CSP violation. Report-Only findings on /places are collected but not failures.
const PAGES = ['/', '/research', '/auth/sign-in', '/visepanda', '/visepanda/ask', '/visepanda/today', '/visepanda/trips', '/places', '/explore', '/journey', '/translate', '/homepage', '/ops/review', '/ops/budget'];

async function watchViolations(page) {
  const violations = [];
  await page.exposeFunction('__vpCspViolation', v => violations.push(v));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => {
      window.__vpCspViolation({ directive: e.effectiveDirective, blocked: e.blockedURI, disposition: e.disposition, sample: e.sample });
    });
  });
  page.on('console', message => {
    if (message.type() === 'error' && /Content Security Policy/i.test(message.text()) && !/report-only/i.test(message.text())) {
      violations.push({ directive: 'console', blocked: message.text(), disposition: 'enforce' });
    }
  });
  return violations;
}

for (const path of PAGES) {
  test(`security headers present and no enforced CSP violation on ${path}`, async ({ page }) => {
    const violations = await watchViolations(page);
    const response = await page.goto(path, { waitUntil: 'networkidle' });
    expect(response).not.toBeNull();
    const headers = response.headers();
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['content-security-policy']).toContain("object-src 'none'");
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toContain('camera=()');
    if (path === '/places') {
      expect(headers['content-security-policy']).toContain('https://*.amap.com');
      expect(headers['content-security-policy-report-only']).toBeTruthy();
    } else {
      expect(headers['content-security-policy']).not.toContain('amap');
      expect(headers['content-security-policy']).not.toContain("'unsafe-eval'");
    }
    // Hydration must have run (inline Next.js bootstrap scripts allowed).
    await expect.poll(() => page.evaluate(() => document.readyState)).toBe('complete');
    expect(violations.filter(v => v.disposition !== 'report')).toEqual([]);
  });
}

test('only /places may load the AMap JS origin; other pages block it', async ({ page }) => {
  const violations = await watchViolations(page);
  let served = 0;
  await page.route('https://webapi.amap.com/**', route => { served++; return route.fulfill({ contentType: 'application/javascript', body: 'window.__vpAmapStubLoaded = true;' }); });
  const load = () => page.evaluate(() => new Promise(resolve => {
    const s = document.createElement('script');
    s.src = 'https://webapi.amap.com/maps?v=2.0&key=stub';
    s.onload = () => resolve('loaded'); s.onerror = () => resolve('blocked');
    document.head.appendChild(s);
  }));
  await page.goto('/visepanda');
  expect(await load()).toBe('blocked');
  expect(served).toBe(0);
  expect(violations.some(v => v.directive === 'script-src-elem' && v.blocked.startsWith('https://webapi.amap.com'))).toBe(true);
  await page.goto('/places');
  expect(await load()).toBe('loaded');
  expect(served).toBe(1);
});

test('/places map path: consented AMap load stays within the enforced map policy', async ({ page }) => {
  const violations = await watchViolations(page);
  const point = { provider: 'amap', providerPoiId: 'p1', rawName: '测试地点 Stub', address: '测试地址', location: { lat: 31.2, lng: 121.4, coordinateSystem: 'gcj02' } };
  await page.route('**/api/places/lookup?**', route => {
    const action = new URL(route.request().url()).searchParams.get('action');
    if (action === 'search') return route.fulfill({ json: { candidates: [point] } });
    return route.fulfill({ json: { detail: point, observedAt: new Date().toISOString() } });
  });
  await page.route('**/api/maps/display-config', route => route.fulfill({ json: { enabled: true, key: 'stub', serviceHost: '/api/maps/_AMapService' } }));
  // Stub SDK exercising what AMap JS 2.0 needs: eval, blob workers and AMap image origins.
  await page.route('https://webapi.amap.com/**', route => route.fulfill({ contentType: 'application/javascript', body: `
    (function(){
      new Function('return 1')();
      var w = new Worker(URL.createObjectURL(new Blob(['postMessage(1)'], { type: 'text/javascript' }))); w.terminate();
      var img = new Image(); img.src = 'https://a.amap.com/stub.png';
      function M(el){ this.el = el; el.setAttribute('data-stub-map','1'); }
      M.prototype.add = function(){}; M.prototype.destroy = function(){};
      function K(){} K.prototype.on = function(){}; K.prototype.setMap = function(){};
      window.AMap = { Map: M, Marker: K };
      window.__vpAMapReady && window.__vpAMapReady();
    })();` }));
  await page.route('https://a.amap.com/**', route => route.fulfill({ status: 204 }));
  await page.goto('/places');
  await page.getByLabel('Place or address', { exact: true }).fill('测试');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: point.rawName, exact: true }).click();
  await page.getByRole('button', { name: 'Agree and show AMap', exact: true }).click();
  await expect(page.locator('[data-stub-map="1"]')).toHaveCount(1);
  expect(violations.filter(v => v.disposition !== 'report')).toEqual([]);
  // The Report-Only candidate (no 'unsafe-eval') flags the eval the stub performed.
  expect(violations.some(v => v.disposition === 'report' && v.directive === 'script-src')).toBe(true);
});
