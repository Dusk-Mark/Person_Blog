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

/** 历史平仓/交易记录结构 */
export type HoldingRecord = {
  id: string;
  asset: string;
  direction: HoldingDirection;
  entry_price_usd: number;
  exit_price_usd: number;
  /** 名义仓位 = 保证金 × 杠杆；由录入时推导，不再手动填写。 */
  amount: number;
  /** 保证金（USD），收益额以此为基数。 */
  margin_usd: number | null;
  leverage: number | null;
  roi: number;
  pnl_usd: number;
  closed_at: string;
  created_at?: string;
  is_public?: boolean;
};

/**
 * 读取记录的保证金。
 * 新数据直接用 margin_usd；旧数据按「数量 × 入场价 / 杠杆」回推。
 */
export function recordMargin(record: HoldingRecord): number | null {
  if (record.margin_usd != null && Number.isFinite(record.margin_usd)) {
    return record.margin_usd;
  }
  const leverage = record.leverage || 1;
  if (!record.amount || !record.entry_price_usd || !leverage) return null;
  return (record.amount * record.entry_price_usd) / leverage;
}

/** 平仓记录按自然周（周一至周日）分组后的结构。 */
export type RecordWeekGroup = {
  key: string;
  label: string;
  records: HoldingRecord[];
  totalPnl: number;
};

/** 平仓记录按「年 → 月 → 周」逐层聚合后的节点。 */
export type RecordPeriodNode = {
  key: string;
  label: string;
  /** 该节点下的全部记录（年/月节点为其子节点记录的并集）。 */
  records: HoldingRecord[];
  totalPnl: number;
  count: number;
};

export type RecordMonthGroup = RecordPeriodNode & { weeks: RecordPeriodNode[] };
export type RecordYearGroup = RecordPeriodNode & { months: RecordMonthGroup[] };

/** 取某日所在周的周一 00:00（本地时区）。 */
function startOfWeekMonday(date: Date): Date {
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() + offset);
  return monday;
}

