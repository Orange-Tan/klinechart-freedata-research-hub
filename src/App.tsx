import { useState } from 'react';
import { Dashboard } from './pages/Dashboard';
import { ResearchReport } from './pages/ResearchReport';

type PageId = 'dashboard' | 'report';

/**
 * 侧边栏快速切换的两个页面。
 * 切页时对应组件会卸载/重挂载：对比看板回到后台就停止 Binance 轮询订阅，
 * 再切回来重新拉取（数据新鲜且不浪费请求）。
 */
const PAGES = [
  { id: 'dashboard', label: '图表快速对比', icon: '📊', Comp: Dashboard },
  { id: 'report', label: '图表库调研报告', icon: '📖', Comp: ResearchReport },
] as const;

export default function App() {
  const [page, setPage] = useState<PageId>('dashboard');

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-title">
          <span className="sidebar-logo">📈</span>
          <div>
            <h1>K 线图开源库综合对比</h1>
            <p>4 库同源实时对比平台</p>
          </div>
        </div>
        <nav className="sidebar-nav">
          {PAGES.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              className={`sidebar-item${page === id ? ' active' : ''}`}
              onClick={() => setPage(id)}
            >
              <span className="sidebar-icon">{icon}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">数据源：Binance 公开 API</div>
      </aside>
      <main className="main">
        {page === 'dashboard' ? <Dashboard /> : <ResearchReport />}
      </main>
    </div>
  );
}
