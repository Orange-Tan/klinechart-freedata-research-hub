import type { OHLCV, KlineDataSource, KlinePeriod } from '../types/ohlcv';
import { searchAStock } from './aShareSearch';
import { fetchKlinesWithTimeout } from './fetchWithTimeout';
import { normalizeKlines } from './normalizeKlines';
import { pollSubscribe } from './pollSubscribe';
import { proxyUrlFor } from './connectivity';

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
 * ⚠️ 实测限制（2026-09）：push2his 在当前网络被 DNS 解析到 trafficmanager.cn
 * 的「坏 IP 池」，这些源站对 kline 请求直接 reset（Empty reply），浏览器原生 fetch
 * 拿不到数据。dev 环境通过 Vite dev server 的 /push2his 代理直连「好池」IP
 * （120.79.191.232 / 119.3.232.150 / 120.76.218.228，显式 SNI + Host = push2his）
 * 绕开坏池取数（详见 vite.config.ts）；生产构建无代理，会如实失败。
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
    // dev 环境：DNS 坏池问题由 Vite dev server 的 /push2his 代理绕开（见 vite.config.ts），
    // 直接走同源相对路径；生产构建保持源站直连（会如实失败，见文件顶部注释）。
    const target = proxyUrlFor(url);
    const res = await fetchKlinesWithTimeout(target);
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
    // 上游按时间倒序返回，统一升序 + 截取最近 limit 根
    return normalizeKlines(bars, limit);
  }

  /**
   * 订阅实时 K 线。东财实时接口在当前网络同样受 DNS 坏池影响（fetch 失败），
   * 因此轮询退化为拉最新 1 根历史——dev 下经 /push2his 代理可取数，失败时静默忽略。
   */
  subscribe(symbol: string, period: KlinePeriod, onUpdate: (bar: OHLCV) => void): () => void {
    return pollSubscribe(() => this.fetchKlines(symbol, period, 1), onUpdate);
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
