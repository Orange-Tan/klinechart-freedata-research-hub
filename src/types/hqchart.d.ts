/**
 * hqchart 类型声明（该库无内置类型）。
 * 声明范围仅覆盖本项目用到的 API，其余以 any 兜底。
 */
declare module 'hqchart' {
  export interface HQNetworkFilterObj {
    Name: string;
    Explain?: string;
    Request: {
      Url: string;
      Type: string;
      Data: Record<string, unknown>;
    };
    Self: unknown;
    PreventDefault: boolean;
  }

  /** K 线容器实例（SetOption 的 OnCreatedCallback 回调参数） */
  export interface HQKLineContainer {
    /**
     * 手动推送整段 K 线数据（跳过内部网络请求，可直接用于实时更新）。
     * Data 必须是 HistoryData 形状的对象数组（不走 JsonDataToHistoryData）：
     * { Date, YClose, Open, Close, High, Low, Vol, Amount, Time? }
     * DataOffset ≥ 0 用于把视图偏移推到指定位置（否则 newDataCount 恒为 0，
     * 偏移会被冻结在最旧一侧）。
     */
    ManualUpdateKData(kData: { Data: HQHistoryData[]; DataOffset?: number }): void;
    ChangeSymbol(symbol: string, option?: unknown): void;
    ChangePeriod(period: number, option?: unknown): void;
    ChangeKLineDrawType(drawType: number, isDraw?: boolean, option?: unknown): void;
    ChartDestroy(): void;
    Draw(): void;
    AddEventCallback(callback: unknown): void;
    /** 声明为 API 周期数据源后，Recv* 不再对预聚合数据做 GetPeriodData 二次聚合 */
    IsApiPeriod: boolean;
    /** 根 Frame（HQTradeFrame）。SubFrame[0].Frame 是主 K 线 frame，其 Data 是
     *  绑定中的 ChartData（DataOffset 即当前平移到的数据下标），XPointCount 是
     *  当前缩放档位下可见根数（一屏宽）。实时推送时需要读它们来保留用户当前的
     *  平移位置、并按真实一屏宽计算跟随落点。 */
    Frame?: {
      Data?: HQChartData;
      XPointCount?: number;
      SubFrame?: Array<{ Frame?: { Data?: HQChartData; XPointCount?: number } }>;
    };
    [key: string]: unknown;
  }

  /** 当前绑定的 K 线数据（ChartData）。Data 是 HistoryData 数组，DataOffset 是
   *  视图窗口起始下标（0 = 从最早一根开始看）。 */
  export interface HQChartData {
    Data?: HQHistoryData[];
    DataOffset?: number;
    [key: string]: unknown;
  }

  /** HQChart HistoryData 的最小字段集（ManualUpdateKData 渲染路径按属性读取） */
  export interface HQHistoryData {
    Date: number;
    YClose: number;
    Open: number;
    Close: number;
    High: number;
    Low: number;
    Vol: number;
    Amount: number;
    Time?: number;
  }

  export interface HQChartOption {
    /** 图表类型，如 '历史K线图' */
    Type: string;
    Symbol: string;
    EnableResize?: boolean;
    IsAutoUpdate?: boolean;
    AutoUpdateFrequency?: number;
    NetworkFilter?: (obj: HQNetworkFilterObj, callback: (data: unknown) => void) => void;
    OnCreatedCallback?: (chart: HQKLineContainer) => void;
    KLine?: {
      Period?: number;
      Right?: number;
      MaxRequestDataCount?: number;
      DrawType?: number;
      PageSizeV2?: number;
      DataWidth?: number;
    };
    Windows: Array<Record<string, unknown> | null>;
    [key: string]: unknown;
  }

  export interface HQJSChartNamespace {
    jsChartInit: (element: HTMLElement) => HQJSChartInstance;
    jsChartStyle: (styles: Record<string, unknown>) => void;
    JSChart: unknown;
    [key: string]: unknown;
  }

  export interface HQJSChartInstance {
    SetOption(option: HQChartOption): void;
    ChangeSymbol(symbol: string, option?: unknown): void;
    ChangePeriod(period: number, option?: unknown): void;
    ChartDestroy(): void;
    GetChartData?(): unknown;
    [key: string]: unknown;
  }

  const Chart: HQJSChartNamespace;
  export default Chart;
}
