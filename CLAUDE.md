# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

K 线图开源库综合对比平台：同一份实时 K 线数据同时喂给 4 个图表库，横向对比渲染效果与交互差异。

- Vite + React 19 + TypeScript（严格模式），开发端口 5173
- 首批 4 库：Lightweight-Charts、KLineChart (klinecharts v10)、HQChart、ECharts
- 数据源：Binance 公开 API（无 key），全部代码在 `src/data/`

## 常用命令

```bash
npm run dev        # 启动 Vite dev server（http://localhost:5173）
npm run build      # tsc -b && vite build
npm run preview    # 预览构建产物
npx tsc -p tsconfig.app.json --noEmit   # 类型检查（无需编译的快速检查）
npx playwright test                     # 跑全部 Playwright 测试
```

Playwright 冒烟测试前置要求 dev server 已在 5173 运行：

```bash
npm run dev &                        # 终端 1
npx playwright test                  # 终端 2
```

调试技巧：写一次性探针脚本放 `tests/probe-*.mjs`，用 `npx tsx tests/probe-*.mjs` 直接跑（可打开页面、读 canvas 像素、查 DOM），用完即删。

## 架构

数据流是单向的：数据源 → App 统一拉取 → 4 个图表适配组件各用自己的 API 消费。

```
App (src/App.tsx)
 ├─ useFetchKlines effect  ──►  Binance REST /klines + 2s 轮询订阅
 ├─ setHistory(bars)  ──►  每个 <Comp> 收到 data={history}
 └─ LIBRARIES 注册表      （symbol / period / live 同源同步切给 4 库）
```

### 核心协议 `src/types/ohlcv.ts`

`OHLCV { time(ms), open, high, low, close, volume }` 是**全项目统一协议**：所有数据源适配器都返回它，所有图表库适配器都消费它。`KlinePeriod`、`KlineDataSource` 接口定义扩展点。

### 数据源层 `src/data/`

- `binance.ts`：`fetchKlines()` 拉历史；`subscribe()` 用 2s 轮询最新一根 K 线模拟实时（带 generation 竞态守卫丢弃过期响应）。
- `index.ts`：注册表 `dataSources`，新增数据源在此注册即出现在 UI 下拉框。

### 图表适配层 `src/components/charts/`

4 个组件接口基本一致（`data` / `symbol` / `period` / `live`），但各自的接入方式差异很大，是踩坑最多的地方：

| 库 | 数据接入方式 | 已知陷阱 |
|---|---|---|
| **LightweightChart** | `setData` 全量 / `update()` 增量（按 `lastTimeRef` 判断整体替换或逐根追加） | 无 |
| **KLineChart** | v10 无公共增量接口，一切走 `setDataLoader`：`getBars('init')` 全量投喂，实时增量经 `subscribeBar` 回调（内部 `_addData('update')` 自动追加/替换） | DataLoader 必须**只注册一次**；`createIndicator` 每次调用都新增副图 pane 不去重，必须用 ref 防重，否则轮询会累积多个 VOL 窗口把主图挤成 0 高 |
| **HQChart** | `NetworkFilter` 拦截内置 HTTP 请求（RequestHistoryData / ReqeustHistoryMinuteData），`PreventDefault` 后回调注入数据；实时用 `ManualUpdateKData` 推送 | `ChartDestroy()` 只清内部实例**不清理 DOM**；开发态 StrictMode 双挂载会叠出第二个实例画到容器外，mount effect cleanup 必须移除库生成的 `.jschart-drawing*` / `.jschart-tooltip` / `.UMyChart_*` 节点 |
| **EChartsChart** | `setOption` 全量（`notMerge` 时替换）；增量靠 setOption 默认 merge 语义逐系列更新 | 无 |

### 状态管理（src/App.tsx）

- `HISTORY_LIMIT = 300`：拉取 300 根，订阅回调里超出就裁剪最老一根，保持列表稳定。
- symbol/period 切换：effect 先 `setHistory([])` 再重新拉取 → 各图表组件会先看到空数据，再收到新数据。KLineChart/HQChart 依赖这一时序，用 ref 持有最新数据供异步回调读取（**不能用闭包捕获，否则拿到过期值**）。
- 四个组件都会在 `data[last].time` 倒退或首次加载时做全量重设，据此判断整体替换 vs 增量追加。

## 测试

- `tests/dashboard.spec.ts`：单文件冒烟测试，断言 4 个 `.card`、4 个 `.bars-count` ≥ 250、切换交易对/周期后同步刷新、无 `.error-panel`、无 console error/pageerror。
- `MIN_BARS = 250`（拉 300 根 + 实时可能追加 1 根，留容差）。
- 测试失败常见原因：某个库的适配又触发了"多实例/多 pane"类问题，检查 canvas 数量、`.bars-count` 文本，用探针脚本逐个卡片查。

## 已有坑位速查（改到这些文件务必回归验证）

1. **React `<StrictMode>` 开发态会双跑 mount effect**：任何图表库初始化如果 cleanup 不彻底，会叠出第二个实例。轻量方案是 cleanup 里清理库生成的全部 DOM 子节点（HQChart 就是这么修的）。
2. **klinecharts v10 没有 `applyNewData`/`updateData`**：别去找公共增量接口，只能用 `setDataLoader`。
3. **HQChart `ManualUpdateKData` 必须显式传 `DataOffset`**，否则 `newDataCount` 恒为 0，视图冻结在最旧一侧。
4. **各库周期常量不一致**：HQChart 的 Period 是 0/4/5/6/8/12（日/1m/5m/15m/1h/4h），需要映射；其它库周期直接透传。
5. **ECharts type-only 导入**：`XAXisOption` 等类型只能从 `echarts/types/dist/shared` 导入（type-only 不产生运行时代码，不影响按需打包）。

## 文档

- `docs/图表库调研报告.md`：选型调研报告（stars/协议/维护状态、四大库优劣势），涉及选型决策时先看它。
