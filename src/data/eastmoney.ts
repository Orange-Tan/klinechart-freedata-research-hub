import type { OHLCV, KlineDataSource, KlinePeriod } from '../types/ohlcv';
import { searchAStock } from './aShareSearch';

const EASTMONEY_PERIODS: readonly KlinePeriod[] = ['1m', '5m', '15m', '1h', '1d'];

/**
 * 东方财富 A 股行情数据源。
 *
 * K 线：`push2his.eastmoney.com/api/qt/stock/kline/get`
 *   secid = QuoteID（sh→1.、sz→0.），fqt=1（前复权），klt：101 日 / 1 分 / 5 分 / 15 分 / 30 分 / 60 分
 *   东财无 4h 周期（分钟只到 60），4h 用 60 分钟近似。
 *   fields2=f51,f52,f53,f54,f55,f56,f57,f58 → klines 每行 "日期,开,收,高,低,量,额,…"
 *
 * 实时：`push2.eastmoney.com/api/qt/stock/get`（secid + fields=f43,f44,f45,f46,f47,f48,f60,…）
 *
 * ⚠️ 实测限制（2026-09）：push2his/push2 在当前网络被 TLS 层阻断
 * （SNI 篡改 / bad decrypt），fetch 返回空。实现保留完整功能，UI 通过
 * error-panel 优雅报错；若换网络/加代理后可直连即可用。
 *
 * 时区：与腾讯源一致，fake-UTC 解析（详见 tencent.ts 顶部注释）。
 */

const KLT: Record<KlinePeriod, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '1h': '60',
  '4h': '60', // 东财无 240 分钟，用 60 近似
  '1d': '101',
};

/** sh600519 → 1.600519；sz000001 → 0.000001 */
function toSecid(symbol: string): string {
  const m = /^([shz]{2})(\d{6})$/.exec(symbol);
  if (!m) throw new Error(`东财不支持该代码：${symbol}`);
  return `${m[1] === 'sz' ? '0' : '1'}.${m[2]}`;
}

export class EastMoneyDataSource implements KlineDataSource {
  readonly id = 'eastmoney';
  readonly label = '东方财富';

  /** 东财无 240 分钟周期（分钟只到 60），4h 用 60 分钟近似 → 不作为原生支持周期 */
  readonly supportedPeriods: readonly KlinePeriod[] = EASTMONEY_PERIODS;

  async fetchKlines(symbol: string, period: KlinePeriod, limit = 300): Promise<OHLCV[]> {
    const secid = toSecid(symbol);
    const params = new URLSearchParams({
      secid,
      klt: KLT[period],
      fqt: '1',
      end: '20500101',
      lmt: String(limit),
      fields1: 'f1,f2,f3,f4,f5,f6',
      fields2: 'f51,f52,f53,f54,f55,f56,f57,f58',
    });
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?${params}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`东财 API ${res.status}: ${await res.text()}`);
    }
    const data: unknown = await res.json();
    const node = (data as { data?: { klines?: unknown } })?.data;
    const klines = node?.klines;
    if (!Array.isArray(klines)) {
      throw new Error('东财返回格式异常');
    }
    const bars = klines.map((line: unknown) => {
      const [date, open, close, high, low, volume] = (line as string).split(',');
      return {
        time: parseEastTime(date),
        open: Number(open),
        close: Number(close),
        high: Number(high),
        low: Number(low),
        volume: Number(volume),
      };
    });
    bars.sort((a, b) => a.time - b.time);
    return bars.slice(-limit);
  }

  /**
   * 订阅实时 K 线。东财实时接口在当前网络同样被 TLS 阻断，
   * 因此轮询退化为拉最新 1 根历史——能连时正常，连不上时静默忽略。
   */
  subscribe(symbol: string, period: KlinePeriod, onUpdate: (bar: OHLCV) => void): () => void {
    const INTERVAL_MS = 2_000;
    let closed = false;
    let generation = 0;
    let lastBarTime = 0;

    const tick = async () => {
      const gen = generation;
      if (closed) return;
      try {
        const bars = await this.fetchKlines(symbol, period, 1);
        if (gen !== generation || closed) return;
        const latest = bars[bars.length - 1];
        if (latest && latest.time !== lastBarTime) {
          lastBarTime = latest.time;
          onUpdate(latest);
        }
      } catch {
        // 轮询失败静默忽略（当前网络东财大概率连不上，避免刷屏报错）
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), INTERVAL_MS);

    return () => {
      closed = true;
      generation += 1;
      window.clearInterval(timer);
    };
  }

  searchSymbols(keyword: string) {
    return searchAStock(keyword);
  }
}

/** "2026-09-08 10:30" → fake-UTC 毫秒时间戳 */
function parseEastTime(s: string): number {
  const digits = s.replace(/\D/g, '');
  if (digits.length === 8) {
    return Date.UTC(Number(digits.slice(0, 4)), Number(digits.slice(4, 6)) - 1, Number(digits.slice(6, 8)));
  }
  // 分钟线 "202609081030"
  return Date.UTC(
    Number(digits.slice(0, 4)),
    Number(digits.slice(4, 6)) - 1,
    Number(digits.slice(6, 8)),
    Number(digits.slice(8, 10)),
    Number(digits.slice(10, 12)),
  );
}
