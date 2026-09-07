import { test, expect } from '@playwright/test';

/**
 * 仪表盘交互冒烟测试：
 *  - 4 个图表库全部渲染（.card x4，且画布出现）
 *  - 切换交易对 / 周期后，4 个 bars-count 同步重新拉取（HISTORY_LIMIT=300，实时追加可能 +1）
 *  - 全程无 .error-panel、无 console error / pageerror
 *
 * 前置：dev server 已在 http://localhost:5173 运行（npm run dev）。
 */
const MIN_BARS = 250; // 容差：拉取 300 根，实时订阅可能再追加 1 根

test('4 图表库渲染并在切换交易对/周期时同步刷新', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto('/');
  await expect(page.locator('.card')).toHaveCount(4);

  const counts = page.locator('.bars-count');
  // 初始加载：4 个 bars-count 都补满
  await expect
    .poll(async () => {
      const texts = await counts.allTextContents();
      return texts.length === 4 && texts.every((t) => parseInt(t, 10) >= MIN_BARS);
    })
    .toBe(true);
  expect(await page.locator('.card canvas').count()).toBeGreaterThanOrEqual(4);
  await expect(page.locator('.error-panel')).toHaveCount(0);

  // 切换交易对 BTCUSDT -> ETHUSDT
  const symbolSel = page.locator('label:has-text("交易对") select');
  await symbolSel.selectOption('ETHUSDT');
  await expect(symbolSel).toHaveValue('ETHUSDT');
  await expect
    .poll(async () => {
      const texts = await counts.allTextContents();
      return texts.length === 4 && texts.every((t) => parseInt(t, 10) >= MIN_BARS);
    })
    .toBe(true);
  await expect(page.locator('.error-panel')).toHaveCount(0);

  // 切换周期 1m -> 1h
  const periodSel = page.locator('label:has-text("周期") select');
  await periodSel.selectOption('1h');
  await expect(periodSel).toHaveValue('1h');
  await expect
    .poll(async () => {
      const texts = await counts.allTextContents();
      return texts.length === 4 && texts.every((t) => parseInt(t, 10) >= MIN_BARS);
    })
    .toBe(true);
  await expect(page.locator('.error-panel')).toHaveCount(0);

  // 切换后画布仍在渲染，且 4 个 bars 数一致
  expect(await page.locator('.card canvas').count()).toBeGreaterThanOrEqual(4);
  const finalTexts = await counts.allTextContents();
  expect(new Set(finalTexts).size).toBe(1);

  await page.screenshot({ path: 'tests/screenshots/dashboard-after-switch.png', fullPage: true });

  // 全程不得出现数据源错误面板或前端报错
  expect(consoleErrors).toEqual([]);
});
