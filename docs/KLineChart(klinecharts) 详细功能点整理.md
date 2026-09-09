# KLineChart（klinecharts）开源库详细信息整理

> 本文档基于项目实际安装的 **`klinecharts@10.0.3`**（KLineChart，Apache-2.0 协议，零运行时依赖），内容来自其 `dist/index.d.ts` 类型声明与 `dist/index.esm.js` 源码，重点覆盖全部功能点。

---

## 一、基本信息

| 项目 | 内容 |
|---|---|
| 全名 | KLineChart（klinecharts） |
| 当前版本 | 10.0.3（本项目安装） |
| 作者 | lihu（李虎） |
| 协议 | Apache-2.0 |
| 技术栈 | HTML5 Canvas 渲染，**零运行时依赖**（无第三方依赖树） |
| 仓库 | https://github.com/klinecharts/KLineChart |
| 官网 | https://www.klinecharts.com |
| 打包产物 | `dist/index.esm.js`（674KB，ESM）、`dist/index.umd.min.js`（UMD）、`dist/index.d.ts`（1287 行类型声明） |

**定位**：面向专业行情终端的 K 线图库，原生内置 **27 个技术指标、16 个画线工具（Overlay）、6 种基础图元（Figure）**，支持自定义指标/画线/图元/快捷键/多语言/多主题，属于"开箱即用、功能完备"型图表库（与 lightweight-charts 的"极简嵌入式"路线形成对比）。

---

## 二、核心架构

### 2.1 顶层 API 划分

```
init(ds, options?) ──► Chart（继承 Store，一个实例 = 一个图表）
   ├─ createIndicator()  ──► 指标（副图 pane）
   ├─ createOverlay()     ──► 画线工具（叠加在主图上）
   ├─ createYAxis()       ──► 多价格轴
   ├─ subscribeAction()   ──► 动作事件订阅
   └─ getConvertPictureUrl() ──► 导出图片
```

### 2.2 注册体系（4 大扩展注册器）

| 注册器 | 注册内容 | 数量（内置） |
|---|---|---|
| `registerIndicator` | 技术指标 | 27 |
| `registerOverlay` | 画线工具 | 16 |
| `registerFigure` | 基础图元 | 6 |
| `registerHotkey` | 快捷键 | 4 |
| `registerLocale` | 多语言 | 2 |
| `registerStyles` | 命名主题 | 2 |

### 2.3 图表内部组件

- **pane（窗格）**：主图 + 每个指标各占一个 pane，支持拖拽调高、最大化/最小化
- **xAxis（时间轴）** / **yAxis（价格轴）**：可通过 `registerXAxis` / `registerYAxis` 完全自定义
- 三者均继承自 **Store**：`Chart extends Store`，Store 提供数据加载、样式、滚动缩放、事件等全部基础能力

> 与 lightweight-charts 对比：LightweightCharts 是"Series（系列）+ Primitive（插件）"模型，指标/画线全靠自己写；klinecharts 是"Indicator + Overlay + Figure"三层注册模型，常用功能全部内置。

---

## 三、数据接入功能点

### 3.1 数据模型（`KLineData`）

```ts
interface KLineData {
  timestamp: number; // 时间戳（毫秒，注意与 lightweight-charts 的秒不同！）
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover?: number;  // 可选，成交额
}
```

**关键差异**：本项目 OHLCV 协议的 `time(ms)` 需映射为 `timestamp`，**单位同为毫秒，无需换算**（对比 lightweight-charts 要 `/1000`）。

### 3.2 数据写入 API —— v10 只有 `setDataLoader`

> ⚠️ **v10 没有 `applyNewData` / `updateData` 公共增量接口**（v9 及以前有），一切数据流走 DataLoader 协议（见 CLAUDE.md 坑位 2）。

