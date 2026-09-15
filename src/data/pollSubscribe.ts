import type { OHLCV } from '../types/ohlcv';

/**
 * 通用实时订阅：2s 轮询最新一根 K 线模拟"实时"。
 *
 * 五个数据源（tencent / eastmoney / binance / twelvedata / yahoo）共用同一套
 * 轮询实现，修正竞态守卫只需改这一处：
 * - generation 竞态守卫：飞行中的 fetch 无法中止，symbol/period 切换后用 token
 *   丢弃过期响应，避免旧数据串到新状态。
 * - lastBarTime 去重：同一根 K 线的 close/volume 在更新，但时间相同不重复推送。
 * - 静默 catch：轮询失败（限流/网络波动）下一轮自动重试，不刷屏报错。
 *
 * @param fetchLatest 拉最新几根 K 线（各源自定 limit，如东财 1 根、其余 2 根）
 * @param onUpdate 最新一根 K 线变化时回调
 * @param intervalMs 轮询间隔（默认 2s）
 */
export function pollSubscribe(
  fetchLatest: () => Promise<OHLCV[]>,
  onUpdate: (bar: OHLCV) => void,
  intervalMs = 2_000,
): () => void {
  let closed = false;
  let generation = 0;
  let lastBarTime = 0;

  const tick = async () => {
    const gen = generation;
    if (closed) return;
    try {
      const bars = await fetchLatest();
      // 取到的快照已过期（symbol/period 已变）：丢弃，避免把旧数据交给订阅方
      if (gen !== generation || closed) return;
      const latest = bars[bars.length - 1];
      if (latest && latest.time !== lastBarTime) {
        lastBarTime = latest.time;
        onUpdate(latest);
      }
    } catch {
      // 轮询失败静默忽略，下一轮重试
    }
  };

  void tick();
  const timer = window.setInterval(() => void tick(), intervalMs);

  return () => {
    closed = true;
    generation += 1; // 使所有飞行中的响应过期
    window.clearInterval(timer);
  };
}
