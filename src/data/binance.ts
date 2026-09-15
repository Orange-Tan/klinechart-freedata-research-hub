import type { OHLCV, KlineDataSource, KlinePeriod } from '../types/ohlcv';
import { PERIOD_ALL } from '../types/ohlcv';
import { pollSubscribe } from './pollSubscribe';

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
 *
 * 注意：api.binance.com 在中国大陆直连不通（连接超时），改用同构公共数据端点
 * data-api.binance.vision（S3 加速域名，无需 key，返回结构与 api.binance.com
 * 完全一致；官方文档在 MARKET_DATA_BASE_URL 说明中有这个端点）。
 */
export class BinanceDataSource implements KlineDataSource {
  readonly id = 'binance';
  readonly label = 'Binance 公开行情';

  /** Binance 对全部 6 个周期都有原生支持（1m/5m/15m/1h/4h/1d） */
  readonly supportedPeriods: readonly KlinePeriod[] = PERIOD_ALL;

  private readonly baseUrl = 'https://data-api.binance.vision';

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
    return pollSubscribe(() => this.fetchKlines(symbol, period, 2), onUpdate);
  }
}
