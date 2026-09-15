import type { StockResult, KlinePeriod } from '../types/ohlcv';
import { PERIOD_LABEL } from '../types/ohlcv';
import { dataSourceList, getDataSource, type DataSourceId } from '../data';
import { SOURCE_DEFAULTS, HISTORY_LIMITS, useStockSearch, supportedPeriodsOf } from './controlsShared';
import { resolvePeriod, type ChartViewState } from '../state/chartView';
import { useKlineData } from '../hooks/useKlineData';
import { LightweightChart } from '../components/charts/LightweightChart';
import { KLineChart } from '../components/charts/KLineChart';
import { HQChart } from '../components/charts/HQChart';
import { EChartsChart } from '../components/charts/EChartsChart';

/** 首批对比的 4 个图表库 */
const LIBRARIES = [
  { id: 'lightweight-charts', name: 'Lightweight-Charts', Comp: LightweightChart },
  { id: 'klinecharts', name: 'KLineChart', Comp: KLineChart },
  { id: 'hqchart', name: 'HQChart', Comp: HQChart },
  { id: 'echarts', name: 'ECharts', Comp: EChartsChart },
] as const;

/**
 * 第 1 页：4 库同源实时 K 线快速对比看板。
 * 数据流单向：数据源 → 本组件统一拉取 → 4 个图表适配组件各用自己的 API 消费。
 *
 * 筛选状态（数据源/标的/周期/实时/根数）由 App 全局持有并注入：
 * 切页卸载再切回时从 localStorage 恢复，不退回默认腾讯财经。
 */
export function Dashboard({ chartView, onChartViewChange }: {
  chartView: ChartViewState;
  onChartViewChange: (v: ChartViewState) => void;
}) {
  const { sourceId, symbol, symbolLabel, period, live, historyLimit } = chartView;
  const def = SOURCE_DEFAULTS[sourceId];
  const source = getDataSource(sourceId);
  // 单项变更 = 读当前值改一个字段后整体上报（写回 App 状态与 localStorage）
  const patch = (p: Partial<ChartViewState>) => onChartViewChange({ ...chartView, ...p });

  // 当前数据源支持的周期（不声明则默认全部支持）
  const supported = supportedPeriodsOf(sourceId);
  const supportedHasPeriod = supported.includes(period);
  // 历史数据 + 订阅（含竞态守卫）：source/symbol/period 任一变化都重建
  const { history, error, loaded, retry } = useKlineData({ sourceId, symbol, period, historyLimit, live });
  // 重试计数：数据源异常提醒上的「重试」按钮自增它，effect 依赖变化即重新拉取
  const showWarn = supported.length > 0 && !supportedHasPeriod && !loaded;

  // 顶部搜索框状态（防抖 + 下拉结果，由共享 hook 管理）
  const search = useStockSearch(sourceId);
  const { query, setQuery, results, setResults, searching, reset: resetSearch } = search;

  // 切数据源时重置到该源的默认标的，并清掉残留的搜索词/结果；
  // 周期回退到该源的首个支持周期（supportedPeriodsOf 或 PERIOD_ALL[0] = 1m）
  function handleSourceChange(next: DataSourceId) {
    const d = SOURCE_DEFAULTS[next];
    patch({
      sourceId: next,
      symbol: d.symbol,
      symbolLabel: d.label,
      period: resolvePeriod({ ...chartView, sourceId: next }),
    });
    resetSearch();
  }

  function pickStock(r: StockResult) {
    patch({ symbol: r.symbol, symbolLabel: r.name });
    resetSearch();
  }

  // 侧边栏切页会把本组件整体卸载，但筛选状态由 App 全局持有（localStorage 持久化），
  // 切回时自动恢复，不再退回默认腾讯财经；切页停止轮询、切回重新拉取的数据保鲜不变。

  return (
    <div className="dashboard">
      <header className="toolbar">
        <h1>K 线图开源库综合对比</h1>
        <div className="controls">
          <label>
            数据源
            <select value={sourceId} onChange={(e) => handleSourceChange(e.target.value as DataSourceId)}>
              {dataSourceList.map((ds) => (
                <option key={ds.id} value={ds.id}>
                  {ds.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            标的
            <select value={symbol} onChange={(e) => patch({ symbol: e.target.value, symbolLabel: def.options.find((o) => o.value === e.target.value)?.label ?? symbol })}>
              {def.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            周期
            <select
              value={supportedHasPeriod ? period : ''}
              onChange={(e) => patch({ period: e.target.value as KlinePeriod })}
            >
              {supported.map((p) => (
                <option key={p} value={p}>
                  {PERIOD_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="live-toggle">
            <input type="checkbox" checked={live} onChange={(e) => patch({ live: e.target.checked })} />
            实时更新
          </label>
          <label>
            历史 K 线
            <select
              value={historyLimit}
              onChange={(e) => patch({ historyLimit: Number(e.target.value) })}
            >
              {HISTORY_LIMITS.map((n) => (
                <option key={n} value={n}>
                  {n} 根
                </option>
              ))}
            </select>
          </label>
          <div className="stock-search">
            <input
              type="text"
              className="stock-search-input"
              placeholder="搜索 A 股股票/指数"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setResults([]);
              }}
            />
            {searching && <span className="search-spinner">…</span>}
            {results.length > 0 && (
              <ul className="search-dropdown">
                {results.map((r) => (
                  <li key={r.symbol}>
                    <button type="button" onClick={() => pickStock(r)}>
                      <span className="search-name">{r.name}</span>
                      <span className="search-symbol">{r.symbol}</span>
                      {r.type && <span className="search-type">{r.type}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </header>

      {/* 数据源异常：灰蒙蒙遮罩（.grid-mask）盖住整个网格、把底下已渲染的图表
          压暗变灰（图表不清空、保留最后渲染的 K 线）；提示条（.error-panel）
          浮在遮罩之上（z-index 11 > 10），固定在网格顶部居中、文字与重试按钮
          同行——交互与两个详页的 stage-error 完全一致。 */}
      <main className="grid">
        {error && (
          <div className="grid-mask" aria-hidden="true">
            <span>数据源异常，历史数据未能加载</span>
          </div>
        )}
        {error && (
          <div className="error-panel" role="alert">
            <span className="error-panel-msg">
              无法加载 {symbolLabel}（{symbol}） {PERIOD_LABEL[period]} 数据：{error}
            </span>
            <button type="button" className="error-retry-btn" onClick={retry}>
              重试
            </button>
          </div>
        )}
        {LIBRARIES.map(({ id, name, Comp }) => (
          <section key={id} className="card">
            <header className="card-header">
              <h2>{name}</h2>
              {/* 视口隐藏的 bars 计数：纯渲染进度信号，供自动化测试读取，不占视觉空间 */}
              <span className="sr-only bars-count">{history.length} bars</span>
            </header>
            {/* 异常加载提醒：本数据源不支持该周期时，卡片顶部出现醒目文字 + 一键回退 */}
            {showWarn && (
              <div className="chart-warn">
                <span>
                  当前数据源（{source.label}）不支持 {PERIOD_LABEL[period]}（{period}）周期，图表无法加载
                </span>
                <button
                  type="button"
                  className="chart-warn-btn"
                  onClick={() => patch({ period: supported[0] })}
                >
                  切换为 {PERIOD_LABEL[supported[0]]}
                </button>
              </div>
            )}
            <div className="chart-wrap">
              <Comp
                data={history}
                symbol={symbol}
                period={period}
                live={live}
                resetKey={`${symbol}/${period}/${historyLimit}`}
              />
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
