/**
 * 带超时兜底的 fetch。五个数据源（tencent / eastmoney / binance / twelvedata /
 * yahoo）的 K 线请求全部经由它发出。
 *
 * 为什么必须加超时：浏览器原生 fetch 没有超时概念，个别上游偶发"连接已建、
 * 请求挂起"（腾讯 K 线接口偶发吞请求、东财 TLS 阻断后挂起等），响应头一直
 * 不来，Promise 永久 pending——页面既出不了 error-panel 也补不满 bars，表现为
 * 测试里"5s 内既无数据也无错误"的卡死。兜底计时器到点 abort，fetch reject，
 * 上层 useKlineData 落 error 分支，页面/测试拿到确定的终态。
 *
 * @param timeoutMs 兜底毫秒数（默认 12s：要足够盖过慢源，也要保证测试的
 *  5s 等待窗口内必然落定——实测腾讯吞请求时 ≤2s 就触发 abort）。
 */
export function fetchKlinesWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 12_000,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => {
    window.clearTimeout(timer);
  });
}
