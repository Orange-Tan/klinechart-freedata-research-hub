import type { ReactNode } from 'react';
import { Icon as IconifyIcon, type IconProps as IconifyIconProps } from '@iconify/react';

/**
 * 全站统一图标组件（Iconify 在线 API 模式）。
 *
 * 运行时不落盘任何 SVG、不安装离线图标包：图标数据由 @iconify/react 在渲染时
 * 懒加载自 https://api.iconify.design（实际请求形如
 * `https://api.iconify.design/ph.json?icons=chart-bar`），首次加载后缓存。
 * 加载中 / 网络失败（图标数据拉不回来）时，用内置 fallback 降级：
 * 优先渲染 FALLBACK_GLYPH 里对应的 emoji 文本，无对应则渲染空占位 span
 * （不传 fallback 时 @iconify/react 默认就是空 span）。
 *
 * ## 版权
 * 使用 Phosphor（`ph:`）图标集 —— MIT 协议（https://phosphoricons.com/），
 * 可自由商用，保留本注释即可。图标字体本身不在本项目内分发（在线模式）。
 * 各图标含义见下方 REPLACE_MAP 映射表。
 */

/** 本项目所有图标（含其在 Iconify 的加载失败兜底 emoji），集中在此声明便于统一管理 */
export const REPLACE_MAP = {
  // —— 侧边栏（App.tsx）——
  '多图对比': 'ph:chart-bar', // 📊 → 柱状图（对比看板）
  '图表调研': 'ph:book-open', // 📖 → 打开的书（调研报告）
  '数据调研': 'ph:target', // 📡 → 准星（连通性扫描/探测目标）
  // —— 折叠按钮（App.tsx）——
  '侧栏展开': 'ph:caret-right', // » →
  '侧栏收起': 'ph:caret-left', // « ←
  // —— 数据调研页（DataResearch.tsx + dataResearchData.ts）——
  '一键检测': 'ph:lightning', // ⚡
  '检测中': 'ph:spinner-gap', // ⏳（spinning 转圈）
  '连通': 'ph:check-circle', // ✅
  '失败': 'ph:x-circle', // ❌
  '需外网': 'ph:globe', // 🌐
  '需代理': 'ph:arrows-clockwise', // 🔁
  '需Key': 'ph:key', // 🔑
  // —— 市场区块标题（dataResearchData.ts）——
  'A股': 'ph:chart-line', // 🇨🇳 → 折线（指数走势）
  '美股': 'ph:currency-dollar', // 🇺🇸 → 美元
  '加密货币': 'ph:coins', // 🪙
  '期货': 'ph:cube', // 📦 → 立方（期货交割品）
  '基金': 'ph:bank', // 🏦 → 银行（基金托管）
  // —— 图表调研页（ResearchReport.tsx）——
  '维护活跃': 'ph:circle-fill', // 🟢（配合 CSS 上色）
  '维护停更': 'ph:circle-fill', // 🔴（配合 CSS 上色）
  '优点': 'ph:check-circle', // ✅
  '缺点': 'ph:x-circle', // ❌
  '警告': 'ph:warning', // ⚠️
  '星标': 'ph:star-fill', // ★
} as const;

export type IconName = (typeof REPLACE_MAP)[keyof typeof REPLACE_MAP];

/** 在线图标加载失败/网络断开时的降级 emoji（与 REPLACE_MAP 一一对应） */
const FALLBACK_GLYPH: Partial<Record<IconName, string>> = {
  'ph:spinner-gap': '⏳',
  'ph:lightning': '⚡',
  'ph:check-circle': '✅',
  'ph:x-circle': '❌',
  'ph:globe': '🌐',
  'ph:arrows-clockwise': '🔁',
  'ph:key': '🔑',
  'ph:chart-line': '🇨🇳',
  'ph:currency-dollar': '🇺🇸',
  'ph:coins': '🪙',
  'ph:cube': '📦',
  'ph:bank': '🏦',
  'ph:warning': '⚠️',
  'ph:star-fill': '★',
  'ph:target': '📡',
};

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
  /** 加载中/加载失败时显示的回退内容；不传则降级为对应 emoji（无则空占位） */
  fallback?: ReactNode;
}

/**
 * 图标组件：在线 Iconify + 加载失败降级。
 * 加载中 / 网络失败时显示 fallback（默认是对应 emoji），加载成功后渲染 SVG。
 * 默认尺寸 1em：跟随父元素 font-size，方便文字内嵌与统一缩放。
 */
export function Icon({ icon, className, fallback, ...rest }: IconProps) {
  const glyph = FALLBACK_GLYPH[icon];
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

/** 便捷导出：原 @iconify/react 的类型，供需要直接使用其 props 的地方复用 */
export type { IconifyIconProps };

/**
 * 便捷引用：从 REPLACE_MAP 里取图标名（带类型约束，确保是已声明过的 key）。
 * 例：`icon={iconOf('连通')}`。
 */
export function iconOf<K extends keyof typeof REPLACE_MAP>(key: K): (typeof REPLACE_MAP)[K] {
  return REPLACE_MAP[key];
}
