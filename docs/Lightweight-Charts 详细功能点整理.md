# Lightweight-Charts 开源库详细信息整理

> 本文档基于项目实际安装的 **`lightweight-charts@5.2.1`**（TradingView 出品，Apache-2.0 协议），内容来自其 `dist/typings.d.ts` 类型声明与官方文档，重点覆盖全部功能点。

---

## 一、基本信息

| 项目 | 内容 |
|---|---|
| 全名 | TradingView Lightweight Charts（轻量级图表库） |
| 当前版本 | 5.2.1（本项目安装） |
| 作者 | TradingView |
| 协议 | Apache-2.0 |
| 技术栈 | HTML5 Canvas，无框架依赖，仅一个运行时依赖 `fancy-canvas@2.1.0` |
| 仓库 | https://github.com/tradingview/lightweight-charts |
| 官网 | https://www.tradingview.com/lightweight-charts/ |
| 打包产物 | `dist/lightweight-charts.development.mjs` / `production.mjs`（ESM）及 standalone 单文件版（UMD） |

**定位**：体积小、性能高的金融图表库，专为"嵌入式 K 线/行情图"场景设计，不提供 K 线绘制之外的重型功能（如画线工具、指标编辑器）。

---

## 二、核心架构

### 2.1 三种水平轴类型（HorzScale）

| 类型 | 入口函数 | 说明 |
|---|---|---|
| 时间轴（默认） | `createChart()` | 横轴为时间（`Time`），支持 UTC 时间戳/`BusinessDay`/日期字符串 |
| 期权/价格轴 | `createOptionsChart()` | 横轴为价格数值（`number`），用于期权隐含波动率曲线等 |
| 收益率曲线轴 | `createYieldCurveChart()` | 横轴为到期期限数值，收益率曲线专用 |

**扩展机制**：`createChartEx()` + 自定义 `IHorzScaleBehavior` 可实现任意类型横轴（类别轴、k线索引轴等）。

### 2.2 `Time` 时间类型（三种写法）

```ts
type Time = UTCTimestamp | BusinessDay | string;
// 例：
1651564800                      // UTCTimestamp（秒，注意不是毫秒！）
{ year: 2022, month: 5, day: 3 } // BusinessDay
'2022-05-03'                    // 字符串日期
```

### 2.3 三层 API 结构

```
createChart() ──► IChartApi（图表）
   ├─ addSeries()      ──► ISeriesApi（系列：K线/折线/面积/直方图/基准线/自定义）
   ├─ timeScale()      ──► ITimeScaleApi（时间轴控制）
   ├─ priceScale(id)   ──► IPriceScaleApi（价格轴控制）
   ├─ panes()          ──► IPaneApi[]（多窗格）
   └─ attachPrimitive  ──► IPanePrimitive（窗格级插件）
```

---

## 三、数据接入功能点

### 3.1 数据模型

| 数据接口 | 字段 | 适用系列 |
|---|---|---|
| `OhlcData` | `time, open, high, low, close` | Candlestick、Bar |
| `SingleValueData` | `time, value` | Line、Area、Baseline、Histogram |
| `WhitespaceData` | 仅 `time`（空白点，保持时间轴连续） | 所有系列 |
| `HistogramData` | `time, value, color?` | Histogram |
| `BarData` / `LineData` | `time, open/high/low/close 或 value, color?` | 单点自定义颜色 |
| `CustomData` | `time, color?, customValues?` | Custom 自定义系列 |

### 3.2 数据写入 API（`ISeriesApi`）

| 方法 | 作用 |
|---|---|
| `setData(data[])` | **全量替换**数据（必须按时间升序） |
| `update(bar, historicalUpdate?)` | **增量更新**：时间等于最后一根则替换，大于则追加；`historicalUpdate=true` 可更新非末尾的历史点（较慢） |
| `pop(count)` | 从末尾删除 N 根，返回被删数据 |
| `data()` | 返回当前全部数据 |
| `dataByIndex(index, mismatchDirection?)` | 按逻辑索引取数据，可指定就近搜索方向（`MismatchDirection`） |
| `subscribeDataChanged(handler)` | 监听数据变更（`setData`/`update` 触发），handler 收到 `'full' | 'update'` |

