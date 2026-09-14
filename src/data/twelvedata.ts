import type { OHLCV, KlineDataSource, KlinePeriod } from '../types/ohlcv';
import { PERIOD_ALL } from '../types/ohlcv';

/** Twelve Data 周期 → API interval 参数（全 6 周期原生支持） */
const INTERVAL: Record<KlinePeriod, string> = {
  '1m': '1min',
  '5m': '5min',
  '15m': '15min',
  '1h': '1h',
  '4h': '4h',
  '1d': '1day',
};

/**
 * 免费层 API key：demo（无需注册）或 VITE_TWELVEDATA_KEY（.env 注入，不提交 git）。
 * 免费层限 8 credits/分、800 credits/天；demo key 同样按 8 credits/分限频，
 * 请求过快会返回 429 status:'error'，轮询间隔与并发需留意。
 */
function apiKey(): string {
  const fromEnv = import.meta.env.VITE_TWELVEDATA_KEY as string | undefined;
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : 'demo';
}

/**
 * Twelve Data 行情数据源（美股 / 指数 / ETF / 加密货币 / 期货等，全市场覆盖）。
 *
 * REST: GET https://api.twelvedata.com/time_series
 *   ?symbol=AAPL&interval=1day&outputsize=300&apikey=demo
 * 返回 `{ status:'ok', values:[{datetime,open,high,low,close,volume}, ...] }`。
 *   values 按时间**新 → 旧**倒序排列（与 Yahoo 的正序相反），需反转后再 slice。
 *   datetime 格式：日线 `"2026-09-11"`、分钟/小时线 `"2026-09-11 15:59:00"`（交易所本地时区）。
 *
 * ✅ 实测（2026-09）：接口带 `Access-Control-Allow-Origin: *`，浏览器可直连，
 * dev / prod 同 URL，无需 Vite 代理。
 * ⚠️ 免费层 ToS：数据仅限个人 / 内部非展示用途（本项目用于技术评测展示，符合条件）；
 * outputsize 上限 5000；分钟线历史深度 ~5 天、日线数十年。
 */
export class TwelveDataDataSource implements KlineDataSource {
  readonly id = 'twelvedata';
  readonly label = 'Twelve Data';

  /** 6 个周期原生都支持（1min/5min/15min/1h/4h/1day） */
  readonly supportedPeriods: readonly KlinePeriod[] = PERIOD_ALL;

  private readonly baseUrl = 'https://api.twelvedata.com';

  async fetchKlines(symbol: string, period: KlinePeriod, limit = 300): Promise<OHLCV[]> {
    const params = new URLSearchParams({
      symbol,
      interval: INTERVAL[period],
      outputsize: String(limit),
      apikey: apiKey(),
    });
    const url = `${this.baseUrl}/time_series?${params}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Twelve Data API ${res.status}: ${await res.text()}`);
    }
    const data: unknown = await res.json();
    const status = (data as { status?: unknown })?.status;
    const values = (data as { values?: unknown })?.values;
    if (status !== 'ok' || !Array.isArray(values)) {
      // status:'error' 时 message 为具体原因（如 429 限频 / 超出免费额度 / 无效符号）
      const message = (data as { message?: unknown })?.message;
      throw new Error(`Twelve Data 返回异常: ${String(message ?? '')}`);
    }
    const bars: OHLCV[] = [];
    for (const row of values as {
      datetime?: unknown;
      open?: unknown;
      high?: unknown;
      low?: unknown;
      close?: unknown;
      volume?: unknown;
    }[]) {
      const { datetime, open, high, low, close } = row;
      if (
        typeof datetime !== 'string' ||
        open == null ||
        high == null ||
        low == null ||
        close == null
      ) {
        continue;
      }
      bars.push({
        // datetime 无时区后缀：按交易所本地时区解析，与图表库本地时间轴一致即可
        time: toMillis(datetime),
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: row.volume == null ? 0 : Number(row.volume),
      });
    }
    // values 新 → 旧倒序，转成正序（与全项目其他源一致）后再截取
    bars.sort((a, b) => a.time - b.time);
    return bars.slice(-limit);
  }

  /**
   * 订阅实时 K 线。Twelve Data 免费层无推送通道，2s 轮询最新一根 K 线模拟"实时"。
   * 免费 key 限 8 credits/分，轮询与历史请求叠加可能触发 429；失败静默忽略下一轮重试。
   */
  subscribe(symbol: string, period: KlinePeriod, onUpdate: (bar: OHLCV) => void): () => void {
    const INTERVAL_MS = 2_000;
    let closed = false;
    // 飞行中的 fetch 无法中止，用 token 丢弃过期响应，避免旧请求串到新状态
    let generation = 0;
    let lastBarTime = 0;

    const tick = async () => {
      const gen = generation;
      if (closed) return;
      try {
        const bars = await this.fetchKlines(symbol, period, 2);
        // 取到的快照已过期（symbol/period 已变）：丢弃，避免把旧数据交给订阅方
        if (gen !== generation || closed) return;
        const latest = bars[bars.length - 1];
        if (latest && latest.time !== lastBarTime) {
          lastBarTime = latest.time;
          onUpdate(latest);
        }
      } catch {
        // 轮询失败静默忽略（429 限频/网络波动时避免刷屏报错）
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), INTERVAL_MS);

    return () => {
      closed = true;
      generation += 1; // 使所有飞行中的响应过期
      window.clearInterval(timer);
    };
  }
}

/**
 * Twelve Data datetime 字符串 → Unix 毫秒时间戳。
 * 日线 `"2026-09-11"` 与分钟/小时线 `"2026-09-11 15:59:00"` 都是交易所本地时区、
 * 无时区后缀。直接 new Date(str) 会把无时区串当成本地时间解析（不同浏览器对
 * 空格分隔串行为一致吗？见下），这里显式按本地时间拆分解析，行为确定。
 */
function toMillis(datetime: string): number {
  // 日线只到日期，解析后落在当日 00:00（本地时区），与各库日线 bar 的约定一致
  if (datetime.length === 10) {
    const [y, m, d] = datetime.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  }
  const [datePart, timePart] = datetime.split(' ');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm, ss] = timePart.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, ss).getTime();
}
