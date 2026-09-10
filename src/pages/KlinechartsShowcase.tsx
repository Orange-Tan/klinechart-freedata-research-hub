import { useRef, useState } from 'react';
import { useKlineData } from '../hooks/useKlineData';
import type { KlinePeriod, StockResult } from '../types/ohlcv';
import { PERIOD_LABEL } from '../types/ohlcv';
import { dataSourceList, getDataSource, type DataSourceId } from '../data';
import { SHOWCASE_SOURCE_DEFAULTS, supportedPeriodsOf } from './showcaseShared';
import {
  DEFAULT_HISTORY_LIMIT,
  HISTORY_LIMITS,
  isSourceOrNetworkError,
  useStockSearch,
} from './controlsShared';
import {
  KlinechartsShowcaseChart,
  toPeriod,
  type KlinechartsShowcaseChartRef,
} from '../components/charts/KlinechartsShowcaseChart';
import type { CandleType } from 'klinecharts';
import './KlinechartsShowcase.css';

/** 页首大图需要 ≥ MIN_BARS 根历史才敢展示全量功能（指标/画线不空洞） */
const MIN_BARS = 60;

/** 内置指标（getSupportedIndicators 的常用子集，含 VOL 副图） */
const INDICATOR_NAMES = [
  'AVP', 'AO', 'BIAS', 'BOLL', 'BRAR', 'BBI', 'CCI', 'CR', 'DMA', 'DMI',
  'EMV', 'EMA', 'MTM', 'MA', 'MACD', 'OBV', 'PVT', 'PSY', 'ROC', 'RSI',
  'SMA', 'KDJ', 'SAR', 'TRIX', 'VOL', 'VR', 'WR',
];

/** 内置叠加层（getSupportedOverlays 的 16 个内置画线工具） */
const OVERLAY_NAMES = [
  'fibonacciLine', 'horizontalRayLine', 'horizontalSegment', 'horizontalStraightLine',
  'parallelStraightLine', 'priceChannelLine', 'priceLine', 'rayLine', 'segment',
  'straightLine', 'verticalRayLine', 'verticalSegment', 'verticalStraightLine',
  'simpleAnnotation', 'simpleTag', 'brush',
];

/** 叠加层中文名（仅界面展示用） */
const OVERLAY_LABEL: Record<string, string> = {
  fibonacciLine: '斐波那契线', horizontalRayLine: '水平射线', horizontalSegment: '水平线段',
  horizontalStraightLine: '水平直线', parallelStraightLine: '平行线', priceChannelLine: '价格通道线',
  priceLine: '价格线', rayLine: '射线', segment: '线段', straightLine: '直线',
  verticalRayLine: '垂直射线', verticalSegment: '垂直线段', verticalStraightLine: '垂直直线',
  simpleAnnotation: '文字标注', simpleTag: '标签', brush: '笔刷',
};

/** K 线样式可选项（setStyles({ candle: { type } })） */
const CANDLE_TYPES: CandleType[] = [
  'candle_solid', 'candle_stroke', 'candle_up_stroke', 'candle_down_stroke', 'ohlc', 'area',
];

const CANDLE_LABEL: Record<CandleType, string> = {
  candle_solid: '实心 K 线', candle_stroke: '空心 K 线', candle_up_stroke: '阳线空心',
  candle_down_stroke: '阴线空心', ohlc: 'OHLC 棒', area: '面积图',
};

/* ==================== 功能总览表格数据（对应 docs/KLineChart(klinecharts) 详细功能点整理.md） ==================== */

/** 基本信息 */
const BASIC_TABLE: [string, string][] = [
  ['全名', 'KLineChart（klinecharts）'],
  ['当前版本', '10.0.3（本项目安装）'],
  ['作者', 'lihu（李虎）'],
  ['协议', 'Apache-2.0（可商用 / 修改 / 再分发，需保留版权声明）'],
  ['技术栈', 'HTML5 Canvas 渲染，零运行时依赖'],
  ['仓库', 'https://github.com/klinecharts/KLineChart'],
  ['官网', 'https://www.klinecharts.com'],
  ['Pro 版本', 'https://pro.klinecharts.com'],
];

/** 顶层 API */
const CORE_API_TABLE: { api: string; role: string; note: string }[] = [
  { api: 'init(el, options)', role: '创建图表实例', note: 'options 里配置 locale / timezone / styles 等' },
  { api: 'setDataLoader()', role: '注册数据加载器', note: 'getBars 处理 init / forward / backward / update 四种请求' },
  { api: 'subscribeBar()', role: '订阅实时增量', note: '每根新 K 线回调一次，库内部自动追加或替换最后一根' },
  { api: 'createIndicator()', role: '添加副图指标', note: '每次调用都新建 pane，需要自己防重' },
  { api: 'createOverlay()', role: '创建画线工具', note: '内置 16 个，也可 registerOverlay 自定义' },
  { api: 'subscribeAction()', role: '订阅交互事件', note: '十字光标、可见区间、缩放、点击等' },
  { api: 'getConvertPictureUrl()', role: '导出截图', note: '返回 dataURL，可直接作为 img src 或下载' },
];

/** 扩展注册体系 */
const REGISTER_TABLE: { api: string; content: string; count: string }[] = [
  { api: 'registerIndicator', content: '技术指标', count: '27' },
  { api: 'registerOverlay', content: '画线工具', count: '16' },
  { api: 'registerFigure', content: '基础图元', count: '6' },
  { api: 'registerHotkey', content: '快捷键', count: '4' },
  { api: 'registerLocale', content: '多语言', count: '2' },
  { api: 'registerStyles', content: '命名主题', count: '2' },
];

/** 图表类型 */
const CANDLE_TABLE: { type: string; desc: string }[] = [
  { type: 'candle_solid', desc: '实心 K 线（涨绿跌红，默认）' },
  { type: 'candle_stroke', desc: '空心 K 线（仅边框色）' },
  { type: 'candle_up_stroke', desc: '上涨空心 / 下跌实心' },
  { type: 'candle_down_stroke', desc: '上涨实心 / 下跌空心' },
  { type: 'ohlc', desc: 'OHLC 柱状线' },
  { type: 'area', desc: '面积图（主图面积走势）' },
];