```ts
chart.setDataLoader({
  getBars({ type, timestamp, symbol, period, callback }) {
    // type: 'init' | 'forward' | 'backward' | 'update'
    // timestamp: 本次请求锚点时间戳
    // callback(data: KLineData[], more?: boolean)
  },
  subscribeBar?,  // 可选：订阅实时增量
  unsubscribeBar? // 可选：取消订阅
})
```

| DataLoadType | 触发时机 | 返回语义 |
|---|---|---|
| `init` | 首次/重置数据 | 返回初始数据（起点之前留历史余量，`more` 表示是否有更早数据） |
| `backward` | 向左滚动到边缘 | 加载更早历史，`more` 是否还有更多 |
| `forward` | 向右滚动到边缘 | 加载更新数据（如有） |
| `update` | 实时行情轮询 | 返回最新一根（内部自动追加/替换最后一根） |

**实时增量**：`subscribeBar` 回调里返回 `{ type: 'update', timestamp, symbol, period, callback }` 结构的新 bar，库内部 `_addData('update')` 自动追加或替换。

### 3.3 其它数据方法（Store）

- `setSymbol(symbol)` / `setPeriod(period)` / `getSymbol()` / `getPeriod()`
- `getDataList()`：当前全部 K 线数据
- `resetData()`：清空数据并触发 `init` 重载
- `setDataLoader(loader)`：注册 DataLoader（**只注册一次**，见 CLAUDE.md 坑位 1/2）

### 3.4 周期类型（`Period`）

```ts
interface Period {
  type: 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
  span: number;
}
// 例：{ type: 'minute', span: 5 } = 5 分钟线
```

> ⚠️ 与 HQChart 的 0/4/5/6/8/12 周期常量不同（见 CLAUDE.md 坑位 4），klinecharts 用对象结构，本项目直接透传映射即可。

---

## 四、图表类型（CandleType，6 种）

`setStyles` 的 `candle.type` 决定主图绘制方式：

| CandleType | 说明 |
|---|---|
| `candle_solid` | 实心 K 线（涨绿跌红，默认） |
| `candle_stroke` | 空心 K 线（仅边框色） |
| `candle_up_stroke` | 上涨空心 / 下跌实心 |
| `candle_down_stroke` | 上涨实心 / 下跌空心 |
| `ohlc` | OHLC 柱状线 |
| `area` | 面积图（主图面积走势） |

### 4.1 K 线样式（`CandleStyle`）

| 配置 | 默认值 | 说明 |
|---|---|---|
| `type` | `candle_solid` | 上述 6 种 |
| `bar` | — | `{ upColor, downColor, upBorderColor, downBorderColor, upWickColor, downWickColor, noChangeColor, noChangeBorderColor }` |
| `priceMark` | — | 最新价标记：`{ high/low/close 的颜色、文字大小、虚线（[4,2]）}` |
| `tooltip` | — | 十字光标提示：`{ showRule: 'always'/'on_cross'/'follow_cross'/'none', showType: 'standard'/'rect', custom, labels, text }`，默认标题模板 `'{ticker} · {period}'` |
| `compareRule` | `current_open` | 涨跌判定：`current_open`（与当前开比较）/ `previous_close`（与昨收比较） |
| `legend` | 默认 8 字段 | 左上角图例模板 `[{time}{open}{high}{low}{close}{volume}{turnover}{change}]` |
| `watermark` | — | 水印文字/颜色/大小/透明度 |

> **涨跌配色（中国惯例）**：内置 `Color` 常量 `GREEN: '#2DC08E'`（涨）、`RED: '#F92855'`（跌）、`WHITE`、`GREY: '#76808F'`、`BLUE: '#1677FF'`。涨绿跌红与 TradingView 默认相反。

---

## 五、内置指标（Indicator，27 个）

### 5.1 内置指标清单

`series` 类型：`price`（叠加主图，不占副图）/ `volume`（成交量类）/ `normal`（副图指标，默认）。

