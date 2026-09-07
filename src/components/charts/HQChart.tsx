import { useEffect, useRef } from 'react';
import Chart, {
  type HQChartOption,
  type HQJSChartInstance,
  type HQJSChartNamespace,
  type HQKLineContainer,
} from 'hqchart';
import type { OHLCV, KlinePeriod } from '../../types/ohlcv';

// 运行期命名空间兜底：
// hqchart 是 CJS 包（lib/main.js，无 __esModule），Vite 优化后 `export default`
// 是 CJS module.exports = { Chart, Stock, RegressionTest } 这个命名空间对象，
// 真正的图表库本体（jsChartInit 所在）在 .Chart 上。ESM 默认导入拿到的就是这个
// 命名空间对象本身（而非 .default），所以这里从 default 对象里再取 .Chart，
// 取不到才退化到直接使用导入值。
const HQ = (
  typeof Chart === 'object' && Chart !== null
    ? (Chart as unknown as { Chart?: HQJSChartNamespace }).Chart
    : undefined
) as HQJSChartNamespace | undefined;
const chartApi: HQJSChartNamespace =
  HQ && typeof HQ.jsChartInit === 'function' ? HQ : (Chart as unknown as HQJSChartNamespace);

export interface HQChartProps {
  data: OHLCV[];
  symbol: string;
  /** 周期（周期切换时强制重新请求数据） */
  period: KlinePeriod;
  /** 是否实时追加/更新最后一根 K 线 */
  live?: boolean;
}

/**
 * HQChart 适配组件。
 *
 * 数据接入方式：
 *  - 初始/换周期：用 NetworkFilter 拦截内置 HTTP 请求（RequestHistoryData /
 *    ReqeustHistoryMinuteData），PreventDefault 后把标准 OHLCV 数据转成
 *    HQChart 的 JSON 行格式回调给图表。
 *  - 实时更新：每次 data prop 变化时调用容器 ManualUpdateKData 手动推数据。
 *
 * HQChart 行格式（与 JsonDataToHistoryData 对齐）：
 *  - 日线 [日期YYYYMMDD, 昨收, 开, 高, 低, 收, 量, 额]
 *  - 分钟线 [日期YYYYMMDD, 昨收, 开, 高, 低, 收, 量, 额, 时间HHMMSS]
 * 日期/时间均取 UTC，因为 Binance 的 openTime 是 UTC 毫秒时间戳。
 */
