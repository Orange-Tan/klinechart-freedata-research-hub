import { forwardRef, useEffect, useImperativeHandle, useRef, type MutableRefObject } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  AreaSeries,
  BarSeries,
  BaselineSeries,
  ColorType,
  LineStyle,
  LineType,
  CrosshairMode,
  createTextWatermark,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type IPriceLine,
  type IPaneApi,
  type SeriesMarker,
  type ISeriesMarkersPluginApi,
  type ITextWatermarkPluginApi,
  type IPrimitivePaneView,
  type IPrimitivePaneRenderer,
  type SeriesAttachedParameter,
  type ISeriesPrimitive,
  type Time,
  type ITimeScaleApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type AreaData,
  type BarData,
  type BaselineData,
  MismatchDirection,
} from 'lightweight-charts';
// CanvasRenderingTarget2D 由 fancy-canvas 包导出（lightweight-charts 不重新导出，
// 其 typings 第一行就是 `import { CanvasRenderingTarget2D } from 'fancy-canvas'`）。
// type-only 导入，不产生运行时依赖。
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { OHLCV } from '../../types/ohlcv';

export interface LightweightShowcaseChartRef {
  /** 主动请求一次重绘（未暴露给页面的内部动作用） */
  redraw: () => void;
}

export interface LightweightShowcaseChartProps {
  data: OHLCV[];
  symbol: string;
  /** 是否实时追加/更新最后一根 K 线 */
  live?: boolean;
  /** MA 均线组（指标线）：多周期移动平均 + 成交量 5/10/20 均量线 */
  indicators?: boolean;
  /** 序列标记（买卖点） */
  markers?: boolean;
  /** 文本水印 */
  watermark?: boolean;
  /** 自定义趋势线（ISeriesPrimitive 自定义绘制插件） */
  trendLine?: boolean;
  /** 价格线（水平参考线，右侧刻度带标签） */
  priceLine?: boolean;
  /** 附加图表面板（成交量面板 + 额外演示面板） */
  extraPanes?: boolean;
  /** 其他序列类型演示（Line/Area/Bar/Baseline overlay 在 K 线主图） */
  seriesTypes?: boolean;
}

const UPDOWN_COLORS = {
  up: '#26a69a',
  down: '#ef5350',
} as const;

/**
 * Lightweight-Charts 单库详解页的大图：把库的可视化能力全部打开在一个图上。
 *
 * 覆盖的功能点（对应下方文档的分节）：
 *  - 多 pane：主图 K 线 + 独立 pane 的成交量柱（addSeries 的 paneIndex 参数）；
 *  - 多序列类型：K 线之上叠加 Line/Area/Bar/Baseline 四种序列；
 *  - 指标线：手算 MA 均线（库本身不内置指标，用 LineSeries 叠加）；
 *  - 序列标记：createSeriesMarkers 插件（买卖点箭头）；
 *  - 水印：createTextWatermark 插件；
 *  - 价格线：series.createPriceLine（右侧刻度带标签的水平线）；
 *  - 自定义图元：ISeriesPrimitive 接口画一条趋势线（paneRenderer/draw）；
 *  - localization.timeFormatter：时间刻度自定义格式。
 *
 * v5 API 注意：chart.addSeries(definition, options, paneIndex?) 的第三个参数
 * paneIndex 传 0 表示放回主图 pane（默认新建 pane）。主图 pane 即 panes()[0]，
 * 成交量/附加面板在 panes()[1] / panes()[2]（与 addSeries 的 paneIndex 一致）。
 */
export const LightweightShowcaseChart = forwardRef<
  LightweightShowcaseChartRef,
  LightweightShowcaseChartProps