| 指标 | series | 默认参数 | 说明 |
|---|---|---|---|
| MA | price | `[5,10,30,60]` | 均线组（4 条线） |
| EMA | price | `[6,12,20]` | 指数均线 |
| SMA | price | `[12,2]` | 简单均线（`alpha` 可调） |
| BOLL | price | `[20,2]` | 布林带 |
| VOL | volume | `[5,10,20]` | 成交量 |
| MACD | normal | `[12,26,9]` | 快慢线 + 零轴柱（默认涨绿跌红） |
| KDJ | normal | `[9,3,3]` | 随机指标 |
| RSI | normal | `[6,12,24]` | 相对强弱 |
| BIAS | normal | `[6,12,24]` | 乖离率 |
| BRAR | normal | `[26]` | 情绪指标 |
| CCI | normal | `[20]` | 顺势指标 |
| DMA | normal | `[10,50,10]` | 平均线差 |
| DMI | normal | `[14,6]` | 趋向指标 |
| CR | normal | `[26,10,20,40,60]` | 能量指标 |
| PSY | normal | `[12,6]` | 心理线 |
| OBV | normal | `[30]` | 能量潮 |
| SAR | price | `[2,2,20]` | 停损点（抛物线） |
| VR | normal | `[26,6]` | 成交量变异率 |
| WR | normal | `[6,10,14]` | 威廉指标 |
| MTM | normal | `[12,6]` | 动量指标 |
| EMV | normal | `[14,9]` | 简易波动 |
| TRIX | normal | `[12,9]` | 三重指数 |
| ROC | normal | `[12,6]` | 变动率 |
| PVT | normal | `[]` | 价量趋势 |
| BBI | price | `[3,6,12,24]` | 多空指标 |
| AO | normal | `[5,34]` | 动量震荡（零轴柱） |
| AVP | price | `[]` | 平均价（成交额/量） |

每个指标含 `name` / `shortName` / `series` / `precision`（默认 2）/ `calcParams`（默认参数，均可 `overrideIndicator` 覆盖）。主图 price 系列（MA/EMA/SMA/BOLL/SAR/BBI/AVP）`createIndicator` 时 `isStack=true` 叠加主图；normal/volume 系列各自新建副图 pane。

### 5.2 自定义指标（`registerIndicator`）

```ts
registerIndicator({ name, shortName, series: 'normal'|'price'|'volume', calcParams?, precision?,
  figures: [{ key, title, type: 'line'|'bar'|'circle', baseValue?, styles? }],
  // 核心钩子：
  calc(dataList, { calcParams, precision }) → figures 对应的数值数组
  shouldUpdate?() / regenerateFigures?() / draw?() / createTooltipDataSource?()
})
```

- `calc`：接收全部 K 线数据，返回 `{ [figureKey]: value, text? }[]`；支持 `Promise`（异步计算）
- `figures` 复用内置图元类型（line/bar/circle），可自定颜色
- `series` 决定挂载位置：`price` 叠加主图、`volume` 成交量类、`normal` 建副图
- 指标通过 `chart.createIndicator(name, isStack?, paneOptions?)` 挂载，**每次调用都新建副图 pane、不去重**（见 CLAUDE.md 坑位 1，必须 ref 防重）

---

## 六、画线工具（Overlay，16 个）

### 6.1 内置画线工具

| Overlay | 说明 | 需要点位数 |
|---|---|---|
| `straightLine` | 直线 | 2 |
| `segment` | 线段 | 2 |
| `rayLine` | 射线 | 2 |
| `horizontalStraightLine` | 水平直线 | 1 |
| `verticalStraightLine` | 垂直直线 | 1 |
| `horizontalSegment` | 水平线段 | 1 |
| `verticalSegment` | 垂直线段 | 1 |
| `horizontalRayLine` | 水平射线 | 1 |
| `verticalRayLine` | 垂直射线 | 1 |
| `parallelStraightLine` | 平行线（平行通道） | 2 |
| `priceLine` | 价格线 | 1 |
| `priceChannelLine` | 价格通道 | 2 |
| `fibonacciLine` | 斐波那契回调线 | 2 |
| `simpleAnnotation` | 简单标注（箭头+文字） | 1 |
| `simpleTag` | 简单标签（旗帜） | 1 |
| `brush` | 自由画笔（freehand） | — |