/** 内置指标：series 标注 主图=price 叠加主图 / 成交量=volume / 副图=normal */
const INDICATOR_TABLE: { name: string; series: string; params: string; desc: string }[] = [
  { name: 'MA', series: '主图', params: '[5, 10, 30, 60]', desc: '均线组（4 条线）' },
  { name: 'EMA', series: '主图', params: '[6, 12, 20]', desc: '指数均线' },
  { name: 'SMA', series: '主图', params: '[12, 2]', desc: '简单均线（alpha 可调）' },
  { name: 'BOLL', series: '主图', params: '[20, 2]', desc: '布林带' },
  { name: 'VOL', series: '成交量', params: '[5, 10, 20]', desc: '成交量' },
  { name: 'MACD', series: '副图', params: '[12, 26, 9]', desc: '快慢线 + 零轴柱（默认涨绿跌红）' },
  { name: 'KDJ', series: '副图', params: '[9, 3, 3]', desc: '随机指标' },
  { name: 'RSI', series: '副图', params: '[6, 12, 24]', desc: '相对强弱' },
  { name: 'BIAS', series: '副图', params: '[6, 12, 24]', desc: '乖离率' },
  { name: 'BRAR', series: '副图', params: '[26]', desc: '情绪指标' },
  { name: 'CCI', series: '副图', params: '[20]', desc: '顺势指标' },
  { name: 'DMA', series: '副图', params: '[10, 50, 10]', desc: '平均线差' },
  { name: 'DMI', series: '副图', params: '[14, 6]', desc: '趋向指标' },
  { name: 'CR', series: '副图', params: '[26, 10, 20, 40, 60]', desc: '能量指标' },
  { name: 'PSY', series: '副图', params: '[12, 6]', desc: '心理线' },
  { name: 'OBV', series: '副图', params: '[30]', desc: '能量潮' },
  { name: 'SAR', series: '主图', params: '[2, 2, 20]', desc: '停损点（抛物线）' },
  { name: 'VR', series: '副图', params: '[26, 6]', desc: '成交量变异率' },
  { name: 'WR', series: '副图', params: '[6, 10, 14]', desc: '威廉指标' },
  { name: 'MTM', series: '副图', params: '[12, 6]', desc: '动量指标' },
  { name: 'EMV', series: '副图', params: '[14, 9]', desc: '简易波动' },
  { name: 'TRIX', series: '副图', params: '[12, 9]', desc: '三重指数' },
  { name: 'ROC', series: '副图', params: '[12, 6]', desc: '变动率' },
  { name: 'PVT', series: '副图', params: '[]', desc: '价量趋势' },
  { name: 'BBI', series: '主图', params: '[3, 6, 12, 24]', desc: '多空指标' },
  { name: 'AO', series: '副图', params: '[5, 34]', desc: '动量震荡（零轴柱）' },
  { name: 'AVP', series: '主图', params: '[]', desc: '平均价（成交额 / 量）' },
];

/** 内置画线工具 */
const OVERLAY_TABLE: { name: string; desc: string; points: string }[] = [
  { name: 'straightLine', desc: '直线', points: '2' },
  { name: 'segment', desc: '线段', points: '2' },
  { name: 'rayLine', desc: '射线', points: '2' },
  { name: 'horizontalStraightLine', desc: '水平直线', points: '1' },
  { name: 'verticalStraightLine', desc: '垂直直线', points: '1' },
  { name: 'horizontalSegment', desc: '水平线段', points: '1' },
  { name: 'verticalSegment', desc: '垂直线段', points: '1' },
  { name: 'horizontalRayLine', desc: '水平射线', points: '1' },
  { name: 'verticalRayLine', desc: '垂直射线', points: '1' },
  { name: 'parallelStraightLine', desc: '平行线（平行通道）', points: '2' },
  { name: 'priceLine', desc: '价格线', points: '1' },
  { name: 'priceChannelLine', desc: '价格通道', points: '2' },
  { name: 'fibonacciLine', desc: '斐波那契回调线', points: '2' },
  { name: 'simpleAnnotation', desc: '简单标注（箭头 + 文字）', points: '1' },
  { name: 'simpleTag', desc: '简单标签（旗帜）', points: '1' },
  { name: 'brush', desc: '自由画笔（freehand）', points: '—' },
];

/** 基础图元 */
const FIGURE_TABLE: { name: string; attrs: string }[] = [
  { name: 'line', attrs: 'coordinates {x,y}[]、styles（线色 / 宽 / 虚线）' },
  { name: 'rect', attrs: 'x / y / width / height、styles（填充 / 边框）' },
  { name: 'circle', attrs: 'x / y / radius、styles' },
  { name: 'polygon', attrs: 'coordinates[]、styles' },
  { name: 'text', attrs: 'x / y / text / align / baseline、styles（字体 / 字号 / 颜色）' },
  { name: 'arc', attrs: 'x / y / radius / startAngle / endAngle / clockwise、styles' },
];

/** 内置快捷键 */
const HOTKEY_TABLE: { action: string; keys: string; effect: string }[] = [
  { action: 'scrollLeft', keys: 'Shift + ArrowLeft', effect: '左移 3 根' },
  { action: 'scrollRight', keys: 'Shift + ArrowRight', effect: '右移 3 根' },
  { action: 'zoomIn', keys: 'Shift + Equal / Shift + NumpadAdd', effect: '放大 ×1.05' },
  { action: 'zoomOut', keys: 'Shift + Minus / Shift + NumpadSubtract', effect: '缩小 ×0.95' },
];

/** 多语言 */
const LOCALE_TABLE: { locale: string; desc: string }[] = [
  { locale: 'zh-CN', desc: '简体中文（本项目默认）' },
  { locale: 'en-US', desc: 'English' },
];

/** DataLoader 请求类型 */
const DATALOAD_TABLE: { type: string; trigger: string; semantics: string }[] = [
  { type: 'init', trigger: '首次 / 重置数据', semantics: '返回初始数据（起点之前留历史余量，more 表示是否有更早数据）' },
  { type: 'backward', trigger: '向左滚动到边缘', semantics: '加载更早历史，more 是否还有更多' },
  { type: 'forward', trigger: '向右滚动到边缘', semantics: '加载更新数据（如有）' },
  { type: 'update', trigger: '实时行情轮询', semantics: '返回最新一根（内部自动追加 / 替换最后一根）' },
];

/** 样式八大分类 */
const STYLE_TABLE: { key: string; iface: string; desc: string }[] = [
  { key: 'grid', iface: 'GridStyle', desc: '水平 / 垂直线：color、dashed、size、开关' },
  { key: 'candle', iface: 'CandleStyle', desc: 'K 线类型与配色、priceMark 最新价标记、tooltip、compareRule 涨跌判定、legend、watermark' },
  { key: 'indicator', iface: 'IndicatorStyle', desc: '指标线色 / 文字 / tooltip（同 candle 体系）' },
  { key: 'xAxis', iface: 'XAxisStyle', desc: '时间轴：color / size / tickText 颜色字号 / margin' },
  { key: 'yAxis', iface: 'YAxisStyle', desc: '价格轴：color / size / tickText / type（normal | percentage | log）' },
  { key: 'separator', iface: 'SeparatorStyle', desc: 'pane 分隔线：color、size（默认 1、#DDDDDD）' },
  { key: 'crosshair', iface: 'CrosshairStyle', desc: '十字光标：horizontal / vertical（color、dashed [4,2]、text 样式）' },
  { key: 'overlay', iface: 'OverlayStyle', desc: '画线工具：point 半径 5、激活边框 3、文字样式' },
];

