/**
 * 标准 K 线数据结构 —— 全项目统一的 OHLCV 协议。
 * 所有数据源适配器都返回该结构，所有图表库适配器都消费该结构。
 */
export interface OHLCV {
  /** 开盘时间（Unix 毫秒时间戳） */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** 周期枚举：与各库周期做映射时用 */
export type KlinePeriod = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

/** 数据源适配器接口 —— 新增数据源只需实现该接口 */
export interface KlineDataSource {
  readonly id: string;
  readonly label: string;
  /**
   * 拉取历史 K 线。
   * @param symbol 交易对/代码，如 'BTCUSDT'
   * @param period 周期
   * @param limit 数量上限
   */
  fetchKlines(symbol: string, period: KlinePeriod, limit: number): Promise<OHLCV[]>;
  /** 订阅实时 K 线（返回取消订阅函数） */
  subscribe?(symbol: string, period: KlinePeriod, onUpdate: (bar: OHLCV) => void): () => void;
}

/** 数据源错误 */
export class DataSourceError extends Error {
  constructor(
    message: string,
    public readonly sourceId: string,
  ) {
    super(message);
    this.name = 'DataSourceError';
  }
}
