import type { OHLCV, KlineDataSource, KlinePeriod, StockResult } from '../types/ohlcv';

/**
 * 通达信（TDX）行情数据源。
 *
 * 通达信行情走 TCP 私有协议（端口 7709 等），浏览器无法直接连接，
 * 只能由服务端/桌面客户端拉取后转成 HTTP 提供。本项目为浏览器端演示，
 * 因此本数据源仅作占位：fetchKlines 明确抛错，UI 显示 error-panel 提示
 * 「需服务端中转」。若后续接 tdx 中转网关，在此实现即可。
 *
 * 参考：docs/免费行情数据源调研报告.md「通达信」条目（TCP 私有协议/11 种周期/800 根）。
 */
export class TdxDataSource implements KlineDataSource {
  readonly id = 'tdx';
  readonly label = '通达信';

  /** 通达信浏览器端不可用（TCP 私有协议），不声明任何支持周期 → 周期下拉为空 */
  readonly supportedPeriods: readonly KlinePeriod[] = [];

  private async unavailable(): Promise<never> {
    throw new Error('通达信行情走 TCP 私有协议，浏览器无法直连，需服务端中转（如 tdx 网关）。');
  }

  fetchKlines(_symbol: string, _period: KlinePeriod, _limit: number): Promise<OHLCV[]> {
    return this.unavailable();
  }

  /** 通达信不提供浏览器端搜索，返回空（顶部搜索框仅对腾讯/东财源可用） */
  searchSymbols(_keyword: string): Promise<StockResult[]> {
    return Promise.resolve([]);
  }
}
