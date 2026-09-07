import type { OHLCV, KlineDataSource, KlinePeriod } from '../types/ohlcv';

/** Binance K 线周期 → API interval 参数 */
const INTERVAL: Record<KlinePeriod, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
};

/**
 * Binance 公开 K 线数据源（无需 API key）。
 *
 * REST: GET /api/v3/klines
 * 返回数组：[
 *   [openTime, open, high, low, close, volume, closeTime, ...]
 * ]
 */
export class BinanceDataSource implements KlineDataSource {
  readonly id = 'binance';
  readonly label = 'Binance 公开行情';

  private readonly baseUrl = 'https://api.binance.com';

  async fetchKlines(symbol: string, period: KlinePeriod, limit = 500): Promise<OHLCV[]> {
    const params = new URLSearchParams({
      symbol: symbol.toUpperCase(),
      interval: INTERVAL[period],
      limit: String(limit),
    });
    const url = `${this.baseUrl}/api/v3/klines?${params}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Binance API ${res.status}: ${await res.text()}`);
    }
    const rows: unknown = await res.json();
    if (!Array.isArray(rows)) {
      throw new Error('Binance API 返回格式异常');
    }
    return rows.map((row) => {
      const r = row as [number, string, string, string, string, string];
      return {
        time: Number(r[0]),
        open: Number(r[1]),
        high: Number(r[2]),
        low: Number(r[3]),
        close: Number(r[4]),
        volume: Number(r[5]),
      };
    });
  }

  /**
   * 订阅实时 K 线。Binance 的 1m K 线每 ~2s 推送一次，
   * 通过轮询最新一根 K 线的 close/volume 模拟"实时"效果。
   */
  subscribe(symbol: string, period: KlinePeriod, onUpdate: (bar: OHLCV) => void): () => void {
    const INTERVAL_MS = 2_000;
    let closed = false;
    let lastBarTime = 0;

    const tick = async () => {
      if (closed) return;
      try {
        const bars = await this.fetchKlines(symbol, period, 2);
        const latest = bars[bars.length - 1];
        if (latest && latest.time !== lastBarTime) {
          lastBarTime = latest.time;
          onUpdate(latest);
        }
      } catch {
        // 轮询失败静默忽略，下一轮重试
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), INTERVAL_MS);

    return () => {
      closed = true;
      window.clearInterval(timer);
    };
  }
}
