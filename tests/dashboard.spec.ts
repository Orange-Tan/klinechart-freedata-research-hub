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

  // 周期下拉选项按数据源动态生成：腾讯原生支持 1m/5m/15m/1h/1d（4h=m240 实测 param error，不暴露）
  const tencentPeriodOptions = await page
    .locator('label:has-text("周期") select option')
    .allTextContents();
  expect(tencentPeriodOptions).toEqual(['1 分钟', '5 分钟', '15 分钟', '1 小时', '日线']);

  // 搜索 A 股：输入「平安银行」，从下拉选中。
  // 注：A 股搜索走双 JSONP（aShareSearch：东财首选 + 腾讯兜底），若东财
  // 偶发不发请求/挂起，需等腾讯兜底（≤4s）；下拉就绪后等目标行出现再点。
  const searchInput = page.locator('.stock-search-input');
  await searchInput.fill('平安银行');
  const targetRow = page.locator('.search-dropdown li button', { hasText: '平安银行' }).first();
  await expect(targetRow).toBeVisible({ timeout: 15_000 });
  await targetRow.click();
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

  // 切换到 Binance：标的应重置为 BTCUSDT；周期下拉选项随源变化
  const sourceSel = page.locator('label:has-text("数据源") select');
  await sourceSel.selectOption('binance');
  await expect(page.locator('label:has-text("标的") select')).toHaveValue('BTCUSDT');
  // 腾讯/东财（均无 4h 选项）切到 Binance 后，周期下拉应包含 4h（Binance 原生支持）
  const periodSelB = page.locator('label:has-text("周期") select');
  const periodOptions = await periodSelB.locator('option').allTextContents();
  expect(periodOptions).toContain('4 小时');
  await periodSelB.selectOption('4h');
  await expect(periodSelB).toHaveValue('4h');
  await expect
    .poll(async () => {
      const texts = await counts.allTextContents();
      return texts.length === 4 && texts.every((t) => parseInt(t, 10) >= MIN_BARS);
    })
    .toBe(true);
  await expect(page.locator('.error-panel')).toHaveCount(0);

  // 切换到东财：东财无 4h 周期，当前 4h 应自动回退为 1m（其首个支持周期），
  // 且周期下拉不再含 4h。
  // 注：先拦截东财请求挂起（东财当前网络本就被 TLS 阻断），避免 fetch 失败
  // 触发全屏 error-panel 替换掉图表网格，导致下面的异常提醒无法断言。
  await page.route('**/push2his.eastmoney.com/**', () => new Promise(() => {}));
  await sourceSel.selectOption('eastmoney');
  const periodSelEM = page.locator('label:has-text("周期") select');
  await expect(periodSelEM).toHaveValue('1m');
  const emOptions = await periodSelEM.locator('option').allTextContents();
  expect(emOptions).not.toContain('4 小时');
  expect(emOptions).toEqual(['1 分钟', '5 分钟', '15 分钟', '1 小时', '日线']);

  // 异常路径：用原生 change 事件把周期置为东财不支持的 4h（绕过下拉限制），
  // 模拟"选择了不受支持周期、图表加载异常" → 4 张卡片顶部应出现文字提醒
  await periodSelEM.evaluate((sel) => {
    const proto = Object.getPrototypeOf(sel) as HTMLSelectElement;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter?.call(sel, '4h');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const warns = page.locator('.chart-warn');
  await expect(warns).toHaveCount(4);
  // 提醒文案里的周期标签随期下拉的 value 同步；注入式 4h 因不受 React
  // 受控组件约束，周期标签为空 → 只断言「图表无法加载」这类关键文案
  await expect(warns.first()).toContainText('图表无法加载');
  // 提醒条应带出当前周期标识（可能为空串），并出现在图表卡片顶部
  await page.locator('.chart-warn-btn').first().click();
  await expect(periodSelEM).toHaveValue('1m');
  await expect(warns).toHaveCount(0);
  await page.unroute('**/push2his.eastmoney.com/**');

  // 切回 Binance 恢复数据流（腾讯/东财仅验证周期能力，不断言其数据加载；
  // 腾讯在 CI/断网环境下偶发瞬时不可达，全部走原始请求）
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

  // 全程不得出现数据源错误面板或前端报错。
  // 注：东财当前网络被 TLS 阻断，上面第 102 行用 route 挂起其请求、第 127 行
  // unroute 后浏览器会对这些请求打 6 条 net::ERR_EMPTY_RESPONSE（网络层错误，
  // 非前端 bug，测试唯一信息性失败就来自它）——因此这里过滤掉这种纯网络错误，
  // 只断言真正的前端 console error / pageerror。
  const realErrors = consoleErrors.filter(
    (e) => !/Failed to load resource: net::ERR_EMPTY_RESPONSE/.test(e),
  );
  expect(realErrors).toEqual([]);
});
