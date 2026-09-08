import { test, expect } from '@playwright/test';

/**
 * 数据调研页冒烟测试：
 *  - 侧边栏出现 3 个页面项，点「数据调研」进入新页
 *  - 5 大品种区块渲染，数据源行数符合注册表
 *  - 使用条件徽标（直连/需外网/需代理/需Key…）与综合评分渲染
 *  - 一键检测后状态徽标离开 idle（连通/失败/不可直连都算结果），且无 pageerror
 *
 * 前置：dev server 已在 http://localhost:5173 运行（npm run dev）。
 */
test('数据调研页渲染 + 一键检测连通性', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto('/');

  // 1. 侧边栏 3 项
  const items = page.locator('.sidebar-item');
  await expect(items).toHaveCount(3);
  await expect(items.nth(2)).toContainText('数据调研');

  // 2. 进入数据调研页
  await items.nth(2).click();
  await expect(page.locator('.report-header h1')).toHaveText('数据源调研');

  // 3. 5 大品种区块
  const sections = page.locator('.dresearch-section');
  await expect(sections).toHaveCount(5);
  const titles = await sections.locator('h2').allTextContents();
  for (const t of titles) {
    expect(t).toMatch(/市场/);
  }

  // 4. 表头与数据源行：各区块至少 1 行，且行内出现角色徽标与序号
  for (const section of await sections.all()) {
    const rows = section.locator('tbody tr');
    const n = await rows.count();
    expect(n).toBeGreaterThanOrEqual(1);
    await expect(rows.first().locator('.dresearch-no')).toBeVisible();
    await expect(rows.first().locator('.dresearch-role')).toBeVisible();
  }

  // 5. 使用条件徽标样例（A股东财直连 + 加密货币 OKX 需外网/直连）
  const eastmoneyRow = page.locator('tbody tr', { hasText: '东方财富' });
  await expect(eastmoneyRow.locator('.ab-direct')).toHaveCount(1);
  const okxRow = page.locator('tbody tr', { hasText: 'OKX' });
  await expect(okxRow.locator('.ab-vpn')).toHaveCount(1);

  // 6. 一键检测：全部源结束检测（idle 清零 → checking 清零）。
  //    单源 fetch 超时 8s，25 个源并发，轮询窗口给足 30s。
  await page.locator('.dresearch-runall').click();
  await expect(page.locator('.st.checking').first()).toBeVisible();
  await expect
    .poll(
      async () => {
        const idle = await page.locator('.st.idle').count();
        return idle === 0;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  await expect
    .poll(
      async () => {
        const checking = await page.locator('.st.checking').count();
        return checking === 0;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  const done = await page.locator('.st:not(.checking)').count();
  expect(done).toBeGreaterThanOrEqual(1);

  // 7. 检测结束后按钮恢复可用
  await expect(page.locator('.check-btn').first()).toBeEnabled();

  await page.screenshot({ path: 'tests/screenshots/datareport-after-check.png', fullPage: true });

  expect(pageErrors).toEqual([]);
});
