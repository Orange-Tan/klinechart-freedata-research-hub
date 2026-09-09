import { useRef, useState } from 'react';
import { useKlineData } from '../hooks/useKlineData';
import type { KlinePeriod } from '../types/ohlcv';
import { PERIOD_LABEL, PERIOD_ALL } from '../types/ohlcv';
import {
  KlinechartsShowcaseChart,
  toPeriod,
  type KlinechartsShowcaseChartRef,
} from '../components/charts/KlinechartsShowcaseChart';
import type { CandleType } from 'klinecharts';
import './KlinechartsShowcase.css';

/** 页首大图可切换的周期列表（Binance 全周期演示） */
const PERIOD_OPTIONS = PERIOD_ALL;

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
  const [period, setPeriod] = useState<KlinePeriod>('1d');
  const chartRef = useRef<KlinechartsShowcaseChartRef>(null);

  const { history, error, source } = useKlineData({
    sourceId: 'binance',
    symbol: 'BTCUSDT',
    period,
    historyLimit: 500,
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
      <header className="kc-hero">
        <h1>klinecharts 详解</h1>
        <p className="kc-subtitle">klinecharts 是一个专为金融场景打造的开源 K 线图表库，把常见桌面交易软件里主图、副图、画线、快捷键的能力全部带到了浏览器里。下方大图把所有功能接到控制栏上，可以逐个上手试。</p>
      </header>

      {/* 控制栏：像交易软件工具条一样的分组 */}
      <div className="kc-controls">
        <div className="kc-group">
          <label className="kc-field">
            <span className="kc-field-name">周期</span>
            <select value={period} onChange={(e) => changePeriod(e.target.value as KlinePeriod)}>
              {PERIOD_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {PERIOD_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
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

      {error ? (
        <div className="error-panel">
          无法加载 {source.label} BTCUSDT {periodLabelOf(period)} 数据：{error}
        </div>
      ) : (
        <>
          <section className="kc-stage">
            <KlinechartsShowcaseChart
              ref={chartRef}
              data={history}
              symbol="BTCUSDT"
              period={toPeriod(period)}
              live
              onCrosshair={(data) => crosshairCbRef.current(data as unknown)}
              onVisibleRange={(data) => visibleRangeCbRef.current(data as unknown)}
            />
            <span className="sr-only bars-count">{bars} bars</span>
            {!ready && (
              <div className="kc-loading">正在加载历史数据…（{bars} / {MIN_BARS} 根）</div>
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
              {status ? (
                <span className={`kc-msg kc-msg-${status.kind}`}>{status.message}</span>
              ) : (
                <span className="kc-status-empty">就绪</span>
              )}
            </div>
          </div>
        </>
      )}

      {/* 下方：库的全量文档 */}
      <KcDocs />
    </div>
  );
}

/** 时间戳 → 本地时间字符串（UTC 对齐） */
function fmtTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** 文档区：按主题分节，末尾给与 lightweight-charts 的对比 */
function KcDocs() {
  return (
    <div className="kc-docs">
      <h2>klinecharts 库详解</h2>

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
      </section>

      <section className="report-section">
        <h3>核心 API</h3>
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
              <tr>
                <td><code>init(el, options)</code></td>
                <td>创建图表实例</td>
                <td>options 里配置 locale / timezone / styles 等</td>
              </tr>
              <tr>
                <td><code>setDataLoader()</code></td>
                <td>注册数据加载器</td>
                <td>getBars 处理 init / forward / backward / update 四种请求</td>
              </tr>
              <tr>
                <td><code>subscribeBar()</code></td>
                <td>订阅实时增量</td>
                <td>每根新 K 线回调一次，库内部自动追加或替换最后一根</td>
              </tr>
              <tr>
                <td><code>createIndicator()</code></td>
                <td>添加副图指标</td>
                <td>每次调用都新建 pane，需要自己防重</td>
              </tr>
              <tr>
                <td><code>createOverlay()</code></td>
                <td>创建画线工具</td>
                <td>内置 16 个，也可 registerOverlay 自定义</td>
              </tr>
              <tr>
                <td><code>subscribeAction()</code></td>
                <td>订阅交互事件</td>
                <td>十字光标、可见区间、缩放、点击等</td>
              </tr>
              <tr>
                <td><code>getConvertPictureUrl()</code></td>
                <td>导出截图</td>
                <td>返回 dataURL，可直接作为 img src 或下载</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="report-section">
        <h3>副图与指标</h3>
        <p>
          内置指标按风格分成两类：一类画在主图上（如 MA、BOLL、SAR），一类画在独立副图 pane 上
          （如 MACD、KDJ、RSI、VOL）。createIndicator 每次调用都会新建一个副图 pane，且不做去重，
          所以页面层要自己用 ref 或查询 getIndicators() 防重——这也是看板页早期「每轮轮询累积出
          多个 VOL 窗口把主图挤成 0 高」的坑的根源。
        </p>
        <p>
          指标计算通过 calc 回调返回一个数组，数组里每一项对应一根 K 线的指标值，figures 字段声明
          这些值画成什么（线 / 柱 / 区域）。上方的「自定义指标」按钮就注册了一个最小模板
          （TEST，把收盘价画成一条线），你可以把这个模板改造成任意技术指标。
        </p>
      </section>

      <section className="report-section">
        <h3>画线工具</h3>
        <p>
          内置 16 个画线工具：直线、射线、线段、水平/垂直直线、水平射线、水平线段、平行线、
          价格通道线、斐波那契线、文字标注、标签、笔刷等。选择工具后「开始绘制」，在图上点击
          指定次数（直线两次、平行线四次）即可完成，之后可以拖动调整，双击或右键可删除。
        </p>
        <p>
          自定义画线用 registerOverlay 注册模板：totalStep 声明绘制步数，createPointFigures 根据
          points（已落下的锚点）返回图元。上方的「自定义叠加层」注册了一条水平直线，与内置的
          horizontalStraightLine 模板同构。
        </p>
      </section>

      <section className="report-section">
        <h3>交互与状态条</h3>
        <p>
          十字光标（crosshair）是交易软件的标准交互：悬停时在图上画十字线，右侧与底部刻度显示
          对应价格和时间。klinecharts 通过 subscribeAction('onCrosshairChange') 把悬停的那根 K 线
          数据推给上层——上方状态条里的开高低收和涨跌幅就是从这里订阅来的。缩略图与可见区间
          变化走 onVisibleRangeChange，返回当前视口的数据下标范围。
        </p>
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
                <td>内置 20+ 常用指标，createIndicator 直接添加</td>
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
