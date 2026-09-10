import { useEffect, useState } from 'react';
import type { StockResult } from '../types/ohlcv';
import { getDataSource, type DataSourceId } from '../data';

/** 各数据源的默认标的面板（选中该源时展示的标的列表 + 默认选中） */
export interface SourceDefault {
  symbol: string;
  label: string;
  options: { value: string; label: string }[];
}

export const SOURCE_DEFAULTS: Record<DataSourceId, SourceDefault> = {
  binance: {
    symbol: 'BTCUSDT',
    label: 'BTCUSDT',
    options: [
      { value: 'BTCUSDT', label: 'BTCUSDT' },
      { value: 'ETHUSDT', label: 'ETHUSDT' },
      { value: 'BNBUSDT', label: 'BNBUSDT' },
      { value: 'SOLUSDT', label: 'SOLUSDT' },
      { value: 'XRPUSDT', label: 'XRPUSDT' },
    ],
  },
  tencent: {
    symbol: 'sh000001',
    label: '上证指数',
    options: [
      { value: 'sh000001', label: '上证指数' },
      { value: 'sz399001', label: '深证成指' },
      { value: 'sh600519', label: '贵州茅台' },
      { value: 'sz000001', label: '平安银行' },
      { value: 'sz300750', label: '宁德时代' },
    ],
  },
  eastmoney: {
    symbol: 'sh000001',
    label: '上证指数',
    options: [
      { value: 'sh000001', label: '上证指数' },
      { value: 'sz399001', label: '深证成指' },
      { value: 'sh600519', label: '贵州茅台' },
      { value: 'sz000001', label: '平安银行' },
      { value: 'sz300750', label: '宁德时代' },
    ],
  },
  tdx: {
    symbol: 'sh000001',
    label: '上证指数',
    options: [
      { value: 'sh000001', label: '上证指数' },
      { value: 'sz399001', label: '深证成指' },
      { value: 'sh600519', label: '贵州茅台' },
    ],
  },
};

/** 历史 K 线数量档位（顶部工具栏可切换，默认 300） */
export const HISTORY_LIMITS = [100, 300, 500, 1000] as const;
export const DEFAULT_HISTORY_LIMIT = 300;

/**
 * 判断错误是否属于「数据源/网络侧」而非业务数据异常。
 * 腾讯 WAF 拦截日线接口返回 501 + HTML 拦截页，提示文案据此给出
 * 「切换数据源或周期重试」的建议；业务性错误（如周期不支持）不提示。
 */
export function isSourceOrNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/WAF|501|429|403|CORS|Failed to fetch|network|Network|ECONN/i.test(msg)) return true;
  return false;
}

/** 防抖：等待静默期后才触发搜索请求 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * A 股搜索（Dashboard 与两个单库详页共用）。数据源声明了 searchSymbols 能力时
 * 才发起搜索；Binance 等无搜索能力的源下静默跳过、结果清空。防抖 300ms。
 *
 * 返回的 reset() 用于切源 / 选中标的时清空搜索词与下拉结果。
 */
export function useStockSearch(sourceId: DataSourceId) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 300);
  const [results, setResults] = useState<StockResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const source = getDataSource(sourceId);
    const kw = debouncedQuery.trim();
    if (kw.length < 2 || !source.searchSymbols) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    source
      .searchSymbols(kw)
      .then((list) => {
        if (!cancelled) setResults(list);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, sourceId]);

  const reset = () => {
    setQuery('');
    setResults([]);
  };

  return { query, setQuery, results, setResults, searching, reset };
}
