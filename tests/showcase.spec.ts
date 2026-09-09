import { test, expect } from '@playwright/test';

/**
 * 单库详解页冒烟测试：
 *  - 侧边栏两个新页面「轻量库详情 / K线库详情」可切换
 *  - 两页各自渲染 640px 大图（chart-container 出现 canvas）且 bars-count 补满 MIN_BARS
 *  - 大图功能开关可切换，图表不报错
 *  - 页下文档渲染（lw-docs / kc-docs）
 *  - 全程无 .error-panel、无 console error / pageerror
 *
 * 前置：dev server 已在 http://localhost:5173 运行（npm run dev）。
 */
const MIN_BARS = 60;

test('两个单库详页渲染：大图 + 全量文档 + 功能开关', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  // —— 轻量库详情页 ——
  await page.goto('/');
  await page.locator('.sidebar-item', { hasText: '轻量库详情' }).click();
  await expect(page.locator('h1', { hasText: 'Lightweight-Charts 详解' })).toBeVisible();

  const lwCount = page.locator('.lw-stage .bars-count');
  await expect
    .poll(async () => {
      const t = await lwCount.textContent();
      return t !== null && parseInt(t, 10) >= MIN_BARS;
    })
    .toBe(true);
  await expect(page.locator('.lw-stage .chart-container canvas').first()).toBeVisible();
  await expect(page.locator('.lw-docs-title', { hasText: 'Lightweight-Charts 库详解' })).toBeVisible();
  // 文档分节齐全
  for (const title of ['核心对象模型', '时间与数据', '五种内置序列类型', '多面板与价格刻度', '指标与数据计算', '插件体系', '价格线', '常用配置']) {
    await expect(page.locator('.lw-doc-section h3', { hasText: title })).toBeVisible();
  }

  // 功能开关逐个关闭再打开，全程不应报错
  for (const label of ['指标线', '序列类型', '买卖标记', '水印', '趋势线', '价格线', '多面板']) {
    const toggle = page.locator('.lw-toggle', { hasText: label }).locator('input');
    await toggle.uncheck();
    await toggle.check();
  }
  await expect(page.locator('.error-panel')).toHaveCount(0);

  // —— K线库详情页 ——
  await page.locator('.sidebar-item', { hasText: 'K线库详情' }).click();
  await expect(page.locator('h1', { hasText: 'klinecharts 详解' })).toBeVisible();

  const kcCount = page.locator('.kc-stage .bars-count');
  await expect
    .poll(async () => {
      const t = await kcCount.textContent();
      return t !== null && parseInt(t, 10) >= MIN_BARS;
    })
    .toBe(true);
  await expect(page.locator('.kc-stage .chart-container canvas').first()).toBeVisible();
  await expect(page.locator('.kc-docs h2', { hasText: 'klinecharts 库详解' })).toBeVisible();
  // 文档分节齐全
  for (const title of ['库是什么', '核心 API', '副图与指标', '画线工具', '交互与状态条', '与 lightweight-charts 的对比']) {
    await expect(page.locator('.kc-docs .report-section h3', { hasText: title })).toBeVisible();
  }

  await expect(page.locator('.error-panel')).toHaveCount(0);
  await page.screenshot({ path: 'tests/screenshots/showcase-pages.png', fullPage: true });

  expect(consoleErrors).toEqual([]);
});
