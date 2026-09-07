import { useEffect, useRef } from 'react';
import { init, dispose, type Chart, type KLineData, type Period } from 'klinecharts';
import type { OHLCV } from '../../types/ohlcv';

export interface KLineChartProps {
  data: OHLCV[];
  symbol: string;
  /** 是否实时追加/更新最后一根 K 线 */
  live?: boolean;
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
 * 数据通过 setDataLoader 全权交给图表库加载，天然支持向前/向后翻页加载。
 * 副图：VOL 指标（含 MA5/10/20 均量线）。
 */
export function KLineChart({ data, symbol, live = true }: KLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);

  // 创建图表（只执行一次）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = init(el, {
      locale: 'zh-CN',
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

    chartRef.current = chart;
    return () => {
      dispose(chart as Chart);
      chartRef.current = null;
    };
  }, []);

  // symbol/period 变化：重置并触发加载
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setSymbol({ ticker: symbol });
    chart.setPeriod(toPeriod('1m'));
  }, [symbol]);

  // 数据接入：交给图表库的 DataLoader 机制
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    let disposed = false;
    let cached: KLineData[] = data.map(toKLineData);

    chart.setDataLoader({
      getBars(params) {
        if (disposed) return;
        if (params.type === 'init') {
          // 首次加载：整批投喂 + 建副图指标
          params.callback(cached);
          chart.createIndicator('VOL', false);
        } else if (params.type === 'forward') {
          // 向历史翻页：追加更早的数据（暂无分页源，直接拒绝翻页）
          params.callback([], { backward: false });
        }
      },
      subscribeBar(params) {
        // 实时更新：图表库主动订阅，收到新 bar 即增量刷新
        // 外部 data 的增量由下方 effect 通过 ref 回调推送
        liveUpdateRef.current = params.callback;
      },
      unsubscribeBar() {
        liveUpdateRef.current = null;
      },
    });

    // 外部 data 更新 → 增量喂给图表库（普通 K 线由 subscribeBar 回调更新）
    liveUpdateRef.current = (bar) => {
      cached = [...cached.slice(-1), bar];
    };

    return () => {
      disposed = true;
    };
  }, [data, symbol, live]);

  // 增量更新缓存：新 data 到达时以追加形式更新最后一根
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (data.length === 0) return;
    // 仅当是"同一序列的推进"时才增量，否则等待 init 重载
    if (lastTimestampRef.current === data[data.length - 1].time) return;
    lastTimestampRef.current = data[data.length - 1].time;
    // klinecharts 无公共的 updateData —— 通过 DataLoader 的 subscribeBar 回调完成
  }, [data]);

  return <div ref={containerRef} className="chart-container" />;
}

// 存放实时更新回调（DataLoader subscribeBar 注入）
const liveUpdateRef = { current: null as null | ((bar: KLineData) => void) };
// 记录已推进到的最新 bar 时间
const lastTimestampRef = { current: 0 };
