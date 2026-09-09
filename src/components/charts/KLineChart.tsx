import { useEffect, useRef } from 'react';
import { init, dispose, type Chart, type KLineData, type Period } from 'klinecharts';
import type { OHLCV } from '../../types/ohlcv';

export interface KLineChartProps {
  data: OHLCV[];
  symbol: string;
  /** 周期（klinecharts v10 的 Period 结构） */
  period: string;
  /** 是否实时追加/更新最后一根 K 线 */
  live?: boolean;
  /** 全量重设信号：变化时强制整批重载（如切换历史根数） */
  resetKey?: string;
}

const UPDOWN = { up: '#26a69a', down: '#ef5350' } as const;

/** KLinePeriod → klinecharts v10 Period 结构 */
function toPeriod(period: string): Period {
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

/**
 * KLineChart v10 适配组件。
 *
 * v10 没有公共的 applyNewData/updateData 增量接口，所有数据只能经
 * setDataLoader 注入：setDataLoader 内部会 resetData 并触发一次
 * getBars('init')。因此 dataLoader 必须只注册一次，实时增量改由
 * subscribeBar 注入的回调完成（单根 bar 由 Store._addData 处理：
 * 时间戳大于最后一根则追加，等于则替换最后一根）。
 *
 * 副图：VOL 指标（含 MA5/10/20 均量线）。createIndicator 每次调用都会
 * 新增一个副图 pane 且不去重，必须在 init 里用 ref 防重，否则每轮轮询
 * 都会累积出一个新的 VOL 窗口，把可伸缩的蜡烛图主窗口挤成 0 高。
 */
export function KLineChart({ data, symbol, period, live = true, resetKey }: KLineChartProps) {
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

  // 每次渲染都同步最新数据，供 getBars/init 读取
  dataRef.current = data;
  symbolRef.current = symbol;

  // 创建图表 + 注册 DataLoader（只执行一次）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = init(el, {
      locale: 'zh-CN',
      // 时间戳统一为 fake-UTC（A 股源按中国挂钟时间的 Date.UTC() 解析、Binance
      // 本身就是 UTC），横轴刻度必须按 UTC 渲染；不给 timezone 会落到浏览器本地
      // 时区，同一根 K 线的时间文字在非东八区用户机器上漂移。
      timezone: 'UTC',
      // 副图指标（VOL）的固定 pane 高度：默认 100px 太高，量能柱把主图空间挤占。
      // klinecharts 的 createIndicator 在新建 pane 时取 getLayoutOptions().pane，
      // 因此这里改 layout.pane.height 即能同时影响所有副图 pane 高度。
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

    return () => {
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

  // 周期变化：setPeriod 内部同样 resetData 重载
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    loadedKeyRef.current = '';
    chart.setPeriod(toPeriod(period));
  }, [period]);

  // 数据接入：同一 (symbol, period, resetKey) 的后续更新走增量；换了交易对、
  // 周期或历史根数（resetKey）则全量重载（init 会读取 dataRef 里的最新数据）
  useEffect(() => {
    if (data.length === 0) return;
    const chart = chartRef.current;
    if (!chart) return;

    const key = `${symbol}/${period}/${resetKey ?? ''}`;
    if (key !== loadedKeyRef.current) {
      // 首帧数据到达 / 交易对、周期或历史根数已切换：整批重载
      chart.resetData();
      loadedKeyRef.current = key;
    } else if (live) {
      // 同一序列的推进：把最后一根推给图表库（内部做追加/替换）
      const last = data[data.length - 1];
      livePushRef.current?.(toKLineData(last));
    }
  }, [data, symbol, period, live, resetKey]);

  return <div ref={containerRef} className="chart-container" />;
}
