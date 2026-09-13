import { useEffect, useMemo, useState } from 'react';
import type { OHLCV, KlinePeriod, StockResult } from '../types/ohlcv';
import { PERIOD_LABEL, PERIOD_ALL } from '../types/ohlcv';
import { dataSourceList, getDataSource, type DataSourceId } from '../data';
import { SOURCE_DEFAULTS, HISTORY_LIMITS, DEFAULT_HISTORY_LIMIT, useStockSearch } from './controlsShared';
import { supportedPeriodsOf } from './showcaseShared';
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
 */
export function Dashboard() {
  const [sourceId, setSourceId] = useState<DataSourceId>('tencent');
  const def = SOURCE_DEFAULTS[sourceId];
  const [symbol, setSymbol] = useState<string>(def.symbol);
  const [symbolLabel, setSymbolLabel] = useState<string>(def.label);
  const [period, setPeriod] = useState<KlinePeriod>('1d');
  const [live, setLive] = useState(true);
  const [historyLimit, setHistoryLimit] = useState<number>(DEFAULT_HISTORY_LIMIT);

  const source = useMemo(() => getDataSource(sourceId), [sourceId]);
  // 当前数据源支持的周期（不声明则默认全部支持）
  const supported = useMemo<readonly KlinePeriod[]>(
    () => source.supportedPeriods ?? PERIOD_ALL,
    [source],
  );
  const [history, setHistory] = useState<OHLCV[]>([]);
  const [error, setError] = useState<string | null>(null);
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
    setSourceId(next);
    setSymbol(d.symbol);
    setSymbolLabel(d.label);
    resetSearch();
    const periods = supportedPeriodsOf(next);
    const target = periods.includes(period) ? period : periods[0];
    if (target !== period) setPeriod(target);
  }

  function pickStock(r: StockResult) {
    setSymbol(r.symbol);
    setSymbolLabel(r.name);
    resetSearch();
  }

  // 侧边栏切页会把本组件整体卸载，筛选状态随之丢失（回到默认上证指数/日线）。
  // 这属于已知取舍：切页即停止轮询、切回重新拉取，换来的数据保鲜
  // 比保留筛选更符合"快速对比看板"的定位；若将来需要持久化，再考虑把状态
  // 提升到 App 或 localStorage。

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
  }, [source, symbol, period, live, historyLimit]);

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
            <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
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
              onChange={(e) => setPeriod(e.target.value as KlinePeriod)}
            >
              {supported.map((p) => (
                <option key={p} value={p}>
                  {PERIOD_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="live-toggle">
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
            实时更新
          </label>
          <label>
            历史 K 线
            <select
              value={historyLimit}
              onChange={(e) => setHistoryLimit(Number(e.target.value))}
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
        {error && <span className="error">数据源异常：{error}</span>}
      </header>

      {error ? (
        <div className="error-panel">
          无法加载 {symbolLabel}（{symbol}） {PERIOD_LABEL[period]} 数据：{error}
        </div>
      ) : (
        <main className="grid">
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
                    onClick={() => setPeriod(supported[0])}
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
      )}
    </div>
  );
}