export function HQChart({ data, symbol, period, live = true }: HQChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<HQJSChartInstance | null>(null);
  const chartContainerRef = useRef<HQKLineContainer | null>(null);
  const periodRef = useRef<number>(PERIOD_MINUTE_1);
  const symbolRef = useRef(symbol);
  // 最新一份数据的引用，供 NetworkFilter 在任意时刻读取（避免闭包过期值）
  const dataRef = useRef<OHLCV[]>([]);

  // 创建图表（只执行一次）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // 深色主题覆盖：HQChart 默认在画布上画一条浅色标题栏背景（FrameTitleBGColor
    // 默认 rgb(246,251,253)，也就是卡片上方那个"白色大框"），加上浅色边框/分割线。
    // jsChartStyle 必须在 jsChartInit 之前调用才会生效（它改的是全局资源默认值）。
    // 这里把标题栏背景对齐到卡片背景 #111625、边框/网格对齐到 #1c2333，
    // 并把标题栏里的 OHLC 文字（Title.*）调成浅灰，视觉上整个标题栏与深色卡片融为一体。
    // DisableLogo 是库提供的官方开关：把 FrameLogo.Text 置空，画布上那句
    // "*仅学习使用*" 声明就不再绘制。
    chartApi.jsChartStyle({
      DisableLogo: true,
      FrameTitleBGColor: '#111625',
      FrameBorderPen: '#1c2333',
      FrameSplitPen: '#1c2333',
      FrameSplitTextColor: '#8b949e',
      Title: {
        NameColor: '#8b949e',
        DateTimeColor: '#8b949e',
        SettingColor: '#8b949e',
        VolColor: '#8b949e',
        AmountColor: '#8b949e',
      },
    });

    const instance = chartApi.jsChartInit(el);
    instanceRef.current = instance;

    const option: HQChartOption = {
      Type: '历史K线图',
      Symbol: symbolRef.current,
      EnableResize: true,
      IsAutoUpdate: false,
      AutoUpdateFrequency: 2000,
      KLine: {
        Period: periodRef.current,
        Right: 0, // 不复权
        MaxRequestDataCount: 500,
        PageSizeV2: 120,
      },
      Windows: [null], // 仅主窗口，不加副图指标
      NetworkFilter: (obj, callback) => {
        const name = obj.Name;
        const rows = dataRef.current;
        if (name === 'KLineChartContainer::RequestHistoryData') {
          // 日线：回调完后再拦截，与库内"先 callback 后判断 PreventDefault"的契约一致
          callback({ symbol: symbolRef.current, data: toDayRows(rows) });
          obj.PreventDefault = true;
        } else if (
          name === 'KLineChartContainer::ReqeustHistoryMinuteData' ||
          name === 'KLineChartContainer::RequestHistoryMinuteData'
        ) {
          // 分钟线
          callback({ symbol: symbolRef.current, data: toMinuteRows(rows) });
          obj.PreventDefault = true;
        } else if (name === 'KLineChartContainer::RequestFlowCapitalData') {
          // 流通股本数据：我们的 Binance 源没有这个概念，直接标记已处理，
          // 阻止库内兜底向硬编码的 http://127.0.0.1:8080/API/StockHistoryDay
          // 发真实请求（那个地址必然 connection refused，会产生 console error）
          obj.PreventDefault = true;
        }
      },
      OnCreatedCallback(chart) {
        // 声明为"API 周期数据源"：阻止 Recv* 对 Binance 预聚合的 K 线
        // 做 GetPeriodData 二次聚合（尤其 5m+ 会走 GetMinuteCustomPeriodData）
        chart.IsApiPeriod = true;
        chartContainerRef.current = chart;
      },
    };

    instance.SetOption(option);

    return () => {
      // 先销毁容器再销毁实例
      try {
        chartContainerRef.current?.ChartDestroy();
      } catch {
        /* 忽略销毁期错误 */
      }
      try {
        instanceRef.current?.ChartDestroy();
      } catch {
        /* 忽略销毁期错误 */
      }
      chartContainerRef.current = null;
      instanceRef.current = null;

      // ChartDestroy 只清内部实例，不清理 DOM（canvas/tooltip/toolbar 都会残留）。
      // React StrictMode 在开发态会挂载→卸载→再挂载同一 effect，若不清掉上一次
      // 图表创建的节点，第二次初始化会叠出两个图表实例（第二个画到容器外 y=914
      // 的节点上，K 线不可见）。这里统一移除 el 下所有库生成的子节点。
      el.querySelectorAll('.jschart-drawing, .jschart-drawing-extra, .jschart-tooltip, .UMyChart_FrameToolbar_Div, .UMyChart_Toolbar_Tooltip_Div')
        .forEach((node) => node.remove());
    };
  }, []); // 只创建一次；NetworkFilter 通过 ref 读取最新 symbol/data

  // symbol 变化：让图表重新请求（NetworkFilter 会注入新数据）
  useEffect(() => {
    symbolRef.current = symbol;
    instanceRef.current?.ChangeSymbol(symbol);
  }, [symbol]);

  // 周期切换：IsApiPeriod 强制重新请求（否则分钟↔分钟切换会被短路跳过）
  useEffect(() => {
    if (!instanceRef.current) return;
    const periodId = toHQPeriod(period);
    periodRef.current = periodId;
    instanceRef.current.ChangePeriod(periodId, { IsApiPeriod: true });
  }, [period]);

  // 实时数据：data 变化时手动推送给图表
  useEffect(() => {
    if (data.length === 0) return;
    dataRef.current = data;
    const container = chartContainerRef.current;
    if (!container) return;
    if (live) {
      const rows = toManualRows(data, periodRef.current);
      // DataOffset 必须显式传入：ManualUpdateKData 里 lastDataCount == kData.length，
      // UpdateMainData 会算出 newDataCount=0 导致偏移不前进，这里直接跳到最新一页
      container.ManualUpdateKData({ Data: rows, DataOffset: Math.max(0, rows.length - 120) });
    }
  }, [data, live]);

  return <div ref={containerRef} className="chart-container" />;
}

