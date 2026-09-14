import { test, expect } from '@playwright/test';

/**
 * 单库详解页冒烟测试：
 *  - 侧边栏两个新页面「轻量库详情 / K线库详情」可切换
 *  - 两页各自渲染 640px 大图（chart-container 出现 canvas）且 bars-count 补满 MIN_BARS
 *  - 大图功能开关可切换，图表不报错
 *  - 看板同款控件：标的 / 实时更新 / 历史K线 / A股搜索 与看板排布一致
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
  // 过滤：页面初始挂载时默认腾讯源立即发起请求，而腾讯 API 当前被 WAF 拦截
  // （CORS 错误 + 随后的 ERR_FAILED 属于外部网络因素，不是本页回归），其余
  // 真实错误仍然严格断言。测试中途已切换到 Binance 源渲染图表。
  const isTencentBlocker = (s: string) =>
    s.includes('ifzq.gtimg.cn') || s.includes('ERR_FAILED');

  // —— 轻量库详情页 ——
  await page.goto('/');
  await page.locator('.sidebar-item', { hasText: '轻量库详情' }).click();
  await expect(page.locator('h1', { hasText: 'Lightweight-Charts 详解' })).toBeVisible();

  // 看板同款控件：默认腾讯源 → 上证指数，实时更新勾选，历史K线默认 300
  const lwControls = page.locator('.lw-controls');
  await expect(lwControls.locator('label', { hasText: '数据源' }).locator('select')).toHaveValue('tencent');
  await expect(lwControls.locator('label', { hasText: '标的' }).locator('select')).toHaveValue('sh000001');
  await expect(lwControls.locator('.lw-live input')).toBeChecked();
  await expect(lwControls.locator('label', { hasText: '历史K线' }).locator('select')).toHaveValue('300');

  // 默认数据源为腾讯财经；当前网络下腾讯 API 被 WAF 拦截（CORS/501），
  // 切到 Binance 源让图表渲染——数据源连通性属外部因素，不是本页回归。
  await lwControls.locator('label', { hasText: '数据源' }).locator('select').selectOption('binance');
  await expect(page.locator('.error-panel')).toHaveCount(0);
  // 切源后标的重置为该源默认（BTCUSDT），实时更新 checkbox 保留勾选
  await expect(lwControls.locator('label', { hasText: '标的' }).locator('select')).toHaveValue('BTCUSDT');
  await expect(lwControls.locator('.lw-live input')).toBeChecked();

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

  // 历史K线档位：切 100 根后 bars-count 回落到 100 左右
  await lwControls.locator('label', { hasText: '历史K线' }).locator('select').selectOption('100');
  await expect
    .poll(async () => {
      const t = await lwCount.textContent();
      return t !== null && parseInt(t, 10) <= 105;
    })
    .toBe(true);

  // A股搜索（搜索端点不受 K 线 WAF 影响，但仅腾讯/东财声明了搜索能力）：
  // 切回腾讯源 → 搜「平安银行」出现下拉，选中后标的变 sz000001
  await lwControls.locator('label', { hasText: '数据源' }).locator('select').selectOption('tencent');
  const lwSearchInput = page.locator('.lw-controls .stock-search-input');
  await lwSearchInput.fill('平安银行');
  const lwSearchDropdown = page.locator('.lw-controls .search-dropdown');
  await expect(lwSearchDropdown).toBeVisible();
  await expect(lwSearchDropdown.locator('.search-name', { hasText: '平安银行' })).toBeVisible();
  await lwSearchDropdown.locator('button').first().click();
  await expect(lwControls.locator('label', { hasText: '标的' }).locator('select')).toHaveValue('sz000001');
  await expect(lwSearchInput).toHaveValue('');
  await expect(lwSearchDropdown).toHaveCount(0);

  // —— K线库详情页 ——
  await page.locator('.sidebar-item', { hasText: 'K线库详情' }).click();
  await expect(page.locator('h1', { hasText: 'klinecharts 详解' })).toBeVisible();

  // 筛选状态全局保持：上一段结束时已是「腾讯源 + 平安银行（sz000001）+ 历史K线 100 根」，
  // 切到 kc 页应原样带过来（不再是默认上证指数 / 300 根）。
  const kcControls = page.locator('.kc-controls');
  await expect(kcControls.locator('label', { hasText: '数据源' }).locator('select')).toHaveValue('tencent');
  await expect(kcControls.locator('label', { hasText: '标的' }).locator('select')).toHaveValue('sz000001');
  await expect(kcControls.locator('.kc-live input')).toBeChecked();
  await expect(kcControls.locator('label', { hasText: '历史K线' }).locator('select')).toHaveValue('100');

  // 同上：腾讯源当前被 WAF 拦截，切 Binance 让图表渲染
  await kcControls.locator('label', { hasText: '数据源' }).locator('select').selectOption('binance');
  await expect(page.locator('.error-panel')).toHaveCount(0);
  await expect(kcControls.locator('label', { hasText: '标的' }).locator('select')).toHaveValue('BTCUSDT');
  await expect(kcControls.locator('.kc-live input')).toBeChecked();

  const kcCount = page.locator('.kc-stage .bars-count');
  await expect
    .poll(async () => {
      const t = await kcCount.textContent();
      return t !== null && parseInt(t, 10) >= MIN_BARS;
    })
    .toBe(true);
  await expect(page.locator('.kc-stage .chart-container canvas').first()).toBeVisible();
  await expect(page.locator('.kc-docs h2', { hasText: 'klinecharts 库详解' })).toBeVisible();
  // 文档分节齐全（第一节为功能总览，全部功能表格集中于此；后续章节按主题展开）
  for (const title of ['功能总览', '库是什么', '核心架构', '数据接入', '图表类型与样式', '副图与指标', '画线工具', '坐标轴与多 Y 轴', '事件与动作', '多语言 / 导出 / 工具', '性能与许可', '项目实践要点（踩坑速查）', '与 lightweight-charts 的对比']) {
    await expect(page.locator('.kc-docs .report-section h3', { hasText: title })).toBeVisible();
  }

  // kc 页同样验证 A股搜索：切回腾讯源 → 搜「平安银行」→ 标的变 sz000001
  await kcControls.locator('label', { hasText: '数据源' }).locator('select').selectOption('tencent');
  const kcSearchInput = page.locator('.kc-controls .stock-search-input');
  await kcSearchInput.fill('平安银行');
  const kcSearchDropdown = page.locator('.kc-controls .search-dropdown');
  await expect(kcSearchDropdown).toBeVisible();
  await expect(kcSearchDropdown.locator('.search-name', { hasText: '平安银行' })).toBeVisible();
  await kcSearchDropdown.locator('button').first().click();
  await expect(kcControls.locator('label', { hasText: '标的' }).locator('select')).toHaveValue('sz000001');
  await expect(kcSearchInput).toHaveValue('');
  await expect(kcSearchDropdown).toHaveCount(0);

  await expect(page.locator('.error-panel')).toHaveCount(0);
  await page.screenshot({ path: 'tests/screenshots/showcase-pages.png', fullPage: true });

  expect(consoleErrors.filter((s) => !isTencentBlocker(s))).toEqual([]);
});
