import './ResearchReport.css';

/** 首批 4 库徽标配色 */
const ACCENTS = ['#26a69a', '#7aa2f7', '#f7768e', '#e0af68'] as const;

/** 候选库总览表数据（与 docs/图表库调研报告.md 保持一致） */
const CANDIDATES = [
  {
    name: 'lightweight-charts',
    org: 'TradingView',
    lang: 'TypeScript',
    stars: '17.2k',
    license: 'Apache-2.0',
    render: 'Canvas',
    size: '很小(~45kb)',
    maintain: '🟢 活跃',
    tag: '首选',
    accent: ACCENTS[0],
  },
  {
    name: 'KLineChart',
    org: 'liihuu(klinecharts)',
    lang: 'TypeScript',
    stars: '4.1k',
    license: 'Apache-2.0',
    render: 'Canvas',
    size: '~40kb(gzip)',
    maintain: '🟢 活跃',
    tag: '开箱即用',
    accent: ACCENTS[1],
  },
  {
    name: 'HQChart',
    org: 'jones2000',
    lang: 'JavaScript',
    stars: '3.4k',
    license: 'Apache-2.0',
    render: 'Canvas',
    size: '中等',
    maintain: '🟢 活跃',
    tag: '多市场',
    accent: ACCENTS[2],
  },
  {
    name: 'Apache ECharts',
    org: 'Apache 基金会',
    lang: 'TypeScript',
    stars: '67.3k',
    license: 'Apache-2.0',
    render: 'Canvas+SVG',
    size: '~300kb+',
    maintain: '🟢 活跃',
    tag: '全能对照',
    accent: ACCENTS[3],
  },
];

/** 其他值得关注的库（与 docs/图表库调研报告.md 保持一致） */
const OTHERS = [
  {
    name: 'uPlot',
    org: 'leeoniya',
    stars: '10.5k',
    license: 'MIT',
    render: 'Canvas',
    size: '~55kb(gzip)',
    maintain: '🟢 活跃',
    desc: '官方定位"极致性能的极简时序图库"，宣称比同类快 10 倍：同一份数据 150k 点仍能 60fps 渲染，gzip 仅 ~55kb、零依赖。只做绘图引擎（不含指标/画线/交互组件），常被当作"底图"叠加自定义图层。',
    fit: '超大数据量时序、监控面板、需要极速刷新的看板',
    warn: false,
  },
  {
    name: 'Plotly.js',
    org: 'Plotly',
    stars: '18.3k',
    license: 'MIT',
    render: 'SVG+WebGL',
    size: '~400kb',
    maintain: '🟢 活跃',
    desc: '科学计算与交互图表之王，WebGL 加速可渲染百万级数据点，与 Python 的 Plotly / Dash 生态无缝互通（同一份配置前后端复用）。图表种类覆盖 3D/等高线/科学可视化，但包体积 ~400kb 偏大，K 线金融交互细节一般。',
    fit: '科学/金融研究绘图、Python 生态配合的量化研究平台',
    warn: false,
  },
  {
    name: 'ApexCharts',
    org: 'ApexCharts',
    stars: '15.1k',
    license: 'MIT(带条件)',
    render: 'SVG',
    size: '~200kb',
    maintain: '🟢 活跃',
    desc: 'SVG 渲染、UI 精美的通用图表库，图表类型丰富、上手快，内置主题与响应式适配。虽然仓库标注 MIT，但 SPDX 标识为"NOASSERTION"，实际是付费商用的变体，商用需购买授权。',
    fit: '业务仪表盘、后台管理系统',
    warn: true,
  },
  {
    name: 'trading-vue-js',
    org: 'tvjsx',
    stars: '2.3k',
    license: 'MIT',
    render: 'Canvas',
    size: '中等',
    maintain: '🔴 停更(2024)',
    desc: 'Vue 3 交易图表库，数据层与渲染层分离，支持叠加任意自定义图层（指标/事件/订单标记），可深度 hack 交易界面。但 2024 年起停止维护，且只适配 Vue 技术栈，仅作参考。',
    fit: 'Vue 技术栈做自定义交易界面的参考实现',
    warn: true,
  },
  {
    name: 'TradingView charting-library',
    org: 'TradingView',
    stars: '—',
    license: '商用授权',
    render: 'Canvas',
    size: '大',
    maintain: '🟢 商业产品',
    desc: 'TradingView 官方收费图库，专业交易终端级功能天花板：内置上百种指标、画线、多周期联动、研究面板、深度移动端适配等开箱即用。完全闭源、按席位收费（自托管版），免费版需保留 TradingView 品牌且功能受限。',
    fit: '预算充足的专业交易终端 / 券商产品',
    warn: true,
  },
  {
    name: 'Highcharts',
    org: 'Highsoft',
    stars: '12.5k',
    license: '商用授权',
    render: 'SVG',
    size: '大',
    maintain: '🟢 商业产品',
    desc: '老牌图表库（highcharts.com 同源），SVG 渲染兼容性极好、文档与官方示例是业界标杆，另有 Highstock 专门做金融 K 线/OHLC。source-available 协议：非商用免费，商用需购买授权（数百美元级）。',
    fit: '需要成熟文档与兼容性的商用产品（需购买授权）',
    warn: true,
  },
];

