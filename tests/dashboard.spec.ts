import { test, expect } from '@playwright/test';

/**
 * 仪表盘交互冒烟测试：
 *  - 默认数据源 = 腾讯财经，默认标的 = 上证指数（sh000001）
 *  - 4 个图表库全部渲染（.card x4，且画布出现）
 *  - 顶部搜索框搜 A 股（平安银行）并选中 → 4 个 bars-count 同步刷新
 *  - 切换周期 5m → 4 个 bars-count 同步刷新
 *  - 切换到 Binance → 标的自动重置为 BTCUSDT，4 个 bars-count 同步刷新
 *  - 全程无 .error-panel、无 console error / pageerror
 *
 * 前置：dev server 已在 http://localhost:5173 运行（npm run dev）。
 */
const MIN_BARS = 250; // 容差：拉取 300 根，实时订阅可能再追加 1 根

test('4 图表库渲染，默认上证指数，搜索 A 股与切换周期/数据源同步刷新', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto('/');
  await expect(page.locator('.card')).toHaveCount(4);

  const counts = page.locator('.bars-count');

  // 默认：腾讯财经 + 上证指数 + 历史 K 线 300 根
  await expect(page.locator('label:has-text("数据源") select')).toHaveValue('tencent');
  await expect(page.locator('label:has-text("标的") select')).toHaveValue('sh000001');
  await expect(page.locator('label:has-text("历史 K 线") select')).toHaveValue('300');
  // 顶部不再显示状态徽章（数据源/标的/图表库数量标签已移除），改为断言侧边栏徽标
  await expect(page.locator('.sidebar-item').filter({ hasText: '多图对比' })).toBeVisible();

  // 初始加载：4 个 bars-count 都补满
  await expect
    .poll(async () => {
      const texts = await counts.allTextContents();
      return texts.length === 4 && texts.every((t) => parseInt(t, 10) >= MIN_BARS);
    })
    .toBe(true);
  expect(await page.locator('.card canvas').count()).toBeGreaterThanOrEqual(4);
  await expect(page.locator('.error-panel')).toHaveCount(0);

  // 搜索 A 股：输入「平安银行」，从下拉选中
  const searchInput = page.locator('.stock-search-input');
  await searchInput.fill('平安银行');
  await expect(page.locator('.search-dropdown li').first()).toBeVisible();
  await page.locator('.search-dropdown li button', { hasText: '平安银行' }).first().click();
  await expect(page.locator('label:has-text("标的") select')).toHaveValue('sz000001');
  await expect
    .poll(async () => {
      const texts = await counts.allTextContents();
      return texts.length === 4 && texts.every((t) => parseInt(t, 10) >= MIN_BARS);
    })
    .toBe(true);
  await expect(page.locator('.error-panel')).toHaveCount(0);

  // 切换周期 日线 -> 5m
  const periodSel = page.locator('label:has-text("周期") select');
  await periodSel.selectOption('5m');
  await expect(periodSel).toHaveValue('5m');
  await expect
    .poll(async () => {
      const texts = await counts.allTextContents();
      return texts.length === 4 && texts.every((t) => parseInt(t, 10) >= MIN_BARS);
    })
    .toBe(true);
  await expect(page.locator('.error-panel')).toHaveCount(0);

  // 切换到 Binance：标的应重置为 BTCUSDT
  const sourceSel = page.locator('label:has-text("数据源") select');
  await sourceSel.selectOption('binance');
  await expect(page.locator('label:has-text("标的") select')).toHaveValue('BTCUSDT');
  await expect
    .poll(async () => {
      const texts = await counts.allTextContents();
      return texts.length === 4 && texts.every((t) => parseInt(t, 10) >= MIN_BARS);
    })
    .toBe(true);
  await expect(page.locator('.error-panel')).toHaveCount(0);

  // 历史 K 线数量：切到 100 根 → 重拉取后 bars-count 恰好 ≤ 100；再切回 300 → 重新补满
  const limitSel = page.locator('label:has-text("历史 K 线") select');
  await limitSel.selectOption('100');
  await expect
    .poll(async () => {
      const texts = await counts.allTextContents();
      return (
        texts.length === 4 &&
        texts.every((t) => {
          const n = parseInt(t, 10);
          return n >= 90 && n <= 100; // 100 根 + 实时追加 1 根容差
        })
      );
    })
    .toBe(true);
  await expect(page.locator('.error-panel')).toHaveCount(0);

  await limitSel.selectOption('300');
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
