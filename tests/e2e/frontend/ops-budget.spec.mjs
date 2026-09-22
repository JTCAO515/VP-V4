import { expect, test } from '@playwright/test';

// Synthetic API responses exercise presentation only, not authenticated database access.
function snapshot() {
  const attempts = { total: 4, reserved: 0, dispatched: 0, pending: 2, settled: 1, released: 1 };
  const money = { settledMicros: '17', holdMicros: '20000000000000000', exposureMicros: '20000000000000017' };
  return {
    kind: 'snapshot', schemaVersion: 'ops-budget-scope/v1', observedAt: '2026-09-22T00:00:00Z',
    scope: { currency: 'CNY', enabled: false, frozen: true, expired: false }, attempts, money,
    providers: [{ provider: 'qwen', attempts, money }],
    tasks: { total: 3, linkedTurns: 2, missingTurns: 1, ownerMismatch: 0,
      technical: { active: 0, completed: 1, proposalReady: 0, unavailable: 0, failed: 1, cancelled: 0, unknown: 1 },
      business: { answered: 0, partial: 1, clarification: 0, blocked: 0, technicalFailure: 1, unobserved: 1 } },
    integrity: { inconsistentOutcomeTasks: 0, duplicateTerminalTasks: 0 },
    unobserved: { actualBilledMicros: null, providerLatencyMs: null, toolAttempts: null, humanTimeMs: null, semanticQuality: null, serviceTaskCount: null },
  };
}

for (const width of [1280, 390]) {
  test(`Ops reconciliation preserves unknowns and partial failures at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let response = snapshot();
    let status = 200;
    await page.route('**/api/ops/budget?*', route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ data: { snapshot: response } }) }));
    await page.goto('/ops/budget');
    await page.getByLabel('预算 Scope ID').fill('11111111-1111-4111-8111-111111111111');
    await page.getByRole('button', { name: '读取快照' }).click();
    const chineseTasks = page.getByRole('region', { name: '任务结果', exact: true });
    await expect(chineseTasks).toContainText('不同账本任务 ID: 3');
    await expect(chineseTasks.locator('dl').first()).toContainText('部分回答1');
    await expect(chineseTasks.locator('dl').first()).toContainText('技术失败1');
    await expect(chineseTasks.locator('dl').first()).toContainText('未观测1');
    await expect(page.getByRole('region', { name: '尚未观测的指标' })).toContainText('实际账单未知');
    await page.getByRole('combobox').selectOption('en');
    await expect(page.locator('main')).toHaveAttribute('lang', 'en');
    const tasks = page.getByRole('region', { name: 'Task outcomes', exact: true });
    await expect(tasks.locator('dl').first()).toContainText('Answered0');
    await expect(tasks.locator('dl').first()).toContainText('Partial1');
    await expect(tasks.locator('dl').first()).toContainText('Technical failure1');
    await expect(page.getByRole('region', { name: 'Attempt reconciliation' })).toContainText('Total attempts4');
    await expect(page.getByRole('region', { name: 'qwen', exact: true })).toContainText('Pending cost2');
    await expect(page.getByRole('region', { name: 'Budget and costs', exact: true })).toContainText('20000000000000017');
    await expect(page.getByRole('region', { name: 'Linkage and integrity' })).toContainText('Missing Turns exist');
    await expect(page.getByRole('region', { name: 'Unobserved metrics' })).toContainText('Actual billed costUnknown');
    const dimensions = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);

    // Observed empty scope is zero rows, never zero billing or quality.
    response = snapshot();
    for (const key of Object.keys(response.attempts)) response.attempts[key] = 0;
    for (const key of Object.keys(response.money)) response.money[key] = '0';
    response.providers = [];
    response.tasks.total = response.tasks.linkedTurns = response.tasks.missingTurns = 0;
    for (const key of Object.keys(response.tasks.technical)) response.tasks.technical[key] = 0;
    for (const key of Object.keys(response.tasks.business)) response.tasks.business[key] = 0;
    await page.getByRole('button', { name: 'Read snapshot' }).click();
    await expect(tasks).toContainText('Distinct ledger task IDs: 0');
    await expect(page.getByRole('region', { name: 'Unobserved metrics' })).toContainText('Actual billed costUnknown');
    // Invalid data and transport failure must discard the prior successful snapshot.
    response.unobserved.actualBilledMicros = 0;
    await page.getByRole('button', { name: 'Read snapshot' }).click();
    await expect(page.getByRole('status')).toContainText('Unable to read');
    await expect(tasks).toHaveCount(0);
    status = 503;
    await page.getByRole('button', { name: 'Read snapshot' }).click();
    await expect(page.getByRole('status')).toContainText('Unable to read');
    await expect(tasks).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