创建：`chart.createOverlay('fibonacciLine')` / `createOverlay({ name, points, ... })`，或注册后直接 `chart.createOverlay(name)`。全部 16 个内置名称可经 `getSupportedOverlays()` 运行时枚举。

### 6.2 Overlay 生命周期与模式

- `totalStep` / `currentStep`：绘制所需点位步数，`drawingMode: 'step'`（逐点确认）| `'continuous'`（连续绘制，如 brush 自由手绘）
- `mode: 'normal' | 'weak_magnet' | 'strong_magnet'`：**磁吸模式**，吸附到 K 线高低点
- `styles`：线色/宽度/样式、文字标签、圆点（`point` 默认半径 5、激活边框 3）
- `lock` / `visible` / `zLevel`：锁定、显隐、层级

### 6.3 事件集合（`OverlayEventCollection`）

| 事件 | 触发 |
|---|---|
| `onDrawStart` / `onDrawing` / `onDrawEnd` | 绘制过程 |
| `onClick` / `onDoubleClick` / `onRightClick` | 鼠标操作 |
| `onPressedMoveStart` / `onPressedMoving` / `onPressedMoveEnd` | 按住拖拽 |
| `onMouseEnter` / `onMouseLeave` / `onMouseOver` | 悬停 |
| `onSelected` / `onDeselected` | 选中状态 |

回调均返回 `event`（含 `points`、`overlay`、`cancel` 可阻止默认行为）。

### 6.4 自定义 Overlay（`registerOverlay`）

```ts
registerOverlay({ name, totalStep, needDefaultPointFigure?, needDefaultXAxisFigure?, needDefaultYAxisFigure?,
  createPointFigures: ({ overlay, coordinates }) → FigureTemplate[],
  createXAxisFigures?, createYAxisFigures?,
  onDrawStart?, onDrawing?, ... })
```

通过 `createPointFigures` 把已确认点位换算成坐标，再组合成 Figure 数组绘制，可复用 `utils.checkCoordinateOn*` 命中检测实现选中/拖拽。

---

## 七、基础图元（Figure，6 个）

| Figure | 属性 |
|---|---|
| `line` | `coordinates: {x,y}[]`、`styles`（线色/宽/虚线） |
| `rect` | `x`/`y`/`width`/`height`、`styles`（填充/边框） |
| `circle` | `x`/`y`/`radius`、`styles` |
| `polygon` | `coordinates[]`、`styles` |
| `text` | `x`/`y`/`text`/`align`/`baseline`、`styles`（字体/字号/颜色） |
| `arc` | `x`/`y`/`radius`/`startAngle`/`endAngle`/`clockwise`、`styles` |

每个图元是 `FigureTemplate { name, draw(ctx, attrs, styles), checkEventOn(ctx, attrs, styles, event) }`：`draw` 负责 Canvas 绘制，`checkEventOn` 返回该图元在事件坐标处是否命中（供选中/拖拽）。自定义图元用 `registerFigure` 注册后可被指标/画线复用。

---

## 八、样式系统（Styles）

### 8.1 八大样式分类

```ts
interface Styles {
  grid:        GridStyle       // 水平/垂直线：color、dashed、size、horizontal/vertical 开关
  candle:      CandleStyle     // 见第四章
  indicator:   IndicatorStyle  // 指标线色/文字/tooltip（同 candle 体系）
  xAxis:       XAxisStyle      // 时间轴：color/size/tickText 颜色字号/margin
  yAxis:       YAxisStyle      // 价格轴：color/size/tickText/type（normal|percentage|log）
  separator:   SeparatorStyle  // pane 分隔线：color、size（默认 1、#DDDDDD）
  crosshair:   CrosshairStyle  // 十字光标：horizontal/vertical（color、dashed [4,2]、text 样式）
  overlay:     OverlayStyle    // 画线工具：point 半径 5、激活边框 3、文字样式
}
```

