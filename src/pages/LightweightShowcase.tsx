import { useRef, useState } from 'react';
import { useKlineData } from '../hooks/useKlineData';
import { PERIOD_LABEL } from '../types/ohlcv';
import type { KlinePeriod, StockResult } from '../types/ohlcv';
import { dataSourceList, type DataSourceId } from '../data';
import { SHOWCASE_SOURCE_DEFAULTS, supportedPeriodsOf } from './showcaseShared';
import {
  DEFAULT_HISTORY_LIMIT,
  HISTORY_LIMITS,
  isSourceOrNetworkError,
  useStockSearch,
} from './controlsShared';
import {
  LightweightShowcaseChart,
  type LightweightShowcaseChartRef,
} from '../components/charts/LightweightShowcaseChart';
import './LightweightShowcase.css';

/** 页首大图需要 ≥ MIN_BARS 根历史才敢展示全量功能（指标/标记/画线不空洞） */
const MIN_BARS = 60;

/**
 * Lightweight-Charts 单库详解页：页首是功能全开的大型独立 K 线图，
 * 页下是对这个库所有功能的详细中文说明。
 */
export function LightweightShowcase() {
  const [sourceId, setSourceId] = useState<DataSourceId>('tencent');
  const def = SHOWCASE_SOURCE_DEFAULTS[sourceId];
  const [symbol, setSymbol] = useState<string>(def.symbol);
  const [symbolLabel, setSymbolLabel] = useState<string>(def.label);
  const [period, setPeriod] = useState<KlinePeriod>('1d');
  const [live, setLive] = useState(true);
  const [historyLimit, setHistoryLimit] = useState<number>(DEFAULT_HISTORY_LIMIT);
  const chartRef = useRef<LightweightShowcaseChartRef>(null);
  const periodOptions = supportedPeriodsOf(sourceId);

  // A 股搜索（仅数据源声明了 searchSymbols 能力时生效；Binance 等源下静默清空）
  const { query, setQuery, results, setResults, searching, reset: resetSearch } = useStockSearch(sourceId);

  const { history, error } = useKlineData({
    sourceId,
    symbol,
    period,
    historyLimit,
    live,
  });

  const bars = history.length;
  const ready = bars >= MIN_BARS;

  // 数据源切换：标的重置为该源默认；搜索清空；周期回退到该源支持的第一个周期
  function handleSourceChange(next: DataSourceId) {
    const d = SHOWCASE_SOURCE_DEFAULTS[next];
    setSourceId(next);
    setSymbol(d.symbol);
    setSymbolLabel(d.label);
    resetSearch();
    const options = supportedPeriodsOf(next);
    if (!options.includes(period)) setPeriod(options[0]);
  }

  // 从搜索下拉选中标的：切到该标的，清空搜索框与下拉结果
  function pickStock(r: StockResult) {
    setSymbol(r.symbol);
    setSymbolLabel(r.name);
    resetSearch();
  }

  // 周期切换（保持与 handleSourceChange 一致：只改周期，不动标的/搜索）
  function handlePeriodChange(p: KlinePeriod) {
    setPeriod(p);
  }

  // 大图功能开关（对应下方文档的各功能分节）：默认全关，
  // 避免一进来就叠满指标/标记/水印/画线，让用户按需勾选体验
  const [indicators, setIndicators] = useState(false);
  const [markers, setMarkers] = useState(false);
  const [watermark, setWatermark] = useState(false);
  const [trendLine, setTrendLine] = useState(false);
  const [priceLine, setPriceLine] = useState(false);
  const [extraPanes, setExtraPanes] = useState(false);
  const [seriesTypes, setSeriesTypes] = useState(false);

  const periodLabel = PERIOD_LABEL[period];

  return (
    <div className="lw-page">
      <div className="lw-inner">
      <header className="lw-hero">
        <div className="lw-hero-head">
          <h1>Lightweight-Charts 详解</h1>
        </div>
        <div className="lw-controls">
          <label className="lw-field">
            数据源
            <select value={sourceId} onChange={(e) => handleSourceChange(e.target.value as DataSourceId)}>
              {dataSourceList.map((ds) => (
                <option key={ds.id} value={ds.id}>
                  {ds.label}
                </option>
              ))}
            </select>
          </label>
          <label className="lw-field">
            标的
            <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
              {def.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="lw-field">
            周期
            <select value={period} onChange={(e) => handlePeriodChange(e.target.value as KlinePeriod)}>
              {periodOptions.map((p) => (
                <option key={p} value={p}>
                  {PERIOD_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="lw-field lw-live">
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
            实时更新
          </label>
          <label className="lw-field">
            历史K线
            <select value={historyLimit} onChange={(e) => setHistoryLimit(Number(e.target.value))}>
              {HISTORY_LIMITS.map((n) => (
                <option key={n} value={n}>
                  {n} 根
                </option>
              ))}
            </select>
          </label>
          <div className="stock-search">
            <input
              type="text"
              className="stock-search-input"
              placeholder="搜索 A 股股票/指数"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setResults([]);
              }}
            />
            {searching && <span className="search-spinner">…</span>}
            {results.length > 0 && (
              <ul className="search-dropdown">
                {results.map((r) => (
                  <li key={r.symbol}>
                    <button type="button" onClick={() => pickStock(r)}>
                      <span className="search-name">{r.name}</span>
                      <span className="search-symbol">{r.symbol}</span>
                      {r.type && <span className="search-type">{r.type}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="lw-toggles">
            {[
              { key: 'indicators', label: '指标线', on: indicators, set: setIndicators },
              { key: 'seriesTypes', label: '序列类型', on: seriesTypes, set: setSeriesTypes },
              { key: 'markers', label: '买卖标记', on: markers, set: setMarkers },
              { key: 'watermark', label: '水印', on: watermark, set: setWatermark },
              { key: 'trendLine', label: '趋势线', on: trendLine, set: setTrendLine },
              { key: 'priceLine', label: '价格线', on: priceLine, set: setPriceLine },
              { key: 'extraPanes', label: '多面板', on: extraPanes, set: setExtraPanes },
            ].map(({ key, label, on, set }) => (
              <label className={`lw-toggle${on ? ' on' : ''}`} key={key}>
                <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
                {label}
              </label>
            ))}
          </div>
        </div>
      </header>

      <section className="lw-stage">
        <LightweightShowcaseChart
          ref={chartRef}
          data={history}
          symbol={symbol}
          live={live}
          indicators={indicators}
          markers={markers}
          watermark={watermark}
          trendLine={trendLine}
          priceLine={priceLine}
          extraPanes={extraPanes}
          seriesTypes={seriesTypes}
        />
        <span className="sr-only bars-count">{bars} bars</span>
        {!ready && <div className="lw-loading">正在加载历史数据…（{bars} / {MIN_BARS} 根）</div>}
        {/* 数据异常时图表保持显示（空态），把异常提示放在大图右上角 */}
        {error && (
          <div className="lw-stage-error">
            数据异常：{symbolLabel} {periodLabel} {error}
            {isSourceOrNetworkError(error) && '（若为 WAF 拦截等外部因素，可切换数据源或周期重试）'}
          </div>
        )}
      </section>

      <LightweightDocs />
      </div>
    </div>
  );
}

/* ==================== 功能总览表格数据（对应 docs/Lightweight-Charts 详细功能点整理.md） ==================== */

/** 基本信息 */
const LW_BASIC_TABLE: [string, string][] = [
  ['全名', 'TradingView Lightweight Charts（轻量级图表库）'],
  ['当前版本', '5.2.1（本项目安装）'],
  ['作者', 'TradingView'],
  ['协议', 'Apache-2.0（商用 / 修改 / 再分发需保留 NOTICE 归属声明）'],
  ['技术栈', 'HTML5 Canvas 渲染，零框架依赖；仅一个运行时依赖 fancy-canvas@2.1.0'],
  ['仓库', 'https://github.com/tradingview/lightweight-charts'],
  ['官网', 'https://www.tradingview.com/lightweight-charts/'],
  ['打包产物', 'development.mjs / production.mjs（ESM）+ standalone 单文件版（UMD）'],
];

/** 核心架构：三种水平轴 */
const LW_HORZ_SCALE_TABLE: { type: string; entry: string; desc: string }[] = [
  { type: '时间轴（默认）', entry: 'createChart()', desc: '横轴为时间（Time）：UTC 时间戳 / BusinessDay / 日期字符串' },
  { type: '期权 / 价格轴', entry: 'createOptionsChart()', desc: '横轴为价格数值（number），期权隐含波动率曲线等' },
  { type: '收益率曲线轴', entry: 'createYieldCurveChart()', desc: '横轴为到期期限数值，收益率曲线专用' },
];

/** 核心架构：Time 三种写法 */
const LW_TIME_TABLE: { form: string; example: string; desc: string }[] = [
  { form: 'UTCTimestamp', example: '1651564800', desc: '秒级时间戳（注意不是毫秒！本项目接入须 time / 1000）' },
  { form: 'BusinessDay', example: '{ year: 2022, month: 5, day: 3 }', desc: '对象式日期' },
  { form: 'string', example: "'2022-05-03'", desc: '日期字符串' },
];

/** 核心架构：三层 API */
const LW_CORE_API_TABLE: { entry: string; iface: string; role: string }[] = [
  { entry: 'createChart()', iface: 'IChartApi（图表）', role: '最外层容器：addSeries / timeScale / priceScale / panes / attachPrimitive' },
  { entry: 'chart.addSeries()', iface: 'ISeriesApi（系列）', role: 'K 线 / 折线 / 面积 / 直方图 / 基准线 / 自定义' },
  { entry: 'chart.timeScale()', iface: 'ITimeScaleApi（时间轴）', role: '平移缩放、可见区间、坐标换算、事件' },
  { entry: 'chart.priceScale(id)', iface: 'IPriceScaleApi（价格轴）', role: '可见范围、自动缩放、样式' },
  { entry: 'chart.panes()', iface: 'IPaneApi[]（多窗格）', role: '垂直堆叠的横向区域，独立拉伸 / 移动 / 挂插件' },
  { entry: 'chart.attachPrimitive', iface: 'IPanePrimitive（窗格级插件）', role: '在整个窗格（含轴区）自绘' },
];

/** 数据接入：数据模型 */
const LW_DATA_MODEL_TABLE: { iface: string; fields: string; series: string }[] = [
  { iface: 'OhlcData', fields: 'time, open, high, low, close', series: 'Candlestick、Bar' },
  { iface: 'SingleValueData', fields: 'time, value', series: 'Line、Area、Baseline、Histogram' },
  { iface: 'WhitespaceData', fields: '仅 time（空白点，保持时间轴连续）', series: '所有系列' },
  { iface: 'HistogramData', fields: 'time, value, color?', series: 'Histogram' },
  { iface: 'BarData / LineData', fields: 'time, OHLC 或 value, color?', series: '单点自定义颜色' },
  { iface: 'CustomData', fields: 'time, color?, customValues?', series: 'Custom 自定义系列' },
];

/** 数据接入：数据写入 API */
const LW_DATA_WRITE_TABLE: { api: string; role: string }[] = [
  { api: 'setData(data[])', role: '全量替换（必须按时间升序），适合首次加载或整体换数据' },
  { api: 'update(bar, historicalUpdate?)', role: '增量更新：时间等于最后一根则替换、大于则追加；historicalUpdate 可更新非末尾历史点（较慢）' },
  { api: 'pop(count)', role: '从末尾删除 N 根，返回被删数据' },
  { api: 'data()', role: '返回当前全部数据' },
  { api: 'dataByIndex(index, mismatchDirection?)', role: '按逻辑索引取数据，可指定就近搜索方向（MismatchDirection）' },
  { api: "subscribeDataChanged(handler)", role: "监听数据变更（setData / update 触发），handler 收到 'full' | 'update'" },
];

/** 图表类型：7 种系列 */
const LW_SERIES_TABLE: { series: string; entry: string; style: string; point: string }[] = [
  { series: 'K 线', entry: 'CandlestickSeries', style: 'CandlestickStyleOptions', point: '涨 / 跌颜色、影线、边框独立配置' },
  { series: '柱线', entry: 'BarSeries', style: 'BarStyleOptions', point: 'OHLC 柱状图' },
  { series: '折线', entry: 'LineSeries', style: 'LineStyleOptions', point: 'LineType：直线 / 阶梯 / 曲线' },
  { series: '面积', entry: 'AreaSeries', style: 'AreaStyleOptions', point: '上下渐变填充、可反向填充、可相对基准值' },
  { series: '直方图', entry: 'HistogramSeries', style: 'HistogramStyleOptions', point: 'base 基准线、每根可独立上色（成交量标准做法）' },
  { series: '基准线', entry: 'BaselineSeries', style: 'BaselineStyleOptions', point: '以 baseValue 分界上下双色填充（涨跌对比图）' },
  { series: '自定义', entry: 'addCustomSeries()', style: 'CustomStyleOptions', point: '自绘渲染器实现库不支持的图表类型' },
];

/** 图表类型：价格格式 */
const LW_PRICE_FORMAT_TABLE: { type: string; desc: string }[] = [
  { type: 'price', desc: '常规价格：precision 小数位 + minMove 最小跳动（默认 0.01）；小价格可用 base = 1/minMove 规避浮点精度' },
  { type: 'volume', desc: '缩写格式：1.2K / 12.67M（本项目成交量轴所用）' },
  { type: 'percent', desc: '末尾加 %' },
  { type: 'custom', desc: '完全自定义 formatter 函数' },
];

/** 图表配置：尺寸与缩放 */
const LW_SIZE_TABLE: { opt: string; desc: string }[] = [
  { opt: 'width / height', desc: '像素尺寸；默认 0 = 跟随容器' },
  { opt: 'autoSize', desc: 'ResizeObserver 自动跟随容器尺寸（需浏览器支持，否则回退固定尺寸）' },
  { opt: 'defaultVisiblePriceScaleId', desc: '默认使用左 / 右价格轴（默认 right）' },
];

/** 图表配置：时间轴 */
const LW_TIMESCALE_TABLE: { opt: string; desc: string }[] = [
  { opt: 'rightOffset / rightOffsetPixels', desc: '右侧留白（根 / 像素）' },
  { opt: 'barSpacing / minBarSpacing / maxBarSpacing', desc: '柱间距' },
  { opt: 'fixLeftEdge / fixRightEdge', desc: '锁定左右边界，禁止滚出数据范围' },
  { opt: 'lockVisibleTimeRangeOnResize', desc: '尺寸变化时保持可见时间范围' },
  { opt: 'rightBarStaysOnScroll', desc: '滚动时悬停柱不移动' },
  { opt: 'timeVisible / secondsVisible', desc: '显示时间 / 秒' },
  { opt: 'shiftVisibleRangeOnNewBar', desc: '新数据追加时自动右移（实时图关键开关）' },
  { opt: 'tickMarkFormatter', desc: '自定义时间刻度标签' },
  { opt: 'uniformDistribution', desc: '同权重刻度要么全画要么不画' },
  { opt: 'minimumHeight', desc: '时间轴最小高度' },
  { opt: 'allowBoldLabels', desc: '主刻度粗体' },
  { opt: 'enableConflation', desc: '数据融合：柱间距 < 0.5px 时自动合并数据点，大幅提升大数据量缩小时的渲染性能' },
  { opt: 'conflationThresholdFactor', desc: '融合平滑系数（1.0~8.0+，sparkline 小图用高值更平滑）' },
  { opt: 'precomputeConflationOnInit', desc: '加载后后台预计算融合块（>10K 点大数据集缩放大提速 10-100x，代价是初始加载 +100-500ms、内存 +20-50%）' },
];

/** 图表配置：价格轴 */
const LW_PRICESCALE_TABLE: { opt: string; desc: string }[] = [
  { opt: 'mode', desc: 'Normal 线性 / Logarithmic 对数 / Percentage 百分比（首个可见值为 0%）/ IndexedTo100（首值置 100）' },
  { opt: 'autoScale', desc: '自动适配可见数据范围（overlay 轴恒为 true）' },
  { opt: 'invertScale', desc: '上下反转' },
  { opt: 'scaleMargins', desc: '上下留白比例（默认 { bottom: 0.1, top: 0.2 }）' },
  { opt: 'visible / borderVisible / borderColor / textColor', desc: '可见性与样式' },
  { opt: 'alignLabels', desc: '标签对齐防重叠' },
  { opt: 'minimumWidth', desc: '最小宽度（多图对齐用）' },
  { opt: 'tickMarkDensity', desc: '刻度密度（默认 2.5）' },
  { opt: 'ensureEdgeTickMarksVisible', desc: '上下边缘强制显示刻度' },
];

/** API 清单：IChartApi */
const LW_CHART_API_TABLE: { api: string; role: string }[] = [
  { api: 'remove()', role: '销毁图表及全部 DOM（不可逆）' },
  { api: 'resize(w, h, forceRepaint?)', role: '手动改尺寸；forceRepaint 立即重绘（截图前用）' },
  { api: 'addSeries(def, options?, paneIndex?)', role: '添加系列到指定窗格' },
  { api: 'addCustomSeries(paneView, options?, paneIndex?)', role: '添加自定义绘制系列' },
  { api: 'removeSeries(series)', role: '移除系列（不可逆）' },
  { api: 'subscribeClick / subscribeDblClick / subscribeCrosshairMove', role: '点击 / 双击 / 十字线移动事件（MouseEventParams）' },
  { api: 'priceScale(id, paneIndex?)', role: '获取价格轴 API' },
  { api: 'timeScale()', role: '获取时间轴 API' },
  { api: 'applyOptions / options()', role: '运行期改 / 查配置' },
  { api: 'takeScreenshot()', role: '返回图表 Canvas，可 toDataURL / toBlob 导出 PNG' },
  { api: 'addPane() / panes() / removePane(i) / swapPanes(a, b)', role: '多窗格管理' },
  { api: 'setCrosshairPosition / clearCrosshairPosition', role: '编程设置 / 清除十字线（多图联动用）' },
  { api: 'chartElement() / paneSize(i?)', role: '内部容器 div / 绘图区像素尺寸' },
  { api: 'autoSizeActive()', role: '是否处于 ResizeObserver 自动尺寸模式' },
];

/** API 清单：ITimeScaleApi */
const LW_TIMESCALE_API_TABLE: { api: string; role: string }[] = [
  { api: 'scrollPosition / scrollToPosition / scrollToRealTime', role: '编程滚动' },
  { api: 'getVisibleRange / setVisibleRange', role: '时间范围（不能外推已有数据）' },
  { api: 'getVisibleLogicalRange / setVisibleLogicalRange', role: '逻辑索引范围' },
  { api: 'resetTimeScale / fitContent', role: '重置 / 缩放到显示全部数据' },
  { api: 'logicalToCoordinate / coordinateToLogical / timeToIndex / timeToCoordinate / coordinateToTime / width / height', role: '坐标换算' },
  { api: 'subscribeVisibleTimeRangeChange / subscribeVisibleLogicalRangeChange / subscribeSizeChange', role: '事件（滚动加载历史的入口）' },
];

/** API 清单：IPriceScaleApi */
const LW_PRICESCALE_API_TABLE: { api: string; role: string }[] = [
  { api: 'applyOptions / options / width', role: '改 / 查配置与宽度' },
  { api: 'setVisibleRange / getVisibleRange', role: '设置 / 读取可见价格范围' },
  { api: 'setAutoScale(on)', role: '编程开关自动缩放' },
];

/** API 清单：ISeriesApi（数据方法见「数据接入」） */
const LW_SERIES_API_TABLE: { api: string; role: string }[] = [
  { api: 'priceFormatter()', role: '复用图表价格格式化逻辑' },
  { api: 'priceToCoordinate(price) / coordinateToPrice(coord)', role: '价格与像素互转' },
  { api: 'barsInLogicalRange(range)', role: '返回某逻辑范围内 bar 数量与前后余量（滚动加载历史的标准用法）' },
  { api: 'createPriceLine / removePriceLine / priceLines', role: '参考价格线（自定义水平线，含轴标签 / 标题 / 颜色）' },
  { api: 'lastValueData(globalLast)', role: '最后价格及颜色（globalLast=false 取当前可见范围内最后一个）' },
  { api: 'attachPrimitive / detachPrimitive', role: '挂载 / 卸载系列级插件' },
  { api: 'seriesType()', role: '当前系列类型' },
  { api: 'moveToPane(i) / getPane()', role: '跨窗格移动 / 所在窗格 API' },
  { api: 'seriesOrder() / setSeriesOrder(n)', role: '绘制层级' },
];

/** API 清单：IPaneApi */
const LW_PANE_API_TABLE: { api: string; role: string }[] = [
  { api: 'getHeight / setHeight', role: '固定高度' },
  { api: 'getStretchFactor / setStretchFactor', role: '窗格相对高度占比（多窗格布局，本项目 7:3 用的它）' },
  { api: 'moveTo() / paneIndex() / getSeries()', role: '换位 / 索引 / 反查序列' },
  { api: 'priceScale(id)', role: '取本窗格内的价格轴（主图 priceScale 查不到副图）' },
  { api: 'attachPrimitive / detachPrimitive', role: '窗格级插件' },
  { api: 'getHTMLElement()', role: '窗格 DOM 元素' },
  { api: 'setPreserveEmptyPane()', role: '窗格无数据时是否保留' },
  { api: 'addSeries / addCustomSeries', role: '窗格内直接创建系列' },
];

/** 插件体系：内置官方插件 */
const LW_PLUGIN_TABLE: { fn: string; role: string }[] = [
  { fn: 'createSeriesMarkers(series, markers, options?)', role: '系列标记插件：K 线上画买卖点标记' },
  { fn: 'createUpDownMarkers(series, options?)', role: '涨跌标记插件：价格变动后自动显示涨 / 跌箭头，可设时长自动消失' },
  { fn: 'createTextWatermark(pane, options)', role: '文字水印（Logo、版权、仅供演示等）' },
  { fn: 'createImageWatermark(pane, imageUrl, options)', role: '图片水印' },
  { fn: 'createYieldCurveChart / createOptionsChart', role: '前述专用图表类型' },
];

/** 插件体系：系列标记属性 */
const LW_MARKER_TABLE: { field: string; desc: string }[] = [
  { field: 'time / position', desc: '位置：aboveBar / belowBar / inBar，或价格轴定位 atPriceTop / atPriceMiddle / atPriceBottom + price' },
  { field: 'shape', desc: 'circle / square / arrowUp / arrowDown' },
  { field: 'color / text / size / id', desc: '外观与标识' },
  { field: 'autoScale', desc: '缩放计算包含标记' },
  { field: 'zOrder', desc: 'top / aboveSeries / normal' },
];

/** 插件体系：自绘接口 */
const LW_PRIMITIVE_TABLE: { hook: string; role: string }[] = [
  { hook: 'priceAxisViews / timeAxisViews', role: '在坐标轴上绘制标签（如自定义指标值）' },
  { hook: 'paneViews / priceAxisPaneViews / timeAxisPaneViews', role: '在主图区 / 轴区绘制任意图形' },
  { hook: 'autoscaleInfo()', role: '扩展自动缩放范围（把自绘图形纳入可见范围）' },
  { hook: 'attached / detached', role: '生命周期钩子' },
  { hook: 'hitTest(x, y)', role: '自定义命中检测 + 自定义光标' },
  { hook: 'updateAllViews()', role: '视口变化时重算' },
];

/** 性能特性 */
const LW_PERF_TABLE: { feature: string; desc: string }[] = [
  { feature: 'Canvas 渲染', desc: '非 SVG/DOM，万级数据点流畅' },
  { feature: '逻辑范围渲染', desc: '只绘制可见区域数据' },
  { feature: '数据融合（Conflation）', desc: '柱间距 < 0.5px 自动合并数据点；enableConflation + conflationThresholdFactor 可调；precomputeConflationOnInit 后台预计算（>10K 点建议开启）' },
  { feature: '增量更新', desc: 'update() 只重绘变动，比 setData 全量高效（实时行情标准做法）' },
  { feature: '单一依赖', desc: '仅 fancy-canvas，无重依赖树' },
  { feature: 'autoscaleInfoProvider', desc: '可覆盖缩放计算，避免重复布局抖动' },
];

/** 事件系统汇总 */
const LW_EVENT_TABLE: { event: string; api: string; use: string }[] = [
  { event: '点击', api: 'chart.subscribeClick', use: '选中交互' },
  { event: '双击', api: 'chart.subscribeDblClick', use: '重置缩放等' },
  { event: '十字线移动', api: 'chart.subscribeCrosshairMove', use: '十字线行情联动、tooltip' },
  { event: '数据变更', api: 'series.subscribeDataChanged', use: '数据同步' },
  { event: '可见范围变化', api: 'timeScale.subscribeVisibleTimeRangeChange / subscribeVisibleLogicalRangeChange', use: '滚动加载历史、懒加载' },
  { event: '时间轴尺寸变化', api: 'timeScale.subscribeSizeChange', use: '布局适配' },
];

/** 事件系统：MouseEventParams 关键字段 */
const LW_MOUSE_PARAMS_TABLE: { field: string; desc: string }[] = [
  { field: 'time / logical / point / paneIndex', desc: '时间 / 逻辑索引 / 屏幕坐标 / 所在窗格' },
  { field: 'seriesData', desc: 'Map：当前点所有系列的数据' },
  { field: 'hoveredInfo', desc: '命中的图元类型：series-point / series-line / series-range / marker / price-line / primitive / custom' },
];

/** 坐标系统 */
const LW_COORD_TABLE: { concept: string; desc: string }[] = [
  { concept: 'Logical（逻辑索引）', desc: '数据在时间轴上的整数索引；LogicalRange 是可见索引区间，支持用索引精确设置可视范围' },
  { concept: 'Time（时间）', desc: '真实时间值（Time 类型）；setVisibleRange 不能外推已有数据' },
];

/** 与常见需求对照 */
const LW_NEEDS_TABLE: { need: string; usage: string }[] = [
  { need: '实时行情增量推送', usage: 'update() + timeScale.shiftVisibleRangeOnNewBar' },
  { need: '滚动加载历史', usage: 'subscribeVisibleLogicalRangeChange + barsInLogicalRange 判断余量' },
  { need: '买卖点标记', usage: 'createSeriesMarkers' },
  { need: '最新价线', usage: 'priceLineVisible: true（默认开启）' },
  { need: '自定义水平参考线', usage: 'series.createPriceLine({ price, title, color })' },
  { need: '自定义指标（MACD/KDJ）', usage: '自定义系列或 attachPrimitive 在窗格 / 轴绘制' },
  { need: '成交量柱', usage: 'Histogram 序列绑定覆盖价格轴' },
  { need: '多窗口 K 线（主图 + 副图）', usage: 'chart.addPane() + series.moveToPane()' },
  { need: '导出图片', usage: 'chart.takeScreenshot().toDataURL()' },
  { need: '对数轴', usage: 'priceScale.mode: PriceScaleMode.Logarithmic' },
  { need: '多图十字线联动', usage: 'setCrosshairPosition / subscribeCrosshairMove' },
];

/** 许可与归属 */
const LW_LICENSE_TABLE: { way: string; desc: string }[] = [
  { way: '方式一', desc: '保留 layout.attributionLogo: true（默认，图上显示 TradingView logo）' },
  { way: '方式二', desc: '页面自行放指向 tradingview.com 的链接，然后可设 attributionLogo: false（本项目采用，已在代码注释保留声明）' },
];

function LightweightDocs() {
  return (
    <div className="lw-docs">
      <h2 className="lw-docs-title">Lightweight-Charts 库详解</h2>
      <p className="lw-docs-lead">
        Lightweight-Charts 是 TradingView 官方出品的开源图表库（Apache-2.0，约 45kb gzip），
        主打“轻量”：不内置任何指标与画线工具，一切交给数据与代码。它把“图表”拆成一套
        清晰的对象模型——序列（Series）表达数据、面板（Pane）承载序列、价格轴与时间轴负责
        映射——上层能力（指标、标记、水印、自定义图元）全部通过可组合的 API 挂上去。
      </p>

      {/* ==================== 第一节：功能总览（所有功能表格集中于此） ==================== */}
      <section className="lw-doc-section">
        <h3>功能总览</h3>
        <p>
          本页基于项目实际安装的 <code>lightweight-charts@5.2.1</code>（TradingView 出品，
          Apache-2.0，约 45kb gzip）。下表集中列出全部功能点：基本信息、核心架构、数据接入、
          图表类型、图表配置、API 方法清单、插件体系、性能特性、事件系统、坐标系统、
          常见需求对照与许可归属，后续章节逐一展开讲解。
        </p>

        {/* —— 基本信息 —— */}
        <h4 className="lw-subhead">基本信息</h4>
        <div className="lw-doc-table-wrap">
          <table className="lw-doc-table">
            <tbody>
              {LW_BASIC_TABLE.map(([k, v]) => (
                <tr key={k}>
                  <th className="lw-fkey">{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— 核心架构：三种水平轴 —— */}
        <h4 className="lw-subhead">核心架构：三种水平轴（HorzScale）</h4>
        <div className="lw-doc-table-wrap">
          <table className="lw-doc-table">
            <thead>
              <tr>
                <th>类型</th>
                <th>入口函数</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {LW_HORZ_SCALE_TABLE.map((r) => (
                <tr key={r.type}>
                  <td>{r.type}</td>
                  <td><code>{r.entry}</code></td>
                  <td>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          扩展机制：<code>createChartEx()</code> + 自定义 <code>IHorzScaleBehavior</code>
          可实现任意类型横轴（类别轴、K 线索引轴等）。
        </p>

        {/* —— 核心架构：Time 类型 —— */}
        <h4 className="lw-subhead">核心架构：Time 时间类型（三种写法）</h4>
        <div className="lw-doc-table-wrap">
          <table className="lw-doc-table">
            <thead>
              <tr>
                <th>写法</th>
                <th>示例</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {LW_TIME_TABLE.map((r) => (
                <tr key={r.form}>
                  <td><code>{r.form}</code></td>
                  <td><code>{r.example}</code></td>
                  <td>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— 核心架构：三层 API —— */}
        <h4 className="lw-subhead">核心架构：三层 API 结构</h4>
        <div className="lw-doc-table-wrap">
          <table className="lw-doc-table">
            <thead>
              <tr>
                <th>入口</th>
                <th>接口</th>
                <th>作用</th>
              </tr>
            </thead>
            <tbody>
              {LW_CORE_API_TABLE.map((r) => (
                <tr key={r.entry}>
                  <td><code>{r.entry}</code></td>
                  <td>{r.iface}</td>
                  <td>{r.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— 数据接入：数据模型 —— */}
        <h4 className="lw-subhead">数据接入：数据模型</h4>
        <div className="lw-doc-table-wrap">
          <table className="lw-doc-table">
            <thead>
              <tr>
                <th>数据接口</th>
                <th>字段</th>
                <th>适用系列</th>
              </tr>
            </thead>
            <tbody>
              {LW_DATA_MODEL_TABLE.map((r) => (
                <tr key={r.iface}>
                  <td><code>{r.iface}</code></td>
                  <td>{r.fields}</td>
                  <td>{r.series}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— 数据接入：数据写入 API —— */}
        <h4 className="lw-subhead">数据接入：数据写入 API（ISeriesApi）</h4>
        <div className="lw-doc-table-wrap">
          <table className="lw-doc-table">
            <thead>
              <tr>
                <th>方法</th>
                <th>作用</th>
              </tr>
            </thead>
            <tbody>
              {LW_DATA_WRITE_TABLE.map((r) => (
                <tr key={r.api}>
                  <td><code>{r.api}</code></td>
                  <td>{r.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— 图表类型 —— */}
        <h4 className="lw-subhead">图表类型（Series Type，7 种）</h4>
        <div className="lw-doc-table-wrap">
          <table className="lw-doc-table">
            <thead>
              <tr>
                <th>系列</th>
                <th>定义常量</th>
                <th>样式选项</th>
                <th>要点</th>
              </tr>
            </thead>
            <tbody>
              {LW_SERIES_TABLE.map((r) => (
                <tr key={r.series}>
                  <td>{r.series}</td>
                  <td><code>{r.entry}</code></td>
                  <td><code>{r.style}</code></td>
                  <td>{r.point}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          系列通用选项（<code>SeriesOptionsCommon</code>）：<code>title</code> / <code>visible</code>
          / <code>priceScaleId</code>（绑定左 / 右 / 覆盖轴）、<code>lastValueVisible</code>
          （最后价标签）、<code>priceLine*</code>（最新价横线）、<code>baseLine*</code>（基准线）、
          <code>priceFormat</code>、<code>autoscaleInfoProvider</code>、
          <code>hitTestTolerance</code>（点击命中容差，默认 3px）、<code>conflationThresholdFactor</code>。
          线样式枚举：<code>LineStyle</code>（Solid / Dotted / Dashed / LargeDashed / SparseDotted）、
          <code>LineType</code>（Simple / WithSteps / Curved）、<code>LineWidth</code>（1~4）、
          <code>LastPriceAnimationMode</code>（最新价点动画）。
        </p>

        {/* —— 价格格式 —— */}
        <h4 className="lw-subhead">价格格式（PriceFormat）</h4>
        <div className="lw-doc-table-wrap">
          <table className="lw-doc-table">
            <thead>
              <tr>
                <th>类型</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {LW_PRICE_FORMAT_TABLE.map((r) => (
                <tr key={r.type}>
                  <td><code>{r.type}</code></td>
                  <td>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— 图表配置：尺寸与缩放 —— */}
        <h4 className="lw-subhead">图表配置：尺寸与缩放</h4>
        <div className="lw-doc-table-wrap">
          <table className="lw-doc-table">
            <thead>
              <tr>
                <th>选项</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {LW_SIZE_TABLE.map((r) => (
                <tr key={r.opt}>
                  <td><code>{r.opt}</code></td>
                  <td>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— 图表配置：布局 / 光标 / 网格 / 交互 / 本地化 —— */}
        <h4 className="lw-subhead">图表配置：布局 / 光标 / 网格 / 交互 / 本地化</h4>
        <ul>
          <li>
            <strong>布局（LayoutOptions）</strong>：<code>background</code> 纯色或垂直渐变
            （ColorType.Solid / VerticalGradient）；<code>textColor / fontSize / fontFamily</code>
            坐标轴文字；<code>panes</code> 分隔线颜色与拖拽调高开关；
            <code>attributionLogo</code>（TradingView 归属 logo，本项目关闭后在文档保留声明）；
            <code>colorSpace</code>（srgb / display-p3）；<code>colorParsers</code>（扩展
            display-p3、lab、lch、oklab 等自定义颜色格式解析）。
          </li>
          <li>
            <strong>十字光标（CrosshairOptions）</strong>：<code>mode</code>
            （Normal / Magnet 磁吸到最新价（默认）/ Hidden / MagnetOHLC）；
            <code>vertLine / horzLine</code> 颜色宽度样式；<code>doNotSnapToHiddenSeriesIndices</code>。
          </li>
          <li>
            <strong>网格（GridOptions）</strong>：<code>vertLines / horzLines</code> 颜色、线型、可见性。
          </li>
          <li>
            <strong>交互</strong>：<code>handleScroll</code>（mouseWheel / pressedMouseMove /
            horzTouchDrag / vertTouchDrag）、<code>handleScale</code>（mouseWheel / pinch /
            axisPressedMouseMove / axisDoubleClickReset）、<code>kineticScroll</code> 惯性滚动、
            <code>trackingMode</code> 移动端长按退出方式、<code>hoveredSeriesOnTop</code> 悬停系列置顶。
          </li>
          <li>
            <strong>本地化（LocalizationOptions）</strong>：<code>locale</code>、<code>priceFormatter</code>
            / <code>tickmarksPriceFormatter</code>、<code>percentageFormatter</code> / <code>tickmarksPercentageFormatter</code>。
          </li>
        </ul>

        {/* —— 图表配置：时间轴 —— */}
        <h4 className="lw-subhead">图表配置：时间轴（TimeScaleOptions，最常用）</h4>
        <div className="lw-doc-table-wrap">
          <table className="lw-doc-table">
            <thead>
              <tr>
                <th>选项</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {LW_TIMESCALE_TABLE.map((r) => (
                <tr key={r.opt}>
                  <td><code>{r.opt}</code></td>
                  <td>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— 图表配置：价格轴 —— */}
        <h4 className="lw-subhead">图表配置：价格轴（PriceScaleOptions）</h4>
        <div className="lw-doc-table-wrap">
          <table className="lw-doc-table">
            <thead>
              <tr>
                <th>选项</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {LW_PRICESCALE_TABLE.map((r) => (
                <tr key={r.opt}>
                  <td><code>{r.opt}</code></td>
                  <td>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          左右 / 覆盖三组价格轴可独立配置：<code>leftPriceScale</code> / <code>rightPriceScale</code>
          / <code>overlayPriceScales</code>。
        </p>

        {/* —— API 方法清单 —— */}
        <h4 className="lw-subhead">API 方法清单：IChartApi</h4>
        <div className="lw-doc-table-wrap">
          <table className="lw-doc-table">
            <thead>
              <tr>
                <th>方法</th>
                <th>作用</th>
              </tr>
            </thead>
            <tbody>
              {LW_CHART_API_TABLE.map((r) => (
                <tr key={r.api}>
                  <td><code>{r.api}</code></td>
                  <td>{r.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h4 className="lw-subhead">API 方法清单：ITimeScaleApi</h4>
        <div className="lw-doc-table-wrap">
          <table className="lw-doc-table">
            <thead>
              <tr>
                <th>方法</th>
                <th>作用</th>
              </tr>
            </thead>
            <tbody>
              {LW_TIMESCALE_API_TABLE.map((r) => (
                <tr key={r.api}>
                  <td><code>{r.api}</code></td>
                  <td>{r.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h4 className="lw-subhead">API 方法清单：IPriceScaleApi</h4>
        <div className="lw-doc-table-wrap">
          <table className="lw-doc-table">
            <thead>
              <tr>
                <th>方法</th>
                <th>作用</th>
              </tr>
            </thead>
            <tbody>
              {LW_PRICESCALE_API_TABLE.map((r) => (
                <tr key={r.api}>
                  <td><code>{r.api}</code></td>
                  <td>{r.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h4 className="lw-subhead">API 方法清单：ISeriesApi（数据方法见上）</h4>
        <div className="lw-doc-table-wrap">
          <table className="lw-doc-table">
            <thead>
              <tr>
                <th>方法</th>
                <th>作用</th>
              </tr>
            </thead>
            <tbody>
              {LW_SERIES_API_TABLE.map((r) => (
                <tr key={r.api}>
                  <td><code>{r.api}</code></td>
                  <td>{r.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h4 className="lw-subhead">API 方法清单：IPaneApi</h4>
        <div className="lw-doc-table-wrap">
          <table className="lw-doc-table">
            <thead>
              <tr>
                <th>方法</th>
                <th>作用</th>
              </tr>
            </thead>
            <tbody>
              {LW_PANE_API_TABLE.map((r) => (
                <tr key={r.api}>
                  <td><code>{r.api}</code></td>
                  <td>{r.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— 插件体系 —— */}
        <h4 className="lw-subhead">插件体系：内置官方插件（Primitives）</h4>
        <div className="lw-doc-table-wrap">
          <table className="lw-doc-table">
            <thead>
              <tr>
                <th>函数</th>
                <th>功能</th>
              </tr>
            </thead>
            <tbody>
              {LW_PLUGIN_TABLE.map((r) => (
                <tr key={r.fn}>
                  <td><code>{r.fn}</code></td>
                  <td>{r.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h4 className="lw-subhead">插件体系：系列标记属性（SeriesMarker）</h4>
        <div className="lw-doc-table-wrap">
          <table className="lw-doc-table">
            <thead>
              <tr>
                <th>属性</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {LW_MARKER_TABLE.map((r) => (
                <tr key={r.field}>
                  <td><code>{r.field}</code></td>
                  <td>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h4 className="lw-subhead">插件体系：自绘插件接口</h4>
        <div className="lw-doc-table-wrap">
          <table className="lw-doc-table">
            <thead>
              <tr>
                <th>钩子</th>
                <th>作用</th>
              </tr>
            </thead>
            <tbody>
              {LW_PRIMITIVE_TABLE.map((r) => (
                <tr key={r.hook}>
                  <td><code>{r.hook}</code></td>
                  <td>{r.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          系列级 <code>ISeriesPrimitive</code> 挂到 <code>ISeriesApi.attachPrimitive</code>；
          窗格级 <code>IPanePrimitive</code> 挂到 <code>IPaneApi.attachPrimitive</code>，作用于整个
          窗格（含轴区）。渲染器 <code>draw(target, utils)</code> 直接操作 Canvas 上下文；
          <code>drawBackground()</code> 画在背景层；<code>zOrder()</code> 控制绘制层级。
          自定义系列用 <code>addCustomSeries()</code>：<code>ICustomSeriesPaneView</code> 定义
          数据→价格换算（<code>priceValueBuilder</code>）、绘制与命中测试，支持数据压缩与
          <code>customValues</code> 透传。
        </p>

        {/* —— 性能特性 —— */}
        <h4 className="lw-subhead">性能特性</h4>
        <div className="lw-doc-table-wrap">
          <table className="lw-doc-table">
            <thead>
              <tr>
                <th>特性</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {LW_PERF_TABLE.map((r) => (
                <tr key={r.feature}>
                  <td>{r.feature}</td>
                  <td>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— 事件系统 —— */}
        <h4 className="lw-subhead">事件系统汇总</h4>
        <div className="lw-doc-table-wrap">
          <table className="lw-doc-table">
            <thead>
              <tr>
                <th>事件</th>
                <th>API</th>
                <th>典型用途</th>
              </tr>
            </thead>
            <tbody>
              {LW_EVENT_TABLE.map((r) => (
                <tr key={r.event}>
                  <td>{r.event}</td>
                  <td><code>{r.api}</code></td>
                  <td>{r.use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h4 className="lw-subhead">事件参数（MouseEventParams 关键字段）</h4>
        <div className="lw-doc-table-wrap">
          <table className="lw-doc-table">
            <thead>
              <tr>
                <th>字段</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {LW_MOUSE_PARAMS_TABLE.map((r) => (
                <tr key={r.field}>
                  <td><code>{r.field}</code></td>
                  <td>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— 坐标系统 —— */}
        <h4 className="lw-subhead">坐标系统（Logical vs Time）</h4>
        <div className="lw-doc-table-wrap">
          <table className="lw-doc-table">
            <thead>
              <tr>
                <th>概念</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {LW_COORD_TABLE.map((r) => (
                <tr key={r.concept}>
                  <td><code>{r.concept}</code></td>
                  <td>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          两者可互转：<code>logicalToCoordinate</code> / <code>timeToIndex</code> /
          <code>coordinateToTime</code> 等。
        </p>

        {/* —— 与常见需求对照 —— */}
        <h4 className="lw-subhead">与常见需求对照</h4>
        <div className="lw-doc-table-wrap">
          <table className="lw-doc-table">
            <thead>
              <tr>
                <th>需求</th>
                <th>用法</th>
              </tr>
            </thead>
            <tbody>
              {LW_NEEDS_TABLE.map((r) => (
                <tr key={r.need}>
                  <td>{r.need}</td>
                  <td><code>{r.usage}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— 许可与归属 —— */}
        <h4 className="lw-subhead">许可与归属（Apache-2.0 要求）</h4>
        <div className="lw-doc-table-wrap">
          <table className="lw-doc-table">
            <thead>
              <tr>
                <th>方式</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {LW_LICENSE_TABLE.map((r) => (
                <tr key={r.way}>
                  <td>{r.way}</td>
                  <td>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          完整功能点整理见 <code>docs/Lightweight-Charts 详细功能点整理.md</code>，
          页面数据与之同源。
        </p>
      </section>

      <section className="lw-doc-section">
        <h3>核心对象模型</h3>
        <table className="lw-doc-table">
          <thead>
            <tr>
              <th>概念</th>
              <th>类型 / 入口</th>
              <th>作用</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>图表</td>
              <td><code>createChart(el, options)</code> → <code>IChartApi</code></td>
              <td>最外层容器，持有时间轴与右侧价格轴</td>
            </tr>
            <tr>
              <td>序列</td>
              <td><code>chart.addSeries(定义, 选项, paneIndex?)</code></td>
              <td>一类数据在图上的一种画法；可指定落在哪个面板（0=主图）</td>
            </tr>
            <tr>
              <td>面板</td>
              <td><code>chart.panes()</code> → <code>IPaneApi[]</code></td>
              <td>垂直堆叠的横向区域；独立拉伸系数、可移动、可挂插件</td>
            </tr>
            <tr>
              <td>价格刻度</td>
              <td><code>chart.priceScale(id)</code> → <code>IPriceScaleApi</code></td>
              <td>右侧价格轴；用 <code>scaleMargins</code> 控制序列在面板内的占位</td>
            </tr>
            <tr>
              <td>时间刻度</td>
              <td><code>chart.timeScale()</code> → <code>ITimeScaleApi</code></td>
              <td>底部时间轴；平移缩放、可见区间、回最新</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="lw-doc-section">
        <h3>时间与数据</h3>
        <p>
          时间戳是这套模型最容易踩的坑：<code>UTCTimestamp</code> 以<strong>秒</strong>为单位，
          而本项目统一协议 <code>OHLCV.time</code> 是<strong>毫秒</strong>，接入时必须
          <code>time / 1000</code>，否则日期会漂到 1970 年之后几百年。
        </p>
        <ul>
          <li><code>series.setData(data)</code>：全量替换，适合首次加载或整体换数据。</li>
          <li><code>series.update(bar)</code>：增量更新，按时间戳“追尾”——同一根时间戳替换、新时间戳追加，适合实时推送，避免全量重绘。</li>
          <li>增量与全量可混用：本项目实时推送时先 <code>findIndex</code> 找到已渲染的最后一根，从其起点逐根 <code>update()</code>；找不到或时间倒退则退化全量 <code>setData</code>。</li>
          <li><code>localization.timeFormatter</code>：自定义时间刻度文案，本页把它格式化为 <code>YYYY-MM-DD</code>。</li>
        </ul>
      </section>

      <section className="lw-doc-section">
        <h3>五种内置序列类型</h3>
        <table className="lw-doc-table">
          <thead>
            <tr>
              <th>序列</th>
              <th>入口常量</th>
              <th>适合</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>K 线</td><td><code>CandlestickSeries</code></td><td>金融行情主图</td></tr>
            <tr><td>折线</td><td><code>LineSeries</code></td><td>均线 / 指标曲线</td></tr>
            <tr><td>面积</td><td><code>AreaSeries</code></td><td>趋势面的渐变填充</td></tr>
            <tr><td>柱状</td><td><code>BarSeries</code></td><td>传统 OHLC 柱</td></tr>
            <tr><td>基线</td><td><code>BaselineSeries</code></td><td>围绕某基线的涨跌二分着色</td></tr>
            <tr><td>直方图</td><td><code>HistogramSeries</code></td><td>成交量 / MACD 柱</td></tr>
          </tbody>
        </table>
        <p>
          本页大图把折线/面积/柱状/基线四种同时叠在主图 K 线之上，并把直方图用作成交量与
          附加面板——同一份数据可以按任意序列类型重复绘制，这正是“序列与数据分离”的体现。
        </p>
        <p>
          序列选项里有几个常用的 <code>SeriesOptionsCommon</code> 公共项：<code>title</code>
          （序列名，显示在最后价标签旁）、<code>lastValueVisible</code>（是否显示最后价
          标签）、<code>priceLineVisible</code>（跟随最新价的虚线）。本页主图 K 线
          <code>title: '主图K线'</code>、收盘线 <code>title: '收盘'</code> 均开启了这三项。
          另外 <code>LineSeries</code> 的 <code>lineType</code> 可切换画线风格——本页收盘线
          用 <code>LineType.WithSteps</code> 画成阶梯线（与均线的光滑线并排，肉眼可辨差异）。
        </p>
      </section>

      <section className="lw-doc-section">
        <h3>多面板与价格刻度</h3>
        <p>
          本页大图的结构是——主图 K 线（面板 0）、成交量（面板 1）、涨跌幅直方图（面板 2，
          由「多面板」开关控制显隐）。
        </p>
        <p>
          每个面板可用 <code>IPaneApi</code> 控制：<code>setStretchFactor()</code> 调整纵向
          拉伸权重、<code>setHeight()</code> 固定高度、<code>moveTo()</code> 拖动换位、
          <code>getSeries()</code> 反查序列。本页主图与成交量面板用
          <code>setStretchFactor(7)</code> / <code>setStretchFactor(3)</code> 按 7:3 分配高度。
        </p>
        <p>
          面板内序列的纵向占位由价格刻度控制，且<strong>取副图刻度必须经
          <code>{'chart.panes()[1].priceScale(id)'}</code></strong>——<code>chart.priceScale(id)</code>
          只查主图。本页成交量面板的序列<strong>不写 priceScaleId</strong>，自动挂到该
          pane 的默认右侧刻度（官方 panes 教程的写法），再用
          <code>{'chart.panes()[1].priceScale(\'right\').applyOptions({ scaleMargins: { top: 0.5, bottom: 0 } })'}</code>
          ：top 0.5 让最高量能柱恰好到面板中线（量能柱占下面一半，视觉上不高不矮）。
          注意不要用命名刻度（如 <code>{'priceScaleId: \'vol\''}</code>）——命名/overlay
          刻度库源码里永远不配轴 widget，会让该 pane 右轴只剩边框、一个刻度数字都没有。
        </p>
      </section>

      <section className="lw-doc-section">
        <h3>指标与数据计算</h3>
        <p>
          库本身<strong>没有内置指标</strong>——这是它与 klinecharts 最大的区别，也是“轻量”
          的含义。MA、MACD、RSI 等要么自己算，要么交给数据供应商。本页大图的 MA5/10/20
          与均量线就是手算后以 <code>LineSeries</code> 叠加的：一次遍历维护滑动窗口和，
          前 N-1 根不足窗口时跳过，从第 N 根起输出均值。
        </p>
      </section>

      <section className="lw-doc-section">
        <h3>插件体系：标记 / 水印 / 自定义图元</h3>
        <p>
          v5 把“加东西”统一成插件（Primitive）体系，三个顶层工厂对应三种粒度的扩展：
        </p>
        <ul>
          <li>
            <code>createSeriesMarkers(series, markers)</code>：序列标记插件。在指定时间点画
            箭头/圆点等图形，并参与自动缩放（<code>autoScale</code>）。本页“买卖标记”开关
            控制的就是它——按最后 30 根 K 线涨跌生成“买/卖”箭头。
          </li>
          <li>
            <code>{'createTextWatermark(pane, options)'}</code>：文本水印插件，挂在<strong>面板</strong>
            上而非图表上。可设多行文字、对齐与可见性（<code>{'applyOptions({ visible })'}</code>）。
          </li>
          <li>
            <code>ISeriesPrimitive</code> 接口：完全自定义图元。实现 <code>paneViews()</code>
            返回视图对象，视图的 <code>renderer().draw(target)</code> 拿到
            <code>CanvasRenderingTarget2D</code>，用 <code>target.useBitmapCoordinateSpace()</code>
            拿 2D 上下文直接画。回调参数 <code>SeriesAttachedParameter</code> 里有当前
            <code>series</code>，可调用 <code>priceToCoordinate / timeToCoordinate</code> 把
            数据坐标转成屏幕坐标。本页“趋势线”开关画的就是这样一条自定义虚线。
          </li>
        </ul>
        <p>
          三个插件都通过各自插件对象上的 <code>detach()</code> 卸载，图表销毁前必须逐一 detach
          以免泄漏。
        </p>
      </section>

      <section className="lw-doc-section">
        <h3>价格线</h3>
        <p>
          <code>{'series.createPriceLine({ price, color, lineStyle, title, axisLabelVisible })'}</code>
          在序列上创建一条带右侧标签的水平参考线，适合画止盈止损位、成本价、斐波那契位等。
          用 <code>applyOptions()</code> 改价、<code>series.removePriceLine(pl)</code> 移除。
        </p>
      </section>

      <section className="lw-doc-section">
        <h3>常用配置</h3>
        <ul>
          <li><code>layout.background</code>：<code>ColorType.Solid</code> 纯色背景或渐变。</li>
          <li><code>grid</code>：纵/横网格线颜色；<code>crosshair</code>：十字光标吸附模式与颜色。</li>
          <li><code>timeScale.rightOffset</code>：右侧留白根数；<code>timeVisible / secondsVisible</code>：时间刻度粒度。</li>
          <li><code>attributionLogo: false</code>：隐藏左下角 TradingView 标识（按要求在文档保留声明）。</li>
        </ul>
      </section>

      <section className="lw-doc-section">
        <h3>与 klinecharts 的对比小结</h3>
        <table className="lw-doc-table">
          <thead>
            <tr>
              <th>维度</th>
              <th>Lightweight-Charts</th>
              <th>klinecharts</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>定位</td><td>轻量内核 + 可组合插件</td><td>开箱即用的完整交易客户端组件</td></tr>
            <tr><td>内置指标</td><td>无，需自算</td><td>27 个</td></tr>
            <tr><td>内置画线</td><td>无，需自定义图元</td><td>16+ 个叠加层</td></tr>
            <tr><td>周期切换 / 语言 / 时区</td><td>由上层数据流负责</td><td>内置 API 直接切换</td></tr>
            <tr><td>体积</td><td>约 45kb gzip</td><td>约 40kb gzip</td></tr>
            <tr><td>适合</td><td>深度定制、图表只是页面一部分</td><td>要快速做出完整行情工具台</td></tr>
          </tbody>
        </table>
        <p>
          简单说：lightweight-charts 给你一块“画布 + 数据模型”，能力全靠代码组合，定制自由但
          指标画线都要自己做；klinecharts 给你一间“精装房”，指标、画线、周期切换、截图开箱即用。
          本项目把两者都接入同一份数据源，正是为了在真实行情下对比这套取舍。
        </p>
      </section>
    </div>
  );
}
