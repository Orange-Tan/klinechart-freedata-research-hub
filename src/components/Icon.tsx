import type { CSSProperties, SVGProps } from 'react';
import { PHOSPHOR_PATHS } from './phosphorIcons';

/**
 * 全站统一图标组件（本地打包模式）。
 *
 * 所有图标都是 Phosphor 图标集（MIT 协议，https://phosphoricons.com/）的 SVG，
 * 内联在 phosphorIcons.ts 里随应用一起打包 —— 不依赖任何在线图标 API，
 * 断网/慢网/境内网络都不受影响，也不会出现"先 emoji 后 SVG"的闪烁。
 *
 * 版权：Phosphor 为 MIT 协议，可自由商用，保留本注释与 phosphorIcons.ts 头部注释即可。
 */

/**
 * 全站图标注册表（单一数据源）：key = 中文语义标签，value = Phosphor 图标名。
 * 新增图标两步走：
 *  1. 在 phosphorIcons.ts 里补一个图标名 → SVG path 的条目（从 phosphoricons.com 挑选）；
 *  2. 在本表加一行 中文标签 → 图标名。
 * Icon 组件的图标解析与 iconOf() 都从这张表派生，不会出现两处映射不同步。
 * 全部图标保持 Phosphor 同一风格，禁止混入其它图标库造成风格不一致。
 */
export const REPLACE_MAP = {
  // —— 侧边栏（App.tsx）——
  '多图对比': 'squares-four', // 四宫格（4 库同源并排对比看板）
  '图表调研': 'book-open', // 打开的书（调研报告）
  '数据调研': 'target', // 准星（连通性扫描/探测目标）
  '轻量库详情': 'chart-line-up', // 上升折线（Lightweight-Charts 大图详页）
  'K线库详情': 'chart-bar', // 柱状图（klinecharts 量价大图详页）
  // —— 折叠按钮（App.tsx）——
  '侧栏展开': 'caret-right',
  '侧栏收起': 'caret-left',
  // —— 数据调研页（DataResearch.tsx + dataResearchData.ts）——
  '一键检测': 'lightning',
  '检测中': 'spinner-gap', // spinning 转圈
  '连通': 'check-circle',
  '失败': 'x-circle',
  '需外网': 'globe',
  '需代理': 'arrows-clockwise',
  '需Key': 'key',
  // —— 市场区块标题（dataResearchData.ts）——
  'A股': 'chart-line', // 折线（指数走势）
  '美股': 'currency-dollar', // 美元
  '加密货币': 'coins',
  '期货': 'cube', // 立方（期货交割品）
  '基金': 'bank', // 银行（基金托管）
  // —— 图表调研页（ResearchReport.tsx）——
  '维护活跃': 'circle-fill',
  '维护停更': 'circle-fill',
  '优点': 'check-circle',
  '缺点': 'x-circle',
  '警告': 'warning',
  '星标': 'star-fill',
} as const;

/** 图标名（Phosphor 图标，形如 "chart-bar"），即 REPLACE_MAP 各项的值 */
export type IconName = (typeof REPLACE_MAP)[keyof typeof REPLACE_MAP];

/**
 * 对外 props：透传全部 SVG props，只把图标名收窄成本项目 REPLACE_MAP 里的值。
 * 尺寸说明：默认把 SVG 宽高设为 "1em"（跟随父元素 font-size），需要改尺寸时用
 * width/height 传 number（px）或带单位字符串（沿用 @iconify/react 的尺寸习惯，
 * 现有调用 height="1em" 等原样兼容）。
 */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  /** Phosphor 图标名（形如 "chart-bar"），见 REPLACE_MAP */
  icon: IconName;
  /** 尺寸覆盖（宽高同时生效，保持图标 1:1 方形比例） */
  size?: string | number;
}

/** 渲染一个 Phosphor 图标的 <path>（d 数据来自 phosphorIcons.ts，颜色用 currentColor 继承父级） */
function Glyph({ d }: { d: string }) {
  return <path d={d} fill="currentColor" />;
}

/**
 * 图标组件：本地 SVG 渲染（随应用打包，无任何网络请求）。
 * 尺寸默认 1em：跟随父元素 font-size，方便文字内嵌与统一缩放。
 * 颜色继承 currentColor，由父级 CSS 上色。
 */
export function Icon({ icon, className, style, size, width, height, ...rest }: IconProps) {
  const d = PHOSPHOR_PATHS[icon];
  if (!d) {
    // 图标名不存在：渲染占位空块（保持 1em 尺寸），避免出现空白图标或撑破布局。
    // 正常情况不会走到这里（REPLACE_MAP 的值都已在 phosphorIcons.ts 注册）。
    return <span className={className} style={{ display: 'inline-block', width: '1em', height: '1em' }} />;
  }
  const dim: CSSProperties = size
    ? { width: size, height: size }
    : { width: width ?? '1em', height: height ?? '1em' };
  return (
    <svg
      className={className}
      style={{ ...dim, ...style }}
      viewBox="0 0 256 256"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <Glyph d={d} />
    </svg>
  );
}

/**
 * 便捷引用：从 REPLACE_MAP 里取图标名（带类型约束，确保是已声明过的 key）。
 * 例：`icon={iconOf('连通')}`。
 */
export function iconOf<K extends keyof typeof REPLACE_MAP>(key: K): (typeof REPLACE_MAP)[K] {
  return REPLACE_MAP[key];
}
