import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  init,
  dispose,
  registerIndicator,
  registerOverlay,
  registerHotkey,
  type Chart,
  type KLineData,
  type Period,
  type Crosshair,
  type VisibleRange,
  type OverlayFigure,
} from 'klinecharts';
import type { OHLCV } from '../../types/ohlcv';

export interface KlinechartsShowcaseChartRef {
  /** 拿到底层 Chart 实例，页面控制栏通过它调用全部 API */
  getChart: () => Chart | null;
}

export interface KlinechartsShowcaseChartProps {
  data: OHLCV[];
  symbol: string;
  /** 周期（klinecharts v10 的 Period 结构，由页面从 KlinePeriod 映射） */
  period: Period;
  /** 是否实时追加/更新最后一根 K 线 */
  live?: boolean;
  /** 十字光标变化（悬停 OHLC），null 表示离开数据区域 */
  onCrosshair?: (data: Crosshair | null) => void;
  /** 可见区间变化（from/to 为数据下标） */
  onVisibleRange?: (range: VisibleRange | null) => void;
}

/** KLinePeriod → klinecharts v10 Period 结构 */
export function toPeriod(period: string): Period {
  switch (period) {
    case '1m': return { type: 'minute', span: 1 };
    case '5m': return { type: 'minute', span: 5 };
    case '15m': return { type: 'minute', span: 15 };
    case '1h': return { type: 'hour', span: 1 };
    case '4h': return { type: 'hour', span: 4 };
    case '1d': return { type: 'day', span: 1 };
    default: return { type: 'minute', span: 1 };
  }
}

function toKLineData(d: OHLCV): KLineData {
  return { timestamp: d.time, open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume };
}

const UPDOWN = { up: '#26a69a', down: '#ef5350' } as const;

/**
 * klinecharts v10 详解页大图适配组件。
 *
 * 与看板 KLineChart 同一套 v10 数据接入（v10 无 applyNewData/updateData 公共
 * 增量接口，一切走 setDataLoader）：
 *  - setDataLoader 只注册一次，内部会 resetData 并触发一次 getBars('init')；
 *  - 实时增量经 subscribeBar 注入的单根 bar 回调（Store._addData 自动追加/替换）；
 *  - 副图 VOL 用 ref 防重（createIndicator 每次调用都新建 pane 不去重）。
 *
 * 页面控制栏的所有按钮都通过 ref 暴露的 getChart() 拿到实例直接调用 API：
 * createIndicator / createOverlay / setStyles / scrollToRealTime /
 * scrollByDistance / zoomAtCoordinate / getConvertPictureUrl 等。
 *
 * 自定义指标 / 叠加层 / 快捷键的注册放在本组件里（registerIndicator 等是
 * 全局单例注册，注册一次后整个库生命周期内都可用），页面只管"注册并创建"。
 * 注意：用户原给的模板用 v9 的 plots 字段，v10 已改为 figures
 * （IndicatorFigure = { key, title?, type?, ... }，与内置 AVP 模板一致）。
 */
export const KlinechartsShowcaseChart = forwardRef<
  KlinechartsShowcaseChartRef,
  KlinechartsShowcaseChartProps