/** 功能矩阵对比列：四大库 + 补充对比的 uPlot / Plotly */
const MATRIX_COLS = [
  ...CANDIDATES.map((c) => ({ name: c.name, accent: c.accent })),
  { name: 'uPlot', accent: '#c0a5e0' },
  { name: 'Plotly.js', accent: '#4fc1e9' },
];

/** 功能矩阵对比 */
const MATRIX: { label: string; values: [string, string, string, string, string, string]; dim?: boolean }[] = [
  { label: '开箱即用技术指标', values: ['❌ 需插件', '✅ 20+ 内置', '✅ 通达信/麦语言', '❌ 需实现', '❌ 需自建', '❌ 需实现'] },
  { label: '画线工具', values: ['❌ 需插件', '✅', '✅', '❌ 需实现', '❌ 需自建', '❌ 需实现'] },
  { label: '周期切换', values: ['✅', '✅', '✅', '需实现', '❌ 需自建', '❌ 需自建'] },
  { label: '十字光标', values: ['✅', '✅', '✅', '⚠️ 弱', '❌ 需自建', '⚠️ 弱'] },
  { label: '缩放/平移', values: ['✅ 顺滑', '✅', '✅', '⚠️ 一般', '⚠️ 需插件', '✅ 顺滑'] },
  { label: '移动端适配', values: ['⚠️ 一般', '✅ 强', '✅ 小程序支持', '⚠️ 一般', '⚠️ 一般', '⚠️ 一般'] },
  { label: '多市场(股票/期货/币)', values: ['⚠️ 需数据源', '✅', '✅ 最强', '⚠️ 通用', '⚠️ 需数据源', '⚠️ 需数据源'] },
  { label: '中文文档', values: ['⚠️ 一般', '✅', '✅', '✅', '❌ 英文', '✅'] },
  { label: '扩展性', values: ['✅ v5 插件体系', '✅ 注册式', '✅ 数据替换接口', '✅ 系列扩展', '✅ 插件+hook', '✅ 高度可配置'] },
  { label: '大数据性能', values: ['优', '优', '良', '优(大数据时降级)', '极优', '优(WebGL)'] },
];

/** 结论先行 —— 技术路线建议 */
const PICKS = [
  {
    lib: 'lightweight-charts',
    role: '主库 · 常驻多图主轴',
    why: '金融图表的数据/交互规范事实标准，性能与体积最适合大型看板常驻多图场景；大看板最怕"图一多就卡"，它的 Canvas + 零依赖设计最稳。',
  },
  {
    lib: 'KLineChart',
    role: '功能补充 · 开箱即用',
    why: '需要开箱即用的指标、画线、移动端时直接换适配器即可，零成本横向对比。',
  },
  {
    lib: 'ECharts',
    role: '兜底 · 通用图表',
    why: '看板上不可避免还有折线/饼图/仪表盘等业务图表，用 ECharts 一个库解决，避免每个需求引一个新库。',
  },
  {
    lib: 'HQChart',
    role: '按市场定 · A股/期货必入',
    why: '目标市场是 A 股/港股/期货时必入（通达信脚本、筹码图独有）；纯加密/海外场景可暂缓。',
  },
];

/** 落地要点 */
const POINTS = [
  '每个库一个独立 React 组件，props 收敛到 { series: OHLCV[], options: Partial<T> }',
  '数据源用统一 fetchKlines() 接口，返回标准 OHLCV，内部缓存 + 增量更新',
  '实时刷新用 WebSocket，数据层统一推送到各图表的适配器',
  '主题令牌（token）化，四库共用一套配色变量，保证看板视觉一致',
  '看板级性能：虚拟化渲染可见区、节流重绘、图表实例复用',
];

