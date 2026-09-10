import { useRef, useState } from 'react';
import { useKlineData } from '../hooks/useKlineData';
import { PERIOD_LABEL } from '../types/ohlcv';
import type { KlinePeriod } from '../types/ohlcv';
import { dataSourceList, type DataSourceId } from '../data';
import { SHOWCASE_SOURCE_DEFAULTS, supportedPeriodsOf } from './showcaseShared';
import {
  LightweightShowcaseChart,
  type LightweightShowcaseChartRef,
} from '../components/charts/LightweightShowcaseChart';
import './LightweightShowcase.css';

/** 页首大图需要 ≥ MIN_BARS 根历史才敢展示全量功能（指标/标记/画线不空洞） */
const MIN_BARS = 60;

/**
 * Lightweight-Charts 单库详解页：页首是功能全开的大型独立 K 线图，
 * 页下是对这个库所有功能的详细中文说明。
 */
export function LightweightShowcase() {
  const [sourceId, setSourceId] = useState<DataSourceId>('tencent');
  const [period, setPeriod] = useState<KlinePeriod>('1d');
  const chartRef = useRef<LightweightShowcaseChartRef>(null);
  const def = SHOWCASE_SOURCE_DEFAULTS[sourceId];
  const periodOptions = supportedPeriodsOf(sourceId);

  const { history, error } = useKlineData({
    sourceId,
    symbol: def.symbol,
    period,
    historyLimit: 500,
  });

  const bars = history.length;
  const ready = bars >= MIN_BARS;

  // 数据源切换：标的重置为该源默认；周期回退到该源支持的第一个周期
  function handleSourceChange(next: DataSourceId) {
    setSourceId(next);
    const options = supportedPeriodsOf(next);
    if (!options.includes(period)) setPeriod(options[0]);
  }

  // 大图功能开关（对应下方文档的各功能分节）：默认全关，
  // 避免一进来就叠满指标/标记/水印/画线，让用户按需勾选体验
  const [indicators, setIndicators] = useState(false);
  const [markers, setMarkers] = useState(false);
  const [watermark, setWatermark] = useState(false);
  const [trendLine, setTrendLine] = useState(false);
  const [priceLine, setPriceLine] = useState(false);
  const [extraPanes, setExtraPanes] = useState(false);
  const [seriesTypes, setSeriesTypes] = useState(false);

  const periodLabel = PERIOD_LABEL[period];

  return (
    <div className="lw-page">
      <div className="lw-inner">
      <header className="lw-hero">
        <div className="lw-hero-head">
          <h1>Lightweight-Charts 详解</h1>
        </div>
        <div className="lw-controls">
          <label className="lw-field">
            数据源
            <select value={sourceId} onChange={(e) => handleSourceChange(e.target.value as DataSourceId)}>
              {dataSourceList.map((ds) => (
                <option key={ds.id} value={ds.id}>
                  {ds.label}
                </option>
              ))}
            </select>
          </label>
          <label className="lw-field">
            周期
            <select value={period} onChange={(e) => setPeriod(e.target.value as KlinePeriod)}>
              {periodOptions.map((p) => (
                <option key={p} value={p}>
                  {PERIOD_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <div className="lw-toggles">
            {[
              { key: 'indicators', label: '指标线', on: indicators, set: setIndicators },
              { key: 'seriesTypes', label: '序列类型', on: seriesTypes, set: setSeriesTypes },
              { key: 'markers', label: '买卖标记', on: markers, set: setMarkers },
              { key: 'watermark', label: '水印', on: watermark, set: setWatermark },
              { key: 'trendLine', label: '趋势线', on: trendLine, set: setTrendLine },
              { key: 'priceLine', label: '价格线', on: priceLine, set: setPriceLine },
              { key: 'extraPanes', label: '多面板', on: extraPanes, set: setExtraPanes },
            ].map(({ key, label, on, set }) => (
              <label className={`lw-toggle${on ? ' on' : ''}`} key={key}>
                <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
                {label}
              </label>
            ))}
          </div>
        </div>
      </header>

      <section className="lw-stage">
        <LightweightShowcaseChart
          ref={chartRef}
          data={history}
          symbol={def.symbol}
          live
          indicators={indicators}
          markers={markers}
          watermark={watermark}
          trendLine={trendLine}
          priceLine={priceLine}
          extraPanes={extraPanes}
          seriesTypes={seriesTypes}
        />
        <span className="sr-only bars-count">{bars} bars</span>
        {!ready && <div className="lw-loading">正在加载历史数据…（{bars} / {MIN_BARS} 根）</div>}
        {/* 数据异常时图表保持显示（空态），把异常提示放在大图右上角 */}
        {error && (
          <div className="lw-stage-error">
            数据异常：{def.label} {periodLabel} {error}
          </div>
        )}
      </section>

      <LightweightDocs />
      </div>
    </div>
  );
}

function LightweightDocs() {
  return (
    <div className="lw-docs">
      <h2 className="lw-docs-title">Lightweight-Charts 库详解</h2>
      <p className="lw-docs-lead">
        Lightweight-Charts 是 TradingView 官方出品的开源图表库（Apache-2.0，约 45kb gzip），
        主打“轻量”：不内置任何指标与画线工具，一切交给数据与代码。它把“图表”拆成一套
        清晰的对象模型——序列（Series）表达数据、面板（Pane）承载序列、价格轴与时间轴负责
        映射——上层能力（指标、标记、水印、自定义图元）全部通过可组合的 API 挂上去。
      </p>

      <section className="lw-doc-section">
        <h3>核心对象模型</h3>
        <table className="lw-doc-table">
          <thead>
            <tr>
              <th>概念</th>
              <th>类型 / 入口</th>
              <th>作用</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>图表</td>
              <td><code>createChart(el, options)</code> → <code>IChartApi</code></td>
              <td>最外层容器，持有时间轴与右侧价格轴</td>
            </tr>
            <tr>
              <td>序列</td>
              <td><code>chart.addSeries(定义, 选项, paneIndex?)</code></td>
              <td>一类数据在图上的一种画法；可指定落在哪个面板（0=主图）</td>
            </tr>
            <tr>
              <td>面板</td>
              <td><code>chart.panes()</code> → <code>IPaneApi[]</code></td>
              <td>垂直堆叠的横向区域；独立拉伸系数、可移动、可挂插件</td>
            </tr>
            <tr>
              <td>价格刻度</td>
              <td><code>chart.priceScale(id)</code> → <code>IPriceScaleApi</code></td>
              <td>右侧价格轴；用 <code>scaleMargins</code> 控制序列在面板内的占位</td>
            </tr>
            <tr>
              <td>时间刻度</td>
              <td><code>chart.timeScale()</code> → <code>ITimeScaleApi</code></td>
              <td>底部时间轴；平移缩放、可见区间、回最新</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="lw-doc-section">
        <h3>时间与数据</h3>
        <p>
          时间戳是这套模型最容易踩的坑：<code>UTCTimestamp</code> 以<strong>秒</strong>为单位，
          而本项目统一协议 <code>OHLCV.time</code> 是<strong>毫秒</strong>，接入时必须
          <code>time / 1000</code>，否则日期会漂到 1970 年之后几百年。
        </p>
        <ul>
          <li><code>series.setData(data)</code>：全量替换，适合首次加载或整体换数据。</li>
          <li><code>series.update(bar)</code>：增量更新，按时间戳“追尾”——同一根时间戳替换、新时间戳追加，适合实时推送，避免全量重绘。</li>
          <li>增量与全量可混用：本项目实时推送时先 <code>findIndex</code> 找到已渲染的最后一根，从其起点逐根 <code>update()</code>；找不到或时间倒退则退化全量 <code>setData</code>。</li>
          <li><code>localization.timeFormatter</code>：自定义时间刻度文案，本页把它格式化为 <code>YYYY-MM-DD</code>。</li>
        </ul>
      </section>

      <section className="lw-doc-section">
        <h3>五种内置序列类型</h3>
        <table className="lw-doc-table">
          <thead>
            <tr>
              <th>序列</th>
              <th>入口常量</th>
              <th>适合</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>K 线</td><td><code>CandlestickSeries</code></td><td>金融行情主图</td></tr>
            <tr><td>折线</td><td><code>LineSeries</code></td><td>均线 / 指标曲线</td></tr>
            <tr><td>面积</td><td><code>AreaSeries</code></td><td>趋势面的渐变填充</td></tr>
            <tr><td>柱状</td><td><code>BarSeries</code></td><td>传统 OHLC 柱</td></tr>
            <tr><td>基线</td><td><code>BaselineSeries</code></td><td>围绕某基线的涨跌二分着色</td></tr>
            <tr><td>直方图</td><td><code>HistogramSeries</code></td><td>成交量 / MACD 柱</td></tr>
          </tbody>
        </table>
        <p>
          本页大图把折线/面积/柱状/基线四种同时叠在主图 K 线之上，并把直方图用作成交量与
          附加面板——同一份数据可以按任意序列类型重复绘制，这正是“序列与数据分离”的体现。
        </p>
        <p>
          序列选项里有几个常用的 <code>SeriesOptionsCommon</code> 公共项：<code>title</code>
          （序列名，显示在最后价标签旁）、<code>lastValueVisible</code>（是否显示最后价
          标签）、<code>priceLineVisible</code>（跟随最新价的虚线）。本页主图 K 线
          <code>title: '主图K线'</code>、收盘线 <code>title: '收盘'</code> 均开启了这三项。
          另外 <code>LineSeries</code> 的 <code>lineType</code> 可切换画线风格——本页收盘线
          用 <code>LineType.WithSteps</code> 画成阶梯线（与均线的光滑线并排，肉眼可辨差异）。
        </p>
      </section>

      <section className="lw-doc-section">
        <h3>多面板与价格刻度</h3>
        <p>
          <code>chart.addSeries(定义, 选项, paneIndex)</code> 的第三个参数指定序列落在哪个面板：
          不传默认新建一个面板；传 0 放回主图；传 1、2… 放进已有的附加面板。
          本页大图的结构是——主图 K 线（面板 0）、成交量（面板 1）、涨跌幅直方图（面板 2）。
        </p>
        <p>
          每个面板可用 <code>IPaneApi</code> 控制：<code>setStretchFactor()</code> 调整纵向
          拉伸权重、<code>setHeight()</code> 固定高度、<code>moveTo()</code> 拖动换位、
          <code>getSeries()</code> 反查序列。面板内序列的纵向占位由价格刻度控制：
          <code>{'chart.priceScale(\'\').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })'}</code>
          让成交量柱只占面板下半部。
        </p>
      </section>

      <section className="lw-doc-section">
        <h3>指标与数据计算</h3>
        <p>
          库本身<strong>没有内置指标</strong>——这是它与 klinecharts 最大的区别，也是“轻量”
          的含义。MA、MACD、RSI 等要么自己算，要么交给数据供应商。本页大图的 MA5/10/20
          与均量线就是手算后以 <code>LineSeries</code> 叠加的：一次遍历维护滑动窗口和，
          前 N-1 根不足窗口时跳过，从第 N 根起输出均值。
        </p>
      </section>

      <section className="lw-doc-section">
        <h3>插件体系：标记 / 水印 / 自定义图元</h3>
        <p>
          v5 把“加东西”统一成插件（Primitive）体系，三个顶层工厂对应三种粒度的扩展：
        </p>
        <ul>
          <li>
            <code>createSeriesMarkers(series, markers)</code>：序列标记插件。在指定时间点画
            箭头/圆点等图形，并参与自动缩放（<code>autoScale</code>）。本页“买卖标记”开关
            控制的就是它——按最后 30 根 K 线涨跌生成“买/卖”箭头。
          </li>
          <li>
            <code>{'createTextWatermark(pane, options)'}</code>：文本水印插件，挂在<strong>面板</strong>
            上而非图表上。可设多行文字、对齐与可见性（<code>{'applyOptions({ visible })'}</code>）。
          </li>
          <li>
            <code>ISeriesPrimitive</code> 接口：完全自定义图元。实现 <code>paneViews()</code>
            返回视图对象，视图的 <code>renderer().draw(target)</code> 拿到
            <code>CanvasRenderingTarget2D</code>，用 <code>target.useBitmapCoordinateSpace()</code>
            拿 2D 上下文直接画。回调参数 <code>SeriesAttachedParameter</code> 里有当前
            <code>series</code>，可调用 <code>priceToCoordinate / timeToCoordinate</code> 把
            数据坐标转成屏幕坐标。本页“趋势线”开关画的就是这样一条自定义虚线。
          </li>
        </ul>
        <p>
          三个插件都通过各自插件对象上的 <code>detach()</code> 卸载，图表销毁前必须逐一 detach
          以免泄漏。
        </p>
      </section>

      <section className="lw-doc-section">
        <h3>价格线</h3>
        <p>
          <code>{'series.createPriceLine({ price, color, lineStyle, title, axisLabelVisible })'}</code>
          在序列上创建一条带右侧标签的水平参考线，适合画止盈止损位、成本价、斐波那契位等。
          用 <code>applyOptions()</code> 改价、<code>series.removePriceLine(pl)</code> 移除。
        </p>
      </section>

      <section className="lw-doc-section">
        <h3>常用配置</h3>
        <ul>
          <li><code>layout.background</code>：<code>ColorType.Solid</code> 纯色背景或渐变。</li>
          <li><code>grid</code>：纵/横网格线颜色；<code>crosshair</code>：十字光标吸附模式与颜色。</li>
          <li><code>timeScale.rightOffset</code>：右侧留白根数；<code>timeVisible / secondsVisible</code>：时间刻度粒度。</li>
          <li><code>attributionLogo: false</code>：隐藏左下角 TradingView 标识（按要求在文档保留声明）。</li>
        </ul>
      </section>

      <section className="lw-doc-section">
        <h3>与 klinecharts 的对比小结</h3>
        <table className="lw-doc-table">
          <thead>
            <tr>
              <th>维度</th>
              <th>Lightweight-Charts</th>
              <th>klinecharts</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>定位</td><td>轻量内核 + 可组合插件</td><td>开箱即用的完整交易客户端组件</td></tr>
            <tr><td>内置指标</td><td>无，需自算</td><td>27 个</td></tr>
            <tr><td>内置画线</td><td>无，需自定义图元</td><td>16+ 个叠加层</td></tr>
            <tr><td>周期切换 / 语言 / 时区</td><td>由上层数据流负责</td><td>内置 API 直接切换</td></tr>
            <tr><td>体积</td><td>约 45kb gzip</td><td>约 40kb gzip</td></tr>
            <tr><td>适合</td><td>深度定制、图表只是页面一部分</td><td>要快速做出完整行情工具台</td></tr>
          </tbody>
        </table>
        <p>
          简单说：lightweight-charts 给你一块“画布 + 数据模型”，能力全靠代码组合，定制自由但
          指标画线都要自己做；klinecharts 给你一间“精装房”，指标、画线、周期切换、截图开箱即用。
          本项目把两者都接入同一份数据源，正是为了在真实行情下对比这套取舍。
        </p>
      </section>
    </div>
  );
}