/* ================== 数据格式转换 ================== */

// HQChart Period 常量（ChartData.Period）
const PERIOD_DAY = 0;
const PERIOD_MINUTE_1 = 4;
const PERIOD_MINUTE_5 = 5;
const PERIOD_MINUTE_15 = 6;
const PERIOD_MINUTE_60 = 8;
const PERIOD_MINUTE_240 = 12;

function toHQPeriod(period: string): number {
  switch (period) {
    case '1m': return PERIOD_MINUTE_1;
    case '5m': return PERIOD_MINUTE_5;
    case '15m': return PERIOD_MINUTE_15;
    case '1h': return PERIOD_MINUTE_60;
    case '4h': return PERIOD_MINUTE_240;
    case '1d': return PERIOD_DAY;
    default: return PERIOD_MINUTE_1;
  }
}

function isMinutePeriod(periodId: number): boolean {
  return (
    periodId === PERIOD_MINUTE_1 ||
    periodId === PERIOD_MINUTE_5 ||
    periodId === PERIOD_MINUTE_15 ||
    periodId === PERIOD_MINUTE_60 ||
    periodId === PERIOD_MINUTE_240
  );
}

/** Binance UTC 毫秒时间戳 → YYYYMMDD */
function toDateInt(ms: number): number {
  const d = new Date(ms);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

/** Binance UTC 毫秒时间戳 → HHMMSS */
function toTimeInt(ms: number): number {
  const d = new Date(ms);
  return d.getUTCHours() * 10000 + d.getUTCMinutes() * 100 + d.getUTCSeconds();
}

/**
 * 转成 HQChart 日线 JSON 行：[日期, 昨收, 开, 高, 低, 收, 量, 额]
 */
function toDayRows(data: OHLCV[]): unknown[][] {
  const rows: unknown[][] = [];
  let prevClose = 0;
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const yclose = prevClose > 0 ? prevClose : d.open;
    rows.push([toDateInt(d.time), yclose, d.open, d.high, d.low, d.close, d.volume, d.volume * d.close]);
    prevClose = d.close;
  }
  return rows;
}

/**
 * 转成 HQChart 分钟线 JSON 行：[日期, 昨收, 开, 高, 低, 收, 量, 额, 时间]
 */
function toMinuteRows(data: OHLCV[]): unknown[][] {
  const rows: unknown[][] = [];
  let prevClose = 0;
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const yclose = prevClose > 0 ? prevClose : d.open;
    rows.push([
      toDateInt(d.time),
      yclose,
      d.open,
      d.high,
      d.low,
      d.close,
      d.volume,
      d.volume * d.close,
      toTimeInt(d.time),
    ]);
    prevClose = d.close;
  }
  return rows;
}

/**
 * 转成 ManualUpdateKData 需要的 HistoryData 对象数组。
 *
 * 注意：ManualUpdateKData 内部直接 new ChartData() 并把 Data 塞进 BindMainData，
 * 不会走 JsonDataToHistoryData —— 渲染路径（ChartKLine.DrawAKLine）是按
 * data.Open/.High/.Low/.Close 等属性读取的，所以这里必须返回 HistoryData 形状的
 * 对象，而不是网络路径用的数字数组行。
 * 字段：Date, YClose, Open, Close, High, Low, Vol, Amount, Time(分钟线)
 */
interface HQHistoryData {
  Date: number;
  YClose: number;
  Open: number;
  Close: number;
  High: number;
  Low: number;
  Vol: number;
  Amount: number;
  Time?: number;
}

function toManualRows(data: OHLCV[], periodId: number): HQHistoryData[] {
  const rows: HQHistoryData[] = [];
  let prevClose = 0;
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const yclose = prevClose > 0 ? prevClose : d.open;
    const row: HQHistoryData = {
      Date: toDateInt(d.time),
      YClose: yclose,
      Open: d.open,
      Close: d.close,
      High: d.high,
      Low: d.low,
      Vol: d.volume,
      Amount: d.volume * d.close,
    };
    if (isMinutePeriod(periodId)) {
      row.Time = toTimeInt(d.time);
    }
    rows.push(row);
    prevClose = d.close;
  }
  return rows;
}
