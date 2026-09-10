import type { KlinePeriod } from '../types/ohlcv';
import { PERIOD_ALL } from '../types/ohlcv';
import { getDataSource, type DataSourceId } from '../data';
import { SOURCE_DEFAULTS } from './controlsShared';

/**
 * 两个单库详页（LightweightShowcase / KlinechartsShowcase）共用的数据源配置。
 * 详页与看板一样支持多数据源切换：数据源下拉列出注册表全部源，标的下拉
 * 与看板一致（复用 controlsShared 的 SOURCE_DEFAULTS：含默认标的与可选项），
 * 周期下拉按该源支持的周期动态过滤。
 *
 * 注意：东方财富在当前网络被 TLS 阻断（见 eastmoney.ts 注释），选择它会显示
 * error-panel 优雅报错；腾讯财经（默认源）与 Binance 可正常直连。
 */
export const SHOWCASE_SOURCE_DEFAULTS = SOURCE_DEFAULTS;

/**
 * 数据源支持的周期列表（缺省=全部周期；tdx 占位源 supportedPeriods 为空，
 * 回退 PERIOD_ALL 以免周期下拉为空数组导致初始化崩溃——反正 tdx 直接抛错
 * 走 error-panel，周期下拉不会真正被使用）。
 */
export function supportedPeriodsOf(sourceId: DataSourceId): readonly KlinePeriod[] {
  const p = getDataSource(sourceId).supportedPeriods;
  return p && p.length > 0 ? p : PERIOD_ALL;
}
