import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const output = 'artifacts/VPV10-MODULAR-001/qa-demo';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(() => {
      window.sampleBoundaryAttempts = [];
      const denied = name => (...args) => { window.sampleBoundaryAttempts.push(name); throw new Error(`Sample attempted ${name}`); };
      window.fetch = denied('fetch');
      window.XMLHttpRequest = denied('XHR');
      window.WebSocket = denied('WebSocket');
      window.EventSource = denied('EventSource');
      navigator.sendBeacon = denied('sendBeacon');
      Storage.prototype.setItem = denied('storage-write');
      Storage.prototype.removeItem = denied('storage-remove');
      Storage.prototype.clear = denied('storage-clear');
      Object.defineProperty(document, 'cookie', { get: () => '', set: denied('cookie-write') });
      indexedDB.open = denied('indexedDB');
    });
    const page = await context.newPage();
    const errors = [], unexpected = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => { if (['error', 'warning'].includes(msg.type())) errors.push(msg.text()); });
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== 'http://127.0.0.1:3181' || request.method() !== 'GET' || !(/^\/(qa\/demo|_next\/|assets\/|favicon)/.test(url.pathname))) {
        unexpected.push({ url: request.url(), method: request.method() });
        return route.abort();
      }
      return route.continue();
    });
    await page.goto('http://127.0.0.1:3181/qa/demo');
    assert.match(await page.title(), /Sample/);
    const input = page.getByLabel('输入预设问题 / Sample question');
    const send = page.getByRole('button', { name: '查看示例回应' });
    await send.waitFor();
    assert.equal(await send.isDisabled(), true);
    await input.fill('why');
    await input.press('Tab');
    await page.keyboard.press('Enter');
    await page.getByText('固定示例 A：把未知信息单独列出', { exact: false }).waitFor();
    assert.equal(await input.evaluate(el => el === document.activeElement), true);
    await page.getByRole('button', { name: '示例 B · 方案比较', exact: true }).click();
    await page.getByRole('button', { name: '简化 / simplify', exact: true }).click();
    await page.getByText('固定示例 B：看差异', { exact: false }).waitFor();
    await input.fill('not a preset');
    await send.click();
    await page.getByText('这个输入没有预设示例回应', { exact: false }).waitFor();
    await page.getByRole('button', { name: '纠正 / correction', exact: true }).click();
    await page.getByText('固定示例 B：把演示比较', { exact: false }).waitFor();
    await page.getByRole('button', { name: '重置当前示例 / Reset' }).click();
    assert.equal(await page.getByRole('log').locator('article').count(), 2);
    assert.equal(await input.evaluate(el => el === document.activeElement), true);
    for (const name of ['Journeys', 'Library', 'Memory']) {
      await page.getByRole('button', { name, exact: true }).click();
      await page.getByRole('heading', { name: `${name} · 示例空状态` }).waitFor();
      await page.getByRole('button', { name: '返回 VP 示例对话' }).click();
    }
    for (let n = 0; n < 12; n++) await page.getByRole('button', { name: '为什么 / why', exact: true }).click();
    assert.equal(await input.isDisabled(), true);
    await page.reload();
    await send.waitFor();
    assert.equal(await page.getByRole('log').locator('article').count(), 2);
    assert.equal(await input.isDisabled(), false);
    assert.equal(await page.getByRole('button', { name: '示例 A · 准备清单', exact: true }).getAttribute('aria-current'), 'true');
    assert.equal(await page.getByRole('link', { name: /进入真实 QA/ }).getAttribute('href'), '/qa');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(await page.evaluate(() => window.sampleBoundaryAttempts), []);
    assert.deepEqual(await context.cookies(), []);
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${output}/${viewport.width === 390 ? 'mobile' : 'desktop'}.png`, fullPage: true });
    results.push({ viewport, result: 'PASS', interaction: 'keyboard preset, switch, simplify, unknown, correction, reset, four tabs, limit, refresh', unexpectedRequests: unexpected, consoleErrors: errors, boundaryAttempts: [] });
    await context.close();
  }
  writeFileSync(`${output}/browser-results.json`, JSON.stringify({ url: 'http://127.0.0.1:3181/qa/demo', results }, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