### 8.2 主题机制

- 内置 2 个命名主题：`light` / `dark`（`init` 时 `styles` 参数选择，或 `chart.setStyles`）
- `registerStyles(name, styles)` 注册自定义命名主题，之后可在 `init` 选项 / `setStyles('name')` 中按名引用
- `getSupportedStyles()` / `getStyles()` / `setStyles(styles | 'themeName')` 运行期读写（`getSupportedStyles` 返回已注册主题名列表）
- `Styles` 支持**函数式值**（`color: ({ type }) => ...`），可按 pane/指标/涨跌动态取色

---

## 九、坐标轴系统

### 9.1 时间轴（xAxis）

- 默认内置；`registerXAxis` + `AxisOverride` 完全自定义
- `AxisOverride { name, id, paneId, reverse, inside, position, scrollZoomEnabled, gap, createRange, createTicks }`

### 9.2 价格轴（yAxis）

- 主图默认一根；`chart.createYAxis(paneId, override?)` **创建多个 Y 轴**（可分别绑定不同 pane）
- `chart.getYAxes()` 获取全部；每个 Y 轴可独立 `setStyles`/`setVisible`/`setReverse`/`setInside`/`setPosition('left'|'right')`
- 轴类型：`normal`（线性）/ `percentage`（百分比）/ `log`（对数），通过 `yAxis.type` 切换
- 默认参数：`position: 'right'`、`reverse: false`、`inside: false`、`scrollZoomEnabled: true`、留白 `gap: { top: 0.2, bottom: 0.1 }`

### 9.3 自定义轴刻度（`AxisTemplate`）

`registerYAxis` / `registerXAxis` 注册轴的 `template`：

```ts
interface AxisTemplate {
  valueToRealValue:   (v: number, options) => number   // 值 → 真实值
  realValueToDisplayValue: (v, options) => number      // 真实值 → 显示值
  realValueToValue:   (v, options) => number
  displayValueToRealValue: (v, options) => number
  displayValueToText: (v, options) => string           // 显示值 → 刻度文字
  minSpan:            (options) => number              // 最小刻度跨度
}
```

配合 `createRange`/`createTicks` 可做任何自定义刻度（如价格分位、涨跌幅轴）。

---

## 十、事件与动作（Action）

### 10.1 `subscribeAction` / `executeAction`

```ts
chart.subscribeAction((type, data) => { ... })  // 监听全部动作
chart.executeAction(ActionType.onCandleBarClick, { paneId, dataIndex })  // 编程触发动作
```

### 10.2 ActionType 全集

| ActionType | 触发时机 | 回调数据 |
|---|---|---|
| `onZoom` | 缩放 | `{ zoomScale }` |
| `onScroll` | 滚动 | `{ scrollPosition }` |
| `onVisibleRangeChange` | 可见区间变化 | `{ from, to, realFrom, realTo }`（**滚动加载历史的入口**） |
| `onCrosshairChange` | 十字光标移动 | `{ paneId, dataIndex, kLineData, crosshair, overlay, yAxis }` |
| `onCandleBarClick` | 点击 K 线 | `{ paneId, dataIndex, kLineData }` |
| `onCandleTooltipFeatureClick` | 点击 K 线 tooltip 元素 | 功能点回调 |
| `onIndicatorTooltipFeatureClick` | 点击指标 tooltip 元素 | 同上 |
| `onCrosshairFeatureClick` | 点击十字光标元素 | 同上 |
| `onPaneDrag` | 拖拽 pane 分隔条 | `{ paneId }` |

---

## 十一、滚动 / 缩放 / 视图控制

### 11.1 Store 基础控制