>(function LightweightShowcaseChart(
  {
    data,
    symbol,
    live = true,
    indicators = false,
    markers = false,
    watermark = false,
    trendLine = false,
    priceLine = false,
    extraPanes = false,
    seriesTypes = false,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // 每个序列类型一个引用，feature 开关切换时挂载/卸载
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const lineRef = useRef<ISeriesApi<'Line'> | null>(null);
  const areaRef = useRef<ISeriesApi<'Area'> | null>(null);
  const barRef = useRef<ISeriesApi<'Bar'> | null>(null);
  const baselineRef = useRef<ISeriesApi<'Baseline'> | null>(null);
  const ma5Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ma10Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ma20Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const volMa5Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const volMa10Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const volMa20Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const extraRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  // 插件与图元引用（卸载时 detach）
  // 泛型统一为默认的 Time（UTCTimestamp | BusinessDay | string），
  // 与 chart.panes() 返回的 IPaneApi<Time> 对齐。
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const watermarkPluginRef = useRef<ITextWatermarkPluginApi<Time> | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);
  const primitiveRef = useRef<ISeriesPrimitive | null>(null);
  // 记录已渲染到的最后一根 K 线时间，用于增量 update
  const lastTimeRef = useRef<number | null>(null);
  // 面板对象：主图/成交量 pane（setStretchFactor 演示）
  const mainPaneRef = useRef<IPaneApi<Time> | null>(null);
  const volumePaneRef = useRef<IPaneApi<Time> | null>(null);
  const featRef = useRef<FeatState>({ indicators, markers, watermark, trendLine, priceLine, extraPanes, seriesTypes });
  featRef.current = { indicators, markers, watermark, trendLine, priceLine, extraPanes, seriesTypes };
  // 数据引用（feature 同步 effect 里读取最新值，避免闭包过期）
  const dataRef = useRef(data);
  dataRef.current = data;

  // 所有叠加序列 refs 打包成引用，传给模块级工具函数
  const overlayRefs: OverlayRefs = {
    ma5: ma5Ref,
    ma10: ma10Ref,
    ma20: ma20Ref,
    volMa5: volMa5Ref,
    volMa10: volMa10Ref,
    volMa20: volMa20Ref,
    line: lineRef,
    area: areaRef,
    bar: barRef,
    baseline: baselineRef,
    extra: extraRef,
    feat: featRef,
    markersPlugin: markersPluginRef,
  };

  // 初始化图表（只执行一次）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#0f1420' },
        textColor: '#8b949e',
        fontSize: 11,
        // 去掉左下角 TradingView attribution logo（许可要求见库 NOTICE 文件：
        // 若页面上没有到 tradingview.com 的链接，需在代码/页面保留 attribution 声明）
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#1c2333' },
        horzLines: { color: '#1c2333' },
      },
      // 交互能力演示：保留拖拽平移与捏合缩放，但关闭鼠标滚轮缩放。
      // 库只在 handleScroll.mouseWheel || handleScale.mouseWheel 为 true 时才挂
      // wheel listener 并 preventDefault——滚轮事件被图表吞掉会导致页面无法滚动。
      // 两个开关都设 false 后 wheel 事件回到浏览器默认行为，鼠标悬停图表上
      // 也能直接滚动页面（时间轴平移缩放仍可经拖拽、触摸与捏合完成）。
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: false, pinch: true },
      kineticScroll: { touch: true, mouse: false },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#3a4152', width: 1, style: LineStyle.Dashed },
        horzLine: { color: '#3a4152', width: 1, style: LineStyle.Dashed },
      },
      rightPriceScale: { borderColor: '#1c2333' },
      timeScale: {
        borderColor: '#1c2333',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
      },
      localization: {
        // 时间刻度格式化：自定义为 YYYY-MM-DD（timeFormatter 的参数类型是 HorzScaleItem=Time）
        timeFormatter: (time: Time) => {
          const ts = typeof time === 'number' ? time : NaN;
          if (Number.isNaN(ts)) return '';
          const d = new Date(ts * 1000);
          const pad = (n: number) => String(n).padStart(2, '0');
          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        },
      },
    });

    // 主图 K 线（paneIndex=0 显式放回主图；主图即 panes()[0]）。
    // 开启 lastValueVisible（最后价标签）、priceLineVisible（跟随最新价的价格线）、
    // title（序列名，显示在最后价标签旁）——都是 SeriesOptionsCommon 的常用项。
    const candle = chart.addSeries(
      CandlestickSeries,
      {
        upColor: UPDOWN_COLORS.up,
        downColor: UPDOWN_COLORS.down,
        borderUpColor: UPDOWN_COLORS.up,
        borderDownColor: UPDOWN_COLORS.down,
        wickUpColor: UPDOWN_COLORS.up,
        wickDownColor: UPDOWN_COLORS.down,
        lastValueVisible: true,
        priceLineVisible: true,
        priceLineColor: '#e0af68',
        title: '主图K线',
      },
      0,
    );

    // 成交量：独立 pane（paneIndex=1 即第一个附加 pane，等于 panes()[1]）。
    // 注意：priceScaleId 命名 scale 后，必须等序列创建完毕、scale 归入对应 pane
    // 之后才能取到它；而 chart.priceScale(id) 只查主图 pane（paneIndex 默认 0），
    // 取副图 scale 要经 chart.panes()[paneIndex].priceScale(id)（缺省时抛错）。
    // 因此这里改为在各自 pane 创建后、用 pane.priceScale(id) 设置 scaleMargins。
    const volume = chart.addSeries(
      HistogramSeries,
      {
        priceFormat: { type: 'volume' },
        priceScaleId: 'vol',
      },
      1,
    );

    // 附加演示 pane：涨跌幅直方图（stretch factor 演示）
    const extra = chart.addSeries(
      HistogramSeries,
      {
        color: '#e0af68',
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        priceScaleId: 'extra',
      },
      2,
    );

    // 其他序列类型：叠加在主图（paneIndex=0）。
    // lineWidth 之外再演示 lastValueVisible 等公共选项与 LineType（曲线 vs 阶梯）
    const line = chart.addSeries(
      LineSeries,
      { color: '#7aa2f7', lineWidth: 1, priceScaleId: 'main', lineType: LineType.WithSteps, lastValueVisible: true, title: '收盘' },
      0,
    );
    const area = chart.addSeries(
      AreaSeries,
      {
        lineColor: '#9ece6a',
        topColor: 'rgba(158,206,106,.25)',
        bottomColor: 'rgba(158,206,106,.02)',
        priceScaleId: 'main',
      },
      0,
    );
    const bar = chart.addSeries(BarSeries, { upColor: '#f7768e', downColor: '#8b949e', priceScaleId: 'main' }, 0);
    const baseline = chart.addSeries(
      BaselineSeries,
      {
        baseValue: { type: 'price', price: 0 },
        topLineColor: '#26a69a',
        topFillColor1: 'rgba(38,166,154,.25)',
        topFillColor2: 'rgba(38,166,154,0)',
        bottomLineColor: '#ef5350',
        bottomFillColor1: 'rgba(239,83,80,.25)',
        bottomFillColor2: 'rgba(239,83,80,0)',
        priceScaleId: 'main',
      },
      0,
    );

    // 指标线：手算 MA（主图 5/10/20 均线 + 成交量 pane 的 5/10/20 均量线）
    const ma5 = chart.addSeries(LineSeries, { color: '#f7768e', lineWidth: 1, priceScaleId: 'main' }, 0);
    const ma10 = chart.addSeries(LineSeries, { color: '#7aa2f7', lineWidth: 1, priceScaleId: 'main' }, 0);
    const ma20 = chart.addSeries(LineSeries, { color: '#e0af68', lineWidth: 1, priceScaleId: 'main' }, 0);
    const volMa5 = chart.addSeries(LineSeries, { color: '#f7768e', lineWidth: 1, priceScaleId: 'vol' }, 1);
    const volMa10 = chart.addSeries(LineSeries, { color: '#7aa2f7', lineWidth: 1, priceScaleId: 'vol' }, 1);
    const volMa20 = chart.addSeries(LineSeries, { color: '#e0af68', lineWidth: 1, priceScaleId: 'vol' }, 1);

    // 序列标记插件（买卖点）：autoScale（注意不是 autoscale）让价格刻度把标记也算进去
    const markersPlugin = createSeriesMarkers<Time>(candle, [], { autoScale: true });

    // 文本水印插件（挂主图 pane，即 panes()[0]；v5 挂在 pane 上而非 chart 上）
    const watermarkPlugin = createTextWatermark(chart.panes()[0], {
      lines: [
        {
          text: 'Lightweight-Charts',
          color: 'rgba(139,148,158,0.28)',
          fontSize: 26,
          fontStyle: 'bold',
          fontFamily: '-apple-system, PingFang SC',
        },
      ],
    });

    // 自定义趋势线图元（ISeriesPrimitive 接口）
    const primitive: ISeriesPrimitive = makeTrendLinePrimitive();

    // 价格线（示例价 = 数据均值，仅用于展示 API）
    const priceLine = candle.createPriceLine({
      price: 0,
      color: '#e0af68',
      lineStyle: LineStyle.Dashed,
      lineWidth: 1,
      axisLabelVisible: true,
      title: '参考价',
    });

    // 记引用
    chartRef.current = chart;
    candleRef.current = candle;
    volumeRef.current = volume;
    extraRef.current = extra;
    lineRef.current = line;
    areaRef.current = area;
    barRef.current = bar;
    baselineRef.current = baseline;
    ma5Ref.current = ma5;
    ma10Ref.current = ma10;
    ma20Ref.current = ma20;
    volMa5Ref.current = volMa5;
    volMa10Ref.current = volMa10;
    volMa20Ref.current = volMa20;
    markersPluginRef.current = markersPlugin;
    watermarkPluginRef.current = watermarkPlugin;
    priceLineRef.current = priceLine;
    primitiveRef.current = primitive;
    mainPaneRef.current = chart.panes()[0] ?? null;
    volumePaneRef.current = chart.panes()[1] ?? null;

    return () => {
      markersPlugin.detach();
      watermarkPlugin.detach();
      candle.removePriceLine(priceLine);
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      extraRef.current = null;
      lineRef.current = null;
      areaRef.current = null;
      barRef.current = null;
      baselineRef.current = null;
      ma5Ref.current = null;
      ma10Ref.current = null;
      ma20Ref.current = null;
      volMa5Ref.current = null;
      volMa10Ref.current = null;
      volMa20Ref.current = null;
      markersPluginRef.current = null;
      watermarkPluginRef.current = null;
      priceLineRef.current = null;
      primitiveRef.current = null;
      mainPaneRef.current = null;
      volumePaneRef.current = null;
      lastTimeRef.current = null;
    };
  }, []);

  // 数据变化：全量重设 or 增量追加/更新最后一根（沿用 LightweightChart 的增量策略）
  useEffect(() => {
    const chart = chartRef.current;
    const candle = candleRef.current;
    if (!chart || !candle || data.length === 0) return;

    const lastTime = lastTimeRef.current;
    const reset = () => {
      candle.setData(data.map(toCandle));
      volumeRef.current?.setData(data.map(toVolume));
      extraRef.current?.setData(data.map(toExtra));
      syncOverlaySeries(data, overlayRefs);
      lastTimeRef.current = data[data.length - 1].time;
    };
    const appendUpdate = () => {
      // 找到与已渲染最后一根同时间戳的位置，从那里开始逐根 update()
      const startIdx = data.findIndex((d) => d.time === lastTime);
      if (startIdx < 0) {
        reset();
        return;
      }
      for (let i = startIdx; i < data.length; i++) {
        candle.update(toCandle(data[i]));
        volumeRef.current?.update(toVolume(data[i]));
        // 附加面板若关闭，不喂增量（避免空序列上冒孤立点）
        if (featRef.current.extraPanes) extraRef.current?.update(toExtra(data[i]));
      }
      updateOverlaySeries(data, overlayRefs);
      lastTimeRef.current = data[data.length - 1].time;
    };
    if (!live) {
      reset();
      return;
    }
    if (lastTime === null || data[data.length - 1].time < lastTime) {
      reset();
    } else {
      appendUpdate();
    }
  }, [data, live]);

  // symbol 变化时滚动到最后
  useEffect(() => {
    chartRef.current?.timeScale().scrollToRealTime();
  }, [symbol, data]);

  // 面板布局：主图 pane 用 setStretchFactor 给更大纵向权重；成交量 pane 保持
  // 固定高度（setHeight 用法），并设置其价格刻度 scaleMargins（取副图 scale
  // 须经 chart.panes()[paneIndex].priceScale(id)，chart.priceScale(id) 只查主图）。
  // 附加演示面板的显隐由「多面板」开关控制，见 feature 同步 effect（默认折叠）。
  useEffect(() => {
    const chart = chartRef.current;
    const mainPane = mainPaneRef.current;
    const volumePane = volumePaneRef.current;
    if (!chart || !mainPane || !volumePane) return;
    mainPane.setStretchFactor(4);
    volumePane.setStretchFactor(1);
    volumePane.setHeight(140);
    chart.panes()[1].priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
  }, []);

  // 功能开关同步：feature 关闭时卸载对应序列/插件，开启时重新填充
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const f = featRef.current;
    const candle = candleRef.current;
    if (!candle) return;

    // 指标线
    if (f.indicators) {
      ma5Ref.current?.setData(calcMA(dataRef.current, 5));
      ma10Ref.current?.setData(calcMA(dataRef.current, 10));
      ma20Ref.current?.setData(calcMA(dataRef.current, 20));
      volMa5Ref.current?.setData(calcMA(dataRef.current, 5));
      volMa10Ref.current?.setData(calcMA(dataRef.current, 10));
      volMa20Ref.current?.setData(calcMA(dataRef.current, 20));
    } else {
      [ma5Ref.current, ma10Ref.current, ma20Ref.current, volMa5Ref.current, volMa10Ref.current, volMa20Ref.current].forEach((s) => s && s.setData([]));
    }

    // 其他序列类型
    if (f.seriesTypes) {
      lineRef.current?.setData(dataRef.current.map(toLine));
      areaRef.current?.setData(dataRef.current.map(toArea));
      barRef.current?.setData(dataRef.current.map(toBar));
      baselineRef.current?.setData(dataRef.current.map(toBaseline));
    } else {
      [lineRef.current, areaRef.current, barRef.current, baselineRef.current].forEach((s) => s && s.setData([]));
    }

    // 序列标记
    if (f.markers) {
      const markers = buildMarkers(dataRef.current);
      if (markersPluginRef.current) markersPluginRef.current.setMarkers(markers);
    } else if (markersPluginRef.current) {
      markersPluginRef.current.setMarkers([]);
    }

    // 水印（挂主图 pane；pane 本身不可整体隐藏，visible 控制文本显隐）
    if (watermarkPluginRef.current) {
      watermarkPluginRef.current.applyOptions({ visible: f.watermark });
    }

    // 趋势线图元
    if (f.trendLine && primitiveRef.current) {
      candle.attachPrimitive(primitiveRef.current);
    } else if (primitiveRef.current) {
      candle.detachPrimitive(primitiveRef.current);
    }

    // 价格线
    const pl = priceLineRef.current;
    if (pl) {
      if (f.priceLine) {
        const mid = dataRef.current.length
          ? dataRef.current[Math.floor(dataRef.current.length / 2)].close
          : 0;
        pl.applyOptions({ price: mid, axisLabelVisible: true, lineVisible: true });
      } else {
        pl.applyOptions({ lineVisible: false, axisLabelVisible: false });
      }
    }

    // 附加面板：开启时填入涨跌幅直方图数据、固定 100px 高 + scaleMargins；
    // 关闭时清空数据并把面板折叠（setHeight(0) 重新启用拉伸，stretchFactor 0
    // 不占高度，避免默认状态下底部留一条空面板）
    const extraPane = chart?.panes()[2];
    if (f.extraPanes) {
      extraRef.current?.setData(dataRef.current.map(toExtra));
      extraPane?.setHeight(100);
      extraPane?.setStretchFactor(1);
      chart?.panes()[2].priceScale('extra').applyOptions({ scaleMargins: { top: 0.6, bottom: 0.1 } });
    } else {
      extraRef.current?.setData([]);
      extraPane?.setHeight(0);
      extraPane?.setStretchFactor(0);
    }
  }, [indicators, markers, watermark, trendLine, priceLine, extraPanes, seriesTypes]);

  // 对外暴露：手动重绘（页面可不依赖，留作 API 演示）
  useImperativeHandle(ref, () => ({
    redraw() {
      chartRef.current?.timeScale().scrollToRealTime();
    },
  }), []);

  return (
    <div className="chart-container">
      <div ref={containerRef} className="chart-fill" />
    </div>
  );
});