function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseLocalDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatWeekDay(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** 按平仓时间倒序排列，新的在前。 */
function sortByClosedAtDesc(records: HoldingRecord[]): HoldingRecord[] {
  return [...records].sort(
    (a, b) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime(),
  );
}

/** 汇总一组记录的收益额。 */
function sumPnl(records: HoldingRecord[]): number {
  return records.reduce((sum, item) => sum + (item.pnl_usd || 0), 0);
}

/** 周标签：本周/上周用相对表述，其余直接给出区间。 */
function weekLabel(
  monday: Date,
  thisWeekKey: string,
  lastWeekKey: string,
  key: string,
): string {
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const range = `${formatWeekDay(monday)} – ${formatWeekDay(sunday)}`;
  if (key === thisWeekKey) return `本周 · ${range}`;
  if (key === lastWeekKey) return `上周 · ${range}`;
  return range;
}

/**
 * 将平仓记录按周折叠分组，最近的周在前。
 * 标签示例：「本周 · 9/22 – 9/28」「上周 · 9/15 – 9/21」「2026年 · 9/1 – 9/7」
 */
export function groupRecordsByWeek(
  records: HoldingRecord[],
): RecordWeekGroup[] {
  const now = new Date();
  const thisWeekKey = localDateKey(startOfWeekMonday(now));
  const lastWeekDate = startOfWeekMonday(now);
  lastWeekDate.setDate(lastWeekDate.getDate() - 7);
  const lastWeekKey = localDateKey(lastWeekDate);

  const buckets = new Map<string, HoldingRecord[]>();
  for (const record of records) {
    const closed = new Date(record.closed_at);
    if (Number.isNaN(closed.getTime())) continue;
    const key = localDateKey(startOfWeekMonday(closed));
    const list = buckets.get(key);
    if (list) list.push(record);
    else buckets.set(key, [record]);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([key, weekRecords]) => {
      const monday = parseLocalDateKey(key);
      const sorted = sortByClosedAtDesc(weekRecords);
      return {
        key,
        label: `${monday.getFullYear()}年 · ${weekLabel(monday, thisWeekKey, lastWeekKey, key)}`,
        records: sorted,
        totalPnl: sumPnl(sorted),
      };
    });
}

/**
 * 将平仓记录按「年 → 月 → 周」层层折叠分组，最近的层级在前。
 * 跨月的自然周归属到周一所在的月份。
 */
export function groupRecordsByPeriod(
  records: HoldingRecord[],
): RecordYearGroup[] {
  const now = new Date();
  const thisWeekKey = localDateKey(startOfWeekMonday(now));
  const lastWeekDate = startOfWeekMonday(now);
  lastWeekDate.setDate(lastWeekDate.getDate() - 7);
  const lastWeekKey = localDateKey(lastWeekDate);

  type WeekBucket = { key: string; monday: Date; records: HoldingRecord[] };
  const years = new Map<number, Map<number, Map<string, WeekBucket>>>();

  for (const record of records) {
    const closed = new Date(record.closed_at);
    if (Number.isNaN(closed.getTime())) continue;
    const monday = startOfWeekMonday(closed);
    const weekKey = localDateKey(monday);
    const year = monday.getFullYear();
    const month = monday.getMonth();

    let months = years.get(year);
    if (!months) {
      months = new Map();
      years.set(year, months);
    }
    let weeks = months.get(month);
    if (!weeks) {
      weeks = new Map();
      months.set(month, weeks);
    }
    const bucket = weeks.get(weekKey);
    if (bucket) bucket.records.push(record);
    else weeks.set(weekKey, { key: weekKey, monday, records: [record] });
  }

  return [...years.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, months]) => {
      const monthGroups: RecordMonthGroup[] = [...months.entries()]
        .sort(([a], [b]) => b - a)
        .map(([month, weeks]) => {
          const weekGroups: RecordPeriodNode[] = [...weeks.values()]
            .sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0))
            .map((week) => {
              const sorted = sortByClosedAtDesc(week.records);
              return {
                key: week.key,
                label: weekLabel(week.monday, thisWeekKey, lastWeekKey, week.key),
                records: sorted,
                totalPnl: sumPnl(sorted),
                count: sorted.length,
              };
            });
          const monthRecords = weekGroups.flatMap((week) => week.records);
          return {
            key: `${year}-${String(month + 1).padStart(2, "0")}`,
            label: `${month + 1} 月`,
            records: monthRecords,
            totalPnl: sumPnl(monthRecords),
            count: monthRecords.length,
            weeks: weekGroups,
          };
        });
      const yearRecords = monthGroups.flatMap((month) => month.records);
      return {
        key: String(year),
        label: `${year} 年`,
        records: yearRecords,
        totalPnl: sumPnl(yearRecords),
        count: yearRecords.length,
        months: monthGroups,
      };
    });
}

/**
 * 计算平仓记录的收益率、收益额与名义仓位。
 * - 多仓收益率 = (平仓价 − 入场价) / 入场价 × 杠杆
 * - 空仓收益率 = (入场价 − 平仓价) / 入场价 × 杠杆
 * - 收益额 (USD) = 保证金 × 收益率
 * - 名义仓位 amount = 保证金 × 杠杆
 */
export function calculateRecordMetrics(
  entryPrice: number,
  exitPrice: number,
  marginUsd: number,
  direction: HoldingDirection,
  leverage: number = 1,
) {
  const lev = leverage || 1;
  if (!entryPrice || entryPrice <= 0 || !marginUsd || marginUsd <= 0) {
    return { roi: 0, pnlUsd: 0, amount: 0 };
  }
  const dirMultiplier = direction === "short" ? -1 : 1;
  const priceDiff = exitPrice - entryPrice;
  const roi = (priceDiff / entryPrice) * dirMultiplier * lev;
  const pnlUsd = marginUsd * roi;
  const amount = marginUsd * lev;
  return { roi, pnlUsd, amount };
}