| 方法/选项 | 说明 |
|---|---|
| `setZoomEnabled(true/false)` / `setScrollEnabled(...)` | 交互开关 |
| `setBarSpace(n)` | 柱间距（范围由 `barSpaceLimit: { min: 1, max: 50 }` 限制） |
| `setOffsetRightDistance(n)` | 右侧留白距离（默认 80） |
| `setMinVisibleBarCount({ left, right })` | 最小可见柱数（默认左右均 2） |
| `setMaxOffsetDistance(n)` | 最大偏移距离（默认 50） |
| `zoomAnchor` | 缩放锚点：`'cursor'`（默认，光标处）/ `'last_bar'`（最新柱） |

### 11.2 编程滚动 / 缩放

| Chart 方法 | 作用 |
|---|---|
| `scrollByDistance(distance)` | 按像素滚动 |
| `scrollToRealTime()` | 滚回最新一根 |
| `scrollToDataIndex(index, offsetDistance)` | 滚动到指定数据索引 |
| `scrollToTimestamp(timestamp, offsetDistance)` | 滚动到指定时间戳 |
| `zoomAtCoordinate(coordinate, scale)` | 在屏幕坐标处缩放 |
| `zoomAtDataIndex(dataIndex, scale)` | 在数据索引处缩放 |
| `zoomAtTimestamp(timestamp, scale)` | 在时间戳处缩放 |

### 11.3 坐标换算

- `convertToPixel({ paneId, dataIndex, kLineData?, yAxisId? })` → 屏幕坐标
- `convertFromPixel({ paneId, x, y, yAxisId? })` → 数据索引 + 价格

### 11.4 快捷键（Hotkey，4 个内置）

| 动作 | 默认按键 | 效果 |
|---|---|---|
| `scrollLeft` | `Shift + ArrowLeft` | 左移 3 根 |
| `scrollRight` | `Shift + ArrowRight` | 右移 3 根 |
| `zoomIn` | `Shift + Equal` / `Shift + NumpadAdd` | 放大 ×1.05 |
| `zoomOut` | `Shift + Minus` / `Shift + NumpadSubtract` | 缩小 ×0.95 |

- `registerHotkey(action, key, callback)` 注册自定义快捷键
- HotkeyOption：`enabled`（总开关）/ `exclude`（排除元素，如 `['INPUT']` 使输入框内不触发）

---

## 十二、多语言 / 导出 / 工具

### 12.1 多语言（Locale）

- 内置 `zh-CN` / `en-US` 两套（`var locales = { 'zh-CN': zhCN, 'en-US': enUS }`）
- `chart.setLocale('zh-CN')` 切换；`registerLocale(name, locale)` 注册自定义语言包；`getSupportedLocales()` 枚举
- 语言包键：`time`/`open`/`high`/`low`/`close`/`volume`/`turnover`/`change`（tooltip 字段前缀）+ `second`/`minute`/`hour`/`day`/`week`/`month`/`year`（周期单位）

### 12.2 导出图片

```ts
chart.getConvertPictureUrl({ type: 'png' | 'jpeg' | 'bmp', backgroundColor?, includeOverlay?, includeIndicator?, includeCrosshair? })
```

返回图片 URL（可用于 `<a download>` / canvas 转 blob），支持包含/排除画线与指标层。

### 12.3 格式化与工具（`utils`）

| 工具 | 作用 |
|---|---|
| `clone` / `merge` | 深拷贝 / 深合并 |
| `formatValue` / `formatPrecision` / `formatBigNumber` | 数值格式化 |
| `formatThousands` | 千分位 |
| `formatFoldDecimal` | 折叠小数（配合 `setDecimalFold`） |
| `formatDate` | 日期格式化 |
| `calcTextWidth` | 文本像素宽度 |
| `checkCoordinateOnLine` / `...OnRect` / `...OnCircle` / `...OnPolygon` / `...OnArc` | 坐标命中检测（自定义 Figure 命中用） |

### 12.4 其它 Chart 方法

