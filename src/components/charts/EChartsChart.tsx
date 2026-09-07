import { useEffect, useRef } from 'react';
import { init, use, dispose, type EChartsType } from 'echarts/core';
import { CandlestickChart, type CandlestickSeriesOption } from 'echarts/charts';
import { BarChart, type BarSeriesOption } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  LegendComponent,
  type GridComponentOption,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ComposeOption } from 'echarts/core';
// XAXisOption/YAXisOption/SliderDataZoomOption/InsideDataZoomOption 只从
// echarts/types/dist/shared 原样导出（echarts 根入口和 core 都把它重命名成了
// XAXisComponentOption/DataZoomComponentOption）；type-only 导入不产生运行时代码，不影响按需打包
import type {
  XAXisOption,
  YAXisOption,
  SliderDataZoomOption,
  InsideDataZoomOption,
} from 'echarts/types/dist/shared';
import type { OHLCV } from '../../types/ohlcv';

// 注册用到的图表/组件/渲染器（tree-shakable）
use([
  CandlestickChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  LegendComponent,
  CanvasRenderer,
]);

type ECOption = ComposeOption<
  | CandlestickSeriesOption
  | BarSeriesOption
  | GridComponentOption
  | XAXisOption
  | YAXisOption
  | SliderDataZoomOption
  | InsideDataZoomOption
>;

export interface EChartsChartProps {
  data: OHLCV[];
  symbol: string;
  /** 是否实时追加/更新最后一根 K 线 */
  live?: boolean;
}

const UPDOWN = { up: '#26a69a', down: '#ef5350' } as const;

/**
 * ECharts 适配组件。
 * 主图：candlestick；副图：bar（成交量，第 2 个 grid）。
 * 通用坐标系 + dataZoom 实现缩放/平移，与"专门 K 线库"的交互方式有差异，
 * 正好作为对比维度。
 */
export function EChartsChart({ data, symbol, live = true }: EChartsChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  // 创建图表（只执行一次）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = init(el, null, { renderer: 'canvas' });
    chartRef.current = chart;

    return () => {
      dispose(chart);
      chartRef.current = null;
      lastTimeRef.current = null;
    };
  }, []);

  // 数据变化：全量重设 or 增量追加/更新最后一根
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || data.length === 0) return;

    const lastTime = lastTimeRef.current;
    const replace = !live || lastTime === null || data[data.length - 1].time < lastTime;

    if (replace) {
      chart.setOption(buildOption(data, symbol));
    } else {
      // 增量：ECharts 没有 K 线专用的 update action，setOption 默认是 merge
      // （只有传 notMerge=true 才整表替换），所以直接按系列合并重设数据即可。
      // category 轴 data 同样需要跟着推进，否则新 bar 没有对应的刻度。
      const times = data.map((d) => d.time);
      chart.setOption({
        xAxis: [{ data: times }, { data: times }],
        series: [
          { data: data.map(toCandle) },
          { data: data.map((d, i) => [i, d.volume, d.close >= d.open ? UPDOWN.up : UPDOWN.down]) },
        ],
      });
    }
    lastTimeRef.current = data[data.length - 1].time;
  }, [data, live, symbol]);

  return <div ref={containerRef} className="chart-container" />;
}

function toCandle(d: OHLCV): number[] {
  return [d.open, d.close, d.low, d.high];
}

function buildOption(data: OHLCV[], symbol: string): ECOption {
  const times = data.map((d) => d.time);
  const volumeData = data.map((d, i) => [
    i,
    d.volume,
    d.close >= d.open ? UPDOWN.up : UPDOWN.down,
  ]);

  return {
    backgroundColor: '#0f1420',
    animation: false,
    legend: { data: [symbol], textStyle: { color: '#8b949e' } },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: '#1a2233',
      borderColor: '#2b3245',
    },
    grid: [
      { left: 70, right: 20, top: 40, height: '55%' },
      { left: 70, right: 20, top: '72%', height: '18%' },
    ],
    xAxis: [
      {
        type: 'category',
        data: times,
        boundaryGap: true,
        axisLine: { lineStyle: { color: '#2b3245' } },
        axisLabel: { color: '#8b949e' },
        splitLine: { show: false },
        min: 'dataMin',
        max: 'dataMax',
      },
      {
        type: 'category',
        gridIndex: 1,
        data: times,
        boundaryGap: true,
        axisLine: { lineStyle: { color: '#2b3245' } },
        axisLabel: { show: false },
        splitLine: { show: false },
        min: 'dataMin',
        max: 'dataMax',
      },
    ],
    yAxis: [
      {
        scale: true,
        splitArea: { show: false },
        splitLine: { lineStyle: { color: '#1c2333' } },
        axisLabel: { color: '#8b949e' },
      },
      {
        scale: true,
        gridIndex: 1,
        splitNumber: 2,
        axisLabel: { color: '#8b949e' },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1], start: 60, end: 100 },
      { type: 'slider', xAxisIndex: [0, 1], top: '94%', height: 16 },
    ],
    series: [
      {
        name: symbol,
        type: 'candlestick',
        data: data.map(toCandle),
        itemStyle: {
          color: UPDOWN.up,
          color0: UPDOWN.down,
          borderColor: UPDOWN.up,
          borderColor0: UPDOWN.down,
        },
      },
      {
        name: '成交量',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: volumeData,
      },
    ],
  };
}
