import { useEffect, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { OHLCV } from '../../types/ohlcv';

export interface LightweightChartsProps {
  data: OHLCV[];
  symbol: string;
  /** 是否实时追加/更新最后一根 K 线 */
  live?: boolean;
  /** 全量重设信号：变化时强制整表重绘（如切换历史根数） */
  resetKey?: string;
}

const UPDOWN_COLORS = {
  up: '#26a69a',
  down: '#ef5350',
} as const;

/**
 * lightweight-charts 适配组件。
 * 主图：CandlestickSeries；副图：HistogramSeries(成交量)。
 */
export function LightweightChart({ data, symbol, live = true, resetKey }: LightweightChartsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  // 记录已渲染到的最后一根 K 线时间，用于增量 update
  const lastTimeRef = useRef<number | null>(null);
  // 已渲染到的 resetKey（历史根数等整体替换信号）：变化时强制全量重设
  const lastResetKeyRef = useRef<string | null>(null);

  // 创建图表（只执行一次）
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
      crosshair: {
        mode: 0, // Normal
        vertLine: { color: '#3a4152', width: 1, style: 2 },
        horzLine: { color: '#3a4152', width: 1, style: 2 },
      },
      rightPriceScale: { borderColor: '#1c2333' },
      timeScale: {
        borderColor: '#1c2333',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
      },
    });

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: UPDOWN_COLORS.up,
      downColor: UPDOWN_COLORS.down,
      borderUpColor: UPDOWN_COLORS.up,
      borderDownColor: UPDOWN_COLORS.down,
      wickUpColor: UPDOWN_COLORS.up,
      wickDownColor: UPDOWN_COLORS.down,
    });

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    chart.priceScale('').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleRef.current = candle;
    volumeRef.current = volume;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      lastTimeRef.current = null;
      lastResetKeyRef.current = null;
    };
  }, []);

  // 数据变化：全量重设 or 增量追加/更新最后一根
  useEffect(() => {
    const candle = candleRef.current;
    const volume = volumeRef.current;
    if (!candle || !volume || data.length === 0) return;

    if (!live) {
      candle.setData(data.map(toCandle));
      volume.setData(data.map(toVolume));
      return;
    }

    // live 模式
    const lastTime = lastTimeRef.current;
    // 历史根数等整体替换信号变化：即使时间序列未倒退也要全量重设
    // （否则增量 update 只会"补 + 追加"新 bar，旧 bar 数量不变）
    const keyChanged = resetKey !== undefined && resetKey !== lastResetKeyRef.current;
    if (
      lastTime === null ||
      data[data.length - 1].time < lastTime ||
      keyChanged
    ) {
      // 首次加载，或数据被整体替换（symbol/period 切换后时间倒退）：全量设置
      candle.setData(data.map(toCandle));
      volume.setData(data.map(toVolume));
      lastResetKeyRef.current = resetKey ?? null;
    } else {
      // 增量：找到与已渲染最后一根同时间戳的位置，从那里开始逐根 update()。
      // update() 对同时间戳是替换、对新时间戳是追加，所以既覆盖"当前未收 K 线
      // 的 close/volume 刷新"，也覆盖"新开一根 K 线"两种实时推送场景。
      // 边界：如果已渲染的最后一根时间戳并不存在于新 data 里（订阅竞态把
      // 未收 K 线当成已收，历史随后覆盖到同一根并把它"收掉"；或历史被整体
      // 重置），增量循环对那根只会"跳过 + 追加"新 bar，导致这段被丢掉。
      // 检测到 startIdx 缺失就退化到全量重设（各库都是这么处理整体替换的）。
      const startIdx = data.findIndex((d) => d.time === lastTime);
      if (startIdx < 0) {
        candle.setData(data.map(toCandle));
        volume.setData(data.map(toVolume));
      } else {
        for (let i = startIdx; i < data.length; i++) {
          candle.update(toCandle(data[i]));
          volume.update(toVolume(data[i]));
        }
      }
    }
      lastTimeRef.current = data[data.length - 1].time;
  }, [data, live, resetKey]);

  // symbol 变化时滚动到最后
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.timeScale().scrollToRealTime();
  }, [symbol, data]);

  return <div ref={containerRef} className="chart-container" />;
}

function toCandle(d: OHLCV) {
  return {
    // Binance 的 d.time 是毫秒，UTCTimestamp 期望秒（typings.d.ts:5005），
    // 不转换会被当成秒 → 日期放大 1000 倍漂到 57647 年
    time: (d.time / 1000) as UTCTimestamp,
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
  };
}

function toVolume(d: OHLCV) {
  return {
    time: (d.time / 1000) as UTCTimestamp,
    value: d.volume,
    color: d.close >= d.open ? UPDOWN_COLORS.up : UPDOWN_COLORS.down,
  };
}