export function ResearchReport() {
  return (
    <div className="report">
      <header className="report-header">
        <div>
          <h1>图表库调研报告</h1>
          <p className="report-sub">
            调研日期 2026-09-07 · 数据来源：GitHub API（stars / 协议 / 活跃度）、各仓库官方 README
          </p>
        </div>
      </header>

      <div className="report-body">
        <section className="report-section">
          <h2>一、候选库总览</h2>
          <div className="table-wrap">
            <table className="report-table">
              <thead>
                <tr>
                  <th>库</th>
                  <th>作者/组织</th>
                  <th>语言</th>
                  <th>Stars</th>
                  <th>协议</th>
                  <th>渲染</th>
                  <th>包体积</th>
                  <th>维护</th>
                </tr>
              </thead>
              <tbody>
                {CANDIDATES.map((c) => (
                  <tr key={c.name}>
                    <td className="lib-cell">
                      <span className="lib-dot" style={{ background: c.accent }} />
                      <strong>{c.name}</strong>
                      <em className="lib-tag">{c.tag}</em>
                    </td>
                    <td>{c.org}</td>
                    <td>{c.lang}</td>
                    <td>{c.stars}</td>
                    <td>
                      <span className="license">{c.license}</span>
                    </td>
                    <td>{c.render}</td>
                    <td>{c.size}</td>
                    <td>{c.maintain}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="notice">
            <strong>⚠️ 协议提示：</strong>
            Apache-2.0 全部可自由商用；uPlot/Plotly（体积大）MIT 自由商用；ApexCharts 的
            “NOASSERTION” 协议实际是付费商用的变体；Highcharts 是 source-available 需购买授权；
            charting-library 完全闭源商用。本项目自用对比不受影响，但商用大型看板必须避开后三者。
          </div>
        </section>

        <section className="report-section">
          <h2>二、四大候选库详细对比（首批接入）</h2>
          <div className="detail-grid">
            {CANDIDATES.map((c, i) => (
              <article className="detail-card" key={c.name}>
                <h3>
                  <span className="lib-dot" style={{ background: c.accent }} />
                  {i + 1}. {c.name}
                  <em>{c.tag}</em>
                </h3>
                <p className="detail-stars">
                  ★ {c.stars} · {c.org}
                </p>
                {c.name === 'lightweight-charts' && (
                  <p className="detail-quote">行业事实标准，金融图表的“教科书”级实现。</p>
                )}
                {c.name === 'KLineChart' && (
                  <p className="detail-quote">中文生态最优秀的轻量 K 线库，“零依赖 + 开箱即用”。</p>
                )}
                {c.name === 'HQChart' && (
                  <p className="detail-quote">国内老牌多市场 K 线图库，覆盖 A股/港股/美股/期货/数字货币。</p>
                )}
                {c.name === 'Apache ECharts' && (
                  <p className="detail-quote">通用图表库之王，K 线只是其上百种图表之一。</p>
                )}
                <div className="pros-cons">
                  <div className="pros">
                    <h4>优点</h4>
                    <ul>
                      {PROS[i].map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="cons">
                    <h4>缺点</h4>
                    <ul>
                      {CONS[i].map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <p className="detail-fit">
                  <strong>最适合</strong>：{FITS[i]}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="report-section">
          <h2>三、其他值得关注的库</h2>
          <div className="table-wrap">
            <table className="report-table">
              <thead>
                <tr>
                  <th>库</th>
                  <th>作者/组织</th>
                  <th>Stars</th>
                  <th>协议</th>
                  <th>渲染</th>
                  <th>包体积</th>
                  <th>维护</th>
                  <th>详细介绍</th>
                </tr>
              </thead>
              <tbody>
                {OTHERS.map((o) => (
                  <tr key={o.name}>
                    <td>
                      <strong>{o.name}</strong>
                    </td>
                    <td>{o.org}</td>
                    <td>{o.stars}</td>
                    <td>
                      <span className="license">{o.license}</span>
                      {o.warn && <span className="warn-tag">⚠️ 商用注意</span>}
                    </td>
                    <td>{o.render}</td>
                    <td>{o.size}</td>
                    <td>{o.maintain}</td>
                    <td>
                      <p className="others-desc">{o.desc}</p>
                      <p className="others-fit">
                        <strong>最适合</strong>：{o.fit}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="report-section">
          <h2>四、功能矩阵对比</h2>
          <div className="table-wrap">
            <table className="report-table matrix-table">
              <thead>
                <tr>
                  <th>能力</th>
                  {MATRIX_COLS.map((c) => (
                    <th key={c.name}>
                      <span className="lib-dot" style={{ background: c.accent }} />
                      {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MATRIX.map((row) => (
                  <tr key={row.label}>
                    <td className="matrix-label">{row.label}</td>
                    {row.values.map((v, i) => (
                      <td key={i}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="report-section">
          <h2>五、适合大型看板软件的技术路线建议</h2>
          <div className="conclusion-banner">主库选 lightweight-charts，辅以 KLineChart 作功能补充，ECharts 兜底通用图表。</div>
          <div className="pick-list">
            {PICKS.map((p, i) => (
              <div className="pick-item" key={p.lib}>
                <span className="pick-num">{i + 1}</span>
                <div className="pick-main">
                  <div className="pick-head">
                    <strong>{p.lib}</strong>
                    <span className="pick-role">{p.role}</span>
                  </div>
                  <p>{p.why}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="layer-diagram">
            <h4>分层架构</h4>
            <div className="layer">
              <div className="layer-name">对比壳层 UI</div>
              <div className="layer-detail">看板布局 / 主题 / 指标切换 / 数据源切换 / 交互</div>
            </div>
            <div className="layer">
              <div className="layer-name">图表适配层 (React 组件封装)</div>
              <div className="layer-detail">LW 适配器 │ KLine 适配器 │ ECharts 适配器 · 统一 props: {'{ series, options }'}</div>
            </div>
            <div className="layer">
              <div className="layer-name">数据源适配层 (统一 OHLCV 接口)</div>
              <div className="layer-detail">Binance │ 交易所聚合 │ 自建模拟 │ 未来扩展</div>
            </div>
            <div className="layer layer-base">
              <div className="layer-name">协议: 标准 OHLCV</div>
              <div className="layer-detail">{'{ time, open, high, low, close, volume }'}</div>
            </div>
          </div>

          <h4 className="points-head">落地要点</h4>
          <ul className="points-list">
            {POINTS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

/** 四大库优/缺点与最适合（与文档一一对应） */
const PROS: string[][] = [
  [
    '专业金融图表范式：时间戳索引、OHLCV series 体系、数量缩放、平移/缩放、十字光标、价格刻度',
    '极小的包体、零依赖，启动/渲染性能一流',
    'v5 插件体系成熟（自定义指标、画笔、叠加层），官方给出交互式插件示例',
    '数据接入规范清晰，是各数据源适配的最佳“规范定义者”',
    '声明式 API 直观，学习成本低',
    '社区庞大，React/Vue/Svelte 封装齐全',
  ],
  [
    '开箱即用：内置 20+ 技术指标（MA/BOLL/MACD/KDJ…）、画线工具、周期切换',
    '零第三方依赖，gzip 后仅 ~40kb，移动端友好',
    '中文文档完善，类型定义完整（TypeScript）',
    '富样式配置与 API，可扩展性强（可注册自定义指标/图形）',
    '周期/指标/画线一键切换，功能覆盖完整',
  ],
  [
    '多市场覆盖：沪深/港股/数字货币/期货/美股',
    '通达信语法、麦语言指标脚本支持（对量化人群友好）',
    '内置画图工具、截图、筹码图、走势图、十字光标',
    '第 3 方数据替换接口，易接入国内数据源（如 tushare）',
    'H5 + 微信小程序双端支持',
    '国内行情/交易习惯理解最深',
  ],
  [
    '67.3k★，生态/社区/文档(中英) 一流，Apache 基金会背书',
    '一套库通吃所有图表（K线/折线/饼图/仪表盘/地图…），大型看板可能一个库全覆盖',
    'Canvas + SVG 双渲染；大数据量性能优秀',
    '声明式 option 配置 + 事件体系，主题定制能力强',
  ],
];

const CONS: string[][] = [
  [
    '无内置技术指标与画线工具（需插件/自行实现）',
    '不内置数据源/交易所适配，需自建数据层',
    '主题定制能力中等（不如图表全功能库）',
  ],
  ['社区规模与生态小于 TradingView', '非通用图表库，画不了常规业务图表', '缺少 v5 插件那种官方扩展市场'],
  ['文档与代码注释以中文为主，国际化弱', 'API 设计较“重”，学习曲线比 lightweight-charts 陡', '社区规模中等'],
  [
    '为通用而生，金融专业能力弱：K 线缩放/十字光标体验、OHLC 交互细节不如专业 K 线库',
    '内置指标/画线工具需手动实现',
    '包体积大（按需引入可缓解）',
  ],
];

const FITS = [
  '证券/加密/期货等专业行情展示；需要稳定性能与规范数据流的中大型产品。',
  'A股/数字货币产品；需要开箱即用功能（指标/画线/移动端）的场景。',
  'A股/港股/期货等国内场景；需要通达信/麦语言脚本、筹码图等特色功能的产品。',
  '混合型看板（既有 K 线又有大量业务图表）；需要“一个库解决全部可视化”的场景。',
];