/** ActionType 事件全集 */
const ACTION_TABLE: { type: string; trigger: string; data: string }[] = [
  { type: 'onZoom', trigger: '缩放', data: '{ zoomScale }' },
  { type: 'onScroll', trigger: '滚动', data: '{ scrollPosition }' },
  { type: 'onVisibleRangeChange', trigger: '可见区间变化', data: '{ from, to, realFrom, realTo }（滚动加载历史的入口）' },
  { type: 'onCrosshairChange', trigger: '十字光标移动', data: '{ paneId, dataIndex, kLineData, crosshair, overlay, yAxis }' },
  { type: 'onCandleBarClick', trigger: '点击 K 线', data: '{ paneId, dataIndex, kLineData }' },
  { type: 'onCandleTooltipFeatureClick', trigger: '点击 K 线 tooltip 元素', data: '功能点回调' },
  { type: 'onIndicatorTooltipFeatureClick', trigger: '点击指标 tooltip 元素', data: '功能点回调' },
  { type: 'onCrosshairFeatureClick', trigger: '点击十字光标元素', data: '功能点回调' },
  { type: 'onPaneDrag', trigger: '拖拽 pane 分隔条', data: '{ paneId }' },
];

/** Store 视图基础控制 */
const STORE_VIEW_TABLE: { api: string; desc: string }[] = [
  { api: 'setZoomEnabled() / setScrollEnabled()', desc: '缩放 / 滚动交互总开关' },
  { api: 'setBarSpace(n)', desc: '柱间距（范围受 barSpaceLimit 1~50 限制）' },
  { api: 'setOffsetRightDistance(n)', desc: '右侧留白距离（默认 80）' },
  { api: 'setMinVisibleBarCount({ left, right })', desc: '最小可见柱数（默认左右均 2）' },
  { api: 'setMaxOffsetDistance(n)', desc: '最大偏移距离（默认 50）' },
  { api: 'zoomAnchor', desc: "缩放锚点：'cursor'（默认，光标处）/ 'last_bar'（最新柱）" },
];

/** 编程滚动 / 缩放 / 坐标换算 */
const NAVIGATION_TABLE: { api: string; desc: string }[] = [
  { api: 'scrollByDistance(distance)', desc: '按像素滚动' },
  { api: 'scrollToRealTime()', desc: '滚回最新一根' },
  { api: 'scrollToDataIndex(index, offset?)', desc: '滚动到指定数据索引' },
  { api: 'scrollToTimestamp(ts, offset?)', desc: '滚动到指定时间戳' },
  { api: 'zoomAtCoordinate(scale, coordinate)', desc: '在屏幕坐标处缩放' },
  { api: 'zoomAtDataIndex(scale, dataIndex)', desc: '在数据索引处缩放' },
  { api: 'zoomAtTimestamp(scale, timestamp)', desc: '在时间戳处缩放' },
  { api: 'convertToPixel / convertFromPixel', desc: '数据索引 / 价格 ↔ 屏幕坐标互转' },
];

/** 格式化与工具 */
const UTIL_TABLE: { api: string; desc: string }[] = [
  { api: 'clone / merge', desc: '深拷贝 / 深合并' },
  { api: 'formatValue / formatPrecision / formatBigNumber', desc: '数值格式化' },
  { api: 'formatThousands', desc: '千分位' },
  { api: 'formatFoldDecimal', desc: '折叠小数（配合 setDecimalFold）' },
  { api: 'formatDate', desc: '日期格式化' },
  { api: 'calcTextWidth', desc: '文本像素宽度' },
  { api: 'checkCoordinateOn*', desc: '坐标命中检测（自定义 Figure 命中用）' },
];

/** 性能特性 */
const PERF_TABLE: { feature: string; desc: string }[] = [
  { feature: 'Canvas 渲染', desc: '单 Canvas 分级绘制（背景 / 主体 / 浮层），万级数据流畅' },
  { feature: '零依赖', desc: '无运行时依赖，无重依赖树，打包体积可控' },
  { feature: '按需数据', desc: 'setDataLoader 的 backward / forward 天然支持分页加载历史' },
  { feature: '可见区间回调', desc: 'onVisibleRangeChange 避免高频全量重绘，只处理可见区' },
  { feature: 'recreateOnDataChange', desc: 'DataLoader 选项：数据变化时是否重建（性能 / 一致性权衡）' },
];

/** 与常见需求对照 */
const NEEDS_TABLE: { need: string; usage: string }[] = [
  { need: '实时行情增量推送', usage: 'setDataLoader + subscribeBar 返回 { type: \'update\' }' },
  { need: '滚动加载历史', usage: 'getBars 的 backward 分支 + callback(data, more) 判断' },
  { need: '多副图指标（VOL / MACD / KDJ）', usage: 'createIndicator(\'macd\')（注意每次新建 pane 不去重）' },
  { need: '画线 / 标注工具', usage: 'createOverlay(\'fibonacciLine\') 等 16 个内置，或 registerOverlay 自绘' },
  { need: '最新价标记', usage: 'CandleStyle 的 priceMark（默认开启）' },
  { need: '自定义水平参考线', usage: 'createOverlay(\'priceLine\', { points: [{ value }] })' },
  { need: '自定义指标', usage: 'registerIndicator + overrideIndicator 调参' },
  { need: '多 Y 轴', usage: 'createYAxis(paneId) 创建并绑定' },
  { need: '对数 / 百分比轴', usage: 'yAxis.type: \'log\' / \'percentage\'' },
  { need: '导出图片', usage: 'getConvertPictureUrl({ type: \'png\' })' },
  { need: '涨绿跌红（A 股习惯）', usage: '内置默认 Color.GREEN 为涨色，无需配置' },
  { need: '主题切换', usage: 'setStyles(\'dark\') 或 registerStyles 自定义主题' },
];

function fmt(n: number, digits = 2): string {
  return n.toFixed(digits);
}

/** 周期标签（页面周期下拉 + 十字光标 OHLC 顶部行复用） */
function periodLabelOf(period: KlinePeriod): string {
  return PERIOD_LABEL[period];
}

/**
 * klinecharts v10 详解页：页首大图 + 全量文档。
 *
 * 大图区把 klinecharts v10 的主要 API 全部接到控制栏上（指标 / 画线 /
 * 自定义注册 / 截图 / 导航 / K 线样式 / 十字光标状态条），文档区按主题分节
 * 讲解并给出与 lightweight-charts 的对比结论。
 */
