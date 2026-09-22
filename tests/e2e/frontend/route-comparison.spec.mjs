import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`route comparison pins endpoints and expires safely at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const origin = { provider: 'amap', providerPoiId: 'start', rawName: '起点 Start', address: '测试起点地址', location: { lat: 31.2, lng: 121.4, coordinateSystem: 'gcj02' } };
    const destination = { ...origin, providerPoiId: 'end', rawName: '终点 End', address: '测试终点地址', location: { ...origin.location, lng: 121.5 } };
    let routes = 0;
    await page.route('**/api/places/lookup?**', route => {
      const params = new URL(route.request().url()).searchParams;
      const action = params.get('action');
      if (action === 'search') return route.fulfill({ json: { candidates: [origin, destination] } });
      if (action === 'detail') return route.fulfill({ json: { detail: params.get('id') === 'start' ? origin : destination, observedAt: new Date().toISOString() } });
      expect(action).toBe('routes'); expect(params.get('originId')).toBe('start'); expect(params.get('destinationId')).toBe('end'); expect(params.get('departure')).toBe('now'); routes++;
      return route.fulfill({ json: { provider: 'amap', origin, destination, observedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 300000).toISOString(), options: [
        { mode: 'walking', status: 'observed', durationSeconds: 600, distanceMeters: 500, walkingMeters: 500, transfers: null, steps: ['测试步行分段'], webUrl: 'https://uri.amap.com/navigation?to=121.5,31.2,End&mode=walk&coordinate=gaode' },
        { mode: 'transit', status: 'no_routes' }, { mode: 'driving', status: 'timeout' },
      ] } });
    });
    await page.goto('/places');
    await page.getByLabel('Place or address', { exact: true }).fill('测试');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('button', { name: origin.rawName, exact: true }).click();
    await page.getByRole('button', { name: 'Use selected place as start', exact: true }).click();
    await page.getByRole('button', { name: destination.rawName, exact: true }).click();
    await page.getByRole('button', { name: 'Use selected place as destination', exact: true }).click();
    await page.getByLabel('Departure', { exact: true }).selectOption('future');
    await expect(page.getByText('Future departure is unavailable. Current traffic is not a forecast for tomorrow.')).toBeVisible();
    expect(routes).toBe(0);
    await page.getByLabel('Departure', { exact: true }).selectOption('now');
    await page.getByRole('button', { name: 'Agree and compare with AMap', exact: true }).click();
    await expect(page.getByText('测试步行分段')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open AMap web directions' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Copy destination address' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: '中文', exact: true }).click();
    await expect(page.getByRole('heading', { name: '比较路线', exact: true })).toBeVisible();
    await page.clock.install(); await page.clock.fastForward(301000);
    await expect(page.getByText('路线观测已过期，请重新查询后导航。')).toBeVisible();
    await expect(page.getByRole('link', { name: '打开高德网页路线' })).toHaveCount(0);
    await page.getByRole('button', { name: '清除路线', exact: true }).click();
    await expect(page.getByRole('button', { name: '同意并向高德查询比较' })).toBeDisabled();
  });
}
