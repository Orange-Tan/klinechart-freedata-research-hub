import { useCallback, useEffect, useMemo, useState } from 'react';
import type { OHLCV, KlinePeriod, KlineDataSource } from '../types/ohlcv';
import { getDataSource, type DataSourceId } from '../data';

export interface UseKlineDataOptions {
  /** 数据源 id（默认 binance：data-api.binance.vision 国内直连最稳） */
  sourceId?: DataSourceId;
  symbol: string;
  period: KlinePeriod;
  /** 历史 K 线根数（默认 300） */
  historyLimit?: number;
  /** 是否订阅实时更新（默认开） */
  live?: boolean;
}

/**
 * 单个 K 线图页面的数据 hook：拉历史 + 订阅实时，返回归一化结果。
 *
 * 三页（Dashboard / 两个单库详页）共用同一数据流（见 CLAUDE.md「数据流」）：
 * 历史请求先回，订阅轮询可能更早返回的"最新一根未收 K 线"在 historyLoaded
 * 置位前直接丢弃，保证图表拿到的首批数据永远是完整历史，避免画出来只剩 1 根。
 *
 * 返回的 error 用统一文案（非受支持周期 / 网络失败），页面据此展示错误提示；
 * retry() 让页面在异常提醒上提供「重试」入口——自增计数加入 effect 依赖，
 * 触发放弃旧请求、按当前参数重新拉取（源 / 标的 / 周期 / 上限 / 实时开关均不变）。
 * loaded 表示当前参数组合的历史数据是否已成功送达（fetch 成功即 true，
 * effect 重跑即 false），Dashboard 用它驱动"周期不受支持"的警告窗口期。
 */
export function useKlineData({
  sourceId = 'binance',
  symbol,
  period,
  historyLimit = 300,
  live = true,
}: UseKlineDataOptions) {
  const source = useMemo<KlineDataSource>(() => getDataSource(sourceId), [sourceId]);

  const [history, setHistory] = useState<OHLCV[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setHistory([]);
    setLoaded(false); // 新一轮加载开始：卡片进入"未就绪"窗口

    // 历史加载完成标记：历史未就绪时收到的实时推送直接丢弃（竞态守卫）
    let historyLoaded = false;

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

    let unsubscribe: (() => void) | undefined;
    if (live && source.subscribe) {
      unsubscribe = source.subscribe(symbol, period, (bar) => {
        if (cancelled) return;
        if (!historyLoaded) return; // 历史未就绪：丢弃竞态推送
        setHistory((prev) => {
          const last = prev[prev.length - 1];
          let next: OHLCV[];
          if (last && last.time === bar.time) {
            // 同一根 K 线：替换最后一根
            next = prev.slice(0, -1);
            next.push(bar);
          } else {
            // 新开一根：追加
            next = [...prev, bar];
          }
          // 裁剪最老一根，保持列表稳定
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
  }, [source, symbol, period, historyLimit, live, retryKey]);

  const retry = useCallback(() => {
    setRetryKey((k) => k + 1);
  }, []);

  return { history, error, source, loaded, retry };
}