>(function KlinechartsShowcaseChart({ data, symbol, period, live = true, onCrosshair, onVisibleRange }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  // 最新一份数据的引用，供 getBars/init 在任意时刻读取（避免闭包过期值）
  const dataRef = useRef<OHLCV[]>([]);
  // 当前应当展示的 symbol：init 时与 params.symbol 比对，防止切换交易对后
  // 把旧 symbol 的数据喂给新 ticker（父级清空 history 发生在子组件 effect 之后）
  const symbolRef = useRef(symbol);
  // 已把哪份 (symbol, period) 数据完整喂给过 init（决定增量 or 全量重载）
  const loadedKeyRef = useRef('');
  // 副图 VOL 只建一次
  const volCreatedRef = useRef(false);
  // subscribeBar 注入的增量回调（Store._addData(data,'update')）
  const livePushRef = useRef<((bar: KLineData) => void) | null>(null);
  // 滚轮拦截（挂在内层 _chartContainer 上）的清理函数
  const chartInterceptCleanupRef = useRef<(() => void) | null>(null);
  // 页面状态回调：存 ref 供 init effect 订阅用，避免闭包过期
  const onCrosshairRef = useRef(onCrosshair);
  onCrosshairRef.current = onCrosshair;
  const onVisibleRangeRef = useRef(onVisibleRange);
  onVisibleRangeRef.current = onVisibleRange;

  // 每次渲染都同步最新数据，供 getBars/init 读取
  dataRef.current = data;
  symbolRef.current = symbol;

  // 创建图表 + 注册 DataLoader（只执行一次）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // 自定义指标 / 叠加层 / 快捷键：register* 是全局注册，只执行一次即可
    registerShowcaseExtensions();

    const chart = init(el, {
      locale: 'zh-CN',
      // 时间戳统一为 fake-UTC（Binance 本身是 UTC），横轴刻度按 UTC 渲染，
      // 避免非东八区用户机器上时间文字漂移
      timezone: 'UTC',
      // 副图指标（VOL）的固定 pane 高度：默认 100px 太高，量能柱把主图空间挤占
      layout: { pane: { height: 60 } },
      styles: {
        separator: { color: '#1c2333', fill: true },
        grid: {
          horizontal: { color: '#1c2333' },
          vertical: { color: '#1c2333' },
        },
        candle: {
          bar: {
            upColor: UPDOWN.up,
            downColor: UPDOWN.down,
            noChangeColor: '#8b949e',
            upBorderColor: UPDOWN.up,
            downBorderColor: UPDOWN.down,
            noChangeBorderColor: '#8b949e',
            upWickColor: UPDOWN.up,
            downWickColor: UPDOWN.down,
            noChangeWickColor: '#8b949e',
          },
        },
        xAxis: { tickText: { color: '#8b949e' } },
        yAxis: { tickText: { color: '#8b949e' } },
        crosshair: { horizontal: { line: { color: '#3a4152' } }, vertical: { line: { color: '#3a4152' } } },
      },
    });
    if (!chart) return; // init 失败（理论上不会，给 TS 一个收窄）
    chartRef.current = chart;

    // DataLoader 全权接管数据。setDataLoader 内部会 resetData 并触发一次
    // getBars('init')，所以不能像 setSymbol/setPeriod 那样随 prop 重跑。
    chart.setDataLoader({
      getBars(params) {
        if (params.type === 'init') {
          // 整批投喂 + 建副图指标（只建一次）。切换交易对后 getBars 回调的
          // 是新 ticker，但 dataRef 仍是旧数据（父级 setHistory([]) 在子组件
          // effect 之后）——返回空数据，让下方 data effect 在数据到达后
          // resetData 再喂一次。
          if (symbolRef.current !== params.symbol.ticker) {
            params.callback([]);
            return;
          }
          params.callback(dataRef.current.map(toKLineData));
          if (!volCreatedRef.current) {
            // v10 的 createIndicator 第二参数只有 boolean（isStack），没有
            // paneIndex：每次调用都会新建/替换副图 pane，所以必须靠 ref 防重。
            // isStack=false 会先移除同 pane 已有指标，配合防重 ref 无副作用。
            chart.createIndicator('VOL', false);
            volCreatedRef.current = true;
          }
        } else if (params.type === 'forward') {
          // 向历史翻页：暂无分页源，直接拒绝翻页
          params.callback([], { backward: false });
        }
      },
      subscribeBar(params) {
        // 图表库注册实时回调：Store 收到单根 bar 会走 _addData('update')
        livePushRef.current = params.callback;
      },
      unsubscribeBar() {
        livePushRef.current = null;
      },
    });

    // 状态栏订阅：十字光标悬停 OHLC / 可见区间（页面通过 ref 的 getChart 也
    // 能自己 subscribe，这里只做状态条的最小订阅，避免页面重复订阅）
    chart.subscribeAction('onCrosshairChange', (data: unknown) => {
      onCrosshairRef.current?.(data as Crosshair | null);
    });
    chart.subscribeAction('onVisibleRangeChange', (data: unknown) => {
      onVisibleRangeRef.current?.(data as VisibleRange | null);
    });

    // 滚轮方向分流（修复触控板在图表区无法滚动页面）：
    // 实测确认（Playwright 对照实验）：
    //   1. 库把 wheel listener 绑在内部 `_chartContainer`（.chart-container 的
    //      第一个子 div，inline `overscroll-behavior:none` + `overflow:hidden`），
    //      且 _mouseWheelHandler 无条件 preventDefault —— 所以悬停图表时任何
    //      wheel 都会吞掉浏览器默认滚动，页面滚不动。
    //   2. 只在 chart-container 上挂 capture 拦截无效（事件仍被内部 div 上的
    //      非 passive 监听 preventDefault，默认滚动已取消）；但若在内部 div
    //      capture 阶段 stopImmediatePropagation，库收不到事件就不会 preventDefault，
    //      页面可恢复滚动（对照：window 捕获层 stop 无效——内部 div 的非 passive
    //      监听优先于 window）。
    //   3. 横向滚轮（deltaX 主导）放行给库，保留触控板两指横向滑动平移时间轴。
    // 实现：init 后直接拿 el.firstElementChild（库的 _chartContainer）挂 capture
    // 监听；被拦截的纵向滚轮手动滚 .kc-page 滚动容器。mouseleave 时库会移除
    // 自己的 wheel 监听，我们的 capture 监听挂在内层 div 上不受影响，但只在
    // 图表存在期间有效（cleanup 移除）。
    const inner = el.firstElementChild as HTMLElement | null;
    if (inner) {
      const wheelIntercept = (e: WheelEvent) => {
        const isVert = Math.abs(e.deltaY) >= Math.abs(e.deltaX);
        if (isVert) {
          e.stopImmediatePropagation();
          // 手动接管：把滚动量加到页面滚动容器上（deltaMode 0=pixel）
          const scroller = el.closest('.kc-page') as HTMLElement | null;
          if (scroller) scroller.scrollTop += e.deltaY;
        }
        // 横向（deltaX 主导）：放行给库做时间轴平移/缩放
      };
      inner.addEventListener('wheel', wheelIntercept, { capture: true, passive: true });
      chartInterceptCleanupRef.current = () => {
        inner.removeEventListener('wheel', wheelIntercept, { capture: true });
      };
    }

    return () => {
      chartInterceptCleanupRef.current?.();
      chartInterceptCleanupRef.current = null;
      livePushRef.current = null;
      dispose(chart);
      chartRef.current = null;
      volCreatedRef.current = false;
    };
  }, []);

  // symbol 变化：setSymbol 内部 resetData → getBars('init') 重新投喂
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    loadedKeyRef.current = '';
    chart.setSymbol({ ticker: symbol });
  }, [symbol]);

  // 周期变化：setPeriod 内部同样 resetData 重载。period prop 是父级每次渲染
  // 新建的对象，这里只依赖 period.type/period.span 两个原语，避免父级每次
  // setState（状态条/操作提示）都把 `{ type, span }` 新对象传给子组件，触发
  // 子组件 effect 重跑 → resetData → 图表库吐 onVisibleRangeChange 事件 →
  // 父级又 setState 的同步无限循环。
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    loadedKeyRef.current = '';
    chart.setPeriod(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.type, period.span]);

  // 数据接入：同一 (symbol, period) 的后续更新走增量；换了交易对或周期则
  // 全量重载（init 会读取 dataRef 里的最新数据）
  useEffect(() => {
    if (data.length === 0) return;
    const chart = chartRef.current;
    if (!chart) return;

    const key = `${symbol}/${period.type}/${period.span}`;
    if (key !== loadedKeyRef.current) {
      // 首帧数据到达 / 交易对或周期已切换：整批重载
      chart.resetData();
      loadedKeyRef.current = key;
    } else if (live) {
      // 同一序列的推进：把最后一根推给图表库（内部做追加/替换）
      const last = data[data.length - 1];
      livePushRef.current?.(toKLineData(last));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, symbol, period.type, period.span, live]);

  // 对外暴露 Chart 实例，页面控制栏所有按钮走它
  useImperativeHandle(ref, () => ({
    getChart() {
      return chartRef.current;
    },
  }), []);

  return <div ref={containerRef} className="chart-container" />;
});

