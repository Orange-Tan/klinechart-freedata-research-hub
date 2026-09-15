import type { OHLCV, KlineDataSource, KlinePeriod } from '../types/ohlcv';
import { searchAStock } from './aShareSearch';
import { pollSubscribe } from './pollSubscribe';

/** 腾讯原生支持的周期（1m/5m/15m/1h 走 mkline，1d 走 fqkline；4h 无原生接口） */
const TENCENT_PERIODS: readonly KlinePeriod[] = ['1m', '5m', '15m', '1h', '1d'];

/**
 * 腾讯财经 A 股行情数据源（默认数据源）。
 *
 * 三个接口各司其职：
 *  - 日线/周/月/季 K：`web.ifzq.gtimg.cn/appstock/app/fqkline/get`
 *      param={sym},day,,,{count},qfq  → data[sym].day（指数）或 .qfqday（股票，前复权）
 *  - 分钟 K：`ifzq.gtimg.cn/appstock/app/kline/mkline`（注意是 ifzq 不是 web.ifzq，
 *     后者对分钟接口 301 跳走）
 *      param={sym},m{1|5|15|60|240},,{count}  → data[sym].m{...}，行
 *      [YYYYMMDDHHMM, open, close, high, low, volume, {}, amount]
 *      ⚠️ 实测（2026-09）：m240（4h）返回 {"code":-1,"msg":"param error"}，
 *      腾讯原生不提供 4 小时分钟线 → 不从 supportedPeriods 暴露 4h。
 *  - 实时：`qt.gtimg.cn/q={sym}`，GBK 编码（浏览器按 charset 自动解），
 *      v_{sym}="1~名称~代码~现价~昨收~今开~..."
 *
 * 时区方案：腾讯返回的是 Asia/Shanghai 壁钟时间字符串（日线 "YYYY-MM-DD"、
 * 分钟 "YYYYMMDDHHMM"）。本项目统一用 fake-UTC 解析——把壁钟时间直接当
 * UTC 构造时间戳（"2026-09-08" → 2026-09-08T00:00:00Z）。所有图表适配器
 * 都基于 getUTC* 渲染，这样任何浏览器时区下都显示正确的壁钟时间，
 * 全项目 4 个库无需各自改时区逻辑（lightweight 需另加 UTC localization，
 * 见该组件注释）。
 *
 * 周期映射：1m→m1、5m→m5、15m→m15、1h→m60、4h→m240、1d→day。
 */

const PERIOD_MAP: Record<KlinePeriod, { type: 'day' | 'min'; param: string }> = {
  '1m': { type: 'min', param: 'm1' },
  '5m': { type: 'min', param: 'm5' },
  '15m': { type: 'min', param: 'm15' },
  '1h': { type: 'min', param: 'm60' },
  '4h': { type: 'min', param: 'm240' },
  '1d': { type: 'day', param: 'day' },
};

/** 支持指数/股票/基金/期货/港股；本项目限定 A 股符号 sh/sz 开头 */
function isAShareSymbol(symbol: string): boolean {
  return /^[shz]{2}\d{6}$/.test(symbol);
}

export class TencentDataSource implements KlineDataSource {
  readonly id = 'tencent';
  readonly label = '腾讯财经';

  /** 腾讯原生支持 1m/5m/15m/1h/1d（4h=m240 实测 param error，不暴露） */
  readonly supportedPeriods: readonly KlinePeriod[] = TENCENT_PERIODS;

  async fetchKlines(symbol: string, period: KlinePeriod, limit = 300): Promise<OHLCV[]> {
    if (!isAShareSymbol(symbol)) {
      throw new Error(`腾讯财经仅支持 A 股代码（如 sh600519 / sz000001 / sh000001），收到：${symbol}`);
    }
    const m = PERIOD_MAP[period];
    let url: string;
    if (m.type === 'day') {
      url =
        `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=` +
        `${symbol},day,,,${limit},qfq`;
    } else {
      url =
        `https://ifzq.gtimg.cn/appstock/app/kline/mkline?param=` +
        `${symbol},${m.param},,${limit}`;
    }
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`腾讯财经 ${res.status}: ${await res.text()}`);
    }
    const data: unknown = await res.json();
    const node = (data as { data?: Record<string, unknown> })?.data?.[symbol];
    if (!node || typeof node !== 'object') {
      throw new Error('腾讯财经返回格式异常');
    }
    // 日线：指数返回 day 键，股票（qfq）返回 qfqday 键
    const rows: unknown = m.type === 'day'
      ? (node as { day?: unknown }).day ?? (node as { qfqday?: unknown }).qfqday
      : (node as Record<string, unknown>)[m.param];
    if (!Array.isArray(rows)) {
      throw new Error(`腾讯财经未返回 ${period} 数据`);
    }
    const bars = rows.map((row) => {
      const r = row as [string, string, string, string, string, string];
      // 行：[时间, 开, 收, 高, 低, 量(, {…}, 额)]
      return {
        time: parseTencentTime(r[0]),
        open: Number(r[1]),
        close: Number(r[2]),
        high: Number(r[3]),
        low: Number(r[4]),
        volume: Number(r[5]),
      };
    });
    // 时间倒序返回（越新越靠前），统一升序
    bars.sort((a, b) => a.time - b.time);
    return bars.slice(-limit);
  }

  /**
   * 订阅实时 K 线。A 股日线收盘后不再变化，盘中用轮询最新一根 K 线
   * 模拟实时刷新，与 Binance 数据源一致。
   */
  subscribe(symbol: string, period: KlinePeriod, onUpdate: (bar: OHLCV) => void): () => void {
    return pollSubscribe(() => this.fetchKlines(symbol, period, 2), onUpdate);
  }

  searchSymbols(keyword: string) {
    return searchAStock(keyword);
  }
}

/** "2026-09-08" / "202609081415" → fake-UTC 毫秒时间戳 */
function parseTencentTime(s: string): number {
  const digits = s.replace(/\D/g, '');
  if (digits.length === 8) {
    // 日线 "20260908"（去掉连字符后）
    return Date.UTC(Number(digits.slice(0, 4)), Number(digits.slice(4, 6)) - 1, Number(digits.slice(6, 8)));
  }
  // 分钟 "202609081415"
  return Date.UTC(
    Number(digits.slice(0, 4)),
    Number(digits.slice(4, 6)) - 1,
    Number(digits.slice(6, 8)),
    Number(digits.slice(8, 10)),
    Number(digits.slice(10, 12)),
  );
}