/** 叠加序列所需的全部 refs，打包传参给模块级工具函数，避免闭包引用组件作用域变量 */
interface OverlayRefs {
  ma5: MutableRefObject<ISeriesApi<'Line'> | null>;
  ma10: MutableRefObject<ISeriesApi<'Line'> | null>;
  ma20: MutableRefObject<ISeriesApi<'Line'> | null>;
  volMa5: MutableRefObject<ISeriesApi<'Line'> | null>;
  volMa10: MutableRefObject<ISeriesApi<'Line'> | null>;
  volMa20: MutableRefObject<ISeriesApi<'Line'> | null>;
  line: MutableRefObject<ISeriesApi<'Line'> | null>;
  area: MutableRefObject<ISeriesApi<'Area'> | null>;
  bar: MutableRefObject<ISeriesApi<'Bar'> | null>;
  baseline: MutableRefObject<ISeriesApi<'Baseline'> | null>;
  extra: MutableRefObject<ISeriesApi<'Histogram'> | null>;
  feat: MutableRefObject<FeatState>;
  markersPlugin: MutableRefObject<ISeriesMarkersPluginApi<Time> | null>;
}

interface FeatState {
  indicators: boolean;
  markers: boolean;
  watermark: boolean;
  trendLine: boolean;
  priceLine: boolean;
  extraPanes: boolean;
  seriesTypes: boolean;
}

