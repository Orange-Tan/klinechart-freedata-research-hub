# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
## 项目要求
文档的编写和问题回复都用中文回答
每次功能修改完成后都要进行测试并反馈测试结果
git commit 后默认不 push，push 到 GitHub 需用户明确指令

## 项目概览

K 线图开源库综合对比平台：同一份实时 K 线数据同时喂给 4 个图表库，横向对比渲染效果与交互差异；并内置 5 大市场免费数据源调研与一键连通性检测。

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

### 页面结构

`App` 是 220px 侧边栏 + 右侧内容区的布局，`src/pages/` 下三个页面按侧边栏按钮切换，**切换时另一页面卸载/重挂载**（Dashboard 回后台即停止 Binance 轮询，切回重新拉取）：

- `src/pages/Dashboard.tsx`：4 库同源实时对比看板（核心页面，数据拉取/订阅逻辑都在这里）
- `src/pages/ResearchReport.tsx`：图表库调研报告页（静态内容，样式在 `ResearchReport.css`）
- `src/pages/DataResearch.tsx`：数据调研页（数据源注册表 + 连通性检测，样式在 `DataResearch.css`）

### 数据流（单向）

```
App (src/App.tsx)  ── 侧边栏切页 ──►  Dashboard (src/pages/Dashboard.tsx)
 ├─ useFetchKlines effect  ──►  Binance REST /klines + 2s 轮询订阅
 ├─ setHistory(bars)  ──►  每个 <Comp> 收到 data={history}
 └─ LIBRARIES 注册表      （symbol / period / live 同源同步切给 4 库）
```

### 核心协议 `src/types/ohlcv.ts`

`OHLCV { time(ms), open, high, low, close, volume }` 是**全项目统一协议**：所有数据源适配器都返回它，所有图表库适配器都消费它。`KlinePeriod`、`KlineDataSource` 接口定义扩展点。

### 数据源层 `src/data/`

- `binance.ts`：`fetchKlines()` 拉历史；`subscribe()` 用 2s 轮询最新一根 K 线模拟实时（带 generation 竞态守卫丢弃过期响应）。
- `index.ts`：注册表 `dataSources`，新增数据源在此注册即出现在 UI 下拉框。

### 静态调研数据 `src/pages/dataResearchData.ts`

- 61 个数据源的完整注册表（id/name/url/market/role/score/tags/access/accessNote/history/realtime/types/limits/reason/checkUrl/checkNote）。
- **role 分布**：主源 13 / 备选 11 / 参考 22 / 排除 16；`isShown()`（DataResearch.tsx）过滤后表格展示可用且有实时行情的源。
- 名称列点击直达 `url`（官网/开源仓库）；`checkUrl` 供连通性检测（约 36 个可检测）。
- `checkSource()`（src/data/connectivity.ts）：fetch 直连 / script 注入（JSONP）双通道，dev 下经 Vite proxy 直连需代理的源。

### 图表适配层 `src/components/charts/`

4 个组件接口基本一致（`data` / `symbol` / `period` / `live`），但各自的接入方式差异很大，是踩坑最多的地方：

| 库 | 数据接入方式 | 已知陷阱 |
|---|---|---|
| **LightweightChart** | `setData` 全量 / `update()` 增量（按 `lastTimeRef` 判断整体替换或逐根追加） | 时间戳须毫秒→秒（`UTCTimestamp`），否则日期漂到 57647 年；增量起点找不到（竞态/整体重置）要退化全量 |
| **KLineChart** | v10 无公共增量接口，一切走 `setDataLoader`：`getBars('init')` 全量投喂，实时增量经 `subscribeBar` 回调（内部 `_addData('update')` 自动追加/替换） | DataLoader 必须**只注册一次**；`createIndicator` 每次调用都新增副图 pane 不去重，必须用 ref 防重，否则轮询会累积多个 VOL 窗口把主图挤成 0 高 |
| **HQChart** | `NetworkFilter` 拦截内置 HTTP 请求（RequestHistoryData / ReqeustHistoryMinuteData），`PreventDefault` 后回调注入数据；实时用 `ManualUpdateKData` 推送 | `ChartDestroy()` 只清内部实例**不清理 DOM**；开发态 StrictMode 双挂载会叠出第二个实例画到容器外，mount effect cleanup 必须移除库生成的 `.jschart-drawing*` / `.jschart-tooltip` / `.UMyChart_*` 节点；`ManualUpdateKData` 要传 `DataOffset`；NetworkFilter 里对流股本（RequestFlowCapitalData）置 PreventDefault，否则库内兜底请求 127.0.0.1:8080 产生 console error |
| **EChartsChart** | `setOption` 全量（`notMerge` 时替换）；增量靠 setOption 默认 merge 语义逐系列更新 | `XAXisOption` 等类型只能从 `echarts/types/dist/shared` 导入（type-only 不产生运行时代码，不影响按需打包）；category 轴增量时 data 要跟着推进 |