> **本项目实践**（见 CLAUDE.md）：毫秒时间戳必须 `/1000` 转成 `UTCTimestamp`（秒），否则日期会漂移到 57647 年；增量起点找不到（竞态/整体重置）时要退化为 `setData` 全量重设。

---

## 四、图表类型（Series Type）

内置 6 种系列，均通过 `addSeries(SeriesDefinition, options?)` 创建（v4 之后统一为定义式 API；v5 仍保留 `chart.addCandlestickSeries()` 等快捷方法）：

| 系列 | 定义常量 | 样式选项 | 要点 |
|---|---|---|---|
| **K 线** | `CandlestickSeries` | `CandlestickStyleOptions` | 涨/跌颜色、影线、边框、上下色独立配置 |
| **柱线** | `BarSeries` | `BarStyleOptions` | OHLC 柱状图 |
| **折线** | `LineSeries` | `LineStyleOptions` | 支持 `LineType`：直线/阶梯/曲线 |
| **面积** | `AreaSeries` | `AreaStyleOptions` | 上下渐变填充、可反向填充、渐变可相对基准值 |
| **直方图** | `HistogramSeries` | `HistogramStyleOptions` | `base` 基准线、每根可独立上色（成交量图标准做法） |
| **基准线** | `BaselineSeries` | `BaselineStyleOptions` | 以 `baseValue` 为分界上下双色填充（涨跌对比图） |
| **自定义** | `addCustomSeries(paneView, options)` | `CustomStyleOptions` | 用自绘渲染器实现库不支持的图表类型 |

### 4.1 系列通用选项（`SeriesOptionsCommon`）

- `title` / `visible` / `priceScaleId`（绑定左/右/覆盖轴）
- `lastValueVisible`（价格轴最新价标签）、`priceLine*`（最新价横线：可见性/来源/宽度/颜色/样式）
- `baseLine*`（百分比/IndexedTo100 轴基准线）
- `priceFormat`（价格格式，见下）
- `autoscaleInfoProvider`（覆盖自动缩放范围）
- `hitTestTolerance`（点击命中容差，默认 3px）
- `conflationThresholdFactor`（数据融合平滑系数，覆盖全局）

### 4.2 价格格式（`PriceFormat`）

| 类型 | 说明 |
|---|---|
| `price` | 常规价格，`precision` 小数位 + `minMove` 最小跳动（默认 0.01）；小价格可用 `base = 1/minMove` 规避浮点精度问题 |
| `volume` | 缩写格式：`1.2K` / `12.67M` |
| `percent` | 末尾加 `%` |
| `custom` | 完全自定义 `formatter` 函数 |

### 4.3 线样式枚举

- `LineStyle`：`Solid / Dotted / Dashed / LargeDashed / SparseDotted`
- `LineType`：`Simple / WithSteps / Curved`
- `LineWidth`：`1 | 2 | 3 | 4`
- `LastPriceAnimationMode`：`Disabled / Continuous / OnDataUpdate`（最新价点动画）

---

## 五、图表配置选项（ChartOptions）

### 5.1 尺寸与缩放

| 选项 | 说明 |
|---|---|
| `width` / `height` | 像素尺寸；默认 0 = 跟随容器 |
| `autoSize` | 用 `ResizeObserver` 自动跟随容器尺寸（需浏览器支持，否则回退固定尺寸） |
| `defaultVisiblePriceScaleId` | 默认使用左/右价格轴（默认 `right`） |

### 5.2 布局（`LayoutOptions`）