/** —— 工具函数 —— */

function toCandle(d: OHLCV): CandlestickData {
  return {
    // Binance 的 d.time 是毫秒，UTCTimestamp 期望秒
    time: (d.time / 1000) as UTCTimestamp,
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
  };
}

function toVolume(d: OHLCV): HistogramData {
  return {
    time: (d.time / 1000) as UTCTimestamp,
    value: d.volume,
    color: d.close >= d.open ? UPDOWN_COLORS.up : UPDOWN_COLORS.down,
  };
}

/** 附加面板序列：构造一个"涨跌幅直方图"（收-开 / 开），颜色按涨跌 */
function toExtra(d: OHLCV): HistogramData {
  const pct = d.open !== 0 ? (d.close - d.open) / d.open : 0;
  return {
    time: (d.time / 1000) as UTCTimestamp,
    value: pct,
    color: pct >= 0 ? 'rgba(38,166,154,.7)' : 'rgba(239,83,80,.7)',
  };
}

function toLine(d: OHLCV): LineData {
  return { time: (d.time / 1000) as UTCTimestamp, value: d.close };
}

function toArea(d: OHLCV): AreaData {
  return { time: (d.time / 1000) as UTCTimestamp, value: d.high };
}

function toBar(d: OHLCV): BarData {
  return {
    time: (d.time / 1000) as UTCTimestamp,
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
  };
}