export function KlinechartsShowcase() {
  const [sourceId, setSourceId] = useState<DataSourceId>('tencent');
  const def = SHOWCASE_SOURCE_DEFAULTS[sourceId];
  const [symbol, setSymbol] = useState<string>(def.symbol);
  const [symbolLabel, setSymbolLabel] = useState<string>(def.label);
  const [period, setPeriod] = useState<KlinePeriod>('1d');
  const [live, setLive] = useState(true);
  const [historyLimit, setHistoryLimit] = useState<number>(DEFAULT_HISTORY_LIMIT);
  const chartRef = useRef<KlinechartsShowcaseChartRef>(null);
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
  // 数据够了 + 渲染完成才提示"全量功能可用"
  const ready = bars >= MIN_BARS;

  // —— 控制栏状态 ——
  const [indicatorName, setIndicatorName] = useState<string>(INDICATOR_NAMES[0] ?? 'MA');
  const [overlayName, setOverlayName] = useState<string>(OVERLAY_NAMES[0] ?? 'straightLine');
  const [candleType, setCandleType] = useState<CandleType>('candle_solid');
  // 注册类按钮的状态提示（register* 是全局单例，只能注册一次）
  const [customIndicatorDone, setCustomIndicatorDone] = useState(false);
  const [customOverlayDone, setCustomOverlayDone] = useState(false);
  const [customHotkeyDone, setCustomHotkeyDone] = useState(false);
  // 状态条：十字光标 OHLC + 可见区间 + 最近一次操作提示
  const [status, setStatus] = useState<{ message: string; kind: 'info' | 'ok' | 'warn' } | null>(null);
  const [crosshairData, setCrosshairData] = useState<{
    timestamp: number | null;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
  } | null>(null);
  const [visibleRange, setVisibleRange] = useState<{ from: number; to: number } | null>(null);

  const chart = () => chartRef.current?.getChart() ?? null;

  // —— 十字光标 / 可见区间回调（存 ref 保持最新，避免组件内重复订阅）——
  const crosshairCbRef = useRef<(data: unknown) => void>(() => {});
  const visibleRangeCbRef = useRef<(data: unknown) => void>(() => {});
  crosshairCbRef.current = (data: unknown) => {
    const c = data as { kLineData?: { time?: number; open?: number; high?: number; low?: number; close?: number } | null } | null;
    const k = c?.kLineData;
    if (k && typeof k.time === 'number') {
      setCrosshairData({
        timestamp: k.time,
        open: k.open ?? null,
        high: k.high ?? null,
        low: k.low ?? null,
        close: k.close ?? null,
      });
    } else {
      setCrosshairData(null);
    }
  };
  visibleRangeCbRef.current = (data: unknown) => {
    const r = data as { from?: number; to?: number } | null;
    if (r && typeof r.from === 'number' && typeof r.to === 'number') {
      setVisibleRange({ from: r.from, to: r.to });
    } else {
      setVisibleRange(null);
    }
  };

  const pushStatus = (message: string, kind: 'info' | 'ok' | 'warn' = 'info') => {
    setStatus({ message, kind });
  };

  // —— 数据源切换 ——

  /** 切换数据源：标的重置为该源默认，搜索清空，周期回退到该源支持的第一个周期 */
  function handleSourceChange(next: DataSourceId) {
    const d = SHOWCASE_SOURCE_DEFAULTS[next];
    setSourceId(next);
    setSymbol(d.symbol);
    setSymbolLabel(d.label);
    resetSearch();
    const options = supportedPeriodsOf(next);
    if (!options.includes(period)) setPeriod(options[0]);
    setCrosshairData(null);
    pushStatus(`数据源已切换为 ${getDataSource(next).label}`, 'info');
  }

  /** 从搜索下拉选中标的：切到该标的，清空搜索框与下拉结果 */
  function pickStock(r: StockResult) {
    setSymbol(r.symbol);
    setSymbolLabel(r.name);
    resetSearch();
    setCrosshairData(null);
    pushStatus(`已切换标的为 ${r.name}（${r.symbol}）`, 'info');
  }

  // —— 控制栏动作 ——

  const addIndicator = () => {
    const c = chart();
    if (!c || !indicatorName) return;
    // 去重：库的 addIndicator 按 filter(name) 去重，但 createIndicator 每次
    // 调用都会新建 pane 不去重——先查已挂载的指标，同名则跳过
    const exists = c.getIndicators().some((ind) => ind.name === indicatorName);
    if (exists) {
      pushStatus(`指标 ${indicatorName} 已存在，跳过添加`, 'warn');
      return;
    }
    c.createIndicator(indicatorName, false);
    pushStatus(`已添加指标 ${indicatorName}`, 'ok');
  };

  const startOverlay = () => {
    const c = chart();
    if (!c || !overlayName) return;
    c.createOverlay(overlayName);
    pushStatus(`开始绘制${OVERLAY_LABEL[overlayName] ?? overlayName}：在图上点两下完成`, 'info');
  };

  const registerAndCreateCustomIndicator = () => {
    const c = chart();
    if (!c) return;
    if (customIndicatorDone) {
      pushStatus('自定义指标 TEST 已注册，重复注册无意义', 'warn');
      return;
    }
    // registerIndicator 已在组件 mount 时注册过一次；这里再调一次是"幂等"演示，
    // 真正创建靠 createIndicator
    c.createIndicator('TEST', false);
    setCustomIndicatorDone(true);
    pushStatus('已创建自定义指标 TEST（收盘价折线）', 'ok');
  };

  const registerAndCreateCustomOverlay = () => {
    const c = chart();
    if (!c) return;
    if (customOverlayDone) {
      pushStatus('自定义叠加层 customLine 已注册，点两下开始绘制', 'info');
      c.createOverlay('customLine');
      return;
    }
    setCustomOverlayDone(true);
    c.createOverlay('customLine');
    pushStatus('已创建自定义叠加层 customLine：在图上点两下完成', 'ok');
  };

  const registerCustomHotkey = () => {
    const c = chart();
    if (!c) return;
    if (customHotkeyDone) {
      pushStatus('自定义快捷键 Ctrl+T 已注册，按它滚动回最新', 'info');
      return;
    }
    // registerHotkey 已在 mount 时注册（全局单例），这里只做状态切换提示；
    // 快捷键真正生效由库内部处理
    setCustomHotkeyDone(true);
    pushStatus('已注册自定义快捷键 Ctrl+T：滚动回最新', 'ok');
  };

  const exportPicture = async () => {
    const c = chart();
    if (!c) return;
    try {
      // getConvertPictureUrl 同步返回 dataURL（包一层 async 演示 await 用法）
      const url = await c.getConvertPictureUrl(false, 'png', '#0b0e17');
      const a = document.createElement('a');
      a.href = url;
      a.download = 'kline.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      pushStatus('已导出当前截图（kline.png）', 'ok');
    } catch {
      pushStatus('截图导出失败，请重试', 'warn');
    }
  };

  const scrollToRealtime = () => {
    const c = chart();
    if (!c) return;
    c.scrollToRealTime();
    pushStatus('已滚动回最新', 'ok');
  };

  const scrollLeft = () => {
    const c = chart();
    if (!c) return;
    c.scrollByDistance(-80);
    pushStatus('已左移 80 像素', 'ok');
  };

  const zoomIn = () => {
    const c = chart();
    if (!c) return;
    // zoomAtCoordinate 的 coordinate 参数用左下角，缩放锚点更稳
    c.zoomAtCoordinate(1.3, { x: 0, y: 0 });
    pushStatus('已放大 1.3 倍', 'ok');
  };

  const applyCandleType = (type: CandleType) => {
    const c = chart();
    if (!c) return;
    c.setStyles({ candle: { type } });
    setCandleType(type);
    pushStatus(`K 线样式已切换为${CANDLE_LABEL[type]}`, 'ok');
  };

  // 周期切换
  const changePeriod = (p: KlinePeriod) => {
    setPeriod(p);
    setCrosshairData(null);
    pushStatus(`周期已切换为${PERIOD_LABEL[p]}`, 'info');
  };

  return (
    <div className="kc-page">
      <div className="kc-inner">
      <header className="kc-hero">
        <h1>klinecharts 详解</h1>
      </header>

      {/* 控制栏：像交易软件工具条一样的分组 */}
      <div className="kc-controls">
        <div className="kc-group">
          <label className="kc-field">
            <span className="kc-field-name">数据源</span>
            <select value={sourceId} onChange={(e) => handleSourceChange(e.target.value as DataSourceId)}>
              {dataSourceList.map((ds) => (
                <option key={ds.id} value={ds.id}>
                  {ds.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="kc-group">
          <label className="kc-field">
            <span className="kc-field-name">标的</span>
            <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
              {def.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="kc-group">
          <label className="kc-field">
            <span className="kc-field-name">周期</span>
            <select value={period} onChange={(e) => changePeriod(e.target.value as KlinePeriod)}>
              {periodOptions.map((p) => (
                <option key={p} value={p}>
                  {PERIOD_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="kc-field kc-live">
          <span className="kc-field-name">实时更新</span>
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
        </label>

        <div className="kc-group">
          <label className="kc-field">
            <span className="kc-field-name">历史K线</span>
            <select value={historyLimit} onChange={(e) => setHistoryLimit(Number(e.target.value))}>
              {HISTORY_LIMITS.map((n) => (
                <option key={n} value={n}>
                  {n} 根
                </option>
              ))}
            </select>
          </label>
        </div>

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

        <div className="kc-group">
          <label className="kc-field">
            <span className="kc-field-name">指标</span>
            <select value={indicatorName} onChange={(e) => setIndicatorName(e.target.value)}>
              {INDICATOR_NAMES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="kc-btn" onClick={addIndicator}>
            添加指标
          </button>
        </div>

        <div className="kc-group">
          <label className="kc-field">
            <span className="kc-field-name">画线</span>
            <select value={overlayName} onChange={(e) => setOverlayName(e.target.value)}>
              {OVERLAY_NAMES.map((n) => (
                <option key={n} value={n}>
                  {OVERLAY_LABEL[n] ?? n}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="kc-btn" onClick={startOverlay}>
            开始绘制
          </button>
        </div>

        <div className="kc-group">
          <label className="kc-field">
            <span className="kc-field-name">K 线样式</span>
            <select
              value={candleType}
              onChange={(e) => applyCandleType(e.target.value as CandleType)}
            >
              {CANDLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CANDLE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="kc-group kc-buttons">
          <button
            type="button"
            className={`kc-btn${customIndicatorDone ? ' kc-btn-done' : ''}`}
            onClick={registerAndCreateCustomIndicator}
          >
            {customIndicatorDone ? '自定义指标 TEST（已注册）' : '自定义指标'}
          </button>
          <button
            type="button"
            className={`kc-btn${customOverlayDone ? ' kc-btn-done' : ''}`}
            onClick={registerAndCreateCustomOverlay}
          >
            {customOverlayDone ? '自定义叠加层（已注册）' : '自定义叠加层'}
          </button>
          <button
            type="button"
            className={`kc-btn${customHotkeyDone ? ' kc-btn-done' : ''}`}
            onClick={registerCustomHotkey}
          >
            {customHotkeyDone ? '已注册 Ctrl+T' : '自定义快捷键'}
          </button>
          <button type="button" className="kc-btn" onClick={() => void exportPicture()}>
            导出截图
          </button>
          <button type="button" className="kc-btn" onClick={scrollToRealtime}>
            回到最新
          </button>
          <button type="button" className="kc-btn" onClick={scrollLeft}>
            左移
          </button>
          <button type="button" className="kc-btn" onClick={zoomIn}>
            放大
          </button>
        </div>
      </div>

      <section className="kc-stage">
        <KlinechartsShowcaseChart
          ref={chartRef}
          data={history}
          symbol={symbol}
          period={toPeriod(period)}
          live={live}
          onCrosshair={(data) => crosshairCbRef.current(data as unknown)}
          onVisibleRange={(data) => visibleRangeCbRef.current(data as unknown)}
        />
        <span className="sr-only bars-count">{bars} bars</span>
        {!ready && (
          <div className="kc-loading">正在加载历史数据…（{bars} / {MIN_BARS} 根）</div>
        )}
        {/* 数据异常时图表保持显示（空态），把异常提示放在大图右上角 */}
        {error && (
          <div className="kc-stage-error">
            数据异常：{symbolLabel} {periodLabelOf(period)} {error}
            {isSourceOrNetworkError(error) && '（若为 WAF 拦截等外部因素，可切换数据源或周期重试）'}
          </div>
        )}
      </section>

      {/* 状态条：十字光标 OHLC + 可见区间 + 最近操作 */}
      <div className="kc-statusbar">
        <div className="kc-status-cell">
          {crosshairData && crosshairData.timestamp !== null ? (
            <span className="kc-ohlc">
              <span className="kc-ohlc-time">{fmtTime(crosshairData.timestamp)}</span>
              <span className="kc-ohlc-item">开 <b>{fmt(crosshairData.open ?? 0)}</b></span>
              <span className="kc-ohlc-item">高 <b className="kc-up">{fmt(crosshairData.high ?? 0)}</b></span>
              <span className="kc-ohlc-item">低 <b className="kc-down">{fmt(crosshairData.low ?? 0)}</b></span>
              <span className="kc-ohlc-item">收 <b>{fmt(crosshairData.close ?? 0)}</b></span>
              <span className="kc-ohlc-change">
                {crosshairData.open != null &&
                  crosshairData.close != null &&
                  (() => {
                    const pct = crosshairData.open !== 0
                      ? ((crosshairData.close - crosshairData.open) / crosshairData.open) * 100
                      : 0;
                    return (
                      <b className={crosshairData.close >= crosshairData.open ? 'kc-up' : 'kc-down'}>
                        {pct >= 0 ? '+' : ''}
                        {pct.toFixed(2)}%
                      </b>
                    );
                  })()}
              </span>
            </span>
          ) : (
            <span className="kc-status-empty">把鼠标移到图表上查看 OHLC</span>
          )}
        </div>
        <div className="kc-status-cell kc-status-range">
          {visibleRange ? (
            <span>可见区间 {visibleRange.from} – {visibleRange.to}</span>
          ) : (
            <span className="kc-status-empty">可见区间 –</span>
          )}
        </div>
        <div className="kc-status-cell kc-status-msg">
          {error ? (
            <span className="kc-msg kc-msg-fail">数据异常：{error}</span>
          ) : status ? (
            <span className={`kc-msg kc-msg-${status.kind}`}>{status.message}</span>
          ) : (
            <span className="kc-status-empty">就绪</span>
          )}
        </div>
      </div>


      {/* 下方：库的全量文档 */}
      <KcDocs />
      </div>
    </div>
  );
}

/** 时间戳 → 本地时间字符串（UTC 对齐） */
function fmtTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** 文档区：第一节集中放全部功能表格，后续章节按主题讲解 */
function KcDocs() {
  return (
    <div className="kc-docs">
      <h2>klinecharts 库详解</h2>

      {/* ==================== 第一节：功能总览（所有功能表格集中于此） ==================== */}
      <section className="report-section">
        <h3>功能总览</h3>
        <p>
          本页基于项目实际安装的 <code>klinecharts@10.0.3</code>（Apache-2.0，零运行时依赖）。
          下表集中列出全部功能点：基本信息、顶层 API、扩展注册体系、图表类型、内置指标、
          画线工具、基础图元、快捷键、多语言、DataLoader 协议、样式系统、事件、视图控制、
          工具函数、性能特性与常见需求对照，后续章节逐一展开讲解。
        </p>

        {/* —— 基本信息 —— */}
        <h4 className="kc-subhead">基本信息</h4>
        <div className="report-table-wrap">
          <table className="report-table kc-feature-table">
            <tbody>
              {BASIC_TABLE.map(([k, v]) => (
                <tr key={k}>
                  <th className="kc-fkey">{k}</th>
                  <td>
                    {k === '仓库' || k === '官网' || k === 'Pro 版本' ? (
                      <a className="kc-external-link" href={v} target="_blank" rel="noreferrer" title={v}>
                        {v}
                      </a>
                    ) : (
                      v
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— 顶层 API —— */}
        <h4 className="kc-subhead">顶层 API</h4>
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>API</th>
                <th>作用</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {CORE_API_TABLE.map((r) => (
                <tr key={r.api}>
                  <td><code>{r.api}</code></td>
                  <td>{r.role}</td>
                  <td>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— 扩展注册体系 —— */}
        <h4 className="kc-subhead">扩展注册体系（4 大注册器 + 多语言 + 主题）</h4>
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>注册器</th>
                <th>注册内容</th>
                <th>内置数量</th>
              </tr>
            </thead>
            <tbody>
              {REGISTER_TABLE.map((r) => (
                <tr key={r.api}>
                  <td><code>{r.api}</code></td>
                  <td>{r.content}</td>
                  <td>{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— 图表类型 —— */}
        <h4 className="kc-subhead">图表类型（CandleType，6 种）</h4>
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>CandleType</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {CANDLE_TABLE.map((r) => (
                <tr key={r.type}>
                  <td><code>{r.type}</code></td>
                  <td>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— 内置指标 —— */}
        <h4 className="kc-subhead">内置指标（27 个，主图 / 成交量 / 副图三类）</h4>
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>指标</th>
                <th>挂载位置</th>
                <th>默认参数</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {INDICATOR_TABLE.map((r) => (
                <tr key={r.name}>
                  <td><code>{r.name}</code></td>
                  <td>{r.series}</td>
                  <td><code>{r.params}</code></td>
                  <td>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— 内置画线工具 —— */}
        <h4 className="kc-subhead">内置画线工具（Overlay，16 个）</h4>
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>Overlay</th>
                <th>说明</th>
                <th>需要点位数</th>
              </tr>
            </thead>
            <tbody>
              {OVERLAY_TABLE.map((r) => (
                <tr key={r.name}>
                  <td><code>{r.name}</code></td>
                  <td>{r.desc}</td>
                  <td>{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— 基础图元 —— */}
        <h4 className="kc-subhead">基础图元（Figure，6 个）</h4>
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>Figure</th>
                <th>属性</th>
              </tr>
            </thead>
            <tbody>
              {FIGURE_TABLE.map((r) => (
                <tr key={r.name}>
                  <td><code>{r.name}</code></td>
                  <td>{r.attrs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— 快捷键 —— */}
        <h4 className="kc-subhead">内置快捷键（Hotkey，4 个）</h4>
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>动作</th>
                <th>默认按键</th>
                <th>效果</th>
              </tr>
            </thead>
            <tbody>
              {HOTKEY_TABLE.map((r) => (
                <tr key={r.action}>
                  <td><code>{r.action}</code></td>
                  <td>{r.keys}</td>
                  <td>{r.effect}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— 多语言 —— */}
        <h4 className="kc-subhead">多语言（Locale，2 套内置）</h4>
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>Locale</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {LOCALE_TABLE.map((r) => (
                <tr key={r.locale}>
                  <td><code>{r.locale}</code></td>
                  <td>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— DataLoader 请求类型 —— */}
        <h4 className="kc-subhead">DataLoader 请求类型（setDataLoader 协议）</h4>
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>DataLoadType</th>
                <th>触发时机</th>
                <th>返回语义</th>
              </tr>
            </thead>
            <tbody>
              {DATALOAD_TABLE.map((r) => (
                <tr key={r.type}>
                  <td><code>{r.type}</code></td>
                  <td>{r.trigger}</td>
                  <td>{r.semantics}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— 样式系统 —— */}
        <h4 className="kc-subhead">样式系统（Styles，八大分类）</h4>
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>分类</th>
                <th>类型</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {STYLE_TABLE.map((r) => (
                <tr key={r.key}>
                  <td><code>{r.key}</code></td>
                  <td>{r.iface}</td>
                  <td>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— ActionType —— */}
        <h4 className="kc-subhead">事件与动作（ActionType 全集）</h4>
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>ActionType</th>
                <th>触发时机</th>
                <th>回调数据</th>
              </tr>
            </thead>
            <tbody>
              {ACTION_TABLE.map((r) => (
                <tr key={r.type}>
                  <td><code>{r.type}</code></td>
                  <td>{r.trigger}</td>
                  <td>{r.data}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— Store 视图基础控制 —— */}
        <h4 className="kc-subhead">滚动 / 缩放 / 视图（Store 基础控制）</h4>
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>方法 / 选项</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {STORE_VIEW_TABLE.map((r) => (
                <tr key={r.api}>
                  <td><code>{r.api}</code></td>
                  <td>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— 编程滚动 / 缩放 / 坐标换算 —— */}
        <h4 className="kc-subhead">编程滚动 / 缩放 / 坐标换算（Chart 方法）</h4>
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>Chart 方法</th>
                <th>作用</th>
              </tr>
            </thead>
            <tbody>
              {NAVIGATION_TABLE.map((r) => (
                <tr key={r.api}>
                  <td><code>{r.api}</code></td>
                  <td>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— 格式化与工具 —— */}
        <h4 className="kc-subhead">格式化与工具（utils）</h4>
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>工具</th>
                <th>作用</th>
              </tr>
            </thead>
            <tbody>
              {UTIL_TABLE.map((r) => (
                <tr key={r.api}>
                  <td><code>{r.api}</code></td>
                  <td>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— 性能特性 —— */}
        <h4 className="kc-subhead">性能特性</h4>
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>特性</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {PERF_TABLE.map((r) => (
                <tr key={r.feature}>
                  <td>{r.feature}</td>
                  <td>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* —— 与常见需求对照 —— */}
        <h4 className="kc-subhead">与常见需求对照</h4>
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>需求</th>
                <th>用法</th>
              </tr>
            </thead>
            <tbody>
              {NEEDS_TABLE.map((r) => (
                <tr key={r.need}>
                  <td>{r.need}</td>
                  <td><code>{r.usage}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p>
          完整 27 个指标、16 个画线工具的默认参数与说明，见
          <code>docs/KLineChart(klinecharts) 详细功能点整理.md</code>（第 5、6 章），
          页面数据与之同源。
        </p>
      </section>

      {/* ==================== 后续章节：按主题展开讲解 ==================== */}
      <section className="report-section">
        <h3>库是什么</h3>
        <p>
          klinecharts 是 TypeScript 编写的开源 K 线图表库，不依赖任何 UI 框架，可在 React、
          Vue 等任意前端工程里直接使用。它把主图蜡烛图、副图技术指标、画线工具、十字光标、
          缩放平移这些桌面交易软件的标配能力做成了配置化 API，同时提供了数据加载器（DataLoader）
          与事件订阅机制，方便对接实时行情。
        </p>
        <p>
          这一版（v10）把数据接入统一收敛到了 setDataLoader：历史数据、向后翻页、实时增量都通过
          它注入，订阅端用 subscribeBar 拿到单根 K 线回调。图表库内部有一套「重置 → 初始化 →
          增量」的数据流程，上层只需要在合适时机把整批数据或单根数据喂进去。
        </p>
        <p>
          与 lightweight-charts 的「极简嵌入式」路线相比，klinecharts 走的是「开箱即用、功能完备」
          的交易终端式路线：上面功能总览里的 27 个指标、16 个画线工具、6 种图元、4 个快捷键、
          2 套语言全部内置，二次开发主要靠注册器做增量扩展。
        </p>
      </section>

      <section className="report-section">
        <h3>核心架构</h3>
        <p>
          顶层入口 <code>init()</code> 创建一个 <code>Chart</code> 实例（一个实例 = 一个图表），
          Chart 继承自 <code>Store</code>——数据加载、样式、滚动缩放、事件等基础能力都在 Store 上。
          pane（窗格）、xAxis（时间轴）、yAxis（价格轴）三者构成图表内部结构，pane 支持拖拽调高、
          最大化 / 最小化；xAxis / yAxis 可通过 <code>registerXAxis</code> / <code>registerYAxis</code>
          完全自定义。
        </p>
        <p>
          扩展体系是「Indicator + Overlay + Figure」三层注册模型：registerIndicator 注册指标、
          registerOverlay 注册画线、registerFigure 注册可复用的基础图元，注册之后即可在任意实例中
          按名使用。这与 lightweight-charts 的「Series（系列）+ Primitive（插件）」模型形成对照——
          后者指标画线全靠自己写，前者常用功能全部内置。
        </p>
      </section>

      <section className="report-section">
        <h3>数据接入</h3>
        <p>
          v10 没有 <code>applyNewData</code> / <code>updateData</code> 公共增量接口（v9 及以前有），
          一切数据流走 <code>setDataLoader</code> 协议。DataLoader 的 getBars 按
          init / forward / backward / update 四种请求类型回调数据，backward 天然支持向左滚动加载
          历史，subscribeBar 接收实时增量。
        </p>
        <p>
          数据模型是 <code>KLineData &#123; timestamp, open, high, low, close, volume, turnover? &#125;</code>，
          其中 <code>timestamp</code> 单位为<strong>毫秒</strong>——与本项目 OHLCV 协议的
          <code>time(ms)</code> 一致，直接透传无需换算（对比 lightweight-charts 要 /1000 转秒）。
          周期用 <code>&#123; type: 'minute', span: 5 &#125;</code> 对象表达（区别于 HQChart 的 0/4/5/6/8/12
          数字常量），五种 time 单位：second / minute / hour / day / week / month / year。
        </p>
      </section>

      <section className="report-section">
        <h3>图表类型与样式</h3>
        <p>
          主图绘制方式由 <code>setStyles(&#123; candle: &#123; type &#125; &#125;)</code> 的 candle.type 决定，共 6 种
          （见功能总览表）：实心、空心、涨跌半空心、OHLC 柱、面积图。K 线样式还可配置价格标记
          （priceMark，最新价高亮）、十字光标 tooltip、涨跌判定规则（与当前开盘比 / 与昨收比）、
          左上角图例模板、水印等。
        </p>
        <p>
          涨跌配色遵循<strong>中国惯例：涨绿跌红</strong>——内置 Color 常量 GREEN 为涨色、RED 为跌色，
          与 TradingView 默认相反。上方的「K 线样式」下拉可以在 6 种类型间即时切换体验。
        </p>
      </section>

      <section className="report-section">
        <h3>副图与指标</h3>
        <p>
          内置 27 个指标（见功能总览表）按 series 分为三类：<code>price</code>（叠加主图，不占副图，
          如 MA、EMA、SMA、BOLL、SAR、BBI、AVP）、<code>volume</code>（成交量类，VOL）、
          <code>normal</code>（独立副图 pane，其余全部）。每个指标含默认参数与 precision，可经
          <code>overrideIndicator</code> 覆盖调参。
        </p>
        <p>
          指标计算通过 calc 回调返回一个数组，数组里每一项对应一根 K 线的指标值，figures 字段声明
          这些值画成什么（线 / 柱 / 圆点），支持 Promise 异步计算。上方的「自定义指标」按钮就注册了
          一个最小模板（TEST，把收盘价画成一条线），你可以把这个模板改造成任意技术指标。
        </p>
        <p>
          ⚠️ <code>createIndicator</code> 每次调用都会新建一个副图 pane 且不去重，页面层要自己用
          ref 或查询 getIndicators() 防重——这也是看板页早期「每轮轮询累积出多个 VOL 窗口把主图挤成
          0 高」的坑的根源。
        </p>
      </section>

      <section className="report-section">
        <h3>画线工具</h3>
        <p>
          内置 16 个画线工具（见功能总览表）：直线、射线、线段、水平 / 垂直直线、水平射线、水平线段、
          平行线、价格通道线、斐波那契线、文字标注、标签、笔刷等。选择工具后点「开始绘制」，在图上
          点击指定次数（见表格「需要点位数」列）即可完成，之后可以拖动调整，双击或右键可删除。
        </p>
        <p>
          自定义画线用 <code>registerOverlay</code> 注册模板：totalStep 声明绘制步数（连续绘制用
          drawingMode: 'continuous'，如笔刷），createPointFigures 根据 points（已落下的锚点）返回图元，
          onDrawStart / onDrawing / onDrawEnd 等事件可接管绘制过程；overlay 还支持磁吸模式
          （normal / weak_magnet / strong_magnet，吸附到 K 线高低点）、lock 锁定、visible 显隐与
          zLevel 层级。上方的「自定义叠加层」注册了一条水平直线，与内置的 horizontalStraightLine
          模板同构。
        </p>
      </section>

      <section className="report-section">
        <h3>坐标轴与多 Y 轴</h3>
        <p>
          时间轴默认内置，可用 registerXAxis + AxisOverride 完全自定义（createRange / createTicks /
          scrollZoomEnabled / reverse / inside / position 等）。价格轴主图默认一根，用
          <code>createYAxis(paneId)</code> 可创建多个 Y 轴并分别绑定不同 pane，每个 Y 轴可独立
          setStyles / setVisible / setReverse / setInside / setPosition('left' | 'right')。
        </p>
        <p>
          轴类型三档：<code>normal</code>（线性）/ <code>percentage</code>（百分比）/
          <code>log</code>（对数），通过 yAxis.type 切换。注册轴时可自定义刻度模板
          （valueToRealValue / displayValueToText / minSpan 等），配合 createRange / createTicks
          可做任何自定义刻度（价格分位、涨跌幅轴等）。
        </p>
      </section>

      <section className="report-section">
        <h3>事件与动作</h3>
        <p>
          <code>subscribeAction</code> 订阅全部动作事件（ActionType 全集见功能总览表），
          <code>executeAction</code> 可编程触发。十字光标（crosshair）是交易软件的标准交互：悬停时
          在图上画十字线，右侧与底部刻度显示对应价格和时间——上方状态条里的开高低收和涨跌幅就是从
          onCrosshairChange 订阅来的。可见区间变化走 onVisibleRangeChange，返回当前视口的数据下标
          范围（&#123; from, to, realFrom, realTo &#125;），是滚动加载历史的入口。
        </p>
      </section>

      <section className="report-section">
        <h3>多语言 / 导出 / 工具</h3>
        <p>
          内置 zh-CN / en-US 两套语言包（见功能总览表），<code>setLocale('zh-CN')</code> 切换，
          registerLocale 注册自定义语言包；语言包键覆盖 tooltip 字段前缀（time / open / high / low /
          close / volume / turnover / change）与周期单位（second ~ year）。
        </p>
        <p>
          导出图片用 <code>getConvertPictureUrl(&#123; type: 'png' | 'jpeg' | 'bmp', includeOverlay?,
          includeIndicator?, includeCrosshair? &#125;)</code> 返回图片 URL，可 <code>&lt;a download&gt;</code>
          下载——上方「导出截图」按钮就是这个 API。格式化与工具函数（clone / merge、formatThousands、
          formatDate、坐标命中检测等）见功能总览表。
        </p>
      </section>

      <section className="report-section">
        <h3>性能与许可</h3>
        <p>
          Canvas 单实例分级绘制（背景 / 主体 / 浮层）、万级数据流畅；零运行时依赖；DataLoader 天然
          支持分页加载历史；onVisibleRangeChange 只处理可见区，避免高频全量重绘（见功能总览表）。
        </p>
        <p>
          协议为 Apache-2.0：允许商用、修改、再分发，需保留版权声明与许可文本；无 TradingView 式的
          强制 attribution logo 要求（对比 lightweight-charts）。
        </p>
      </section>

      <section className="report-section">
        <h3>项目实践要点（踩坑速查）</h3>
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>要点</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>无公共增量 API</td>
                <td>v10 只有 setDataLoader，实时增量走 subscribeBar</td>
              </tr>
              <tr>
                <td>createIndicator 不去重</td>
                <td>每次调用新增副图 pane，轮询场景必须用 ref 防重，否则累积多个 VOL 窗口把主图挤成 0 高</td>
              </tr>
              <tr>
                <td>setDataLoader 只注册一次</td>
                <td>重复注册会重置数据流，导致 init 反复触发</td>
              </tr>
              <tr>
                <td>时间戳是毫秒</td>
                <td>KLineData.timestamp 与 OHLCV 的 time(ms) 单位一致，直接透传；period 用 &#123; type, span &#125; 对象（区别于 HQChart 的数字常量）</td>
              </tr>
              <tr>
                <td>切换 symbol / period 时序</td>
                <td>组件需先用 ref 持有最新数据供异步 getBars 回调读取，data[last].time 倒退或首次加载时做全量 init 重设</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="report-section">
        <h3>与 lightweight-charts 的对比</h3>
        <p>
          这两者定位不同：lightweight-charts 是极简的数据渲染内核，指标、标记、水印、趋势线都要
          自己用插件或序列叠加实现；klinecharts 则是「开箱即用」的交易终端式方案，把副图指标、
          画线、快捷键、十字光标状态这些高频需求直接内置。代价是包体积更大、可定制粒度和
          底层渲染（Canvas 直接绘制）不如 lightweight-charts 的 series-primitive 接口自由。
        </p>
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>维度</th>
                <th>klinecharts v10</th>
                <th>lightweight-charts v5</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>定位</td>
                <td>交易终端式全功能 K 线库</td>
                <td>轻量数据渲染内核</td>
              </tr>
              <tr>
                <td>副图指标</td>
                <td>内置 27 个，createIndicator 直接添加</td>
                <td>无内置指标，用 LineSeries / HistogramSeries 手算叠加</td>
              </tr>
              <tr>
                <td>画线工具</td>
                <td>内置 16 个 + registerOverlay 自定义</td>
                <td>无内置画线，用 ISeriesPrimitive 接口自绘</td>
              </tr>
              <tr>
                <td>快捷键</td>
                <td>registerHotkey 内置快捷键机制</td>
                <td>无快捷键，需自行监听键盘事件</td>
              </tr>
              <tr>
                <td>数据接入</td>
                <td>setDataLoader 统一注入，subscribeBar 收增量</td>
                <td>setData 全量 / update 增量，需自己维护时序</td>
              </tr>
              <tr>
                <td>扩展性</td>
                <td>模板化注册（指标/画线/图元），自由度适中</td>
                <td>series-primitive 可深度自绘，自由度最高</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          选型建议：做「类交易软件」产品（副图、画线、快捷键是刚需）选 klinecharts，开箱即用；
          做嵌入式的极简行情图表、或对渲染层有深度定制诉求时选 lightweight-charts。
        </p>
      </section>
    </div>
  );
}

void fmt;
void periodLabelOf;
