import { BinanceDataSource } from './binance';
import { TencentDataSource } from './tencent';
import { EastMoneyDataSource } from './eastmoney';
import { TwelveDataDataSource } from './twelvedata';
import { YahooDataSource } from './yahoo';
import type { KlineDataSource } from '../types/ohlcv';

/**
 * 数据源注册表 —— 新增数据源在这里注册，UI 即可选择。
 * 注意：对象键顺序 = UI 下拉框顺序（dataSourceList = Object.values(dataSources)）。
 * 默认数据源由各页面组件内的 useState<DataSourceId>('tencent') 硬编码，与此处无关。
 */
export const dataSources = {
  tencent: new TencentDataSource(),
  eastmoney: new EastMoneyDataSource(),
  binance: new BinanceDataSource(),
  twelvedata: new TwelveDataDataSource(),
  yahoo: new YahooDataSource(),
} as const;

export type DataSourceId = keyof typeof dataSources;

/** 按接口返回，保留可选的 searchSymbols / subscribe（联合类型会遮蔽它们） */
export function getDataSource(id: DataSourceId): KlineDataSource {
  return dataSources[id];
}

export const dataSourceList = Object.values(dataSources);
