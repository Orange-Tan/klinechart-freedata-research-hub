import { useEffect, useMemo, useState } from 'react';
import type { OHLCV, KlinePeriod, StockResult } from '../types/ohlcv';
import { PERIOD_LABEL, PERIOD_ALL } from '../types/ohlcv';
import { dataSourceList, getDataSource, type DataSourceId } from '../data';
import { SOURCE_DEFAULTS, HISTORY_LIMITS, useStockSearch, supportedPeriodsOf } from './controlsShared';
import type { ChartViewState } from '../state/chartView';
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
  // 单项变更 = 读当前值改一个字段后整体上报（写回 App 状态与 localStorage）
  const patch = (p: Partial<ChartViewState>) => onChartViewChange({ ...chartView, ...p });

  const source = useMemo(() => getDataSource(sourceId), [sourceId]);
  // 当前数据源支持的周期（不声明则默认全部支持）
  const supported = useMemo<readonly KlinePeriod[]>(
    () => source.supportedPeriods ?? PERIOD_ALL,
    [source],
  );
  const [history, setHistory] = useState<OHLCV[]>([]);
  const [error, setError] = useState<string | null>(null);
  // 重试计数：数据源异常提醒上的「重试」按钮自增它，effect 依赖变化即重新拉取
  const [retry, setRetry] = useState(0);
  // 当前 (source,symbol,period) 组合的数据是否已成功加载。
  // 当周期不受支持（或仍在加载中/加载失败）时，用它驱动卡片顶部的异常文字提醒。
  const [loaded, setLoaded] = useState(false);
  // 图表卡片异常提示：本周期不受数据源支持且图表没能正常出图。
  // 只在"用户刚切换过去、数据还没到位"的窗口期显示；数据就绪后自动消失。
  const showWarn = supported.length > 0 && !supported.includes(period) && !loaded;

  // 顶部搜索框状态（防抖 + 下拉结果，由共享 hook 管理）
  const search = useStockSearch(sourceId);
  const { query, setQuery, results, setResults, searching, reset: resetSearch } = search;

  // 切数据源时重置到该源的默认标的，并清掉残留的搜索词/结果；
  // 周期回退到该源的首个支持周期（source.supportedPeriods 或 PERIOD_ALL[0] = 1m）
  function handleSourceChange(next: DataSourceId) {
    const d = SOURCE_DEFAULTS[next];
    const periods = supportedPeriodsOf(next);
    const target = periods.includes(period) ? period : periods[0];
    patch({ sourceId: next, symbol: d.symbol, symbolLabel: d.label, period: target });
    resetSearch();
  }

  function pickStock(r: StockResult) {
    patch({ symbol: r.symbol, symbolLabel: r.name });
    resetSearch();
  }

  // 侧边栏切页会把本组件整体卸载，但筛选状态由 App 全局持有（localStorage 持久化），
  // 切回时自动恢复，不再退回默认腾讯财经；切页停止轮询、切回重新拉取的数据保鲜不变。

  // 历史数据 + 订阅：source/symbol/period 任一变化都重建
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setHistory([]);
    setLoaded(false); // 新一轮加载开始，卡片进入"未就绪"窗口

    // 历史加载完成标记。竞态根因：订阅轮询（limit=2）可能比历史请求先返回，
    // 把"最新一根未收 K 线"当首批数据 setHistory([bar])，图表先画 1 根；
    // 随后 300 根历史到达被各库当成"同序列增量"只更新最后一根 → 图上永远只剩
    // 1 根（日 K 整天不换周期，复现率极高）。历史数据本身包含最新一根，所以
    // 历史未就绪时收到的实时推送直接丢弃，图表拿到的首批数据永远是完整历史。
    let historyLoaded = false;

    // 立即加载历史
    source
      .fetchKlines(symbol, period, historyLimit)
      .then((bars) => {
        if (cancelled) return;
        historyLoaded = true;
        setLoaded(true); // 数据成功送达：异常提醒自动消失
        setHistory(bars);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });

    // 订阅实时更新（若数据源支持）
    let unsubscribe: (() => void) | undefined;
    if (live && source.subscribe) {
      unsubscribe = source.subscribe(symbol, period, (bar) => {
        if (cancelled) return;
        if (!historyLoaded) return; // 历史未就绪：丢弃竞态推送
        setHistory((prev) => {
          const last = prev[prev.length - 1];
          let next: OHLCV[];
          // 同一根 K 线：替换最后一根；新的一根：追加
          if (last && last.time === bar.time) {
            next = prev.slice(0, -1);
            next.push(bar);
          } else {
            next = [...prev, bar];
          }
          // 裁剪最老的一根，保持列表稳定（historyLimit 根），避免无限增长把图压扁
          if (next.length > historyLimit) {
            next = next.slice(next.length - historyLimit);
          }
          return next;
        });
      });
    }

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [source, symbol, period, live, historyLimit, retry]);

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
              value={supported.includes(period) ? period : ''}
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
            <button type="button" className="error-retry-btn" onClick={() => setRetry((r) => r + 1)}>
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
