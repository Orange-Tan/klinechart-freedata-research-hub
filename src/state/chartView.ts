import type { DataSourceId } from '../data';
import type { KlinePeriod } from '../types/ohlcv';
import {
  DEFAULT_HISTORY_LIMIT,
  HISTORY_LIMITS,
  SOURCE_DEFAULTS,
  supportedPeriodsOf,
} from '../pages/controlsShared';

/**
 * 看板与两个单库详页共用的"当前筛选状态"——提升到 App 全局持有：
 * 切页（组件卸载/重挂载）或刷新后自动恢复，不再退回默认腾讯财经。
 * 所有页面选项（数据源/标的/周期/实时开关/历史根数）都从这里读写。
 */
export interface ChartViewState {
  sourceId: DataSourceId;
  symbol: string;
  symbolLabel: string;
  period: KlinePeriod;
  live: boolean;
  historyLimit: number;
}

const STORAGE_KEY = 'kline-chart-view-state';

/**
 * 读取已持久化的状态。返回 null 表示无存档（首次访问 / 清除过 localStorage），
 * 调用方据此回退到各页默认值（腾讯财经 + 上证指数 + 日线）。
 * 任何异常（JSON 损坏 / 存档结构不合法）都当作无存档处理。
 */
export function loadChartViewState(): ChartViewState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<ChartViewState>;
    // sourceId 必须是注册表里真实存在的键，否则后续 SOURCE_DEFAULTS[sourceId] 取不到默认值
    if (typeof p.sourceId !== 'string' || !(p.sourceId in SOURCE_DEFAULTS) || typeof p.symbol !== 'string') {
      return null;
    }
    return {
      sourceId: p.sourceId as DataSourceId,
      symbol: p.symbol,
      symbolLabel: typeof p.symbolLabel === 'string' ? p.symbolLabel : p.symbol,
      period: (typeof p.period === 'string' ? p.period : '1d') as KlinePeriod,
      live: typeof p.live === 'boolean' ? p.live : true,
      historyLimit:
        typeof p.historyLimit === 'number' && (HISTORY_LIMITS as readonly number[]).includes(p.historyLimit)
          ? p.historyLimit
          : DEFAULT_HISTORY_LIMIT,
    };
  } catch {
    return null;
  }
}

/** 持久化当前状态（选项变更时由各页的 setState 包装调用）。 */
export function saveChartViewState(state: ChartViewState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage 不可用（隐私模式/超限）时静默降级：功能不受影响，只是不记忆
  }
}

/**
 * 校验持久化状态中的标的在当前数据源下是否仍可下拉选择。
 * 下标与标的选项来自 SOURCE_DEFAULTS[sourceId]（含"标的下拉"与"搜索选中标的"两类）。
 * 选不中（如存档期标的）时：若该源有可选项则回退首个，否则回退源默认 symbol。
 */
export function resolveSymbol(state: ChartViewState): { symbol: string; symbolLabel: string } {
  const def = SOURCE_DEFAULTS[state.sourceId];
  const has = def.options.some((o) => o.value === state.symbol);
  if (has) return { symbol: state.symbol, symbolLabel: state.symbolLabel };
  return { symbol: def.symbol, symbolLabel: def.label };
}

/**
 * 校验持久化状态中的周期在当前数据源下是否受支持。
 * 不支持时回退到该源的首个支持周期；源未声明 supportedPeriods 时兜底为全部周期。
 */
export function resolvePeriod(state: ChartViewState): KlinePeriod {
  const periods = supportedPeriodsOf(state.sourceId);
  return periods.includes(state.period) ? state.period : periods[0];
}
