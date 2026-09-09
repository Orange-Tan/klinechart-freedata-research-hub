import { useState } from 'react';
import './DataResearch.css';
import {
  SOURCES,
  MARKETS,
  MARKET_SUMMARY,
  ACCESS_META,
  type DataSourceInfo,
} from './dataResearchData';
import { checkSource, type CheckResult, type CheckState } from '../data/connectivity';
import { Icon, REPLACE_MAP, type IconName } from '../components/Icon';

const ROLE_CLS: Record<DataSourceInfo['role'], string> = {
  主源: 'role-main',
  备选: 'role-backup',
  参考: 'role-ref',
  排除: 'role-ex',
};

/**
 * 状态徽标：图标 + 文案。图标统一走 Iconify（加载失败自动降级为 emoji），
 * 检测中的 spinner 图标附加 spin class 做旋转动画。
 */
function StatusLabel({ icon, spin, children }: { icon: IconName; spin?: boolean; children: string }) {
  return (
    <>
      <span className={`st-icon${spin ? ' spin' : ''}`}>
        <Icon icon={icon} height="1em" />
      </span>
      {children}
    </>
  );
}

/**
 * 是否具备可用实时行情（决定是否在表格中展示）：
 * 排除的数据源（已停服/反爬墙/需登录 cookie 等）与不含盘中/当日实时行情的源（日终/季度/缓存等）不展示。
 */
const NON_REALTIME: Set<string> = new Set([
  '无',
  '—',
  '无盘中',
  '日终更新',
  '日终',
  '季度',
  '缓存数据',
]);

function isShown(src: DataSourceInfo): boolean {
  if (src.role === '排除') return false;
  return !NON_REALTIME.has(src.realtime);
}

const shownSources = SOURCES.filter(isShown);

export function DataResearch() {
  const [results, setResults] = useState<Record<string, CheckResult>>({});
  const [running, setRunning] = useState(false);

  /** 单源检测 */
  async function runOne(src: DataSourceInfo) {
    setResults((prev) => ({ ...prev, [src.id]: { state: 'checking', detail: '检测中…' } }));
    const res = await checkSource(src);
    setResults((prev) => ({ ...prev, [src.id]: res }));
  }

  /** 一键检测：并发出全部可检测源 */
  async function runAll() {
    if (running) return;
    setRunning(true);
    const checkable = shownSources.filter((s) => s.checkUrl);
    // 先统一置为 checking
    setResults((prev) => {
      const next = { ...prev };
      for (const s of checkable) next[s.id] = { state: 'checking', detail: '检测中…' };
      return next;
    });
    await Promise.allSettled(checkable.map((s) => runOne(s)));
    setRunning(false);
  }

  return (
    <div className="report">
      <header className="report-header dresearch-header">
        <div className="dresearch-head-row">
          <div>
            <h1>数据源调研</h1>
            <p className="report-sub">
              五大类免费行情数据源 · 按品种分类 · 数据来源全网收集，更新日期 2026-09
            </p>
          </div>
          <button
            type="button"
            className="dresearch-runall"
            onClick={runAll}
            disabled={running}
            title="并发检测全部可直连数据源"
          >
            {running ? (
              <StatusLabel icon={REPLACE_MAP['检测中']} spin>
                检测中…
              </StatusLabel>
            ) : (
              <StatusLabel icon={REPLACE_MAP['一键检测']}>一键检测全部</StatusLabel>
            )}
          </button>
        </div>
        <div className="dresearch-legend">
          <span className="st-checking">
            <StatusLabel icon={REPLACE_MAP['检测中']} spin>
              检测中
            </StatusLabel>
          </span>
          <span className="st-ok">
            <StatusLabel icon={REPLACE_MAP['连通']}>连通</StatusLabel>
          </span>
          <span className="st-fail">
            <StatusLabel icon={REPLACE_MAP['失败']}>被拦截 / 失败</StatusLabel>
          </span>
          <span className="st-na">— 浏览器不可直连</span>
          <span className="legend-split" />
          <span className="ab-direct">直连</span>
          <span className="ab-vpn">
            <StatusLabel icon={REPLACE_MAP['需外网']}>需外网</StatusLabel>
          </span>
          <span className="ab-proxy">
            <StatusLabel icon={REPLACE_MAP['需代理']}>需代理</StatusLabel>
          </span>
          <span className="ab-jsonp">JSONP</span>
          <span className="ab-key">
            <StatusLabel icon={REPLACE_MAP['需Key']}>需Key</StatusLabel>
          </span>
          <span className="ab-server">服务端</span>
          <span className="legend-note">检测结果只说明“能不能从本机浏览器连到”，不代替真实取数验证</span>
        </div>
      </header>

      <div className="report-body dresearch-body">
        {MARKETS.map((m, idx) => (
          <MarketSection
            key={m.id}
            market={m}
            index={idx + 1}
            results={results}
            onCheck={runOne}
          />
        ))}
      </div>
    </div>
  );
}

