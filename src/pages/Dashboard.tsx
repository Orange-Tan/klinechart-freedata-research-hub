import { useEffect, useMemo, useState } from 'react';
import type { OHLCV, KlinePeriod } from '../types/ohlcv';
import { dataSourceList, getDataSource, type DataSourceId } from '../data';
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

/**
 * 第 1 页：4 库同源实时 K 线快速对比看板。
 * 数据流单向：数据源 → 本组件统一拉取 → 4 个图表适配组件各用自己的 API 消费。
 */
export function Dashboard() {
  const [sourceId, setSourceId] = useState<DataSourceId>('binance');
  const [symbol, setSymbol] = useState<string>(SYMBOLS[0]);
  const [period, setPeriod] = useState<KlinePeriod>('1d');
  const [live, setLive] = useState(true);

  const source = useMemo(() => getDataSource(sourceId), [sourceId]);
  const [history, setHistory] = useState<OHLCV[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 历史数据 + 订阅：source/symbol/period 任一变化都重建
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setHistory([]);

    // 历史加载完成标记。竞态根因：订阅轮询（limit=2）可能比历史请求先返回，
    // 把"最新一根未收 K 线"当首批数据 setHistory([bar])，图表先画 1 根；
    // 随后 300 根历史到达被各库当成"同序列增量"只更新最后一根 → 图上永远只剩
    // 1 根（日 K 整天不换周期，复现率极高）。历史数据本身包含最新一根，所以
    // 历史未就绪时收到的实时推送直接丢弃，图表拿到的首批数据永远是完整历史。
    let historyLoaded = false;

    // 立即加载历史
    source
      .fetchKlines(symbol, period, HISTORY_LIMIT)
      .then((bars) => {
        if (cancelled) return;
        historyLoaded = true;
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
          // 裁剪最老的一根，保持列表稳定（HISTORY_LIMIT 根），避免无限增长把图压扁
          if (next.length > HISTORY_LIMIT) {
            next = next.slice(next.length - HISTORY_LIMIT);
          }
          return next;
        });
      });
    }

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [source, symbol, period, live]);

  return (
    <div className="dashboard">
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
