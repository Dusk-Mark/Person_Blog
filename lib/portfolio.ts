/**
 * 持仓数据的共享类型与计算口径。
 * 前台展示与后台管理共用这里的方法，保证两处的价格回退与收益率算法完全一致。
 */

export type HoldingDirection = "long" | "short";

/** 对应 public.portfolio_holdings 表中的一行。 */
export type Holding = {
  id: string;
  /** 资产代码，例如 ETH。 */
  asset: string;
  amount: number;
  /** 保存时的价格，实时行情不可用时作为回退。 */
  price_usd: number | null;
  /** 手动录入的入场价格，收益率以此为基准。 */
  entry_price_usd: number | null;
  /** 杠杆倍数，用于把价格变化放大成保证金收益率。 */
  leverage: number | null;
  direction: HoldingDirection;
  source: string;
  account: string;
  value_usd: number | null;
  synced_at: string;
};

/** 资产代码 -> Gate 永续合约最新价。 */
export type LiveMarks = Record<string, number>;

/** 实时价优先，其次回退到保存时的价格；两者都缺失时返回 null。 */
export function markPrice(holding: Holding, marks: LiveMarks): number | null {
  return marks[holding.asset] ?? holding.price_usd ?? null;
}

/** 持仓市值 = 数量 × 实时价。 */
export function marketValue(holding: Holding, marks: LiveMarks): number | null {
  const mark = markPrice(holding, marks);
  return mark == null ? null : holding.amount * mark;
}

/**
 * 当前收益率（保证金口径）：多仓看涨、空仓看跌，再乘杠杆放大。
 *   多仓 = (实时价 - 入场价) / 入场价 × 杠杆
 *   空仓 = (入场价 - 实时价) / 入场价 × 杠杆
 * 缺少入场价或行情时返回 null。
 */
export function holdingRoi(holding: Holding, marks: LiveMarks): number | null {
  const mark = markPrice(holding, marks);
  if (mark == null || !holding.entry_price_usd) return null;
  const direction = holding.direction === "short" ? -1 : 1;
  return (
    ((mark - holding.entry_price_usd) / holding.entry_price_usd) *
    (holding.leverage ?? 1) *
    direction
  );
}

/** 收益率百分比文本，无数据时返回 null，由调用方决定占位符。 */
export function formatRoi(roi: number | null): string | null {
  return roi == null
    ? null
    : `${roi >= 0 ? "+" : ""}${(roi * 100).toFixed(2)}%`;
}

/** 收益率配色类名，对应 globals.css 与 admin.css 中的 .holding-roi 规则。 */
export function roiClass(roi: number | null): string {
  if (roi == null) return "holding-roi";
  return roi >= 0 ? "holding-roi up" : "holding-roi down";
}