- `background`：纯色或垂直渐变（`ColorType.Solid | VerticalGradient`）
- `textColor` / `fontSize` / `fontFamily`：坐标轴文字
- `panes`：多窗格分隔线颜色、是否允许拖拽调整窗格高度
- `attributionLogo`：**TradingView 归属 logo**（许可要求页面保留指向 tradingview.com 的链接；本项目已按 NOTICE 声明后关闭）
- `colorSpace`：`srgb | display-p3`
- `colorParsers`：扩展自定义颜色格式解析（display-p3、lab、lch、oklab 等）

### 5.3 十字光标（`CrosshairOptions`）

- `mode`：`Normal`（自由移动）/ `Magnet`（磁吸到最新价，默认）/ `Hidden` / `MagnetOHLC`（磁吸到 OHLC 任一价）
- `vertLine` / `horzLine`：各自颜色、宽度、样式、可见性
- `doNotSnapToHiddenSeriesIndices`：不吸附隐藏系列的数据点

### 5.4 网格（`GridOptions`）

- `vertLines` / `horzLines`：颜色、线型、可见性

### 5.5 交互（缩放/滚动）

**`handleScroll`（滚动）**：
- `mouseWheel`、`pressedMouseMove`（按住拖动）
- `horzTouchDrag` / `vertTouchDrag`（触屏横向/纵向拖动）

**`handleScale`（缩放）**：
- `mouseWheel`、`pinch`（双指缩放）
- `axisPressedMouseMove`（按住鼠标在轴上拖动缩放时间/价格轴）
- `axisDoubleClickReset`（双击轴重置缩放）

**`kineticScroll`**：惯性滚动（滚轮/触摸松手后惯性滑动）
**`trackingMode`**：移动端长按进入查看模式后的退出方式（`OnTouchEnd` / `OnNextTap`）
**`hoveredSeriesOnTop`**：悬停的系列置顶绘制

### 5.6 本地化（`LocalizationOptions`）

- `locale`：日期格式化语言（默认浏览器语言）
- `priceFormatter` / `tickmarksPriceFormatter`：价格轴刻度/标签自定义格式化
- `percentageFormatter` / `tickmarksPercentageFormatter`：百分比轴格式化

### 5.7 时间轴（`TimeScaleOptions`，最常用）

| 选项 | 说明 |
|---|---|
| `rightOffset` / `rightOffsetPixels` | 右侧留白（根/像素） |
| `barSpacing` / `minBarSpacing` / `maxBarSpacing` | 柱间距 |
| `fixLeftEdge` / `fixRightEdge` | 锁定左右边界禁止滚出数据范围 |
| `lockVisibleTimeRangeOnResize` | 尺寸变化时保持可见时间范围 |
| `rightBarStaysOnScroll` | 滚动时悬停柱不移动 |
| `timeVisible` / `secondsVisible` | 显示时间/秒 |
| `shiftVisibleRangeOnNewBar` | 新数据追加时自动右移（实时图关键开关） |
| `tickMarkFormatter` | 自定义时间刻度标签 |
| `uniformDistribution` | 同权重刻度要么全画要么不画 |
| `minimumHeight` | 时间轴最小高度 |
| `allowBoldLabels` | 主刻度粗体 |
| `enableConflation` | **数据融合**：柱间距 < 0.5px 时自动合并数据点，大幅提升大数据量缩小时的渲染性能 |
| `conflationThresholdFactor` | 融合平滑系数（1.0~8.0+，sparkline 小图用高值更平滑） |
| `precomputeConflationOnInit` | 加载后后台预计算融合块（>10K 点大数据集缩放大提速 10-100x，代价是初始加载 +100-500ms、内存 +20-50%） |

### 5.8 价格轴（`PriceScaleOptions`）

