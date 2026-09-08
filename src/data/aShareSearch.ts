import type { StockResult } from '../types/ohlcv';

/**
 * A 股股票/指数搜索。
 *
 * 两个候选源：
 *  1. 东财 suggest JSONP（searchapi.eastmoney.com）：首选。实测 GET 响应 200 但
 *     不返回 `Access-Control-Allow-Origin`，浏览器 fetch 会被拦截，必须用 JSONP；
 *     支持 `cb` 回调参数。
 *  2. 腾讯 smartbox JSONP（smartbox.gtimg.cn/s3）：兜底。返回 GBK 编码文本
 *     `v_hint="sh~000001~上证指数~szzs~ZS^..."`，ZS=指数 / GP-A=股票 / KJ=基金。
 *
 * 为什么做双源兜底：两个端点都有偶发不可用（东财偶发不发请求/响应挂起、smartbox
 * 偶发超时），单靠一个源搜索框会随机失灵。策略：先发东财，5s 超时仍未返回则
 * 立刻发腾讯，谁先返回用谁，不让用户干等。
 *
 * 返回结果的 Type 分类（东财实测）：
 *  - AStock   A 股股票，QuoteID 前缀 0=深 / 1=沪，Symbol 形如 '000001' / '600519'
 *  - Index    指数，QuoteID 前缀 1=沪(如 1.000001 上证指数) / 0=深(如 0.399001 深证成指)
 *  - Fund    基金、港股、美股、期货等非 A 股标的，过滤掉
 */

interface SuggestItem {
  Code: string;
  Name: string;
  Classify: string;
  SecurityTypeName: string;
  QuoteID: string;
}

interface SuggestResp {
  QuotationCodeTable?: { Data?: SuggestItem[] };
}

const SEARCH_URL =
  'https://searchapi.eastmoney.com/api/suggest/get?type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=10';
const EASTMONEY_TIMEOUT_MS = 5000;
const GLOBAL_TIMEOUT_MS = 9000;

/**
 * 搜索 A 股/指数。keyword 为空或长度 < 2 时返回空数组。
 * 归一化输出：symbol 统一为腾讯格式 sh/sz 前缀 + 6 位代码。
 */
export function searchAStock(keyword: string): Promise<StockResult[]> {
  const kw = keyword.trim();
  if (kw.length < 2) return Promise.resolve([]);

  // 双源竞速：东财先发（5s 超时即切换腾讯），两个都可能超时（兜底 GLOBAL_TIMEOUT）。
  // 谁先 resolve 就用谁；都失败时整体 reject（调用方展示为空下拉）。
  const eastmoneyPromise = jsonp<SuggestResp>(
    `${SEARCH_URL}&input=${encodeURIComponent(kw)}`,
    'cb',
    EASTMONEY_TIMEOUT_MS,
  ).then((resp) => parseEastmoney(resp));

  const tencentPromise = jsonpTencent(kw);

  return new Promise<StockResult[]>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('搜索请求超时'));
    }, GLOBAL_TIMEOUT_MS);
    // settle 只清计时器（幂等）；resolve 天然只接受第一个调用，重复调用被忽略，
    // 所以两个来源谁先成功谁决定结果，后到的不影响。
    const settle = () => window.clearTimeout(timer);
    eastmoneyPromise.then(
      (v) => {
        settle();
        resolve(v);
      },
      () => {},
    );
    tencentPromise.then(
      (v) => {
        settle();
        resolve(v);
      },
      () => {},
    );
  });
}

function parseEastmoney(resp: SuggestResp | undefined): StockResult[] {
  const rows = resp?.QuotationCodeTable?.Data ?? [];
  return rows
    .filter((r) => r.Classify === 'AStock' || r.Classify === 'Index')
    .map((r) => {
      const quoteId = r.QuoteID || '';
      // QuoteID: '1.000001' 沪 / '0.399001' 深（对 AStock 与 Index 均成立）
      const market = quoteId.startsWith('0.') ? 'sz' : 'sh';
      const code = r.Code.replace(/[^0-9]/g, '').slice(-6);
      return {
        symbol: `${market}${code}`,
        code,
        name: r.Name,
        type: r.Classify === 'Index' ? '指数' : '股票',
      };
    })
    .filter((r) => /^[shz]{2}\d{6}$/.test(r.symbol));
}

/** 腾讯 smartbox JSONP：回调名直接用 v_hint，返回 GBK 编码的 `v_hint="..."` 文本。 */
function jsonpTencent(keyword: string): Promise<StockResult[]> {
  return jsonp<string>(
    `https://smartbox.gtimg.cn/s3/?q=${encodeURIComponent(keyword)}&t=all`,
    'callback',
    4000,
  ).then((text) => {
    const quoted = (text || '').match(/"([^"]*)"/);
    const content = quoted ? quoted[1] : String(text || '');
    // 格式：sh~000001~上证指数~szzs~ZS^sz~000001~平安银行~payh~GP-A^...
    return content
      .split('^')
      .map((seg) => seg.split('~'))
      .filter(
        (f) => f.length >= 3 && /^(ZS|GP-A)$/.test(f[3] || ''),
      )
      .map((f: string[]) => ({
        symbol: f[0],
        code: f[1],
        name: f[2],
        type: f[3] === 'ZS' ? '指数' : '股票',
      }))
      .filter((r) => /^[shz]{2}\d{6}$/.test(r.symbol));
  });
}

/** 简易 JSONP 封装：加载 script 标签，1 个回调名，用完即删。 */
function jsonp<T>(url: string, cbKey: string, timeoutMs: number): Promise<T> {
  const cbName = `__em_suggest_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const el = document.createElement('script');
  // cbName 是运行时拼出来的字符串，下面 window 下标访问会触发 TS7015。
  // 用 Record 桥接一下保持严格模式干净。
  const w = window as unknown as Record<string, unknown>;
  // data 会在 script 执行时传入。显式 unknown 避免对回调值的静态假定。
  // 注意：resolve 不能通过 new Promise((resolve) => ...) 捕获——若回调（script
  // 执行）先于 Promise 构造完成到达，resolve 还是 undefined，会丢数据。所以把
  // resolve 单独保存，让回调与 executor 解耦。
  let resolveFn: ((value: unknown) => void) | undefined;
  let rejectFn: ((reason?: unknown) => void) | undefined;
  const result = new Promise<unknown>((res, rej) => {
    resolveFn = res;
    rejectFn = rej;
  });

  function cleanup() {
    window.clearTimeout(timeout);
    // 动态回调挂载在全局（必须显式 window.xxx，否则生产构建的 terser 会把
    // script 里全局回调变量名改掉，回调永远不触发）
    w[cbName] = undefined;
    delete w[cbName];
    el.remove();
  }

  // 先落全局回调，再设置 src 发起加载。反过来会踩竞态：本机网络极快时，
  // script 异步加载完回调先执行，而此时 window[cbName] 还是 undefined →
  // Uncaught ReferenceError: xxx is not defined（实测复现）。
  w[cbName] = (data: unknown) => {
    resolveFn?.(data);
    cleanup();
  };

  const timeout = window.setTimeout(() => {
    cleanup();
    rejectFn?.(new Error('搜索请求超时'));
  }, timeoutMs);

  el.src = `${url}&${cbKey}=${cbName}`;
  el.onerror = () => {
    cleanup();
    rejectFn?.(new Error('搜索请求失败'));
  };
  document.body.appendChild(el);

  return result as Promise<T>;
}
