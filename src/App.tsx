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
  { id: 'dashboard', label: '多图对比', icon: '📊', Comp: Dashboard },
  { id: 'report', label: '图表调研', icon: '📖', Comp: ResearchReport },
] as const;

export default function App() {
  const [page, setPage] = useState<PageId>('dashboard');
  // 侧边栏展开/折叠（默认展开；折叠后只显示图标，给图表区让出更多宽度）
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="app">
      <aside className={`sidebar${sidebarOpen ? ' open' : ' collapsed'}`}>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={() => setSidebarOpen((v) => !v)}
          title={sidebarOpen ? '收起侧边栏' : '展开侧边栏'}
        >
          <span>{sidebarOpen ? '«' : '»'}</span>
        </button>
        <nav className="sidebar-nav">
          {PAGES.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              className={`sidebar-item${page === id ? ' active' : ''}`}
              onClick={() => setPage(id)}
            >
              <span className="sidebar-icon">{icon}</span>
              <span className="sidebar-label">{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">数据源：Binance 公开 API</div>
      </aside>
      <div className="main">
        {page === 'dashboard' ? <Dashboard /> : <ResearchReport />}
      </div>
    </div>
  );
}