| 选项 | 说明 |
|---|---|
| `mode` | `Normal`（线性）/ `Logarithmic`（对数）/ `Percentage`（百分比，首个可见值为 0%）/ `IndexedTo100`（首值置 100） |
| `autoScale` | 自动适配可见数据范围（overlay 轴恒为 true） |
| `invertScale` | 上下反转 |
| `scaleMargins` | 上下留白比例（默认 `{bottom: 0.1, top: 0.2}`） |
| `visible` / `borderVisible` / `borderColor` / `textColor` | 可见性与样式 |
| `alignLabels` | 标签对齐防重叠 |
| `minimumWidth` | 最小宽度（多图对齐用） |
| `tickMarkDensity` | 刻度密度（默认 2.5） |
| `ensureEdgeTickMarksVisible` | 上下边缘强制显示刻度 |

左右/覆盖三组价格轴可独立配置：`leftPriceScale` / `rightPriceScale` / `overlayPriceScales`。

---

## 六、API 方法功能清单

### 6.1 `IChartApi`（图表）

| 方法 | 作用 |
|---|---|
| `remove()` | 销毁图表及全部 DOM（不可逆） |
| `resize(w, h, forceRepaint?)` | 手动改尺寸；`forceRepaint` 立即重绘（截图前用） |
| `addSeries(def, options?, paneIndex?)` | 添加系列到指定窗格 |
| `addCustomSeries(paneView, options?, paneIndex?)` | 添加自定义绘制系列 |
| `removeSeries(series)` | 移除系列（不可逆） |
| `subscribeClick` / `subscribeDblClick` / `subscribeCrosshairMove` / 对应 `unsubscribe*` | 点击/双击/十字线移动事件（`MouseEventParams` 含 `time / point / seriesData(Map) / hoveredInfo`） |
| `priceScale(id, paneIndex?)` | 获取价格轴 API |
| `timeScale()` | 获取时间轴 API |
| `applyOptions(options)` / `options()` | 运行期改/查配置 |
| `takeScreenshot(addTopLayer?, includeCrosshair?)` | 返回图表 Canvas（可 `toDataURL()`/`toBlob()` 导出 PNG） |
| `addPane()` / `panes()` / `removePane(i)` / `swapPanes(a, b)` | 多窗格管理 |
| `setCrosshairPosition(price, time, series)` / `clearCrosshairPosition()` | 编程设置/清除十字线（多图联动用） |
| `chartElement()` | 获取内部容器 div（可加监听/测尺寸） |
| `paneSize(i?)` | 绘图区像素尺寸 |
| `autoSizeActive()` | 是否处于 ResizeObserver 自动尺寸模式 |

### 6.2 `ITimeScaleApi`（时间轴）

- **滚动**：`scrollPosition()` / `scrollToPosition(pos, animated)` / `scrollToRealTime()`
- **可见范围**：`getVisibleRange()` / `setVisibleRange()`（时间范围，不能外推）/ `getVisibleLogicalRange()` / `setVisibleLogicalRange()`（逻辑索引范围）/ `resetTimeScale()` / `fitContent()`（缩放到显示全部数据）
- **坐标换算**：`logicalToCoordinate` / `coordinateToLogical` / `timeToIndex` / `timeToCoordinate` / `coordinateToTime` / `width()` / `height()`
- **事件**：`subscribeVisibleTimeRangeChange` / `subscribeVisibleLogicalRangeChange` / `subscribeSizeChange`（可用于实现"滚动加载历史数据"）

### 6.3 `IPriceScaleApi`（价格轴）

- `applyOptions` / `options` / `width`
- `setVisibleRange(range)` / `getVisibleRange()`
- `setAutoScale(on)`（编程开关自动缩放）

### 6.4 `ISeriesApi`（系列）—— 除数据方法外

