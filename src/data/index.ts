import { BinanceDataSource } from './binance';

/**
 * 数据源注册表 —— 新增数据源在这里注册，UI 即可选择。
 */
export const dataSources = {
  binance: new BinanceDataSource(),
} as const;

export type DataSourceId = keyof typeof dataSources;

export function getDataSource(id: DataSourceId) {
  return dataSources[id];
}

export const dataSourceList = Object.values(dataSources);