function MarketSection({
  market,
  index,
  results,
  onCheck,
}: {
  market: (typeof MARKETS)[number];
  index: number;
  results: Record<string, CheckResult>;
  onCheck: (src: DataSourceInfo) => void;
}) {
  const list = shownSources.filter((s) => s.market === market.id);
  const summary = MARKET_SUMMARY[market.id];
  return (
    <section className="report-section dresearch-section" data-market={market.id}>
      <h2>
        <span className="dresearch-market-icon">
          <Icon icon={market.icon} height="1.1em" />
        </span>
        {index}、{market.label}市场 <span className="dresearch-count">{list.length} 个数据源</span>
      </h2>
      <p className="dresearch-market-desc">
        {market.desc} · 首选 <strong>{summary.primary}</strong>，备选 {summary.backup}（{summary.note}）
      </p>
      <div className="table-wrap">
        <table className="report-table dresearch-table">
          <thead>
            <tr>
              <th>#</th>
              <th>数据源</th>
              <th>历史行情</th>
              <th>实时性</th>
              <th>数据类型</th>
              <th>限制/注意</th>
              <th>使用条件</th>
              <th>连通性</th>
            </tr>
          </thead>
          <tbody>
            {list
              .map((s, i) => ({ s, i }))
              // 无历史 K 线（history 以「无历史」开头）的源排到末尾，保持注册表内的相对顺序
              .sort((a, b) => Number(a.s.history.startsWith('无历史')) - Number(b.s.history.startsWith('无历史')))
              .map(({ s, i }) => {
                const r = results[s.id];
                return (
                  <tr key={s.id}>
                    <td className="dresearch-rank">
                      <span className="dresearch-no">{i + 1}</span>
                    </td>
                    <td className="dresearch-name">
                      <strong>
                        {s.url ? (
                          <a
                            className="dresearch-name-link"
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            title={s.url}
                          >
                            {s.name}
                          </a>
                        ) : (
                          s.name
                        )}
                      </strong>
                      <span className={`dresearch-role ${ROLE_CLS[s.role]}`}>{s.role}</span>
                      {s.accessNote && <p className="dresearch-accessnote">{s.accessNote}</p>}
                    </td>
                    <td>{s.history}</td>
                    <td>{s.realtime}</td>
                    <td className="dresearch-types">{s.types.join(' · ')}</td>
                    <td className="dresearch-limits">{s.limits}</td>
                    <td className="dresearch-access">
                      <div className="dresearch-tags">
                        {s.access.length === 0 && <span className="ab-none">不适用</span>}
                        {s.access.map((a) => (
                          <span
                            key={a}
                            className={`ab ${ACCESS_META[a].cls}`}
                            title={ACCESS_META[a].title}
                          >
                            {ACCESS_META[a].icon && (
                              <span className="ab-icon">
                                <Icon icon={ACCESS_META[a].icon} height="1em" />
                              </span>
                            )}
                            {ACCESS_META[a].label}
                          </span>
                        ))}
                      </div>
                      {s.reason && <p className="dresearch-reason">{s.reason}</p>}
                    </td>
                    <td>
                      <CheckCell src={s} r={r} onCheck={onCheck} />
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CheckCell({
  src,
  r,
  onCheck,
}: {
  src: DataSourceInfo;
  r?: CheckResult;
  onCheck: (src: DataSourceInfo) => void;
}) {
  const noUrl = !src.checkUrl;
  if (noUrl) {
    return (
      <div className="check-cell" data-state="na">
        <span className="st na">— 不可直连</span>
        <span className="check-note">{src.checkNote}</span>
      </div>
    );
  }
  const state: CheckState = r?.state ?? 'idle';
  return (
    <div className="check-cell" data-state={state}>
      {state === 'idle' && <span className="st idle">未检测</span>}
      {state === 'checking' && (
        <span className="st checking">
          <StatusLabel icon={REPLACE_MAP['检测中']} spin>
            检测中
          </StatusLabel>
        </span>
      )}
      {state === 'ok' && (
        <span className="st ok">
          <StatusLabel icon={REPLACE_MAP['连通']}>连通</StatusLabel>
        </span>
      )}
      {state === 'fail' && (
        <span className="st fail">
          <StatusLabel icon={REPLACE_MAP['失败']}>失败</StatusLabel>
        </span>
      )}
      <button
        type="button"
        className="check-btn"
        disabled={state === 'checking'}
        onClick={() => onCheck(src)}
      >
        {state === 'checking' ? '检测中' : '检测'}
      </button>
      {r?.detail && <span className="check-detail">{r.detail}</span>}
    </div>
  );
}
