import { BinanceDataSource } from './binance';
import { TencentDataSource } from './tencent';
import { EastMoneyDataSource } from './eastmoney';
import { TdxDataSource } from './tdx';
import type { KlineDataSource } from '../types/ohlcv';

/**
 * 数据源注册表 —— 新增数据源在这里注册，UI 即可选择。
 * 默认数据源为腾讯财经（见 Dashboard 的 SOURCE_DEFAULTS）。
 */
export const dataSources = {
  binance: new BinanceDataSource(),
  tencent: new TencentDataSource(),
  eastmoney: new EastMoneyDataSource(),
  tdx: new TdxDataSource(),
} as const;

export type DataSourceId = keyof typeof dataSources;

/** 按接口返回，保留可选的 searchSymbols / subscribe（联合类型会遮蔽它们） */
export function getDataSource(id: DataSourceId): KlineDataSource {
  return dataSources[id];
}

export const dataSourceList = Object.values(dataSources);