function toBaseline(d: OHLCV): BaselineData {
  return { time: (d.time / 1000) as UTCTimestamp, value: d.close };
}

/** 简单移动平均（只对已收完的窗口计算，前 N-1 根没有值则跳过） */
function calcMA(data: OHLCV[], n: number): LineData[] {
  const out: LineData[] = [];
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i].close;
    if (i >= n) sum -= data[i - n].close;
    if (i >= n - 1) {
      out.push({ time: (data[i].time / 1000) as UTCTimestamp, value: sum / n });
    }
  }
  return out;
}

/** 增量更新叠加序列（指标/序列类型只更新最后一根，避免每次全量 setData 的闪烁）。
    注意：所有叠加更新都必须以 feat 开关为前提——若开关已关但数据还在追加，
    对空序列 update() 会凭空冒出一个孤立数据点，默认全关时会在图上画出杂点。 */
function updateOverlaySeries(data: OHLCV[], refs: OverlayRefs) {
  const f = refs.feat.current;
  const last = data[data.length - 1];
  const t = (last.time / 1000) as UTCTimestamp;
  // 均线增量：重算最后一段窗口，对最后一根 update
  if (f.indicators) {
    const ma5 = refs.ma5.current;
    if (ma5) {
      const tail = calcMA(data, 5);
      if (tail.length) ma5.update(tail[tail.length - 1]);
    }
  }
  // 其余叠加序列直接 update 最后一根
  if (f.seriesTypes) {
    const line = refs.line.current;
    if (line) line.update({ time: t, value: last.close });
    const area = refs.area.current;
    if (area) area.update({ time: t, value: last.high });
    const bar = refs.bar.current;
    if (bar) bar.update(toBar(last));
    const baseline = refs.baseline.current;
    if (baseline) baseline.update({ time: t, value: last.close });
  }
  if (f.extraPanes) {
    const extra = refs.extra.current;
    if (extra) extra.update(toExtra(last));
  }
}

