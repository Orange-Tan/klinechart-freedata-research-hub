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

/** 各页首次访问（无存档）时的默认筛选状态（与 loadChartViewState 的回退值一致） */
export const DEFAULT_CHART_VIEW: ChartViewState = {
  sourceId: 'tencent',
  symbol: SOURCE_DEFAULTS.tencent.symbol,
  symbolLabel: SOURCE_DEFAULTS.tencent.label,
  period: '1d',
  live: true,
  historyLimit: DEFAULT_HISTORY_LIMIT,
};

/**
 * 读取已持久化的状态。返回 null 表示无存档（首次访问 / 清除过 localStorage），
 * 调用方据此回退到 DEFAULT_CHART_VIEW（腾讯财经 + 上证指数 + 日线）。
 * 任何异常（JSON 损坏 / 存档结构不合法）都当作无存档处理。
 *
 * 标的只校验类型不校验取值：搜索选中的标的（不在源固定下拉里）同样合法，
 * 无效代码会在 fetchKlines 阶段如实报错，由页面错误面板呈现，而非静默重置。
 */
export function loadChartViewState(): ChartViewState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<ChartViewState>;
    const sourceId = p.sourceId;
    // sourceId 必须是注册表里真实存在的键，否则后续 SOURCE_DEFAULTS[sourceId] 取不到默认值
    if (typeof sourceId !== 'string' || !(sourceId in SOURCE_DEFAULTS) || typeof p.symbol !== 'string') {
      return null;
    }
    return {
      sourceId,
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
 * 校验周期在当前数据源下是否受支持，不支持时回退到该源的首个支持周期
 * （源未声明 supportedPeriods 时兜底为全部周期）。
 * App 恢复存档时用它归一化；三个页面切换数据源时同样用它回退周期。
 */
export function resolvePeriod(state: ChartViewState): KlinePeriod {
  const periods = supportedPeriodsOf(state.sourceId);
  return periods.includes(state.period) ? state.period : periods[0];
}
