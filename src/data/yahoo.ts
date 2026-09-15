import type { OHLCV, KlineDataSource, KlinePeriod } from '../types/ohlcv';
import { PERIOD_ALL } from '../types/ohlcv';
import { fetchKlinesWithTimeout } from './fetchWithTimeout';
import { pollSubscribe } from './pollSubscribe';
import { proxyUrlFor } from './connectivity';

/**
 * Yahoo Finance chart 数据源（美股 / 指数 / ETF / 海外期货等）。
 *
 * 逆向接口（官方已停发 key）：`query1.finance.yahoo.com/v8/finance/chart/{symbol}`
 * 当前可免 crumb/cookie 直接访问，返回 `chart.result[0]`：
 *   timestamp[]  —— 秒级 Unix 时间戳（须 ×1000 转毫秒）
 *   indicators.quote[0].{open,high,low,close,volume}[] —— 与 timestamp 对齐，含 null 需过滤
 *
 * 符号约定：美股 AAPL / MSFT；指数 ^GSPC / ^SSEC；A 股用交易所后缀（600519.SS / 000001.SZ）。
 * 周期：1m 仅约 7 天深度、1h 约 730 天、1d 40+ 年；日线最稳。
 *
 * ⚠️ 实测限制（2026-09）：该 API 无 CORS 头，浏览器直连被拦，必须经代理。
 * dev 环境通过 Vite dev server 的 /yh 代理转发（见 vite.config.ts，走 query1）；
 * 生产构建无代理，会如实失败（connectivity.ts 的 proxyUrlFor 同样按此规则
 * 把 checkUrl 换成 /yh 路径）。另：Yahoo 对连续请求有反爬限流（Edge: Too Many
 * Requests，429），历史请求与轮询订阅间隔需留意。
 *
 * 注意：该 API 没有服务端 limit 参数，返回多少行由 period1/period2 决定——
 * 因此拉取窗口按「limit 根 × 每周期密度」缩放（见 windowMs）：历史请求取
 * limit 根刚好够的窗口，轮询订阅（limit=2）窗口缩到几小时/几天，避免每次
 * 2s 轮询都传输并解析 30 天完整历史（1m 约 3 万行、~1MB JSON，30 次/分钟）。
 */
export class YahooDataSource implements KlineDataSource {
  readonly id = 'yahoo';
  readonly label = 'Yahoo Finance';

  /** 6 个周期原生都支持（1m/5m/15m/1h/4h/1d） */
  readonly supportedPeriods: readonly KlinePeriod[] = PERIOD_ALL;

  private readonly baseUrl = 'https://query1.finance.yahoo.com';

  /**
   * 每个周期每"自然日"约有的 K 线根数（保守取低，宁可窗口偏大多传几根，
   * 不能偏小导致 slice(-limit) 取不满）。日线按每周 5 个交易日折算；
   * 分钟/小时线按美股常规交易时段 6.5h 估算（密度取低 → 窗口放宽）。
   */
  private readonly barsPerCalendarDay: Record<KlinePeriod, number> = {
    '1m': 390, //   6.5h × 60
    '5m': 78, //    6.5h × 12
    '15m': 26, //   6.5h × 4
    '1h': 6.5, //   6.5h
    '4h': 2, //     保守：Yahoo 4h 桶对齐未知，取低密度放宽窗口
    '1d': 5 / 7, // 交易日密度
  };

  /** 覆盖 limit 根 K 线所需的时间窗（毫秒）：根数 / 日密度 × 1.5 余量 */
  private windowMs(period: KlinePeriod, limit: number): number {
    const density = this.barsPerCalendarDay[period];
    return (limit / density) * 86_400_000 * 1.5;
  }

  async fetchKlines(symbol: string, period: KlinePeriod, limit = 300): Promise<OHLCV[]> {
    // 服务端无 limit 参数，用 period1/period2 时间窗控制返回行数：历史请求按
    // limit 缩放窗口，轮询订阅（limit 小）窗口随之收窄，只传最新几根。
    const params = new URLSearchParams({
      interval: period, // 与 API 参数一一对应，无需映射表
      period1: String(Math.floor((Date.now() - this.windowMs(period, limit)) / 1000)),
      period2: String(Math.floor(Date.now() / 1000)),
    });
    const url = `${this.baseUrl}/v8/finance/chart/${encodeURIComponent(symbol)}?${params}`;
    // dev 环境：无 CORS 头由 Vite dev server 的 /yh 代理绕开（见 vite.config.ts），
    // 走同源相对路径；生产构建保持源站直连（会如实失败，见文件顶部注释）。
    const target = proxyUrlFor(url);
    const res = await fetchKlinesWithTimeout(target);
    if (!res.ok) {
      throw new Error(`Yahoo Finance API ${res.status}: ${await res.text()}`);
    }
    const data: unknown = await res.json();
    const node = (data as { chart?: { result?: unknown[] } })?.chart?.result?.[0];
    const q = (node as { indicators?: { quote?: unknown[] } } | undefined)?.indicators?.quote?.[0];
    const timestamps = (node as { timestamp?: unknown } | undefined)?.timestamp;
    if (!q || !Array.isArray(timestamps)) {
      throw new Error('Yahoo 返回格式异常');
    }
    const quote = q as { open?: unknown; high?: unknown; low?: unknown; close?: unknown; volume?: unknown };
    // q 为 chart.result[0].indicators.quote[0]，字段与 timestamp 对齐（含 null 需过滤）
    const o = quote.open as unknown[] | undefined;
    const h = quote.high as unknown[] | undefined;
    const l = quote.low as unknown[] | undefined;
    const c = quote.close as unknown[] | undefined;
    const v = quote.volume as unknown[] | undefined;
    if (!o || !h || !l || !c || !v) throw new Error('Yahoo 返回格式异常');
    const bars: OHLCV[] = [];
    for (let i = 0; i < timestamps.length; i += 1) {
      const open = o[i];
      const high = h[i];
      const low = l[i];
      const close = c[i];
      // 停牌/数据缺失段各字段可能为 null，跳过（与交易所的 gap 处理一致）
      if (open == null || high == null || low == null || close == null) continue;
      const volume = v[i] == null ? 0 : Number(v[i]);
      bars.push({
        time: Number(timestamps[i]) * 1000, // 秒 → 毫秒
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume,
      });
    }
    bars.sort((a, b) => a.time - b.time);
    return bars.slice(-limit);
  }

  /**
   * 订阅实时 K 线。Yahoo 无推送通道，2s 轮询最新一根 K 线模拟"实时"。
   * 轮询走 fetchKlines(limit=2)，窗口按 2 根缩放后只传最新几根。
   * 注意 Yahoo 有 429 反爬限流，轮询与历史请求叠加可能触发；失败时静默忽略。
   */
  subscribe(symbol: string, period: KlinePeriod, onUpdate: (bar: OHLCV) => void): () => void {
    return pollSubscribe(() => this.fetchKlines(symbol, period, 2), onUpdate);
  }
}