### 状态管理（src/pages/Dashboard.tsx）

- `HISTORY_LIMIT = 300`：拉取 300 根，订阅回调里超出就裁剪最老一根，保持列表稳定。
- symbol/period 切换：effect 先 `setHistory([])` 再重新拉取 → 各图表组件会先看到空数据，再收到新数据。KLineChart/HQChart 依赖这一时序，用 ref 持有最新数据供异步回调读取（**不能用闭包捕获，否则拿到过期值**）。
- 四个组件都会在 `data[last].time` 倒退或首次加载时做全量重设，据此判断整体替换 vs 增量追加。

## 测试

- `tests/dashboard.spec.ts`：看板冒烟测试，断言 4 个 `.card`、4 个 `.bars-count` ≥ 250、切换交易对/周期后同步刷新、无 `.error-panel`、无 console error/pageerror。
- `tests/datareport.spec.ts`：数据调研页冒烟测试，断言 5 大品种区块、行内角色徽标、一键检测后所有 `.st` 离开 idle/checking、无 pageerror。**只跑单个文件：`npx playwright test tests/datareport.spec.ts`**。
- `MIN_BARS = 250`（拉 300 根 + 实时可能追加 1 根，留容差）。
- 测试失败常见原因：某个库的适配又触发了"多实例/多 pane"类问题，检查 canvas 数量、`.bars-count` 文本，用探针脚本逐个卡片查。

## 静态调研页（报告页/数据页）

- `ResearchReport.tsx` 与 `DataResearch.tsx` 都是**纯静态数据驱动**，改动只影响展示不影响数据流，无需 dev server 之外的依赖；改完用 `tsc` + 对应冒烟测试验证即可。
- `docs/免费行情数据源调研报告.md` / `docs/图表库调研报告.md` 与页面**数据同源**：改数据调研相关先看前者，改图表调研相关先看后者；页面与文档保持一致（改一处需同步另一处）。

## 已有坑位速查（改到这些文件务必回归验证）

> 完整版见 `docs/金融图表项目踩坑速查.md`（四层：数据源接入 / 图表库适配 / React 工程 / 测试调试，
> 含可直接复用的代码模式与起步清单）。这里是最常用 7 条：

1. **React `<StrictMode>` 开发态会双跑 mount effect**：任何图表库初始化如果 cleanup 不彻底，会叠出第二个实例。轻量方案是 cleanup 里清理库生成的全部 DOM 子节点（HQChart 就是这么修的）。
2. **klinecharts v10 没有 `applyNewData`/`updateData`**：别去找公共增量接口，只能用 `setDataLoader`。
3. **HQChart `ManualUpdateKData` 必须显式传 `DataOffset`**，否则 `newDataCount` 恒为 0，视图冻结在最旧一侧。
4. **各库周期常量不一致**：HQChart 的 Period 是 0/4/5/6/8/12（日/1m/5m/15m/1h/4h），需要映射；其它库周期直接透传。
5. **ECharts type-only 导入**：`XAXisOption` 等类型只能从 `echarts/types/dist/shared` 导入（type-only 不产生运行时代码，不影响按需打包）。
6. **lightweight-charts 时间戳单位**：`UTCTimestamp` 是秒，而 OHLCV.time 是毫秒，`toCandle`/`toVolume` 必须 `/1000` 转换。
7. **lightweight-charts attribution 开关**：`layout.attributionLogo: false` 去掉了左下角 TradingView logo（已按库 NOTICE 在代码注释保留声明）。

## 文档

- `docs/金融图表项目踩坑速查.md`：**新项目/新需求起步先读**。数据源接入 / 图表库适配 / React 工程 / 测试调试四层踩坑全记录 + 可直接复用的代码模式 + 给更大项目的起步清单。
- `docs/图表库调研报告.md`：选型调研报告（stars/协议/维护状态、四大库优劣势），涉及选型决策时先看它。
- `src/pages/ResearchReport.tsx`：同一调研报告的页面化版本（数据与文档保持一致，改一处需同步另一处）。
- `docs/免费行情数据源调研报告.md`：A股/美股/加密货币/期货/基金五大类免费数据源调研（推荐序/实测现状/CORS 分析/各市场接入建议），涉及给 `src/data/` 新增数据源前先看它。
- `README.md`：页面说明、目录结构、快速开始（含测试前置说明）。
