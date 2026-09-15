import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dashboard } from './pages/Dashboard';
import { ResearchReport } from './pages/ResearchReport';
import { DataResearch } from './pages/DataResearch';
import { LightweightShowcase } from './pages/LightweightShowcase';
import { KlinechartsShowcase } from './pages/KlinechartsShowcase';
import { Icon, iconOf } from './components/Icon';
import {
  DEFAULT_CHART_VIEW,
  loadChartViewState,
  resolvePeriod,
  saveChartViewState,
  type ChartViewState,
} from './state/chartView';

type PageId = 'dashboard' | 'report' | 'data' | 'lightweight' | 'klinecharts';

/**
 * 侧边栏快速切换的五个页面。
 * 切页时对应组件会卸载/重挂载：对比看板回到后台就停止 Binance 轮询订阅，
 * 再切回来重新拉取（数据新鲜且不浪费请求）。
 * 两个单库详页（lightweight/klinecharts）同为数据驱动大图页，切页同样重新拉取。
 * 图标统一走本地打包的 Phosphor 图标（REPLACE_MAP 里维护中文标签 → 图标名映射）。
 */
const PAGES = [
  { id: 'dashboard', label: '多图对比', icon: iconOf('多图对比'), Comp: Dashboard },
  { id: 'report', label: '图表调研', icon: iconOf('图表调研'), Comp: ResearchReport },
  { id: 'data', label: '数据调研', icon: iconOf('数据调研'), Comp: DataResearch },
  { id: 'lightweight', label: '轻量库详情', icon: iconOf('轻量库详情'), Comp: LightweightShowcase },
  { id: 'klinecharts', label: 'K线库详情', icon: iconOf('K线库详情'), Comp: KlinechartsShowcase },
] as const;

/** 展开/折叠切换图标：按当前状态取对应图标 */
const SIDEBAR_TOGGLE_ICON = (open: boolean) => (open ? iconOf('侧栏收起') : iconOf('侧栏展开'));

export default function App() {
  // 看板/两个详页共用的筛选状态（数据源/标的/周期/实时/根数），全局持有：
  // 组件卸载（切页）再挂载时从 localStorage 恢复，不退回默认腾讯财经。
  const [chartView, setChartView] = useState<ChartViewState>(() => {
    const loaded = loadChartViewState();
    if (!loaded) return DEFAULT_CHART_VIEW;
    // 仅在恢复存档时归一化：周期若在存档后已不再支持（如该源删过周期），
    // 回退到该源首个支持周期，避免把非法值下传给页面导致 select 失配或拉取失败。
    // 会话中不做响应式钳制，否则用户/测试选中的值会被悄悄改回去。
    // 标的不做取值校验：搜索选中的标的（不在源固定下拉里）同样合法，
    // 无效代码会在 fetchKlines 阶段如实报错，由页面错误面板呈现。
    const period = resolvePeriod(loaded);
    if (period === loaded.period) return loaded;
    return { ...loaded, period };
  });
  // 选项变更时同步写 localStorage（值随渲染一并更新，切页后即可恢复）
  useEffect(() => {
    saveChartViewState(chartView);
  }, [chartView]);

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
          <Icon icon={SIDEBAR_TOGGLE_ICON(sidebarOpen)} height="1em" />
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
              <span className="sidebar-icon">
                <Icon icon={icon} height="1em" />
              </span>
              <span className="sidebar-label">{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">数据源：腾讯财经 / 东方财富 / Binance / Twelve Data / Yahoo Finance</div>
      </aside>
      <div className="main">
        {page === 'dashboard' ? (
          <Dashboard chartView={chartView} onChartViewChange={setChartView} />
        ) : page === 'report' ? (
          <ResearchReport />
        ) : page === 'data' ? (
          <DataResearch />
        ) : page === 'lightweight' ? (
          <LightweightShowcase chartView={chartView} onChartViewChange={setChartView} />
        ) : (
          <KlinechartsShowcase chartView={chartView} onChartViewChange={setChartView} />
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
