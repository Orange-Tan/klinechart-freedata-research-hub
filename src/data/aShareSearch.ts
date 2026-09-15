import type { StockResult } from '../types/ohlcv';

/**
 * A 股股票/指数搜索。
 *
 * 两个候选源：
 *  1. 东财 suggest JSONP（searchapi.eastmoney.com）：首选。实测 GET 响应 200 但
 *     不返回 `Access-Control-Allow-Origin`，浏览器 fetch 会被拦截，必须用 JSONP；
 *     支持 `cb` 回调参数（服务端把回调名回填进响应体再调用）。
 *  2. 腾讯 smartbox（smartbox.gtimg.cn/s3）：兜底。返回 `v_hint="..."` 形式的
 *     **全局变量赋值**脚本（不是回调调用）：`v_hint="sh~000001~上证指数~szzs~ZS^..."`，
 *     所以要用"加载 script → onload 后读 window.v_hint"的方式取值（见 jsonpTencent）。
 *
 * 为什么做双源兜底：两个端点都有偶发不可用（东财偶发不发请求/响应挂起/20s 无回调、
 * smartbox 偶发超时），单靠一个源搜索框会随机失灵。策略：双源同时发出，谁先成功
 * 用谁，不让用户干等。每个源自带超时（东财 5s / 腾讯 4s）保证必然落定：
 * 首成功立即采用；双双失败则在最后一个源落定时立即 reject，不再额外干等全局超时。
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
const TENCENT_TIMEOUT_MS = 4000;

/**
 * 搜索 A 股/指数。keyword 为空或长度 < 2 时返回空数组。
 * 归一化输出：symbol 统一为腾讯格式 sh/sz 前缀 + 6 位代码。
 */
export function searchAStock(keyword: string): Promise<StockResult[]> {
  const kw = keyword.trim();
  if (kw.length < 2) return Promise.resolve([]);

  // 双源竞速：东财 + 腾讯同时发出，首成功即胜（Promise 天然只收第一个 resolve）；
  // 计数归零表示双源都落定——若仍无一成功，立即 reject（每源自带超时，
  // 4~5s 内必然落定，无需再挂一个 9s 的全局兜底计时器干等）。
  const eastmoneyPromise = jsonp<SuggestResp>(
    `${SEARCH_URL}&input=${encodeURIComponent(kw)}`,
    'cb',
    EASTMONEY_TIMEOUT_MS,
  ).then((resp) => parseEastmoney(resp));

  const tencentPromise = jsonpTencent(kw);

  return new Promise<StockResult[]>((resolve, reject) => {
    let pending = 2;
    const settle = (fn: () => void) => {
      // 首个成功 resolve 后，后续成功/失败回调都不再影响结果（幂等）
      pending -= 1;
      fn();
    };
    eastmoneyPromise.then(
      (v) => settle(() => resolve(v)),
      () => settle(() => {
        if (pending === 0) reject(new Error('搜索请求超时'));
      }),
    );
    tencentPromise.then(
      (v) => settle(() => resolve(v)),
      () => settle(() => {
        if (pending === 0) reject(new Error('搜索请求超时'));
      }),
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

/** 解析 smartbox 返回的 `v_hint="sh~000001~上证指数~szzs~ZS^..."` 文本。 */
function parseTencent(text: string): StockResult[] {
  const quoted = (text || '').match(/"([^"]*)"/);
  const content = quoted ? quoted[1] : String(text || '');
  // 格式：sh~000001~上证指数~szzs~ZS^sz~000001~平安银行~payh~GP-A^...
  // 字段：market~code~name~pinyin~type —— f[0] 是 sh/sz 市场前缀，完整 symbol 要
  // 拼 f[0]+f[1]（曾把 f[0] 当 symbol，被末尾 `^[shz]{2}\d{6}$` 过滤掉 → 恒空数组）；
  // type 在 f[4]（ZS=指数 / GP-A=股票），f[3] 是拼音（szzs / payh）。
  return content
    .split('^')
    .map((seg) => seg.split('~'))
    .filter(
      (f) =>
        f.length >= 5 &&
        /^(ZS|GP-A)$/.test(f[4] || '') &&
        /^[shz]{2}$/.test(f[0] || '') &&
        /^\d{6}$/.test(f[1] || ''),
    )
    .map((f: string[]) => ({
      symbol: f[0] + f[1],
      code: f[1],
      name: f[2],
      type: f[4] === 'ZS' ? '指数' : '股票',
    }));
}

/** 腾讯 smartbox JSONP。不能复用 jsonp()：东财是服务端拿 cb 参数回填回调名再调用，
 *  而 smartbox **不认任何回调参数**，响应体是给全局变量赋值的脚本
 *  `v_hint="sz~000001~平安银行~payh~GP-A"`（非严格模式下 `v_hint="..."` 是隐式
 *  全局赋值，不会调用任何函数）。所以正确取法：加载 script，onload（此时 script
 *  已同步执行完）后读 window.v_hint 的值，读完整理现场（恢复旧值、移除 script）。 */
function jsonpTencent(keyword: string): Promise<StockResult[]> {
  return new Promise<StockResult[]>((resolve, reject) => {
    const w = window as unknown as Record<string, unknown>;
    const oldValue = w['v_hint'];
    const el = document.createElement('script');
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      w['v_hint'] = oldValue; // 还原，避免污染页面其它代码读取
      el.remove();
      fn();
    };
    const timer = window.setTimeout(() => {
      finish(() => reject(new Error('腾讯搜索超时')));
    }, TENCENT_TIMEOUT_MS);
    el.onload = () => {
      const raw = w['v_hint'];
      finish(() => resolve(parseTencent(String(raw ?? ''))));
    };
    el.onerror = () => {
      finish(() => reject(new Error('腾讯搜索失败')));
    };
    // 不拼任何回调参数：smartbox 始终给 v_hint 赋值，拼了也是白拼。
    el.src = `https://smartbox.gtimg.cn/s3/?q=${encodeURIComponent(keyword)}&t=all`;
    document.body.appendChild(el);
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
    // script 里全局回调变量名改掉，回调永远不触发）。
    // 这里把回调改成 no-op 而不是 delete：东财偶发"script 200 但执行被推迟到
    // 超时之后"（已多次线上复现），若此时已 delete，迟到的回调会抛
    // Uncaught ReferenceError（pageerror 会被测试计为真实前端报错）。改成
    // no-op 后迟到回调静默落空；resolveFn 可能已被竞速赢家 resolve，重复调用
    // 幂等，无副作用。
    w[cbName] = () => {};
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
  // 东财偶发"script 加载成功但从不执行"（宿 CDN 挂了，已多次复现：script 200、
  // 20s 无回调、不报 onerror）→ 等不到回调，5s 超时兜底切换腾讯源。
  // 这里补一层 aborted/onerror 监听兜底：不论浏览器报什么原因（含 script 加载
  // 成功但回调从未执行的静默挂起），都主动 reject，让竞速尽快落到可用源。
  // 东财本来就可能返回空结果（可解析但无匹配），所以不能只看"没回调"就当失败——
  // 一切交给上方 settle 的竞速语义裁决（谁先成功用谁）。
  el.onabort = () => {
    cleanup();
    rejectFn?.(new Error('搜索请求中止'));
  };
  el.onerror = () => {
    cleanup();
    rejectFn?.(new Error('搜索请求失败'));
  };
  document.body.appendChild(el);

  return result as Promise<T>;
}
