import type { ReactNode } from 'react';
import { Icon as IconifyIcon, type IconProps as IconifyIconProps } from '@iconify/react';

/**
 * 全站统一图标组件（Iconify 在线 API 模式）。
 *
 * 运行时不落盘任何 SVG、不安装离线图标包：图标数据由 @iconify/react 在渲染时
 * 懒加载自 https://api.iconify.design（实际请求形如
 * `https://api.iconify.design/ph.json?icons=chart-bar`），首次加载后缓存。
 * 加载中 / 网络失败（图标数据拉不回来）时，用内置 fallback 降级：
 * 渲染 REPLACE_MAP 里该项的 fallback emoji。
 *
 * ## 版权
 * 使用 Phosphor（`ph:`）图标集 —— MIT 协议（https://phosphoricons.com/），
 * 可自由商用，保留本注释即可。图标字体本身不在本项目内分发（在线模式）。
 * 各图标含义见下方 REPLACE_MAP 映射表。
 */

/**
 * 全站图标注册表（单一数据源）：每一项 = { icon: Iconify 图标名, fallback: 加载失败降级 emoji }。
 * 新增图标只需在此加一行：iconOf() 取图标名、Icon 组件取降级 emoji 都从这张表派生，
 * 不会出现两处映射不同步。
 */
export const REPLACE_MAP = {
  // —— 侧边栏（App.tsx）——
  '多图对比': { icon: 'ph:chart-bar', fallback: '📊' }, // 柱状图（对比看板）
  '图表调研': { icon: 'ph:book-open', fallback: '📖' }, // 打开的书（调研报告）
  '数据调研': { icon: 'ph:target', fallback: '📡' }, // 准星（连通性扫描/探测目标）
  // —— 折叠按钮（App.tsx）——
  '侧栏展开': { icon: 'ph:caret-right', fallback: '»' },
  '侧栏收起': { icon: 'ph:caret-left', fallback: '«' },
  // —— 数据调研页（DataResearch.tsx + dataResearchData.ts）——
  '一键检测': { icon: 'ph:lightning', fallback: '⚡' },
  '检测中': { icon: 'ph:spinner-gap', fallback: '⏳' }, // spinning 转圈
  '连通': { icon: 'ph:check-circle', fallback: '✅' },
  '失败': { icon: 'ph:x-circle', fallback: '❌' },
  '需外网': { icon: 'ph:globe', fallback: '🌐' },
  '需代理': { icon: 'ph:arrows-clockwise', fallback: '🔁' },
  '需Key': { icon: 'ph:key', fallback: '🔑' },
  // —— 市场区块标题（dataResearchData.ts）——
  'A股': { icon: 'ph:chart-line', fallback: '🇨🇳' }, // 折线（指数走势）
  '美股': { icon: 'ph:currency-dollar', fallback: '🇺🇸' }, // 美元
  '加密货币': { icon: 'ph:coins', fallback: '🪙' },
  '期货': { icon: 'ph:cube', fallback: '📦' }, // 立方（期货交割品）
  '基金': { icon: 'ph:bank', fallback: '🏦' }, // 银行（基金托管）
  // —— 图表调研页（ResearchReport.tsx）——
  // 维护状态圆点：在线时 SVG 靠 .maintain-label 上绿、.red 上红；
  // 离线 fallback 必须用继承当前文字颜色的纯文本字符（●），
  // 若用 🟢/🔴 这类自带颜色的 emoji，反向映射表按图标名去重后两个语义
  // 条目只留一个 fallback，会把"维护活跃"也渲染成红点（语义反转）。
  '维护活跃': { icon: 'ph:circle-fill', fallback: '●' },
  '维护停更': { icon: 'ph:circle-fill', fallback: '●' },
  '优点': { icon: 'ph:check-circle', fallback: '✅' },
  '缺点': { icon: 'ph:x-circle', fallback: '❌' },
  '警告': { icon: 'ph:warning', fallback: '⚠️' },
  '星标': { icon: 'ph:star-fill', fallback: '★' },
} as const;

/** 图标名（形如 "ph:chart-bar"），即 REPLACE_MAP 各项的 icon 字段 */
export type IconName = (typeof REPLACE_MAP)[keyof typeof REPLACE_MAP]['icon'];

/** 图标名 → 降级 emoji（从 REPLACE_MAP 派生，保持单一数据源） */
const ICON_FALLBACK = new Map<string, string>(
  Object.values(REPLACE_MAP).map((e) => [e.icon, e.fallback] as const),
);

/**
 * 对外 props：与 @iconify/react 的 IconProps 兼容（透传全部 SVG props 与
 * Iconify 专属 props），只把 icon 收窄成本项目 REPLACE_MAP 里的图标名。
 * 额外支持 fallback 覆盖默认降级内容。
 *
 * 尺寸说明：@iconify/react 默认把图标高度设为 "1em"（宽度按比例算），
 * 因此尺寸跟随 CSS font-size 走；需要改尺寸时用 height/width 传 number（px）
 * 或带单位字符串，另一维度按宽高比自动算。
 */
export interface IconProps extends Omit<IconifyIconProps, 'icon'> {
  /** Iconify 图标名（形如 "ph:chart-bar"），见 REPLACE_MAP */
  icon: IconName;
  /** 加载中/加载失败时显示的回退内容；不传则降级为对应 emoji */
  fallback?: ReactNode;
}

/**
 * 图标组件：在线 Iconify + 加载失败降级。
 * 加载中 / 网络失败时显示 fallback（默认是对应 emoji），加载成功后渲染 SVG。
 * 默认尺寸 1em：跟随父元素 font-size，方便文字内嵌与统一缩放。
 */
export function Icon({ icon, className, fallback, ...rest }: IconProps) {
  const glyph = ICON_FALLBACK.get(icon);
  const defaultFallback = glyph ? (
    <span
      className={className}
      style={{ lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}
    >
      {glyph}
    </span>
  ) : (
    // 无对应降级字符：占位空块（保持 1em 尺寸），避免出现空白图标或撑破布局
    <span className={className} style={{ display: 'inline-block', width: '1em', height: '1em' }} />
  );

  return (
    <IconifyIcon
      icon={icon}
      className={className}
      fallback={fallback ?? defaultFallback}
      {...rest}
    />
  );
}

/**
 * 便捷引用：从 REPLACE_MAP 里取图标名（带类型约束，确保是已声明过的 key）。
 * 例：`icon={iconOf('连通')}`。
 */
export function iconOf<K extends keyof typeof REPLACE_MAP>(
  key: K,
): (typeof REPLACE_MAP)[K]['icon'] {
  return REPLACE_MAP[key].icon;
}
