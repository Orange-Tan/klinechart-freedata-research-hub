import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // dev 代理：让「无 CORS 头 / 大陆不可达」的数据源在开发环境也能被连通性检测打到，
  // 走 Vite dev server 转发即可绕过浏览器 CORS。生产构建（vite build）不带 proxy，
  // 这类源在生产里检测会如实失败，使用条件徽标里已注明需代理。
  server: {
    proxy: {
      // 仅探活用（GET /ping）；真实 K 线取数时走 /yh/v8/...，由后端 BFF 负责更稳
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
