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
  /** 全量重设信号：变化时即使 (symbol) 不变也强制整表重绘（如切换历史根数） */
  resetKey?: string;
}

const UPDOWN = { up: '#26a69a', down: '#ef5350' } as const;

/**
 * ECharts 适配组件。
 * 主图：candlestick；副图：bar（成交量，第 2 个 grid）。
 * 通用坐标系 + dataZoom 实现缩放/平移，与"专门 K 线库"的交互方式有差异，
 * 正好作为对比维度。
 */
export function EChartsChart({ data, symbol, live = true, resetKey }: EChartsChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const lastResetKeyRef = useRef<string | null>(null);

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
    // resetKey（历史根数等）变化也是整体替换信号：即使同一 symbol/时间序列未倒退，
    // 也要整表重绘（否则增量 merge 只会补上新 bar，旧 bar 根数不会变）。
    const keyChanged = resetKey !== undefined && resetKey !== lastResetKeyRef.current;
    const replace = !live || lastTime === null || data[data.length - 1].time < lastTime || keyChanged;

    if (replace) {
      chart.setOption(buildOption(data, symbol));
      lastResetKeyRef.current = resetKey ?? null;
    } else {
      // 增量：ECharts 没有 K 线专用的 update action，setOption 默认是 merge
      // （只有传 notMerge=true 才整表替换），所以直接按系列合并重设数据即可。
      // category 轴 data 同样需要跟着推进，否则新 bar 没有对应的刻度。
      const times = data.map((d) => d.time);
      chart.setOption({
        xAxis: [{ data: times }, { data: times }],
        series: [
          { data: data.map(toCandle) },
          { data: data.map((d, i) => ({ value: [i, d.volume], itemStyle: { color: d.close >= d.open ? UPDOWN.up : UPDOWN.down } })) },
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
  // 量能柱上色：第三维放 { color } 会让 TS 把整列推断成
  // (number | { color: ... })[][]，无法赋给 CandlestickDataValue[]。
  // 让第三维统一收窄为 string（"#26a69a" | "#ef5350"），eCharts 的 series.data
  // 才能与声明的维度类型对上（K 线颜色仍由相邻 itemStyle.color 控制）。
  const volumeData = data.map((d, i) => ({
    value: [i, d.volume],
    // 量能柱红绿：必须用 itemStyle 对象给每根柱单独上色。
    // 若把颜色放进第三维（[i, vol, '#26a69a']）会被 ECharts 当成普通维度值忽略，
    // 柱色退回系列默认色板蓝，红绿渲染失效。
    itemStyle: { color: d.close >= d.open ? UPDOWN.up : UPDOWN.down },
  }));
  // 底部日期：OHLCV.time 是毫秒时间戳，category 轴默认把原始值当刻度文字
  // 直接显示（1757000000000），必须转成日期。日 K 显示 "YYYY-MM-DD"，
  // 分钟线补 "HH:mm"。
  // 时区注意：所有数据源的时间戳都是 fake-UTC（A 股源按中国挂钟时间的
  // Date.UTC() 解析、Binance 本身就是 UTC），因此必须用 getUTC* 取字段；
  // 用本地时区 getter 会把日期/时刻漂移（如东八区用户 14:30 的 K 线显示成 06:30）。
  const daily = data.length > 1 && data[1].time - data[0].time >= 86_400_000;
  const fmt = (ms: number) => {
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, '0');
    const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    return daily ? date : `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  };
  // 大数缩写：≥1e9 → B、≥1e6 → M、≥1e3 → K。成交量的轴刻度与 tooltip 都走它，
  // 避免一长串数字撑满轴线（如 BTC 日线成交量 28700 手 → 29K）。
  // 整数值直接取整不带小数位（800.00M → 800M），小数位对量能只是展示用，丢失精度可接受。
  const fmtVolume = (v: number): string => {
    const abs = Math.abs(v);
    if (abs >= 1e9) return `${Math.round(v / 1e9)}B`;
    if (abs >= 1e6) return `${Math.round(v / 1e6)}M`;
    if (abs >= 1e3) return `${Math.round(v / 1e3)}K`;
    return String(v);
  };
  // 工具提示：axis 触发时头部默认也显示原始 category 值，同样转成日期；
  // 成交量系列（seriesName === '成交量'）的数字走 fmtVolume 缩写
  const fmtTooltip = (params: unknown): string => {
    const list = (Array.isArray(params) ? params : [params]) as {
      marker?: string;
      seriesName?: string;
      value?: unknown;
      axisValue?: unknown;
    }[];
    const title = list[0]?.axisValue !== undefined ? fmt(Number(list[0].axisValue)) : '';
    const rows = list
      .map((p) => {
        // candlestick 主系列 value 是 [open, close, low, high]，取开盘价（下标 0）；
        // 成交量 bar 系列 value 是 [index, volume]，取成交量（下标 1）。
        const arr = Array.isArray(p.value) ? (p.value as number[]) : null;
        const v = arr ? arr[0] : p.value;
        const text = p.seriesName === '成交量' ? fmtVolume(Number(v)) : String(v);
        return `${p.marker ?? ''}${p.seriesName ?? ''}: ${text}`;
      })
      .join('<br/>');
    return title ? `${title}<br/>${rows}` : rows;
  };

  return {
    backgroundColor: '#0f1420',
    animation: false,
    legend: { data: [symbol], textStyle: { color: '#8b949e' } },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: fmtTooltip,
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
        axisLabel: { color: '#8b949e', formatter: (v: string | number) => fmt(Number(v)) },
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
        // 成交量数字缩写：轴刻度从 "28700" 变成 "28.70K"，避免一长串数字撑满轴线
        axisLabel: {
          color: '#8b949e',
          formatter: (v: number) => fmtVolume(v),
        },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1], start: 60, end: 100 },
      {
        type: 'slider',
        xAxisIndex: [0, 1],
        top: '94%',
        height: 16,
        labelFormatter: (value: number) => fmt(value),
      },
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
