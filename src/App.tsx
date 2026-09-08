import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dashboard } from './pages/Dashboard';
import { ResearchReport } from './pages/ResearchReport';
import { DataResearch } from './pages/DataResearch';

type PageId = 'dashboard' | 'report' | 'data';

/**
 * 侧边栏快速切换的三个页面。
 * 切页时对应组件会卸载/重挂载：对比看板回到后台就停止 Binance 轮询订阅，
 * 再切回来重新拉取（数据新鲜且不浪费请求）。
 */
const PAGES = [
  { id: 'dashboard', label: '多图对比', icon: '📊', Comp: Dashboard },
  { id: 'report', label: '图表调研', icon: '📖', Comp: ResearchReport },
  { id: 'data', label: '数据调研', icon: '📡', Comp: DataResearch },
] as const;

export default function App() {
  const [page, setPage] = useState<PageId>('dashboard');
  // 侧边栏展开/折叠（默认折叠；折叠后只显示图标，给图表区让出更多宽度）
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 折叠态悬浮提示：悬浮 1s 后显示页面名。
  // 用真实 DOM 元素（portal 到 body + fixed + 高 z-index）而不是 CSS ::after：
  // 图表库的 canvas 自带 position:absolute + z-index:1/2，伪元素实测会被盖住
  // 画不出来（elementFromPoint 命中的是 canvas），真实 DOM 元素实测可盖过。
  const [tip, setTip] = useState<{ label: string; left: number; top: number } | null>(null);
  const tipTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (tipTimerRef.current !== null) window.clearTimeout(tipTimerRef.current);
    },
    [],
  );

  const showTip = (label: string, el: HTMLElement) => {
    if (sidebarOpen) return; // 展开态文字本来就显示，不需要提示
    if (tipTimerRef.current !== null) window.clearTimeout(tipTimerRef.current);
    tipTimerRef.current = window.setTimeout(() => {
      tipTimerRef.current = null;
      // 到 1s 真正要显示时再量一次位置，避免延迟期间布局变化导致气泡错位
      const r = el.getBoundingClientRect();
      setTip({ label, left: r.right + 8, top: r.top + r.height / 2 });
    }, 1000);
  };

  const hideTip = () => {
    if (tipTimerRef.current !== null) window.clearTimeout(tipTimerRef.current);
    tipTimerRef.current = null;
    setTip(null);
  };

  return (
    <div className="app">
      <aside className={`sidebar${sidebarOpen ? ' open' : ' collapsed'}`}>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={() => {
            setSidebarOpen((v) => !v);
            hideTip();
          }}
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
              onMouseEnter={(e) => showTip(label, e.currentTarget)}
              onMouseLeave={hideTip}
            >
              <span className="sidebar-icon">{icon}</span>
              <span className="sidebar-label">{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">数据源：腾讯财经 / 东方财富 / 通达信 / Binance</div>
      </aside>
      <div className="main">
        {page === 'dashboard' ? (
          <Dashboard />
        ) : page === 'report' ? (
          <ResearchReport />
        ) : (
          <DataResearch />
        )}
      </div>
      {/* 悬浮提示：portal 到 body，fixed 定位 + 99999，盖过右侧图表 canvas */}
      {tip &&
        createPortal(
          <div
            className="sidebar-tooltip"
            style={{ left: tip.left, top: tip.top }}
            role="tooltip"
          >
            {tip.label}
          </div>,
          document.body,
        )}
    </div>
  );
}