- `priceFormatter()`：复用图表价格格式化逻辑
- `priceToCoordinate(price)` / `coordinateToPrice(coord)`：价格与像素互转
- `barsInLogicalRange(range)`：返回某逻辑范围内 bar 数量与前后余量（**滚动加载历史的标准用法**）
- `createPriceLine(options)` / `removePriceLine(line)` / `priceLines()`：**参考价格线**（自定义水平线，含轴标签/标题/颜色）
- `lastValueData(globalLast)`：最后价格及颜色（`globalLast=false` 取当前可见范围内最后一个）
- `attachPrimitive` / `detachPrimitive`：挂载/卸载系列级插件
- `seriesType()`：当前系列类型
- `moveToPane(i)` / `seriesOrder()` / `setSeriesOrder(n)`：跨窗格移动与绘制层级
- `getPane()`：所在窗格 API

### 6.5 `IPaneApi`（窗格）

- `getHeight()` / `setHeight()` / `moveTo()` / `paneIndex()` / `getSeries()`
- `getHTMLElement()` / `priceScale(id)` / `attachPrimitive` / `detachPrimitive`
- `getStretchFactor()` / `setStretchFactor()`：窗格相对高度占比（多窗格布局）
- `setPreserveEmptyPane()`：窗格无数据时是否保留
- `addSeries` / `addCustomSeries`：窗格内直接创建系列

---

## 七、插件 / 扩展体系（Primitives）

库通过 **Primitive（图元）** 机制开放自绘能力，这是它最强大的扩展点：

### 7.1 内置官方插件（顶层函数）

| 函数 | 功能 |
|---|---|
| `createSeriesMarkers(series, markers, options?)` | **系列标记插件**：K 线上画买卖点标记 |
| `createUpDownMarkers(series, options?)` | **涨跌标记插件**：价格变动后自动在数据点上方/下方显示涨/跌箭头，可设显示时长自动消失 |
| `createTextWatermark(pane, options)` | **文字水印**（Logo、版权、仅供演示等） |
| `createImageWatermark(pane, imageUrl, options)` | **图片水印** |
| `createYieldCurveChart()` / `createOptionsChart()` | 前述专用图表类型 |

### 7.2 系列标记（SeriesMarker）—— 原生事件标记

非插件 API（`ISeriesApi` 直接支持 `setMarkers` 时代遗留，现由 `createSeriesMarkers` 承载），标记属性：

- `time` / `position`（`aboveBar / belowBar / inBar`，或价格轴定位 `atPriceTop / atPriceMiddle / atPriceBottom` + `price`）
- `shape`：`circle / square / arrowUp / arrowDown`
- `color` / `text` / `size` / `id`
- 插件选项：`autoScale`（缩放计算包含标记）、`zOrder`（`top / aboveSeries / normal`）

### 7.3 自绘插件接口

**系列级 `ISeriesPrimitive`**：可挂到 `ISeriesApi.attachPrimitive`
- `priceAxisViews()` / `timeAxisViews()`：在坐标轴上绘制标签（如自定义指标值）
- `paneViews()` / `priceAxisPaneViews()` / `timeAxisPaneViews()`：在主图区/轴区绘制任意图形
- `autoscaleInfo()`：扩展自动缩放范围（把自绘图形纳入可见范围）
- `attached()` / `detached()`：生命周期钩子
- `hitTest(x, y)`：自定义命中检测 + 自定义光标
- `updateAllViews()`：视口变化时重算

**窗格级 `IPanePrimitive`**：挂到 `IPaneApi.attachPrimitive`，能力同上但作用于整个窗格（含时间轴/价格轴区域）

**渲染器**：`draw(target, utils)` 直接操作 Canvas 上下文；`drawBackground()` 画在图表背景层；`zOrder()` 控制绘制层级（`bottom / normal / top`）

### 7.4 自定义系列（Custom Series）

`addCustomSeries()` 让开发者用 Canvas 自绘**全新图表类型**（库不内置的类型，如资金流、点线图变体）：

- `ICustomSeriesPaneView`：定义数据→价格换算（`priceValueBuilder`）、绘制方法、命中测试
- 支持数据压缩（`CustomConflationContext`）、`customValues` 透传、单点 `color`

> 官方交互式插件示例：https://tradingview.github.io/lightweight-charts/plugin-examples/

