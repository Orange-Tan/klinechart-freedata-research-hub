/**
 * 连通性检测：
 * - fetch 直连：任一带 HTTP 响应（含 401/404/429）都算连通 —— 只要服务端回了包就是通的。
 *   浏览器里 CORS 拦截与网络不通都表现为 fetch TypeError，无法区分，
 *   失败时统一标注「被拦截（CORS 或网络不通）」。
 * - script 注入（JSONP / JS 标签）：<script src> 绕开 CORS，onload = 资源下载成功即连通。
 * - 无 checkUrl：服务端库 / 已排除 / 反爬墙，无法在浏览器检测，返回 na（不可直连）。
 */
import type { DataSourceInfo } from '../pages/dataResearchData';

export type CheckState = 'idle' | 'checking' | 'ok' | 'fail' | 'na';

export interface CheckResult {
  state: CheckState;
  /** 状态说明 */
  detail: string;
  /** 首字节耗时 ms（ok 时才有） */
  latency?: number;
}

const TIMEOUT_MS = 8000;

/** dev 模式下把「需代理」源的 host 换成 Vite proxy 路径；生产构建保持原 URL（会被 CORS 拦，如实失败） */
function resolveCheckUrl(src: DataSourceInfo): string {
  const url = src.checkUrl!;
  if (!import.meta.env.DEV) return url;
  const proxyHosts: Record<string, string> = {
    'query1.finance.yahoo.com': '/yh',
    'api.kraken.com': '/kr',
    'api.fund.eastmoney.com': '/ttjj',
    'www.shfe.com.cn': '/shfe',
    'push2his.eastmoney.com': '/push2his',
  };
  const host = proxyHosts[new URL(url).hostname];
  if (!host) return url;
  const u = new URL(url);
  return `${host}${u.pathname}${u.search}`;
}

function fetchCheck(src: DataSourceInfo): Promise<CheckResult> {
  const url = resolveCheckUrl(src);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  return fetch(url, { signal: ctrl.signal, cache: 'no-store', redirect: 'follow' })
    .then((res) => ({
      state: 'ok' as const,
      detail: `HTTP ${res.status} · ${(performance.now()).toFixed(0)}ms`,
    }))
    .catch(() => ({ state: 'fail' as const, detail: '被拦截（CORS 或网络不通）' }))
    .finally(() => clearTimeout(timer));
}

/** script 标签注入：onload 即资源下载成功（即使执行抛错），onerror 才失败 */
function scriptCheck(src: DataSourceInfo): Promise<CheckResult> {
  return new Promise((resolve) => {
    const url = src.checkUrl!;
    const el = document.createElement('script');
    const done = () => {
      el.remove();
      resolve({ state: 'ok', detail: '脚本注入成功（JSONP 通道可用）' });
    };
    const fail = () => {
      el.remove();
      resolve({ state: 'fail', detail: '加载失败（网络不通或被墙）' });
    };
    el.src = url;
    el.async = true;
    el.onload = done;
    el.onerror = fail;
    const timer = setTimeout(fail, TIMEOUT_MS);
    // 覆盖：script 同时被 onload 和 timer 命中时只 resolve 一次
    el.onload = () => {
      clearTimeout(timer);
      done();
    };
    el.onerror = () => {
      clearTimeout(timer);
      fail();
    };
    document.head.appendChild(el);
  });
}

export function checkSource(src: DataSourceInfo): Promise<CheckResult> {
  if (!src.checkUrl) {
    return Promise.resolve({ state: 'na', detail: '服务端库/反爬/停服，浏览器不可直连' });
  }
  return src.access.includes('jsonp') ? scriptCheck(src) : fetchCheck(src);
}