- `getDom()` / `getSize()` / `resize(width?, height?)`：DOM 与尺寸
- `getConvertPictureUrl` 选项（Chart 顶层导出图片）：`{ type, backgroundColor?, includeOverlay?, includeIndicator?, includeCrosshair? }`
- `setPaneOptions(paneOptions)`：pane 的 `{ id, height, minHeight: 30, dragEnabled: true, order, state: 'normal'|'maximize'|'minimize' }`
- `setTimezone(tz)` / `setThousandsSeparator(char)` / `setDecimalFold(enable)` / `setFormatter(fn)` / `setHotkey(options)` / `setLocale(locale)`
- `removeIndicator(paneId)` / `removeOverlay(overlay)` / `overrideIndicator(...)` / `overrideOverlay(...)`：覆盖或移除
- `dispose()`：销毁图表实例

---

## 十三、性能特性

| 特性 | 说明 |
|---|---|
| Canvas 渲染 | 单 Canvas 分级绘制（背景/主体/浮层），万级数据流畅 |
| 零依赖 | 无运行时依赖，无重依赖树，打包体积可控 |
| 按需数据 | `setDataLoader` 的 backward/forward 天然支持分页加载历史 |
| 可见区间回调 | `onVisibleRangeChange` 避免高频全量重绘，只处理可见区 |
| `recreateOnDataChange` | DataLoader 选项，数据变化时是否重建（性能/一致性权衡） |

---

## 十四、与常见需求对照

| 需求 | 用法 |
|---|---|
| 实时行情增量推送 | `setDataLoader` + `subscribeBar` 返回 `{ type: 'update' }` |
| 滚动加载历史 | `getBars` 的 `backward` 分支 + `callback(data, more)` 判断 |
| 多副图指标（VOL/MACD/KDJ） | `createIndicator('macd')`（注意每次新建 pane 不去重） |
| 画线/标注工具 | `createOverlay('fibonacciLine')` 等 16 个内置，或 `registerOverlay` 自绘 |
| 最新价标记 | CandleStyle 的 `priceMark`（默认开启） |
| 自定义水平参考线 | `createOverlay('priceLine', { points: [{ value }] })` |
| 自定义指标 | `registerIndicator` + `overrideIndicator` 调参 |
| 多 Y 轴 | `createYAxis(paneId)` 创建并绑定 |
| 对数/百分比轴 | `yAxis.type: 'log' / 'percentage'` |
| 导出图片 | `getConvertPictureUrl({ type: 'png' })` |
| 涨绿跌红（A股习惯） | 内置默认 `Color.GREEN` 为涨色，无需配置 |
| 主题切换 | `setStyles('dark')` 或 `registerStyles` 自定义主题 |

---

## 十五、项目实践要点（踩坑速查）

1. **无公共增量 API**：v10 只有 `setDataLoader`，`applyNewData`/`updateData` 已移除；实时增量走 `subscribeBar`（CLAUDE.md 坑位 2）。
2. **`createIndicator` 不去重**：每次调用新增副图 pane，轮询场景必须用 ref 防重，否则累积多个 VOL 窗口把主图挤成 0 高（CLAUDE.md 坑位 1）。
3. **`setDataLoader` 只注册一次**：重复注册会重置数据流，导致 `init` 反复触发。
4. **时间戳是毫秒**：`KLineData.timestamp` 与 OHLCV 的 `time(ms)` 单位一致，直接透传；period 用 `{ type, span }` 对象（区别于 HQChart 的数字常量）。
5. **切换 symbol/period 时序**：组件需先用 ref 持有最新数据供异步 `getBars` 回调读取，`data[last].time` 倒退或首次加载时做全量 `init` 重设。

---

## 十六、许可与归属（Apache-2.0）

- klinecharts 采用 **Apache-2.0** 协议，允许商用、修改、再分发，需保留版权声明与许可文本。
- 无 TradingView 式的强制 attribution logo 要求（对比 lightweight-charts），但按 Apache-2.0 要求在 NOTICE/代码注释中保留原作者署名与 License 副本。

---

*本文档信息以 `node_modules/klinecharts/dist/index.d.ts`（v10.0.3）与 `dist/index.esm.js` 为准，如需核对请以安装版本为准。*
