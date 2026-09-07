import { useEffect, useMemo, useState } from 'react';
import type { OHLCV, KlinePeriod } from './types/ohlcv';
import { dataSourceList, getDataSource, type DataSourceId } from './data';
import { LightweightChart } from './components/charts/LightweightChart';
import { KLineChart } from './components/charts/KLineChart';
import { HQChart } from './components/charts/HQChart';
import { EChartsChart } from './components/charts/EChartsChart';

/** 首批对比的 4 个图表库 */
const LIBRARIES = [
  { id: 'lightweight-charts', name: 'Lightweight-Charts', Comp: LightweightChart },
  { id: 'klinecharts', name: 'KLineChart', Comp: KLineChart },
  { id: 'hqchart', name: 'HQChart', Comp: HQChart },
  { id: 'echarts', name: 'ECharts', Comp: EChartsChart },
] as const;

const PERIODS: { value: KlinePeriod; label: string }[] = [
  { value: '1m', label: '1 分钟' },
  { value: '5m', label: '5 分钟' },
  { value: '15m', label: '15 分钟' },
  { value: '1h', label: '1 小时' },
  { value: '4h', label: '4 小时' },
  { value: '1d', label: '日线' },
];

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'] as const;

const HISTORY_LIMIT = 300;

export default function App() {
  const [sourceId, setSourceId] = useState<DataSourceId>('binance');
  const [symbol, setSymbol] = useState<string>(SYMBOLS[0]);
  const [period, setPeriod] = useState<KlinePeriod>('1m');
  const [live, setLive] = useState(true);

  const source = useMemo(() => getDataSource(sourceId), [sourceId]);
  const [history, setHistory] = useState<OHLCV[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 历史数据 + 订阅：source/symbol/period 任一变化都重建
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setHistory([]);

    // 立即加载历史
    source
      .fetchKlines(symbol, period, HISTORY_LIMIT)
      .then((bars) => {
        if (cancelled) return;
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
        setHistory((prev) => {
          const last = prev[prev.length - 1];
          // 同一根 K 线：替换最后一根；新的一根：追加
          if (last && last.time === bar.time) {
            const next = prev.slice(0, -1);
            next.push(bar);
            return next;
          }
          return [...prev, bar];
        });
      });
    }

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [source, symbol, period, live]);

  return (
    <div className="app">
      <header className="toolbar">
        <h1>K 线图开源库综合对比</h1>
        <div className="controls">
          <label>
            数据源
            <select value={sourceId} onChange={(e) => setSourceId(e.target.value as DataSourceId)}>
              {dataSourceList.map((ds) => (
                <option key={ds.id} value={ds.id}>
                  {ds.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            交易对
            <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
              {SYMBOLS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            周期
            <select value={period} onChange={(e) => setPeriod(e.target.value as KlinePeriod)}>
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="live-toggle">
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
            实时更新
          </label>
        </div>
        <div className="status">
          <span className="badge">{LIBRARIES.length} 个图表库</span>
          <span className="badge">{source.label}</span>
          {error && <span className="error">数据源错误：{error}</span>}
        </div>
      </header>

      {error ? (
        <div className="error-panel">
          无法加载 {symbol} {period} 数据：{error}
        </div>
      ) : (
        <main className="grid">
          {LIBRARIES.map(({ id, name, Comp }) => (
            <section key={id} className="card">
              <header className="card-header">
                <h2>{name}</h2>
                <span className="bars-count">{history.length} bars</span>
              </header>
              <div className="chart-wrap">
                <Comp data={history} symbol={symbol} period={period} live={live} />
              </div>
            </section>
          ))}
        </main>
      )}
    </div>
  );
}