/** 同步所有叠加序列（全量模式） */
function syncOverlaySeries(data: OHLCV[], refs: OverlayRefs) {
  const f = refs.feat.current;
  if (f.indicators) {
    refs.ma5.current?.setData(calcMA(data, 5));
    refs.ma10.current?.setData(calcMA(data, 10));
    refs.ma20.current?.setData(calcMA(data, 20));
    refs.volMa5.current?.setData(calcMA(data, 5));
    refs.volMa10.current?.setData(calcMA(data, 10));
    refs.volMa20.current?.setData(calcMA(data, 20));
  }
  if (f.seriesTypes) {
    refs.line.current?.setData(data.map(toLine));
    refs.area.current?.setData(data.map(toArea));
    refs.bar.current?.setData(data.map(toBar));
    refs.baseline.current?.setData(data.map(toBaseline));
  }
  if (f.extraPanes) {
    refs.extra.current?.setData(data.map(toExtra));
  }
  if (f.markers && refs.markersPlugin.current) {
    refs.markersPlugin.current.setMarkers(buildMarkers(data));
  }
}

/** 在最后 ~30 根里挑几个点做买卖标记（涨=买 蓝箭头，跌=卖 红箭头） */
function buildMarkers(data: OHLCV[]): SeriesMarker<Time>[] {
  const markers: SeriesMarker<Time>[] = [];
  const start = Math.max(0, data.length - 30);
  for (let i = start; i < data.length; i++) {
    const d = data[i];
    if (d.close > d.open) {
      markers.push({
        time: (d.time / 1000) as UTCTimestamp,
        position: 'belowBar',
        color: '#7aa2f7',
        shape: 'arrowUp',
        text: '买',
      });
    } else if (d.close < d.open) {
      markers.push({
        time: (d.time / 1000) as UTCTimestamp,
        position: 'aboveBar',
        color: '#f7768e',
        shape: 'arrowDown',
        text: '卖',
      });
    }
  }
  return markers;
}

