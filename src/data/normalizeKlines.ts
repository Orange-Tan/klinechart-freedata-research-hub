import type { OHLCV } from '../types/ohlcv';

/**
 * 数据源适配器收尾统一处理：按时间升序排序 + 截取最近 limit 根。
 *
 * 各上游返回顺序不一（腾讯/东财/Yahoo 时间倒序、Twelve Data 新→旧倒序），
 * 五个 K 线适配器此前各自手写 `bars.sort(...); return bars.slice(-limit);`，
 * 这里收敛成一处。项目统一协议 OHLCV 按时间升序（见 types/ohlcv.ts）。
 */
export function normalizeKlines(bars: OHLCV[], limit: number): OHLCV[] {
  bars.sort((a, b) => a.time - b.time);
  return bars.slice(-limit);
}