/**
 * 注册本页演示用的自定义扩展（全局单例，只注册一次）：
 *  - 「TEST」自定义指标：最小模板，calc 返回收盘价序列，figures 声明一条线
 *  - 「customLine」自定义叠加层：水平直线，两点定线，鼠标点两下完成
 *  - 「control + t」自定义快捷键：滚动回最新
 *
 * 注意：用户原模板里用的是 v9 的 plots 字段，v10 已改为 figures
 * （IndicatorFigure = { key, title?, type?, ... }，与内置 AVP 模板同构）。
 */
function registerShowcaseExtensions() {
  // —— 自定义指标 ——
  registerIndicator({
    name: 'TEST',
    shortName: 'TEST',
    calc: (dataList: KLineData[]) => dataList.map((k) => ({ value: k.close })),
    figures: [{ key: 'value', title: '测试: ', type: 'line' }],
  });

  // —— 自定义叠加层：水平直线（totalStep=2，点两下完成；参照内置
  //     horizontalStraightLine 模板，createPointFigures 返回 line 图元）——
  registerOverlay({
    name: 'customLine',
    totalStep: 2,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures({ coordinates, bounding }): OverlayFigure[] {
      if (!coordinates[0]) return [];
      return [
        {
          type: 'line',
          attrs: {
            coordinates: [
              { x: 0, y: coordinates[0].y },
              { x: bounding.width, y: coordinates[0].y },
            ],
          },
        },
      ];
    },
  });

  // —— 自定义快捷键：Ctrl+T 滚动回最新（页面上已注册后按钮文案会变化）——
  registerHotkey({
    name: 'customHotkey',
    keys: ['control + t'],
    action({ chart }) {
      chart.scrollToRealTime();
    },
  });
}