/** 序列数据的类型别名（绘制趋势线时用，避免在 draw 里到处写结构体） */
type CandleLike = { time?: number; close?: number };

/**
 * 趋势线图元：一个简单的 ISeriesPrimitive 实现。
 * 在主图画一条横贯可见区间的虚线（连接首尾两根 K 线的收盘价）。
 *
 * 坐标转换的正确姿势（v5）：
 *  - x：param.chart.timeScale().timeToCoordinate(time)（timeToCoordinate 在
 *    ITimeScaleApi / IPaneApi 上，不在 ISeriesApi 上）；
 *  - y：param.series.priceToCoordinate(price)；
 *  - 绘制：target.useBitmapCoordinateSpace() 里是位图像素坐标，必须把
 *    horizontalPixelRatio / verticalPixelRatio 乘到 lineWidth 上，否则高 DPI
 *    下线条会偏细（CSS 像素 1.5px 在 retina 上是 3 个设备像素）。
 */
function makeTrendLinePrimitive(): ISeriesPrimitive {
  let param: SeriesAttachedParameter | null = null;
  let timeScale: ITimeScaleApi<Time> | null = null;
  const view: IPrimitivePaneView = {
    renderer: (): IPrimitivePaneRenderer | null => ({
      draw(target: CanvasRenderingTarget2D) {
        const s = param?.series;
        if (!s) return;
        // dataByIndex(0, ...) 取可见区间最左一根（索引越界时 Nearest* 就近取到边界）
        const all = s.dataByIndex(0, MismatchDirection.NearestRight);
        if (!all) return;
        const first = all as unknown as CandleLike;
        const last = s.dataByIndex(Number.MAX_SAFE_INTEGER, MismatchDirection.NearestLeft) as unknown as CandleLike | null;
        const t1 = typeof first?.time === 'number' ? first.time : NaN;
        const t2 = typeof last?.time === 'number' ? last.time : NaN;
        const c1 = typeof first?.close === 'number' ? first.close : NaN;
        const c2 = typeof last?.close === 'number' ? last.close : NaN;
        if (Number.isNaN(t1) || Number.isNaN(t2) || Number.isNaN(c1) || Number.isNaN(c2)) return;
        const x1 = timeScale?.timeToCoordinate(t1 as Time);
        const x2 = timeScale?.timeToCoordinate(t2 as Time);
        const y1 = s.priceToCoordinate(c1);
        const y2 = s.priceToCoordinate(c2);
        if (x1 === null || x2 === null || y1 === null || y2 === null) return;
        if (typeof x1 !== 'number' || typeof x2 !== 'number' || typeof y1 !== 'number' || typeof y2 !== 'number') return;
        // 位图坐标空间：坐标为位图像素，lineWidth 需乘 pixelRatio 折算回 CSS 像素。
        // useBitmapCoordinateSpace 接收回调（返回 void），返回其 scope 解构即可拿
        // ctx 与 horizontalPixelRatio / verticalPixelRatio。
        const scope = target.useBitmapCoordinateSpace((s) => ({
          ctx: s.context,
          hpr: s.horizontalPixelRatio,
        }));
        const ctx = scope.ctx;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = '#e0af68';
        ctx.lineWidth = 1.5 * scope.hpr;
        ctx.setLineDash([4 * scope.hpr, 4 * scope.hpr]);
        ctx.stroke();
      },
    }),
  };
  const primitive: ISeriesPrimitive = {
    paneViews() {
      return [view];
    },
    attached(p: SeriesAttachedParameter) {
      param = p;
      timeScale = p.chart.timeScale();
    },
    detached() {
      param = null;
      timeScale = null;
    },
  };
  return primitive;
}
