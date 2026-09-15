import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import https from 'node:https'
import type { IncomingMessage, ServerResponse } from 'node:http'

// 东财 push2his kline 的「good pool」源站 IP（阿里云 ALISOFT）。
// 本机 DNS 把 push2his 解析到 trafficmanager.cn 的坏池（响应直接 reset，Empty reply），
// 只有直连这三个 IP 且保持 Host/SNI = push2his 才能拿到数据（2026-09 实测确认）。
// 详见 src/data/eastmoney.ts 顶部注释。
const EASTMONEY_GOOD_IPS = ['120.79.191.232', '119.3.232.150', '120.76.218.228']
const EASTMONEY_HOST = 'push2his.eastmoney.com'

// /push2his → 东财 kline 转发中间件。Vite 自带 http-proxy 无法控制 SNI（Node 对 IP
// 目标不发 SNI，东财按 IP 走默认证书），所以用自定义中间件复刻已实测通过的直连配方：
// 连 good IP 时显式 servername: EASTMONEY_HOST 完成握手，Host 头保持源域名不变。
function eastmoneyProxyMiddleware() {
  let ipIndex = 0
  const toIp = () => EASTMONEY_GOOD_IPS[ipIndex++ % EASTMONEY_GOOD_IPS.length]

  return (req: IncomingMessage, res: ServerResponse) => {
    const targetPath = req.url ?? '/'
    let retried = false

    const attempt = () => {
      // 每轮尝试换一个 IP（坏池之外还有个别阿里云 IP 也 reset，轮换 + 重试兜底）
      const ip = toIp()
      const upstream = https.request(
        {
          hostname: ip,
          port: 443,
          servername: EASTMONEY_HOST, // 显式 SNI：取到 push2his 的源站证书链
          // dev-only：好池 IP 是硬编码白名单（本机实测），目标 IP 无该 hostname 证书，
          // 故跳过验签。仅存在于 dev server 中间件，不进入生产构建，无安全影响。
          rejectUnauthorized: false,
          method: req.method ?? 'GET',
          path: targetPath,
          headers: { ...req.headers, host: EASTMONEY_HOST },
        },
        (up) => {
          if (up.statusCode && up.statusCode >= 500 && up.statusCode <= 599 && !retried) {
            // 5xx：换 IP 重试一次（东财坏池会返回 502）
            up.resume()
            retried = true
            attempt()
            return
          }
          res.writeHead(up.statusCode ?? 502, up.headers)
          up.pipe(res)
        },
      )
      // 上游一旦失败（TLS 握手失败、连接被 reset 等），http-proxy 语义是：若还没
      // 写响应头，就回 502；若已经 writeHead（比如刚发完响应头就断流），writeHead
      // 会抛 ERR_HTTP_HEADERS_SENT 把 dev server 整个打崩（已多次复现：Node 进程
      // 直接退出，5173 掉线，浏览器净 poll 全部 ERR_CONNECTION_REFUSED）。这里在
      // 回调内重试或兜底写 502，都必须先检查 res.headersSent。
      upstream.on('error', (err) => {
        if (!retried) {
          retried = true
          attempt()
          return
        }
        if (res.headersSent) {
          res.destroy()
          return
        }
        res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
        res.end(`东财代理错误：${err.message}`)
      })
      upstream.setTimeout(10_000, () => {
        upstream.destroy(new Error('upstream timeout'))
      })
      req.pipe(upstream)
    }

    attempt()
  }
}

// dev-only 插件：把 /push2his 前缀的请求挂到 Vite 内部中间件栈的最前
// （base 之前，不经过 SPA fallback / 静态服务），转发给东财 good IP。
function eastmoneyProxy(): Plugin {
  const middleware = eastmoneyProxyMiddleware()
  return {
    name: 'vite:eastmoney-proxy',
    configureServer(server) {
      server.middlewares.use('/push2his', (req, res) => {
        middleware(req, res)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), eastmoneyProxy()],
  // dev 代理：让「无 CORS 头 / 大陆不可达」的数据源在开发环境也能被连通性检测打到，
  // 走 Vite dev server 转发即可绕过浏览器 CORS。生产构建（vite build）不带 proxy，
  // 这类源在生产里检测会如实失败，使用条件徽标里已注明需代理。
  server: {
    proxy: {
      // /yh 同时服务于两处：连通性检测（connectivity.ts 的 resolveCheckUrl 把 Yahoo
      // checkUrl 换成 /yh 路径）与 Yahoo 适配器在 dev 下的 fetchKlines（yahoo.ts 同样
      // 拼 /yh 前缀）。生产构建无代理，该源会如实失败。
      '/yh': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/yh/, ''),
      },
      '/kr': {
        target: 'https://api.kraken.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/kr/, ''),
      },
      '/ttjj': {
        target: 'https://api.fund.eastmoney.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ttjj/, ''),
      },
      '/shfe': {
        target: 'https://www.shfe.com.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/shfe/, ''),
      },
    },
  },
})
