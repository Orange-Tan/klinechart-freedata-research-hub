import type { OHLCV, KlineDataSource, KlinePeriod } from '../types/ohlcv';
import { PERIOD_ALL } from '../types/ohlcv';

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
 * 生产构建无代理，会如实失败（connectivity.ts 的 resolveCheckUrl 同样按此规则
 * 把 checkUrl 换成 /yh 路径）。另：Yahoo 对连续请求有反爬限流（Edge: Too Many
 * Requests，429），历史请求与轮询订阅间隔需留意。
 *
 * 注意：该 API 没有服务端 limit 参数，返回多少行由 period1/period2 决定——
 * 因此轮询订阅（只取最新 1-2 根）按周期收窄时间窗，避免每次 2s 轮询
 * 都传输并解析 30 天完整历史（1m 约 3 万行、~1MB JSON，30 次/分钟）。
 */
export class YahooDataSource implements KlineDataSource {
  readonly id = 'yahoo';
  readonly label = 'Yahoo Finance';

  /** 6 个周期原生都支持（1m/5m/15m/1h/4h/1d） */
  readonly supportedPeriods: readonly KlinePeriod[] = PERIOD_ALL;

  private readonly baseUrl = 'https://query1.finance.yahoo.com';

  /** 周期 → 拉取的时间窗（毫秒）：覆盖 limit 根 + 余量即可，轮询用窄窗防传输浪费 */
  private readonly rangeByPeriod: Record<KlinePeriod, number> = {
    '1m': 48 * 3600_000, //  2 天（1m 行数多，最窄）
    '5m': 7 * 24 * 3600_000,
    '15m': 21 * 24 * 3600_000,
    '1h': 120 * 24 * 3600_000, // ~4 个月
    '4h': 240 * 24 * 3600_000,
    '1d': 0, // 不用此路径：日线走 range=max（下方特判）
  };

  async fetchKlines(symbol: string, period: KlinePeriod, limit = 300): Promise<OHLCV[]> {
    const rangeMs = this.rangeByPeriod[period];
    const params = new URLSearchParams({
      interval: period, // 与 API 参数一一对应，无需映射表
      // 1d 走 range=max 拿全历史；分钟/小时线按 rangeByPeriod 收窄时间窗
      // （服务端无 limit 参数，窗口越窄传输越省；limit 只决定最终截取根数）
      ...(period === '1d'
        ? { range: 'max' }
        : {
            period1: String(Math.floor((Date.now() - rangeMs) / 1000)),
            period2: String(Math.floor(Date.now() / 1000)),
          }),
    });
    const url = `${this.baseUrl}/v8/finance/chart/${encodeURIComponent(symbol)}?${params}`;
    // dev 环境：无 CORS 头由 Vite dev server 的 /yh 代理绕开（见 vite.config.ts），
    // 走同源相对路径；生产构建保持源站直连（会如实失败，见文件顶部注释）。
    const target = import.meta.env.DEV ? `/yh/v8/finance/chart/${encodeURIComponent(symbol)}?${params}` : url;
    const res = await fetch(target);
    if (!res.ok) {
      throw new Error(`Yahoo Finance API ${res.status}: ${await res.text()}`);
    }
    const data: unknown = await res.json();
    const result = (data as { chart?: { result?: unknown } })?.chart?.result;
    const node = Array.isArray(result) ? result[0] : undefined;
    const quote = (node as { indicators?: { quote?: unknown } } | undefined)?.indicators?.quote;
    const q = Array.isArray(quote) ? quote[0] : undefined;
    const timestamps = (node as { timestamp?: unknown } | undefined)?.timestamp;
    if (!q || !Array.isArray(timestamps)) {
      throw new Error('Yahoo 返回格式异常');
    }
    // q 为 chart.result[0].indicators.quote[0]，字段与 timestamp 对齐（含 null 需过滤）
    const o = q.open as unknown[];
    const h = q.high as unknown[];
    const l = q.low as unknown[];
    const c = q.close as unknown[];
    const v = q.volume as unknown[];
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
   * 注意 Yahoo 有 429 反爬限流，轮询与历史请求叠加可能触发；失败时静默忽略。
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
        // 轮询失败静默忽略（429 限流/网络波动时避免刷屏报错）
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