---

## 八、性能特性

| 特性 | 说明 |
|---|---|
| Canvas 渲染 | 非 SVG/DOM，万级数据点流畅 |
| 逻辑范围渲染 | 只绘制可见区域数据 |
| **数据融合（Conflation）** | 缩小到柱间距 <0.5px 时自动合并数据点；`enableConflation` + `conflationThresholdFactor` 平滑度可调；`precomputeConflationOnInit` 后台预计算（>10K 点建议开启） |
| 增量更新 | `update()` 只重绘变动，比 `setData` 全量高效（实时行情标准做法） |
| 单一依赖 | 仅 `fancy-canvas`，无重依赖树 |
| `autoscaleInfoProvider` | 可覆盖缩放计算避免重复布局抖动 |

---

## 九、事件系统汇总

| 事件 | API | 典型用途 |
|---|---|---|
| 点击 | `chart.subscribeClick` | 选中交互 |
| 双击 | `chart.subscribeDblClick` | 重置缩放等 |
| 十字线移动 | `chart.subscribeCrosshairMove` | **十字线行情联动、tooltip** |
| 数据变更 | `series.subscribeDataChanged` | 数据同步 |
| 可见范围变化 | `timeScale.subscribeVisibleTimeRangeChange` / `subscribeVisibleLogicalRangeChange` | **滚动加载历史、懒加载** |
| 时间轴尺寸变化 | `timeScale.subscribeSizeChange` | 布局适配 |

**`MouseEventParams` 关键字段**：`time` / `logical` / `point` / `paneIndex` / `seriesData`（Map：当前点所有系列数据）/ `hoveredInfo`（命中的图元类型：`series-point / series-line / series-range / marker / price-line / primitive / custom`）

---

## 十、坐标系统（Logical vs Time）

| 概念 | 说明 |
|---|---|
| **Logical（逻辑索引）** | 数据在时间轴上的整数索引，`LogicalRange` 是可见索引区间，支持用索引精确设置可视范围 |
| **Time（时间）** | 真实时间值（`Time` 类型），`setVisibleRange` 不能外推已有数据 |

两者可互转：`logicalToCoordinate` / `timeToIndex` / `coordinateToTime` 等。

---

## 十一、与常见需求对照

| 需求 | 用法 |
|---|---|
| 实时行情增量推送 | `update()` + `timeScale.shiftVisibleRangeOnNewBar` |
| 滚动加载历史 | `subscribeVisibleLogicalRangeChange` + `barsInLogicalRange` 判断余量 |
| 买卖点标记 | `createSeriesMarkers` |
| 最新价线 | `priceLineVisible: true`（默认开启） |
| 自定义水平参考线 | `series.createPriceLine({ price, title, color })` |
| 自定义指标（MACD/KDJ） | 自定义系列或 `attachPrimitive` 在窗格/轴绘制 |
| 成交量柱 | Histogram 系列绑定覆盖价格轴 |
| 多窗口 K 线（主图+副图） | `chart.addPane()` + `series.moveToPane()` |
| 导出图片 | `chart.takeScreenshot().toDataURL()` |
| 对数轴 | `priceScale.mode: PriceScaleMode.Logarithmic` |
| 多图十字线联动 | `setCrosshairPosition` / `subscribeCrosshairMove` |

---

## 十二、许可与归属（Apache-2.0 要求）

> 需在代码中保留 NOTICE 文件中的 "attribution notice"，并在对用户可见的页面提供指向 https://www.tradingview.com/ 的链接。

- 满足方式一：保留 `layout.attributionLogo: true`（默认，图上显示 TradingView logo）
- 满足方式二：自行在页面放链接，然后可设 `attributionLogo: false`（本项目采用此方式，已在代码注释保留声明）

---

*本文档信息以 `node_modules/lightweight-charts/dist/typings.d.ts`（v5.2.1）为准，如需核对请以安装版本为准。*
